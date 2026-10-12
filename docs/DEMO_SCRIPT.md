# 90-second technical demo

Rehearse against the actual deployed build and actual trained artifact. This script assumes model loading/inference has been verified. If weights cannot load, show the unavailable state and say so; do not use a prerecorded prediction as a live response. Use a licensed held-out example from the app, never a person's private image.

| Time | Screen/action | Suggested narration |
| --- | --- | --- |
| 0–10 s | Landing page; open navigation guidance; enter Skin Analysis | “SkinSnap is an education and research tool. We preserved our old prototype and replaced its fixed rosacea redirect with a real, narrow model.” |
| 10–23 s | Set a few survey preferences; select a licensed demo image | “The survey personalizes basic care education. The separate model ranks seven dermoscopic image categories; ordinary phone photos are unsupported. This is a credited research example.” |
| 23–40 s | Confirm permission and the supported domain; analyze live | “We validate the image and run ONNX tensor inference on this device. File and quality checks do not establish medical suitability.” |
| 40–54 s | Show genuine scores, uncertainty, next step and the automatically displayed routine | “Scores are not disease probabilities. The routine comes from my survey, not a diagnosis. Products do not treat or clear this lesion; a concerning spot needs professional evaluation.” |
| 54–64 s | Show product reasons/source links and move CAM opacity slider | “Product information has manufacturer sources. This overlay comes from real model activations; it is not proof of medical correctness.” |
| 64–80 s | Research page with actual metrics and limitations | “On 1,218 held-out images, macro-F1 is 0.634 and balanced accuracy 0.695. Melanoma recall is only 39 of 70. Patient independence and skin-tone performance are unverified.” |
| 80–90 s | Startup page briefly; return and clear the session | “We propose an educator teaching toolkit, with pricing and demand still untested. Commercial rights are a launch gate. Clearing this session removes the local image, result and preferences.” |

Before recording, confirm those measurements still match the displayed model version and saved report. Never call an image benign, safe or all-clear based on this demo. A model/category mismatch is an instructive limitation, not a reason to manufacture a better result.

Banana Hacks is no longer an active target after the missed window. For UnivaBio emphasize health rigor, accessible guidance, supported-domain limits and honest finished-versus-planned reporting; do not frame the routine as treatment or claim improved patient outcomes. For Next Founders expand to its five-minute format with the proposed buyer, price/cost assumptions, licensing gate and validation experiments from [startup positioning](STARTUP_POSITIONING.md). Show the real app first, then the business hypothesis; do not simulate customers, checkout, testimonials or partnerships.

## Suggested five-minute Next Founders recording

| Time | Focus |
| --- | --- |
| 0:00–0:45 | One buyer and job: university instructors preparing a clear health-literacy or image-AI lesson; describe the problem as a hypothesis, with any actual interview evidence identified separately. |
| 0:45–2:45 | Show the navigation guide, short survey, licensed example, actual model execution, automatic general routine, ingredient/constraint reasons, uncertainty, CAM and deletion. Briefly show Next.js/ONNX/PyTorch architecture; disclose that skincare rules do not use a lesion prediction. |
| 2:45–3:45 | Open `/startup/`: free learner offer, proposed department toolkit at $499/year, a hypothetical 10-license budget, excluded costs, planned features and commercial-rights prerequisite. |
| 3:45–4:30 | Show real held-out metrics and failure cases. Explain the dermoscopy/smartphone distinction, low melanoma recall, missing skin-tone/patient labels, and no clinical validity. |
| 4:30–5:00 | Proposed 10-instructor/20-learner experiments, license-cleared launch steps, the 2024 project/history disclosure, third-party credits and AI assistance. No promised prize or invented traction. |

Keep these segments within five minutes; the timing is our presentation suggestion. Rehearse against the final deployed build, show only licensed examples, and verify judges can access the demonstration before submitting. Recording and submitting competition materials remain separate actions.
