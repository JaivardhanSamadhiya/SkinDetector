# 90-second technical demo

Rehearse against the actual deployed build and actual trained artifact. This script assumes model loading/inference has been verified. If weights cannot load, show the unavailable state and say so; do not use a prerecorded prediction as a live response. Use a licensed held-out example from the app, never a person's private image.

| Time | Screen/action | Suggested narration |
| --- | --- | --- |
| 0–12 s | Landing page, then Skin Analysis | “SkinSnap is an education and research tool. Our old prototype redirected every upload to rosacea; we preserved that history and rebuilt the workflow with a real, narrow image model.” |
| 12–27 s | Select a licensed demo image; show its dataset label and image-domain choices | “This task ranks seven categories of dermoscopic lesion images. A dermoscope is a specialist imaging device. Smartphone photos and selfies are unsupported. This example comes from the documented noncommercial research release.” |
| 27–45 s | Confirm permission, analyze, show progress and results | “The browser checks file decoding, size, focus and exposure, verifies the model hash, then runs ONNX tensor inference on this device. These technical checks do not establish medical suitability.” |
| 45–59 s | Show ranked scores; show uncertain state if returned | “These are model scores, not disease probabilities. We show uncertainty and alternative labels. An image cannot rule out a concerning lesion, and this output cannot replace an examination.” |
| 59–69 s | Move CAM overlay opacity slider | “The explanation comes from this model's actual feature activations. It shows regions contributing to its ranking, not proof that a diagnosis is correct.” |
| 69–81 s | Research page with actual metrics and limitations | “On 1,218 held-out images, macro-F1 is 0.634 and balanced accuracy 0.695. Melanoma recall is only 39 of 70. Patient independence and skin-tone performance are unverified. This is a teaching baseline, not a clinical screen.” |
| 81–90 s | Delete image/result; end at library or analysis | “Delete clears the local session. Our initial product hypothesis is a transparent teaching workflow. Clinical and commercial use need separate validation, rights and regulatory work.” |

Before recording, confirm those measurements still match the displayed model version and saved report. Never call an image benign, safe or all-clear based on this demo. A model/category mismatch is an instructive limitation, not a reason to manufacture a better result.

For Banana Hacks include event-window/new-work disclosure only if eligibility is confirmed. For UnivaBio emphasize health rigor and honest limitations. For Next Founders expand to its required video length and add the explicitly hypothetical education-market business model from [startup positioning](STARTUP_POSITIONING.md).
