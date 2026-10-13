# SCIN photograph model — measured research evaluation

Version `skinsnap-scin-mobilenet-v1`; seed `20261012`. All measurements below are from this repository's real training/inference run. The new photo model is separate from the existing dermoscopic classifier. **Engineering availability gate: failed; photo inference unavailable; clinical validation: not performed.** A passed gate is a modest internal research benchmark, not medical readiness.

## Metadata repair and previously examined evaluation

The initial experiment incorrectly parsed SCIN body-part flags (`YES`/blank) as if only `true` indicated a location. It therefore failed to exclude flagged sensitive locations and produced empty body-part lists. Its script, cohort, checkpoint, and evaluation are retained as `models/clinical/pre_audit_*` for disclosure; those artifacts are not served for inference. That initial run measured macro-F1 0.3964 and acne recall 0.100 (1/10), and already failed the declared gate.

The parser was corrected, the same predefined selection/training procedure rerun, and the existing engineering thresholds left unchanged. **129/148 current test cases had appeared in the initial, already examined test partition. The corrected test is exploratory and is not an untouched independent holdout.** Availability remains false both because the performance minimums fail and because independent evaluation is missing. No claim of restored test independence is made by assigning a new split label. New model selection or a revised taxonomy requires an independently frozen evaluation cohort.

## Frozen cohort

Google SCIN release `1.0.0`; selected public photographs with retrospectively assigned dermatologist differential labels. One first image per case, excluding genitalia/groin and buttocks. Acne uses a differential weight at least 0.50; dermatitis combines five documented eczema/contact/dermatitis labels at a combined weight at least 0.50; other is a heterogeneous, strongly labeled source mixture with little acne/dermatitis differential weight. Other is always unsupported for condition-based matching. See [the model card](CLINICAL_MODEL_CARD.md) for exact mappings and licenses.

The five-name dermatitis mapping omits source synonyms, including `Acute and chronic dermatitis`. That source label occurs in the deterministic `other` demo. Reported scores measure agreement with this incomplete predefined taxonomy, not comprehensive recognition of dermatitis. The observed test has not been silently relabeled to improve a metric.

| Partition | Acne | Dermatitis | Other | Total |
| --- | ---: | ---: | ---: | ---: |
| train | 28 | 257 | 191 | 476 |
| validation | 9 | 59 | 44 | 112 |
| test | 9 | 79 | 60 | 148 |

Eligible cases before deterministic caps: `{"acne": 46, "dermatitis": 886, "other": 952}`. Exclusions: `{"ambiguous_or_low_weight_differential": 857, "missing_label_or_image": 1768, "sensitive_body_location": 524}`. Download failures: `0`. Actual source metadata SHA-256 hashes and per-selected-image hashes are saved in `models/clinical/evaluation.json` and `cohort.json`.

The all-source exact-duplicate graph uses every case's image paths plus anonymous GCS object MD5s, including connections through excluded cases. Selected first images additionally receive source SHA-256, normalized-pixel SHA-256, and a conservative dHash distance-two check. Connected duplicate groups remain in one partition. Conflicting-label groups removed: 4; cases removed: 10; selected near-duplicate pairs: 11. Cases and duplicate groups have zero cross-partition intersections. Participant identifiers are not released: **patient independence cannot be established**. Hash checks do not prove no leakage; near hashes cover only selected first images. Multiple cases in a same-label duplicate group can remain within a partition; confidence intervals bootstrap duplicate groups to account partly for that dependence.

## Model selection and calibration

Frozen official TorchVision MobileNetV3-Small ImageNet1K-V1 convolutional features, global average pooling, and a trained 576-to-3 linear head. Input is full-image nearest resize to 128×128, white transparency compositing, EXIF orientation, ImageNet normalization, float32 NCHW. It is a deliberately inexpensive CPU baseline and loses fine detail.

Train-only feature standardization and balanced multinomial logistic regression use predeclared `C ∈ {0.01, 0.1, 1, 10}`; validation macro-F1 (balanced-accuracy tie-breaker) selected `C=0.01`. Scaler parameters are folded into the exported linear head. Corrected-test observations were not used to choose C, temperature, thresholds, or demo outputs, but most cases overlap the examined initial test, so this is not independent evaluation.

Validation-only temperature fit minimized NLL over the fixed 0.50–3.00 step-0.05 grid: **temperature 1.45**. Validation NLL: 0.9051 before, 0.8841 after. Validation ECE (10 bins): 0.1626 before, 0.1416 after. Scaled scores are not probabilities of disease. Artificial cohort prevalence and small support limit calibration transfer.

## Corrected exploratory test measurements

Accuracy **0.5203**; macro-F1 **0.3862**; balanced accuracy **0.3884**; NLL **0.8836**; 10-bin ECE **0.0807**; multiclass Brier score **0.5609**.

Case/duplicate-group bootstrap 95% intervals (2,000 resamples, seed 20261012): macro-F1 0.310–0.480; balanced accuracy 0.312–0.488. These measure sample uncertainty within this selected cohort, not external/general clinical validity.

| Source category | Correct / total | Recall | 95% Wilson recall interval | Precision | F1 |
| --- | ---: | ---: | --- | ---: | ---: |
| acne | 1/9 | 0.111 | 0.020–0.435 | 0.100 | 0.105 |
| dermatitis | 53/79 | 0.671 | 0.561–0.764 | 0.582 | 0.624 |
| other | 23/60 | 0.383 | 0.271–0.510 | 0.489 | 0.430 |

Acne support is particularly small; a high point estimate can have a wide interval. Wilson intervals assume binomial cases and can understate remaining contributor dependence. No condition-specific clinical performance is established.

Confusion matrix, true rows and predicted columns ordered `[acne, dermatitis, other]`:

```json
[
  [
    1,
    6,
    2
  ],
  [
    4,
    53,
    22
  ],
  [
    5,
    32,
    23
  ]
]
```

Fixed research rejection rules require top score ≥0.65 and top-two margin ≥0.15; other always rejects. Accepted 36/148 cases (coverage 0.243); accuracy on accepted cases 0.6111111111111112. These are heuristic score rejection rules, not validated OOD detection or safe clinical triage.

The performance minimums were declared before the initial evaluation: macro-F1 ≥0.60, balanced accuracy ≥0.60, acne recall ≥0.50, dermatitis recall ≥0.50. Actual corrected values: `{"macro_f1": 0.3862330372385058, "balanced_accuracy": 0.3884435067979372, "acne_recall": 0.1111111111111111, "dermatitis_recall": 0.6708860759493671}`. Gate thresholds are unchanged regardless of outcome. Benchmark minimums passed: `False`; independent holdout: `False`; release available: `False`.

## Subgroups and known failure cases

Estimated US-grader Monk skin-tone subgroups: `{"Monk 1-4": {"n": 128, "class_counts": {"acne": 8, "dermatitis": 68, "other": 52}, "accuracy": 0.5234375, "limitation": "Small estimated skin-tone subgroups; no fairness or clinical validity established."}, "Monk 5-10": {"n": 19, "class_counts": {"acne": 1, "dermatitis": 11, "other": 7}, "accuracy": 0.5263157894736842, "limitation": "Small estimated skin-tone subgroups; no fairness or clinical validity established."}}`. Estimated tone is not a clinical pigmentation assessment. Small, imbalanced subgroup support prevents fairness conclusions. No external population, adolescent cohort, real-world prevalence, prospective clinician comparison, ingredient-response outcomes, infection/cancer exclusion, or clinical trial has been evaluated.

Body location, backgrounds, framing, and color can become shortcuts: acne may disproportionately appear on head/neck while dermatitis includes limbs/trunk. The model may confuse look-alike rashes, misread unfamiliar cameras/lighting/skin tones, or confidently misclassify an unsupported condition. `other` is finite; ordinary objects and unrepresented disease are not guaranteed to reject. Never interpret an output as an all-clear or select a prescription/product treatment from it.

## Real artifact and demo checks

The PyTorch checkpoint and ONNX are real trained artifacts with SHA-256 recorded in the manifest. ONNX outputs actual logits and `576×4×4` activations; class activation maps use the trained folded linear weights. Three attributed public test samples are chosen deterministically by source class and case ID, preferring case metadata without a head/neck flag, **not by whether their predictions are correct**. This is a metadata preference, not verified anatomy: the acne sample visibly shows a close-up cheek even though its released body-part field lists only `other`. Its source differential is equally weighted acne and rosacea; it is not a confirmed acne case. The dermatitis demo source label is `Allergic Contact Dermatitis`; the other demo source label is `Acute and chronic dermatitis`, illustrating the taxonomy omission described above.

Each demo is metadata-stripped and resized; modifications and actual source differentials are recorded. All three are run through PyTorch and ONNX, with logit maximum absolute errors recorded in `public/demo-clinical/manifest.json`. Demo outputs can be wrong or uncertain and are never manufactured. The consumer photo path remains unavailable and does not present stored sample scores as a live classification.

The artifact validation run passed **11 checks** with zero failures/errors. It verifies preprocessing, loaded-model outputs/CAM algebra, three real PyTorch–ONNX sample comparisons, hashes, case/duplicate separation, unchanged gates, rejection/domain rules, source/demo metadata, and the repaired YES/NO parser. These are engineering checks; they do not validate diagnosis or product effectiveness.

Reproduce training with `python scripts/clinical_model_train.py`, intervals/report with `python scripts/clinical_model_report.py`, and artifact checks with `python scripts/clinical_model_validate.py`. Install the pinned packages from `models/clinical/requirements-training.txt`. Source originals/cache are ignored under `data/clinical/`; no user uploads are used for training or retained by this pipeline. SCIN custom license and TorchVision code license are preserved. ImageNet-derived pretrained model commercial clearance remains incomplete; keep this model in research/education until rights and clinical deployment requirements are addressed.
