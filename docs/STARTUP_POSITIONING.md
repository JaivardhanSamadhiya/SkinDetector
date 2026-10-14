# SkinSnap: a retailer-funded shopping assistant to validate

Business positioning updated October 12, 2026 (America/Los_Angeles). This is a product and business hypothesis, not evidence of customers, revenue, partnerships, medical benefit, or willingness to pay.

**Photo-feature status, 14 October 2026:** the genuine DINOv2 SCIN + corrected Fitzpatrick17k-C experiment completed final evaluation, but supported-category precision is poor and fixed-threshold accepted accuracy is only 47.73%. Its int8 deployment failed; original float32 remeasurement and actual Chromium WASM parity have passed, while the final production build and all 27 application browser tests passed. V2 scores remain uncertain and cannot generate condition-based shopping decisions, even after execution is verified. Historical MobileNet stays disabled, and no named category passed the broader 14-category benchmark. Future joint rules are implemented, not validated condition identification or product-response prediction. Pitch high-accuracy image-driven care as unresolved.

## The problem, shopper, and payer

Start with **small independent online retailers carrying several skincare brands**. The end user is an adult beginner trying to choose a simple everyday routine while respecting existing products, ingredient preferences, and a total spending limit. The retailer is the proposed payer; shoppers use the assistant free.

The job to be done is a clear shopping decision: use what is already owned, fill only missing cleanser/moisturizer/sunscreen basics, explain each choice, and know the full basket cost. Product-selection enquiries and unfinished purchases may cost stores money or time; neither their scale nor SkinSnap's impact has been measured. Interview merchants using their real workflows before presenting this as a validated problem.

Product promise: **“A simpler routine. A clearer purchase.”** This is not an AI diagnosis business, a dermatology clinic system, or a claim to find a medically optimal routine. A changing, bleeding, painful, or non-healing spot needs professional evaluation; products must not delay it.

## What works now and what must be built

| Current working prototype | Planned retail product; not implemented |
| --- | --- |
| /routine/ offers a standalone survey-driven care planner without an image | Storefront embed and merchant onboarding |
| Reuses already-owned cleanser, moisturizer, and sunscreen basics | Merchant catalog import and verified product/variant mapping |
| Deterministic preference/ingredient filters, up to two choices per missing step, and manufacturer/retailer links | Live price, stock, regional formulation, and availability feeds |
| Numeric USD cap selects a complete eligible small-catalog basket using ordinal preferences and six dated prices; if none fits, shows cheapest complete basket/shortfall | Merchant-wide live-price, tax/delivery/fulfilment-aware basket optimization |
| Separate shopper-entered price/tax/delivery arithmetic compares a quoted basket with an entered budget | Merchant-wide fee/fulfilment calculation and order handoff |
| Session-memory preferences and clear/reset controls | Real checkout handoff, aggregate attribution, consent and retention design |
| Separate real dermoscopic research inference with documented evaluation | Paid service, subscription billing, pilot delivery, and conversion measurement |
| Genuine DINOv2 photo training/final evaluation, source-specific errors and conservative uncertainty; future joint rules separately tested | High-precision representative photo identification, new independent evaluation, product-response evidence and commercially cleared model/data rights |

The six retail snapshots were checked on October 12, 2026, for the displayed US package sizes and named Target/Walmart sellers. They are not live quotes or stock checks; users must recheck the listing. The selected-combination subtotal counts one package per missing basic and excludes tax/delivery, including possible separate delivery fees across stores. The manual calculator does not fetch current retail prices, select the cheapest basket, include unentered taxes/shipping, or establish that items are purchasable. Manufacturer and retailer links provide information and a route to the seller; SkinSnap has no checkout and does not imply a completed purchase. No affiliate relationships, commissions, paid subscriptions, waitlist, customer signup, fabricated testimonials, or invented availability are represented in the current application.

Future joint rules would combine accepted supported appearances with preferences; synthetic fixtures establish policy behavior, not classifier performance. V2 independently blocks that branch because accepted accuracy was poor, regardless of artifact availability. Source differentials/atlas labels are not uniformly confirmed diagnoses and rules lack product-response validation. Current matching uses the seven-item survey, mandatory exclusions, owned basics, ordinal preferences and numeric cap. Other/uncertain/unavailable/mismatched outputs abstain. Dermoscopic labels never choose treatment; no task establishes arbitrary disease, allergy, severity, healthy all-clear or medically best products.

## Competition and the proposed difference

This is a crowded category. [SkinSort Premium](https://skinsort.com/support/what-is-skinsort-premium) already advertises routine insights, scans, product comparisons, and ingredient preferences. [Skin Bliss Pro](https://getskinbliss.com/quiz/pro) advertises combinations, owned-product swaps, and broader routine tools. [RevenueHunt's skincare documentation](https://docs.revenuehunt.com/tutorials/skincare-routine/) describes storefront routine quizzes with catalog product data. Do not claim that a survey, product recommendations, ingredient filtering, or AI branding is novel.

The proposed focus is a whole-basket decision with explicit constraints: reuse owned basics, apply chosen exclusions, fill only the gaps, calculate the full cost, explain why each step exists, and say when no catalog combination fits. A merchant must demonstrate why these decisions serve its customers better than its existing product finder. The project has no measured competitor advantage and no endorsement or partnership from these companies. Ingredient labels do not reveal concentrations, predict individual tolerance, or prove clinical suitability; current packaging and professional advice still matter.

## Revenue and economics hypotheses

Propose a **$49 per store per month** SaaS test price in USD, with free use for shoppers. It is unavailable to purchase and is not market-validated. Research on October 12, 2026 found [RevenueHunt](https://revenuehunt.com/) advertising its Basic plan at $39/month billed monthly and [Prehook](https://prehook.com/pricing/) its Basic plan at $45/month billed monthly. Those offers demonstrate an existing paid-software category and serious alternatives, not that any merchant will pay SkinSnap. Prices and competitor offerings can change.

A merchant's value should be measured as:

**incremental gross margin + measured support savings − SkinSnap fee − integration/operating costs**

For illustration only, a proposed $49 fee and an assumed $5 gross margin per additional order require **ceil(49 / 5) = 10** additional orders to cover the fee alone. Both inputs are planning assumptions, not measured margins, a conversion forecast, or a promise of profit. Returns, discounts, attribution, acquisition, taxes, other costs, and reduced sales to customers who already own basics can change the result. A trust-preserving assistant should not add needless products just to increase basket size.

SkinSnap's contribution per store is **fee − hosting/infrastructure − payment/platform fees − support − refunds**, before customer acquisition, onboarding, catalog review, content review, maintenance, compliance, and overhead. Record actual costs, support time, churn, and renewal behavior before asserting sustainable unit economics. Do not publish fabricated market size, revenue, savings, conversion lift, margins, or paying-customer counts.

## Low-cost falsifiable validation

These are proposed experiments, not completed research or traction:

1. **Five merchant interviews:** examine product-selection enquiries, current quiz tools, support time, authority to buy, catalog constraints, and reasons they might choose an incumbent instead. Ask about actual recent workflows, not only a hypothetical liking for the idea.
2. **Twenty adult beginner shopper sessions:** compare the current flow with the prototype using a merchant-approved catalog. Observe completion, decision time, whether a shopper can explain the full cost, and whether they understand that a product routine is not a diagnosis or guaranteed allergy screening. Retain no skin images; record feedback with consent. These sessions diagnose usability problems, not conversion lift.
3. **Two contingent paid-pilot commitments:** request a specific commitment at the proposed price, conditional on a usable integration and agreed measures. A conversation or letter of intent is not a contract, a paying customer, or revenue. If stores will not commit, change the offer before building a large integration.
4. **A properly planned storefront comparison:** after implementing the necessary integration, randomize eligible sessions between SkinSnap and the merchant's current shopping flow. Predefine the sample size, time window, eligibility, attribution, and decision rule. Measure incremental gross margin, support minutes, completion, refunds/returns, and misunderstanding; avoid reporting purchase conversion without accounting for selection effects or calling an underpowered sample a proven lift.

Initial acquisition hypothesis: direct discovery with small multi-brand stores, followed by a limited pilot on their existing traffic. No consumer advertising budget, partner channel, pilot, or merchant agreement has been established. Proceed only if the buyer's value after costs justifies a fee and consumers understand the guidance; revise or stop if current tools solve the job better.

## Privacy, commerce, and medical boundaries

The routine planner requires no lesion photo or identity. Survey answers, selected options and entered quotes remain in browser memory in the current prototype, and clearing the session removes them. Preference changes reset starting choices. Default image inference in the separate research demonstration runs on the device. Hosting providers may process request metadata; external manufacturer and retailer links apply their own policies after a click. [Current privacy documentation](SECURITY_AND_PRIVACY.md) describes implemented behavior.

Future retailer integration and aggregate measurement need consent, access controls, retention policies, and explicit disclosures. Do not silently turn cosmetic preferences or lesion images into advertising segments. Disclose commercial sponsorship or affiliate relationships if later introduced; never let payment override ingredient exclusions or present a sponsored product as a medically superior choice.

Future accepted appearance rules could influence catalog selection; v2 is explicitly barred after poor accepted precision, with browser execution verified. Ingredient exclusions and owned basics remain mandatory; budget-driven eligible alternatives disclose preference compromises. Dermoscopic labels never choose treatment products. No comparative product-outcome evidence establishes an absolute best combination. No diagnosis, prescription, treatment plan, comprehensive allergy screen, all-clear or clinical approval is claimed. Clinical expansion needs a distinct intended use, appropriate rights, clinician-led safety work, representative external/prospective and product-response evaluation, privacy/security review and qualified regulatory assessment.

## Research model licensing is a separate launch gate

The real dermoscopic classifier and its demo images remain a **noncommercial research demonstration**, not the core or a feature of the proposed paid retailer assistant. [DermaMNIST-C's image arrays](https://zenodo.org/records/12739457) use CC BY-NC 4.0; metadata uses CC BY 4.0. This project distributes its data-derived artifacts for noncommercial research and education. They must not be included in a commercial deployment until appropriate permissions are obtained or a commercially permitted replacement is trained/integrated and evaluated. A separate tab or disclaimer alone does not resolve commercial rights.

The consumer shopping product must be independently deployable without those research artifacts. Current code/product-data rights, manufacturer information reuse, distribution, trademark presentation, and the final paid offer also require review; the repository does not invent permissions or an overall software license. No rights clearance or paid-launch readiness is claimed.

Photo-v2 combines SCIN's custom attribution/no-re-identification license with original Fitzpatrick17k atlas-image **CC BY-NC-SA 3.0** research conditions; corrected metadata's CC BY 4.0 does not relicense photographs. DINOv2 code/official weights are Apache 2.0, separate from those downstream rights. Original DermaAmin terms were not independently confirmed, and trained-artifact/privacy/personality rights remain unresolved. Historical MobileNet's ImageNet-derived weight rights are separately documented. None of these research artifacts is cleared for a paid offer; model precision, product response, source representativeness and final intended-use assessment also need further work.

## Five-sentence Next Founders plan

Position SkinSnap as a free skincare shopping assistant for adult beginners, funded by small independent multi-brand retailers that can measure the value of clearer purchase decisions. Demonstrate the saved survey, numeric-cap complete basket, product explanations/prices/links and habits, while showing genuine research computation and explicitly disclosing why poor accepted precision blocks condition-based care. Test a $49 monthly store subscription against existing quiz tools, measuring incremental gross margin and support time rather than promising conversion gains. Interview five merchants, observe twenty shoppers and seek two contingent paid-pilot commitments before expanding the product. Build the five-minute pitch around actual performance and limitations, transparent economics and a future retail build whose complete model/data rights and intended use are cleared before paid launch.
