"""Repair deployment serialization of the already locked photo-v2 model.

No training, model selection, temperature fitting, or threshold search occurs.
The failed int8 artifact and its reports remain intact. A single storage-only
float16 conversion is accepted only on predeclared validation parity; otherwise
the original float32 ONNX is used. Test measurements follow a new immutable lock.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import shutil
import time
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
import torch

from photo_model_common import (ROOT, DATA, MODEL, CLASSES, LABELS, SIZE, PhotoModel,
                                backbone_artifact, load_backbone, preprocessing_fingerprint,
                                sha256, write_json)
from photo_model_export import image_tensor as original_image_tensor, session
from photo_model_train import (MINIMUMS, SCORE_MIN, MARGIN_MIN, cohort, load_head,
                               load_features, metrics, model_logits, probabilities, setup)

PUBLIC = ROOT / "public/model-photo"
MAX_PART_BYTES = 20 * 1024 * 1024
PROTOCOL = {
    "version": 1,
    "purpose": "Technical deployment serialization repair after failed dynamic-int8 export; no new model selection or training",
    "registered_after_original_test": True,
    "candidates_in_order": ["float16_constants_float32_compute", "original_float32"],
    "float16_rule": "Round finite float32 initializer tensors with at least1024 elements to float16 storage; insert Cast to float32 before original graph operations; preserve trained head tensors exactly; skip unrepresentable tensors",
    "parity": {"split": "validation", "rows": "First12 in unchanged cohort order", "maximum_absolute_logit_error": 0.005, "reference": "Fresh PyTorch locked backbone/head", "require_matching_top_labels": True},
    "fallback": "If the single float16 candidate fails parity, deploy byte-identical original float32 ONNX; no iterative conversion tuning",
    "calibration": "Retain original validation-selected temperature unchanged; never use int8 recalibration",
    "validation": "Measure all original validation first views with chosen artifact; report source metrics; no tuning from measurements",
    "test": "Lock repair format, file hashes, calibration, and validation before remeasuring already opened test; explicitly not a new independent experiment",
    "readiness": "Use original unchanged benchmark, sample-count, source, and holdout rules; browser verification is separate",
    "part_bytes_maximum": MAX_PART_BYTES,
    "part_count_maximum": 32,
    "clinical_validation": False,
}


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def image_tensor(row):
    image = row["images"][0]
    path = (ROOT / image["local_path"]).resolve()
    if not path.is_relative_to((ROOT / "data").resolve()) or sha256(path) != image["source_sha256"]:
        raise RuntimeError("Evaluation image differs from registered cohort.")
    return original_image_tensor(row)


def run_rows(runtime, rows, phase):
    values, started = [], time.time()
    for index, row in enumerate(rows):
        logits = runtime.run(["logits"], {"image": image_tensor(row)})[0]
        if logits.shape != (1, 3) or not np.isfinite(logits).all():
            raise ValueError("Invalid repaired ONNX logits.")
        values.append(logits[0])
        if (index + 1) % 50 == 0:
            print(json.dumps({"phase": phase, "done": index + 1, "total": len(rows), "elapsed_seconds": round(time.time() - started)}), flush=True)
    return np.stack(values)


def immutable_json(path, value):
    path = Path(path)
    if path.exists():
        if read_json(path) != value:
            raise RuntimeError("Immutable repair record changed: " + str(path))
    else:
        write_json(path, value)


def protocol():
    immutable_json(MODEL / "deployment-repair-protocol.json", PROTOCOL)


def verify_original():
    """Check every original locked input before any repaired-model execution."""
    source = read_json(MODEL / "evaluation.json")
    lock = read_json(MODEL / "test-lock.json")
    export = read_json(MODEL / "export-lock.json")
    if source["lock"] != lock:
        raise RuntimeError("Original evaluation/test lock differ.")
    expected = {
        "cohort_sha256": sha256(DATA / "combined-cohort.json"),
        "head_sha256": sha256(MODEL / (lock["backbone"] + "-head.npz")),
        "protocol_sha256": sha256(MODEL / "training-protocol.json"),
        "export_lock_sha256": sha256(MODEL / "export-lock.json"),
        "categories_selection_lock_sha256": sha256(MODEL / "categories-selection-lock.json"),
        "preprocessing_sha256": preprocessing_fingerprint(),
        "backbone_provenance": backbone_artifact(lock["backbone"]),
    }
    if any(lock.get(key) != value for key, value in expected.items()):
        raise RuntimeError("Original training/cohort/preprocessing provenance changed.")
    if export["export_protocol_sha256"] != sha256(MODEL / "export-protocol.json"):
        raise RuntimeError("Original export protocol changed.")
    choice = read_json(MODEL / (lock["backbone"] + "-validation.json"))
    head = load_head(lock["backbone"])
    if choice["head_sha256"] != lock["head_sha256"] or choice["cohort_sha256"] != lock["cohort_sha256"]:
        raise RuntimeError("Original validation selection changed.")
    if head["temperature"] != source["temperature"] or head["temperature"] != choice["temperature"]:
        raise RuntimeError("Original calibration changed.")
    return source, head


def float16_storage(source_path, output_path, protected_arrays=()):
    """Keep every compute edge float32; only large constant storage is float16."""
    graph = onnx.load(str(source_path))
    used = {name for node in graph.graph.node for name in [*node.input, *node.output]}
    used.update(item.name for item in graph.graph.initializer)
    graph_inputs = {item.name for item in graph.graph.input}
    casts, converted, protected = [], [], []
    for initializer in graph.graph.initializer:
        if initializer.data_type != TensorProto.FLOAT:
            continue
        array = numpy_helper.to_array(initializer)
        preserve = any(array.shape == item.shape and np.array_equal(array, item) for item in protected_arrays)
        if preserve:
            protected.append(initializer.name)
        if preserve or initializer.name in graph_inputs or array.size < 1024:
            continue
        if not np.isfinite(array).all() or np.abs(array).max() > np.finfo(np.float16).max:
            continue
        original_name = initializer.name
        stored_name = original_name + "__fp16_storage"
        while stored_name in used:
            stored_name += "_"
        used.add(stored_name)
        initializer.CopyFrom(numpy_helper.from_array(array.astype(np.float16), name=stored_name))
        casts.append(helper.make_node("Cast", [stored_name], [original_name], to=TensorProto.FLOAT, name=stored_name + "__restore_float32"))
        converted.append(original_name)
    nodes = list(graph.graph.node)
    del graph.graph.node[:]
    graph.graph.node.extend([*casts, *nodes])
    onnx.checker.check_model(graph)
    onnx.save(graph, str(output_path))
    return {"converted_initializer_count": len(converted), "protected_head_initializers": protected,
            "bytes": Path(output_path).stat().st_size, "sha256": sha256(output_path)}


def parity_report(reference, candidate):
    reference, candidate = np.asarray(reference), np.asarray(candidate)
    if reference.shape != candidate.shape or reference.ndim != 2 or reference.shape[1] != 3:
        raise ValueError("Parity arrays must have matching [N,3] shapes.")
    if not np.isfinite(reference).all() or not np.isfinite(candidate).all():
        raise ValueError("Nonfinite parity output.")
    error = float(np.max(np.abs(reference - candidate)))
    same = bool(np.array_equal(reference.argmax(axis=1), candidate.argmax(axis=1)))
    return {"n": len(reference), "maximum_absolute_logit_error": error, "matching_top_labels": same,
            "passed": error < PROTOCOL["parity"]["maximum_absolute_logit_error"] and same}


def split_artifact(path, directory, max_bytes=MAX_PART_BYTES):
    if not 1 <= max_bytes <= MAX_PART_BYTES:
        raise ValueError("Part size exceeds the registered deployment limit.")
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    parts, digest = [], hashlib.sha256()
    with Path(path).open("rb") as file:
        while data := file.read(max_bytes):
            name = f"model.part-{len(parts) + 1}.bin"
            target = directory / name
            if target.exists() and sha256(target) != hashlib.sha256(data).hexdigest():
                raise RuntimeError("Existing deployment part differs from locked artifact.")
            if not target.exists():
                target.write_bytes(data)
            digest.update(data)
            parts.append({"url": "/model-photo/" + name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    if not parts or len(parts) > 32 or digest.hexdigest() != sha256(path):
        raise RuntimeError("Artifact split verification failed.")
    return {"sha256": digest.hexdigest(), "bytes": sum(p["bytes"] for p in parts), "parts": parts,
            "input_name": "image", "logits_output": "logits"}


def per_source(rows, y, p):
    return {name: metrics(y[np.array([r["source"] == name for r in rows])], p[np.array([r["source"] == name for r in rows])]) for name in sorted({r["source"] for r in rows})}


def prepare():
    protocol()
    source, head = verify_original()
    if (MODEL / "deployment-repair-lock.json").exists():
        verify_repair()
        print(json.dumps({"phase": "repair_already_locked"}), flush=True)
        return
    float_path = DATA / "export-float.onnx"
    onnx.checker.check_model(str(float_path))
    rows = [r for r in cohort()["records"] if r["split"] == "validation"]
    if len(rows) < 12:
        raise RuntimeError("The registered parity set requires12 validation cases.")
    network = PhotoModel(load_backbone(source["backbone"]), head["weights"], head["bias"], head.get("centers"), head.get("gamma")).eval()
    references = []
    for row in rows[:12]:
        with torch.inference_mode():
            references.append(network(torch.from_numpy(image_tensor(row))).numpy()[0])
    del network
    gc.collect()
    reference = np.stack(references)
    float_session = session(float_path)
    float_outputs = run_rows(float_session, rows[:12], "repair_original_float_parity")
    original_parity = parity_report(reference, float_outputs)
    del float_session
    if not original_parity["passed"]:
        raise RuntimeError("Original float32 artifact does not reproduce the locked PyTorch model.")
    candidate_path = DATA / "deployment-fp16-storage.onnx"
    protected = [head["weights"], head["weights"].T, head["bias"]]
    conversion = float16_storage(float_path, candidate_path, protected)
    try:
        candidate_session = session(candidate_path)
        candidate_outputs = run_rows(candidate_session, rows[:12], "repair_fp16_storage_parity")
        candidate_parity = parity_report(reference, candidate_outputs)
        del candidate_session
    except (RuntimeError, ValueError) as error:
        candidate_parity = {"passed": False, "technical_failure": str(error)}
    gc.collect()
    chosen = candidate_path if candidate_parity["passed"] else float_path
    storage_format = "float16_constants_float32_compute" if candidate_parity["passed"] else "float32"
    print(json.dumps({"phase": "repair_format_selected_by_validation_parity", "format": storage_format, "original_parity": original_parity, "candidate_parity": candidate_parity, "conversion": conversion}), flush=True)
    logits = run_rows(session(chosen), rows, "repair_validation")
    temperature = float(head["temperature"])
    y = np.array([CLASSES.index(r["target"]) for r in rows])
    p = probabilities(logits, temperature)
    onnx_descriptor = split_artifact(chosen, PUBLIC)
    failed_public = PUBLIC / "model.onnx"
    failed_archive = DATA / "failed-int8-model.onnx"
    original_export = read_json(MODEL / "export-lock.json")
    if failed_public.exists():
        if sha256(failed_public) != original_export["onnx_sha256"]:
            raise RuntimeError("Failed int8 artifact no longer matches original export lock.")
        if not failed_archive.exists():
            shutil.copyfile(failed_public, failed_archive)
        if sha256(failed_archive) != original_export["onnx_sha256"]:
            raise RuntimeError("Failed int8 archive verification failed.")
        try:
            failed_public.unlink()
        except PermissionError:
            # An unused historical file can be held by a preview/Windows scanner.
            # Its verified archive is intact; cleanup is not an inference gate.
            print(json.dumps({"phase": "failed_artifact_cleanup_deferred", "archived": True}), flush=True)
    lock = {"version": 1, "format": storage_format, "artifact_local_path": chosen.relative_to(ROOT).as_posix(), "onnx": onnx_descriptor,
            "backbone": source["backbone"], "head": source["head"], "head_sha256": source["lock"]["head_sha256"], "temperature": temperature,
            "protocol_sha256": sha256(MODEL / "deployment-repair-protocol.json"), "original_test_lock_sha256": sha256(MODEL / "test-lock.json"),
            "original_evaluation_sha256": sha256(MODEL / "evaluation.json"), "failed_int8_evaluation_sha256": sha256(MODEL / "onnx-evaluation.json"),
            "cohort_sha256": source["lock"]["cohort_sha256"], "original_float32_sha256": sha256(float_path),
            "original_float32_pytorch_parity": original_parity, "float16_storage_pytorch_parity": candidate_parity, "conversion": conversion,
            "validation": metrics(y, p), "source_validation": per_source(rows, y, p), "format_selected_without_test_labels": True,
            "test_was_already_opened_in_original_experiment": True}
    immutable_json(MODEL / "deployment-repair-lock.json", lock)
    print(json.dumps({"phase": "repair_locked", "format": storage_format, "onnx": onnx_descriptor, "validation": lock["validation"]}), flush=True)


def verify_repair():
    protocol()
    source, _ = verify_original()
    lock = read_json(MODEL / "deployment-repair-lock.json")
    paths = {"protocol_sha256": MODEL / "deployment-repair-protocol.json", "original_test_lock_sha256": MODEL / "test-lock.json",
             "original_evaluation_sha256": MODEL / "evaluation.json", "failed_int8_evaluation_sha256": MODEL / "onnx-evaluation.json",
             "cohort_sha256": DATA / "combined-cohort.json", "original_float32_sha256": DATA / "export-float.onnx"}
    if any(lock.get(key) != sha256(path) for key, path in paths.items()) or lock["temperature"] != source["temperature"]:
        raise RuntimeError("Repair provenance or original calibration changed.")
    path = (ROOT / lock["artifact_local_path"]).resolve()
    if not path.is_relative_to(DATA.resolve()) or sha256(path) != lock["onnx"]["sha256"] or path.stat().st_size != lock["onnx"]["bytes"]:
        raise RuntimeError("Repaired artifact does not match its lock.")
    combined = hashlib.sha256()
    for part in lock["onnx"]["parts"]:
        file = (PUBLIC / Path(part["url"]).name)
        if file.stat().st_size != part["bytes"] or part["bytes"] > MAX_PART_BYTES or sha256(file) != part["sha256"]:
            raise RuntimeError("Deployment part changed.")
        combined.update(file.read_bytes())
    if combined.hexdigest() != lock["onnx"]["sha256"]:
        raise RuntimeError("Combined deployment parts do not reproduce artifact.")
    return source, lock, path


def evaluate():
    source, lock, path = verify_repair()
    test_lock = {"repair_lock_sha256": sha256(MODEL / "deployment-repair-lock.json"), "original_test_lock_sha256": sha256(MODEL / "test-lock.json"),
                 "measurement": "Serialization repair of unchanged trained model; same previously opened test, not a new independent experiment"}
    immutable_json(MODEL / "deployment-repair-test-lock.json", test_lock)
    rows = [r for r in cohort()["records"] if r["split"] == "test"]
    logits = run_rows(session(path), rows, "repair_test_remeasurement")
    y = np.array([CLASSES.index(r["target"]) for r in rows])
    p = probabilities(logits, lock["temperature"])
    report, sources = metrics(y, p), per_source(rows, y, p)
    measured = {"macro_f1": report["macro_f1"], "balanced_accuracy": report["balanced_accuracy"], "acne_recall": report["per_class"]["acne"]["recall"], "dermatitis_recall": report["per_class"]["dermatitis"]["recall"]}
    numeric = all(measured[key] >= value for key, value in MINIMUMS.items())
    scin = sources["SCIN"]["per_class"]["dermatitis"]["recall"] >= .5
    readiness = {**source["readiness"], "measured": measured, "benchmark_minimums_passed": numeric, "scin_dermatitis_recall_minimum_passed": scin}
    readiness["passed"] = numeric and scin and readiness["sufficient_supported_class_samples"] and readiness["independent_holdout"] and not readiness["blocked_by_previously_examined_test"]
    accepted = (p.max(axis=1) >= SCORE_MIN) & ((np.sort(p, axis=1)[:, -1] - np.sort(p, axis=1)[:, -2]) >= MARGIN_MIN) & (p.argmax(axis=1) != 2)
    selective = {"count": int(accepted.sum()), "coverage": float(accepted.mean()), "accuracy": float((p.argmax(axis=1)[accepted] == y[accepted]).mean()) if accepted.any() else None}
    items, features = load_features(source["backbone"])
    selected = [(i, item) for i, item in enumerate(items) if item["split"] == "test"]
    reference_by_id = {item["id"]: value for (_, item), value in zip(selected, model_logits(features[[i for i, _ in selected]], load_head(source["backbone"])))}
    reference = np.stack([reference_by_id[row["id"]] for row in rows])
    reference_comparison = parity_report(reference, logits)
    del features
    chosen_parity = lock["float16_storage_pytorch_parity"] if lock["format"] == "float16_constants_float32_compute" else lock["original_float32_pytorch_parity"]
    deployment = {"onnx_verified": True, "preprocessing_verified": True, "artifact_benchmark_passed": readiness["passed"], "format": lock["format"],
                  "onnx_sha256": lock["onnx"]["sha256"], "onnx_bytes": lock["onnx"]["bytes"], "pytorch_float32_max_logit_error": chosen_parity["maximum_absolute_logit_error"],
                  "browser_verified": False, "test_reference_comparison": reference_comparison}
    evaluation = {**source, "test": report, "source_test": sources, "validation": lock["validation"], "source_validation": lock["source_validation"],
                  "readiness": readiness, "selective": selective, "deployment_validation": deployment, "temperature": lock["temperature"],
                  "evaluation_artifact": "Actual deployed ONNX: " + lock["format"], "pytorch_reference_test": source["test"], "repair_lock": lock,
                  "repair_test_lock": test_lock, "failed_int8_report": "models/photo-v2/onnx-evaluation.json",
                  "limitations": [*source["limitations"], "Deployment serialization was repaired after original test opening; the same test is remeasured, not an independent new validation."]}
    immutable_json(MODEL / "deployment-evaluation.json", evaluation)
    predictions = [{"id": row["id"], "target": row["target"], "source": row["source"], "group": row["duplicate_group"], "scores": p[i].tolist(), "accepted": bool(accepted[i])} for i, row in enumerate(rows)]
    immutable_json(MODEL / "deployment-test-predictions.json", predictions)
    manifest = {"version": source["version"], "architecture": f"Frozen DINOv2 {source['backbone']} CLS + mean patch features with trained {source['head']} three-class head; {lock['format']} ONNX",
                "available": readiness["passed"], "backbone": source["backbone"], "head": source["head"], "input_size": SIZE, "supported_image_type": "clinical_photo",
                "classes": [{"id": key, "label": LABELS[i]} for i, key in enumerate(CLASSES)],
                "preprocessing": {"mean": [.485, .456, .406], "std": [.229, .224, .225], "resize": "nearest", "coordinate_rule": "floor((coordinate+0.5)*source_size/224)", "exif_orientation": True, "alpha": "white", "layout": "NCHW"},
                "temperature": lock["temperature"], "uncertainty": {"max_score_threshold": SCORE_MIN, "margin_threshold": MARGIN_MIN, "always_reject_classes": ["other"]},
                "readiness": readiness, "test_group_support": source["test_group_support"], "deployment_validation": deployment, "onnx": lock["onnx"],
                "dataset": "SCIN + corrected Fitzpatrick17k-C", "licenses": ["SCIN Data Use License", "Fitzpatrick17k images: CC BY-NC-SA3.0 per authors, original atlas rights not commercially cleared", "Corrected metadata: CC BY4.0", "DINOv2: Apache2.0"],
                "limitations": evaluation["limitations"]}
    history = MODEL / "deployment-history"
    history.mkdir(parents=True, exist_ok=True)
    for name in ["manifest.json", "evaluation.json"]:
        old = PUBLIC / name
        backup = history / ("failed-int8-" + name)
        if old.exists() and not backup.exists():
            shutil.copyfile(old, backup)
    write_json(PUBLIC / "evaluation.json", evaluation)
    write_json(PUBLIC / "manifest.json", manifest)
    print(json.dumps({"phase": "repair_complete", "format": lock["format"], "ready": readiness["passed"], "test": report, "source_test": sources, "selective": selective, "reference_comparison": reference_comparison}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["protocol", "prepare", "evaluate", "all"])
    args = parser.parse_args()
    setup()
    if args.phase == "protocol": protocol()
    if args.phase in {"prepare", "all"}: prepare()
    if args.phase in {"evaluate", "all"}: evaluate()


if __name__ == "__main__":
    main()
