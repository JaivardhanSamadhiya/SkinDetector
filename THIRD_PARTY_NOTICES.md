# Third-party components and licensing

The original SkinSnap repository did not include a LICENSE file. This rebuild does not retroactively assign an open-source license to the owner's archived code or artwork. Rights in original code, new application code, datasets, model artifacts and dependencies are separate. Do not assume a public GitHub repository grants all reuse rights.

## Software

The licenses below were checked against installed package metadata where available and the upstream license files for Python components. Preserve their full license/copyright notices when redistributing packages or compiled assets; this list is an attribution index, not a replacement for those notices. `package-lock.json` and the pinned Python requirements identify the actual dependency versions. Transitive dependencies carry their own licenses.

| Component | Use | License / authoritative notice |
| --- | --- | --- |
| Next.js | Static App Router application | [MIT](https://github.com/vercel/next.js/blob/canary/license.md) |
| React / React DOM | Interface runtime | [MIT](https://github.com/facebook/react/blob/main/LICENSE) |
| Tailwind CSS | Styling system | [MIT](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE) |
| Radix UI Slot | Accessible component composition | [MIT](https://github.com/radix-ui/primitives/blob/main/LICENSE) |
| Lucide React | Icons | [ISC](https://github.com/lucide-icons/lucide/blob/main/LICENSE) |
| Zod | Response validation | [MIT](https://github.com/colinhacks/zod/blob/main/LICENSE) |
| Recharts | Measured evaluation charts | [MIT](https://github.com/recharts/recharts/blob/main/LICENSE) |
| ONNX Runtime Web | Browser tensor inference | [MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) |
| DM Sans / Lora, bundled through Fontsource | Locally hosted typefaces | SIL Open Font License 1.1; included package license files |
| PyTorch | Training and optional server inference | [BSD-style license](https://github.com/pytorch/pytorch/blob/main/LICENSE), including its third-party notices |
| TorchVision | Frozen MobileNetV3-Small feature extractor for the historical photo baseline | [BSD 3-Clause software license](https://github.com/pytorch/vision/blob/main/LICENSE); pretrained-weight/data rights are separate |
| DINOv2 | Frozen official ViT-S/14 and ViT-B/14 representations for photo-v2 experiments | [Apache 2.0](https://github.com/facebookresearch/dinov2/blob/main/LICENSE); full notice in `docs/licenses/DINOV2_LICENSE.txt`; downstream image rights are separate |
| scikit-learn | Training-only linear classifier fitting and measured evaluation | [BSD 3-Clause](https://github.com/scikit-learn/scikit-learn/blob/main/COPYING) |
| NumPy | Numerical preprocessing/evaluation | [BSD 3-Clause](https://github.com/numpy/numpy/blob/main/LICENSE.txt) |
| Pillow | Bounded image decode, EXIF orientation and resize | [MIT-CMU / historical PIL license](https://github.com/python-pillow/Pillow/blob/main/LICENSE) |
| FastAPI | Optional research HTTP service | [MIT](https://github.com/fastapi/fastapi/blob/master/LICENSE) |
| Uvicorn | ASGI runtime | [BSD 3-Clause](https://github.com/encode/uvicorn/blob/main/LICENSE.md) |
| ONNX | Model graph export | [Apache 2.0](https://github.com/onnx/onnx/blob/main/LICENSE) |
| Vitest | Unit tests | MIT; included package notice |
| Playwright | Browser tests | Apache 2.0; included package notice |

Button components follow the common shadcn/ui-style Radix/variant composition pattern; they are not an independently invented component architecture. AI coding assistance was used. The original compact dermoscopic CNN was trained from scratch. Historical photo-v1 uses official MobileNetV3-Small pretrained features; photo-v2 uses official frozen DINOv2 representations with newly fitted linear/landmark-RBF candidate heads. The selected v2 three-class and separate 14-category heads are linear. Pretrained backbones, datasets and corrected partitions are preexisting third-party work, not newly invented architectures or newly collected data for the submission.

## Dataset, demonstrations and weights

DermaMNIST-C 28 is the corrected HAM10000-derived research dataset distributed by Kumar Abhishek, Aditi Jain and Ghassan Hamarneh in [Zenodo record 12739457](https://zenodo.org/records/12739457), described in [their 2024 dataset-quality paper](https://arxiv.org/abs/2401.14497). Credit the source HAM10000 creators as recorded in the model card and demo manifest.

The NPZ image datasets are **CC BY-NC 4.0**; the metadata CSV files are **CC BY 4.0**. Demo images are adapted from that image release and retain attribution, provenance and the noncommercial restriction. Low-resolution resizing is explicitly disclosed. The resulting weights are distributed conservatively for noncommercial research/education with the source-data restrictions documented. Their commercial rights have not been cleared. A startup pitch is a hypothesis, not permission to commercially exploit these images or model weights.

See [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) and [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) for the actual terms. The project makes no warranty of clinical accuracy. Do not substitute synthetic skin imagery, mislabeled scraped images or retail assets for a licensed evaluation set.

### Separate SCIN ordinary-photo model

[SCIN](https://github.com/google-research-datasets/scin), Google LLC and consented volunteer contributors, provides the source photographs and retrospective dermatologist differential labels for the new acne-like/dermatitis-like/other research task. The [custom SCIN Data Use License](https://github.com/google-research-datasets/scin/blob/main/LICENSE), retained verbatim in `models/clinical/licenses/SCIN_LICENSE.txt`, permits specified reuse/adaptation subject to conditions including attribution and a prohibition on re-identification. It is not CC BY-NC and does not establish clinical validity, endorsement or unrestricted privacy/personality rights.

`public/demo-clinical/manifest.json` credits each selected test-partition source image and records orientation, metadata removal, nearest resizing and aspect-ratio modification. The corrected experiment overlaps previously examined test outcomes and is exploratory, not a fresh independent evaluation. Source labels are differential annotations, not confirmed diagnoses or active consumer predictions. These image changes and the newly fitted head are project work; source data and pretrained features are credited prior work. Dataset access and reproduction are documented in [the photo model card](docs/CLINICAL_MODEL_CARD.md).

The feature extractor uses [official TorchVision MobileNetV3-Small ImageNet1K-V1 weights](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.mobilenet_v3_small.html). The TorchVision software license is retained in `models/clinical/licenses/TORCHVISION_LICENSE.txt`; [upstream cautions](https://docs.pytorch.org/vision/stable/models.html) that pretrained models may inherit dataset terms. A BSD code license is not automatic commercial clearance for ImageNet-derived weights. Model/data/code/product-information rights require review before any paid deployment, and no clinical or commercial clearance is claimed for this research release.

### Expanded SCIN / Fitzpatrick17k-C photo-v2 experiment

The expanded ordinary-photo cohort combines SCIN under its unchanged custom Data Use License with [Fitzpatrick17k-C corrected metadata](https://zenodo.org/records/12739457) by Kumar Abhishek, Aditi Jain and Ghassan Hamarneh. Credit their dataset-quality study, *Investigating the Quality of DermaMNIST and Fitzpatrick17k Dermatological Image Datasets*, Scientific Data 12, 196 (2025), DOI [10.1038/s41597-025-04382-5](https://doi.org/10.1038/s41597-025-04382-5). Corrected metadata is CC BY 4.0; this does not relicense underlying photographs.

Credit original Fitzpatrick17k creators Matthew Groh and collaborators and their CVPRW 2021 work, *Evaluating Deep Neural Networks Trained on Clinical Images in Dermatology with the Fitzpatrick 17k Dataset*, along with original image sources [Atlas Dermatologico](https://atlasdermatologico.com.br/) and [DermaAmin](https://www.dermaamin.com/site/). The [original dataset authors](https://github.com/mattgroh/fitzpatrick17k) specify **CC BY-NC-SA 3.0 Unported**. Atlas Dermatologico independently permits noncommercial image use with attribution/link; DermaAmin's original terms could not be independently confirmed. Retain applicable attribution/share-alike conditions and assess rights in any trained-artifact redistribution; no commercial image/model, clinical or privacy/personality-rights clearance is claimed. The SFU MIAL DermSynth3D authors' archive link provides access, not a new license or label-quality guarantee.

Photo-v2 reuses Meta AI's [DINOv2](https://github.com/facebookresearch/dinov2) official ViT-S/14 and ViT-B/14 pretrained weights, with code pinned to commit `7764ea0f912e53c92e82eb78a2a1631e92725fc8`. Official code/weights use Apache 2.0; the downloaded full license is retained in `docs/licenses/DINOV2_LICENSE.txt`. Backbone pretraining overlap with the public skin-image sources is unknown. Apache permission for this backbone is separate from SCIN/atlas-image conditions and does not confer clinical validity or resolve downstream commercial rights.

No v2 source photographs are newly collected SkinSnap patient data. Acquired originals/caches remain ignored; distributed graph parts, fitted heads and aggregate measured reports document actual research computation. Historical MobileNet failures, failed int8 export and fourteen-category failures remain disclosed. Old SCIN app examples are credited development images, not new independent v2 test evidence. See [the v2 card](docs/PHOTO_MODEL_CARD.md) and [source-access instructions](docs/OVERNIGHT_TRAINING.md) for hashes, modifications and evaluation boundaries.

## Educational references and archived assets

AAD references support original paraphrased educational text; the app does not redistribute AAD article text or clinical images. See [educational sources](docs/EDUCATIONAL_SOURCES.md). Original retail screenshots and mock product assets remain in `legacy/` solely as the historical project record; their licensing is unresolved and they are excluded from the deployed site. The [repository audit](docs/REPOSITORY_AUDIT.md) records their origin and treatment-claim issues.
