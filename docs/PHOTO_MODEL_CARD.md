# SkinSnap photo-v2 research model

Version: `skinsnap-photo-dinov2-v2`, evaluated 14 October 2026. This is a genuine three-class appearance classifier trained on public skin photographs, separate from the retained dermoscopic CNN and historical SCIN MobileNet baseline. It does not diagnose skin disease, grade acne, identify arbitrary facial findings, exclude cancer, or predict product response.

**Release boundary:** the original trained model passes its predeclared engineering benchmark, but only **147 of 308 threshold-accepted test predictions were correct (47.7%)**. These results do not justify condition-specific product recommendations. The website's v2 research path therefore keeps every result uncertain and uses survey-only cosmetic catalog matching. This restriction was added after reviewing the test; it is a safety restriction, not a newly validated operating point or a change to the reported experiment. Float32 ONNX repair remeasurement and actual Chromium WASM verification are complete. Final full-UI checks/publication remain pending at this checkpoint. The failed int8 graph must not be activated.

## Supported research task

The ordered outputs are `acne` / Acne-like appearance, `dermatitis` / Dermatitis-like appearance, and `other` / Other / unsupported appearance. They measure agreement with the source-label grouping, not clinical diagnosis. The broad dermatitis mapping includes selected eczema/contact/acute/chronic differential labels; it cannot establish cause or identify every dermatitis subtype. All other conditions belong to a heterogeneous residual category. That category is neither normal skin nor a validated out-of-distribution detector.

Fitzpatrick17k-C acne mapping uses the exact labels `acne` and `acne vulgaris`; dermatitis uses `eczema`, `allergic contact dermatitis`, and `dyshidrotic eczema`. SCIN uses the exact predeclared weighted-differential mapping in `models/photo-v2/protocol.json`. There is no filename-based classification, generic language-model diagnosis, random score, or unconditional rosacea result.

The separately registered 14-category experiment includes cancer-related research labels, but **no category passed its fixed per-category benchmark and none is deployed**. Its measurements are in [the evaluation report](PHOTO_EVALUATION_REPORT.md). The three-class website model cannot identify cancer or offer a healthy all-clear.

## Data sources and permissions

- [SCIN](https://github.com/google-research-datasets/scin), Google LLC and consented US adult volunteer contributors: public photographs with retrospective dermatologist differentials rather than confirmed diagnoses. The [custom SCIN Data Use License](https://github.com/google-research-datasets/scin/blob/main/LICENSE) requires attribution and prohibits re-identification; a copy is retained in `models/clinical/licenses/SCIN_LICENSE.txt`. Source release metadata has 5,033 cases and up to three images per case. Sensitive body-location flags, ambiguous labels and acquisition failures are excluded by the registered preparation rules.
- [Fitzpatrick17k-C](https://zenodo.org/records/12739457), corrected by Kumar Abhishek, Aditi Jain and Ghassan Hamarneh: corrected metadata/partitions for original Fitzpatrick17k clinical-atlas images. Underlying source images originate from Atlas Dermatologico and DermaAmin, credited by [the original dataset authors](https://github.com/mattgroh/fitzpatrick17k). Original authors specify **CC BY-NC-SA 3.0**; corrected metadata is **CC BY 4.0** and does not relicense the photographs. Atlas Dermatologico separately permits noncommercial use with a link; DermaAmin's original terms were not independently confirmed. Atlas labels are not uniformly pathology-confirmed.
- [DINOv2](https://github.com/facebookresearch/dinov2), Meta AI: official frozen pretrained ViT-S/14 and ViT-B/14 weights and code under **Apache 2.0**. This is reused third-party representation learning, not a new backbone invented for SkinSnap. DINOv2 pretraining used a large web-image collection; overlap with downstream source images is unknown. Its license does not clear the separate downstream skin-image rights or clinical deployment.

This is a noncommercial research/education prototype. Image attribution, applicable share-alike conditions, privacy/personality rights, trained-artifact rights and clinical/regulatory review require further assessment before a paid or clinical launch. See [third-party notices](../THIRD_PARTY_NOTICES.md).

## Cohort and leakage controls

The combined cohort retains **12,452 cases and 14,319 image views**. Every training view is used with per-case weighting; validation/test use the first available image per case, never a prediction-selected view.

| Split | Acne | Dermatitis | Other | Cases |
| --- | ---: | ---: | ---: | ---: |
| Training | 324 | 1,044 | 7,498 | 8,866 |
| Validation | 39 | 128 | 1,063 | 1,230 |
| Final test | 80 | 198 | 2,078 | 2,356 |

The merge preserves the corrected atlas's published partitions. It joins source/decoded exact hashes, case views and 64-bit difference-hash neighbors with Hamming distance at most two into connected groups. Conflicting labels and groups spanning fixed partitions are removed. All previously examined SCIN cases and duplicate-linked legacy images are development-only; sentinel exposure records include older images excluded by the new acquisition. Cohort, preprocessing, feature provenance, head and selection/test locks are bound by hashes.

These controls reduce known duplicate leakage; they are not exhaustive. No participant/patient identifiers exist, so patient independence is unproved. “Untouched holdout” refers to this downstream fitting experiment, not DINOv2 pretraining or any prior external use of the public data. The published reference test is now opened and may not be used to tune another head, threshold, calibration or taxonomy.

## Architecture and training

The selected model is frozen **DINOv2 ViT-B/14**, final CLS token concatenated with mean patch tokens (1,536 features), followed by a trained three-output linear head. Training-only weighted standardization is folded into the exported linear weights. Seed is `20261013`. Predeclared linear regularization `C` values are 0.001, 0.01, 0.1, 1 and 10; predeclared landmark-RBF alternatives are also evaluated. Maximum pooled validation macro-F1 selects the candidate, with balanced-accuracy and simpler-candidate tie breakers. The selected head is linear `C=0.1`.

Per-case/per-class loss weighting addresses imbalance without changing the measured test prevalence. Frozen feature caches bind the pinned backbone source commit, pretrained file SHA-256, source-image hashes and preprocessing fingerprint. DINOv2 source is pinned at `7764ea0f912e53c92e82eb78a2a1631e92725fc8`; the selected official ViT-B/14 checkpoint SHA-256 is `0b8b82f85de91b424aded121c7e1dcc2b7bc6d0adeea651bf73a13307fad8c73`. CPU training ran on an Intel i7-1165G7 with approximately 16 GB RAM.

Preprocessing applies EXIF transpose, white compositing of transparency, full-image pixel-center nearest resize to RGB224, and float32 ImageNet normalization: mean `[0.485, 0.456, 0.406]`, standard deviation `[0.229, 0.224, 0.225]`, NCHW `[1,3,224,224]`. Source coordinates are `floor((destination + 0.5) * source_size / 224)`. Whole-image squaring changes aspect ratio; no face/lesion segmentation is inferred.

Temperature **1.85** minimizes validation NLL on the registered 0.50–4.00 grid in 0.05 steps. The same validation partition serves model selection and calibration. Calibrated research scores remain model scores, not personal medical probabilities; pooled low ECE does not resolve source shift, class-specific errors or clinical validity.

## Evaluation and operational uncertainty

Executed PyTorch inference on 2,356 downstream test cases measured accuracy **83.83%**, macro-F1 **0.6575**, balanced accuracy **76.06%**, acne recall **80.00%**, and dermatitis recall **62.12%**. However, acne precision is **51.20%** and dermatitis precision **34.45%**. The large residual class makes overall accuracy an inadequate headline for condition identification. SCIN accuracy is **56.60%**, with no independent acne examples in that source's test. See [full source and per-class results](PHOTO_EVALUATION_REPORT.md).

The registered benchmark requires macro-F1 and balanced accuracy at least 0.60; acne/dermatitis recall at least 0.50; sufficient distinct supported-class groups; SCIN dermatitis recall at least 0.50; and no previously examined test case/hash/group. Passing these engineering checks is not a clinical readiness claim. Registered score 0.65 / top-two-margin 0.15 rules reject the residual class and yield only **13.07% coverage and 47.73% accepted accuracy** on the test. They do not identify a reliable consumer operating point. V2 automatic condition-driven care remains disabled, including when its top score exceeds these values.

The model's quality checks assess resolution, blur and exposure heuristically. They cannot certify medical suitability or reliably establish supported photographic domain. A user-selected ordinary-photo domain is an assertion, not validated skin/face detection. New, changing, bleeding, painful, non-healing or persistent findings warrant qualified professional assessment independently of all scores.

## Export repair and browser artifact

The initial dynamic-int8 ONNX graph executed but degraded to macro-F1 **0.3067**, acne recall **0%**, and accepted accuracy **9.07%**; it failed deployment checks. Its reports, locks and hash-identified binary remain historical evidence. A separate registered serialization repair keeps the already selected backbone/head and original temperature unchanged. A single float16-constant-storage candidate failed strict validation parity (maximum absolute logit error **0.01115**, allowed below 0.005), so the byte-identical original float32 ONNX was selected. Fresh PyTorch versus float32 ONNX parity on the deterministic first 12 validation inputs measured maximum logit error **0.00003433**, with matching top labels.

The float32 graph is **346,452,970 bytes**, split into **17 same-origin parts no larger than 20 MiB**, each with its own SHA-256 plus a combined-artifact checksum (`7352670e61bf99e4f5264f1e5106eed8f3b63a5c1614e433becee9e84cf1baf8`). Full repaired-ONNX validation/test remeasurement is complete: all 2,356 test top labels and original classification metrics match, with maximum logit error **0.00010014** against cached reference outputs. The repair report explicitly records an already opened test; this is implementation fidelity, not new independent validation. Actual Chromium 156 / ONNX Runtime Web 1.30.0 single-thread WASM execution passed on the same twelve fixed validation examples against fresh PyTorch: all twelve top labels match, maximum normalized-tensor error 0.00000047684 and maximum logit error 0.00003195. Immutable evidence is in `models/photo-v2/browser-parity.json`; checksum/schema tests alone would not establish this. The public-copy finalizer validates this evidence without changing original locks/reports. Download size and graph memory are substantial mobile/slow-connection limitations; consult the manifest, repair report and dated [validation record](VALIDATION.md) for subsequent browser evidence.

No transformer explanation overlay is implemented for v2. The retained dermoscopic CNN has a genuine activation-map overlay; this does not transfer to DINOv2 or prove medical correctness.

## Reproduction and prohibited uses

Preparation, feature extraction, training, selection, export, evaluation and lock enforcement are implemented in `scripts/photo_dataset_prepare.py`, `photo_dataset_merge.py`, `photo_model_common.py`, `photo_model_train.py`, `photo_categories_train.py`, `photo_model_export.py`, `photo_model_deployment_repair.py`, and `run_photo_training.py`. Fresh PyTorch/browser parity and evidence-bound public activation use `photo_browser_verify.py`, `verify-photo-browser.mjs`, and `photo_model_enable_browser.py` (check-only before finalization). [The worker documentation](OVERNIGHT_TRAINING.md) gives ordered commands, safe resumption and source access. Original data, verification pixels/tensors, features and logs remain ignored; user uploads are never training inputs. Only generated public copies gain verified browser flags; original locked reports remain immutable snapshots.

Do not use the opened holdout to improve this run, remove failed reports, weaken gates, manufacture predictions, infer skin tone from images, diagnose or rule out disease, recommend prescription treatment, infer tolerance, make cancer screening claims, or deploy commercially without the required rights and regulatory assessment. Further improvement requires a genuinely new protocol and unexamined external evaluation, dermatologist-reviewed labels, representative smartphone/facial data, meaningful precision/recall/calibration and subgroup evidence, and prospective assessment of any intended clinical use.
