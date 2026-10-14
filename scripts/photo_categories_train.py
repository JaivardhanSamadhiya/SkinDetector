"""Secondary, explicitly research-only photographic condition-category experiment.

Reuse the frozen DINOv2 feature caches and immutable combined cohort. This task
does not diagnose disease, estimate severity, decide treatment, or deploy itself.
Register the taxonomy before fitting. Both backbones must finish selection before
the final test is opened, and no fitting is permitted after either related photo
experiment has opened the shared holdout.

  python scripts/photo_categories_train.py protocol
  python scripts/photo_categories_train.py fit --backbone dinov2_vits14
  python scripts/photo_categories_train.py fit --backbone dinov2_vitb14
  python scripts/photo_categories_train.py lock
  python scripts/photo_categories_train.py evaluate

The evaluate command is intentionally separate; the coordinating researcher must
explicitly choose to open the holdout after reviewing the validation-only lock.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import warnings
from pathlib import Path

import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, log_loss
from sklearn.preprocessing import StandardScaler

from photo_model_common import (
    DATA, MODEL, SEED, SIZE, DINOV2_COMMIT, backbone_artifact,
    preprocessing_fingerprint, sha256, write_json,
)
from photo_model_train import BACKBONES, cohort, load_features, probabilities, setup


VERSION = "skinsnap-photo-categories-dinov2-v1"
CS = [.001, .01, .1, 1., 10.]
SCORE_MIN, MARGIN_MIN = .65, .15
MINIMUMS = {"precision": .70, "recall": .60, "independent_test_groups": 30}
DERMATITIS_SCIN = [
    "Acute and chronic dermatitis", "Acute constitutional eczema", "Acute dermatitis",
    "Acute dermatitis, NOS", "Acute-on-chronic dyshidrotic eczema of hands",
    "Allergic Contact Dermatitis", "Allergic contact dermatitis caused by allergenic hapten derived from plant",
    "CD - Contact dermatitis", "Chronic dermatitis", "Chronic dermatitis, NOS",
    "Contact dermatitis caused by Rhus diversiloba", "Contact dermatitis, NOS",
    "Crusted eczematous dermatitis", "Eczema", "Irritant Contact Dermatitis",
    "Lichenified eczema", "Lichenified eczematous dermatitis", "Pruritic dermatitis", "resolving dermatitis",
]
# Exact lists avoid silently mapping every occurrence of 'dermatitis', 'lichen',
# or 'nevus' into clinically different conditions. These are research groupings,
# not dermatologist-reviewed diagnoses or treatment recommendations.
CATEGORIES = [
    {"id": "acne", "label": "Acne-like category", "fitz": ["acne", "acne vulgaris"], "scin": ["Acne"]},
    {"id": "dermatitis", "label": "Eczema / contact dermatitis-like category", "fitz": ["eczema", "allergic contact dermatitis", "dyshidrotic eczema"], "scin": DERMATITIS_SCIN},
    {"id": "psoriasis", "label": "Psoriasis-like category", "fitz": ["psoriasis", "pustular psoriasis"], "scin": ["Psoriasis", "Inverse psoriasis"]},
    {"id": "rosacea", "label": "Rosacea-like category", "fitz": ["rosacea"], "scin": ["Rosacea"]},
    {"id": "folliculitis", "label": "Folliculitis-like category", "fitz": ["folliculitis"], "scin": ["Folliculitis", "Agminate folliculitis"]},
    {"id": "urticaria", "label": "Urticaria-like category", "fitz": ["urticaria"], "scin": ["Urticaria"]},
    {"id": "lichen_planus", "label": "Lichen planus / lichenoid category", "fitz": ["lichen planus"], "scin": ["Lichen planus/lichenoid eruption"]},
    {"id": "basal_cell_carcinoma", "label": "Basal cell carcinoma research category", "fitz": ["basal cell carcinoma", "solid cystic basal cell carcinoma", "basal cell carcinoma morpheiform"], "scin": ["Basal Cell Carcinoma"]},
    {"id": "squamous_cell_carcinoma", "label": "Squamous cell carcinoma research category", "fitz": ["squamous cell carcinoma"], "scin": ["Squamous Cell Carcinoma"]},
    {"id": "melanoma", "label": "Melanoma research category", "fitz": ["melanoma", "malignant melanoma", "superficial spreading melanoma ssm", "lentigo maligna"], "scin": ["Melanoma"]},
    {"id": "actinic_keratosis", "label": "Actinic keratosis research category", "fitz": ["actinic keratosis"], "scin": ["Actinic Keratosis"]},
    {"id": "melanocytic_nevus", "label": "Melanocytic nevus research category", "fitz": ["nevocytic nevus", "congenital nevus", "halo nevus"], "scin": ["Melanocytic Nevus"]},
    {"id": "seborrheic_keratosis", "label": "Seborrheic keratosis research category", "fitz": ["seborrheic keratosis"], "scin": ["Seborrheic Keratosis"]},
    {"id": "other", "label": "Other / unsupported category", "fitz": [], "scin": []},
]
CLASSES = [category["id"] for category in CATEGORIES]
CANCER_RELATED = {"basal_cell_carcinoma", "squamous_cell_carcinoma", "melanoma", "actinic_keratosis"}
LESION_REVIEW = CANCER_RELATED | {"melanocytic_nevus", "seborrheic_keratosis"}
PROTOCOL_PATH = MODEL / "categories-protocol.json"
SELECTION_PATH = MODEL / "categories-selection-lock.json"
TEST_LOCK_PATH = MODEL / "categories-test-lock.json"


def protocol():
    value = {
        "version": VERSION, "seed": SEED, "input_size": SIZE,
        "backbones": BACKBONES, "backbone_source_commit": DINOV2_COMMIT,
        "feature_representation": "Frozen final DINOv2 CLS token concatenated with mean patch tokens",
        "preprocessing": "Same exact EXIF/white-alpha/pixel-center-nearest224/ImageNet transform and feature cache as photo_model_common.py",
        "categories": CATEGORIES,
        "taxonomy_status": "Predeclared research grouping; not clinically reviewed or a validated disease taxonomy",
        "taxonomy_notes": [
            "All unlisted labels belong to other. No substring-based reassignment.",
            "Lentigo maligna is grouped with melanoma including in-situ disease, not with benign pigmentation.",
            "Nevus category excludes atypical nevus, epidermal nevus and nevus sebaceous. Its output never establishes benignity.",
            "Urticaria excludes urticarial vasculitis and pregnancy-specific eruptions.",
            "Dermatitis excludes seborrheic, perioral, infected, vascular, phototoxic and bullous conditions.",
            "Fitzpatrick source terms acne/acne vulgaris contain heterogeneous acneiform presentations; no severity claim.",
        ],
        "label_rule": {
            "Fitzpatrick17k-C": "Exact source label mapping, otherwise other",
            "SCIN": "Sum source differential weights within each category including residual other; retain unique maximum >=0.50; exclude ties, nonfinite/negative weights or total not approximately1",
            "differential_weights_are_disease_probabilities": False,
            "duplicate_conflicts": "Remove entire finer-category-conflicting duplicate group, retaining all remaining original split memberships",
        },
        "training": {
            "head": "Train-only weighted StandardScaler + multinomial logistic regression; scaler folded into exported linear weights",
            "C": CS, "solver": "lbfgs", "maximum_iterations": 3500,
            "training_views": "All cached train views, equal aggregate weight per case and category",
            "evaluation_views": "First available image per case; never best-view selection",
            "selection": "Maximum pooled validation macro-F1 across all14 categories, then balanced accuracy across represented categories, then candidate order (small backbone and lowerC first)",
            "calibration": "Validation-only NLL temperature grid0.50 through4.00 step0.05",
        },
        "minimums_per_category": MINIMUMS,
        "score_threshold": SCORE_MIN, "margin_threshold": MARGIN_MIN,
        "source_evaluation": "Always report each source separately; a class without30 test groups in a source has no supported source-specific claim",
        "test_policy": "Both backbones fitted and validation-selected head locked before any related shared final test is opened; final evaluation accepts only the locked model, cohort, features and protocol",
        "deployment": {
            "automatically_enable": False, "clinical_validation": False,
            "cancer_related_categories": sorted(CANCER_RELATED),
            "all_lesion_categories_always_professional_review": sorted(LESION_REVIEW),
            "condition_driven_cosmetic_eligibility": ["acne", "dermatitis"],
            "other_is_always_rejected": True,
            "no_all_clear_from_any_output": True,
            "no_serious_disease_treatment_or_exclusion": True,
        },
        "limitations": [
            "SCIN source labels are retrospective differentials; atlas labels are not uniformly pathology-confirmed.",
            "No patient IDs: image/case duplicate grouping does not prove patient independence.",
            "DINOv2 pretraining overlap is unknown; heldout refers to SkinSnap downstream fitting only.",
            "Research/noncommercial image terms; no commercial deployment clearance.",
            "Finite14-group task cannot identify arbitrary diseases, severity or normal skin, nor establish product efficacy.",
            "This task inherits the eligibility and exclusions of the original3-class combined cohort and is not a new representative sample.",
        ],
    }
    if PROTOCOL_PATH.exists() and json.loads(PROTOCOL_PATH.read_text(encoding="utf-8")) != value:
        raise RuntimeError("Registered category protocol changed; use a new version, never overwrite the experiment.")
    if not PROTOCOL_PATH.exists():
        write_json(PROTOCOL_PATH, value)
    return value


def source_lookup(source):
    result = {}
    for category in CATEGORIES:
        for label in category[source]:
            if label in result:
                raise ValueError("Overlapping taxonomy label: " + label)
            result[label] = category["id"]
    return result


def classify_source(row):
    if row["source"] == "Fitzpatrick17k-C":
        return source_lookup("fitz").get(row["source_label"], "other")
    if row["source"] != "SCIN":
        raise ValueError("Unexpected dataset source")
    weights = row.get("source_differential", {})
    if not weights:
        return None
    values = np.asarray(list(weights.values()), dtype=float)
    if not np.isfinite(values).all() or (values < 0).any() or not np.isclose(values.sum(), 1., atol=1e-5):
        return None
    lookup = source_lookup("scin")
    scores = collections.defaultdict(float)
    for label, weight in weights.items():
        scores[lookup.get(label, "other")] += float(weight)
    ordered = sorted(scores.items(), key=lambda pair: pair[1], reverse=True)
    if ordered[0][1] < .5 or (len(ordered) > 1 and np.isclose(ordered[0][1], ordered[1][1], atol=1e-8)):
        return None
    return ordered[0][0]


def category_cohort():
    meta = cohort()
    rows, invalid = {}, []
    for row in meta["records"]:
        target = classify_source(row)
        if target is None:
            invalid.append(row["id"])
        else:
            rows[row["id"]] = {**row, "category": target}
    grouped = collections.defaultdict(list)
    for row in rows.values():
        grouped[row["duplicate_group"]].append(row)
    conflicting = {key for key, group in grouped.items() if len({r["category"] for r in group}) > 1}
    conflicts = [r["id"] for r in rows.values() if r["duplicate_group"] in conflicting]
    rows = {key: row for key, row in rows.items() if row["duplicate_group"] not in conflicting}
    summary = {
        "cohort_sha256": sha256(DATA / "combined-cohort.json"),
        "invalid_or_ambiguous_ids": sorted(invalid), "finer_category_conflict_ids": sorted(conflicts),
        "case_counts": {split: dict(collections.Counter(r["category"] for r in rows.values() if r["split"] == split)) for split in ["train", "validation", "test"]},
        "source_case_counts": {source: {split: dict(collections.Counter(r["category"] for r in rows.values() if r["split"] == split and r["source"] == source)) for split in ["train", "validation", "test"]} for source in ["SCIN", "Fitzpatrick17k-C"]},
        "category_assignment_sha256": hashlib.sha256(json.dumps({key: [r["category"], r["split"], r["duplicate_group"]] for key, r in sorted(rows.items())}, sort_keys=True).encode()).hexdigest(),
    }
    return rows, summary


def category_features(backbone):
    rows, summary = category_cohort()
    items, x = load_features(backbone)
    mask = np.asarray([item["id"] in rows for item in items])
    filtered = [{**item, "category": rows[item["id"]]["category"], "duplicate_group": rows[item["id"]]["duplicate_group"]} for item in items if item["id"] in rows]
    return filtered, x[mask], rows, summary


def wilson(successes, count):
    if not count:
        return None
    z = 1.959963984540054
    fraction = successes / count
    middle = (fraction + z * z / (2 * count)) / (1 + z * z / count)
    half = z * np.sqrt(fraction * (1 - fraction) / count + z * z / (4 * count * count)) / (1 + z * z / count)
    return [float(max(0., middle - half)), float(min(1., middle + half))]


def metrics(y, p, items):
    if not len(y):
        return None
    labels = list(range(len(CLASSES)))
    pred = p.argmax(axis=1)
    report = classification_report(y, pred, labels=labels, target_names=CLASSES, output_dict=True, zero_division=0)
    matrix = confusion_matrix(y, pred, labels=labels)
    per_class = {}
    for i, key in enumerate(CLASSES):
        support, predicted, correct = int(matrix[i].sum()), int(matrix[:, i].sum()), int(matrix[i, i])
        per_class[key] = {
            **report[key], "predicted_count": predicted, "true_positive": correct,
            "independent_group_support": len({item["duplicate_group"] for item, label in zip(items, y) if label == i}),
            "recall_wilson95": wilson(correct, support), "precision_wilson95": wilson(correct, predicted),
        }
    confidence, correct = p.max(axis=1), pred == y
    ece, bins = 0., []
    for i in range(10):
        lower, upper = i / 10, (i + 1) / 10
        mask = (confidence >= lower) & ((confidence < upper) if i < 9 else (confidence <= 1.))
        n = int(mask.sum())
        accuracy = float(correct[mask].mean()) if n else None
        average = float(confidence[mask].mean()) if n else None
        if n:
            ece += n / len(y) * abs(accuracy - average)
        bins.append({"lower": lower, "upper": upper, "n": n, "accuracy": accuracy, "mean_score": average})
    represented = [key for key in CLASSES if per_class[key]["support"]]
    return {
        "n": len(y), "accuracy": float(correct.mean()), "macro_f1": float(np.mean([per_class[key]["f1-score"] for key in CLASSES])),
        "balanced_accuracy": float(np.mean([per_class[key]["recall"] for key in represented])),
        "balanced_accuracy_definition": "Mean recall across categories represented in this subset",
        "confusion_matrix": matrix.tolist(), "class_order": CLASSES, "per_class": per_class,
        "ece_10": float(ece), "calibration_bins": bins,
        "brier_multiclass": float(np.mean(np.sum((p - np.eye(len(CLASSES))[y]) ** 2, axis=1))),
        "nll": float(log_loss(y, p, labels=labels)),
    }


def source_metrics(y, p, items):
    result = {}
    for source in sorted({item["source"] for item in items}):
        mask = np.asarray([item["source"] == source for item in items])
        result[source] = metrics(y[mask], p[mask], [item for item in items if item["source"] == source])
    return result


def head_path(backbone):
    return MODEL / ("categories-" + backbone + "-head.npz")


def validation_path(backbone):
    return MODEL / ("categories-" + backbone + "-validation.json")


def artifact_identity(backbone):
    return {
        "backbone": backbone, "backbone_provenance": backbone_artifact(backbone),
        "head_sha256": sha256(head_path(backbone)), "cohort_sha256": sha256(DATA / "combined-cohort.json"),
        "protocol_sha256": sha256(PROTOCOL_PATH), "preprocessing_sha256": preprocessing_fingerprint(),
        "feature_index_sha256": sha256(DATA / "features" / backbone / "index.json"),
    }


def fit(backbone):
    if any(path.exists() for path in [TEST_LOCK_PATH, MODEL / "test-lock.json", SELECTION_PATH]):
        raise RuntimeError("Selection or related test already locked; further category fitting is prohibited.")
    items, x, _, summary = category_features(backbone)
    train = np.asarray([item["split"] == "train" for item in items])
    val = np.asarray([item["split"] == "validation" for item in items])
    train_items = [item for item in items if item["split"] == "train"]
    val_items = [item for item in items if item["split"] == "validation"]
    train_y = np.asarray([CLASSES.index(item["category"]) for item in train_items])
    val_y = np.asarray([CLASSES.index(item["category"]) for item in val_items])
    if set(train_y) != set(range(len(CLASSES))):
        raise RuntimeError("Every registered category needs training support; do not silently change the taxonomy.")
    cases_per_class = collections.Counter({key: len({item["id"] for item in train_items if item["category"] == key}) for key in CLASSES})
    weights = np.asarray([1 / (item["views"] * cases_per_class[item["category"]]) for item in train_items])
    weights *= len(weights) / weights.sum()
    scaler = StandardScaler().fit(x[train], sample_weight=weights)
    train_x, val_x = scaler.transform(x[train]), scaler.transform(x[val])
    candidates, best, best_key = [], None, (-1., -1.)
    for c in CS:
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always", ConvergenceWarning)
            model = LogisticRegression(C=c, max_iter=3500, solver="lbfgs", random_state=SEED).fit(train_x, train_y, sample_weight=weights)
        converged = not any(issubclass(w.category, ConvergenceWarning) for w in captured)
        if model.classes_.tolist() != list(range(len(CLASSES))):
            raise ValueError("Unexpected classifier output order")
        w = (model.coef_ / scaler.scale_[None, :]).astype(np.float32)
        b = (model.intercept_ - (model.coef_ * (scaler.mean_ / scaler.scale_)[None, :]).sum(axis=1)).astype(np.float32)
        # Selection evaluates the same folded float32 head that will be exported.
        logits = x[val] @ w.T + b
        report = metrics(val_y, probabilities(logits), val_items)
        candidates.append({"C": c, "converged": converged, "iterations": int(model.n_iter_.max()), "validation": report})
        key = (report["macro_f1"], report["balanced_accuracy"])
        if converged and key > best_key:
            best = {"C": c, "weights": w, "bias": b, "logits": logits}
            best_key = key
        print(json.dumps({"phase": "category_candidate", "backbone": backbone, "C": c, "converged": converged, "validation_macro_f1": report["macro_f1"], "validation_balanced_accuracy": report["balanced_accuracy"]}), flush=True)
    if best is None:
        raise RuntimeError("No registered candidate converged; no result selected.")
    temperatures = np.round(np.arange(.5, 4.001, .05), 2)
    temperature = float(min(temperatures, key=lambda t: log_loss(val_y, probabilities(best["logits"], t), labels=list(range(len(CLASSES))))))
    np.savez(head_path(backbone), backbone=backbone, kind="linear", classes=np.asarray(CLASSES), C=best["C"], weights=best["weights"], bias=best["bias"], temperature=temperature)
    p = probabilities(best["logits"], temperature)
    report = {
        "version": VERSION, "backbone": backbone, "head": "linear", "C": best["C"], "temperature": temperature,
        "validation": metrics(val_y, p, val_items), "source_validation": source_metrics(val_y, p, val_items),
        "candidates": candidates, "cohort": summary, "artifact": artifact_identity(backbone),
        "test_opened": False, "available": False,
    }
    write_json(validation_path(backbone), report)
    print(json.dumps({"phase": "category_fit_complete", "backbone": backbone, "C": best["C"], "temperature": temperature, "validation_macro_f1": report["validation"]["macro_f1"]}), flush=True)


def lock_selection():
    protocol()
    if (MODEL / "test-lock.json").exists() and not SELECTION_PATH.exists():
        raise RuntimeError("Related shared test already opened before category selection was locked.")
    candidates = []
    for backbone in BACKBONES:
        report = json.loads(validation_path(backbone).read_text(encoding="utf-8"))
        if report["artifact"] != artifact_identity(backbone):
            raise RuntimeError("Candidate artifact or cohort changed after validation")
        candidates.append(report)
    selected = max(candidates, key=lambda r: (r["validation"]["macro_f1"], r["validation"]["balanced_accuracy"]))
    value = {
        "version": VERSION, "selected": selected["artifact"],
        "category_assignment_sha256": selected["cohort"]["category_assignment_sha256"],
        "candidate_validation_sha256": {name: sha256(validation_path(name)) for name in BACKBONES},
        "selection_basis": "Validation only; no test predictions examined",
    }
    if SELECTION_PATH.exists() and json.loads(SELECTION_PATH.read_text(encoding="utf-8")) != value:
        raise RuntimeError("Category selection lock is immutable")
    if not SELECTION_PATH.exists():
        write_json(SELECTION_PATH, value)
    print(json.dumps({"phase": "category_selection_locked", "backbone": selected["backbone"], "head_sha256": value["selected"]["head_sha256"]}), flush=True)
    return value


def supported_classes(report):
    result = {}
    for key, values in report["per_class"].items():
        checks = {
            "precision": values["precision"] >= MINIMUMS["precision"],
            "recall": values["recall"] >= MINIMUMS["recall"],
            "independent_groups": values["independent_group_support"] >= MINIMUMS["independent_test_groups"],
            "named_category": key != "other",
        }
        result[key] = {
            "benchmark_minimums_passed": all(checks.values()), "checks": checks,
            "professional_review_always": key in LESION_REVIEW,
            "cancer_related": key in CANCER_RELATED,
            "cosmetic_matching_category": key in {"acne", "dermatitis"},
            "clinically_validated": False,
        }
    return result


def evaluate():
    if not SELECTION_PATH.exists():
        raise RuntimeError("Explicitly lock both completed validation candidates before opening the final test")
    selection = lock_selection()
    backbone = selection["selected"]["backbone"]
    lock = {"selection_lock_sha256": sha256(SELECTION_PATH), **selection["selected"]}
    if TEST_LOCK_PATH.exists() and json.loads(TEST_LOCK_PATH.read_text(encoding="utf-8")) != lock:
        raise RuntimeError("Category test was already opened with a different model or cohort")
    if not TEST_LOCK_PATH.exists():
        write_json(TEST_LOCK_PATH, lock)
    items, x, rows, summary = category_features(backbone)
    if summary["category_assignment_sha256"] != selection["category_assignment_sha256"]:
        raise RuntimeError("Category assignments changed after selection")
    test = np.asarray([item["split"] == "test" for item in items])
    test_items = [item for item in items if item["split"] == "test"]
    y = np.asarray([CLASSES.index(item["category"]) for item in test_items])
    with np.load(head_path(backbone), allow_pickle=False) as head:
        if head["classes"].tolist() != CLASSES:
            raise ValueError("Artifact class order differs from protocol")
        temperature = float(head["temperature"])
        p = probabilities(x[test] @ head["weights"].T + head["bias"], temperature)
    report = metrics(y, p, test_items)
    sources = source_metrics(y, p, test_items)
    readiness = supported_classes(report)
    source_readiness = {source: supported_classes(source_report) for source, source_report in sources.items()}
    pred = p.argmax(axis=1)
    margin = np.sort(p, axis=1)[:, -1] - np.sort(p, axis=1)[:, -2]
    numeric_accept = (p.max(axis=1) >= SCORE_MIN) & (margin >= MARGIN_MIN) & (pred != CLASSES.index("other"))
    benchmark_accept = numeric_accept & np.asarray([readiness[CLASSES[i]]["benchmark_minimums_passed"] for i in pred])
    predictions = [{"id": item["id"], "source": item["source"], "category": item["category"], "duplicate_group": item["duplicate_group"], "scores": p[i].tolist(), "numeric_threshold_met": bool(numeric_accept[i]), "benchmark_supported_prediction": bool(benchmark_accept[i]), "professional_review_always": CLASSES[pred[i]] in LESION_REVIEW} for i, item in enumerate(test_items)]
    subgroups = {}
    for source, annotation in [("SCIN", "monk_skin_tone_us"), ("Fitzpatrick17k-C", "skin_type_annotation")]:
        groups = collections.defaultdict(list)
        for i, item in enumerate(test_items):
            if item["source"] == source:
                group = str(rows[item["id"]].get(annotation) or "unknown")
                groups[group].append(i)
        subgroups[source] = {group: metrics(y[indices], p[indices], [test_items[i] for i in indices]) for group, indices in sorted(groups.items())}
    validation = json.loads(validation_path(backbone).read_text(encoding="utf-8"))
    result = {
        "version": VERSION, "available": False, "release_status": "Research results require review; no automatic deployment or clinical validity",
        "backbone": backbone, "temperature": temperature, "classes": CLASSES, "test": report,
        "source_test": sources, "per_category_readiness": readiness, "source_category_readiness": source_readiness,
        "validation": validation["validation"], "source_validation": validation["source_validation"],
        "selective": {
            "numeric_threshold_count": int(numeric_accept.sum()),
            "benchmark_supported_count": int(benchmark_accept.sum()), "coverage": float(benchmark_accept.mean()),
            "accuracy": float((pred[benchmark_accept] == y[benchmark_accept]).mean()) if benchmark_accept.any() else None,
            "note": "Subset defined by predeclared score rules and post-evaluation class support; descriptive and not an independently validated operating point",
        },
        "descriptive_skin_annotation_subgroups": subgroups,
        "subgroup_limitations": "Small unbalanced subsets, source-specific annotation schemes, no fairness guarantee; Wilson intervals are image/case-level and do not resolve patient dependence",
        "cohort": summary, "lock": lock, "protocol": protocol(),
    }
    write_json(MODEL / "categories-evaluation.json", result)
    write_json(MODEL / "categories-test-predictions.json", predictions)
    print(json.dumps({"phase": "categories_test_complete", "backbone": backbone, "macro_f1": report["macro_f1"], "accuracy": report["accuracy"], "supported_benchmark_categories": [key for key, value in readiness.items() if value["benchmark_minimums_passed"]], "available": False}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["protocol", "fit", "lock", "evaluate"])
    parser.add_argument("--backbone", choices=BACKBONES, default=BACKBONES[0])
    args = parser.parse_args()
    setup()
    protocol()
    if args.phase == "fit":
        fit(args.backbone)
    elif args.phase == "lock":
        lock_selection()
    elif args.phase == "evaluate":
        evaluate()


if __name__ == "__main__":
    main()
