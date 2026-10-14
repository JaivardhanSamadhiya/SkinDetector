"""Network-free category-training integrity tests, not model performance evidence.

Synthetic features verify taxonomy, rejection, protocol and holdout isolation.
No real heldout image is inferred or scored by these tests.
"""
from __future__ import annotations

import contextlib
import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import photo_categories_train as subject


class CategoryTaxonomyTests(unittest.TestCase):
    def test_exact_source_maps_have_no_overlaps(self):
        self.assertEqual(len(subject.CLASSES), 14)
        self.assertEqual(len(set(subject.CLASSES)), 14)
        for source in ["fitz", "scin"]:
            subject.source_lookup(source)

    def test_similarly_named_disorders_do_not_inherit_cosmetic_mapping(self):
        for label in ["acrodermatitis enteropathica", "perioral dermatitis", "factitial dermatitis", "seborrheic dermatitis", "neurodermatitis"]:
            with self.subTest(label=label):
                self.assertEqual(subject.classify_source({"source": "Fitzpatrick17k-C", "source_label": label}), "other")
        for label in ["Urticarial vasculitis", "Lichen sclerosus", "Atypical Nevus", "Infected eczema"]:
            with self.subTest(label=label):
                self.assertEqual(subject.classify_source({"source": "SCIN", "source_differential": {label: 1.}}), "other")

    def test_acne_and_cancer_taxonomy_is_explicit(self):
        for label, target in {"acne vulgaris": "acne", "lentigo maligna": "melanoma", "basal cell carcinoma morpheiform": "basal_cell_carcinoma", "squamous cell carcinoma": "squamous_cell_carcinoma"}.items():
            self.assertEqual(subject.classify_source({"source": "Fitzpatrick17k-C", "source_label": label}), target)

    def test_differential_aggregation_keeps_only_unique_majority_category(self):
        self.assertEqual(subject.classify_source({"source": "SCIN", "source_differential": {"Eczema": .3, "Acute and chronic dermatitis": .3, "Psoriasis": .4}}), "dermatitis")
        for differential in [{"Acne": .5, "Rosacea": .5}, {"Acne": .4, "Rosacea": .35, "Psoriasis": .25}, {}, {"Acne": float("nan")}, {"Acne": 1.5}, {"Acne": -.1, "Rosacea": 1.1}]:
            with self.subTest(differential=differential):
                self.assertIsNone(subject.classify_source({"source": "SCIN", "source_differential": differential}))

    def test_finer_label_conflicting_duplicate_groups_are_entirely_removed(self):
        rows = [
            {"id": "a", "source": "Fitzpatrick17k-C", "source_label": "psoriasis", "split": "test", "duplicate_group": "shared"},
            {"id": "b", "source": "Fitzpatrick17k-C", "source_label": "rosacea", "split": "test", "duplicate_group": "shared"},
            {"id": "c", "source": "Fitzpatrick17k-C", "source_label": "acne", "split": "validation", "duplicate_group": "unique"},
        ]
        with patch.object(subject, "cohort", return_value={"records": rows}), patch.object(subject, "sha256", return_value="cohort-hash"):
            retained, summary = subject.category_cohort()
        self.assertEqual(set(retained), {"c"})
        self.assertEqual(retained["c"]["split"], "validation")
        self.assertEqual(summary["finer_category_conflict_ids"], ["a", "b"])


class CategoryMetricsTests(unittest.TestCase):
    def test_report_has_actual_confusion_counts_and_missing_class_intervals(self):
        y = np.asarray([0, 0, 1, 1])
        p = np.full((4, 14), .001)
        p[range(4), [0, 1, 1, 1]] = .987
        p /= p.sum(axis=1, keepdims=True)
        items = [{"duplicate_group": str(i), "source": "SCIN"} for i in range(4)]
        report = subject.metrics(y, p, items)
        self.assertEqual(report["accuracy"], .75)
        self.assertEqual(report["per_class"]["acne"]["precision"], 1.)
        self.assertEqual(report["per_class"]["acne"]["recall"], .5)
        self.assertEqual(report["per_class"]["dermatitis"]["predicted_count"], 3)
        self.assertIsNone(report["per_class"]["other"]["recall_wilson95"])
        self.assertFalse(subject.supported_classes(report)["acne"]["benchmark_minimums_passed"])

    def test_group_support_not_duplicate_image_count_controls_support(self):
        y = np.zeros(40, dtype=int)
        p = np.full((40, 14), .0001)
        p[:, 0] = .9987
        items = [{"duplicate_group": "same-case", "source": "SCIN"} for _ in y]
        report = subject.metrics(y, p, items)
        self.assertEqual(report["per_class"]["acne"]["support"], 40)
        self.assertEqual(report["per_class"]["acne"]["independent_group_support"], 1)
        self.assertFalse(subject.supported_classes(report)["acne"]["benchmark_minimums_passed"])

    def test_perfect_lesion_score_still_requires_professional_review(self):
        report = {"per_class": {key: {"precision": 1., "recall": 1., "independent_group_support": 40} for key in subject.CLASSES}}
        readiness = subject.supported_classes(report)
        for key in subject.LESION_REVIEW:
            self.assertTrue(readiness[key]["benchmark_minimums_passed"])
            self.assertTrue(readiness[key]["professional_review_always"])
            self.assertFalse(readiness[key]["cosmetic_matching_category"])
            self.assertFalse(readiness[key]["clinically_validated"])
        self.assertFalse(readiness["other"]["benchmark_minimums_passed"])


class CategoryProtocolTests(unittest.TestCase):
    def test_protocol_cannot_be_relaxed_after_registration(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "protocol.json"
            with patch.object(subject, "PROTOCOL_PATH", path):
                registered = subject.protocol()
                self.assertEqual(subject.protocol(), registered)
                altered = copy.deepcopy(registered)
                altered["minimums_per_category"]["precision"] = .1
                path.write_text(json.dumps(altered), encoding="utf-8")
                with self.assertRaisesRegex(RuntimeError, "protocol changed"):
                    subject.protocol()

    def test_fit_refuses_after_related_test_or_selection_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch.multiple(subject, MODEL=root, TEST_LOCK_PATH=root / "categories-test-lock.json", SELECTION_PATH=root / "categories-selection-lock.json"), patch.object(subject, "category_features") as features:
                for name in ["test-lock.json", "categories-test-lock.json", "categories-selection-lock.json"]:
                    file = root / name
                    file.write_text("{}", encoding="utf-8")
                    with self.assertRaisesRegex(RuntimeError, "fitting is prohibited"):
                        subject.fit("dinov2_vits14")
                    file.unlink()
                features.assert_not_called()

    def test_final_evaluation_refuses_without_explicit_selection_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(subject, "SELECTION_PATH", Path(folder) / "absent.json"), patch.object(subject, "category_features") as features:
                with self.assertRaisesRegex(RuntimeError, "Explicitly lock"):
                    subject.evaluate()
                features.assert_not_called()

    def test_changed_test_features_cannot_affect_fitting_or_calibration(self):
        # Deliberately synthetic separable features: checks data flow only.
        items, vectors = [], []
        for split, views in [("train", 2), ("validation", 1), ("test", 1)]:
            for index, category in enumerate(subject.CLASSES):
                for view in range(views):
                    case = split + str(index)
                    items.append({"id": case, "category": category, "source": "synthetic", "duplicate_group": case, "split": split, "views": views})
                    vectors.append(np.eye(14, dtype=np.float32)[index] * (1. + view * .01))
        x = np.stack(vectors)
        summary = {"category_assignment_sha256": "synthetic-category-hash"}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            patches = dict(MODEL=root, TEST_LOCK_PATH=root / "categories-test-lock.json", SELECTION_PATH=root / "selection.json")
            with patch.multiple(subject, **patches), patch.object(subject, "artifact_identity", return_value={"fixture": True}), contextlib.redirect_stdout(io.StringIO()):
                with patch.object(subject, "category_features", return_value=(items, x, {}, summary)):
                    subject.fit("dinov2_vits14")
                with np.load(subject.head_path("dinov2_vits14"), allow_pickle=False) as saved:
                    first = {key: saved[key].copy() for key in saved.files}
                changed = x.copy()
                changed[[item["split"] == "test" for item in items]] = 10_000.
                with patch.object(subject, "category_features", return_value=(items, changed, {}, summary)):
                    subject.fit("dinov2_vits14")
                with np.load(subject.head_path("dinov2_vits14"), allow_pickle=False) as saved:
                    for key in first:
                        np.testing.assert_array_equal(saved[key], first[key], err_msg="Holdout affected " + key)


if __name__ == "__main__":
    unittest.main()
