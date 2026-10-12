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
| NumPy | Numerical preprocessing/evaluation | [BSD 3-Clause](https://github.com/numpy/numpy/blob/main/LICENSE.txt) |
| Pillow | Bounded image decode, EXIF orientation and resize | [MIT-CMU / historical PIL license](https://github.com/python-pillow/Pillow/blob/main/LICENSE) |
| FastAPI | Optional research HTTP service | [MIT](https://github.com/fastapi/fastapi/blob/master/LICENSE) |
| Uvicorn | ASGI runtime | [BSD 3-Clause](https://github.com/encode/uvicorn/blob/main/LICENSE.md) |
| ONNX | Model graph export | [Apache 2.0](https://github.com/onnx/onnx/blob/main/LICENSE) |
| Vitest | Unit tests | MIT; included package notice |
| Playwright | Browser tests | Apache 2.0; included package notice |

Button components follow the common shadcn/ui-style Radix/variant composition pattern; they are not an independently invented component architecture. AI coding assistance was used. No pretrained model weights are claimed: the documented compact CNN is trained from scratch on the licensed research data.

## Dataset, demonstrations and weights

DermaMNIST-C 28 is the corrected HAM10000-derived research dataset distributed by Kumar Abhishek, Aditi Jain and Ghassan Hamarneh in [Zenodo record 12739457](https://zenodo.org/records/12739457), described in [their 2024 dataset-quality paper](https://arxiv.org/abs/2401.14497). Credit the source HAM10000 creators as recorded in the model card and demo manifest.

The NPZ image datasets are **CC BY-NC 4.0**; the metadata CSV files are **CC BY 4.0**. Demo images are adapted from that image release and retain attribution, provenance and the noncommercial restriction. Low-resolution resizing is explicitly disclosed. The resulting weights are distributed conservatively for noncommercial research/education with the source-data restrictions documented. Their commercial rights have not been cleared. A startup pitch is a hypothesis, not permission to commercially exploit these images or model weights.

See [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) and [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) for the actual terms. The project makes no warranty of clinical accuracy. Do not substitute synthetic skin imagery, mislabeled scraped images or retail assets for a licensed evaluation set.

## Educational references and archived assets

AAD references support original paraphrased educational text; the app does not redistribute AAD article text or clinical images. See [educational sources](docs/EDUCATIONAL_SOURCES.md). Original retail screenshots and mock product assets remain in `legacy/` solely as the historical project record; their licensing is unresolved and they are excluded from the deployed site. The [repository audit](docs/REPOSITORY_AUDIT.md) records their origin and treatment-claim issues.
