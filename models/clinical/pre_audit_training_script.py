"""Reproducible, deliberately narrow SCIN photograph research baseline.

No diagnosis, product suitability, or clinical safety is established by this run.
Download source: Google's anonymous public GCS bucket. Images stay in ignored data/.
Run: .venv/Scripts/python.exe scripts/clinical_model_train.py
"""
from __future__ import annotations

import argparse
import ast
import collections
import concurrent.futures
import copy
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import random
import time
import urllib.request
import urllib.parse

import numpy as np
from PIL import Image, ImageOps
import torch
from torch import nn
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix, f1_score, log_loss
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
SEED = 20261012
SIZE = 128
BASE = "https://storage.googleapis.com/dx-scin-public-data/"
DATA = ROOT / "data" / "clinical"
MODEL = ROOT / "models" / "clinical"
PUBLIC = ROOT / "public" / "model-clinical"
DEMOS = ROOT / "public" / "demo-clinical"
CLASSES = ["acne", "dermatitis", "other"]
CLASS_LABELS = ["Acne-like appearance", "Dermatitis-like appearance", "Other / unsupported appearance"]
DERMATITIS = {"Eczema", "Allergic Contact Dermatitis", "Irritant Contact Dermatitis", "Acute dermatitis, NOS", "CD - Contact dermatitis"}
MEAN = np.array([.485, .456, .406], dtype=np.float32)
STD = np.array([.229, .224, .225], dtype=np.float32)
# Predeclared before any test evaluation. Never relaxed to force availability.
READINESS = {"macro_f1": .60, "balanced_accuracy": .60, "acne_recall": .50, "dermatitis_recall": .50}
CS = [.01, .1, 1., 10.]
SCORE_THRESHOLD = .65
MARGIN_THRESHOLD = .15


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def fetch(url: str) -> bytes:
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise RuntimeError("download failed")


def metadata(filename):
    path = DATA / filename
    if not path.exists():
        path.write_bytes(fetch(BASE + "dataset/" + filename))
    return list(csv.DictReader(io.StringIO(path.read_text(encoding="utf-8"))))


def bool_field(value):
    return str(value).lower() == "true"


def global_duplicate_groups(cases):
    """Union all released cases sharing any source image or GCS object MD5.

    This metadata-only pass also catches duplicate links through excluded cases.
    It never identifies people; no participant identifiers are released.
    """
    path = DATA / "gcs_object_hashes.json"
    if path.exists():
        objects = json.loads(path.read_text(encoding="utf-8"))
    else:
        objects, token = {}, None
        while True:
            params = {"prefix": "dataset/images/", "maxResults": 1000, "fields": "nextPageToken,items(name,md5Hash,size)"}
            if token:
                params["pageToken"] = token
            response = json.loads(fetch("https://storage.googleapis.com/storage/v1/b/dx-scin-public-data/o?" + urllib.parse.urlencode(params)))
            for item in response.get("items", []):
                objects[item["name"]] = {"md5": item.get("md5Hash"), "size": item.get("size")}
            token = response.get("nextPageToken")
            if not token:
                break
        write_json(path, objects)
    parent = {row["case_id"]: row["case_id"] for row in cases}
    def find(key):
        while parent[key] != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key
    seen = {}
    for row in cases:
        for i in range(1, 4):
            image = row.get(f"image_{i}_path")
            if not image:
                continue
            keys = ["path:" + image]
            md5 = objects.get(image, {}).get("md5")
            if md5:
                keys.append("md5:" + md5)
            for key in keys:
                if key in seen:
                    parent[find(row["case_id"])] = find(seen[key])
                seen[key] = row["case_id"]
    return {key: find(key) for key in parent}, {"all_cases": len(cases), "all_image_objects": len(objects), "case_groups": len({find(key) for key in parent})}


def candidates(cases, labels):
    case_map = {row["case_id"]: row for row in cases}
    buckets = {key: [] for key in CLASSES}
    excluded = collections.Counter()
    for label in labels:
        row = case_map[label["case_id"]]
        if bool_field(row.get("body_parts_genitalia_or_groin")) or bool_field(row.get("body_parts_buttocks")):
            excluded["sensitive_body_location"] += 1
            continue
        weights = ast.literal_eval(label.get("weighted_skin_condition_label") or "{}")
        if not weights or not row.get("image_1_path"):
            excluded["missing_label_or_image"] += 1
            continue
        a = weights.get("Acne", 0)
        d = sum(weights.get(key, 0) for key in DERMATITIS)
        # Differential weights are annotation agreement/rank weights, not disease probabilities.
        if a >= .5 and a > d:
            target = "acne"
        elif d >= .5 and d > a:
            target = "dermatitis"
        elif max(weights.values()) >= .5 and a + d < .2:
            target = "other"
        else:
            excluded["ambiguous_or_low_weight_differential"] += 1
            continue
        buckets[target].append({"case_id": row["case_id"], "target": target, "image_path": row["image_1_path"],
                                "all_image_paths": [row.get(f"image_{i}_path") for i in range(1, 4) if row.get(f"image_{i}_path")],
                                "source_differential": weights, "monk_skin_tone_us": label.get("monk_skin_tone_label_us") or None,
                                "age_group": row.get("age_group") or None, "sex_at_birth": row.get("sex_at_birth") or None,
                                "body_parts": [k.removeprefix("body_parts_") for k, v in row.items() if k.startswith("body_parts_") and bool_field(v)]})
    selected = []
    before_cap = {key: len(rows) for key, rows in buckets.items()}
    for key, cap in [("acne", 99999), ("dermatitis", 400), ("other", 300)]:
        ordered = sorted(buckets[key], key=lambda row: hashlib.sha256(f"{SEED}:{row['case_id']}".encode()).hexdigest())
        selected.extend(ordered[:cap])
    return selected, before_cap, dict(excluded)


def nearest_resize(image, size=SIZE):
    """Explicit center-coordinate nearest sampling, shared with browser preprocessing."""
    image = ImageOps.exif_transpose(image)
    rgba = image.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    background.alpha_composite(rgba)
    rgb = np.asarray(background.convert("RGB"))
    h, w = rgb.shape[:2]
    xs = np.minimum(w - 1, np.floor((np.arange(size) + .5) * w / size).astype(int))
    ys = np.minimum(h - 1, np.floor((np.arange(size) + .5) * h / size).astype(int))
    return rgb[ys[:, None], xs[None, :]]


def preprocess(image):
    rgb = nearest_resize(image).astype(np.float32) / 255.
    return np.transpose((rgb - MEAN) / STD, (2, 0, 1)).copy()


def dhash(image):
    gray = np.asarray(ImageOps.grayscale(ImageOps.exif_transpose(image)).resize((9, 8), Image.Resampling.BILINEAR))
    bits = gray[:, 1:] > gray[:, :-1]
    return int.from_bytes(np.packbits(bits).tobytes(), "big")


def download_row(row):
    path = DATA / "images" / (row["case_id"] + ".png")
    try:
        if not path.exists():
            path.write_bytes(fetch(BASE + row["image_path"]))
        raw = path.read_bytes()
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            if image.width * image.height > 40_000_000:
                raise ValueError("image exceeds pixel limit")
            pixel_hash = hashlib.sha256(nearest_resize(image).tobytes()).hexdigest()
            row.update({"source_sha256": hashlib.sha256(raw).hexdigest(), "pixel_sha256": pixel_hash,
                        "dhash": f"{dhash(image):016x}", "width": image.width, "height": image.height})
        return row
    except Exception as exc:
        return {"failed_case": row["case_id"], "error": type(exc).__name__}


def split_rows(rows):
    # Union by case (one image/case used), shared source path across the case's image set,
    # exact source/pixel hashes and conservative dHash<=2. Split units are connected groups.
    parent = list(range(len(rows)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    def union(a, b):
        parent[find(b)] = find(a)
    seen = {}
    for i, row in enumerate(rows):
        keys = ["global:" + row["global_duplicate_group"], "source:" + row["source_sha256"], "pixel:" + row["pixel_sha256"]]
        keys.extend("path:" + item for item in row["all_image_paths"])
        for key in keys:
            if key in seen:
                union(i, seen[key])
            seen[key] = i
    near_pairs = 0
    hashes = [int(row["dhash"], 16) for row in rows]
    for i in range(len(rows)):
        for j in range(i):
            if (hashes[i] ^ hashes[j]).bit_count() <= 2:
                union(i, j)
                near_pairs += 1
    groups = collections.defaultdict(list)
    for i in range(len(rows)):
        groups[find(i)].append(i)
    conflicting = {root for root, indices in groups.items() if len({rows[i]["target"] for i in indices}) != 1}
    assignment = {}
    for target in CLASSES:
        units = [indices for root, indices in groups.items() if root not in conflicting and rows[indices[0]]["target"] == target]
        units.sort(key=lambda unit: hashlib.sha256(f"split:{SEED}:{min(rows[i]['case_id'] for i in unit)}".encode()).hexdigest())
        n = len(units)
        n_test, n_val = max(1, round(n * .2)), max(1, round(n * .15))
        for number, indices in enumerate(units):
            split = "test" if number < n_test else "validation" if number < n_test + n_val else "train"
            for i in indices:
                assignment[i] = split
                rows[i]["duplicate_group"] = min(rows[j]["case_id"] for j in indices)
    clean = []
    for i, row in enumerate(rows):
        if i in assignment:
            row["split"] = assignment[i]
            clean.append(row)
    return clean, {"connected_groups": len(groups), "near_duplicate_pairs_dhash_distance_le_2": near_pairs,
                   "conflicting_label_groups_removed": len(conflicting), "removed_cases": len(rows) - len(clean),
                   "patient_identifiers_available": False, "case_group_intersections": 0,
                   "one_image_per_case": True, "scope": "Selected cohort; conservative hashes cannot prove absence of leakage."}


class ClinicalModel(nn.Module):
    def __init__(self, features, weight, bias):
        super().__init__()
        self.features = features
        self.head = nn.Linear(576, 3)
        self.head.weight.data.copy_(torch.from_numpy(weight.astype(np.float32)))
        self.head.bias.data.copy_(torch.from_numpy(bias.astype(np.float32)))
    def forward(self, image):
        activations = self.features(image)
        logits = self.head(activations.mean(dim=(2, 3)))
        return logits, activations


def probabilities(logits, temperature=1.):
    scaled = np.asarray(logits, dtype=np.float64) / temperature
    e = np.exp(scaled - scaled.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


def ece(y, probs, bins=10):
    score = probs.max(axis=1)
    correct = probs.argmax(axis=1) == y
    error = 0.
    for lo in np.linspace(0, 1, bins, endpoint=False):
        mask = (score > lo) & (score <= lo + 1 / bins)
        if mask.any():
            error += float(mask.mean() * abs(correct[mask].mean() - score[mask].mean()))
    return error


def metrics(y, probs):
    pred = probs.argmax(axis=1)
    report = classification_report(y, pred, labels=[0, 1, 2], target_names=CLASSES, output_dict=True, zero_division=0)
    sorted_probs = np.sort(probs, axis=1)
    accepted = (probs.max(axis=1) >= SCORE_THRESHOLD) & (sorted_probs[:, -1] - sorted_probs[:, -2] >= MARGIN_THRESHOLD) & (pred != 2)
    return {"accuracy": float(accuracy_score(y, pred)), "macro_f1": float(f1_score(y, pred, average="macro", labels=[0, 1, 2], zero_division=0)),
            "balanced_accuracy": float(balanced_accuracy_score(y, pred)), "per_class": {key: report[key] for key in CLASSES},
            "confusion_matrix": confusion_matrix(y, pred, labels=[0, 1, 2]).tolist(), "nll": float(log_loss(y, probs, labels=[0, 1, 2])),
            "ece_10_bins": ece(y, probs), "brier_multiclass": float(((probs - np.eye(3)[y]) ** 2).sum(axis=1).mean()),
            "selective": {"accepted": int(accepted.sum()), "total": len(y), "coverage": float(accepted.mean()),
                          "accuracy_on_accepted": float((pred[accepted] == y[accepted]).mean()) if accepted.any() else None},
            "scores_are_medical_probabilities": False}


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.set_num_threads(4)
    torch.use_deterministic_algorithms(True)
    for path in [DATA, DATA / "images", MODEL, PUBLIC, DEMOS]:
        path.mkdir(parents=True, exist_ok=True)
    start = time.time()
    cases, labels = metadata("scin_cases.csv"), metadata("scin_labels.csv")
    global_groups, global_inventory = global_duplicate_groups(cases)
    selected, eligible_counts, excluded = candidates(cases, labels)
    for row in selected:
        row["global_duplicate_group"] = global_groups[row["case_id"]]
    print(json.dumps({"phase": "download", "selected": len(selected), "eligible": eligible_counts}), flush=True)
    rows, failures = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for i, row in enumerate(pool.map(download_row, selected)):
            (failures if "failed_case" in row else rows).append(row)
            if (i + 1) % 50 == 0:
                print(json.dumps({"downloaded": i + 1, "total": len(selected)}), flush=True)
    rows, leakage = split_rows(rows)
    leakage["global_exact_duplicate_inventory"] = global_inventory
    rows.sort(key=lambda row: row["case_id"])
    write_json(MODEL / "cohort.json", {"seed": SEED, "eligible_before_cap": eligible_counts, "exclusions": excluded,
                                      "download_failures": failures, "duplicate_controls": leakage, "rows": rows})
    split_counts = {split: {key: sum(row["split"] == split and row["target"] == key for row in rows) for key in CLASSES} for split in ["train", "validation", "test"]}
    print(json.dumps({"phase": "features", "split_counts": split_counts}), flush=True)
    weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1
    backbone = mobilenet_v3_small(weights=weights, progress=False).features.eval()
    tensors = []
    for row in rows:
        with Image.open(DATA / "images" / (row["case_id"] + ".png")) as image:
            tensors.append(preprocess(image))
    images = torch.from_numpy(np.stack(tensors))
    with torch.inference_mode():
        features = torch.cat([backbone(batch).mean(dim=(2, 3)) for batch in images.split(32)]).numpy()
    y = np.array([CLASSES.index(row["target"]) for row in rows])
    masks = {split: np.array([row["split"] == split for row in rows]) for split in split_counts}
    scaler = StandardScaler().fit(features[masks["train"]])
    scaled = scaler.transform(features)
    fits = []
    best = None
    best_score = (-1., -1.)
    for c in CS:
        head = LogisticRegression(C=c, class_weight="balanced", max_iter=2000, random_state=SEED).fit(scaled[masks["train"]], y[masks["train"]])
        p = head.predict_proba(scaled[masks["validation"]])
        m = metrics(y[masks["validation"]], p)
        fits.append({"C": c, "validation_macro_f1": m["macro_f1"], "validation_balanced_accuracy": m["balanced_accuracy"]})
        score = (m["macro_f1"], m["balanced_accuracy"])
        if score > best_score:
            best, best_score = head, score
    assert best is not None
    folded_weight = best.coef_ / scaler.scale_[None, :]
    folded_bias = best.intercept_ - (best.coef_ * (scaler.mean_ / scaler.scale_)[None, :]).sum(axis=1)
    model = ClinicalModel(backbone, folded_weight, folded_bias).eval()
    with torch.inference_mode():
        logits = torch.cat([model(batch)[0] for batch in images.split(32)]).numpy()
    temperatures = [float(x) for x in np.arange(.5, 3.001, .05)]
    temperature = min(temperatures, key=lambda temp: log_loss(y[masks["validation"]], probabilities(logits[masks["validation"]], temp), labels=[0, 1, 2]))
    test_probs = probabilities(logits[masks["test"]], temperature)
    test_metrics = metrics(y[masks["test"]], test_probs)
    readiness_values = {"macro_f1": test_metrics["macro_f1"], "balanced_accuracy": test_metrics["balanced_accuracy"],
                        "acne_recall": test_metrics["per_class"]["acne"]["recall"], "dermatitis_recall": test_metrics["per_class"]["dermatitis"]["recall"]}
    ready = all(readiness_values[key] >= minimum for key, minimum in READINESS.items())
    subgroup = {}
    test_rows = [row for row in rows if row["split"] == "test"]
    for label, lower, upper in [("Monk 1-4", 1, 4), ("Monk 5-10", 5, 10)]:
        mask = np.array([row["monk_skin_tone_us"] is not None and lower <= int(row["monk_skin_tone_us"]) <= upper for row in test_rows])
        subgroup[label] = {"n": int(mask.sum()), "class_counts": {key: int(((y[masks['test']] == i) & mask).sum()) for i, key in enumerate(CLASSES)},
                           "accuracy": float(accuracy_score(y[masks["test"]][mask], test_probs[mask].argmax(axis=1))) if mask.any() else None,
                           "limitation": "Small estimated skin-tone subgroups; no fairness or clinical validity established."}
    torch.save({"state_dict": model.state_dict(), "seed": SEED, "classes": CLASSES, "temperature": temperature,
                "pretrained_weights": "MobileNet_V3_Small_Weights.IMAGENET1K_V1"}, MODEL / "checkpoint.pt")
    torch.onnx.export(model, torch.zeros(1, 3, SIZE, SIZE), str(PUBLIC / "model.onnx"), input_names=["image"],
                      output_names=["logits", "activations"], opset_version=17, dynamo=False)
    import onnxruntime as ort
    session = ort.InferenceSession(str(PUBLIC / "model.onnx"), providers=["CPUExecutionProvider"])
    demo_records = []
    # Deterministic first held-out case per source class. No selection by prediction correctness.
    for target in CLASSES:
        row = next(row for row in test_rows if row["target"] == target and not ("head_or_neck" in row["body_parts"])) if any(row["target"] == target and "head_or_neck" not in row["body_parts"] for row in test_rows) else next(row for row in test_rows if row["target"] == target)
        path = DEMOS / (target + ".png")
        with Image.open(DATA / "images" / (row["case_id"] + ".png")) as image:
            # A 512-square, nearest-resized educational sample; metadata stripped, original attributed.
            Image.fromarray(nearest_resize(image, 512)).save(path)
        with Image.open(path) as image:
            array = preprocess(image)[None, :]
        with torch.inference_mode():
            p_logits = model(torch.from_numpy(array))[0].numpy()
        o_logits = session.run(["logits"], {"image": array})[0]
        error = float(np.max(np.abs(p_logits - o_logits)))
        assert error < 1e-4, error
        probs = probabilities(o_logits, temperature)[0]
        prediction = int(probs.argmax())
        margin = float(np.sort(probs)[-1] - np.sort(probs)[-2])
        assessed = ready and prediction != 2 and float(probs.max()) >= SCORE_THRESHOLD and margin >= MARGIN_THRESHOLD
        demo_records.append({"id": target, "label": CLASS_LABELS[CLASSES.index(target)], "task_unavailable": not ready,
                             "label_disclaimer": "Source annotation mapped to the predeclared research task; not a current diagnosis or an active prediction.",
                             "path": "/demo-clinical/" + target + ".png", "case_id": row["case_id"],
                             "source_label": target, "source_differential": row["source_differential"], "source_url": BASE + row["image_path"],
                             "modified": "EXIF orientation applied, metadata removed, resized to 512x512 nearest; aspect ratio changes.",
                             "license": "SCIN Data Use License", "license_url": "https://github.com/google-research-datasets/scin/blob/main/LICENSE",
                             "split": "test", "selection": "First case sorted by ID without head/neck location when available; not selected by output.",
                             "scores": {key: float(probs[i]) for i, key in enumerate(CLASSES)}, "predicted_class": CLASSES[prediction],
                             "status": "assessed" if assessed else "uncertain", "pytorch_onnx_logits_max_abs_error": error,
                             "rgb128_sha256": hashlib.sha256(nearest_resize(Image.open(path)).tobytes()).hexdigest()})
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    manifest = {"available": ready, "version": "skinsnap-scin-mobilenet-v1", "architecture": "Frozen torchvision MobileNetV3-Small ImageNet1K-V1 features (576 channels) + trained 3-class linear head",
                "input_size": SIZE, "supported_image_type": "clinical_photo", "classes": [{"id": key, "label": CLASS_LABELS[i]} for i, key in enumerate(CLASSES)],
                "preprocessing": {"mean": MEAN.tolist(), "std": STD.tolist(), "resize": "nearest", "coordinate_rule": "floor((output_coordinate+0.5)*source_size/128)",
                                  "exif_orientation": True, "transparent_background": "white", "layout": "NCHW", "range_before_normalization": [0, 1]},
                "temperature": temperature, "uncertainty": {"max_score_threshold": SCORE_THRESHOLD, "margin_threshold": MARGIN_THRESHOLD, "always_reject_classes": ["other"]},
                "onnx": {"url": "/model-clinical/model.onnx", "sha256": sha(PUBLIC / "model.onnx"), "input_name": "image", "logits_output": "logits", "activations_output": "activations"},
                "classifier_weights": model.head.weight.detach().numpy().tolist(), "checkpoint_sha256": sha(MODEL / "checkpoint.pt"),
                "score_type": "temperature_scaled_model_score", "dataset": "SCIN (selected case-grouped photograph cohort)",
                "dataset_url": "https://github.com/google-research-datasets/scin", "license": "SCIN Data Use License", "license_url": "https://github.com/google-research-datasets/scin/blob/main/LICENSE",
                "readiness": {"passed": ready, "minimums": READINESS, "measured": readiness_values, "clinical_validation": False},
                "limitations": ["Exploratory photo appearance classifier; not a diagnosis or proof of cosmetic product suitability.",
                                "Only acne-like and grouped dermatitis-like appearances are supported; other is always unable to assess.",
                                "SCIN labels are retrospectively assigned dermatologist differential labels, not clinically confirmed diagnoses.",
                                "Acne sample size is small; source cohort US adult volunteer search users is not representative of all users.",
                                "Case-disjoint duplicate grouping is used; participant IDs are absent, so patient independence cannot be established.",
                                "Other is a finite heterogeneous class, not a validated arbitrary image or out-of-distribution detector.",
                                "Temperature scaling and score/margin rules are research heuristics, not medical probabilities or clinical safety validation.",
                                "Readiness is a predeclared engineering baseline gate, not a clinical deployment gate.",
                                "Model does not establish allergies, severity, infection, diagnosis, ingredient response, or an absolute best product."]}
    write_json(PUBLIC / "manifest.json", manifest)
    write_json(DEMOS / "manifest.json", {"attribution": "SCIN Dataset, Google LLC and consented volunteer contributors; see SCIN Data Use License.", "images": demo_records})
    evaluation = {"version": manifest["version"], "seed": SEED, "input_size": SIZE, "elapsed_seconds": round(time.time() - start, 2),
                  "architecture": manifest["architecture"], "pretrained_url": weights.url, "pretrained_weights": str(weights),
                  "software": {"torch": torch.__version__, "numpy": np.__version__, "torchvision": __import__("torchvision").__version__, "onnxruntime": ort.__version__},
                  "dataset_release": sorted({row["release"] for row in cases}), "dataset_metadata_sha256": {filename: sha(DATA / filename) for filename in ["scin_cases.csv", "scin_labels.csv"]},
                  "eligible_before_cap": eligible_counts, "split_counts": split_counts, "exclusions": excluded, "download_failures": failures,
                  "duplicate_controls": leakage, "training": {"frozen_backbone": True, "head": "multinomial logistic regression, balanced class weights, train-only standardization folded into linear layer",
                                                            "C_grid": CS, "selection": "maximum validation macro-F1, balanced accuracy tie-breaker", "selected_C": best.C, "max_iterations": 2000, "validation_candidates": fits},
                  "calibration": {"method": "validation-only temperature grid minimizing NLL", "temperature": temperature, "grid": [.5, 3., .05],
                                  "validation_uncalibrated": metrics(y[masks["validation"]], probabilities(logits[masks["validation"]])),
                                  "validation_scaled": metrics(y[masks["validation"]], probabilities(logits[masks["validation"]], temperature))},
                  "test": test_metrics, "subgroups": subgroup, "readiness": manifest["readiness"], "demos": demo_records,
                  "prohibited_claims": ["Clinical diagnosis", "Disease probability", "Clinically validated", "Absolute best product", "All-clear", "Validated OOD detector"]}
    write_json(MODEL / "evaluation.json", evaluation)
    write_json(PUBLIC / "evaluation.json", evaluation)
    write_json(MODEL / "test_predictions.json", [{"case_id": row["case_id"], "label": row["target"], "scores": {key: float(test_probs[i, j]) for j, key in enumerate(CLASSES)}} for i, row in enumerate(test_rows)])
    print(json.dumps({"phase": "complete", "ready": ready, "test": test_metrics, "demos": [{"id": row["id"], "prediction": row["predicted_class"], "status": row["status"]} for row in demo_records]}), flush=True)


if __name__ == "__main__":
    main()
