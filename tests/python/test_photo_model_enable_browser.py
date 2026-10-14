"""Synthetic release-integrity tests; no real images, weights or inference."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import photo_model_enable_browser as release


class BrowserReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.model, self.data, self.public = self.root / "models/photo-v2", self.root / "data/photo-v2", self.root / "public/model-photo"
        for path in [self.model, self.data / "browser-qa", self.public, self.root / "lib"]:
            path.mkdir(parents=True, exist_ok=True)
        for name, value in [("ROOT", self.root), ("MODEL", self.model), ("DATA", self.data), ("PUBLIC", self.public)]:
            patcher = mock.patch.object(release, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.protocol = {"purpose": "Synthetic arithmetic/provenance fixture, never model-performance evidence",
                         "maximum_absolute_tensor_error": .000001, "maximum_absolute_logit_error": .005}
        self.preprocessing = "d" * 64
        protocol_patch = mock.patch.object(release, "registered_browser_protocol", return_value=self.protocol)
        fingerprint_patch = mock.patch.object(release, "preprocessing_fingerprint", return_value=self.preprocessing)
        protocol_patch.start()
        fingerprint_patch.start()
        self.addCleanup(protocol_patch.stop)
        self.addCleanup(fingerprint_patch.stop)
        self.prepare()
        self.verify = mock.patch.object(release, "verify_repair", side_effect=lambda: (self.source, self.lock, self.data / "synthetic.onnx"))
        self.verifier = self.verify.start()
        self.addCleanup(self.verify.stop)

    def write(self, path, value):
        path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    def prepare(self, ready=True):
        minimums = dict(release.MINIMUMS)
        measured = {"macro_f1": .7, "balanced_accuracy": .8, "acne_recall": .8, "dermatitis_recall": .75}
        readiness = {"minimums": minimums, "measured": measured, "passed": ready,
                     "benchmark_minimums_passed": True, "sufficient_supported_class_samples": ready,
                     "scin_dermatitis_recall_minimum_passed": True, "independent_holdout": True,
                     "blocked_by_previously_examined_test": False, "clinical_validation": False}
        self.source = {"version": release.MODEL_VERSION, "lock": {"head_sha256": "a" * 64}, "temperature": 1.85,
                       "readiness": readiness, "test": {"n": 240, "macro_f1": .7, "balanced_accuracy": .8,
                       "per_class": {"acne": {"recall": .8}, "dermatitis": {"recall": .75}}},
                       "test_group_support": {"acne": 35 if ready else 29, "dermatitis": 60},
                       "source_test": {"SCIN": {"per_class": {"dermatitis": {"recall": .75}}}},
                       "selective": {"count": 60, "coverage": .25, "accuracy": .45},
                       "protocol": {"minimums": minimums, "score_threshold": .65, "margin_threshold": .15}}
        self.lock = {"format": "float32", "temperature": 1.85, "onnx": {"sha256": "b" * 64, "bytes": 123,
                     "parts": [{"url": "/model-photo/model.part-1.bin", "bytes": 123, "sha256": "b" * 64}]}}
        self.write(self.model / "evaluation.json", self.source)
        self.write(self.model / "deployment-repair-lock.json", self.lock)
        self.write(self.model / "test-lock.json", {"purpose": "Synthetic original test lock"})
        self.write(self.model / "deployment-repair-protocol.json", {"purpose": "Synthetic repair protocol"})
        self.write(self.model / "browser-verification-protocol.json", self.protocol)
        test_lock = {"repair_lock_sha256": release.sha256(self.model / "deployment-repair-lock.json"),
                     "original_test_lock_sha256": release.sha256(self.model / "test-lock.json")}
        self.write(self.model / "deployment-repair-test-lock.json", test_lock)
        deployment = {"format": "float32", "onnx_sha256": self.lock["onnx"]["sha256"], "onnx_bytes": 123,
                      "artifact_benchmark_passed": ready, "onnx_verified": True, "preprocessing_verified": True, "browser_verified": False}
        self.evaluation = {**copy.deepcopy(self.source), "repair_lock": self.lock, "repair_test_lock": test_lock, "deployment_validation": deployment}
        self.write(self.model / "deployment-evaluation.json", self.evaluation)
        (self.root / "lib/browser-inference.ts").write_text("// Synthetic preprocessing-source fixture\n", encoding="utf-8")
        original = self.data / "original.bin"
        original.write_bytes(b"Synthetic original image bytes; no personal or real image data")
        original_hash = release.sha256(original)
        rows = [{"id": f"synthetic-{index}", "split": "validation", "source": "SCIN", "images": [{"local_path": "data/photo-v2/original.bin", "source_sha256": original_hash}]} for index in range(12)]
        self.write(self.data / "combined-cohort.json", {"records": rows})
        image, tensor = self.data / "browser-qa/pixels.png", self.data / "browser-qa/tensor.f32"
        image.write_bytes(b"Synthetic canonical image bytes, not decoded in integrity tests")
        tensor.write_bytes(b"\0" * (3 * 224 * 224 * 4))
        reference_samples = [{"id": row["id"], "source": "SCIN", "split": "validation", "original_image_sha256": original_hash,
                              "image": {"filename": image.name, "sha256": release.sha256(image), "dimensions": [224, 224]},
                              "tensor": {"filename": tensor.name, "sha256": release.sha256(tensor), "shape": [1, 3, 224, 224]},
                              "logits": [1., 2., 3.]} for row in rows]
        binding = {"repair_lock_sha256": release.sha256(self.model / "deployment-repair-lock.json"),
                   "evaluation_sha256": release.sha256(self.model / "deployment-evaluation.json"),
                   "cohort_sha256": release.sha256(self.data / "combined-cohort.json"), "head_sha256": self.source["lock"]["head_sha256"],
                   "preprocessing_sha256": self.preprocessing, "browser_preprocessing_source_sha256": release.sha256(self.root / "lib/browser-inference.ts"),
                   "protocol_sha256": release.sha256(self.model / "browser-verification-protocol.json"), "onnx_sha256": self.lock["onnx"]["sha256"]}
        reference = {"binding": binding, "protocol": self.protocol, "model_version": release.MODEL_VERSION, "temperature": 1.85,
                     "onnx": self.lock["onnx"], "samples": reference_samples}
        self.write(self.data / "browser-qa/reference.json", reference)
        error = abs(3.0002 - 3.)
        samples = [{"id": item["id"], "source": "SCIN", "split": "validation", "original_image_sha256": original_hash,
                    "pytorch_logits": item["logits"], "browser_logits": [1.0001, 2., 3.0002],
                    "maximum_absolute_tensor_error": 1e-7, "maximum_absolute_logit_error": error, "matching_top_label": True} for item in reference_samples]
        report = {"passed": True, "binding": binding, "protocol": self.protocol, "model_version": release.MODEL_VERSION,
                  "reference_sha256": release.sha256(self.data / "browser-qa/reference.json"), "n": 12, "samples": samples,
                  "runtime": {"engine": "Chromium WASM", "threads": 1, "browser_version": "synthetic", "onnxruntime_web_version": "synthetic"},
                  "maximum_absolute_tensor_error": 1e-7, "maximum_absolute_logit_error": error, "matching_top_labels": True,
                  "image_posts": 0, "unexpected_requests": []}
        self.write(self.model / "browser-parity.json", report)
        self.write(self.public / "evaluation.json", self.evaluation)
        self.write(self.public / "manifest.json", {"version": release.MODEL_VERSION, "onnx": self.lock["onnx"], "temperature": 1.85,
                   "readiness": readiness, "input_size": 224, "supported_image_type": "clinical_photo", "classes": [{"id": key} for key in ["acne", "dermatitis", "other"]],
                   "deployment_validation": deployment, "available": ready})

    def mutate_report(self, mutate):
        path = self.model / "browser-parity.json"
        value = release.read_json(path)
        mutate(value)
        self.write(path, value)

    def test_finalization_changes_only_two_public_copies_and_is_idempotent(self):
        originals = {path: release.sha256(path) for path in self.model.glob("*.json")}
        result = release.finalize()
        self.assertTrue(result["available"])
        self.assertFalse(result["condition_product_matching"])
        self.assertEqual((result["accepted_correct"], result["accepted_count"]), (27, 60))
        for path in [self.public / "manifest.json", self.public / "evaluation.json"]:
            deployed = release.read_json(path)["deployment_validation"]
            self.assertTrue(deployed["browser_verified"])
            self.assertEqual(deployed["browser_verification"]["report_sha256"], release.sha256(self.model / "browser-parity.json"))
            self.assertIn("not a pretuned", deployed["condition_product_matching_restriction"]["policy_timing"])
        self.assertEqual(originals, {path: release.sha256(path) for path in self.model.glob("*.json")})
        self.assertEqual(result, release.finalize())

    def test_check_only_does_not_edit_any_files(self):
        before = {path: release.sha256(path) for path in self.root.rglob("*") if path.is_file()}
        self.assertEqual(release.finalize(check_only=True)["phase"], "browser_release_checked")
        self.assertEqual(before, {path: release.sha256(path) for path in self.root.rglob("*") if path.is_file()})

    def test_missing_actual_report_fails_before_loading_provenance_or_model(self):
        (self.model / "browser-parity.json").unlink()
        with self.assertRaisesRegex(RuntimeError, "Complete immutable"):
            release.finalize()
        self.verifier.assert_not_called()

    def test_repair_verification_failure_cannot_edit_public_files(self):
        before = release.sha256(self.public / "manifest.json")
        self.verifier.side_effect = RuntimeError("changed immutable repair")
        with self.assertRaisesRegex(RuntimeError, "changed immutable repair"):
            release.finalize()
        self.assertEqual(before, release.sha256(self.public / "manifest.json"))

    def test_exact_fixed_validation_order_is_required(self):
        self.mutate_report(lambda value: value["samples"].reverse())
        with self.assertRaisesRegex(RuntimeError, "fixed first12"):
            release.finalize()

    def test_recomputes_logits_instead_of_trusting_claimed_error_or_pass(self):
        self.mutate_report(lambda value: value["samples"][0]["browser_logits"].__setitem__(2, 3.1))
        with self.assertRaisesRegex(RuntimeError, "Recomputed browser parity"):
            release.finalize()

    def test_nonfinite_logits_cannot_be_enabled(self):
        self.mutate_report(lambda value: value["samples"][0]["browser_logits"].__setitem__(2, float("nan")))
        with self.assertRaisesRegex(RuntimeError, "Nonfinite"):
            release.finalize()

    def test_close_logits_still_require_recomputed_matching_top_labels(self):
        reference_path = self.data / "browser-qa/reference.json"
        reference = release.read_json(reference_path)
        reference["samples"][0]["logits"] = [1., 1.0001, 0.]
        self.write(reference_path, reference)
        def change(value):
            value["reference_sha256"] = release.sha256(reference_path)
            value["samples"][0].update(pytorch_logits=[1., 1.0001, 0.], browser_logits=[1.0002, 1.0001, 0.], maximum_absolute_logit_error=abs(1.0002 - 1.))
        self.mutate_report(change)
        with self.assertRaisesRegex(RuntimeError, "Recomputed browser parity"):
            release.finalize()

    def test_non_numeric_or_wrong_shape_logits_are_rejected(self):
        for logits in [[True, 2., 3.], [1., 2.], "123"]:
            with self.subTest(logits=logits):
                self.prepare()
                self.mutate_report(lambda value: value["samples"][0].update(browser_logits=logits))
                with self.assertRaisesRegex(RuntimeError, "finite three-class"):
                    release.finalize()

    def test_transport_and_runtime_must_match_actual_local_browser_policy(self):
        for mutation in [lambda value: value.update(image_posts=1), lambda value: value.update(unexpected_requests=["https://example.invalid"]),
                         lambda value: value["runtime"].update(threads=2), lambda value: value["runtime"].update(engine="PyTorch"), lambda value: value.update(passed=False)]:
            with self.subTest(mutation=mutation):
                self.prepare()
                self.mutate_report(mutation)
                with self.assertRaisesRegex(RuntimeError, "Actual local browser"):
                    release.finalize()

    def test_aggregate_parity_must_reconstruct_sample_measurements(self):
        self.mutate_report(lambda value: value.update(maximum_absolute_logit_error=0))
        with self.assertRaisesRegex(RuntimeError, "aggregate parity"):
            release.finalize()

    def test_tensor_parity_must_be_finite_and_within_registered_tolerance(self):
        self.mutate_report(lambda value: value["samples"][0].update(maximum_absolute_tensor_error=.000001))
        with self.assertRaisesRegex(RuntimeError, "Recomputed browser parity"):
            release.finalize()

    def test_changed_preprocessing_source_is_not_a_verified_release(self):
        (self.root / "lib/browser-inference.ts").write_text("// Changed implementation", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "bound to this model"):
            release.finalize()

    def test_model_evaluation_and_protocol_hash_bindings_are_required(self):
        for key in ["repair_lock_sha256", "evaluation_sha256", "cohort_sha256", "head_sha256", "preprocessing_sha256", "browser_preprocessing_source_sha256", "protocol_sha256", "onnx_sha256"]:
            with self.subTest(key=key):
                self.prepare()
                self.mutate_report(lambda value: value["binding"].update({key: "0" * 64}))
                with self.assertRaisesRegex(RuntimeError, "bound to this model"):
                    release.finalize()

    def test_original_and_canonical_inputs_are_hash_bound(self):
        for filename in [self.data / "original.bin", self.data / "browser-qa/pixels.png", self.data / "browser-qa/tensor.f32"]:
            with self.subTest(filename=filename):
                self.prepare()
                filename.write_bytes(b"changed")
                with self.assertRaisesRegex(RuntimeError, "changed"):
                    release.finalize()

    def test_repair_test_lock_is_not_rewritten_or_ignored(self):
        self.write(self.model / "deployment-repair-test-lock.json", {"repair_lock_sha256": "0" * 64, "original_test_lock_sha256": "0" * 64})
        with self.assertRaisesRegex(RuntimeError, "immutable model locks"):
            release.finalize()

    def test_public_copies_cannot_hide_an_unrelated_model_or_metrics(self):
        self.write(self.public / "evaluation.json", {**self.evaluation, "temperature": 99})
        with self.assertRaisesRegex(RuntimeError, "Public evaluation differs"):
            release.finalize()

    def test_browser_parity_cannot_override_a_failed_original_gate(self):
        self.prepare(ready=False)
        result = release.finalize()
        self.assertTrue(result["browser_verified"])
        self.assertFalse(result["available"])
        self.assertFalse(release.read_json(self.public / "manifest.json")["available"])


if __name__ == "__main__":
    unittest.main()
