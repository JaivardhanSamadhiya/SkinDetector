"""Merge SCIN with the corrected Fitzpatrick17k-C partitions before any training.

    .venv/Scripts/python.exe scripts/photo_dataset_merge.py

No model predictions are inspected here. Images remain in ignored data/.
"""
from __future__ import annotations
import collections
import concurrent.futures
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps
from photo_model_common import ROOT, DATA, MODEL, CLASSES, resize_rgb, rgb_image, sha256, write_json

ACNE = {"acne", "acne vulgaris"}
DERMATITIS = {"eczema", "allergic contact dermatitis", "dyshidrotic eczema"}
FITZ_PATHS = {}


def image_facts(path):
    with Image.open(path) as image:
        image.load()
        if min(image.size) < 128 or image.width * image.height > 40_000_000:
            raise ValueError("image size outside predeclared bounds")
        image = rgb_image(image)
        gray = np.asarray(ImageOps.grayscale(image).resize((9, 8), Image.Resampling.BILINEAR))
        h = int.from_bytes(np.packbits(gray[:, 1:] > gray[:, :-1]).tobytes(), "big")
        return {"local_path": path.relative_to(ROOT).as_posix(), "source_sha256": sha256(path),
                "pixel_sha256": hashlib.sha256(resize_rgb(image).tobytes()).hexdigest(),
                "dhash": f"{h:016x}", "width": image.width, "height": image.height}


def prepare_fitz(row):
    try:
        paths = FITZ_PATHS.get(row["orig_img_name"], [])
        if len(paths) != 1:
            raise ValueError("missing or ambiguous original image")
        facts = image_facts(paths[0])
        # The archive's hashed filename is the publisher's identifier; byte hash can
        # differ after upstream encoding, so SHA256 of actual bytes is also retained.
        target = "acne" if row["label"] in ACNE else "dermatitis" if row["label"] in DERMATITIS else "other"
        return {"id": "fitz:" + row["md5hash"], "case_id": row["md5hash"], "target": target,
                "source": "Fitzpatrick17k-C", "split": "validation" if row["partition"] == "val" else row["partition"],
                "duplicate_group": "fitz:" + row["md5hash"], "source_label": row["label"],
                "source_url": row["url"], "skin_type_annotation": row["fst"], "previously_examined": False,
                "images": [facts]}
    except Exception as exc:
        return {"excluded_id": row["md5hash"], "reason": str(exc)}


class Union:
    def __init__(self, ids): self.parent = {key: key for key in ids}
    def find(self, key):
        while self.parent[key] != key:
            self.parent[key] = self.parent[self.parent[key]]
            key = self.parent[key]
        return key
    def join(self, a, b): self.parent[self.find(a)] = self.find(b)


def main():
    global FITZ_PATHS
    if (MODEL / "test-lock.json").exists():
        raise RuntimeError("This experiment's test is already opened. Its cohort and exposure history are immutable.")
    scin_path = DATA / "cohort.json"
    scin = json.loads(scin_path.read_text(encoding="utf-8"))
    rows = []
    for row in scin["records"]:
        row = {**row, "id": "scin:" + row["case_id"], "source": "SCIN", "duplicate_group": "scin:" + row["duplicate_group"]}
        rows.append(row)
    metadata_path = ROOT / "data/fitzpatrick17k/fitzpatrick17k-C.csv"
    with metadata_path.open(encoding="utf-8") as file:
        raw = list(csv.DictReader(file))
    cache_path = DATA / "fitz-image-facts.json"
    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if cached["metadata_sha256"] != sha256(metadata_path): raise ValueError("metadata changed")
        facts = cached["records"]
    else:
        facts = []
        FITZ_PATHS = collections.defaultdict(list)
        for path in (ROOT / "data/fitzpatrick17k/images").rglob("*"):
            if path.is_file(): FITZ_PATHS[path.name].append(path)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            for i, row in enumerate(pool.map(prepare_fitz, raw)):
                facts.append(row)
                if (i + 1) % 500 == 0: print(json.dumps({"phase": "fitz_integrity", "done": i + 1, "total": len(raw)}), flush=True)
        write_json(cache_path, {"metadata_sha256": sha256(metadata_path), "records": facts})
    excluded = [row for row in facts if "excluded_id" in row]
    rows += [row for row in facts if "excluded_id" not in row]
    # Include every examined legacy case even if the new acquisition excluded it.
    # Otherwise an atlas copy of an excluded old image could enter the new test.
    legacy = {}
    for name in ["cohort.json", "pre_audit_cohort.json"]:
        old_path = ROOT / "models/clinical" / name
        for old in json.loads(old_path.read_text(encoding="utf-8"))["rows"]:
            legacy["legacy:" + old["case_id"]] = old
    union = Union([row["id"] for row in rows] + list(legacy))
    seen, image_hashes = {}, []
    for legacy_id, old in legacy.items():
        keys = ["source:" + old["source_sha256"]]
        original = ROOT / "data/clinical/images" / (old["case_id"] + ".png")
        if original.exists():
            with Image.open(original) as im:
                keys.append("pixel:" + hashlib.sha256(resize_rgb(im).tobytes()).hexdigest())
        for key in keys:
            if key in seen: union.join(legacy_id, seen[key])
            seen[key] = legacy_id
        image_hashes.append((legacy_id, int(old["dhash"], 16)))
    for row_index, row in enumerate(rows):
        keys = ["group:" + row["duplicate_group"]]
        for image in row["images"]:
            # Recompute common pixel hash because the two acquisition scripts can
            # have different thumbnail sizes. Source hashes already catch exact bytes.
            with Image.open(ROOT / image["local_path"]) as im:
                pixel = hashlib.sha256(resize_rgb(im).tobytes()).hexdigest()
            keys += ["source:" + image["source_sha256"], "pixel:" + pixel]
            image_hashes.append((row["id"], int(image["dhash"], 16)))
        for key in keys:
            if key in seen: union.join(row["id"], seen[key])
            seen[key] = row["id"]
        if (row_index + 1) % 2000 == 0:
            print(json.dumps({"phase": "cross_source_duplicate_inventory", "done": row_index + 1, "total": len(rows)}), flush=True)
    # A Hamming ball lookup avoids O(n^2) comparisons. Conservative dHash<=2
    # grouping can remove genuinely different images; it is not a proof of no leakage.
    buckets, near_pairs = collections.defaultdict(list), 0
    for row_id, h in image_hashes:
        candidates = {key for band in range(4) for key in buckets[(band, (h >> (16 * band)) & 65535)]}
        for prior_id, prior_h in candidates:
            if row_id != prior_id and (h ^ prior_h).bit_count() <= 2:
                union.join(row_id, prior_id); near_pairs += 1
        for band in range(4): buckets[(band, (h >> (16 * band)) & 65535)].append((row_id, h))
    groups = collections.defaultdict(list)
    for row in rows: groups[union.find(row["id"])].append(row)
    legacy_roots = {union.find(key) for key in legacy}
    retained, conflicts, cross_split, prior_exposure = [], [], [], []
    for key, group in groups.items():
        if len({row["target"] for row in group}) > 1:
            conflicts.extend(row["id"] for row in group); continue
        if len({row["split"] for row in group}) > 1:
            # Remove the whole group instead of transferring an exposed image into
            # a holdout, or changing published test assignments after inspection.
            cross_split.extend(row["id"] for row in group); continue
        if key in legacy_roots and group[0]["split"] != "train":
            prior_exposure.extend(row["id"] for row in group); continue
        for row in group:
            row["duplicate_group"] = key
            row["previously_examined"] = bool(row.get("previously_examined") or key in legacy_roots)
            retained.append(row)
    retained.sort(key=lambda row: row["id"])
    counts = {split: {key: sum(row["split"] == split and row["target"] == key for row in retained) for key in CLASSES} for split in ["train", "validation", "test"]}
    result = {"schema_version": 2, "classes": CLASSES, "records": retained, "split_counts": counts,
              "source_split_counts": {source: {split: dict(collections.Counter(row["target"] for row in retained if row["source"] == source and row["split"] == split)) for split in counts} for source in ["SCIN", "Fitzpatrick17k-C"]},
              "provenance": {"scin_cohort_sha256": sha256(scin_path), "fitz_metadata_sha256": sha256(metadata_path)},
              "duplicate_controls": {"near_pairs": near_pairs, "conflicting_label_ids": conflicts, "cross_split_ids_removed": cross_split, "previous_exposure_ids_removed": prior_exposure,
                                     "retained_groups": len({row["duplicate_group"] for row in retained}), "patient_ids_available": False,
                                     "limitation": "Case/image grouping and corrected atlas partitions do not establish patient independence. Pretraining overlap unknown."},
              "image_exclusions": excluded, "test_previously_evaluated": False}
    write_json(DATA / "combined-cohort.json", result)
    write_json(MODEL / "dataset-summary.json", {key: value for key, value in result.items() if key != "records"})
    print(json.dumps({"phase": "combined_cohort_ready", "counts": counts, "sources": result["source_split_counts"], "images": sum(len(row["images"]) for row in retained)}), flush=True)


if __name__ == "__main__": main()
