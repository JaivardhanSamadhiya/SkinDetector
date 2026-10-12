# SkinSnap: an education-first business to validate

SkinSnap's current product is a student/research demonstration, not a clinical service. The following statements are product hypotheses to test, not evidence of demand, revenue or clinical value.

The application now includes a dedicated `/startup/` page with the buyer hypothesis, proposed free/paid offer, illustrative finances, staged validation plan, and an explicit commercial licensing gate. It is a presentation of a possible business; it has no purchasing, customer signup, promised service, or claimed revenue. The guided upload flow and survey-based routine are functioning product features. Instructor lesson packs, workshop facilitation guides, and paid support are planned features, not implemented services.

## Problem, buyer and initial users

Students and the public encounter skin images without enough context to distinguish image classification from diagnosis. Research demos can obscure supported image types, dataset licenses, class imbalance and uncertainty; fragmented skincare advice can make a simple routine hard to understand. These are problem hypotheses to investigate, not a quantified market study.

Start with **one buyer: university instructors who teach introductory health literacy or medical-image AI and have a department learning-resource budget**. Students are the users; instructors or their departments are the proposed payers. The job to be done is running a clear lesson without rebuilding an image-model demonstration from scratch. Interview instructors about preparation time, existing alternatives, purchasing authority and unmet needs before asserting willingness to pay. Student societies and nonclinical workshops are trial/distribution channels, not a second paying segment.

## Proposed differentiation

Combine clear navigation guidance, local image processing, a visible supported-domain choice, pre-inference quality feedback, transparent artifacts/evaluation, honest rejection states and source-linked skin education. After an analysis completes, show a simple care routine and linked real-product examples chosen from self-reported preferences and constraints. Product selection is a separate, deterministic educational rules engine; it is not a treatment selected by the lesion classifier. Never say a model score establishes a person's condition or that a suggested product treats that category.

Existing tools may meet some of these needs; competitor shortcomings are an interview question, not an established fact. Compare instructor preparation time, learner comprehension, image retention, domain disclosure and reproducibility using a documented method. Do not claim to be first or better at diagnosis. Manufacturer links are for product information, with no invented prices, efficacy, reviews, stock or checkout. No affiliate relationship or commission is represented in this build.

## Go-to-market and finance hypothesis

Propose free learner education and a department-paid teaching package with reproducibility materials, lesson packs, workshop guides and support. The current owner-private prototype does not establish a public-access service or a paid offer. The proposed **$499 per department per year** is an interview/test price in USD, not an available subscription, a market-verified price or a purchasing commitment. All paid features require development and commercial rights clearance. No paying customers, pilots, partnerships or conversion measurements are claimed.

The current [DermaMNIST-C image arrays](https://zenodo.org/records/12739457) are **CC BY-NC 4.0**, while metadata is CC BY 4.0. This repository distributes its data-derived research model for noncommercial use. Before charging for a deployment that includes that model/data, obtain appropriate permission or replace it with a commercially rights-cleared artifact and evaluate the replacement. The application code's license does not grant commercial image/model rights. Seek qualified licensing advice for the final paid offer; this document does not determine legal eligibility.

An illustrative first-cohort budget, also displayed under the page's finance disclosure:

| Planning assumption, annual USD | Amount |
| --- | ---: |
| 10 department licenses × $499 | $4,990 hypothetical revenue |
| Hosting allowance | $300 |
| Support: 20 hours × $40 | $800 |
| Content review: 10 hours × $100 | $1,000 |
| Maintenance: 40 hours × $40 | $1,600 |
| Remainder before other costs | $1,290 |

These are chosen planning assumptions, not measured costs, quotes or evidence of demand. The remainder is **not profit**: acquisition, payment fees, taxes, insurance, licensing, validation, compliance and additional development are excluded and could make the plan uneconomic. Record actual time and infrastructure bills before proposing sustainable pricing. On-device inference moves default computation to the user's device; it does not make hosting/model delivery, support or validation free. Avoid unsupported market-size or saving claims.

## Initial validation experiments

These are proposed work after the prototype, not completed customer research:

1. Interview 10 university instructors or department budget holders. Record existing workflows, lesson preparation time, unmet needs and price reactions with consent; do not invent quotes or imply purchase intent equals revenue.
2. Run 20 supervised learner usability sessions. Predefine success: at least 16 correctly distinguish a model category from a diagnosis, and no participant interprets a low score as an all-clear. Also record upload/guide completion, ability to explain the supported domain, and whether routine selection reasons are understood.
3. Run three noncommercial teaching workshops, with consent and appropriate licensing review. Measure instructor preparation time, repeat use, support requests and retention of learning; do not retain learner skin images.
4. Obtain model/data rights clearance or an appropriate replacement, then test a real paid offer with budget holders. Measure delivery/acquisition costs and renewal interest before claiming financial sustainability.

Skin-literacy gains, instructor time savings, purchase intent and educational impact remain unmeasured. A negative experiment should change the target, offer or business rather than be hidden. Keep product commerce and educational/inference results separate.

## Privacy

The default path processes the selected image in the browser. Survey preferences are held in browser memory and are not included in inference requests; deletion/reset must clear those preferences along with local image/result data. The optional server mode must disclose the processing host and its operational retention policies. Do not collect names, contacts or images for model improvement by default. Hosting providers may process request metadata; the repository cannot promise their logging configuration. Follow manufacturer links only after an explicit click; the external site then applies its own policies.

## Before clinical use

Obtain appropriate rights for datasets/model distribution/commercial use; commission independent external and prospective evaluation, relevant subgroup assessment and clinical review; test robustness and calibration for the intended population and devices; assess real harms and fallback workflows; complete privacy, security and regulatory work with qualified experts. The research benchmark is not evidence of clinical utility. Regulatory status is not asserted here.

## Five-sentence Next Founders plan

Position SkinSnap around university instructors who need a clear, reusable way to teach skin literacy and medical-image AI, giving the startup one defined buyer and job to solve. Demonstrate the guided analysis and preference-based routine live, while making the model's dermoscopy limits, uncertainty, and privacy visible. Present free learner access and a proposed $499 annual department teaching package with explicit cost assumptions, and make commercial data/model rights clearance a prerequisite for selling it. Interview 10 instructors and test with 20 learners to measure comprehension, preparation time, and willingness to pay, reporting only evidence actually collected. Use the five-minute pitch to give equal attention to working technology, usable design, realistic finances, and a clear launch plan, matching the event's four equally weighted judging criteria.
