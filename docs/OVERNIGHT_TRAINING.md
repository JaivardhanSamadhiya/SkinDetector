# Photo-model upgrade in progress

This is a real, reproducible CPU experiment, not a successful model release. As of 13 October 2026, feature extraction is running and no final photo-v2 test has been opened. The original failed MobileNet photo model remains disabled. The separate dermoscopic research model remains functional.

## Data and hardware

- Intel i7-1165G7, four physical cores, approximately 16 GB RAM; CPU PyTorch.
- Downloaded the original Fitzpatrick17k image archive and corrected Fitzpatrick17k-C metadata, plus an expanded multi-view SCIN cohort.
- Combined retained cohort: 12,452 cases and 14,319 image views. Training: 324 acne / 1,044 dermatitis / 7,498 other; validation: 39 / 128 / 1,063; test: 80 / 198 / 2,078.
- Published corrected atlas partitions are preserved. Previously examined SCIN cases and their duplicate groups are development-only. Conflicting labels, cross-split duplicate groups and legacy-exposed evaluation groups are removed.
- Case/image grouping is not proof of patient independence; participant identifiers and backbone-pretraining overlap are unknown.

Original images, metadata, decoded pixels, features and logs stay in ignored `data/`. Images are research-source data; this pipeline never reads user-uploaded images. Preserve SCIN's Data Use License, original Fitzpatrick17k CC BY-NC-SA 3.0 terms and atlas attribution, corrected metadata CC BY 4.0, and DINOv2 Apache 2.0. Commercial/clinical rights are not cleared.

## Current worker

`data/photo-v2/training-state.json` records the worker PID and phase. `data/photo-v2/overnight-training.log` records subsequent progress. The initial small-backbone extraction has its own retained command session; the pipeline waits for that owned process before continuing from cached chunks.

The worker uses an OS lock to prevent duplicate runs and keeps Windows awake while this explicitly requested computation runs. It releases that temporary execution-state request when it exits; persistent power settings are unchanged.

```powershell
.venv\Scripts\python.exe -u scripts\run_photo_training.py
```

Do not launch another worker while the recorded process is active. An interrupted extraction resumes immutable chunk caches. The cache binds source hashes, preprocessing implementation, normalization and exact pretrained artifact hashes.

## Experiment sequence

1. Extract frozen DINOv2 ViT-S/14 and ViT-B/14 CLS + mean patch features.
2. Fit the predeclared three-class linear/RBF candidates using training views and per-case/class loss weights; select using validation only.
3. Fit the separately registered 14-category research head for both backbones; lock its validation selection before either related task opens the shared test.
4. Export the selected three-class model to ONNX, check genuine PyTorch parity, quantize fixed weight matrices, and recalibrate on validation only.
5. Persist final-test locks, evaluate the selected three-class and category models, and measure the actual quantized ONNX on the final test.
6. Browser execution, measured documentation, integration, production tests/build and publication remain coordinator work after the worker finishes.

Read `models/photo-v2/protocol.json`, `training-protocol.json`, `categories-protocol.json`, and `export-protocol.json` for exact registered rules. Do not loosen thresholds, change taxonomy or fit another candidate after the test opens. A failed test stays a failed test; create a genuinely new experiment and holdout for further development.

## Website handoff

The new analyzer is implemented in `lib/browser-photo-inference.ts` but is not yet selected by `lib/api.ts`. It requires the declared benchmark, source and artifact checks. Existing result validation and care matching recognize the exact v2 class contract; no actual v2 output is claimed before evaluation.

After completion, inspect `models/photo-v2/onnx-evaluation.json`, `categories-evaluation.json`, and `/public/model-photo/manifest.json`. Verify real browser ONNX score parity and error/uncertainty behavior. Integrate supported capabilities only, update the analysis readiness banner and source limitations, refresh README/model cards, run unit/Python/browser tests and a production build, then publish through the Sites workflow with the existing private audience.

If model readiness fails, report the actual results and retain an honest unavailable/uncertain state. The finite supported categories never establish arbitrary-face diagnosis, disease severity, serious-disease exclusion, medical probabilities, or an absolute best product. The noncommercial research prototype must not be pitched as a clinically validated commercial service.

Product explanations, top catalog matches and lifestyle guidance are implemented in this checkout. The one-page UnivaBio PDF is a dated snapshot and must be updated if the final model status changes before submission.
