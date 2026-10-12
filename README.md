# SkinSnap

An education-first skin health website and reproducible dermoscopic image-classification research demo. The active app replaces the old unconditional rosacea redirect and simulated checkout. **This is not a clinical diagnosis, screening service or smartphone-photo classifier.**

The original January 2024 prototype and Git history are preserved in `legacy/`. The new repository is [SkinDetector](https://github.com/JaivardhanSamadhiya/SkinDetector); the original is [SkinSnap](https://github.com/JaivardhanSamadhiya/SkinSnap). [Read the audit and reuse disclosure](docs/REPOSITORY_AUDIT.md).

**Verified private demo:** [Open SkinSnap](https://skinsnap-research-lab.jauntyghost8.chatgpt.site). The hosting gate permits the owner; no audience expansion was made. Real inference on this deployed origin matched PyTorch scores, with no application image POST. Local verification passed 40 unit, 67 backend and nine browser tests, plus production build/typecheck. Linux GitHub Actions also passed; see the [validation record](docs/VALIDATION.md).

## Implemented application

- Next.js App Router with TypeScript, Tailwind, accessible Radix-based controls, locally hosted typography, Lucide icons and responsive ivory/teal styling.
- Landing, analysis, results, conditions library, skincare education, how-it-works, research/transparency and about pages.
- JPEG/PNG/WebP browse, drop, mobile camera input, replacement, preview, 10 MB admission limit, bounded decode/orientation and explicit permission/domain choices.
- Resolution, blur and exposure feedback; unsupported images, uncertainty, unavailable weights and failures have honest states.
- Default on-device ONNX inference, verified model checksum, actual model scores and CAM explanation with opacity controls. Optional Python FastAPI inference uses the same trained checkpoint.
- Session-only selected images/results with a deletion action; no image history database, retail checkout or invented purchase confirmations.
- Evidence-linked educational content, measured-report charts, dataset/model provenance, deployment templates and automated tests.

The supplied trained artifact has executed successfully in PyTorch and browser ONNX. Browser outputs for all three licensed demo images matched executed PyTorch scores within display rounding. Read the [validation record](docs/VALIDATION.md) for the tested workflow and boundaries. If the installed manifest/weights are unavailable, the app reports that no prediction was generated.

## Model and data

The task ranks seven HAM10000-derived dermoscopic dataset categories: actinic keratosis/intraepithelial carcinoma, basal cell carcinoma, benign keratosis-like lesions, dermatofibroma, melanoma, melanocytic nevi and vascular lesions. It cannot identify rosacea, facial skincare needs or other conditions outside these labels.

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

Set `NEXT_PUBLIC_INFERENCE_URL=http://localhost:8000` in `.env.local` and restart/rebuild the frontend to opt into server processing. Backend variables are `MODEL_CHECKPOINT`, `MODEL_MANIFEST` and comma-separated `ALLOWED_ORIGINS`. In production use HTTPS and exact frontend origins. Endpoints are `GET /health`, `GET /v1/model` and `POST /v1/analyze` (multipart `file`, `image_type`, `consent`, optional `include_explanation`). `/health` reports model availability separately from service liveness.

Reproduce training with:

```powershell
.\.venv\Scripts\python.exe scripts/model_train.py --epochs 50 --seed 20261011
```

See [training documentation](docs/TRAINING.md) and the produced evaluation/model card for the actual run. Never fabricate outputs when artifacts are missing.

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

[The 90-second demo script](docs/DEMO_SCRIPT.md) uses actual model output, including errors and uncertainty. [Competition notes](docs/COMPETITION_NOTES.md) separate Banana Hacks, UnivaBio and Next Founders positioning and record prior-work/cross-submission uncertainty. Banana Hacks 2026's inspected rule excluding prior work is a material issue for this preexisting project. [Startup notes](docs/STARTUP_POSITIONING.md) describe a hypothetical nonclinical education market without invented traction.

## Remaining limitations

No clinical validation, patient-level independence, skin-tone subgroup measurement, prospective study, validated automatic out-of-domain detector or commercially cleared data/model rights. The low-resolution research model is a baseline and may fail on rare categories and new imaging conditions. Browser runtime compatibility and host configuration must be tested on the actual deployment. No prescription recommendation, diagnosis, all-clear message or patient record system is provided. Original code/artwork licensing is unresolved; the repository has not been assigned an overall license by assumption.
