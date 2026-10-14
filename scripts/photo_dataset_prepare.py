"""Acquire an expanded, case-grouped SCIN development cohort without evaluating it.

Source photographs are kept exclusively under ignored data/photo-v2. Differential
annotation weights are not diagnostic probabilities. The previous SCIN acne test
has already been examined: these cases can never become a new independent test.
"""
from __future__ import annotations

import argparse
import ast
import base64
import collections
import concurrent.futures
import csv
import hashlib
import io
import json
from pathlib import Path
import shutil
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "photo-v2"
OLD_DATA = ROOT / "data" / "clinical"
PROTOCOL = ROOT / "models" / "photo-v2" / "protocol.json"
BASE = "https://storage.googleapis.com/dx-scin-public-data/"
SEED = 20261012
CLASSES = ["acne", "dermatitis", "other"]
MIN_EDGE = 128
MAX_PIXELS = 40_000_000
DERMATITIS = frozenset({
    "Eczema", "Allergic Contact Dermatitis", "Irritant Contact Dermatitis",
    "Acute dermatitis, NOS", "CD - Contact dermatitis", "Acute and chronic dermatitis",
    "Chronic dermatitis, NOS", "Contact dermatitis, NOS", "Lichenified eczematous dermatitis",
    "Chronic dermatitis", "Allergic contact dermatitis caused by allergenic hapten derived from plant",
    "Acute-on-chronic dyshidrotic eczema of hands", "resolving dermatitis", "Lichenified eczema",
    "Acute constitutional eczema", "Acute dermatitis", "Crusted eczematous dermatitis",
    "Contact dermatitis caused by Rhus diversiloba", "Pruritic dermatitis",
})
EXCLUDED_FROM_DERMATITIS = [
    "Seborrheic Dermatitis", "Perioral Dermatitis", "Stasis Dermatitis", "Photodermatitis",
    "Infected eczema", "Dermatitis herpetiformis", "Fungal dermatitis", "Bullous dermatitis",
    "Bullous dermatitis, NOS", "Acute vesicular dermatitis", "Psoriasiform dermatitis",
    "Inflammatory dermatosis", "Phytophotodermatitis", "Berloque dermatitis",
    "Photocontact dermatitis [berloque dermatitis]",
]
ADULT_AGES = {"", "AGE_UNKNOWN", "AGE_18_TO_29", "AGE_30_TO_39", "AGE_40_TO_49",
              "AGE_50_TO_59", "AGE_60_TO_69", "AGE_70_TO_79", "AGE_80_OR_OLDER"}
PRIOR_COHORTS = [ROOT / "models/clinical/cohort.json", ROOT / "models/clinical/pre_audit_cohort.json"]


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def bool_field(value):
    return str(value).strip().lower() in {"yes", "true", "1", "1.0"}


def fetch(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                return response.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(attempt + 1)
    raise RuntimeError("download failed")


def metadata(filename):
    path = DATA / filename
    if not path.exists():
        legacy = OLD_DATA / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        if legacy.exists():
            shutil.copyfile(legacy, path)
        else:
            path.write_bytes(fetch(BASE + "dataset/" + filename))
    return list(csv.DictReader(io.StringIO(path.read_text(encoding="utf-8"))))


def object_inventory():
    path = DATA / "gcs_object_hashes.json"
    legacy = OLD_DATA / path.name
    if not path.exists() and legacy.exists():
        shutil.copyfile(legacy, path)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    objects, token = {}, None
    while True:
        params = {"prefix": "dataset/images/", "maxResults": 1000,
                  "fields": "nextPageToken,items(name,md5Hash,size)"}
        if token:
            params["pageToken"] = token
        reply = json.loads(fetch("https://storage.googleapis.com/storage/v1/b/dx-scin-public-data/o?" +
                                 urllib.parse.urlencode(params)))
        for item in reply.get("items", []):
            objects[item["name"]] = {"md5": item.get("md5Hash"), "size": item.get("size")}
        token = reply.get("nextPageToken")
        if not token:
            break
    write_json(path, objects)
    return objects


class UnionFind:
    def __init__(self, keys):
        self.parent = {key: key for key in keys}

    def find(self, key):
        while self.parent[key] != key:
            self.parent[key] = self.parent[self.parent[key]]
            key = self.parent[key]
        return key

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.parent[max(a, b)] = min(a, b)


def global_duplicate_groups(cases, objects):
    """Union every released case, including ineligible intermediaries."""
    groups = UnionFind(row["case_id"] for row in cases)
    seen = {}
    for row in cases:
        for index in range(1, 4):
            path = row.get(f"image_{index}_path")
            if not path:
                continue
            keys = ["path:" + path]
            md5 = objects.get(path, {}).get("md5")
            if md5:
                keys.append("md5:" + md5)
            for key in keys:
                if key in seen:
                    groups.union(row["case_id"], seen[key])
                seen[key] = row["case_id"]
    return {key: groups.find(key) for key in groups.parent}


def label_target(weights):
    acne = weights.get("Acne", 0)
    dermatitis = sum(weights.get(key, 0) for key in DERMATITIS)
    if acne >= .5 and acne > dermatitis:
        return "acne"
    if dermatitis >= .5 and dermatitis > acne:
        return "dermatitis"
    if weights and max(weights.values()) >= .5 and acne + dermatitis < .2:
        return "other"
    return None


def candidates(cases, labels):
    by_id = {row["case_id"]: row for row in cases}
    selected, excluded = [], collections.Counter()
    for label in labels:
        row = by_id.get(label["case_id"])
        if row is None:
            excluded["label_without_case"] += 1
            continue
        if bool_field(row.get("body_parts_genitalia_or_groin")) or bool_field(row.get("body_parts_buttocks")):
            excluded["sensitive_body_location"] += 1
            continue
        if row.get("age_group", "") not in ADULT_AGES:
            excluded["age_not_in_adult_source_categories"] += 1
            continue
        weights = ast.literal_eval(label.get("weighted_skin_condition_label") or "{}")
        if not isinstance(weights, dict) or any(not isinstance(v, (int, float)) or v < 0 or v > 1
                                                for v in weights.values()):
            excluded["invalid_differential"] += 1
            continue
        views = [{"image_path": row[f"image_{i}_path"], "view_index": i,
                  "shot_type": row.get(f"image_{i}_shot_type") or None}
                 for i in range(1, 4) if row.get(f"image_{i}_path")]
        if not weights or not views:
            excluded["missing_label_or_image"] += 1
            continue
        target = label_target(weights)
        if target is None:
            excluded["ambiguous_or_low_weight_differential"] += 1
            continue
        selected.append({"case_id": row["case_id"], "target": target, "images": views,
                         "source_differential": weights,
                         "dermatologist_confidence": label.get("dermatologist_skin_condition_confidence") or None,
                         "dermatologist_gradable": [label.get(f"dermatologist_gradable_for_skin_condition_{i}")
                                                    or None for i in range(1, 4)],
                         "monk_skin_tone_us": label.get("monk_skin_tone_label_us") or None,
                         "monk_skin_tone_india": label.get("monk_skin_tone_label_india") or None,
                         "age_group": row.get("age_group") or None,
                         "sex_at_birth": row.get("sex_at_birth") or None,
                         "body_parts": sorted(k.removeprefix("body_parts_") for k, v in row.items()
                                              if k.startswith("body_parts_") and bool_field(v))})
    return selected, dict(excluded)


def dhash(image):
    gray = ImageOps.grayscale(ImageOps.exif_transpose(image)).resize((9, 8), Image.Resampling.BILINEAR)
    pixels = gray.tobytes()
    value = 0
    for y in range(8):
        for x in range(8):
            value = (value << 1) | int(pixels[y * 9 + x + 1] > pixels[y * 9 + x])
    return value


def inspect_image(raw):
    with Image.open(io.BytesIO(raw)) as image:
        if image.width * image.height > MAX_PIXELS:
            raise ValueError("image_exceeds_pixel_limit")
        if min(image.size) < MIN_EDGE:
            raise ValueError("image_below_minimum_resolution")
        if image.format not in {"JPEG", "PNG", "WEBP"}:
            raise ValueError("unsupported_image_encoding")
        image.load()
        image = ImageOps.exif_transpose(image)
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        background.alpha_composite(rgba)
        rgb = background.convert("RGB")
        return {"source_sha256": sha256(raw),
                "pixel_sha256": sha256(f"{rgb.width}x{rgb.height}:RGB:".encode() + rgb.tobytes()),
                "dhash": f"{dhash(rgb):016x}", "width": rgb.width, "height": rgb.height}


def md5_matches(raw, expected):
    return bool(expected) and base64.b64encode(hashlib.md5(raw).digest()).decode() == expected


def download_image(item):
    source, obj, reusable = item
    # Names are never derived from uploads, and only exact inventoried PNG keys are accepted.
    if not source.startswith("dataset/images/") or Path(source).name != source.removeprefix("dataset/images/"):
        return {"image_path": source, "error": "invalid_source_path"}
    dest = DATA / "images" / Path(source).name
    try:
        expected = obj.get("md5")
        if not expected:
            raise ValueError("missing_gcs_md5")
        raw = dest.read_bytes() if dest.exists() else None
        provenance = "existing_verified_download"
        if raw is not None and not md5_matches(raw, expected):
            raw = None
        if raw is None and reusable and reusable.exists():
            candidate = reusable.read_bytes()
            if md5_matches(candidate, expected):
                raw = candidate
                provenance = "verified_previous_scin_download"
        if raw is None:
            raw = fetch(BASE + source)
            provenance = "downloaded_public_gcs"
        if not md5_matches(raw, expected):
            raise ValueError("source_md5_mismatch")
        if obj.get("size") and len(raw) != int(obj["size"]):
            raise ValueError("source_size_mismatch")
        details = inspect_image(raw)
        if not dest.exists() or sha256(dest.read_bytes()) != details["source_sha256"]:
            dest.write_bytes(raw)
        return {"image_path": source, "local_path": dest.relative_to(ROOT).as_posix(),
                "gcs_md5": expected, "source_url": BASE + source,
                "acquisition": provenance, **details}
    except Exception as exc:
        return {"image_path": source, "error": str(exc) if isinstance(exc, ValueError) else type(exc).__name__}


def prior_exposure():
    rows, provenance = [], []
    for path in PRIOR_COHORTS:
        raw = path.read_bytes()
        payload = json.loads(raw)
        rows.extend(payload["rows"])
        provenance.append({"path": path.relative_to(ROOT).as_posix(), "sha256": sha256(raw),
                           "rows": len(payload["rows"])})
    return rows, provenance


def split_records(records, global_groups, prior_rows):
    """Create case-group splits before any training or evaluation.

    Prior-experiment exposure propagates across exact/global/near-duplicate edges.
    Case grouping is conservative but cannot demonstrate participant independence.
    """
    groups = UnionFind(row["case_id"] for row in records)
    seen, view_hashes = {}, []
    for row in records:
        case = row["case_id"]
        row["global_duplicate_group"] = global_groups[case]
        keys = ["global:" + global_groups[case]]
        for image in row["images"]:
            keys.extend(["path:" + image["image_path"], "source:" + image["source_sha256"],
                         "pixel:" + image["pixel_sha256"], "md5:" + image["gcs_md5"]])
            view_hashes.append((case, int(image["dhash"], 16)))
        for key in keys:
            if key in seen:
                groups.union(case, seen[key])
            seen[key] = case
    near_pairs = 0
    for i, (case, value) in enumerate(view_hashes):
        for other, previous in view_hashes[:i]:
            if case != other and (value ^ previous).bit_count() <= 2:
                groups.union(case, other)
                near_pairs += 1
    prior_ids = {row["case_id"] for row in prior_rows}
    prior_globals = {global_groups[key] for key in prior_ids if key in global_groups}
    prior_source = {row["source_sha256"] for row in prior_rows if row.get("source_sha256")}
    prior_hashes = {int(row["dhash"], 16) for row in prior_rows if row.get("dhash")}
    prior_reasons = collections.defaultdict(set)
    for row in records:
        key = row["case_id"]
        if key in prior_ids:
            prior_reasons[key].add("case_in_previous_experiment")
        if global_groups[key] in prior_globals:
            prior_reasons[key].add("global_exact_group_in_previous_experiment")
        for image in row["images"]:
            if image["source_sha256"] in prior_source:
                prior_reasons[key].add("source_hash_in_previous_experiment")
            value = int(image["dhash"], 16)
            if any((value ^ old).bit_count() <= 2 for old in prior_hashes):
                prior_reasons[key].add("near_duplicate_of_previous_experiment")
    units = collections.defaultdict(list)
    for row in records:
        units[groups.find(row["case_id"])].append(row)
    conflicting = {key for key, values in units.items() if len({row["target"] for row in values}) != 1}
    clean_units = {key: rows for key, rows in units.items() if key not in conflicting}
    fresh, development = {key: [] for key in CLASSES}, []
    for key, rows in clean_units.items():
        reasons = sorted({reason for row in rows for reason in prior_reasons[row["case_id"]]})
        for row in rows:
            row["duplicate_group"] = key
            row["case_previously_examined"] = row["case_id"] in prior_ids
            row["previously_examined"] = bool(reasons)
            row["prior_exposure_reasons"] = reasons
        (development if reasons else fresh[rows[0]["target"]]).append(rows)
    for rows in development:
        for row in rows:
            row["split"] = "train"
    for target, target_units in fresh.items():
        target_units.sort(key=lambda unit: sha256(f"photo-v2:{SEED}:{unit[0]['duplicate_group']}".encode()))
        n = len(target_units)
        n_test = max(1, round(n * .20)) if n >= 3 else 0
        n_val = max(1, round(n * .15)) if n >= 3 else 0
        for i, rows in enumerate(target_units):
            split = "test" if i < n_test else "validation" if i < n_test + n_val else "train"
            for row in rows:
                row["split"] = split
    clean = sorted([row for rows in clean_units.values() for row in rows], key=lambda row: row["case_id"])
    audit = {"selected_connected_groups": len(units), "conflicting_label_groups_removed": len(conflicting),
             "conflicting_group_case_ids": sorted(row["case_id"] for key in conflicting for row in units[key]),
             "removed_conflicting_cases": sum(len(units[key]) for key in conflicting),
             "near_duplicate_pairs_dhash_distance_le_2": near_pairs,
             "previously_examined_groups_training_only": len(development),
             "fresh_groups_per_class": {key: len(value) for key, value in fresh.items()},
             "patient_identifiers_available": False,
             "patient_level_independence_established": False,
             "scope": "All released cases for path/GCS MD5 edges; every eligible downloaded view for SHA256/pixels/dHash <= 2. Prior-cohort hash exposure also propagates. Undetected near-duplicates and repeated participants remain possible."}
    return clean, audit


def make_protocol(prior_provenance):
    return {"schema_version": 2, "protocol_id": "skinsnap-photo-v2-scin-development-20261012",
            "seed": SEED, "source": "SCIN release 1.0.0", "source_repository": "https://github.com/google-research-datasets/scin",
            "source_license": "Custom SCIN Data Use License; models/clinical/licenses/SCIN_LICENSE.txt",
            "classes": CLASSES, "dermatitis_source_labels": sorted(DERMATITIS),
            "explicitly_unsupported_dermatitis_like_labels": EXCLUDED_FROM_DERMATITIS,
            "taxonomy_rationale": "Combine retrospective eczema, contact, nonspecific, acute/chronic and lichenified eczematous differential labels into one broad research appearance class. This does not confirm eczema or determine etiology. Named infectious, vascular, seborrheic, perioral, autoimmune, bullous and photo-induced disorders are excluded from this broad class; they may enter other when its rule is satisfied.",
            "label_rule": {"acne": "Acne differential weight >= 0.50 and above summed dermatitis weight",
                           "dermatitis": "Summed listed dermatitis weights >= 0.50 and above Acne weight",
                           "other": "Maximum individual differential weight >= 0.50 and Acne + dermatitis weight < 0.20",
                           "weights_are_diagnostic_probabilities": False},
            "acquisition": {"all_views_per_case": True, "maximum_views": 3, "parallel_downloads": 6,
                            "minimum_image_edge": MIN_EDGE, "maximum_pixels": MAX_PIXELS,
                            "verify_source_gcs_md5_and_size": True, "exclude_genital_groin_and_buttock_case_flags": True,
                            "age_policy": "SCIN enrolled adults. Retain adult age bands and missing/AGE_UNKNOWN; do not infer a known participant age from missing metadata."},
            "split": {"unit": "connected case duplicate group", "fresh_test_fraction": .20,
                      "fresh_validation_fraction": .15, "fresh_train_fraction": .65,
                      "previously_examined_groups": "train only, never validation/test",
                      "previous_experiments": prior_provenance,
                      "all_acne_cases_already_examined": True,
                      "independent_acne_validation_required_before_release": True,
                      "test_must_remain_unopened_until_model_selection_and_calibration_locked": True},
            "predeclared_minimum_exploratory_gates": {"macro_f1": .60, "balanced_accuracy": .60,
                                                     "acne_recall": .50, "dermatitis_recall": .50},
            "deployment": {"blocked_without_fresh_independent_acne_validation": True,
                           "passing_numeric_gates_does_not_establish_clinical_validity": True,
                           "serious_disease_diagnosis_supported": False,
                           "arbitrary_face_or_body_diagnosis_supported": False},
            "planned_backbone": "DINOv2 self-supervised features; exact variant, preprocessing and weights must be recorded by the training protocol before evaluation.",
            "evaluation_status": "Not evaluated by this acquisition script. No performance claims."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata-only", action="store_true", help="Write protocol and candidate audit; do not fetch images.")
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "images").mkdir(exist_ok=True)
    cases, labels = metadata("scin_cases.csv"), metadata("scin_labels.csv")
    objects = object_inventory()
    global_groups = global_duplicate_groups(cases, objects)
    prior_rows, prior_provenance = prior_exposure()
    protocol = make_protocol(prior_provenance)
    if PROTOCOL.exists() and json.loads(PROTOCOL.read_text(encoding="utf-8")) != protocol:
        raise RuntimeError("Existing predeclared protocol differs; review explicitly before replacing it.")
    write_json(PROTOCOL, protocol)
    records, excluded = candidates(cases, labels)
    eligible = dict(collections.Counter(row["target"] for row in records))
    write_json(DATA / "candidate_audit.json", {"eligible_case_counts": eligible, "exclusions": excluded,
                                              "total_cases": len(cases), "candidate_records": records})
    print(json.dumps({"phase": "metadata", "eligible_cases": eligible, "total_cases": len(cases),
                      "exclusions": excluded}), flush=True)
    if args.metadata_only:
        return
    reusable = {row["image_path"]: OLD_DATA / "images" / (row["case_id"] + ".png") for row in prior_rows}
    paths = sorted({image["image_path"] for row in records for image in row["images"]})
    items = [(path, objects.get(path, {}), reusable.get(path)) for path in paths]
    downloads = {}
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(download_image, item): item[0] for item in items}
        for i, future in enumerate(concurrent.futures.as_completed(futures), 1):
            result = future.result()
            downloads[result["image_path"]] = result
            if i % 100 == 0 or i == len(items):
                print(json.dumps({"phase": "download", "completed": i, "total": len(items),
                                  "failures": sum("error" in row for row in downloads.values()),
                                  "elapsed_seconds": round(time.monotonic() - started)}), flush=True)
    usable = []
    for row in records:
        images = [{**view, **downloads[view["image_path"]]} for view in row["images"]
                  if "error" not in downloads[view["image_path"]]]
        if images:
            row["excluded_image_paths"] = [view["image_path"] for view in row["images"]
                                           if "error" in downloads[view["image_path"]]]
            row["images"] = images
            usable.append(row)
        else:
            excluded["case_without_valid_image"] = excluded.get("case_without_valid_image", 0) + 1
    clean, duplicate_audit = split_records(usable, global_groups, prior_rows)
    split_counts = {split: {target: sum(row["split"] == split and row["target"] == target for row in clean)
                            for target in CLASSES} for split in ["train", "validation", "test"]}
    image_counts = {split: {target: sum(len(row["images"]) for row in clean if row["split"] == split and row["target"] == target)
                            for target in CLASSES} for split in split_counts}
    fresh_acne = split_counts["test"]["acne"]
    # All qualifying acne cases were in previous experiments. A changed result needs a protocol audit.
    if fresh_acne:
        raise RuntimeError("Unexpected fresh SCIN acne case; audit exposure before evaluating it.")
    failures = [downloads[path] for path in sorted(downloads) if "error" in downloads[path]]
    cohort = {"schema_version": 2, "source": "SCIN", "seed": SEED, "classes": CLASSES,
              "protocol_path": PROTOCOL.relative_to(ROOT).as_posix(), "protocol_sha256": sha256(PROTOCOL.read_bytes()),
              "metadata_sha256": {name: sha256((DATA / name).read_bytes())
                                  for name in ["scin_cases.csv", "scin_labels.csv", "gcs_object_hashes.json"]},
              "eligible_before_image_validation": eligible, "records": clean,
              "split_counts": split_counts, "image_split_counts": image_counts, "exclusions": excluded,
              "image_failures": failures, "duplicate_controls": {**duplicate_audit,
                  "all_released_case_count": len(cases), "all_source_object_count": len(objects),
                  "all_released_global_exact_groups": len(set(global_groups.values()))},
              "holdout": {"fresh_acne_test_cases": fresh_acne, "independent_acne_validation": False,
                          "deployment_blocked": True, "reason": "All eligible SCIN acne cases were previously examined. Independent acne validation from another licensed source is required; SCIN-only numbers cannot support release.",
                          "evaluated": False},
              "acquisition_summary": {"unique_source_images_requested": len(paths),
                                      "unique_source_images_valid": len(downloads) - len(failures),
                                      "retained_cases": len(clean), "retained_case_views": sum(len(row["images"]) for row in clean)}}
    write_json(DATA / "cohort.json", cohort)
    print(json.dumps({"phase": "complete", "manifest": "data/photo-v2/cohort.json",
                      "split_counts": split_counts, "image_counts": image_counts,
                      "duplicates": duplicate_audit, "deployment_blocked": True}), flush=True)


if __name__ == "__main__":
    main()
