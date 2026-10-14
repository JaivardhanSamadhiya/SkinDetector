"""Synthetic, network-free tests for photo-v2 preprocessing and merge integrity.

No synthetic image or label here is a model evaluation example. Dataset paths are
redirected into TemporaryDirectory fixtures; real acquisition files are untouched.
"""
from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    # The merge script imports the shared script by its normal CLI module name.
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


common = load_script("photo_model_common")
merge = load_script("photo_dataset_merge")
prepare = load_script("photo_dataset_prepare")


class PhotoPreprocessingTests(unittest.TestCase):
    def test_tensor_dimensions_dtype_and_determinism(self):
        pixels = np.random.default_rng(517).integers(0, 256, (127, 391, 3), dtype=np.uint8)
        image = Image.fromarray(pixels)
        first = common.preprocess(image)
        second = common.preprocess(image)
        self.assertEqual(first.shape, (3, 224, 224))
        self.assertEqual(first.dtype, np.float32)
        self.assertTrue(first.flags.c_contiguous)
        self.assertTrue(np.isfinite(first).all())
        np.testing.assert_array_equal(first, second)
        np.testing.assert_array_equal(np.asarray(image), pixels)

    def test_whole_image_nearest_resize_uses_pixel_centers(self):
        pixels = np.arange(2 * 4 * 3, dtype=np.uint8).reshape(2, 4, 3)
        actual = common.resize_rgb(Image.fromarray(pixels), size=2)
        # Horizontal centers are 1 and 3; vertical centers are 0 and 1.
        np.testing.assert_array_equal(actual, pixels[:, [1, 3], :])
        self.assertEqual(actual.shape, (2, 2, 3))
        self.assertFalse(np.shares_memory(actual, pixels))

    def test_exif_clockwise_orientation_is_applied_once(self):
        pixels = np.array([
            [[255, 0, 0], [0, 255, 0], [0, 0, 255]],
            [[10, 20, 30], [40, 50, 60], [70, 80, 90]],
        ], dtype=np.uint8)
        image = Image.fromarray(pixels)
        image.getexif()[274] = 6
        oriented = common.rgb_image(image)
        self.assertEqual(oriented.size, (2, 3))
        np.testing.assert_array_equal(np.asarray(oriented), np.rot90(pixels, k=-1))
        np.testing.assert_array_equal(common.preprocess(image), common.preprocess(oriented))
        self.assertEqual(image.getexif()[274], 6)  # The caller's image is not changed.
        self.assertNotIn(274, oriented.getexif())

    def test_exif_mirror_is_not_ignored(self):
        pixels = np.arange(3 * 5 * 3, dtype=np.uint8).reshape(3, 5, 3)
        image = Image.fromarray(pixels)
        image.getexif()[274] = 2
        np.testing.assert_array_equal(np.asarray(common.rgb_image(image)), pixels[:, ::-1])

    def test_transparent_and_partial_alpha_are_composited_over_white(self):
        pixels = np.array([[[255, 0, 0, 0], [0, 0, 0, 128], [0, 100, 200, 255]]], dtype=np.uint8)
        image = Image.fromarray(pixels)
        expected = np.array([[[255, 255, 255], [127, 127, 127], [0, 100, 200]]], dtype=np.uint8)
        np.testing.assert_array_equal(np.asarray(common.rgb_image(image)), expected)
        self.assertEqual(common.rgb_image(image).mode, "RGB")

    def test_transparent_palette_and_grayscale_follow_the_same_rgb_contract(self):
        palette = Image.new("P", (2, 1))
        palette.putpalette([255, 0, 0, 0, 255, 0] + [0] * (768 - 6))
        palette.putdata([0, 1])
        palette.info["transparency"] = 0
        np.testing.assert_array_equal(np.asarray(common.rgb_image(palette)), [[[255, 255, 255], [0, 255, 0]]])
        gray = Image.new("L", (3, 2), 90)
        np.testing.assert_array_equal(np.asarray(common.rgb_image(gray)), np.full((2, 3, 3), 90))

    def test_imagenet_normalization_is_per_channel_in_chw_order(self):
        color = np.array([0, 128, 255], dtype=np.float32)
        image = Image.new("RGB", (317, 173), tuple(int(item) for item in color))
        actual = common.preprocess(image)
        expected = (color / np.float32(255) - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
        for channel in range(3):
            np.testing.assert_allclose(actual[channel], expected[channel], rtol=0, atol=1e-7)


class PhotoSourceTaxonomyTests(unittest.TestCase):
    def test_source_maps_keep_acne_and_supported_dermatitis_separate(self):
        self.assertTrue(merge.ACNE.isdisjoint(merge.DERMATITIS))
        self.assertEqual(merge.ACNE, {"acne", "acne vulgaris"})
        self.assertTrue({"eczema", "allergic contact dermatitis", "dyshidrotic eczema"}.issubset(merge.DERMATITIS))
        self.assertEqual(prepare.label_target({"Acne": 1.0}), "acne")
        self.assertEqual(prepare.label_target({"Acute and chronic dermatitis": 1.0}), "dermatitis")
        self.assertIsNone(prepare.label_target({"Acne": .5, "Eczema": .5}))

    def test_perioral_and_factitial_labels_do_not_become_barrier_dermatitis(self):
        for label in ["Perioral Dermatitis", "Factitial Dermatitis", "Dermatitis artefacta", "Seborrheic Dermatitis"]:
            with self.subTest(label=label):
                self.assertNotIn(label.lower(), merge.DERMATITIS)
                self.assertNotIn(label, prepare.DERMATITIS)
                self.assertEqual(prepare.label_target({label: 1.0}), "other")

    def test_fitz_preparation_applies_exact_taxonomy_and_partition(self):
        cases = {
            "acne": "acne", "acne vulgaris": "acne", "eczema": "dermatitis",
            "allergic contact dermatitis": "dermatitis", "dyshidrotic eczema": "dermatitis",
            "perioral dermatitis": "other", "factitial dermatitis": "other",
            "dermatitis artefacta": "other", "rosacea": "other", "melanoma": "other",
        }
        with tempfile.TemporaryDirectory(prefix="skinsnap-taxonomy-") as directory:
            root = Path(directory)
            folder = root / "data/fitzpatrick17k/images"
            folder.mkdir(parents=True)
            Image.new("RGB", (128, 160), (60, 90, 120)).save(folder / "fixture.png")
            with patch.multiple(merge, ROOT=root, FITZ_PATHS={"fixture.png": [folder / "fixture.png"]}):
                for label, expected in cases.items():
                    with self.subTest(label=label):
                        row = merge.prepare_fitz({
                            "orig_img_name": "fixture.png", "md5hash": "synthetic",
                            "label": label, "partition": "val", "url": "https://example.invalid/test",
                            "fst": "4",
                        })
                        self.assertEqual(row["target"], expected)
                        self.assertEqual(row["source_label"], label)
                        self.assertEqual(row["split"], "validation")
                        self.assertEqual(row["images"][0]["local_path"], "data/fitzpatrick17k/images/fixture.png")


class PhotoMergeIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="skinsnap-merge-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / "data/photo-v2"
        self.model = self.root / "models/photo-v2"
        self.data.mkdir(parents=True)
        self.model.mkdir(parents=True)
        metadata = self.root / "data/fitzpatrick17k/fitzpatrick17k-C.csv"
        metadata.parent.mkdir(parents=True)
        metadata.write_text("md5hash,label,partition\n", encoding="utf-8")
        self.metadata_hash = hashlib.sha256(metadata.read_bytes()).hexdigest()
        for name in ["cohort.json", "pre_audit_cohort.json"]:
            common.write_json(self.root / "models/clinical" / name, {"rows": []})
        self.patches = patch.multiple(merge, ROOT=self.root, DATA=self.data, MODEL=self.model)
        self.patches.start()
        self.addCleanup(self.patches.stop)

    def record(self, key, split="train", target="acne", source="SCIN", seed=0, dhash=None):
        path = self.data / f"{key}.png"
        pixels = np.random.default_rng(seed).integers(0, 256, (128, 128, 3), dtype=np.uint8)
        Image.fromarray(pixels).save(path)
        facts = merge.image_facts(path)
        if dhash is not None:
            facts["dhash"] = f"{dhash:016x}"
        row = {"case_id": key, "target": target, "split": split, "source": source,
               "duplicate_group": key, "previously_examined": False, "images": [facts]}
        if source == "Fitzpatrick17k-C":
            row.update(id="fitz:" + key, duplicate_group="fitz:" + key)
        return row

    def run_merge(self, rows):
        common.write_json(self.data / "cohort.json", {"records": [row for row in rows if row["source"] == "SCIN"]})
        common.write_json(self.data / "fitz-image-facts.json", {
            "metadata_sha256": self.metadata_hash,
            "records": [row for row in rows if row["source"] == "Fitzpatrick17k-C"],
        })
        with contextlib.redirect_stdout(io.StringIO()):
            merge.main()
        return json.loads((self.data / "combined-cohort.json").read_text(encoding="utf-8"))

    def test_exact_duplicates_across_sources_and_splits_are_removed_entirely(self):
        output = self.run_merge([
            self.record("scin-train", seed=42),
            self.record("fitz-test", split="test", source="Fitzpatrick17k-C", seed=42),
        ])
        self.assertEqual(output["records"], [])
        self.assertCountEqual(output["duplicate_controls"]["cross_split_ids_removed"], ["scin:scin-train", "fitz:fitz-test"])

    def test_near_duplicate_second_view_connects_whole_case_across_splits(self):
        first = self.record("first", seed=1, dhash=0)
        second = self.record("second", seed=2, dhash=0xFFFFFFFFFFFFFFFF)
        # The case has a second, distinct image with a near-duplicate hash.
        extra = self.record("extra-view", seed=3, dhash=3)
        second["images"].append(extra["images"][0])
        third = self.record("third", split="test", source="Fitzpatrick17k-C", seed=4, dhash=0xFFFFFFFFFFFFFFFC)
        output = self.run_merge([first, second, third])
        self.assertEqual(output["records"], [])
        self.assertEqual(len(output["duplicate_controls"]["cross_split_ids_removed"]), 3)
        self.assertGreaterEqual(output["duplicate_controls"]["near_pairs"], 2)

    def test_duplicate_label_conflicts_are_removed_even_within_training(self):
        output = self.run_merge([
            self.record("acne", seed=91, target="acne"),
            self.record("derm", seed=91, target="dermatitis", source="Fitzpatrick17k-C"),
        ])
        self.assertEqual(output["records"], [])
        self.assertEqual(len(output["duplicate_controls"]["conflicting_label_ids"]), 2)

    def test_same_split_duplicates_share_one_group_without_moving_to_holdout(self):
        output = self.run_merge([
            self.record("a", seed=51),
            self.record("b", seed=51, source="Fitzpatrick17k-C"),
        ])
        self.assertEqual(len(output["records"]), 2)
        self.assertEqual({row["split"] for row in output["records"]}, {"train"})
        self.assertEqual(len({row["duplicate_group"] for row in output["records"]}), 1)
        self.assertEqual(output["duplicate_controls"]["cross_split_ids_removed"], [])

    def test_independent_synthetic_rows_retain_their_declared_partitions(self):
        output = self.run_merge([
            self.record("train", seed=7, dhash=0),
            self.record("validation", split="validation", seed=8, dhash=0xAAAAAAAAAAAAAAAA),
            self.record("test", split="test", source="Fitzpatrick17k-C", seed=9, dhash=0xFFFFFFFFFFFFFFFF),
        ])
        self.assertEqual({row["id"]: row["split"] for row in output["records"]}, {
            "scin:train": "train", "scin:validation": "validation", "fitz:test": "test",
        })
        self.assertEqual(output["split_counts"]["test"]["acne"], 1)
        self.assertFalse(output["duplicate_controls"]["patient_ids_available"])

    def test_atlas_copy_of_excluded_previously_examined_source_cannot_enter_test(self):
        atlas = self.record("atlas-copy", split="test", source="Fitzpatrick17k-C", seed=64)
        common.write_json(self.root / "models/clinical/pre_audit_cohort.json", {"rows": [{
            "case_id": "old-excluded-case", "source_sha256": atlas["images"][0]["source_sha256"],
            "dhash": "fedcba9876543210",
        }]})
        output = self.run_merge([atlas])
        self.assertEqual(output["records"], [])
        self.assertEqual(output["duplicate_controls"]["previous_exposure_ids_removed"], ["fitz:atlas-copy"])

    def test_near_duplicate_of_excluded_legacy_image_cannot_enter_validation(self):
        atlas = self.record("atlas-near", split="validation", source="Fitzpatrick17k-C", seed=65, dhash=3)
        common.write_json(self.root / "models/clinical/cohort.json", {"rows": [{
            "case_id": "legacy-not-retained", "source_sha256": "a-different-source-hash", "dhash": "0000000000000000",
        }]})
        output = self.run_merge([atlas])
        self.assertEqual(output["records"], [])
        self.assertEqual(output["duplicate_controls"]["previous_exposure_ids_removed"], ["fitz:atlas-near"])

    def test_prior_duplicate_may_remain_in_training_but_exposure_is_recorded(self):
        atlas = self.record("atlas-development", source="Fitzpatrick17k-C", seed=66)
        common.write_json(self.root / "models/clinical/cohort.json", {"rows": [{
            "case_id": "old-training", "source_sha256": atlas["images"][0]["source_sha256"],
            "dhash": atlas["images"][0]["dhash"],
        }]})
        output = self.run_merge([atlas])
        self.assertEqual(len(output["records"]), 1)
        self.assertEqual(output["records"][0]["split"], "train")
        self.assertTrue(output["records"][0]["previously_examined"])

    def test_test_lock_prevents_resetting_or_overwriting_the_cohort(self):
        record = self.record("retained", seed=88)
        self.run_merge([record])
        previous = (self.data / "combined-cohort.json").read_bytes()
        common.write_json(self.model / "test-lock.json", {"synthetic_test_lock": True})
        with self.assertRaisesRegex(RuntimeError, "already opened"):
            merge.main()
        self.assertEqual((self.data / "combined-cohort.json").read_bytes(), previous)


if __name__ == "__main__":
    unittest.main()
