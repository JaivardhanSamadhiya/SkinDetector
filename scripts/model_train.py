"""Reproducible, noncommercial DermaMNIST-C baseline; no fabricated metrics.

Run: python scripts/model_train.py --epochs 50
Downloads the published corrected release and verifies publisher MD5 checksums.
Held-out test images are never used in optimization or checkpoint selection.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from backend.model import CLASS_IDS, CLASS_LABELS, SkinCNN, ExportModel, VERSION

DATA_URL = "https://zenodo.org/records/12739457/files/"
FILES = {
    "dermamnist_corrected_28.npz": "96e2862980877d45d9cacb5c25de6950",
    "DermaMNIST-C.csv": "1c54bc9f483e97a9d7dbbde076a45900",
}


def digest(path: Path, algorithm: str = "sha256") -> str:
    h = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download_data() -> None:
    (ROOT / "data").mkdir(exist_ok=True)
    for filename, expected in FILES.items():
        path = ROOT / "data" / filename
        if not path.exists():
            print(f"Downloading published dataset: {filename}", flush=True)
            urllib.request.urlretrieve(DATA_URL + filename + "?download=1", path)
        if digest(path, "md5") != expected:
            raise RuntimeError(f"Dataset checksum mismatch: {filename}. Delete and download again.")


def difference_hash(image: np.ndarray) -> int:
    small = np.asarray(Image.fromarray(image).convert("L").resize((9, 8), Image.Resampling.NEAREST))
    result = 0
    for bit in (small[:, 1:] > small[:, :-1]).flatten():
        result = (result << 1) | int(bit)
    return result


class HashTree:
    """BK-tree for reproducible 64-bit difference-hash neighbor searches."""
    def __init__(self):
        self.root = None

    def add(self, value: int, index: int):
        if self.root is None:
            self.root = [value, [index], {}]
            return
        node = self.root
        while True:
            distance = (node[0] ^ value).bit_count()
            if distance == 0:
                node[1].append(index)
                return
            if distance not in node[2]:
                node[2][distance] = [value, [index], {}]
                return
            node = node[2][distance]

    def search(self, value: int, radius: int = 2):
        stack = [self.root] if self.root else []
        while stack:
            node = stack.pop()
            distance = (node[0] ^ value).bit_count()
            if distance <= radius:
                yield from node[1]
            stack.extend(child for edge, child in node[2].items() if distance - radius <= edge <= distance + radius)


def load_clean_data():
    arrays = np.load(ROOT / "data" / "dermamnist_corrected_28.npz", allow_pickle=False)
    with (ROOT / "data" / "DermaMNIST-C.csv").open(newline="") as stream:
        all_rows = list(csv.DictReader(stream))
    rows = {split: [r for r in all_rows if r["split"] == split] for split in ("train", "val", "test")}
    lesion_sets = {split: {r["lesion_id"] for r in rows[split]} for split in rows}
    for a, b in (("train", "val"), ("train", "test"), ("val", "test")):
        assert not (lesion_sets[a] & lesion_sets[b]), f"Known lesion leakage: {a}/{b}"
    images, labels, clean_rows = {}, {}, {}
    exact_seen: dict[str, tuple[str, str]] = {}
    seen_pixels, seen_rows = [], []
    tree = HashTree()
    removals = []
    # Purge entire held-out lesions with exact/near duplicates of earlier partitions.
    # Never move a test image into training. The original corrected release already
    # handles known lesion IDs and 18 manually identified duplicates.
    for split in ("train", "val", "test"):
        x, y = arrays[f"{split}_images"], arrays[f"{split}_labels"].flatten()
        assert len(rows[split]) == len(x)
        assert [CLASS_IDS[int(label)] for label in y] == [r["dx"] for r in rows[split]], "Metadata order mismatch"
        excluded_lesions = set()
        hashes = []
        for index, (image, row) in enumerate(zip(x, rows[split])):
            exact = hashlib.sha256(image.tobytes()).hexdigest()
            dhash = difference_hash(image)
            hashes.append((exact, dhash))
            if split == "train":
                continue
            match = exact_seen.get(exact)
            reason = "exact_duplicate" if match else None
            if not match:
                for previous in tree.search(dhash):
                    # Also require close RGB pixels so hash collisions do not purge
                    # merely similar lesion shapes. Heuristic, not exhaustive.
                    distance = np.abs(image.astype(np.int16) - seen_pixels[previous].astype(np.int16)).mean()
                    if distance <= 12:
                        match = seen_rows[previous]
                        reason = "dhash_le2_rgb_mad_le12"
                        break
            if match:
                excluded_lesions.add(row["lesion_id"])
                removals.append({"split": split, "image_id": row["image_id"], "lesion_id": row["lesion_id"], "reason": reason, "matched_split": match[0], "matched_image_id": match[1]})
        keep = np.asarray([r["lesion_id"] not in excluded_lesions for r in rows[split]], dtype=bool)
        images[split], labels[split] = x[keep], y[keep]
        clean_rows[split] = [r for r, included in zip(rows[split], keep) if included]
        for image, row, (exact, dhash), included in zip(x, rows[split], hashes, keep):
            if included:
                exact_seen[exact] = (split, row["image_id"])
                tree.add(dhash, len(seen_pixels))
                seen_pixels.append(image)
                seen_rows.append((split, row["image_id"]))
    return images, labels, clean_rows, rows, removals


def softmax(logits: np.ndarray, temperature: float = 1.) -> np.ndarray:
    scaled = logits / temperature
    exp = np.exp(scaled - scaled.max(axis=1, keepdims=True))
    return exp / exp.sum(axis=1, keepdims=True)


def evaluate(labels: np.ndarray, logits: np.ndarray, temperature: float = 1.) -> dict:
    scores = softmax(logits, temperature)
    predicted = scores.argmax(axis=1)
    confusion = np.zeros((7, 7), dtype=int)
    np.add.at(confusion, (labels, predicted), 1)
    support = confusion.sum(axis=1)
    recall = np.divide(confusion.diagonal(), support, out=np.zeros(7), where=support != 0)
    precision = np.divide(confusion.diagonal(), confusion.sum(axis=0), out=np.zeros(7), where=confusion.sum(axis=0) != 0)
    f1 = np.divide(2 * precision * recall, precision + recall, out=np.zeros(7), where=precision + recall != 0)
    confidence = scores.max(axis=1)
    correct = predicted == labels
    bins, ece = [], 0.
    for lower in np.linspace(0, .9, 10):
        upper = lower + .1
        mask = (confidence >= lower) & ((confidence < upper) if upper < .999 else (confidence <= 1))
        count = int(mask.sum())
        accuracy = float(correct[mask].mean()) if count else None
        mean_score = float(confidence[mask].mean()) if count else None
        if count:
            ece += count / len(labels) * abs(accuracy - mean_score)
        bins.append({"lower": round(float(lower), 2), "upper": round(float(upper), 2), "count": count, "accuracy": accuracy, "mean_score": mean_score})
    sorted_scores = np.sort(scores, axis=1)
    accepted = (confidence >= .65) & (sorted_scores[:, -1] - sorted_scores[:, -2] >= .15)
    return {
        "n": len(labels), "accuracy": float(correct.mean()), "macro_f1": float(f1.mean()), "balanced_accuracy": float(recall.mean()),
        "per_class": [{"id": CLASS_IDS[i], "label": CLASS_LABELS[i], "support": int(support[i]), "recall": float(recall[i]), "precision": float(precision[i]), "f1": float(f1[i])} for i in range(7)],
        "confusion_matrix": confusion.tolist(), "nll": float(-np.log(scores[np.arange(len(labels)), labels].clip(1e-10)).mean()),
        "brier_score": float(((scores - np.eye(7)[labels]) ** 2).sum(axis=1).mean()),
        "ece_10_bins": float(ece), "reliability_bins": bins,
        "uncertainty_policy": {"accepted_count": int(accepted.sum()), "coverage": float(accepted.mean()), "accepted_accuracy": float(correct[accepted].mean()) if accepted.any() else None, "max_score_threshold": .65, "margin_threshold": .15, "clinically_validated": False},
    }


def get_logits(model, tensor, batch_size=256):
    model.eval()
    with torch.no_grad():
        return torch.cat([model(tensor[start:start + batch_size]) for start in range(0, len(tensor), batch_size)]).numpy()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--seed", type=int, default=20261011)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    if args.epochs < 1:
        parser.error("epochs must be positive")
    torch.set_num_threads(args.threads)
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    random.seed(args.seed)
    torch.use_deterministic_algorithms(True)
    download_data()
    started = time.time()
    images, labels, rows, original_rows, purges = load_clean_data()
    print("Clean split sizes:", {k: len(v) for k, v in labels.items()}, "duplicate pairs found:", len(purges), flush=True)
    mean = (images["train"].astype(np.float32) / 255).mean(axis=(0, 1, 2))
    std = (images["train"].astype(np.float32) / 255).std(axis=(0, 1, 2))
    tensors = {split: torch.from_numpy(((x.astype(np.float32) / 255 - mean) / std).transpose(0, 3, 1, 2).copy()) for split, x in images.items()}
    training = TensorDataset(tensors["train"], torch.from_numpy(labels["train"].astype(np.int64)))
    loader = DataLoader(training, batch_size=128, shuffle=True, num_workers=0, generator=torch.Generator().manual_seed(args.seed))
    model = SkinCNN()
    counts = np.bincount(labels["train"], minlength=7)
    weights = np.sqrt(counts.sum() / (7 * counts))
    weights /= weights.mean()
    loss_fn = nn.CrossEntropyLoss(weight=torch.tensor(weights, dtype=torch.float32))
    optimizer = torch.optim.AdamW(model.parameters(), lr=.003, weight_decay=.0001)
    schedule = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=.0001)
    best_f1, best_epoch, best_state, history = -1., 0, None, []
    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.
        for x, y in loader:
            # Lesion imaging is orientation-invariant; no label-dependent transforms.
            if torch.rand(()) < .5:
                x = x.flip(3)
            if torch.rand(()) < .5:
                x = x.flip(2)
            x = torch.rot90(x, int(torch.randint(0, 4, ())), (2, 3))
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(x), y)
            loss.backward()
            optimizer.step()
            running += loss.item() * len(y)
        schedule.step()
        logits = get_logits(model, tensors["val"])
        metrics = evaluate(labels["val"], logits)
        history.append({"epoch": epoch, "weighted_train_loss": running / len(training), "validation_macro_f1": metrics["macro_f1"], "validation_balanced_accuracy": metrics["balanced_accuracy"]})
        if metrics["macro_f1"] > best_f1:
            best_f1, best_epoch = metrics["macro_f1"], epoch
            best_state = {name: value.detach().clone() for name, value in model.state_dict().items()}
        print(f"Epoch {epoch}/{args.epochs}: loss {running / len(training):.4f}; validation macro-F1 {metrics['macro_f1']:.4f}; balanced accuracy {metrics['balanced_accuracy']:.4f}", flush=True)
    model.load_state_dict(best_state)
    model.eval()
    val_logits = get_logits(model, tensors["val"])
    candidates = np.linspace(.5, 5., 181)
    temperature = float(min(candidates, key=lambda t: evaluate(labels["val"], val_logits, float(t))["nll"]))
    # One untouched held-out evaluation after checkpoint and calibration selection.
    test_logits = get_logits(model, tensors["test"])
    test = evaluate(labels["test"], test_logits, temperature)
    subgroup = {}
    for field in ("sex", "dataset", "age"):
        groups = defaultdict(list)
        for index, row in enumerate(rows["test"]):
            if field == "age":
                age = float(row[field] or "nan")
                value = "unknown" if not math.isfinite(age) else "under_50" if age < 50 else "50_and_over"
            else:
                value = row[field] or "unknown"
            groups[value].append(index)
        subgroup[field] = {name: evaluate(labels["test"][indices], test_logits[indices], temperature) for name, indices in groups.items()}
    artifacts, public = ROOT / "models", ROOT / "public" / "model"
    artifacts.mkdir(exist_ok=True)
    public.mkdir(parents=True, exist_ok=True)
    checkpoint = artifacts / "skinsnap_derma_cnn.pt"
    torch.save({"state_dict": model.state_dict(), "version": VERSION}, checkpoint)
    onnx_path = public / "model.onnx"
    torch.onnx.export(ExportModel(model), torch.zeros(1, 3, 28, 28), str(onnx_path), input_names=["image"], output_names=["logits", "activations"], opset_version=17, dynamo=False)
    classes = [{"id": cid, "label": label} for cid, label in zip(CLASS_IDS, CLASS_LABELS)]
    limitations = [
        "Research baseline for noncommercial education; no clinical validation, prospective study or external test cohort.",
        "Only 28×28 dermoscopic lesion images; ordinary smartphone/facial photographs are unsupported.",
        "Low resolution discards fine detail and performs poorly for some rare classes; inspect per-class recall.",
        "Lesion IDs are grouped; patient IDs are not released, so patient independence cannot be established.",
        "Known duplicates are corrected upstream; exact hashes and conservative near-duplicate purging are additional safeguards, not a proof of no leakage.",
        "Skin-tone labels are absent; skin-tone subgroup performance and fairness have not been measured.",
        "Source population is drawn from HAM10000 Austria/Australia cohorts, not representative of all users.",
        "Temperature fitted on validation data; scaled model scores are not probabilities of disease or medically validated confidence.",
        "Score/margin rejection thresholds are fixed research heuristics, not clinical safety thresholds or validated OOD detection.",
        "Domain declaration is required; the application cannot verify dermoscopy automatically.",
        "Dataset images carry CC BY-NC 4.0; commercial use needs a separate rights review and appropriate permission.",
    ]
    manifest = {
        "available": True, "version": VERSION, "architecture": "SkinCNN: Conv24/48/64 + BatchNorm/ReLU, two max pools, global average pooling, linear 7-class head", "input_size": 28, "supported_image_type": "dermoscopic", "classes": classes,
        "preprocessing": {"mean": mean.tolist(), "std": std.tolist(), "resize": "nearest", "exif_orientation": True, "transparent_background": "white", "layout": "NCHW", "range_before_normalization": [0, 1]},
        "temperature": temperature, "uncertainty": {"max_score_threshold": .65, "margin_threshold": .15},
        "onnx": {"url": "/model/model.onnx", "sha256": digest(onnx_path), "input_name": "image", "logits_output": "logits", "activations_output": "activations"}, "checkpoint_sha256": digest(checkpoint), "classifier_weights": model.classifier.weight.detach().numpy().tolist(),
        "score_type": "temperature_scaled_model_score", "dataset": "DermaMNIST-C 28 (HAM10000)", "license": "CC BY-NC 4.0", "license_url": "https://creativecommons.org/licenses/by-nc/4.0/", "dataset_url": "https://zenodo.org/records/12739457", "limitations": limitations,
    }
    report = {
        "model": {k: manifest[k] for k in ("version", "architecture", "input_size", "supported_image_type", "classes", "checkpoint_sha256", "dataset", "license", "dataset_url", "limitations")},
        "status": "measured_research_baseline", "measured_at": "2026-10-11", "training": {"seed": args.seed, "epochs": args.epochs, "selected_epoch": best_epoch, "optimizer": "AdamW", "learning_rate": .003, "weight_decay": .0001, "schedule": "cosine to 0.0001", "batch_size": 128, "class_weighting": "normalized square-root inverse class frequency", "class_weights": weights.tolist(), "augmentation": "random flips and 90-degree rotations", "pretrained_weights": None, "deterministic_algorithms": True, "torch_version": torch.__version__, "numpy_version": np.__version__, "training_seconds": time.time() - started, "history": history},
        "dataset": {"name": "DermaMNIST-C 28", "source": "HAM10000", "source_url": "https://doi.org/10.1038/sdata.2018.161", "corrected_release_url": "https://zenodo.org/records/12739457", "correction_paper": "https://doi.org/10.1038/s41597-025-04382-5", "license": "CC BY-NC 4.0", "metadata_license": "CC BY 4.0", "dataset_md5": FILES["dermamnist_corrected_28.npz"], "metadata_md5": FILES["DermaMNIST-C.csv"], "source_resize": "Authors' BICUBIC resize to 28×28", "upload_resize": "Nearest pixel-center resize to 28×28; higher resolution upload equivalence not validated", "patient_ids_available": False, "skin_tone_labels_available": False},
        "split": {"method": "Published corrected lesion-disjoint partitions; purge whole held-out lesion if an exact/near duplicate of earlier partition is found", "original_counts": {split: len(v) for split, v in original_rows.items()}, "clean_counts": {split: len(v) for split, v in rows.items()}, "class_counts": {split: np.bincount(v, minlength=7).tolist() for split, v in labels.items()}, "lesion_counts": {split: len({r['lesion_id'] for r in v}) for split, v in rows.items()}, "known_lesion_overlap": 0, "duplicate_purges": purges, "exact_hash": "SHA256 RGB28 pixels", "near_duplicate_rule": "64-bit dHash Hamming distance <=2 AND mean absolute RGB pixel difference <=12; not exhaustive"},
        "calibration": {"method": "scalar temperature search 0.5–5.0 in steps of 0.025 minimizing validation NLL", "temperature": temperature, "validation_before": evaluate(labels["val"], val_logits), "validation_after": evaluate(labels["val"], val_logits, temperature), "limitations": "The same validation partition selects the checkpoint and fits temperature; no clinical calibration. Test data not used for fitting."},
        "test": test, "test_before_temperature": evaluate(labels["test"], test_logits), "subgroups": subgroup,
        "subgroup_limitations": "Descriptive image-level results, possibly small and imbalanced groups; fixed seven-label macro metrics assign zero recall to absent classes. No patient IDs or skin-tone labels; no fairness claim.", "intended_uses": ["Noncommercial student demonstrations", "Reproducibility and image-classification research", "Education about uncertainty and dataset limitations"], "prohibited_uses": ["Diagnosis or treatment", "Screening or triage", "Reassuring that a lesion is harmless", "Commercial use without rights clearance"],
        "references": ["https://zenodo.org/records/12739457", "https://doi.org/10.1038/s41597-025-04382-5", "https://doi.org/10.1038/sdata.2018.161", "https://doi.org/10.1038/s41597-022-01721-8"],
    }
    (public / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (artifacts / "evaluation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (ROOT / "public" / "model-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    np.savez_compressed(artifacts / "heldout_predictions.npz", labels=labels["test"], logits=test_logits, temperature=temperature)
    with (artifacts / "split_manifest.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["split", "index", "image_id", "lesion_id", "label", "pixel_sha256"])
        writer.writeheader()
        for split in ("train", "val", "test"):
            for index, (row, image) in enumerate(zip(rows[split], images[split])):
                writer.writerow({"split": split, "index": index, "image_id": row["image_id"], "lesion_id": row["lesion_id"], "label": row["dx"], "pixel_sha256": hashlib.sha256(image.tobytes()).hexdigest()})
    # Deterministic demo selection: first held-out image for three labels; never
    # cherry-pick by prediction. These also remain part of reported evaluation.
    demo = ROOT / "public" / "demo"
    demo.mkdir(exist_ok=True)
    manifest_demo = []
    for class_id in (5, 4, 1):
        index = int(np.flatnonzero(labels["test"] == class_id)[0])
        row = rows["test"][index]
        filename = f"{row['image_id']}.png"
        Image.fromarray(images["test"][index]).save(demo / filename)
        manifest_demo.append({"id": row["image_id"], "path": "/demo/" + filename, "label": CLASS_LABELS[class_id], "image_type": "dermoscopic", "source": "DermaMNIST-C 28 / HAM10000", "source_url": "https://zenodo.org/records/12739457", "license": "CC BY-NC 4.0", "attribution": "Philipp Tschandl, Cliff Rosendahl, Harald Kittler (HAM10000); Jiancheng Yang et al. (MedMNIST); Kumar Abhishek, Aditi Jain, Ghassan Hamarneh (corrected release)", "split": "held-out test", "selection": "first retained test image for this label, independent of model prediction", "note": "Dataset reference label, not a diagnosis of the viewer. Low-resolution educational sample; model can be wrong."})
    (demo / "manifest.json").write_text(json.dumps({"images": manifest_demo}, indent=2) + "\n", encoding="utf-8")
    print("Measured held-out report:", json.dumps({k: test[k] for k in ("n", "macro_f1", "balanced_accuracy", "accuracy", "ece_10_bins")}), "temperature:", temperature, flush=True)


if __name__ == "__main__":
    main()
