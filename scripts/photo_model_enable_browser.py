"""Finalize public photo-model copies after genuine, locked browser verification.

This runs no inference, training, calibration or threshold search. Immutable
evaluation and selection records stay unchanged. Browser numerical parity does
not authorize condition-based product matching or establish clinical accuracy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "models/photo-v2"
DATA = ROOT / "data/photo-v2"
PUBLIC = ROOT / "public/model-photo"
MINIMUMS = {"macro_f1": .6, "balanced_accuracy": .6, "acne_recall": .5, "dermatitis_recall": .5}
MODEL_VERSION = "skinsnap-photo-dinov2-v2"


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path):
    def invalid_constant(value):
        raise RuntimeError("Nonfinite JSON value: " + value)
    return json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=invalid_constant)


def verify_repair():
    # Lazy imports keep synthetic provenance tests independent of Torch/ONNX.
    from photo_model_deployment_repair import verify_repair as verify
    return verify()


def preprocessing_fingerprint():
    from photo_model_common import preprocessing_fingerprint as fingerprint
    return fingerprint()


def registered_browser_protocol():
    from photo_browser_verify import PROTOCOL
    return PROTOCOL


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def close(left, right):
    return finite(left) and finite(right) and math.isclose(left, right, rel_tol=0, abs_tol=1e-9)


def checked_reference_file(item, suffix):
    filename = item["filename"]
    if not isinstance(filename, str) or Path(filename).name != filename or not filename.endswith(suffix):
        raise RuntimeError("Browser reference filename escapes the registered directory.")
    path = (DATA / "browser-qa" / filename).resolve()
    if not path.is_relative_to((DATA / "browser-qa").resolve()) or sha256(path) != item["sha256"]:
        raise RuntimeError("Canonical browser verification input changed.")
    return path


def measured_gates_passed(evaluation):
    readiness, test = evaluation["readiness"], evaluation["test"]
    if readiness["minimums"] != MINIMUMS or evaluation["protocol"]["minimums"] != MINIMUMS:
        raise RuntimeError("Original research minimums changed.")
    if evaluation["protocol"]["score_threshold"] != .65 or evaluation["protocol"]["margin_threshold"] != .15:
        raise RuntimeError("Original uncertainty thresholds changed.")
    measured = {"macro_f1": test["macro_f1"], "balanced_accuracy": test["balanced_accuracy"],
                "acne_recall": test["per_class"]["acne"]["recall"], "dermatitis_recall": test["per_class"]["dermatitis"]["recall"]}
    if not all(finite(value) and 0 <= value <= 1 and close(readiness["measured"][key], value) for key, value in measured.items()):
        raise RuntimeError("Readiness measurements differ from evaluation.")
    numeric = all(measured[key] >= minimum for key, minimum in MINIMUMS.items())
    groups = all(evaluation["test_group_support"][key] >= 30 for key in ["acne", "dermatitis"])
    scin = evaluation["source_test"]["SCIN"]["per_class"]["dermatitis"]["recall"] >= .5
    passed = numeric and groups and scin and readiness["independent_holdout"] is True and readiness["blocked_by_previously_examined_test"] is False
    if (readiness["clinical_validation"] is not False or readiness["benchmark_minimums_passed"] is not numeric
            or readiness["sufficient_supported_class_samples"] is not groups
            or readiness["scin_dermatitis_recall_minimum_passed"] is not scin or readiness["passed"] is not passed):
        raise RuntimeError("Readiness flags differ from the unchanged original gates.")
    return passed


def validate_evidence(source, lock, evaluation):
    protocol = read_json(MODEL / "browser-verification-protocol.json")
    if protocol != registered_browser_protocol():
        raise RuntimeError("Browser protocol differs from its predeclared implementation.")
    binding = {
        "repair_lock_sha256": sha256(MODEL / "deployment-repair-lock.json"),
        "evaluation_sha256": sha256(MODEL / "deployment-evaluation.json"),
        "cohort_sha256": sha256(DATA / "combined-cohort.json"), "head_sha256": source["lock"]["head_sha256"],
        "preprocessing_sha256": preprocessing_fingerprint(),
        "browser_preprocessing_source_sha256": sha256(ROOT / "lib/browser-inference.ts"),
        "protocol_sha256": sha256(MODEL / "browser-verification-protocol.json"), "onnx_sha256": lock["onnx"]["sha256"],
    }
    reference_path, report_path = DATA / "browser-qa/reference.json", MODEL / "browser-parity.json"
    reference, report = read_json(reference_path), read_json(report_path)
    rows = [row for row in read_json(DATA / "combined-cohort.json")["records"] if row["split"] == "validation"][:12]
    if len(rows) != 12 or len({row["id"] for row in rows}) != 12 or [item["id"] for item in reference["samples"]] != [row["id"] for row in rows] or [item["id"] for item in report["samples"]] != [row["id"] for row in rows]:
        raise RuntimeError("Browser verification did not use the fixed first12 validation cases.")
    if (reference["binding"] != binding or report["binding"] != binding or reference["protocol"] != protocol or report["protocol"] != protocol
            or reference["onnx"] != lock["onnx"] or reference["temperature"] != lock["temperature"]
            or reference["model_version"] != source["version"] or report["model_version"] != source["version"] or source["version"] != MODEL_VERSION
            or evaluation["version"] != source["version"] or report["reference_sha256"] != sha256(reference_path)):
        raise RuntimeError("Browser verification is not bound to this model, evaluation and preprocessing.")
    runtime = report["runtime"]
    if (report["passed"] is not True or report["n"] != 12 or report["image_posts"] != 0 or report["unexpected_requests"] != []
            or runtime["engine"] != "Chromium WASM" or runtime["threads"] != 1
            or not isinstance(runtime["browser_version"], str) or not runtime["browser_version"]
            or not isinstance(runtime["onnxruntime_web_version"], str) or not runtime["onnxruntime_web_version"]):
        raise RuntimeError("Actual local browser verification did not pass.")
    logit_errors, tensor_errors = [], []
    for row, expected, actual in zip(rows, reference["samples"], report["samples"]):
        image = row["images"][0]
        original = (ROOT / image["local_path"]).resolve()
        if not original.is_relative_to((ROOT / "data").resolve()) or sha256(original) != image["source_sha256"]:
            raise RuntimeError("Original verification image changed.")
        if any(sample["split"] != "validation" or sample["source"] != row["source"] or sample["original_image_sha256"] != image["source_sha256"] for sample in [expected, actual]):
            raise RuntimeError("Browser sample provenance differs from the cohort.")
        checked_reference_file(expected["image"], ".png")
        tensor = checked_reference_file(expected["tensor"], ".f32")
        if expected["tensor"]["shape"] != [1, 3, 224, 224] or tensor.stat().st_size != 3 * 224 * 224 * 4:
            raise RuntimeError("Canonical tensor shape or byte length changed.")
        left, right = expected["logits"], actual["browser_logits"]
        if not isinstance(left, list) or not isinstance(right, list) or len(left) != 3 or len(right) != 3 or not all(finite(value) for value in [*left, *right]):
            raise RuntimeError("Browser and reference logits must be finite three-class lists.")
        error = max(abs(a - b) for a, b in zip(left, right))
        top_matches = max(range(3), key=left.__getitem__) == max(range(3), key=right.__getitem__)
        tensor_error = actual["maximum_absolute_tensor_error"]
        if (actual["pytorch_logits"] != left or not close(actual["maximum_absolute_logit_error"], error)
                or error >= protocol["maximum_absolute_logit_error"] or actual["matching_top_label"] is not top_matches or not top_matches
                or not finite(tensor_error) or not 0 <= tensor_error < protocol["maximum_absolute_tensor_error"]):
            raise RuntimeError("Recomputed browser parity failed; stored pass flags cannot override it.")
        logit_errors.append(error)
        tensor_errors.append(tensor_error)
    if not close(report["maximum_absolute_logit_error"], max(logit_errors)) or not close(report["maximum_absolute_tensor_error"], max(tensor_errors)) or report["matching_top_labels"] is not True:
        raise RuntimeError("Browser aggregate parity differs from its sample evidence.")
    return {"report_path": "models/photo-v2/browser-parity.json", "report_sha256": sha256(report_path), **binding,
            "reference_sha256": report["reference_sha256"],
            "n": 12, "maximum_absolute_logit_error": max(logit_errors), "maximum_absolute_tensor_error": max(tensor_errors), "runtime": runtime}


def finalize(check_only=False):
    required = ["deployment-evaluation.json", "deployment-repair-test-lock.json", "browser-parity.json", "browser-verification-protocol.json", "deployment-repair-protocol.json"]
    if any(not (MODEL / filename).is_file() for filename in required):
        raise RuntimeError("Complete immutable deployment evaluation and actual browser parity before enabling inference.")
    source, lock, _ = verify_repair()
    evaluation = read_json(MODEL / "deployment-evaluation.json")
    test_lock = read_json(MODEL / "deployment-repair-test-lock.json")
    if (evaluation["repair_lock"] != lock or evaluation["lock"] != source["lock"] or evaluation["temperature"] != lock["temperature"]
            or evaluation["repair_test_lock"] != test_lock or test_lock["repair_lock_sha256"] != sha256(MODEL / "deployment-repair-lock.json")
            or test_lock["original_test_lock_sha256"] != sha256(MODEL / "test-lock.json")):
        raise RuntimeError("Deployment evaluation differs from its immutable model locks.")
    evidence = validate_evidence(source, lock, evaluation)
    original_passed, artifact_passed = measured_gates_passed(source), measured_gates_passed(evaluation)
    deployment = evaluation["deployment_validation"]
    if (deployment["format"] != lock["format"] or deployment["onnx_sha256"] != lock["onnx"]["sha256"]
            or deployment["onnx_bytes"] != lock["onnx"]["bytes"] or deployment["artifact_benchmark_passed"] is not artifact_passed
            or deployment["onnx_verified"] is not True or deployment["preprocessing_verified"] is not True or deployment["browser_verified"] is not False):
        raise RuntimeError("Immutable artifact verification differs from its locked evaluation.")
    selective = source["selective"]
    count, accuracy = selective["count"], selective["accuracy"]
    if (not isinstance(count, int) or isinstance(count, bool) or not 1 <= count <= source["test"]["n"]
            or not finite(accuracy) or not 0 <= accuracy <= 1 or not close(count * accuracy, round(count * accuracy))
            or not close(selective["coverage"], count / source["test"]["n"])):
        raise RuntimeError("Original accepted-subset product-policy evidence is inconsistent.")
    restriction = {"reason": "Accepted photo labels are not reliable enough to select products for a detected condition; use preferences and general-care constraints.",
                   "evaluation_path": "models/photo-v2/evaluation.json", "evaluation_sha256": sha256(MODEL / "evaluation.json"),
                   "accepted_correct": round(count * accuracy), "accepted_count": count, "accepted_accuracy": accuracy,
                   "policy_timing": "Product-policy restriction after reviewing measured errors; not a pretuned model-selection or release gate.", "clinical_validation": False}
    released_deployment = {**deployment, "browser_verified": True, "browser_verification": evidence,
                           "condition_product_matching": False, "condition_product_matching_restriction": restriction}
    released_evaluation = {**evaluation, "deployment_validation": released_deployment, "available": original_passed and artifact_passed}
    current_evaluation, manifest = read_json(PUBLIC / "evaluation.json"), read_json(PUBLIC / "manifest.json")
    if current_evaluation not in [evaluation, released_evaluation]:
        raise RuntimeError("Public evaluation differs from the immutable report or this exact verified release.")
    if (manifest["version"] != source["version"] or manifest["onnx"] != lock["onnx"] or manifest["temperature"] != lock["temperature"]
            or manifest["readiness"] != evaluation["readiness"] or manifest["input_size"] != 224 or manifest["supported_image_type"] != "clinical_photo"
            or [item["id"] for item in manifest["classes"]] != ["acne", "dermatitis", "other"]
            or manifest["deployment_validation"] not in [deployment, released_deployment]):
        raise RuntimeError("Public manifest differs from the locked model and deployment evidence.")
    released_manifest = {**manifest, "deployment_validation": released_deployment, "available": original_passed and artifact_passed}
    if not check_only:
        # Only generated public copies change. All model/evaluation locks and
        # browser evidence remain byte-identical; the manifest is written last.
        for path, value in [(PUBLIC / "evaluation.json", released_evaluation), (PUBLIC / "manifest.json", released_manifest)]:
            path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return {"phase": "browser_release_checked" if check_only else "browser_release_finalized", "available": released_manifest["available"],
            "browser_verified": True, "condition_product_matching": False, "browser_report_sha256": evidence["report_sha256"],
            "accepted_correct": restriction["accepted_correct"], "accepted_count": count}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="Verify actual evidence without editing public release copies")
    arguments = parser.parse_args()
    print(json.dumps(finalize(arguments.check_only)), flush=True)
