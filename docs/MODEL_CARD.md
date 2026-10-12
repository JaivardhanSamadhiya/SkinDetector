# SkinSnap research model card

**Version:** `skinsnap-derma-cnn-v1` · **Measured run:** October 11, 2026 · **Status:** trained research baseline, with executed inference. This model is for noncommercial education and reproducibility research. It cannot diagnose, screen, triage, select treatment or establish that a lesion is harmless.

## Supported task

The model ranks seven labels from the DermaMNIST-C 28 dermoscopic lesion benchmark. The output describes resemblance to dataset categories, not a patient's medical condition.

| Output index | ID | Dataset label |
| --- | --- | --- |
| 0 | `akiec` | Actinic keratosis / intraepithelial carcinoma |
| 1 | `bcc` | Basal cell carcinoma |
| 2 | `bkl` | Benign keratosis-like lesions |
| 3 | `df` | Dermatofibroma |
| 4 | `mel` | Melanoma |
| 5 | `nv` | Melanocytic nevi |
| 6 | `vasc` | Vascular lesions |

**Only 28 × 28 dermoscopic benchmark images were evaluated.** Selfies, ordinary smartphone photos, acne, rosacea, eczema and arbitrary rashes are outside the task. Uploads at higher resolution are resized, but their equivalence to the benchmark acquisition/preprocessing has not been validated. Users must declare the image domain; there is no validated automatic dermoscopy or out-of-domain detector.

## Architecture and provenance

`backend/model.py` defines a CNN trained from scratch with **39,391 trainable parameters**. It uses no pretrained backbone, external trained classifier or multimodal LLM.

1. RGB input, shape `1 × 3 × 28 × 28`.
2. Bias-free 3 × 3 convolution, 3 → 24 channels, padding 1; BatchNorm, ReLU, 2 × 2 max pooling.
3. Bias-free 3 × 3 convolution, 24 → 48 channels, padding 1; BatchNorm, ReLU, 2 × 2 max pooling.
4. Bias-free 3 × 3 convolution, 48 → 64 channels, padding 1; BatchNorm, ReLU.
5. Global average pooling of the 64 × 7 × 7 feature map; a biased linear layer with seven outputs.

The trained PyTorch checkpoint is `models/skinsnap_derma_cnn.pt`; the browser graph is `public/model/model.onnx` (ONNX opset 17). The graph returns logits and final activations. `public/model/manifest.json` stores the exact class mapping, normalization, temperature, rejection rules and classifier weights for CAM.

| Artifact | SHA-256 |
| --- | --- |
| PyTorch checkpoint | `af1ac56654fd303754e49bd8e1ed2d1da5f64904e1c7c6e71c63a0610d09f449` |
| ONNX graph | `6318026252e12c6638357ec53985164e47909dd2152bbd0044d7b7d30bf6e733` |

The ONNX digest above is also recorded in the machine-readable manifest, which is authoritative. Integrity checks detect artifacts that differ from the distributed manifest; they are not a cryptographic endorsement of medical validity.

## Data and rights

Data comes from [DermaMNIST-C v1.1](https://zenodo.org/records/12739457), derived from [HAM10000](https://doi.org/10.1038/sdata.2018.161). The release credits Kumar Abhishek, Aditi Jain and Ghassan Hamarneh for the corrected dataset; HAM10000 credits Philipp Tschandl, Cliff Rosendahl and Harald Kittler, and MedMNIST credits Jiancheng Yang and colleagues. Read [third-party notices](../THIRD_PARTY_NOTICES.md) and [artifact license/attribution](../models/LICENSE.md).

The release's image arrays and the distributed demo PNGs use **CC BY-NC 4.0**; its metadata uses **CC BY 4.0**. SkinSnap distributes its data-derived artifacts for noncommercial research and education. Attribution, source links and transformation disclosure accompany the demo images. Commercial startup use needs separate rights clearance; the application code does not grant commercial data/model rights. The [CC BY-NC terms](https://creativecommons.org/licenses/by-nc/4.0/) require attribution and restrict commercial use.

The published corrected partitions group known lesions. The local pipeline additionally checks exact RGB pixel hashes and conservative near duplicates before training, purging entire affected held-out lesions. The resulting split has 8,215 training images, 573 validation images and 1,218 test images, with no known lesion-ID overlap. **Patient identifiers and skin-tone labels are absent.** Patient-level independence and skin-tone performance have not been established. This is a HAM10000-derived source sample with limited population, device and acquisition coverage; it does not establish performance for a general consumer population.

## Training and preprocessing

The run used seed `20261011`, deterministic PyTorch algorithms, PyTorch `2.14.1+cpu`, NumPy `2.5.4`, batch size 128 and 50 epochs. AdamW used learning rate 0.003, weight decay 0.0001 and cosine decay to 0.0001. The loss used normalized square-root inverse class-frequency weights. Random horizontal/vertical flips and 90-degree rotations were the training augmentations. The checkpoint from **epoch 30** had the best validation macro-F1 and was retained. The test set was not used to optimize weights or select the checkpoint.

Decoded uploads receive EXIF orientation handling, RGB conversion and white compositing for transparent pixels. Inference uses pixel-center nearest resizing to 28 × 28, division by 255, channel normalization and NCHW layout. The benchmark release itself used bicubic downsizing of the original source images, so matching a higher-resolution upload to this benchmark pipeline is not established.

| Channel | Training mean | Training standard deviation |
| --- | --- | --- |
| R | 0.7551918625831604 | 0.13919077813625336 |
| G | 0.5498367547988892 | 0.15020906925201416 |
| B | 0.5759088397026062 | 0.16744640469551086 |

## Scores, abstention and explanations

A scalar temperature of **0.8** was selected by validation negative log-likelihood over 0.5–5.0 in 0.025 steps. The same validation partition selected the checkpoint and fitted temperature. The scores are `softmax(logits / temperature)`, labeled **temperature-scaled model scores**. They are not patient-level disease probabilities, a validated clinical confidence estimate or externally calibrated probabilities.

The fixed research rule rejects an output if its top score is below **0.65** or the top-two score difference is below **0.15**. These thresholds are heuristics, not clinical safety thresholds. Low-detail/resolution and extreme-exposure checks are also heuristics; passing them does not establish medical suitability. An unsupported domain, invalid artifact or failed inference produces no scores. Uncertainty keeps the real scores visible with an explicit inability-to-assess message.

The explanation is positive class activation mapping from the final 7 × 7 feature map, using the top class's linear weights. For this global-average-pooling/linear architecture it is equivalent, up to positive scaling, to final-layer Grad-CAM. The overlay is coarse: it is not a lesion boundary, a causal explanation or proof that the label is medically correct.

## Measured performance and limits

The [evaluation report](EVALUATION_REPORT.md) provides the confusion matrix, supports and subgroup results. On the retained 1,218-image test set, accuracy was **0.8407**, macro-F1 **0.6341**, balanced accuracy **0.6951** and 10-bin ECE **0.02278**. **Melanoma recall was only 39/70 (55.7%).** The abstention rule still accepted 11 wrongly labeled melanoma-reference images. No result can decide whether professional care is needed.

There is no external cohort, prospective study, clinical validation, patient-level evaluation, validated domain detector or measured skin-tone fairness. Rare categories have small test supports. Descriptive age, recorded sex and source-dataset groups differ in class mix and acquisition; they are not evidence of equity or causal demographic effects. A medical deployment would require an appropriate data/rights strategy, representative external and prospective validation, clinician-led safety evaluation and jurisdiction-specific regulatory review.

## Reproduction and runtime checks

[Training instructions](TRAINING.md) describe access, configuration and generated artifacts. `python scripts/model_verify.py --recompute-heldout` verifies source checksums, recreates the split audit and normalization, executes the persisted checkpoint on all 1,218 test images and compares the fresh outputs with saved logits and metrics. This was executed successfully. The same command executes genuine model inference and explanations on all three licensed demo images, including an uncertain result; it does not manufacture favorable outputs.

Default web inference runs in the browser. The optional FastAPI service validates uploads, bounds received bytes and decoded pixels, and closes temporary spools and decoded images even when busy or failing. The model service refuses malformed/incompatible manifests and nonfinite or malformed outputs. [Security and privacy](SECURITY_AND_PRIVACY.md) explains processing and deletion behavior.
