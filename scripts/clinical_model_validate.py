"""Meaningful reproducibility checks for the trained clinical research artifact.

Run after clinical_model_train.py: python scripts/clinical_model_validate.py
"""
import hashlib
import json
from pathlib import Path
import sys
import unittest

import numpy as np
from PIL import Image
import torch
from torchvision.models import mobilenet_v3_small
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).resolve().parent))
from clinical_model_train import ClinicalModel, MEAN, STD, bool_field, nearest_resize, preprocess, probabilities

ROOT = Path(__file__).resolve().parents[1]


class ClinicalPipelineChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(4)
        cls.manifest = json.loads((ROOT / "public/model-clinical/manifest.json").read_text())
        cls.evaluation = json.loads((ROOT / "models/clinical/evaluation.json").read_text())
        cls.cohort = json.loads((ROOT / "models/clinical/cohort.json").read_text())
        cls.demos = json.loads((ROOT / "public/demo-clinical/manifest.json").read_text())["images"]
        cls.session = ort.InferenceSession(str(ROOT / "public/model-clinical/model.onnx"), providers=["CPUExecutionProvider"])
        checkpoint = torch.load(ROOT / "models/clinical/checkpoint.pt", map_location="cpu", weights_only=True)
        cls.model = ClinicalModel(mobilenet_v3_small(weights=None).features, np.zeros((3, 576)), np.zeros(3)).eval()
        cls.model.load_state_dict(checkpoint["state_dict"], strict=True)

    def test_exact_center_nearest_mapping(self):
        source = np.zeros((3, 5, 3), dtype=np.uint8)
        source[:, :, 0] = np.arange(5)
        source[:, :, 1] = np.arange(3)[:, None]
        output = nearest_resize(Image.fromarray(source), 2)
        np.testing.assert_array_equal(output[:, :, 0], [[1, 3], [1, 3]])
        np.testing.assert_array_equal(output[:, :, 1], [[0, 0], [2, 2]])

    def test_alpha_white_compositing(self):
        image = Image.new("RGBA", (1, 1), (200, 40, 90, 0))
        np.testing.assert_array_equal(nearest_resize(image, 1), [[[255, 255, 255]]])

    def test_normalization_and_layout(self):
        output = preprocess(Image.new("RGB", (16, 8), (255, 0, 128)))
        self.assertEqual(output.shape, (3, 128, 128))
        self.assertEqual(output.dtype, np.float32)
        np.testing.assert_allclose(output[:, 3, 6], (np.array([1, 0, 128 / 255], dtype=np.float32) - MEAN) / STD, atol=1e-6)

    def test_loaded_model_real_output_and_cam_decomposition(self):
        with Image.open(ROOT / "public/demo-clinical/acne.png") as image:
            tensor = torch.from_numpy(preprocess(image)[None, :])
        with torch.inference_mode():
            logits, activations = self.model(tensor)
        self.assertEqual(tuple(logits.shape), (1, 3))
        self.assertEqual(tuple(activations.shape), (1, 576, 4, 4))
        self.assertTrue(torch.isfinite(logits).all())
        with torch.inference_mode():
            cam = torch.einsum("kc,nchw->nkhw", self.model.head.weight, activations)
            torch.testing.assert_close(cam.mean(dim=(2, 3)) + self.model.head.bias, logits, atol=1e-5, rtol=1e-5)

    def test_onnx_three_real_research_images_match_pytorch(self):
        for record in self.demos:
            with self.subTest(image=record["id"]):
                with Image.open(ROOT / "public" / record["path"].lstrip("/")) as image:
                    array = preprocess(image)[None, :]
                with torch.inference_mode():
                    pytorch_logits = self.model(torch.from_numpy(array))[0].numpy()
                onnx_logits = self.session.run(["logits"], {"image": array})[0]
                np.testing.assert_allclose(pytorch_logits, onnx_logits, atol=1e-4, rtol=1e-5)
                probs = probabilities(onnx_logits, self.manifest["temperature"])[0]
                np.testing.assert_allclose(probs, [record["scores"][key] for key in ["acne", "dermatitis", "other"]], atol=1e-5)

    def test_declared_artifact_sha256s_match(self):
        for path, expected in [(ROOT / "models/clinical/checkpoint.pt", self.manifest["checkpoint_sha256"]),
                               (ROOT / "public/model-clinical/model.onnx", self.manifest["onnx"]["sha256"])]:
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected)

    def test_case_and_duplicate_groups_are_disjoint(self):
        for field in ["case_id", "duplicate_group", "global_duplicate_group", "source_sha256", "pixel_sha256"]:
            sets = {split: {row[field] for row in self.cohort["rows"] if row["split"] == split} for split in ["train", "validation", "test"]}
            self.assertFalse(sets["train"] & sets["validation"], field)
            self.assertFalse(sets["train"] & sets["test"], field)
            self.assertFalse(sets["validation"] & sets["test"], field)

    def test_predeclared_gate_cannot_be_relaxed(self):
        readiness = self.manifest["readiness"]
        self.assertEqual(readiness["minimums"], {"macro_f1": .6, "balanced_accuracy": .6, "acne_recall": .5, "dermatitis_recall": .5})
        actual_pass = all(readiness["measured"][key] >= threshold for key, threshold in readiness["minimums"].items())
        self.assertEqual(readiness["benchmark_minimums_passed"], actual_pass)
        self.assertEqual(self.manifest["available"], actual_pass and readiness["independent_holdout"])
        self.assertFalse(readiness["independent_holdout"])
        self.assertFalse(self.manifest["available"])
        self.assertFalse(readiness["clinical_validation"])
        previous = json.loads((ROOT / "models/clinical/pre_audit_cohort.json").read_text())["rows"]
        prior_test = {row["case_id"] for row in previous if row["split"] == "test"}
        current_test = {row["case_id"] for row in self.cohort["rows"] if row["split"] == "test"}
        self.assertEqual(readiness["post_audit_test_overlap"], len(current_test & prior_test))
        self.assertGreater(readiness["post_audit_test_overlap"], 0)

    def test_other_always_rejected_and_correct_image_domain(self):
        self.assertEqual(self.manifest["supported_image_type"], "clinical_photo")
        self.assertEqual(self.manifest["uncertainty"]["always_reject_classes"], ["other"])
        self.assertEqual([item["id"] for item in self.manifest["classes"]], ["acne", "dermatitis", "other"])

    def test_sensitive_locations_excluded_and_demo_split_attributed(self):
        self.assertGreater(self.cohort["exclusions"]["sensitive_body_location"], 0)
        self.assertTrue(any(row["body_parts"] for row in self.cohort["rows"]))
        for row in self.cohort["rows"]:
            self.assertNotIn("genitalia_or_groin", row["body_parts"])
            self.assertNotIn("buttocks", row["body_parts"])
        for demo in self.demos:
            row = next(row for row in self.cohort["rows"] if row["case_id"] == demo["case_id"])
            self.assertEqual(demo["split"], "test")
            self.assertEqual(row["split"], "test")
            self.assertEqual(demo["source_differential"], row["source_differential"])
            self.assertEqual(demo["body_parts"], row["body_parts"])
            self.assertEqual(demo["source_label"], row["target"])
            self.assertEqual(demo["license"], "SCIN Data Use License")
            self.assertIn("not selected by output", demo["selection"])
            self.assertIn("metadata", demo["selection"])
            self.assertTrue(demo["visual_audit"])
            self.assertTrue(demo["task_unavailable"])
            self.assertTrue(demo["modified"])
        acne = next(demo for demo in self.demos if demo["id"] == "acne")
        self.assertIn("cheek", acne["visual_audit"])

    def test_actual_scin_yes_no_boolean_schema(self):
        for value in ["YES", "yes", "True", "true", "1", "1.0"]:
            self.assertTrue(bool_field(value), value)
        for value in ["NO", "no", "False", "false", "", None, "0", "0.0"]:
            self.assertFalse(bool_field(value), value)


class RecordedResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.passed_checks = []

    def addSuccess(self, test):
        super().addSuccess(test)
        self.passed_checks.append(test.id().rsplit(".", 1)[-1])


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ClinicalPipelineChecks)
    result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
    manifest = json.loads((ROOT / "public/model-clinical/manifest.json").read_text())
    record = {"version": manifest["version"], "tests_run": result.testsRun, "successful": result.wasSuccessful(),
              "passed_checks": result.passed_checks, "failures": [test.id() for test, _ in result.failures],
              "errors": [test.id() for test, _ in result.errors], "checkpoint_sha256": manifest["checkpoint_sha256"],
              "onnx_sha256": manifest["onnx"]["sha256"],
              "scope": "Actual artifact and reproducibility checks; not clinical validation, an independent evaluation, or proof of product suitability."}
    (ROOT / "models/clinical/artifact_validation.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record))
    sys.exit(0 if result.wasSuccessful() else 1)
