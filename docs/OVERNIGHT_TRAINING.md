# Photo-model run, locks and deployment handoff

The original CPU experiment finished genuine training, reference-model final evaluation, 14-category final evaluation and dynamic-int8 final evaluation on 14 October 2026. The test is now opened. Reference three-class macro-F1 is 0.6575, but accepted accuracy is only 47.73%; no high-accuracy consumer condition detector is claimed. The int8 export and all named 14-category gates failed. Unchanged float32 ONNX repair remeasurement is complete with matching top labels for all 2,356 test inputs; actual Chromium WASM verification has also passed on twelve fixed validation inputs against fresh PyTorch. The final production build and all 27 application browser tests passed; native Sites publication status is reported separately. Historical MobileNet stays disabled and dermoscopy remains functional. Read [the measured report](PHOTO_EVALUATION_REPORT.md) and [model card](PHOTO_MODEL_CARD.md). V2 outputs remain uncertain and use survey-only products even after computation checks pass; this post-test safety restriction is not a validated operating point.

## Data and hardware

- Intel i7-1165G7, four physical cores, approximately 16 GB RAM; CPU PyTorch.
- Downloaded the original Fitzpatrick17k image archive and corrected Fitzpatrick17k-C metadata, plus an expanded multi-view SCIN cohort.
- Combined retained cohort: 12,452 cases and 14,319 image views. Training: 324 acne / 1,044 dermatitis / 7,498 other; validation: 39 / 128 / 1,063; test: 80 / 198 / 2,078.
- Published corrected atlas partitions are preserved. Previously examined SCIN cases and their duplicate groups are development-only. Conflicting labels, cross-split duplicate groups and legacy-exposed evaluation groups are removed.
- Case/image grouping is not proof of patient independence; participant identifiers and backbone-pretraining overlap are unknown.

Original images, metadata, decoded pixels, features and logs stay in ignored `data/`. Images are research-source data; this pipeline never reads user-uploaded images. Preserve SCIN's Data Use License, original Fitzpatrick17k CC BY-NC-SA 3.0 terms and atlas attribution, corrected metadata CC BY 4.0, and DINOv2 Apache 2.0. Commercial/clinical rights are not cleared.

## Original worker and safe resumption

`data/photo-v2/training-state.json` and `overnight-training.log` record the original worker. Its current status is `evaluation_complete`; a failed int8 benchmark is not a hung job. Check owned process command lines and logs before launching anything. Never launch duplicate extraction, training or repair. The original pipeline waited for its owned small-backbone extractor and resumed cached chunks.

The worker uses an OS lock to prevent duplicate runs and keeps Windows awake while this explicitly requested computation runs. It releases that temporary execution-state request when it exits; persistent power settings are unchanged.

```powershell
.venv\Scripts\python.exe -u scripts\run_photo_training.py
```

The command above is for safe resumption of genuinely unfinished phases, not new model selection on the opened test. The driver now returns without training when final reports exist. Preserve all caches, failed results and locks. Feature caches bind source hashes, preprocessing, normalization and exact pretrained artifact hashes. Do not delete locks to force a rerun.

## Experiment sequence

1. Extract frozen DINOv2 ViT-S/14 and ViT-B/14 CLS + mean patch features.
2. Fit the predeclared three-class linear/RBF candidates using training views and per-case/class loss weights; select using validation only.
3. Fit the separately registered 14-category research head for both backbones; lock its validation selection before either related task opens the shared test.
4. Export the selected three-class model to ONNX, check genuine PyTorch parity, quantize fixed weight matrices, and recalibrate on validation only.
5. Persist final-test locks, evaluate the selected three-class and category models, and measure the actual quantized ONNX on the final test.
6. Original final measurements, serialization repair, actual browser execution and full integration/tests/build are complete. Native Sites deployment status records publication; no duplicate training is needed.

Read `models/photo-v2/protocol.json`, `training-protocol.json`, `categories-protocol.json`, and `export-protocol.json` for exact registered rules. Do not loosen thresholds, change taxonomy or fit another candidate after the test opens. A failed test stays a failed test; create a genuinely new experiment and holdout for further development.

## Website handoff

`lib/api.ts` now selects `lib/browser-photo-inference.ts` for ordinary-photo research. The analyzer requires the exact v2 class/224-pixel preprocessing contract, part sizes/checksums, benchmark/source/artifact checks and browser verification. All v2 outputs remain uncertain, and the care engine independently blocks v2 condition-driven products because of poor accepted precision. Existing future condition-policy hooks are software-tested but cannot turn these research scores into a product-treatment recommendation.

After the repair finishes, inspect its immutable lock/report alongside original `evaluation.json`, failed `onnx-evaluation.json`, `categories-evaluation.json`, and `public/model-photo/manifest.json`. Verify the actual graph in the browser on licensed source pixels against fresh reference outputs, plus error/cancellation/uncertainty behavior. A checksum/schema test alone is insufficient to set `browser_verified`. Run appropriate unit/Python/browser tests and a production build, record dated execution evidence, then publish through Sites with the existing private audience. No transformer heatmap is claimed.

If model readiness fails, report the actual results and retain an honest unavailable/uncertain state. The finite supported categories never establish arbitrary-face diagnosis, disease severity, serious-disease exclusion, medical probabilities, or an absolute best product. The noncommercial research prototype must not be pitched as a clinically validated commercial service.

Product explanations, eligible alternatives, numeric-cap complete-basket selection and lifestyle guidance are implemented in this checkout. The one-page UnivaBio PDF remains local/ignored and must not be pushed to GitHub.

## Reproducible source access

SCIN preparation downloads publisher metadata and source images with content-size/MD5 checks. Atlas acquisition used the [archive linked by SFU MIAL DermSynth3D authors](https://vault.sfu.ca/index.php/s/cMuxZNzk6UUHNmX/download/fitzpatrick17k.zip): **1,422,227,506 bytes**, SHA-256 `9e3ea84ee8b349dad514b0acf1f553cf39726bccfbe888d4faec4b3045d13d88`, 16,579 members. Safe extraction checks every resolved member path stays under `data/fitzpatrick17k/images/`; never execute archive contents.

The corrected authors' [Zenodo record](https://zenodo.org/records/12739457) supplies `Fitzpatrick17k-C.csv`, SHA-256 `bfc28411147693a910b2b409bf449f4f6e61002f29926626eab3589c442fd219`. Put that unchanged file at `data/fitzpatrick17k/fitzpatrick17k-C.csv`; the merger finds published image filenames recursively under `data/fitzpatrick17k/images/`. Corrected metadata permission does not override photograph terms.

`photo_model_common.py` retrieves pinned DINOv2 source and official weights into ignored `data/vendor/dinov2/` and `data/torch-cache/`. Feature caches bind source commit `7764ea0f912e53c92e82eb78a2a1631e92725fc8` and weight hashes. The selected ViT-B checkpoint is SHA-256 `0b8b82f85de91b424aded121c7e1dcc2b7bc6d0adeea651bf73a13307fad8c73`.

For a **separate reproduction checkout**, install requirements and obtain licensed source files first:

```powershell
.venv\Scripts\python.exe -m pip install -r models/clinical/requirements-training.txt
.venv\Scripts\python.exe scripts/photo_dataset_prepare.py
.venv\Scripts\python.exe scripts/photo_dataset_merge.py
.venv\Scripts\python.exe -u scripts/run_photo_training.py
```

The recorded cohort also binds historical exposure manifests/source photographs. Preserve that history; an arbitrary new split is a different experiment. **Do not prepare/merge the current completed cohort:** final locks freeze it, and the merger refuses an opened test. Do not delete locks to bypass that refusal. Source changes/download failures/decoder differences can change a reproduction; compare hashes/counts before claiming identical results.

## Registered serialization repair

`scripts/photo_model_deployment_repair.py` implements `models/photo-v2/deployment-repair-protocol.json`. It verifies all original locks/hashes, tries one float16-constant-storage candidate with float32 compute and protected head constants, and accepts it only on strict parity against fresh PyTorch for the deterministic first 12 validation cases. The candidate failed maximum absolute logit error <0.005, so the original float32 graph was selected. No retraining, threshold search or temperature fitting occurs; original temperature stays **1.85**.

The driver measures original validation first views, persists an immutable repair lock, and remeasures the already opened test. This establishes technical fidelity, **not new independent evaluation**. Failed int8 evidence remains intact. After confirming no owned repair process is active, resume only unfinished phases with:

```powershell
.venv\Scripts\python.exe -u scripts/photo_model_deployment_repair.py all
```

The float32 artifact is **346,452,970 bytes**, distributed as **17 parts of at most 20 MiB** with per-part/combined SHA-256 checks. Splitting files does not reduce total download or graph memory. Completed `deployment-evaluation.json` and immutable repair locks record identical classification metrics/all test top labels, maximum test logit difference **0.00010014**, and unchanged calibration temperature. This is fidelity on an already opened test. Actual Chromium WASM verification passed with all twelve fixed validation top labels matching fresh PyTorch, maximum tensor error 0.00000047684 and maximum logit error 0.00003195. The immutable browser report binds source/artifact hashes; final UI/deployment verification remains separate. Further performance improvement requires a new protocol and genuinely unexamined evaluation rather than tuning this holdout.

## Verify browser computation and finalize public copies

The reproducible verification sequence prepares fresh locked PyTorch references, executes the actual split graph in Chromium WASM on the fixed twelve validation inputs, validates all evidence without mutation, then finalizes only generated public copies:

```powershell
.venv\Scripts\python.exe scripts/photo_browser_verify.py
node scripts/verify-photo-browser.mjs
.venv\Scripts\python.exe scripts/photo_model_enable_browser.py --check-only
.venv\Scripts\python.exe scripts/photo_model_enable_browser.py
```

Check for active owned processes before resuming verification; do not run duplicate graph jobs. Verification images/tensors stay in ignored `data/photo-v2/browser-qa/`, never the published site. `models/photo-v2/browser-parity.json` is immutable evidence, distinct from the original offline report snapshot. The finalizer validates its bound cohort/head/artifact/preprocessing/repair/evaluation hashes and rejects inconsistent flags or measurements. It updates only `public/model-photo/manifest.json` / `evaluation.json` with verified browser status and the explicit condition-product restriction; original selection, test, export, repair and browser evidence remain unchanged. An availability flag grants only uncertain research computation. It does not certify upload-to-results UI, a new host deployment, disease accuracy or condition-specific products. Full UI tests, production build and final private publication must be recorded separately.
