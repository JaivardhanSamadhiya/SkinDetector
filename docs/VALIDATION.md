# Executed validation record

Latest frontend checks verified October 12, 2026 (America/Los_Angeles). Earlier model/backend and rebuild checks below were executed October 11. This records executed checks, not proposed tests or clinical validation.

## Skin-photo baseline and joint matching — October 12

- `npm run test:unit`: **165 passed**. Includes 34 joint-care rule checks, four photo preprocessing/manifest checks, and eight report/provenance checks. Synthetic transport fixtures test the selection rules and are never live predictions.
- `python -m pytest backend/tests`: **67 passed**; one existing TestClient deprecation warning remains. The optional backend still supports only the separate dermoscopic task.
- `python scripts/clinical_model_validate.py`: **11 passed** on the real corrected PyTorch checkpoint and ONNX artifact. Verifies all three actual demo inferences, score parity, CAM algebra, preprocessing, artifact hashes, split groups, corrected `YES` body flags and the availability/history lock. `models/clinical/artifact_validation.json` records execution.
- The corrected SCIN cohort has **736 cases**; exploratory test **148**, macro-F1 **0.386233**, balanced accuracy **0.388444**, acne recall **1/9**. **129/148 corrected test cases were previously examined** after a body-location parser repair, so this is not an untouched independent test. Numeric minimums and the independence gate fail; `available: false` is retained. The [evaluation report](CLINICAL_EVALUATION_REPORT.md) discloses the repair, original experiment and incomplete label taxonomy.
- `npm run typecheck` and `npm run build`: **passed**; 18 static pages and 16 segment aliases. The new photo inference interface is on-device and refuses unavailable artifacts. The implemented joint care rules cannot activate for real photo uploads in this release.
- `npm run test:e2e`: **21 passed (40.4 seconds)** against the fresh production export. Includes pre-upload readiness, unavailable photo results, availability-flag tamper refusal, 128px original-resolution rejection, and all previous real dermoscopic upload/score/CAM, pricing, navigation, mobile and deletion checks.
- `node scripts/capture-preview.mjs`: **passed locally** with 15 desktop/mobile captures, real seven-class browser/PyTorch parity, exact priced options/subtotal, explicit inactive photo matching and zero application image POSTs. Mobile survey and priced option cards were visually reviewed. Hosted verification is recorded after the exact source is published.

These are engineering checks, not clinical validity, useful photo classification, product-response validation, commercial clearance or evidence of an absolute best product. Successful offline inference is distinguished from the unavailable consumer photo feature.

## Model and backend

- `python -m pytest backend/tests`: **67 passed**. Covers actual checkpoint loading/inference, format/MIME/size/animation/dimension admission, EXIF orientation, preprocessing, schema, declared unsupported domains, quality rejection, streamed body limits, artifact errors, inference errors, concurrency and temporary-buffer cleanup. One TestClient deprecation warning remains.
- `python scripts/model_verify.py --recompute-heldout`: **passed**. Reconstructed the corrected/cleaned split, checked source/artifact digests and normalization, executed frozen weights on all **1,218** retained test images, and reproduced stored logits and measured metrics. No retraining occurred during verification.
- Real PyTorch inference ran on all three licensed demo samples. The first two produced an assessed research output; the basal-cell-carcinoma reference sample produced an uncertain output. `models/browser_parity.json` records those executed outputs solely for test comparisons; the live app never reads them.

## Frontend

### Priced options and result-aware education — October 12

- `npm run test:unit`: **119 passed**, including 33 new result-guidance checks, nine offer/selection checks, and one additional routine-choice check. Guidance validates the response and supported task; uncertain, rejected, malformed, or mismatched outputs never receive label-specific care. Product selections cannot bypass ingredient exclusions or owned-product reuse. Prices are exact integer cents, with HTTPS provenance and explicit missing-price refusal.
- `npm run typecheck` and `npm run build`: **passed**; 18 pages exported and 16 static segment aliases prepared. No model or backend inputs changed.
- `npm run test:e2e` against the production export: **18 passed (39.6 seconds)**. Real inference reaches result-aware education and automatically displayed priced choices. Tests cover shopping URLs/package sizes, subtotal changes, preference resets, exclusions, quote-form synchronization, a real uncertain sample, unsupported images, mobile layouts, deletion, and all existing model/upload checks.
- `node scripts/capture-preview.mjs`: **passed**. Real seven-score PyTorch parity, result-aware guidance, selected rich-texture example, documented item subtotal, and **zero application image POSTs** were verified. Twelve desktop/mobile captures include focused price-option views; the product comparison was visually reviewed at both widths. Chromium's offscreen fixed skip-link artifact is hidden only in the element captures while unfocused; keyboard navigation remains independently tested.
- The six retail listings are manually verified **12 October 2026 US-dollar price snapshots** for exact package sizes, not a live price/stock feed or an available checkout. Selection totals exclude tax and delivery. This update provides educational context, not image-based skincare treatment, and does not expand the classifier to selfies, acne, rosacea, or eczema.

### Retailer direction and standalone routine update — October 12

- `npm run test:unit`: **76 passed**, including 21 new budget tests. Integer-cent calculations cover required quotes/fees, explicit zero amounts, reuse of owned basics, missing matches, invalid decimal formats, limits, and supported currencies.
- `npm run typecheck` and `npm run build`: **passed**. The production export includes `/routine/`; 16 static segment aliases were prepared.
- `npm run test:e2e` against the fresh production export: **16 passed (18.8 seconds)**. Two new tests verify the standalone mobile routine flow, arithmetic from synthetic user-entered prices, reset on product/currency changes, reuse, full-session deletion, and absence of model/image API requests. The existing real-model, upload, navigation, error, and personalized-result checks also passed.
- `node scripts/capture-preview.mjs`: **passed**. Ten desktop/mobile screenshots were captured. Real seven-score PyTorch parity, the automatically displayed care combination, and **zero application image POSTs** were verified. The revised landing, routine, and startup pages were visually reviewed; mobile layout checks passed at 390 pixels.
- Retail pricing, willingness to pay, customer acquisition, conversion lift, and paid pilots remain hypotheses. The budget inputs in automated tests are synthetic arithmetic fixtures, not claims about product prices or availability. No catalog/stock feed, merchant embed, automatic basket search, billing, or checkout was implemented.
- No training, checkpoint, inference API, dataset split, or evaluation metrics changed in this update. Backend and held-out checks below remain the earlier executed validation.

### Guided-care and startup update

- `npm run test:unit`: **55 passed** (the original 40 plus 15 routine tests). The new tests include all 360 supported feel/sensitivity/texture/ingredient-exclusion combinations, owned-product reuse at both budgets, strict profile schemas and deterministic matching without model inputs.
- `npm run typecheck` and `npm run build`: **passed**. The production export now includes `/startup/` alongside the existing routes; 15 static segment aliases were prepared.
- `npm run test:e2e` against the fresh production export: **14 passed (15.1 seconds)**. The original nine model/upload checks still pass, plus two navigation-guide checks and three survey/routine checks. Real ONNX inference runs; preference editing updates products without downloading/executing another model, deletion and refresh clear preferences, unsupported images have no scores, and care remains explicitly independent of the lesion result. A test initially expected a collapsed form after deletion; the actual fresh analysis form correctly opens with cleared defaults, and the test was corrected before the full successful run.
- `node scripts/capture-preview.mjs`: **passed**. Nine desktop/mobile screenshots were captured. Real seven-score PyTorch parity, automatically displayed three-step care, saved texture preferences and **zero application POSTs** were verified. Analysis, results, Startup and Quick guide screenshots were visually reviewed; mobile survey/results had no horizontal overflow at 390 pixels.
- No training, checkpoint, inference API, dataset split or evaluation metrics changed in this update. The backend checks below are the earlier executed validation, not a newly claimed run.

### Original rebuild verification

- `npm run test:unit`: **40 passed** across image admission/decoding (22), deterministic preprocessing/quality (10), and response schema (8).
- `npx playwright install chromium`: completed successfully.
- `npm run build`: **passed**; all eight primary pages and six educational condition routes exported. A Windows-only readlink normalization and static segment aliases resolved observed host/export failures.
- `npm run typecheck`: **passed**.
- `npm run dev`: started successfully and served the landing page with HTTP **200**; the owned smoke-test server was stopped afterward.
- `npm run test:e2e` against the final production export: **9 passed (11.7 seconds)**. Checks include genuine inference for all three licensed samples, seven-score PyTorch parity within displayed rounding, uncertainty, CAM/opacity, no image POST, session deletion, unsupported domains, unavailable model, bad files, quality rejection, drag/drop and mobile navigation. The alert-locator test was scoped to the upload form to avoid Next's separate route-announcer alert.
- `node scripts/capture-preview.mjs`: **passed**. Real inference and PyTorch score parity confirmed, **zero POST requests**, five desktop/mobile screenshots captured and visually reviewed; no horizontal overflow at 390 pixels. Research charts rendered from the measured report.
- Private Sites publication **succeeded** at [SkinSnap](https://skinsnap-research-lab.jauntyghost8.chatgpt.site). Hosted Chromium verification executed the real ONNX graph, matched all seven scores to recorded PyTorch inference within display rounding, rendered research charts and explanation controls, captured five desktop/mobile screenshots, and observed **zero application image POSTs**. One hosting bot-detection security POST was observed separately.
- [Linux GitHub Actions run](https://github.com/JaivardhanSamadhiya/SkinDetector/actions/runs/38206285852) **passed** for the original rebuild commit `e4e42de09634625d201616bca9b78e4b5f03f7ed`: both frontend and backend jobs succeeded. The frontend job installed dependencies, ran unit/build/typecheck/Chromium E2E; the backend job installed pinned CPU PyTorch and ran pytest. That run verifies the original rebuild; the current guided-care frontend changes are verified separately above.

## Archive

All ten original HTML/image files match the January 2024 Git blobs byte-for-byte. Their original commit remains an ancestor of the rebuild. Original assets are outside the deployed document root. See the [audit](REPOSITORY_AUDIT.md).

## Boundaries

Software tests do not establish medical safety. This model has no clinical, prospective, independent-patient, external-device or skin-tone validation. The measured melanoma recall is only 39/70. Smartphone photos and unknown domains are explicitly unsupported; no validated automatic domain detector is claimed. See the [evaluation report](EVALUATION_REPORT.md).

Docker images, Vercel account provisioning, the Render backend template, Safari and physical-device camera behavior have not been executed. Their setup instructions are provided without claiming deployment or compatibility verification. The default hosted mode does not require a Python server. Commercial rights and clinical validation remain unresolved rather than software-test requirements that these checks could satisfy.
