"""Verify persisted artifacts and execute genuine inference over licensed demos.

This never trains or selects samples by their predictions. The JSON parity
record is consumed by browser E2E tests and contains actual PyTorch outputs.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
import onnx
from PIL import Image
import torch
from backend.service import ModelService
from scripts.model_train import FILES, digest, evaluate, get_logits, load_clean_data


def verify_heldout_execution(service, labels, saved_logits, report):
    """Run the persisted weights on the original, checksum-verified held-out data."""
    for filename, expected in FILES.items():
        path = ROOT / "data" / filename
        assert path.is_file(), f"Missing {path}; download the documented dataset first."
        assert digest(path, "md5") == expected, f"Dataset integrity failure: {filename}"
    images, partitions, rows, original, purges = load_clean_data()
    assert {k: len(v) for k, v in original.items()} == report["split"]["original_counts"]
    assert {k: len(v) for k, v in rows.items()} == report["split"]["clean_counts"]
    assert {k: np.bincount(v, minlength=7).tolist() for k, v in partitions.items()} == report["split"]["class_counts"]
    assert {k: len({r["lesion_id"] for r in v}) for k, v in rows.items()} == report["split"]["lesion_counts"]
    assert purges == report["split"]["duplicate_purges"]
    expected_rows = []
    for split in ("train", "val", "test"):
        for index, (row, image) in enumerate(zip(rows[split], images[split])):
            expected_rows.append({"split": split, "index": str(index), "image_id": row["image_id"], "lesion_id": row["lesion_id"], "label": row["dx"], "pixel_sha256": hashlib.sha256(image.tobytes()).hexdigest()})
    with (ROOT / "models/split_manifest.csv").open(newline="", encoding="utf-8") as stream:
        assert list(csv.DictReader(stream)) == expected_rows, "Split manifest does not match cleaned dataset."
    assert np.array_equal(partitions["test"], labels)
    mean = (images["train"].astype(np.float32) / 255).mean(axis=(0, 1, 2))
    std = (images["train"].astype(np.float32) / 255).std(axis=(0, 1, 2))
    assert mean.tolist() == service.manifest["preprocessing"]["mean"]
    assert std.tolist() == service.manifest["preprocessing"]["std"]
    x = ((images["test"].astype(np.float32) / 255 - mean) / std).transpose(0, 3, 1, 2).copy()
    fresh_logits = get_logits(service.model, torch.from_numpy(x))
    np.testing.assert_allclose(fresh_logits, saved_logits, rtol=1e-5, atol=1e-5)
    assert np.array_equal(fresh_logits.argmax(axis=1), saved_logits.argmax(axis=1))
    fresh = evaluate(labels, fresh_logits, service.manifest["temperature"])
    for key in ("accuracy", "macro_f1", "balanced_accuracy", "confusion_matrix"):
        assert fresh[key] == report["test"][key], f"Fresh checkpoint evaluation differs: {key}"
    for key in ("nll", "brier_score", "ece_10_bins"):
        assert np.isclose(fresh[key], report["test"][key], atol=1e-7), f"Fresh checkpoint calibration differs: {key}"
    print(f"Fresh checkpoint inference reproduced all {len(labels)} held-out labels/logits and the measured report.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recompute-heldout", action="store_true", help="Requires the original downloaded dataset; recomputes the split audit and executes the checkpoint on all held-out images.")
    args = parser.parse_args()
    torch.set_num_threads(4)
    service = ModelService()
    service.load()
    manifest = service.manifest
    onnx_path = ROOT / "public/model/model.onnx"
    assert digest(onnx_path) == manifest["onnx"]["sha256"]
    onnx.checker.check_model(onnx.load(onnx_path))
    report = json.loads((ROOT / "models/evaluation.json").read_text())
    assert report == json.loads((ROOT / "public/model-report.json").read_text()), "Public evaluation report mismatch."
    assert report["model"]["checkpoint_sha256"] == manifest["checkpoint_sha256"]
    assert report["model"]["version"] == manifest["version"]
    assert service.model.classifier.weight.detach().numpy().tolist() == manifest["classifier_weights"], "CAM weights mismatch."
    with np.load(ROOT / "models/heldout_predictions.npz", allow_pickle=False) as predictions:
        labels, logits, temperature = predictions["labels"].copy(), predictions["logits"].copy(), float(predictions["temperature"])
    assert temperature == manifest["temperature"] == report["calibration"]["temperature"]
    assert evaluate(labels, logits, temperature) == report["test"], "Saved evaluation mismatch."
    assert evaluate(labels, logits) == report["test_before_temperature"], "Unscaled evaluation mismatch."
    if args.recompute_heldout:
        verify_heldout_execution(service, labels, logits, report)
    demos = json.loads((ROOT / "public/demo/manifest.json").read_text())["images"]
    results = []
    for demo in demos:
        path = ROOT / "public" / demo["path"].lstrip("/")
        with Image.open(path) as image:
            with image.convert("RGB") as rgb:
                response = service.analyze(rgb, "dermoscopic")
        assert response.status in ("assessed", "uncertain") and len(response.scores) == 7
        results.append({"filename": path.name, "reference_label": demo["label"], "status": response.status, "scores": [score.model_dump() for score in response.scores], "model_version": response.model.version, "image_sha256": digest(path)})
        print(path.name, response.status, response.scores[0].id, f"score {response.scores[0].score:.6f}")
    parity = {"model_version": manifest["version"], "backend": "PyTorch CPU ModelService", "source": "Executed real trained weights; no prediction fixtures used during training.", "samples": results}
    (ROOT / "models/browser_parity.json").write_text(json.dumps(parity, indent=2) + "\n", encoding="utf-8")
    print("Artifact checks, ONNX structural validation, saved held-out metrics and genuine demo inference passed.")


if __name__ == "__main__":
    main()
