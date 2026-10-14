"""Export the locked validation-selected photo model, then validate real ONNX.

Export/quantization and calibration use validation data only. Final ONNX test
metrics are recorded without tuning. The public manifest stays unavailable unless
every predeclared engineering requirement is met; none establish clinical safety.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import time
from pathlib import Path
import numpy as np
from PIL import Image
import torch
import onnx
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic
from sklearn.metrics import log_loss
from photo_model_common import ROOT, DATA, MODEL, CLASSES, LABELS, SIZE, SEED, MEAN, STD, PhotoModel, load_backbone, preprocess, sha256, write_json
from photo_model_train import BACKBONES, MINIMUMS, SCORE_MIN, MARGIN_MIN, load_head, metrics, probabilities, cohort, setup

PUBLIC = ROOT / "public/model-photo"
EXPORT_PROTOCOL = {
    "version": 1, "format": "ONNX opset17 fixed [1,3,224,224] image -> float32 [1,3] logits",
    "quantization": "Dynamic signed int8 constant weight MatMul/Gemm, per_channel false, reduce_range true; all attention data-data products remain floating point",
    "model_selection": "Only original validation-selected backbone/head, no alternate selection from final test",
    "calibration": "Recalibrate exported int8 ONNX on validation first views only with NLL temperature grid0.50..4.00 step0.05",
    "parity": "Float32 ONNX vs PyTorch logits max abs error <0.005 on deterministic first12 validation cases",
    "final_gate": "Quantized final test must independently satisfy the same registered photo benchmark and source requirements",
    "explanations": "No CNN CAM is reused for this transformer; no overlay is claimed",
    "clinical_validation": False,
}


def protocol():
    path = MODEL / "export-protocol.json"
    if path.exists() and json.loads(path.read_text(encoding="utf-8")) != EXPORT_PROTOCOL:
        raise RuntimeError("Export protocol changed after registration.")
    write_json(path, EXPORT_PROTOCOL)


def selected():
    candidates = [json.loads((MODEL / (name + "-validation.json")).read_text(encoding="utf-8")) for name in BACKBONES]
    cohort_hash = sha256(DATA / "combined-cohort.json")
    for candidate in candidates:
        if candidate["cohort_sha256"] != cohort_hash or candidate["head_sha256"] != sha256(MODEL / (candidate["backbone"] + "-head.npz")):
            raise RuntimeError("Validation-selected head or cohort changed before export.")
    return max(candidates, key=lambda r: (r["validation"]["macro_f1"], r["validation"]["balanced_accuracy"]))


def image_tensor(row):
    with Image.open(ROOT / row["images"][0]["local_path"]) as image: return preprocess(image)[None, :]


def run_rows(session, rows, phase):
    outputs, start = [], time.time()
    for i, row in enumerate(rows):
        tensor = image_tensor(row)
        logits = session.run(["logits"], {"image": tensor})[0]
        if logits.shape != (1, 3) or not np.isfinite(logits).all(): raise ValueError("Invalid deployed ONNX output")
        outputs.append(logits[0])
        if (i + 1) % 100 == 0: print(json.dumps({"phase": phase, "done": i + 1, "total": len(rows), "elapsed_seconds": round(time.time() - start)}), flush=True)
    return np.stack(outputs)


def session(path):
    options = ort.SessionOptions(); options.intra_op_num_threads = 4; options.inter_op_num_threads = 1
    return ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])


def export():
    if (MODEL / "test-lock.json").exists() or (MODEL / "categories-test-lock.json").exists():
        raise RuntimeError("Export/calibration must be locked before opening either shared final test.")
    if not (MODEL / "categories-selection-lock.json").exists(): raise RuntimeError("Lock related category model selection first.")
    choice = selected(); backbone = choice["backbone"]; head = load_head(backbone)
    source_model = PhotoModel(load_backbone(backbone), head["weights"], head["bias"], head.get("centers"), head.get("gamma")).eval()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    float_path = DATA / "export-float.onnx"
    torch.onnx.export(source_model, torch.zeros(1, 3, SIZE, SIZE), str(float_path), input_names=["image"], output_names=["logits"], opset_version=17, dynamo=False)
    onnx.checker.check_model(str(float_path))
    float_session = session(float_path)
    val_rows = [r for r in cohort()["records"] if r["split"] == "validation"]
    errors = []
    for row in val_rows[:12]:
        tensor = image_tensor(row)
        with torch.inference_mode(): reference = source_model(torch.from_numpy(tensor)).numpy()
        actual = float_session.run(["logits"], {"image": tensor})[0]
        errors.append(float(np.max(np.abs(reference - actual))))
    if max(errors) >= .005: raise RuntimeError("Float ONNX/PyTorch parity failed: " + str(max(errors)))
    del float_session, source_model
    quantize_dynamic(str(float_path), str(PUBLIC / "model.onnx"), op_types_to_quantize=["MatMul", "Gemm"], per_channel=False, reduce_range=True, weight_type=QuantType.QInt8, extra_options={"MatMulConstBOnly": True})
    onnx.checker.check_model(str(PUBLIC / "model.onnx"))
    deployed = session(PUBLIC / "model.onnx")
    logits = run_rows(deployed, val_rows, "onnx_validation")
    y = np.array([CLASSES.index(r["target"]) for r in val_rows])
    temperature = float(min(np.round(np.arange(.5, 4.001, .05), 2), key=lambda t: log_loss(y, probabilities(logits, t), labels=[0, 1, 2])))
    source_validation = {name: metrics(y[np.array([row["source"] == name for row in val_rows])], probabilities(logits[np.array([row["source"] == name for row in val_rows])], temperature)) for name in ["SCIN", "Fitzpatrick17k-C"]}
    lock = {"backbone": backbone, "head_sha256": sha256(MODEL / (backbone + "-head.npz")), "onnx_sha256": sha256(PUBLIC / "model.onnx"), "onnx_bytes": (PUBLIC / "model.onnx").stat().st_size,
            "temperature": temperature, "cohort_sha256": sha256(DATA / "combined-cohort.json"), "export_protocol_sha256": sha256(MODEL / "export-protocol.json"),
            "float32_pytorch_max_logit_error": max(errors), "validation": metrics(y, probabilities(logits, temperature)), "source_validation": source_validation}
    write_json(MODEL / "export-lock.json", lock)
    print(json.dumps({"phase": "export_locked", **lock}), flush=True)


def evaluate():
    lock = json.loads((MODEL / "export-lock.json").read_text(encoding="utf-8"))
    source = json.loads((MODEL / "evaluation.json").read_text(encoding="utf-8"))
    if lock["export_protocol_sha256"] != sha256(MODEL / "export-protocol.json") or source["lock"]["export_lock_sha256"] != sha256(MODEL / "export-lock.json"):
        raise RuntimeError("Export protocol or calibration lock changed after final test opening.")
    if lock["cohort_sha256"] != sha256(DATA / "combined-cohort.json") or lock["head_sha256"] != source["lock"]["head_sha256"] or lock["onnx_sha256"] != sha256(PUBLIC / "model.onnx"):
        raise RuntimeError("Export lock or source evaluation no longer matches.")
    rows = [r for r in cohort()["records"] if r["split"] == "test"]
    logits = run_rows(session(PUBLIC / "model.onnx"), rows, "onnx_final_test")
    y = np.array([CLASSES.index(r["target"]) for r in rows]); p = probabilities(logits, lock["temperature"])
    report = metrics(y, p)
    sources = {name: metrics(y[np.array([r["source"] == name for r in rows])], p[np.array([r["source"] == name for r in rows])]) for name in ["SCIN", "Fitzpatrick17k-C"]}
    measured = {"macro_f1": report["macro_f1"], "balanced_accuracy": report["balanced_accuracy"], "acne_recall": report["per_class"]["acne"]["recall"], "dermatitis_recall": report["per_class"]["dermatitis"]["recall"]}
    passed = all(measured[key] >= value for key, value in MINIMUMS.items())
    scin_pass = sources["SCIN"]["per_class"]["dermatitis"]["recall"] >= .5
    readiness = {**source["readiness"], "measured": measured, "benchmark_minimums_passed": passed, "scin_dermatitis_recall_minimum_passed": scin_pass}
    readiness["passed"] = passed and scin_pass and readiness["sufficient_supported_class_samples"] and readiness["independent_holdout"] and not readiness["blocked_by_previously_examined_test"]
    accepted = (p.max(axis=1) >= SCORE_MIN) & ((np.sort(p, axis=1)[:, -1] - np.sort(p, axis=1)[:, -2]) >= MARGIN_MIN) & (p.argmax(axis=1) != 2)
    deployment_validation = {"onnx_verified": True, "preprocessing_verified": True, "quantized_benchmark_passed": readiness["passed"], "onnx_sha256": lock["onnx_sha256"], "onnx_bytes": lock["onnx_bytes"], "pytorch_float32_max_logit_error": lock["float32_pytorch_max_logit_error"], "browser_verified": False}
    evaluation = {**source, "test": report, "source_test": sources, "readiness": readiness, "deployment_validation": deployment_validation,
                  "evaluation_artifact": "Actual deployed dynamic-int8 ONNX artifact", "pytorch_reference_test": source["test"], "temperature": lock["temperature"],
                  "validation": lock["validation"], "source_validation": lock["source_validation"], "export_lock": lock,
                  "selective": {"count": int(accepted.sum()), "coverage": float(accepted.mean()), "accuracy": float((p.argmax(axis=1)[accepted] == y[accepted]).mean()) if accepted.any() else None}}
    write_json(MODEL / "onnx-evaluation.json", evaluation); write_json(PUBLIC / "evaluation.json", evaluation)
    write_json(MODEL / "onnx-test-predictions.json", [{"id": row["id"], "target": row["target"], "source": row["source"], "group": row["duplicate_group"], "scores": p[i].tolist(), "accepted": bool(accepted[i])} for i, row in enumerate(rows)])
    architecture = f"Frozen DINOv2 {lock['backbone']} (CLS + mean patch features) with trained {source['head']} three-class research head; dynamic int8 ONNX"
    manifest = {"version": source["version"], "architecture": architecture, "available": readiness["passed"], "backbone": lock["backbone"], "head": source["head"], "input_size": SIZE, "supported_image_type": "clinical_photo",
                "classes": [{"id": key, "label": LABELS[i]} for i, key in enumerate(CLASSES)], "preprocessing": {"mean": [.485, .456, .406], "std": [.229, .224, .225], "resize": "nearest", "coordinate_rule": "floor((coordinate+0.5)*source_size/224)", "exif_orientation": True, "alpha": "white", "layout": "NCHW"},
                "temperature": lock["temperature"], "uncertainty": {"max_score_threshold": SCORE_MIN, "margin_threshold": MARGIN_MIN, "always_reject_classes": ["other"]},
                "readiness": readiness, "test_group_support": source["test_group_support"], "deployment_validation": deployment_validation,
                "onnx": {"url": "/model-photo/model.onnx", "sha256": lock["onnx_sha256"], "input_name": "image", "logits_output": "logits"},
                "dataset": "SCIN + corrected Fitzpatrick17k-C", "licenses": ["SCIN Data Use License", "Fitzpatrick17k images: CC BY-NC-SA3.0 per authors, original atlas rights not commercially cleared", "Corrected metadata: CC BY4.0", "DINOv2: Apache2.0"],
                "limitations": evaluation["limitations"]}
    write_json(PUBLIC / "manifest.json", manifest)
    print(json.dumps({"phase": "deployed_onnx_evaluated", "ready": readiness["passed"], "test": report, "source_test": sources, "selective": evaluation["selective"]}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("phase", choices=["protocol", "export", "evaluate"])
    args = parser.parse_args(); setup(); protocol()
    if args.phase == "export": export()
    elif args.phase == "evaluate": evaluate()


if __name__ == "__main__": main()
