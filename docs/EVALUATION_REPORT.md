# SkinSnap measured evaluation

**Run:** October 11, 2026 · **Model:** `skinsnap-derma-cnn-v1` · **Dataset:** DermaMNIST-C 28 / HAM10000. All values below come from executed training and inference artifacts. Full-precision results, training history, calibration bins and subgroup confusion matrices are in [`models/evaluation.json`](../models/evaluation.json), mirrored in [`public/model-report.json`](../public/model-report.json). Rounded tables do not imply clinical validity.

## Protocol and leakage controls

The published corrected release had 8,215 training, 573 validation and 1,227 test images. Before optimization, the pipeline asserted lesion-ID disjointness and metadata/array label alignment. It checked SHA-256 hashes of RGB28 pixels and near-duplicate pairs using 64-bit difference-hash Hamming distance ≤2 **and** mean absolute RGB difference ≤12. Four candidate cross-partition pairs caused whole-lesion purging of nine test images. No validation images were purged. Retained partitions were:

| Partition | Images | Known lesions |
| --- | ---: | ---: |
| Train | 8,215 | 5,758 |
| Validation | 573 | 563 |
| Test | 1,218 | 1,145 |

No test image was moved to training. Duplicate purges used image similarity and lesion identifiers before fitting, without model predictions. The heuristic is not exhaustive and may remove similar images; it does not prove all leakage is absent. Multiple images of the same known lesion can remain within a partition. Patient IDs are unavailable, so different lesions from one patient might occur across partitions. Metrics are image-level and no independent-patient confidence interval is reported.

The 50-epoch run selected epoch 30 by validation macro-F1. Temperature was fitted on the same validation partition. The retained test partition was then evaluated after weight/checkpoint/calibration selection; no test-driven retraining or threshold selection occurred. `models/split_manifest.csv` records each retained image, lesion, label, split and pixel digest. [Training details](TRAINING.md) and [model card](MODEL_CARD.md) contain the full procedure.

## Class imbalance and per-class test performance

| ID | Training support | Validation support | Test support | Test precision | Test recall | Test F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `akiec` | 273 | 19 | 35 | 0.4490 | 0.6286 | 0.5238 |
| `bcc` | 448 | 22 | 44 | 0.4364 | 0.5455 | 0.4848 |
| `bkl` | 944 | 50 | 105 | 0.5254 | 0.5905 | 0.5561 |
| `df` | 102 | 5 | 8 | 0.4286 | 0.7500 | 0.5455 |
| `mel` | 1,021 | 22 | 70 | 0.5132 | 0.5571 | 0.5342 |
| `nv` | 5,309 | 448 | 939 | 0.9640 | 0.9116 | 0.9371 |
| `vasc` | 118 | 7 | 17 | 0.8333 | 0.8824 | 0.8571 |

Full label names are in the [model card](MODEL_CARD.md). Nevi account for 939 of 1,218 test images (77.1%), so aggregate accuracy can obscure weak performance on other classes. Supports of eight dermatofibroma images and 17 vascular images are too small to establish robust performance.

| Test measure | Measured value |
| --- | ---: |
| Correct labels / all images | 1,024 / 1,218 |
| Accuracy | 0.8407224959 |
| Macro-F1, mean over seven labels | 0.6340872972 |
| Balanced accuracy, mean per-class recall | 0.6950865795 |
| Negative log-likelihood, temperature 0.8 | 0.4248053432 |
| Multiclass Brier score, sum across classes | 0.2128534823 |
| Top-label ECE, ten equal-width bins | 0.0227821927 |

**Melanoma-reference images:** 39 were labeled melanoma and 31 were labeled something else. Those 31 were assigned `bkl` (14), `nv` (10), `akiec` (6) and `bcc` (1). This baseline is unsuitable for excluding melanoma or deciding that care is unnecessary.

## Confusion matrix

Rows are reference labels; columns are predicted labels. Counts cover all retained test images before abstention. Temperature scaling does not change the highest-logit label.

| Reference → predicted | akiec | bcc | bkl | df | mel | nv | vasc |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| akiec | 22 | 7 | 5 | 0 | 1 | 0 | 0 |
| bcc | 9 | 24 | 4 | 0 | 2 | 3 | 2 |
| bkl | 3 | 10 | 62 | 3 | 10 | 17 | 0 |
| df | 0 | 0 | 0 | 6 | 0 | 2 | 0 |
| mel | 6 | 1 | 14 | 0 | 39 | 10 | 0 |
| nv | 9 | 11 | 33 | 5 | 24 | 856 | 1 |
| vasc | 0 | 2 | 0 | 0 | 0 | 0 | 15 |

## Calibration and rejection

Validation NLL selected temperature 0.8 over a fixed 0.5–5.0 grid (step 0.025). Validation NLL changed from 0.42334 to 0.41381 and validation ECE from 0.04822 to 0.02913. This reuses checkpoint-selection data; there is no separate calibration cohort. On the untouched test set, top-label ECE changed from 0.04274 to 0.02278, and NLL from 0.43142 to 0.42481. ECE depends on binning and population; this result does not convert scores into medically valid disease probabilities.

The fixed research rule accepts a score only when the top score is ≥0.65 and its margin over the second score is ≥0.15. With the fitted temperature, it accepted 990/1,218 images (**81.28% coverage**) and rejected 228. Accepted-label accuracy was 926/990 (**93.54%**), leaving **64 wrong accepted labels**. Among the 70 melanoma-reference images, 34 were rejected and 36 were accepted; only 25 of the accepted images received the melanoma label, and **11 accepted images were wrongly labeled**. An accepted output is not a clinical reassurance.

The quality heuristics and user domain declaration are API/runtime safeguards. The benchmark metrics apply the score/margin rule to all test outputs; they do not measure the effect of the upload quality gate or prove technical-quality thresholds are medically suitable. There is no measured out-of-domain performance or validated automatic unsupported-image rejection.

## Descriptive subgroup results

These are exploratory image-level summaries using metadata that actually exists. They do not adjust for class balance, source equipment, age or other confounders. Small and unknown groups are especially unstable. The implementation averages over the same seven labels in every group, assigning zero recall/F1 to absent classes; subgroup “balanced accuracy” therefore means **fixed seven-label mean recall**, not a mean restricted to labels present in that group.

| Metadata field / group | Images | Accuracy | Macro-F1 | Seven-label mean recall | 10-bin ECE |
| --- | ---: | ---: | ---: | ---: | ---: |
| Recorded sex / female | 556 | 0.8543 | 0.6478 | 0.6707 | 0.03582 |
| Recorded sex / male | 653 | 0.8285 | 0.6113 | 0.7411 | 0.02496 |
| Recorded sex / unknown | 9 | 0.8889 | 0.2762 | 0.2679 | 0.20465 |
| Source / vidir_modern | 171 | 0.6550 | 0.4368 | 0.4714 | 0.07837 |
| Source / rosendahl | 212 | 0.5519 | 0.3805 | 0.3893 | 0.10056 |
| Source / vienna_dias | 45 | 0.6889 | 0.4599 | 0.6282 | 0.17032 |
| Source / vidir_molemax | 790 | 0.9671 | 0.5400 | 0.5282 | 0.02293 |
| Age / 50 and over | 688 | 0.7892 | 0.6330 | 0.6889 | 0.03940 |
| Age / under 50 | 519 | 0.9075 | 0.6015 | 0.8183 | 0.02893 |
| Age / unknown | 11 | 0.9091 | 0.2782 | 0.2714 | 0.18895 |

The source-cohort difference is a known failure signal, but this split is not an external-source holdout: all source labels can appear in training. **Skin-tone labels and patient IDs are absent.** Skin-tone fairness, patient-level performance and a representative general-population error rate have not been measured. Skin tone was not estimated from images to fill that gap.

## Verification performed

`python scripts/model_verify.py --recompute-heldout` completed successfully. It checked the publisher's two source MD5s, reconstructed cleaned splits and duplicate purges, matched every row of the saved split manifest, reproduced training normalization, executed the saved checkpoint on all 1,218 held-out images and matched stored logits/labels and measured metrics. It also verified checkpoint/ONNX SHA-256 values, ONNX graph structure, CAM weights, public-report parity and all saved test/calibration metrics. This is repeated inference with frozen weights, not a new fit.

All three licensed demo images were chosen as the first retained test image for the relevant label, independent of the prediction. Their actual PyTorch outputs were:

| Image ID | Reference label | Top model label | Top scaled score | Runtime state |
| --- | --- | --- | ---: | --- |
| ISIC_0024698 | nv | nv | 0.916932 | assessed by research rule |
| ISIC_0031177 | mel | mel | 0.738065 | assessed by research rule |
| ISIC_0032384 | bcc | bcc | 0.582623 | uncertain |

Demo images remain part of the original measured test set; running the demo adds no independent validation. `models/browser_parity.json` contains freshly executed PyTorch outputs for browser comparison. ONNX structural checking alone does not establish browser runtime parity; see the final application validation record for separately executed browser checks.

`python -m pytest backend/tests -q` passed **67 tests**, including image-content/MIME validation, orientation, preprocessing, genuine checkpoint inference, output schema, malformed artifacts, unsupported domains, error states, request limits and cleanup on busy responses. A Starlette/FastAPI warning notes deprecated use of the httpx TestClient adapter; it is not a model-validation finding.

The current result is a reproducible low-resolution research baseline. External/prospective validation, patient independence, skin-tone performance, deployment-device generalization and medical utility remain unestablished.
