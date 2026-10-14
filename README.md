# SkinSnap

An education-first skin health website with separate image-classification research tasks and transparent cosmetic catalog matching. The active app replaces the old unconditional rosacea redirect and simulated checkout. **This is not a clinical diagnosis, screening service or a guarantee of the best product for an individual.**

The original January 2024 prototype and Git history are preserved in `legacy/`. The new repository is [SkinDetector](https://github.com/JaivardhanSamadhiya/SkinDetector); the original is [SkinSnap](https://github.com/JaivardhanSamadhiya/SkinSnap). [Read the audit and reuse disclosure](docs/REPOSITORY_AUDIT.md).

**Photo-model results (14 October 2026):** real training and final evaluation completed on a duplicate-controlled SCIN + corrected Fitzpatrick17k-C cohort of 12,452 cases / 14,319 views. Frozen DINOv2 ViT-B/14 plus a trained three-class linear head measured macro-F1 **0.6575** and balanced accuracy **76.06%** on 2,356 test cases. Although overall accuracy is **83.83%**, the fixed threshold-accepted subset was only **47.73% correct**, acne precision **51.20%**, and dermatitis precision **34.45%**. These results do not support high-accuracy condition identification or condition-specific skincare recommendations. [The full measured report](docs/PHOTO_EVALUATION_REPORT.md) includes source shift and all fourteen-category failures.

The source includes a survey-first upload workflow, numeric USD cap, complete eligible-basket selection, explained product alternatives/prices/links, and evidence-linked everyday habits. The v2 browser analyzer verifies split-file checksums and must pass actual browser execution before activation. Research outputs remain uncertain and do not drive condition-specific products; catalog matching uses preferences. The UnivaBio PDF is a local deliverable and is excluded from Git.

**Float32 repair and real browser verification passed:** the initial dynamic-int8 v2 graph failed with macro-F1 **0.3067** and **0% acne recall**; its history is preserved. A registered repair selected the unchanged original float32 graph after a single float16-storage candidate failed strict validation parity. Actual ONNX remeasurement on all 2,356 opened test inputs reproduced every reference top label and the original classification metrics, with maximum logit difference **0.00010014**. This is technical fidelity, not new independent validation. The artifact is about **346 MB in 17 checksum-verified parts**; real Chromium WASM execution passed on twelve fixed validation examples with matching fresh-PyTorch labels and maximum logit error 0.00003195. The final production build and all 27 application browser tests passed; the real photo workflow executes verified weights and displays survey-matched prices. Verified execution enables uncertain research scores, never diagnosis/cancer screening. The fourteen-category model has **zero passing named categories** and stays undeployed; dermoscopy remains a separate functioning research task.

**Private demo:** [Open SkinSnap](https://skinsnap-research-lab.jauntyghost8.chatgpt.site). The hosting gate permits the owner; no audience expansion was made. The current source passed **326 frontend unit tests, 27 browser tests, 74 photo-pipeline Python tests, production build and typecheck**, plus actual twelve-image Chromium/PyTorch numerical parity. Software checks verify integration, not clinical accuracy. See the [validation record](docs/VALIDATION.md) for dated executed checks and final deployment evidence.

## Implemented application

- Next.js App Router with TypeScript, Tailwind, accessible Radix-based controls, locally hosted typography, Lucide icons and responsive ivory/teal styling.
- Landing, analysis, results, conditions library, skincare education, how-it-works, research/transparency, about and startup pages, with a persistent keyboard-accessible Quick guide.
- JPEG/PNG/WebP browse, drop, mobile camera input, replacement, preview, 10 MB admission limit, bounded decode/orientation and explicit permission/domain choices.
- Resolution, blur and exposure feedback; unsupported images, uncertainty, unavailable weights and failures have honest states.
- Default on-device ONNX inference, verified model checksums and actual research-model scores. The dermoscopic CNN has a genuine CAM explanation with opacity controls; no transformer explanation overlay is claimed for photo-v2. The separate skin-photo task always runs on-device. Optional Python FastAPI inference supports the original dermoscopic checkpoint only.
- Session-only selected images/results with a deletion action; no image history database, retail checkout or invented purchase confirmations.
- A seven-item preferences survey, saved or explicitly skipped before analysis, and an automatically displayed morning/evening routine with selectable alternatives, manufacturer-verified facts, six dated US retail prices/seller links, and reuse of owned basics. A numeric USD cap chooses the highest-preference complete eligible basket that fits; otherwise it shows the cheapest complete eligible basket and shortfall without weakening ingredient restrictions. **V2 research outputs remain uncertain and cannot activate condition-based product rules.** Those future rules are tested with labeled software fixtures, not asserted as clinically validated recommendations. Dermoscopic lesion labels supply evaluation guidance, never lesion treatment. [Recommendation rules and sources](docs/SKINCARE_RECOMMENDATIONS.md).
- A startup presentation with an initial buyer, proposed revenue model, pilot targets and commercialization gates, all explicitly separated from measured traction.
- A standalone `/routine/` flow requiring no photo/model execution, with the same USD-cap basket selector and a separate manual checker for current local quotes, tax and delivery. Automatic selection uses dated catalog prices; live prices, stock, market-wide optimization and checkout are not implemented.
- Evidence-linked educational content, measured-report charts, dataset/model provenance, deployment templates and automated tests.

The original dermoscopic artifact has executed successfully in PyTorch and browser ONNX, with all three licensed demo images matching within display rounding. Each model has its own manifest, weights and evaluation report; do not transfer evidence between tasks. Photo inference requires measured benchmark/provenance checks and actual artifact/browser verification. V2's additional conservative uncertainty restriction prevents condition-specific care even after those computation checks pass. Read the [validation record](docs/VALIDATION.md) for actual executed inference and workflow checks.

## Separate models and data

### Photo-v2 ordinary skin-photo research task

`skinsnap-photo-dinov2-v2` uses frozen official DINOv2 ViT-B/14 CLS + mean-patch features (1,536 dimensions) and a trained three-output linear head (`C=0.1`). Full-image EXIF/white-alpha/pixel-center-nearest RGB224 preprocessing and ImageNet normalization are deterministic. Validation-only selection and temperature 1.85 calibration precede final test locking. SCIN volunteer differentials and corrected Fitzpatrick17k-C atlas labels support only acne-like, grouped dermatitis-like, and other/unsupported research appearances. No patient independence, arbitrary-face validation or skin-cancer detection is established.

The new downstream test excludes previously examined cases and duplicate-linked groups. The reference model's engineering gate passes, but poor supported-category precision and 47.73% accepted accuracy keep every v2 website result uncertain. The fourteen-category research head fails every named-category gate and is not a consumer detector. Float32 artifact repair/browser readiness is separately verified; the failed int8 export is preserved. [Model card](docs/PHOTO_MODEL_CARD.md), [measured report](docs/PHOTO_EVALUATION_REPORT.md), and [safe reproduction/handoff](docs/OVERNIGHT_TRAINING.md) document exact architecture, results and artifact status.

SCIN uses its custom Data Use License; original atlas photographs retain CC BY-NC-SA 3.0 research conditions and source attribution, while corrected metadata is CC BY 4.0. DINOv2 code/official weights are Apache 2.0. These separate rights do not clear commercial clinical deployment. No user's upload is used for training.

### Historical SCIN MobileNet baseline — unavailable

`skinsnap-scin-mobilenet-v1` uses frozen official TorchVision MobileNetV3-Small ImageNet1K-V1 features, global average pooling and a newly trained 576 → 3 linear head. The ordered labels are acne-like appearance, grouped dermatitis-like appearance, and other / unsupported appearance. This does not identify rosacea, arbitrary diseases, skin type, allergies or a healthy all-clear. The other category always abstains from condition-based catalog matching.

The corrected [SCIN](https://github.com/google-research-datasets/scin) cohort has 736 cases (46 acne), one image per case, retrospective dermatologist differential labels, and connected case/duplicate groups assigned to training (476), validation (112) and test (148). **129 of the 148 corrected test cases overlap the previously examined experiment, so the corrected measurements are exploratory rather than fresh independent validation.** These are not confirmed diagnoses. Participant IDs are unavailable, so patient independence is not established. The small acne class, selected US adult volunteer population and possible body-location/background shortcuts substantially limit generalization. The dataset uses the [custom SCIN Data Use License](https://github.com/google-research-datasets/scin/blob/main/LICENSE), with attribution and no re-identification; it is not the older dataset's CC BY-NC license. TorchVision's software license does not automatically clear ImageNet-derived pretrained weights for commercial use.

Preprocessing is full-image EXIF transpose, white compositing, pixel-center nearest resize to RGB128 and ImageNet normalization. Balanced multinomial logistic heads with predeclared regularization candidates are fitted on training features; selection and temperature fitting use validation only. The fixed numeric minimums are macro-F1 ≥ 0.60, balanced accuracy ≥ 0.60, acne recall ≥ 0.50 and dermatitis recall ≥ 0.50; release also requires new independent evaluation. Corrected exploratory macro-F1 is **0.3862**, balanced accuracy **0.3884**, and acne recall **1/9 (11.1%)**. Both numeric and evaluation-provenance requirements fail. The gate is not a clinical readiness threshold and is never weakened after seeing results. A future available model would reject a top score below 0.65, margin below 0.15 or the other category; the historical v1 artifact refuses photo classification entirely.

Measured outputs and actual readiness are in `models/clinical/evaluation.json`, `public/model-clinical/evaluation.json` and the [clinical-photo model card](docs/CLINICAL_MODEL_CARD.md). The report includes confusion counts, per-class support, calibration and small descriptive skin-tone subgroup estimates, not evidence of fairness or clinical validity. [Condition-aware rules](docs/CONDITION_MATCHING_RULES.md) document the separate, unvalidated cosmetic ranking system; it has not been trained on product response or treatment outcomes.

The [photo evaluation report](docs/CLINICAL_EVALUATION_REPORT.md) records the corrected cohort, actual measurements, confidence intervals, audit correction and previously observed test overlap. The pre-audit report is preserved as historical evidence, not substituted for the corrected experiment. Real checkpoint/ONNX execution and demo parity establish computation, not useful classification or fresh validation. Scores are not exposed as accepted consumer results while availability is false.

### Original dermoscopic lesion task

The original task ranks seven HAM10000-derived dermoscopic dataset categories: actinic keratosis/intraepithelial carcinoma, basal cell carcinoma, benign keratosis-like lesions, dermatofibroma, melanoma, melanocytic nevi and vascular lesions. This model cannot identify acne, rosacea, facial skincare needs or other conditions outside these labels; it is separate from the ordinary-photo task above.

The model is a compact RGB28 CNN with 24/48/64-channel convolution blocks, global average pooling and a seven-class linear head, trained from scratch in PyTorch. [DermaMNIST-C 28](https://zenodo.org/records/12739457) provides a corrected lesion-group split; patient independence cannot be claimed because patient IDs are unavailable. Exact/near-duplicate leakage controls and the split manifest are part of the training pipeline. Images are **CC BY-NC 4.0**, metadata **CC BY 4.0**; commercial model/data rights are unresolved. [Third-party notices](THIRD_PARTY_NOTICES.md) explain the separate licenses.

Preprocessing is deterministic RGB conversion, EXIF orientation, white compositing for transparency, pixel-center nearest resize to 28 × 28, and documented channel normalization. Temperature-scaled scores and heuristic max-score/margin rejection are transparent. Scores are not patient-level disease probabilities; passing quality checks does not certify medical suitability.

The distributed model completed 50 epochs (selected epoch 30). Executed inference on 1,218 retained test images measured macro-F1 **0.6341**, balanced accuracy **0.6951**, accuracy **0.8407** and 10-bin ECE **0.02278**. **Melanoma recall was 39/70 (55.7%); this model cannot exclude melanoma or decide that care is unnecessary.** `models/evaluation.json` and `public/model-report.json` contain full-precision results. The [model card](docs/MODEL_CARD.md) and [evaluation report](docs/EVALUATION_REPORT.md) document provenance, class imbalance, confusion matrix, descriptive subgroup results and limitations. Frozen-checkpoint inference successfully reproduced all 1,218 held-out outputs; no clinical utility or skin-tone fairness is established. [Training and artifact instructions](docs/TRAINING.md) explain reproduction.

## Start locally

Use Node.js 22 or newer:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Leave `NEXT_PUBLIC_INFERENCE_URL` blank to process images in the browser. To serve the production export:

```powershell
npm run build
npm start
```

`out/` is the deployable site. The model, metadata and ONNX WebAssembly runtime must all be served from this site. No Python service is required for the default mode.

## Optional Python service and training

Use Python 3.13:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000 --no-access-log
```

Set `NEXT_PUBLIC_INFERENCE_URL=http://localhost:8000` in `.env.local` and restart/rebuild the frontend to opt into server processing for the original dermoscopic task. The new clinical-photo route remains on-device, even with this variable set; the Python endpoint has not been expanded to the new model. Backend variables are `MODEL_CHECKPOINT`, `MODEL_MANIFEST` and comma-separated `ALLOWED_ORIGINS`. In production use HTTPS and exact frontend origins. Endpoints are `GET /health`, `GET /v1/model` and `POST /v1/analyze` (multipart `file`, `image_type`, `consent`, optional `include_explanation`). `/health` reports model availability separately from service liveness.

Reproduce the original dermoscopic training with:

```powershell
.\.venv\Scripts\python.exe scripts/model_train.py --epochs 50 --seed 20261011
```

See [training documentation](docs/TRAINING.md) and the produced evaluation/model card for the actual run. Never fabricate outputs when artifacts are missing.

Reproduce the historical MobileNet skin-photo baseline with its pinned research dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r models/clinical/requirements-training.txt
.\.venv\Scripts\python.exe scripts/clinical_model_train.py
```

This downloads selected public SCIN originals into ignored `data/clinical/`, never uses uploaded images, and writes a frozen cohort, trained checkpoint, ONNX graph, manifests and measured reports. Keep dataset/license notices with redistributed artifacts. The [historical card](docs/CLINICAL_MODEL_CARD.md) records its failed/overlapping evaluation. Do not overwrite that history to claim fresh validation.

For photo-v2, use [source access, ordered commands and lock-preserving reproduction instructions](docs/OVERNIGHT_TRAINING.md). `scripts/run_photo_training.py` coordinates the real cached experiment and refuses unsafe reselection after test opening. The separate deployment-repair script verifies unchanged locked weights. Original source images/caches are ignored; model heads, provenance, protocols, lock/report artifacts and split ONNX files document the run. Do not launch a duplicate worker or delete final-test/export locks.

## Verification

```powershell
npm run test:unit
npm run typecheck
npx playwright install chromium
npm run test:e2e
.\.venv\Scripts\python.exe -m pytest backend/tests
npm run build
```

Unit tests cover file validation, bounded decoding, preprocessing/quality and output schema. Chromium E2E uses real licensed examples and real ONNX inference, plus explicit failure cases; test fixtures are not live classifier outputs. Backend tests cover validation, preprocessing, model loading and endpoint behavior. [Test boundaries](tests/README.md) and the [validation record](docs/VALIDATION.md) identify executed results.

## Deployment, privacy and demo

[Deployment instructions](docs/DEPLOYMENT.md) cover Vercel static export, Docker, local compose and the optional Render API blueprint. [Security/privacy](docs/SECURITY_AND_PRIVACY.md) describes local versus server processing, transient buffers and operational logging. Do not claim a public deployment exists until its live upload flow has been verified.

[The 90-second demo script](docs/DEMO_SCRIPT.md) uses actual model output, including the survey, routine, errors and uncertainty. Current submission preparation focuses on **UnivaBio and Next Founders**; Banana Hacks is archived after the missed deadline. [Competition notes](docs/COMPETITION_NOTES.md) record event-specific rules, conflicting UnivaBio deadlines and unresolved prior-work/cross-submission questions. [Startup notes](docs/STARTUP_POSITIONING.md) describe the replacement retailer-funded routine-planning business, competitor evidence, validation targets and unresolved commercial model rights without invented traction. Shoppers would use a future integrated tool free; a proposed $49/store/month merchant plan is a test assumption, unavailable for purchase. No store partnership or conversion benefit has been established.

## Remaining limitations

No high-accuracy arbitrary-face disease detector, acne severity assessment, cancer screening, clinical validation, patient independence, fairness validation, product-response study, prospective study, validated automatic out-of-domain detector or commercially cleared data/model rights. Photo-task skin-annotation estimates are descriptive and source-dependent; the dermoscopic task has no skin-tone labels. Research models fail on rare categories and new imaging conditions; the large float32 photo graph also has substantial download/memory demands. Browser compatibility and host configuration require real deployment testing. No prescription recommendation, diagnosis, all-clear message or patient record system is provided. Original code/artwork licensing is unresolved; the repository has not been assigned an overall license by assumption.
