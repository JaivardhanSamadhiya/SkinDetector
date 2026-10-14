# Photo-v2 measured evaluation

Evaluated 14 October 2026. Values below come from executed inference and committed reports, not synthetic policy fixtures. The selected three-class model is frozen DINOv2 ViT-B/14 plus a linear head (`C=0.1`, validation temperature 1.85). All final selections were locked before their shared downstream test was opened. [The model card](PHOTO_MODEL_CARD.md) documents sources, preprocessing, licenses and leakage controls.

## Three-class reference model

Authoritative report: `models/photo-v2/evaluation.json`. Test size is 2,356 cases; validation size is 1,230. The test is new for SkinSnap downstream fitting, but patient independence and absence from backbone pretraining are unproved.

| Measure | Validation | Final test |
| --- | ---: | ---: |
| Accuracy | 84.07% | 83.83% |
| Macro-F1 | 0.7097 | 0.6575 |
| Balanced accuracy | 79.66% | 76.06% |
| 10-bin ECE | 0.00865 | 0.01637 |
| Multiclass Brier score | 0.23250 | 0.23780 |
| NLL | 0.38692 | 0.40435 |

| Test category | Support | Correct | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Acne-like | 80 | 64 | 51.20% | 80.00% | 0.6244 |
| Dermatitis-like | 198 | 123 | 34.45% | 62.12% | 0.4432 |
| Other / unsupported | 2,078 | 1,788 | 95.41% | 86.04% | 0.9049 |

Confusion matrix, rows = reference labels and columns = predicted labels:

| Reference \ prediction | Acne | Dermatitis | Other |
| --- | ---: | ---: | ---: |
| Acne | 64 | 2 | 14 |
| Dermatitis | 3 | 123 | 72 |
| Other | 58 | 232 | 1,788 |

The pooled engineering benchmark passes unchanged registered checks; this is not clinical validation. **The residual class is 88.20% of the test**, so 83.83% accuracy must not be advertised as high-accuracy disease identification. A trivial always-other classifier would score 88.20% on overall accuracy while failing supported-condition recall; this comparison illustrates why macro-F1, per-class precision/recall and accepted-subset behavior are essential.

The fixed 0.65 top-score / 0.15 margin rule, excluding predicted other, accepts **308/2,356 (13.07%)**, of which **147 are correct (47.73%)**. This failed useful condition-identification precision despite passing the broader engineering benchmark. V2 therefore keeps all website outputs uncertain and uses preference-only product matching. That post-test safety restriction is not a test-tuned validated operating point, and original scores/metrics remain unchanged.

## Source shift

| Source | Test cases | Accuracy | Macro-F1 | Balanced accuracy | Acne recall | Dermatitis precision / recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fitzpatrick17k-C atlas | 2,144 | 86.52% | 0.6214 | 71.69% | 64/80, 80.00% | 22.54% / 48/104, 46.15% |
| SCIN volunteer photos | 212 | 56.60% | 0.3749 | 58.96% | Not measured; zero examples | 52.08% / 75/94, 79.79% |

SCIN other recall is **45/118 (38.14%)** and source ECE is **0.22971**, versus atlas ECE **0.02443**. Pooling masks substantial domain shift. All independent acne validation/test examples come from the atlas, so the experiment provides no independent SCIN acne estimate or representative facial-acne validation. Source photographs, body locations, labels and population selection differ from arbitrary smartphone inputs.

## Failed dynamic-int8 deployment

Authoritative report: `models/photo-v2/onnx-evaluation.json`. The graph was actually executed on validation/test; the original experiment/report is preserved.

| Measure | Dynamic-int8 test |
| --- | ---: |
| Accuracy | 66.13% |
| Macro-F1 | 0.3067 |
| Balanced accuracy | 33.06% |
| Acne recall | 0/80, 0% |
| Dermatitis recall | 53/198, 26.77% |
| 10-bin ECE | 0.09799 |
| Accepted subset | 353 cases, 9.07% accuracy |

Validation-only recalibration selected temperature 4.0 for this graph. It did not repair the degradation. The int8 benchmark fails and is not eligible for deployment; it must not be substituted for the reference model or silently removed from evaluation history.

The separate serialization-repair protocol preserves original float32 weights, temperature 1.85 and every selection/evaluation lock. Its single float16-storage candidate failed predeclared validation parity, so original float32 was selected. Twelve fresh PyTorch/ONNX validation comparisons had maximum logit difference **0.00003433**, with matching top labels. Full actual ONNX validation/test remeasurement is now complete in `models/photo-v2/deployment-evaluation.json`: every one of the 2,356 reference test top labels matches, with maximum logit difference **0.00010014** against cached reference outputs, identical classification/accepted-subset metrics and only minor calibration floating-point differences. Immutable repair/repair-test locks record the same cohort and already opened test. This establishes technical fidelity, **not new independent model evaluation**. Actual Chromium 156 / ONNX Runtime Web 1.30.0 single-thread WASM verification subsequently passed on twelve fixed validation examples against fresh PyTorch: all twelve top labels agree, maximum normalized-tensor error **0.00000047684**, maximum logit error **0.00003195**. `models/photo-v2/browser-parity.json` immutably binds graph, preprocessing, head/cohort/repair/evaluation hashes. This confirms computation on those examples, not clinical validity, full-upload UI readiness or published hosting.

## Fourteen-category research experiment

Version `skinsnap-photo-categories-dinov2-v1`, report `models/photo-v2/categories-evaluation.json`. A separate predeclared exact-label taxonomy and train-only linear heads were validation-selected before either related test opened. Selected backbone is DINOv2 ViT-B/14 with linear head C=1.0 and validation temperature 2.75. Finer-label ambiguous/conflicting groups were removed without moving the surviving split assignments. Final test has **2,303 cases**.

Measured accuracy is **60.62%**, macro-F1 **0.4265**, balanced accuracy **46.37%**, ECE **0.05885**, Brier **0.54861**, and NLL **1.15381**. Per-category engineering minimums are precision at least 70%, recall at least 60%, and at least 30 distinct test groups. **No named category passes all requirements; deployment is false.**

| Category | Test cases | Precision | Recall | Passes category benchmark |
| --- | ---: | ---: | ---: | --- |
| Acne | 80 | 56.07% | 75.00% | No |
| Dermatitis | 159 | 30.83% | 51.57% | No |
| Psoriasis | 111 | 35.39% | 56.76% | No |
| Rosacea | 18 | 26.32% | 27.78% | No |
| Folliculitis | 37 | 31.25% | 40.54% | No |
| Urticaria | 37 | 22.92% | 29.73% | No |
| Lichen planus | 75 | 34.00% | 45.33% | No |
| Basal cell carcinoma | 99 | 56.31% | 58.59% | No |
| Squamous cell carcinoma | 72 | 37.86% | 54.17% | No |
| Melanoma | 85 | 57.61% | 62.35% | No |
| Actinic keratosis | 28 | 19.23% | 17.86% | No |
| Melanocytic nevus | 30 | 45.83% | 36.67% | No |
| Seborrheic keratosis | 11 | 33.33% | 27.27% | No |
| Other | 1,461 | 81.10% | 65.50% | Always unsupported |

Melanoma detection is **53/85**, with 32 missed reference melanoma labels; it cannot support cancer exclusion. Cancer-related scores never establish a diagnosis or justify skincare treatment. Small source/class subsets, particularly SCIN's cancer categories, do not permit supported source-specific claims. The 14-category report includes source matrices, calibration bins, per-class Wilson intervals, and descriptive source-specific skin-annotation subgroups. The subgroup annotations use different source schemes and small, imbalanced samples; they do not establish fairness or patient-level independence.

## What the results support

These runs establish real frozen-backbone feature extraction, trained heads, downstream evaluation, source-specific error analysis and an identified export failure. They do not fulfill high-accuracy arbitrary-face disease detection, acne severity identification, cancer screening, clinical probability calibration, individual tolerance prediction or medically optimal skincare ranking. A new, genuinely unexamined evaluation and improved representative labels/data are required before condition-linked recommendations can be considered. Future model selection must use development data; this opened test and all historical locks/reports remain preserved.
