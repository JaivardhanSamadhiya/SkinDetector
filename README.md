# SkinSnap

An education-first skin health website with two separate image-classification research tasks and transparent cosmetic catalog matching. The active app replaces the old unconditional rosacea redirect and simulated checkout. **This is not a clinical diagnosis, screening service or a guarantee of the best product for an individual.**

The original January 2024 prototype and Git history are preserved in `legacy/`. The new repository is [SkinDetector](https://github.com/JaivardhanSamadhiya/SkinDetector); the original is [SkinSnap](https://github.com/JaivardhanSamadhiya/SkinSnap). [Read the audit and reuse disclosure](docs/REPOSITORY_AUDIT.md).

**Current photo-detector limitation:** a genuine SCIN photo model was trained and executed, but is unavailable for consumer inference. The first baseline failed its fixed gate; a subsequent data-processing audit found that body-location flags use `YES`, requiring cohort correction. Because the original test outcomes have already been examined, the corrected experiment is not a fresh independent validation and remains `available: false` regardless of numeric thresholds. Joint matching rules are implemented and tested, but real photo uploads cannot activate them. A stronger model with a new independent evaluation is still needed; the separate dermoscopic detector remains functional for its narrow research task.

**Private demo:** [Open SkinSnap](https://skinsnap-research-lab.jauntyghost8.chatgpt.site). The hosting gate permits the owner; no audience expansion was made. This release passed **165 unit tests, 21 browser tests, 67 backend checks, 11 actual photo-artifact checks, production build and typecheck**. Browser inference parity applies to the working dermoscopic task; the photo classifier remains disabled. See the [validation record](docs/VALIDATION.md) for executed checks and deployment evidence.

## Implemented application

- Next.js App Router with TypeScript, Tailwind, accessible Radix-based controls, locally hosted typography, Lucide icons and responsive ivory/teal styling.
- Landing, analysis, results, conditions library, skincare education, how-it-works, research/transparency, about and startup pages, with a persistent keyboard-accessible Quick guide.
- JPEG/PNG/WebP browse, drop, mobile camera input, replacement, preview, 10 MB admission limit, bounded decode/orientation and explicit permission/domain choices.
- Resolution, blur and exposure feedback; unsupported images, uncertainty, unavailable weights and failures have honest states.
- Default on-device ONNX inference, verified model checksum, actual model scores and CAM explanation with opacity controls. The separate skin-photo task always runs on-device. Optional Python FastAPI inference supports the original dermoscopic checkpoint only.
- Session-only selected images/results with a deletion action; no image history database, retail checkout or invented purchase confirmations.
- A short optional preferences survey and an automatically displayed morning/evening routine with selectable alternatives, manufacturer-verified ingredient information, six dated US retail prices and seller links, a selected-combination item subtotal, and reuse of owned basics. Joint acne-like/dermatitis-like appearance-and-survey rules filter and rank checked catalog examples when tested with synthetic software fixtures. **They stay inactive for real photo uploads because the photo detector is unavailable.** Uncertain/other/unavailable outputs abstain from condition matching; dermoscopic lesion labels supply evaluation guidance, never a lesion treatment. No clinical superiority or cheapest-basket optimization is claimed. [Recommendation rules and sources](docs/SKINCARE_RECOMMENDATIONS.md).
- A startup presentation with an initial buyer, proposed revenue model, pilot targets and commercialization gates, all explicitly separated from measured traction.
- A standalone `/routine/` flow for shoppers, requiring no photo or model execution, with a manual budget checker for missing basics, tax and delivery. All amounts are entered by the user; live prices, stock, exact-budget optimization and checkout are not implemented.
- Evidence-linked educational content, measured-report charts, dataset/model provenance, deployment templates and automated tests.

The original dermoscopic artifact has executed successfully in PyTorch and browser ONNX, with all three licensed demo images matching within display rounding. Each model has its own manifest, weights and evaluation report; do not transfer evidence between tasks. The photo-model manifest records a predeclared engineering availability gate, and the app refuses photo inference when it fails or artifacts are unavailable. Read the [validation record](docs/VALIDATION.md) for actual executed inference and workflow checks.

## Separate models and data

### Experimental ordinary skin-photo appearance task

`skinsnap-scin-mobilenet-v1` uses frozen official TorchVision MobileNetV3-Small ImageNet1K-V1 features, global average pooling and a newly trained 576 → 3 linear head. The ordered labels are acne-like appearance, grouped dermatitis-like appearance, and other / unsupported appearance. This does not identify rosacea, arbitrary diseases, skin type, allergies or a healthy all-clear. The other category always abstains from condition-based catalog matching.

The corrected [SCIN](https://github.com/google-research-datasets/scin) cohort has 736 cases (46 acne), one image per case, retrospective dermatologist differential labels, and connected case/duplicate groups assigned to training (476), validation (112) and test (148). **129 of the 148 corrected test cases overlap the previously examined experiment, so the corrected measurements are exploratory rather than fresh independent validation.** These are not confirmed diagnoses. Participant IDs are unavailable, so patient independence is not established. The small acne class, selected US adult volunteer population and possible body-location/background shortcuts substantially limit generalization. The dataset uses the [custom SCIN Data Use License](https://github.com/google-research-datasets/scin/blob/main/LICENSE), with attribution and no re-identification; it is not the older dataset's CC BY-NC license. TorchVision's software license does not automatically clear ImageNet-derived pretrained weights for commercial use.

Preprocessing is full-image EXIF transpose, white compositing, pixel-center nearest resize to RGB128 and ImageNet normalization. Balanced multinomial logistic heads with predeclared regularization candidates are fitted on training features; selection and temperature fitting use validation only. The fixed numeric minimums are macro-F1 ≥ 0.60, balanced accuracy ≥ 0.60, acne recall ≥ 0.50 and dermatitis recall ≥ 0.50; release also requires new independent evaluation. Corrected exploratory macro-F1 is **0.3862**, balanced accuracy **0.3884**, and acne recall **1/9 (11.1%)**. Both numeric and evaluation-provenance requirements fail. The gate is not a clinical readiness threshold and is never weakened after seeing results. A future available model would reject a top score below 0.65, margin below 0.15 or the other category; this release refuses photo classification entirely.

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

Reproduce the separate skin-photo model with its pinned research dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r models/clinical/requirements-training.txt
.\.venv\Scripts\python.exe scripts/clinical_model_train.py
```

This downloads selected public SCIN originals into ignored `data/clinical/`, never uses uploaded images, and writes a frozen cohort, trained checkpoint, ONNX graph, manifests and measured reports. Keep dataset/license notices with redistributed artifacts. Reproduction details and pretrained-weight rights are in the [photo model card](docs/CLINICAL_MODEL_CARD.md).

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

No clinical validation, patient-level independence, fairness validation, product-response study, prospective study, validated automatic out-of-domain detector or commercially cleared data/model rights. Photo-task skin-tone estimates are descriptive and small; the dermoscopic task has no skin-tone labels. Both low-resolution research models can fail on rare categories and new imaging conditions. Browser runtime compatibility and host configuration must be tested on the actual deployment. No prescription recommendation, diagnosis, all-clear message or patient record system is provided. Original code/artwork licensing is unresolved; the repository has not been assigned an overall license by assumption.
