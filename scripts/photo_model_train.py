"""Train a real DINOv2 photo classifier with an untouched final evaluation.

Phases deliberately separate model selection from opening the test:
  python scripts/photo_model_train.py extract --backbone dinov2_vits14
  python scripts/photo_model_train.py fit --backbone dinov2_vits14
  python scripts/photo_model_train.py evaluate --backbone dinov2_vits14

Test evaluation refuses a second run unless its model hash is unchanged. A test
failure cannot be repaired by tuning on the opened test. Nothing in this script
automatically deploys a model or establishes clinical validity.
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
import random
import time
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix, f1_score, log_loss
from sklearn.preprocessing import StandardScaler
from photo_model_common import ROOT, DATA, MODEL, CLASSES, LABELS, SEED, SIZE, MEAN, STD, DINOV2_COMMIT, FeatureModel, PhotoModel, load_backbone, preprocess, resize_rgb, preprocessing_fingerprint, backbone_artifact, sha256, write_json

BACKBONES = ["dinov2_vits14", "dinov2_vitb14"]
LINEAR_C = [.001, .01, .1, 1., 10.]
RBF_C = [.1, 1., 10., 100.]
GAMMAS = [.0003, .001, .003]
MINIMUMS = {"macro_f1": .60, "balanced_accuracy": .60, "acne_recall": .50, "dermatitis_recall": .50}
SCORE_MIN, MARGIN_MIN = .65, .15


def setup():
    random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)
    torch.set_num_threads(4); torch.use_deterministic_algorithms(True)
    DATA.mkdir(parents=True, exist_ok=True); MODEL.mkdir(parents=True, exist_ok=True)


def protocol():
    value = {"seed": SEED, "input_size": SIZE, "backbones": BACKBONES, "backbone_source_commit": DINOV2_COMMIT,
             "features": "Concatenated final CLS token and mean patch tokens, frozen DINOv2",
             "preprocessing": "EXIF, white alpha composite, whole-image pixel-center nearest 224, ImageNet normalization",
             "linear_C": LINEAR_C, "rbf_C": RBF_C, "rbf_gamma": GAMMAS, "rbf_landmarks_per_class": 256,
             "model_selection": "Maximum pooled validation macro-F1; balanced accuracy tie-breaker; then simpler candidate order",
             "training_views": "All train views, per-case and per-class equal aggregate loss weight",
             "evaluation_views": "One first available image per case; never a best-view selection",
             "calibration": "Validation-only NLL temperature grid 0.5 to 4.0 in 0.05 increments",
             "minimums": MINIMUMS, "score_threshold": SCORE_MIN, "margin_threshold": MARGIN_MIN,
             "additional_release_requirements": ["New test with at least 30 cases in each supported appearance", "Both data sources reported separately", "SCIN dermatitis recall >=0.5", "No previously examined case/hash/group in test", "No clinical or arbitrary-image validity claim"],
             "clinical_validation": False, "patient_ids_available": False,
             "test_policy": "Only final validation-selected candidate can open test; test hash and model lock are persisted before predictions."}
    path = MODEL / "training-protocol.json"
    if path.exists() and json.loads(path.read_text(encoding="utf-8")) != value:
        raise RuntimeError("Protocol changed. Use a new documented experiment; never overwrite a registered test plan.")
    write_json(path, value)
    return value


def cohort():
    value = json.loads((DATA / "combined-cohort.json").read_text(encoding="utf-8"))
    rows = value["records"]
    groups = {split: {r["duplicate_group"] for r in rows if r["split"] == split} for split in ["train", "validation", "test"]}
    assert not (groups["train"] & groups["test"] or groups["train"] & groups["validation"] or groups["validation"] & groups["test"])
    assert not any(r.get("previously_examined") and r["split"] == "test" for r in rows)
    return value


def views(rows):
    result = []
    for row in rows:
        images = row["images"] if row["split"] == "train" else row["images"][:1]
        for image in images:
            result.append({"id": row["id"], "source": row["source"], "split": row["split"], "target": row["target"],
                           "local_path": image["local_path"], "sha256": image["source_sha256"], "views": len(images)})
    return result


def feature_paths(backbone):
    directory = DATA / "features" / backbone
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def extract(backbone):
    meta = cohort(); items = views(meta["records"])
    directory = feature_paths(backbone)
    model = FeatureModel(load_backbone(backbone)).eval()
    backbone_provenance = backbone_artifact(backbone)
    preprocessing_sha = preprocessing_fingerprint()
    signature = hashlib.sha256(json.dumps({"items": items, "preprocessing": preprocessing_sha, "backbone": backbone_provenance}, sort_keys=True).encode()).hexdigest()
    metadata_path = directory / "index.json"
    if metadata_path.exists() and json.loads(metadata_path.read_text(encoding="utf-8"))["signature"] != signature:
        raise RuntimeError("Feature cache does not match immutable cohort/preprocessing.")
    write_json(metadata_path, {"signature": signature, "items": items, "cohort_sha256": sha256(DATA / "combined-cohort.json"), "backbone": backbone_provenance, "preprocessing_sha256": preprocessing_sha})
    done, t0 = 0, time.time()
    # Small batches bound RAM on a 16GB consumer laptop. Chunks survive interruption.
    batch_size, chunk_size = (8 if backbone == "dinov2_vits14" else 4), 128
    pixel_cache = DATA / "decoded" / preprocessing_sha
    pixel_cache.mkdir(parents=True, exist_ok=True)
    for chunk_start in range(0, len(items), chunk_size):
        chunk = items[chunk_start:chunk_start + chunk_size]
        path = directory / f"chunk-{chunk_start:06d}.npy"
        if path.exists():
            a = np.load(path)
            if a.shape != (len(chunk), 768 if backbone == "dinov2_vits14" else 1536) or not np.isfinite(a).all(): raise ValueError("Invalid cached feature chunk")
            done += len(chunk); continue
        arrays = []
        for start in range(0, len(chunk), batch_size):
            batch = []
            for item in chunk[start:start + batch_size]:
                path_image = ROOT / item["local_path"]
                pixel_path = pixel_cache / (item["sha256"] + ".npy")
                if pixel_path.exists():
                    rgb = np.load(pixel_path)
                    if rgb.dtype != np.uint8 or rgb.shape != (SIZE, SIZE, 3): raise ValueError("Corrupted decoded pixel cache")
                else:
                    if sha256(path_image) != item["sha256"]: raise ValueError("Source image changed: " + item["id"])
                    with Image.open(path_image) as image: rgb = resize_rgb(image)
                    np.save(pixel_path, rgb)
                batch.append(np.transpose((rgb.astype(np.float32) / 255. - MEAN) / STD, (2, 0, 1)).copy())
            with torch.inference_mode(): arrays.append(model(torch.from_numpy(np.stack(batch))).numpy())
        array = np.concatenate(arrays)
        temporary = directory / f"chunk-{chunk_start:06d}.tmp.npy"
        np.save(temporary, array); temporary.replace(path)
        done += len(chunk)
        print(json.dumps({"phase": "features", "backbone": backbone, "done": done, "total": len(items), "elapsed_seconds": round(time.time() - t0)}), flush=True)
    print(json.dumps({"phase": "features_complete", "backbone": backbone, "views": len(items)}), flush=True)


def load_features(backbone):
    directory = feature_paths(backbone)
    metadata = json.loads((directory / "index.json").read_text(encoding="utf-8"))
    if metadata["cohort_sha256"] != sha256(DATA / "combined-cohort.json"): raise RuntimeError("Cohort changed after feature extraction.")
    if metadata["preprocessing_sha256"] != preprocessing_fingerprint() or metadata["backbone"] != backbone_artifact(backbone): raise RuntimeError("Preprocessing or pretrained weights changed after feature extraction.")
    items = metadata["items"]
    x = np.concatenate([np.load(directory / f"chunk-{start:06d}.npy") for start in range(0, len(items), 128)])
    if len(x) != len(items) or not np.isfinite(x).all(): raise ValueError("Feature cache incomplete")
    return items, x


def probabilities(logits, temperature=1.):
    x = np.asarray(logits, dtype=np.float64) / temperature
    x -= x.max(axis=1, keepdims=True)
    p = np.exp(x)
    return p / p.sum(axis=1, keepdims=True)


def metrics(y, p):
    pred = p.argmax(axis=1)
    report = classification_report(y, pred, labels=list(range(3)), target_names=CLASSES, output_dict=True, zero_division=0)
    confidence, correct = p.max(axis=1), pred == y
    ece = 0.
    for lower in np.arange(0, 1, .1):
        mask = (confidence >= lower) & (confidence < lower + .1 if lower < .9 else confidence <= 1.)
        if mask.any(): ece += mask.mean() * abs(correct[mask].mean() - confidence[mask].mean())
    return {"n": len(y), "accuracy": float(accuracy_score(y, pred)), "macro_f1": float(f1_score(y, pred, labels=list(range(3)), average="macro", zero_division=0)),
            "balanced_accuracy": float(balanced_accuracy_score(y, pred)), "confusion_matrix": confusion_matrix(y, pred, labels=list(range(3))).tolist(),
            "per_class": {key: report[key] for key in CLASSES}, "ece_10": float(ece),
            "brier_multiclass": float(np.mean(np.sum((p - np.eye(3)[y]) ** 2, axis=1))), "nll": float(log_loss(y, p, labels=list(range(3))))}


def kernel(x, centers, gamma):
    distances = (x * x).sum(axis=1, keepdims=True) + (centers * centers).sum(axis=1)[None, :] - 2 * x @ centers.T
    return np.exp(-gamma * np.maximum(distances, 0)).astype(np.float64)


def model_logits(x, artifact):
    if artifact["kind"] == "rbf": x = kernel(x, artifact["centers"], artifact["gamma"])
    return x @ artifact["weights"].T + artifact["bias"]


def fit(backbone):
    if (MODEL / "test-lock.json").exists(): raise RuntimeError("Final test is already opened; tuning this experiment is closed.")
    items, x = load_features(backbone)
    y = np.array([CLASSES.index(item["target"]) for item in items])
    train = np.array([item["split"] == "train" for item in items]); val = np.array([item["split"] == "validation" for item in items])
    # No test feature or label contributes to standardization, landmarks, fitting,
    # selection, rejection thresholds, or temperature calibration.
    train_x, val_x, train_y, val_y = x[train], x[val], y[train], y[val]
    train_items = [item for item in items if item["split"] == "train"]
    cases_per_class = collections.Counter({key: len({item["id"] for item in train_items if item["target"] == key}) for key in CLASSES})
    weights = np.array([1 / (item["views"] * cases_per_class[item["target"]]) for item in train_items]); weights *= len(weights) / weights.sum()
    scaler = StandardScaler().fit(train_x, sample_weight=weights)
    scaled_train, scaled_val = scaler.transform(train_x), scaler.transform(val_x)
    results, best, best_key = [], None, (-1., -1.)

    def consider(kind, c, train_features, val_features, centers=None, gamma=None):
        nonlocal best, best_key
        head = LogisticRegression(C=c, max_iter=2500, random_state=SEED, solver="lbfgs").fit(train_features, train_y, sample_weight=weights)
        logits = head.decision_function(val_features)
        report = metrics(val_y, probabilities(logits))
        result = {"kind": kind, "C": c, "gamma": gamma, "validation": report, "iterations": int(head.n_iter_.max())}
        results.append(result)
        key = (report["macro_f1"], report["balanced_accuracy"])
        if key > best_key:
            if kind == "linear":
                w = head.coef_ / scaler.scale_[None, :]
                bias = head.intercept_ - (head.coef_ * (scaler.mean_ / scaler.scale_)[None, :]).sum(axis=1)
            else: w, bias = head.coef_, head.intercept_
            best = {"backbone": backbone, "kind": kind, "weights": w.astype(np.float32), "bias": bias.astype(np.float32), "centers": centers, "gamma": gamma, "C": c}
            best_key = key
        print(json.dumps({"phase": "candidate", "backbone": backbone, "kind": kind, "C": c, "gamma": gamma, "validation_macro_f1": report["macro_f1"], "validation_balanced_accuracy": report["balanced_accuracy"]}), flush=True)

    for c in LINEAR_C: consider("linear", c, scaled_train, scaled_val)
    # Stratified landmarks come only from deterministic first training views.
    rng = np.random.default_rng(SEED)
    first_by_case = {}
    for i, item in enumerate(train_items): first_by_case.setdefault(item["id"], i)
    landmark_indices = []
    for label in range(3):
        candidates = np.array([i for i in first_by_case.values() if train_y[i] == label])
        landmark_indices += rng.permutation(candidates)[:256].tolist()
    centers = train_x[landmark_indices].astype(np.float32)
    for gamma in GAMMAS:
        train_kernel, val_kernel = kernel(train_x, centers, gamma), kernel(val_x, centers, gamma)
        for c in RBF_C: consider("rbf", c, train_kernel, val_kernel, centers, gamma)
    assert best is not None
    logits = model_logits(val_x, best)
    temperatures = np.round(np.arange(.5, 4.001, .05), 2)
    temperature = float(min(temperatures, key=lambda t: log_loss(val_y, probabilities(logits, t), labels=[0, 1, 2])))
    best["temperature"] = temperature
    artifact_path = MODEL / (backbone + "-head.npz")
    np.savez(artifact_path, **{key: value for key, value in best.items() if value is not None})
    best_metrics = metrics(val_y, probabilities(logits, temperature))
    report = {"backbone": backbone, "kind": best["kind"], "C": best["C"], "gamma": best["gamma"], "temperature": temperature,
              "validation": best_metrics, "candidates": results, "cohort_sha256": sha256(DATA / "combined-cohort.json"), "head_sha256": sha256(artifact_path),
              "source_validation": {source: metrics(val_y[np.array([item["source"] == source for item in items if item["split"] == "validation"])], probabilities(logits[np.array([item["source"] == source for item in items if item["split"] == "validation"])], temperature)) for source in sorted({i["source"] for i in items})}}
    write_json(MODEL / (backbone + "-validation.json"), report)
    print(json.dumps({"phase": "fit_complete", "selected": {key: report[key] for key in ["backbone", "kind", "C", "gamma", "temperature", "validation"]}}), flush=True)


def load_head(backbone):
    archive = np.load(MODEL / (backbone + "-head.npz"), allow_pickle=False)
    return {key: archive[key].item() if archive[key].ndim == 0 else archive[key] for key in archive.files}


def evaluate(backbone):
    protocol_value = protocol()
    if not (MODEL / "categories-selection-lock.json").exists() or not (MODEL / "export-lock.json").exists():
        raise RuntimeError("Lock related category selection and ONNX export/calibration before opening the shared final test.")
    candidates = [json.loads((MODEL / (name + "-validation.json")).read_text(encoding="utf-8")) for name in BACKBONES if (MODEL / (name + "-validation.json")).exists()]
    if len(candidates) != len(BACKBONES): raise RuntimeError("Both predeclared backbone candidates must finish validation before final evaluation.")
    selected = max(candidates, key=lambda r: (r["validation"]["macro_f1"], r["validation"]["balanced_accuracy"]))
    if selected["backbone"] != backbone: raise RuntimeError("Only the validation-selected backbone may open the final test.")
    lock = {"backbone": backbone, "backbone_provenance": backbone_artifact(backbone), "preprocessing_sha256": preprocessing_fingerprint(), "head_sha256": sha256(MODEL / (backbone + "-head.npz")), "cohort_sha256": sha256(DATA / "combined-cohort.json"), "protocol_sha256": sha256(MODEL / "training-protocol.json"), "export_lock_sha256": sha256(MODEL / "export-lock.json"), "categories_selection_lock_sha256": sha256(MODEL / "categories-selection-lock.json")}
    lock_path = MODEL / "test-lock.json"
    if lock_path.exists() and json.loads(lock_path.read_text(encoding="utf-8")) != lock: raise RuntimeError("Test already opened with a different model/protocol.")
    write_json(lock_path, lock)
    items, x = load_features(backbone); artifact = load_head(backbone)
    indices = np.array([item["split"] == "test" for item in items]); test_items = [item for item in items if item["split"] == "test"]
    y = np.array([CLASSES.index(item["target"]) for item in test_items]); p = probabilities(model_logits(x[indices], artifact), artifact["temperature"])
    report = metrics(y, p)
    source_metrics = {source: metrics(y[np.array([item["source"] == source for item in test_items])], p[np.array([item["source"] == source for item in test_items])]) for source in sorted({i["source"] for i in test_items})}
    measured = {"macro_f1": report["macro_f1"], "balanced_accuracy": report["balanced_accuracy"], "acne_recall": report["per_class"]["acne"]["recall"], "dermatitis_recall": report["per_class"]["dermatitis"]["recall"]}
    minimums_passed = all(measured[key] >= value for key, value in MINIMUMS.items())
    rows = {row["id"]: row for row in cohort()["records"]}
    group_support = {key: len({rows[item["id"]]["duplicate_group"] for item in test_items if item["target"] == key}) for key in CLASSES}
    sufficient_samples = all(group_support[key] >= 30 for key in ["acne", "dermatitis"])
    scin_dermatitis = source_metrics["SCIN"]["per_class"]["dermatitis"]["recall"] >= .5
    accepted = (p.max(axis=1) >= SCORE_MIN) & (np.sort(p, axis=1)[:, -1] - np.sort(p, axis=1)[:, -2] >= MARGIN_MIN) & (p.argmax(axis=1) != 2)
    readiness = {"passed": minimums_passed and sufficient_samples and scin_dermatitis, "benchmark_minimums_passed": minimums_passed, "minimums": MINIMUMS, "measured": measured,
                 "independent_holdout": True, "blocked_by_previously_examined_test": False, "clinical_validation": False,
                 "sufficient_supported_class_samples": sufficient_samples, "scin_dermatitis_recall_minimum_passed": scin_dermatitis}
    predictions = [{"id": item["id"], "source": item["source"], "target": item["target"], "scores": p[i].tolist(), "accepted": bool(accepted[i]), "duplicate_group": rows[item["id"]]["duplicate_group"]} for i, item in enumerate(test_items)]
    evaluation = {"version": "skinsnap-photo-dinov2-v2", "backbone": backbone, "head": artifact["kind"], "head_C": artifact["C"], "gamma": artifact.get("gamma"), "temperature": artifact["temperature"],
                  "test": report, "test_group_support": group_support, "source_test": source_metrics, "validation": selected["validation"], "source_validation": selected["source_validation"], "readiness": readiness,
                  "selective": {"count": int(accepted.sum()), "coverage": float(accepted.mean()), "accuracy": float((p.argmax(axis=1)[accepted] == y[accepted]).mean()) if accepted.any() else None},
                  "lock": lock, "protocol": protocol_value,
                  "limitations": ["Untouched for this experiment does not imply unseen during DINOv2 pretraining.", "No patient identifiers; no proven patient independence.", "Corrected atlas images and US volunteer differentials do not validate arbitrary smartphone faces.", "Other is a finite heterogeneous class, not a validated OOD detector.", "No disease severity, diagnosis, serious-disease exclusion, or best-product efficacy established.", "Research/noncommercial data terms; commercial deployment not cleared."]}
    write_json(MODEL / "evaluation.json", evaluation); write_json(MODEL / "test-predictions.json", predictions)
    print(json.dumps({"phase": "test_complete", "readiness": readiness, "test": report, "source_test": source_metrics, "selective": evaluation["selective"]}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["extract", "fit", "evaluate", "protocol"])
    parser.add_argument("--backbone", choices=BACKBONES, default=BACKBONES[0])
    args = parser.parse_args(); setup(); protocol()
    if args.phase == "extract": extract(args.backbone)
    elif args.phase == "fit": fit(args.backbone)
    elif args.phase == "evaluate": evaluate(args.backbone)


if __name__ == "__main__": main()
