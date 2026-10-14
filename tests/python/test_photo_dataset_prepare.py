"""Targeted data-integrity checks for expanded SCIN acquisition (no network)."""
from __future__ import annotations

import base64
import copy
import hashlib
import importlib.util
import io
from pathlib import Path
import random
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("photo_dataset_prepare", ROOT / "scripts/photo_dataset_prepare.py")
assert SPEC and SPEC.loader
prepare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare)


def image_view(key, value):
    return {"image_path": f"dataset/images/{key}.png", "source_sha256": f"source-{key}",
            "pixel_sha256": f"pixel-{key}", "gcs_md5": f"md5-{key}", "dhash": f"{value:016x}"}


def record(key, target, value):
    return {"case_id": key, "target": target, "images": [image_view(key, value)]}


class PhotoDatasetPreparationTests(unittest.TestCase):
    def test_released_yes_body_location_flags_are_excluded(self):
        cases = [{"case_id": "private", "body_parts_genitalia_or_groin": "YES",
                  "image_1_path": "dataset/images/private.png"}]
        labels = [{"case_id": "private", "weighted_skin_condition_label": "{'Acne': 1.0}"}]
        rows, excluded = prepare.candidates(cases, labels)
        self.assertEqual(rows, [])
        self.assertEqual(excluded["sensitive_body_location"], 1)
        self.assertTrue(prepare.bool_field("TRUE"))
        self.assertFalse(prepare.bool_field(""))

    def test_missing_first_view_keeps_later_valid_view_and_source_metadata(self):
        cases = [{"case_id": "second", "age_group": "AGE_UNKNOWN", "body_parts_head_or_neck": "YES",
                  "image_2_path": "dataset/images/second.png", "image_2_shot_type": "CLOSE_UP"}]
        labels = [{"case_id": "second", "weighted_skin_condition_label": "{'Acne': 0.75, 'Eczema': 0.25}",
                   "monk_skin_tone_label_us": "6", "monk_skin_tone_label_india": "7"}]
        rows, excluded = prepare.candidates(cases, labels)
        self.assertFalse(excluded)
        self.assertEqual(rows[0]["images"][0]["view_index"], 2)
        self.assertEqual(rows[0]["source_differential"]["Acne"], .75)
        self.assertEqual(rows[0]["body_parts"], ["head_or_neck"])
        self.assertEqual(rows[0]["monk_skin_tone_us"], "6")

    def test_unrecognized_child_age_category_is_excluded(self):
        rows, excluded = prepare.candidates(
            [{"case_id": "child", "age_group": "AGE_10_TO_17", "image_1_path": "a"}],
            [{"case_id": "child", "weighted_skin_condition_label": "{'Acne': 1}"}])
        self.assertEqual(rows, [])
        self.assertEqual(excluded["age_not_in_adult_source_categories"], 1)

    def test_explicit_broad_dermatitis_synonyms_are_combined(self):
        self.assertEqual(prepare.label_target({"Acute and chronic dermatitis": .6, "Eczema": .4}), "dermatitis")
        self.assertEqual(prepare.label_target({"Chronic dermatitis, NOS": .35, "Contact dermatitis, NOS": .35}), "dermatitis")
        self.assertEqual(prepare.label_target({"Lichenified eczematous dermatitis": 1}), "dermatitis")

    def test_named_mimics_do_not_become_eczema(self):
        for name in ["Seborrheic Dermatitis", "Perioral Dermatitis", "Infected eczema", "Dermatitis herpetiformis"]:
            with self.subTest(name=name):
                self.assertEqual(prepare.label_target({name: 1}), "other")
        self.assertIsNone(prepare.label_target({"Acne": .5, "Eczema": .5}))
        self.assertIsNone(prepare.label_target({"Acne": .4, "Rosacea": .6}))

    def test_global_duplicates_cross_excluded_intermediary_cases(self):
        cases = [{"case_id": "a", "image_1_path": "image-a"},
                 {"case_id": "excluded", "image_1_path": "image-b", "image_2_path": "image-c"},
                 {"case_id": "z", "image_1_path": "image-c"}]
        groups = prepare.global_duplicate_groups(cases, {"image-a": {"md5": "same"}, "image-b": {"md5": "same"}})
        self.assertEqual(len(set(groups.values())), 1)

    def test_all_views_participate_in_conflicting_duplicate_exclusion(self):
        a = record("a", "acne", 0)
        b = record("b", "dermatitis", 0xFFFFFFFFFFFFFFFF)
        b["images"].append(copy.deepcopy(a["images"][0]))
        rows, audit = prepare.split_records([a, b], {"a": "a", "b": "b"}, [])
        self.assertEqual(rows, [])
        self.assertEqual(audit["removed_conflicting_cases"], 2)

    def test_prior_near_duplicate_group_is_development_only(self):
        rows, _ = prepare.split_records([record("new", "acne", 3)], {"new": "new", "old": "old"},
                                        [{"case_id": "old", "dhash": "0000000000000000"}])
        self.assertEqual(rows[0]["split"], "train")
        self.assertTrue(rows[0]["previously_examined"])
        self.assertFalse(rows[0]["case_previously_examined"])
        self.assertIn("near_duplicate_of_previous_experiment", rows[0]["prior_exposure_reasons"])

    def test_global_group_propagates_prior_exposure(self):
        rows, _ = prepare.split_records([record("new", "dermatitis", 123)], {"new": "old", "old": "old"},
                                        [{"case_id": "old"}])
        self.assertEqual(rows[0]["split"], "train")
        self.assertIn("global_exact_group_in_previous_experiment", rows[0]["prior_exposure_reasons"])

    def test_split_is_deterministic_and_prior_cases_never_reused_for_validation(self):
        rng = random.Random(99)
        records = [record(str(i), "dermatitis", rng.getrandbits(64)) for i in range(21)]
        globals_ = {row["case_id"]: row["case_id"] for row in records}
        prior = [{"case_id": "0"}]
        first, audit = prepare.split_records(copy.deepcopy(records), globals_, prior)
        second, _ = prepare.split_records(copy.deepcopy(list(reversed(records))), globals_, prior)
        assignment = lambda rows: {r["case_id"]: r["split"] for r in rows}
        self.assertEqual(assignment(first), assignment(second))
        self.assertEqual(assignment(first)["0"], "train")
        self.assertEqual(sum(row["split"] == "test" for row in first), 4)
        self.assertEqual(sum(row["split"] == "validation" for row in first), 3)
        self.assertEqual(audit["fresh_groups_per_class"]["dermatitis"], 20)

    def test_corrupt_and_low_resolution_files_are_rejected(self):
        with self.assertRaises(Exception):
            prepare.inspect_image(b"not an image")
        for size in [(127, 300), (300, 127)]:
            buffer = io.BytesIO()
            Image.new("RGB", size).save(buffer, format="PNG")
            with self.assertRaisesRegex(ValueError, "minimum_resolution"):
                prepare.inspect_image(buffer.getvalue())

    def test_valid_decode_hashes_dimensions_and_source_md5(self):
        buffer = io.BytesIO()
        Image.new("RGB", (128, 256), "teal").save(buffer, format="PNG")
        raw = buffer.getvalue()
        info = prepare.inspect_image(raw)
        self.assertEqual((info["width"], info["height"]), (128, 256))
        self.assertEqual(info["source_sha256"], hashlib.sha256(raw).hexdigest())
        expected = base64.b64encode(hashlib.md5(raw).digest()).decode()
        self.assertTrue(prepare.md5_matches(raw, expected))
        self.assertFalse(prepare.md5_matches(raw + b"tampering", expected))
        self.assertFalse(prepare.md5_matches(raw, None))

    def test_protocol_never_claims_independent_acne_or_clinical_validation(self):
        protocol = prepare.make_protocol([])
        self.assertTrue(protocol["split"]["all_acne_cases_already_examined"])
        self.assertTrue(protocol["deployment"]["blocked_without_fresh_independent_acne_validation"])
        self.assertEqual(protocol["predeclared_minimum_exploratory_gates"],
                         {"macro_f1": .60, "balanced_accuracy": .60, "acne_recall": .50, "dermatitis_recall": .50})
        self.assertFalse(protocol["deployment"]["arbitrary_face_or_body_diagnosis_supported"])


if __name__ == "__main__":
    unittest.main()
