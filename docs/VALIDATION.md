# Executed validation record

Verified October 11, 2026 (America/Los_Angeles). This records executed checks, not proposed tests or clinical validation.

## Model and backend

- `python -m pytest backend/tests`: **67 passed**. Covers actual checkpoint loading/inference, format/MIME/size/animation/dimension admission, EXIF orientation, preprocessing, schema, declared unsupported domains, quality rejection, streamed body limits, artifact errors, inference errors, concurrency and temporary-buffer cleanup. One TestClient deprecation warning remains.
- `python scripts/model_verify.py --recompute-heldout`: **passed**. Reconstructed the corrected/cleaned split, checked source/artifact digests and normalization, executed frozen weights on all **1,218** retained test images, and reproduced stored logits and measured metrics. No retraining occurred during verification.
- Real PyTorch inference ran on all three licensed demo samples. The first two produced an assessed research output; the basal-cell-carcinoma reference sample produced an uncertain output. `models/browser_parity.json` records those executed outputs solely for test comparisons; the live app never reads them.

## Frontend

- `npm run test:unit`: **40 passed** across image admission/decoding (22), deterministic preprocessing/quality (10), and response schema (8).
- `npx playwright install chromium`: completed successfully.
- `npm run build`: **passed**; all eight primary pages and six educational condition routes exported. A Windows-only readlink normalization and static segment aliases resolved observed host/export failures.
- `npm run typecheck`: **passed**.
- `npm run dev`: started successfully and served the landing page with HTTP **200**; the owned smoke-test server was stopped afterward.
- `npm run test:e2e` against the final production export: **9 passed (11.7 seconds)**. Checks include genuine inference for all three licensed samples, seven-score PyTorch parity within displayed rounding, uncertainty, CAM/opacity, no image POST, session deletion, unsupported domains, unavailable model, bad files, quality rejection, drag/drop and mobile navigation. The alert-locator test was scoped to the upload form to avoid Next's separate route-announcer alert.
- `node scripts/capture-preview.mjs`: **passed**. Real inference and PyTorch score parity confirmed, **zero POST requests**, five desktop/mobile screenshots captured and visually reviewed; no horizontal overflow at 390 pixels. Research charts rendered from the measured report.
- Private deployment verification will be recorded after publication.

## Archive

All ten original HTML/image files match the January 2024 Git blobs byte-for-byte. Their original commit remains an ancestor of the rebuild. Original assets are outside the deployed document root. See the [audit](REPOSITORY_AUDIT.md).

## Boundaries

Software tests do not establish medical safety. This model has no clinical, prospective, independent-patient, external-device or skin-tone validation. The measured melanoma recall is only 39/70. Smartphone photos and unknown domains are explicitly unsupported; no validated automatic domain detector is claimed. See the [evaluation report](EVALUATION_REPORT.md).

Docker images, Vercel account provisioning, the Render backend template, GitHub Actions in a remote runner, Safari and physical-device camera behavior have not been executed in this environment. Their setup instructions are provided without claiming deployment or compatibility verification.
