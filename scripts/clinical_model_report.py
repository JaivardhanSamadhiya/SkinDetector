"""Render measured SCIN evaluation and uncertainty intervals without retraining.

This does not select a model, alter a split, or relax any availability gate.
"""
import collections
import json
import math
from pathlib import Path

import numpy as np
from sklearn.metrics import f1_score
from clinical_model_train import DEMO_VISUAL_AUDIT

ROOT = Path(__file__).resolve().parents[1]
CLASSES = ["acne", "dermatitis", "other"]


def wilson(k, n):
    if not n:
        return None
    z = 1.959963984540054
    center = (k / n + z * z / (2 * n)) / (1 + z * z / n)
    spread = z * math.sqrt((k / n) * (1 - k / n) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [max(0, center - spread), min(1, center + spread)]


def main():
    evaluation = json.loads((ROOT / "models/clinical/evaluation.json").read_text())
    cohort = json.loads((ROOT / "models/clinical/cohort.json").read_text())["rows"]
    predictions = json.loads((ROOT / "models/clinical/test_predictions.json").read_text())
    cohort_by_case = {row["case_id"]: row for row in cohort}
    demo_manifest_path = ROOT / "public/demo-clinical/manifest.json"
    demo_manifest = json.loads(demo_manifest_path.read_text())
    for demo in demo_manifest["images"]:
        row = cohort_by_case[demo["case_id"]]
        demo["body_parts"] = row["body_parts"]
        demo["visual_audit"] = DEMO_VISUAL_AUDIT.get(demo["case_id"], "Not manually reviewed; case metadata is not a verified first-image anatomy label.")
        demo["selection"] = "First case sorted by ID whose released case metadata lacks head_or_neck when available; metadata may be incomplete; not selected by output."
    demo_manifest_path.write_text(json.dumps(demo_manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    evaluation["demos"] = demo_manifest["images"]
    matrix = evaluation["test"]["confusion_matrix"]
    recall_intervals = {key: {"correct": matrix[i][i], "total": sum(matrix[i]), "interval": wilson(matrix[i][i], sum(matrix[i]))} for i, key in enumerate(CLASSES)}
    group_by_case = {row["case_id"]: row["duplicate_group"] for row in cohort}
    groups = collections.defaultdict(list)
    for i, row in enumerate(predictions):
        groups[group_by_case[row["case_id"]]].append(i)
    units = list(groups.values())
    y = np.array([CLASSES.index(row["label"]) for row in predictions])
    pred = np.array([np.argmax([row["scores"][key] for key in CLASSES]) for row in predictions])
    rng = np.random.default_rng(20261012)
    boot = []
    for _ in range(2000):
        indices = np.concatenate([units[i] for i in rng.integers(0, len(units), len(units))])
        # A missing class gets zero recall; fixed three-class denominator avoids optimistic omission.
        recalls = [float((pred[indices][y[indices] == c] == c).mean()) if (y[indices] == c).any() else 0. for c in range(3)]
        boot.append([f1_score(y[indices], pred[indices], labels=[0, 1, 2], average="macro", zero_division=0), np.mean(recalls)])
    intervals = np.quantile(np.asarray(boot), [.025, .975], axis=0)
    evaluation["test"]["uncertainty_intervals"] = {"per_class_recall_95_wilson": recall_intervals,
        "macro_f1_95_group_bootstrap": intervals[:, 0].tolist(), "balanced_accuracy_95_group_bootstrap": intervals[:, 1].tolist(),
        "bootstrap_resamples": 2000, "bootstrap_seed": 20261012, "test_duplicate_groups": len(units),
        "limitations": "Case/duplicate group bootstrap, not patient-level or clinical uncertainty. Wilson recall intervals treat cases as binomial observations and may understate dependence."}
    count_rows = "\n".join("| " + split + " | " + " | ".join(str(counts[key]) for key in CLASSES) + " | " + str(sum(counts.values())) + " |" for split, counts in evaluation["split_counts"].items())
    metric_rows = []
    for key in CLASSES:
        record = evaluation["test"]["per_class"][key]
        ci = recall_intervals[key]
        metric_rows.append(f"| {key} | {ci['correct']}/{ci['total']} | {record['recall']:.3f} | {ci['interval'][0]:.3f}–{ci['interval'][1]:.3f} | {record['precision']:.3f} | {record['f1-score']:.3f} |")
    t = evaluation["test"]
    val = evaluation["calibration"]
    dup = evaluation["duplicate_controls"]
    gate = evaluation["readiness"]
    previous = json.loads((ROOT / "models/clinical/pre_audit_evaluation.json").read_text())
    current_test = {row["case_id"] for row in cohort if row["split"] == "test"}
    prior_cohort = json.loads((ROOT / "models/clinical/pre_audit_cohort.json").read_text())["rows"]
    prior_test = {row["case_id"] for row in prior_cohort if row["split"] == "test"}
    overlap = len(current_test & prior_test)
    if overlap != evaluation["post_audit_test_overlap"] or gate["independent_holdout"] or gate["passed"]:
        raise ValueError("Known previously examined test history must not be advertised as an independent available release")
    validation_path = ROOT / "models/clinical/artifact_validation.json"
    verification = json.loads(validation_path.read_text()) if validation_path.exists() else None
    manifest = json.loads((ROOT / "public/model-clinical/manifest.json").read_text())
    if verification and (verification["checkpoint_sha256"] != manifest["checkpoint_sha256"] or verification["onnx_sha256"] != manifest["onnx"]["sha256"]):
        verification = None
    evaluation["artifact_validation"] = verification
    for target in [ROOT / "models/clinical/evaluation.json", ROOT / "public/model-clinical/evaluation.json"]:
        target.write_text(json.dumps(evaluation, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    verification_text = (f"The artifact validation run passed **{verification['tests_run']} checks** with zero failures/errors. "
                         "It verifies preprocessing, loaded-model outputs/CAM algebra, three real PyTorch–ONNX sample comparisons, hashes, "
                         "case/duplicate separation, unchanged gates, rejection/domain rules, source/demo metadata, and the repaired YES/NO parser. "
                         "These are engineering checks; they do not validate diagnosis or product effectiveness.") if verification and verification["successful"] else "Artifact checks have not yet produced a successful recorded run; run `python scripts/clinical_model_validate.py`."
    report = f"""# SCIN photograph model — measured research evaluation

Version `{evaluation['version']}`; seed `{evaluation['seed']}`. All measurements below are from this repository's real training/inference run. The new photo model is separate from the existing dermoscopic classifier. **Engineering availability gate: {'passed' if gate['passed'] else 'failed; photo inference unavailable'}; clinical validation: not performed.** A passed gate is a modest internal research benchmark, not medical readiness.

## Metadata repair and previously examined evaluation

The initial experiment incorrectly parsed SCIN body-part flags (`YES`/blank) as if only `true` indicated a location. It therefore failed to exclude flagged sensitive locations and produced empty body-part lists. Its script, cohort, checkpoint, and evaluation are retained as `models/clinical/pre_audit_*` for disclosure; those artifacts are not served for inference. That initial run measured macro-F1 {previous['test']['macro_f1']:.4f} and acne recall {previous['test']['per_class']['acne']['recall']:.3f} (1/10), and already failed the declared gate.

The parser was corrected, the same predefined selection/training procedure rerun, and the existing engineering thresholds left unchanged. **{overlap}/{len(current_test)} current test cases had appeared in the initial, already examined test partition. The corrected test is exploratory and is not an untouched independent holdout.** Availability remains false both because the performance minimums fail and because independent evaluation is missing. No claim of restored test independence is made by assigning a new split label. New model selection or a revised taxonomy requires an independently frozen evaluation cohort.

## Frozen cohort

Google SCIN release `{', '.join(evaluation['dataset_release'])}`; selected public photographs with retrospectively assigned dermatologist differential labels. One first image per case, excluding genitalia/groin and buttocks. Acne uses a differential weight at least 0.50; dermatitis combines five documented eczema/contact/dermatitis labels at a combined weight at least 0.50; other is a heterogeneous, strongly labeled source mixture with little acne/dermatitis differential weight. Other is always unsupported for condition-based matching. See [the model card](CLINICAL_MODEL_CARD.md) for exact mappings and licenses.

The five-name dermatitis mapping omits source synonyms, including `Acute and chronic dermatitis`. That source label occurs in the deterministic `other` demo. Reported scores measure agreement with this incomplete predefined taxonomy, not comprehensive recognition of dermatitis. The observed test has not been silently relabeled to improve a metric.

| Partition | Acne | Dermatitis | Other | Total |
| --- | ---: | ---: | ---: | ---: |
{count_rows}

Eligible cases before deterministic caps: `{json.dumps(evaluation['eligible_before_cap'])}`. Exclusions: `{json.dumps(evaluation['exclusions'])}`. Download failures: `{len(evaluation['download_failures'])}`. Actual source metadata SHA-256 hashes and per-selected-image hashes are saved in `models/clinical/evaluation.json` and `cohort.json`.

The all-source exact-duplicate graph uses every case's image paths plus anonymous GCS object MD5s, including connections through excluded cases. Selected first images additionally receive source SHA-256, normalized-pixel SHA-256, and a conservative dHash distance-two check. Connected duplicate groups remain in one partition. Conflicting-label groups removed: {dup['conflicting_label_groups_removed']}; cases removed: {dup['removed_cases']}; selected near-duplicate pairs: {dup['near_duplicate_pairs_dhash_distance_le_2']}. Cases and duplicate groups have zero cross-partition intersections. Participant identifiers are not released: **patient independence cannot be established**. Hash checks do not prove no leakage; near hashes cover only selected first images. Multiple cases in a same-label duplicate group can remain within a partition; confidence intervals bootstrap duplicate groups to account partly for that dependence.

## Model selection and calibration

Frozen official TorchVision MobileNetV3-Small ImageNet1K-V1 convolutional features, global average pooling, and a trained 576-to-3 linear head. Input is full-image nearest resize to 128×128, white transparency compositing, EXIF orientation, ImageNet normalization, float32 NCHW. It is a deliberately inexpensive CPU baseline and loses fine detail.

Train-only feature standardization and balanced multinomial logistic regression use predeclared `C ∈ {{0.01, 0.1, 1, 10}}`; validation macro-F1 (balanced-accuracy tie-breaker) selected `C={evaluation['training']['selected_C']}`. Scaler parameters are folded into the exported linear head. Corrected-test observations were not used to choose C, temperature, thresholds, or demo outputs, but most cases overlap the examined initial test, so this is not independent evaluation.

Validation-only temperature fit minimized NLL over the fixed 0.50–3.00 step-0.05 grid: **temperature {val['temperature']:.2f}**. Validation NLL: {val['validation_uncalibrated']['nll']:.4f} before, {val['validation_scaled']['nll']:.4f} after. Validation ECE (10 bins): {val['validation_uncalibrated']['ece_10_bins']:.4f} before, {val['validation_scaled']['ece_10_bins']:.4f} after. Scaled scores are not probabilities of disease. Artificial cohort prevalence and small support limit calibration transfer.

## Corrected exploratory test measurements

Accuracy **{t['accuracy']:.4f}**; macro-F1 **{t['macro_f1']:.4f}**; balanced accuracy **{t['balanced_accuracy']:.4f}**; NLL **{t['nll']:.4f}**; 10-bin ECE **{t['ece_10_bins']:.4f}**; multiclass Brier score **{t['brier_multiclass']:.4f}**.

Case/duplicate-group bootstrap 95% intervals (2,000 resamples, seed 20261012): macro-F1 {intervals[0, 0]:.3f}–{intervals[1, 0]:.3f}; balanced accuracy {intervals[0, 1]:.3f}–{intervals[1, 1]:.3f}. These measure sample uncertainty within this selected cohort, not external/general clinical validity.

| Source category | Correct / total | Recall | 95% Wilson recall interval | Precision | F1 |
| --- | ---: | ---: | --- | ---: | ---: |
{chr(10).join(metric_rows)}

Acne support is particularly small; a high point estimate can have a wide interval. Wilson intervals assume binomial cases and can understate remaining contributor dependence. No condition-specific clinical performance is established.

Confusion matrix, true rows and predicted columns ordered `[acne, dermatitis, other]`:

```json
{json.dumps(t['confusion_matrix'], indent=2)}
```

Fixed research rejection rules require top score ≥0.65 and top-two margin ≥0.15; other always rejects. Accepted {t['selective']['accepted']}/{t['selective']['total']} cases (coverage {t['selective']['coverage']:.3f}); accuracy on accepted cases {t['selective']['accuracy_on_accepted'] if t['selective']['accuracy_on_accepted'] is not None else 'not available'}. These are heuristic score rejection rules, not validated OOD detection or safe clinical triage.

The performance minimums were declared before the initial evaluation: macro-F1 ≥0.60, balanced accuracy ≥0.60, acne recall ≥0.50, dermatitis recall ≥0.50. Actual corrected values: `{json.dumps(gate['measured'])}`. Gate thresholds are unchanged regardless of outcome. Benchmark minimums passed: `{gate['benchmark_minimums_passed']}`; independent holdout: `{gate['independent_holdout']}`; release available: `{gate['passed']}`.

## Subgroups and known failure cases

Estimated US-grader Monk skin-tone subgroups: `{json.dumps(evaluation['subgroups'])}`. Estimated tone is not a clinical pigmentation assessment. Small, imbalanced subgroup support prevents fairness conclusions. No external population, adolescent cohort, real-world prevalence, prospective clinician comparison, ingredient-response outcomes, infection/cancer exclusion, or clinical trial has been evaluated.

Body location, backgrounds, framing, and color can become shortcuts: acne may disproportionately appear on head/neck while dermatitis includes limbs/trunk. The model may confuse look-alike rashes, misread unfamiliar cameras/lighting/skin tones, or confidently misclassify an unsupported condition. `other` is finite; ordinary objects and unrepresented disease are not guaranteed to reject. Never interpret an output as an all-clear or select a prescription/product treatment from it.

## Real artifact and demo checks

The PyTorch checkpoint and ONNX are real trained artifacts with SHA-256 recorded in the manifest. ONNX outputs actual logits and `576×4×4` activations; class activation maps use the trained folded linear weights. Three attributed public test samples are chosen deterministically by source class and case ID, preferring case metadata without a head/neck flag, **not by whether their predictions are correct**. This is a metadata preference, not verified anatomy: the acne sample visibly shows a close-up cheek even though its released body-part field lists only `other`. Its source differential is equally weighted acne and rosacea; it is not a confirmed acne case. The dermatitis demo source label is `Allergic Contact Dermatitis`; the other demo source label is `Acute and chronic dermatitis`, illustrating the taxonomy omission described above.

Each demo is metadata-stripped and resized; modifications and actual source differentials are recorded. All three are run through PyTorch and ONNX, with logit maximum absolute errors recorded in `public/demo-clinical/manifest.json`. Demo outputs can be wrong or uncertain and are never manufactured. The consumer photo path remains unavailable and does not present stored sample scores as a live classification.

{verification_text}

Reproduce training with `python scripts/clinical_model_train.py`, intervals/report with `python scripts/clinical_model_report.py`, and artifact checks with `python scripts/clinical_model_validate.py`. Install the pinned packages from `models/clinical/requirements-training.txt`. Source originals/cache are ignored under `data/clinical/`; no user uploads are used for training or retained by this pipeline. SCIN custom license and TorchVision code license are preserved. ImageNet-derived pretrained model commercial clearance remains incomplete; keep this model in research/education until rights and clinical deployment requirements are addressed.
"""
    (ROOT / "docs/CLINICAL_EVALUATION_REPORT.md").write_text(report, encoding="utf-8")
    print(json.dumps({"report_written": True, "readiness_passed": gate["passed"], "independent_holdout": False,
                      "previously_examined_test_overlap": overlap, "artifact_checks_passed": verification["tests_run"] if verification and verification["successful"] else 0,
                      "recall_intervals": recall_intervals,
                      "macro_f1_interval": intervals[:, 0].tolist(), "balanced_accuracy_interval": intervals[:, 1].tolist()}))


if __name__ == "__main__":
    main()
