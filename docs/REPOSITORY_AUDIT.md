# Original SkinSnap audit and reuse disclosure

Audited on October 11, 2026. The original tracked repository contains two HTML files and eight PNG assets, with no separate JavaScript source, package manager, backend, dataset, trained weights, training code, tests, or deployment configuration. All JavaScript is inline in the two HTML files.

The preserved source commit is `cfc59e97b1f02e0bcdf5eae971b407f72764d11f`, authored and committed January 11, 2024, with subject `final`. The original Git history remains in this repository. `legacy-origin` identifies [SkinSnap](https://github.com/JaivardhanSamadhiya/SkinSnap); `origin` identifies [SkinDetector](https://github.com/JaivardhanSamadhiya/SkinDetector). Moving files to `legacy/` does not turn them into newly authored work.

## Findings

| Component | Observed behavior | Decision |
| --- | --- | --- |
| `Skinsnap.html` | Single page with anchor navigation, instructions, upload, retail cards, contact form, and scroll-to-top button. Upload `onsubmit` calls `openRosacea()`, which unconditionally navigates to `Rosacea.html`. The selected file is never read. | Archive unchanged; replace upload, navigation, layout and interactions. |
| `Rosacea.html` | Static `Your Prediction: Rosacea` heading and product cards. No image analysis occurs. | Archive unchanged; replace with actual inference and honest unavailable/rejected states. |
| Inline purchase code | SweetAlert reports successful purchase or cart insertion without checkout, inventory or transaction. Some buttons only open third-party retail links. | Remove from active app; educational care guidance has no checkout or purchase confirmation. |
| Original contact form | Posts names, email addresses and messages to an existing Formspree endpoint. Endpoint ownership/retention is not documented. | Do not carry endpoint or data collection into the new application. |
| Navigation | Scroll buttons, fixed 800-pixel hero, large fixed-height sections and hover-only product buttons. | Rebuild with semantic navigation, keyboard access, responsive layouts and visible controls. |
| Medical/product claims | Image-based diagnosis and product recommendations implied without model evidence; mock fluorouracil asset contains an unsupported melanoma-treatment claim. | Archive only; exclude all treatment/product claims from the active app. |

## All original image assets

Every asset was opened and visually inspected. Dimensions below are pixel dimensions. These are promotional/product illustrations and brand screenshots, not a labeled dermatology dataset. Their original creators, image permissions and licenses are not recorded in the old repository.

| File | Dimensions | Content | SHA-256 |
| --- | --- | --- | --- |
| `Hyperpigmentation conrad challenge.png` | 654 × 653 | Mock azelaic acid promotion | `854129a25a71b5c0c936c31d8d16dc079d3be582a6de36c3ad69979a2ac75c8a` |
| `MIMI.png` | 345 × 651 | La Roche-Posay product screenshot | `b324f987667917507146391147e6da15aa99e39143fe4d8ceaba0479676166b4` |
| `ohio cream.png` | 683 × 690 | Mock fluorouracil 5% promotion with unsupported treatment claim | `eef624d4408c24a31396258146d4c03cba64258efb3d223d48f89075e4c8132d` |
| `ORDINARY LOL.png` | 691 × 831 | The Ordinary product screenshot | `8ef408a9e3a1ecdaff68c6dc995918a26b4cc8eda9b3a3e526621eab692b110e` |
| `SIGMAOHIO.png` | 1820 × 683 | Original SkinSnap promotional hero | `d566234672712832007d1c36010bdfb3b6aa075212d8c5a729efd2519f0d350d` |
| `SKIBIDI_2.png` | 615 × 576 | Mock moisturizer promotion | `1bc771a8b3936ad64363ca2bea6a7dc48a4f9e197ec5417420ad72dce94a58c3` |
| `SKIBIDI.png` | 408 × 576 | Prosacea product screenshot | `6371b260e8b58e7038c45f5f88f25cc4c3720f24c22f1c91ab2ab1af029e8138` |
| `Sunscreen.png` | 597 × 543 | Mock sunscreen promotion | `e5898238d8858ed757da317220c5bc5e0885e82764cdd2dae62fdd0afda59285` |

## Reused versus newly implemented

Reused: the SkinSnap name, educational intent, repository history and the original files as an archival record. No original HTML/CSS/JavaScript, retail assets, transaction behavior or model was reused in the active application.

New: the Next.js/TypeScript application, design system, upload/quality/results flow, browser inference adapter, Python model training and optional inference service, educational pages, research disclosure, tests, deployment configuration and documentation. These depend on openly credited third-party frameworks and licensed dataset/model components; they are not wholly original inventions.

AI coding assistance was used in this rebuild. Include that fact and the actual model/data provenance in any submission. Do not describe the January 2024 prototype, dataset images, pretrained components or existing project concept as work created during a new competition.

**14 October 2026 additions:** the survey-first workflow, numeric USD-cap complete-basket selector, option-specific explanations and everyday-care guidance are new application work. Photo-v2 adds duplicate/exposure-controlled SCIN + corrected Fitzpatrick17k-C preparation, reproducible frozen-DINOv2 head experiments, locked evaluation, failed-export disclosure and a strict split-artifact browser adapter. DINOv2 architecture/official pretrained weights, source photographs and corrected atlas partitions are reused third-party research components. New trained heads and integration do not make them newly collected data or newly invented backbones. All v2 outputs remain uncertain after poor accepted accuracy; no cancer detector or condition-specific product validation is claimed. [The v2 card](PHOTO_MODEL_CARD.md) and [third-party notices](../THIRD_PARTY_NOTICES.md) give exact credit and rights boundaries.

## Verify preservation

For each original tracked asset, compare its old Git blob with the corresponding `legacy/` file; ordinary file SHA-256 checks can also verify the inventory above. Do not rewrite Git timestamps or squash away the original provenance to imply eligibility. `legacy/` is outside the deployed `public/` directory and is not served by the application.

All ten original HTML/image files were compared byte-for-byte against that commit. The archived HTML retains the original line endings through `.gitattributes`. Its SHA-256 values are `fe08822fee6bf03f7394e6317a8af8cb147980c352c8a591d509df4ff91bdad2` for `Rosacea.html` and `31cf8238455aeff05320d9df76280174f1f7bce23ee4353600deca33741bdc73` for `Skinsnap.html`. The root ignore rules were extended for the new tooling; the original ignore file remains recoverable from Git history.
