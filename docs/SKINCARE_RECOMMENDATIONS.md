# Appearance and preference based skincare options

Added 11 October 2026; numeric-cap selection and survey-first workflow updated 14 October 2026. The results page immediately explains a selected cosmetic catalog combination. Future appearance rules can combine an accepted acne-like/dermatitis-like research result with preferences, but photo-v2's measured accepted accuracy (47.73%) does not justify activating those rules. Current v2 research results remain uncertain and supply survey-only options. This is a transparent small-catalog rule system, not a product-response model, clinical treatment or guarantee of the absolute best product. A dermoscopic lesion prediction never chooses treatment. Filename tricks, fabricated scores and generic LLM responses are not classifier inputs.

**Current release boundary:** historical MobileNet inference remains unavailable; the real DINOv2-v2 model completed final evaluation, repaired float32 ONNX remeasurement and genuine Chromium WASM parity. V2 condition-driven products remain disabled regardless of browser readiness or high individual scores. Its post-test safety restriction does not establish a validated operating point. Future joint rules are exercised with clearly identified software fixtures, never substituted for live predictions or model measurements. [The photo evaluation report](PHOTO_EVALUATION_REPORT.md) records the poor accepted precision, source shift, failed int8 export and undeployed 14-category experiment.

## How the image result and survey combine

`lib/condition-aware-routine.ts` validates the complete response against `AnalysisSchema`, exact photo-model identity, input size and class mapping. It independently prevents v2 appearance-specific care, even for a manipulated `assessed` payload. Future joint rules additionally require an available, quality-passed, accepted result and supported top category. [The full policy](CONDITION_MATCHING_RULES.md) records those checks. No score establishes that the appearance was correctly classified.

For the acne-like branch, cleanser and moisturizer candidates require a verified product-specific noncomedogenic manufacturer label; the current candidates are Vanicream Gentle Cleanser, Daily Moisturizer and Moisturizing Cream. An explicit texture preference or self-reported dry feel refines the moisturizer. For dermatitis-like appearance, simple fragrance-free cleansing and a cream for general barrier care become the default; an explicit light-texture preference selects lotion with a disclosed compromise against cream-focused eczema guidance. The broad dermatitis group is not a confirmed eczema diagnosis. Sunscreen stays a general sun-protection example, with acne compatibility and individual tolerance explicitly unverified.

Ingredient exclusions and owned-product reuse always take precedence. Every selected item/alternative must meet the applicable rules. Future-branch software tests select a light lotion for acne-like and cream for dermatitis-like fixtures; they demonstrate policy behavior, not current condition-driven recommendations. After eligibility filtering, the numeric cap chooses a complete basket using ordinal preference ranks and dated prices. A cheaper eligible alternative can change the starting selection, with the tradeoff disclosed; price never establishes equivalent tolerance or benefit.

Uncertain, other, unsupported, unavailable, quality-rejected, malformed or changed-model responses abstain from condition matching and show preference-only general care. There is no rosacea class, automatic allergy detection, skin-type inference or healthy-skin all-clear. Ordinary-photo inference uses its own trained model and never applies the dermoscopic network to phone photos. The standalone routine planner remains survey-only because it requires no image or inference.

## Separate dermoscopic lesion guidance

`lib/result-guidance.ts` first validates the complete response against `AnalysisSchema`. Only an `assessed` response with the documented dermoscopic image type, 28-pixel input and exact seven-category mapping can show label-specific education. It uses the highest score even if the score list is unsorted. The copy describes a **model label**, not a confirmed condition, and links to American Academy of Dermatology information. Melanoma, basal cell carcinoma and actinic keratosis/intraepithelial carcinoma categories explicitly direct users toward professional evaluation; mole-like and benign-sounding categories never supply an all-clear. Dermatofibroma and vascular categories use general skin-cancer evaluation guidance rather than inventing a diagnosis-specific product recommendation.

The seven-category lesion model cannot identify acne, rosacea, eczema or skin type from ordinary photographs. Its outputs take the `review_first` decision path and cannot activate the new photo model's cosmetic rules. Non-assessed lesion responses use generic unable-to-assess education. Neither model validates a photographed concern as suitable for cosmetic treatment.

## Inputs and privacy

`lib/skincare-preferences.ts` validates seven self-reported inputs with a strict Zod schema:

- Skin feel: unsure, dry, oily, combination or balanced.
- Sensitivity: unsure, yes or no.
- Purchase preference: minimal or flexible.
- Total new-product budget: USD 0–10,000, at most two decimal places; default $50.
- Texture: any, light or rich.
- Ingredients the person wants to avoid: fragrance, niacinamide and/or oat.
- Existing basic steps: cleanser, moisturizer and/or sunscreen.

These are preferences, not diagnoses. Unknown properties, unsupported options, duplicate selections and invalid caps are rejected. The analysis flow requires Save or explicit Skip before inference; editing answers requires saving again. Skip records general defaults, including a disclosed $50 cap, and completes the survey step. No identity, medical history or free-text allergy record is needed. Answers/product choices stay in session memory and never enter model tensors or inference requests. Editing/resetting preferences restores the filtered starting basket; session deletion clears choices/preferences/image/result. Seller links leave SkinSnap and have separate privacy practices.

## Routine rules

`buildSkincareRoutine` produces the survey-only baseline: gentle cleansing, moisturizer, then daytime sun protection. `buildConditionAwareRoutine` adds the accepted photo appearance's formulation criteria and ranking while preserving explicit exclusions, owned basics and texture constraints. Each step has morning/evening guidance, an explanation, an optional manufacturer example and up to one alternative. When two matching examples exist, the user can choose either with a radio control; one general sunscreen example is currently available. Ingredient exclusions, condition rules or reuse can reduce the number. The interface does not invent options to reach a target count.

Existing basics take priority: `reuseOwned: true`, no replacement item/alternatives and zero new spending for that step. The app cannot inspect or approve an owned formula. Both purchase modes fill only missing basics; alternatives substitute rather than add purchases. Neither adds serums, exfoliants or drug treatment. Complete-basket enumeration operates only over eligible catalog items and their dated prices; it does not search the market. No live-price/stock feed, checkout, transaction, affiliate relationship or clinical combination score is implemented.

In survey-only matching, self-reported oily/combination feel with no reported sensitivity favors the normal-to-oily foaming cleanser; other answers favor a simple cleanser. Ingredient exclusions override either preference. An explicit moisturizer texture overrides the default; otherwise dry-feeling skin selects a richer example and other answers select a lighter lotion. Unknown or reported sensitivity removes botanical moisturizer candidates as a conservative design choice, **not a tested prediction of irritation or allergy**. Accepted condition branches restrict cleanser/moisturizer candidates further to the verified traits documented above. The sunscreen example still contains aloe and other ingredients; neither sensitivity selection nor filtering guarantees tolerance.

Every candidate and alternative is filtered against its documented fragrance/niacinamide/oat presence before selection. Only these three ingredient choices are supported. The system does not identify every possible allergen, test cross-contamination or verify later reformulations. People with other known allergies or unexplained reactions should have a qualified professional review the full current product label. The general no-match branch supplies category guidance instead of inventing a compatible product if no verified candidate remains.

Future accepted appearance categories can alter filtering/ranking, but current v2, lesion, uncertain and other outputs cannot. `lib/routine-selection.ts` accepts choices only from already-filtered examples, preventing manipulated choices from bypassing exclusions or reuse. Changing, bleeding, painful, concerning or persistent findings need professional assessment independently of product guidance. No combination is claimed to treat a predicted disease or lesion; no prescription recommendation is generated.

## Dated retail prices and selected-combination subtotal

`lib/product-offers.ts` stores six manually checked US retail listings dated **12 October 2026**, separately from manufacturer ingredient facts. Each offer has an HTTPS seller link, package size, USD price in integer cents and checked date. These are snapshots, not current quotes or availability checks. No product photographs, ratings or reviews are reproduced, and no affiliate relationships or retailer endorsements are claimed.

| Product | Listed package | Seller | Dated USD price | Listing |
| --- | --- | --- | --- | --- |
| Vanicream Gentle Facial Cleanser | 8 fl oz | Target | $9.99 | [Retail listing](https://www.target.com/p/-/A-17425434) |
| CeraVe Foaming Facial Cleanser | 12 fl oz | Target | $13.79 | [Retail listing](https://www.target.com/p/-/A-14694910) |
| Vanicream Daily Facial Moisturizer | 3 fl oz | Target | $13.99 | [Retail listing](https://www.target.com/p/-/A-80038093) |
| Vanicream Moisturizing Cream | 16 oz jar | Target | $13.19 | [Retail listing](https://www.target.com/p/-/A-14768513) |
| Aveeno Calm + Restore Oat Gel Moisturizer | 1.7 oz | Walmart | $19.97 | [Retail listing](https://www.walmart.com/ip/909682689) |
| Blue Lizard Sensitive Mineral SPF 50 Sunscreen Lotion | 5 fl oz | Walmart | $15.48 | [Retail listing](https://www.walmart.com/ip/900975115) |

`chooseBudgetBasket` enumerates every complete combination of the already-filtered candidates, treating owned steps as zero new purchases. Among baskets within the USD cap, it minimizes the sum of category preference-rank offsets, then subtotal, then stable catalog order. These ordinal ranks encode stated rule preferences, never clinical superiority. If none fits, it shows the lowest-cost complete eligible basket and exact shortfall; it never drops a basic or weakens ingredient restrictions to invent affordability. A missing eligible item or verified offer yields `incomplete_catalog`, not a complete price claim. `tests/unit/routine-basket.test.ts` covers these boundaries.

Choosing an alternative immediately updates subtotal/cap feedback and may move the basket over budget. The cap and subtotal use one dated package per missing basic, excluding tax/delivery; multiple sellers can mean separate fees. This is optimization inside the small verified catalog, not guaranteed cheapest market pricing, normalized cost-per-ounce value or medically optimal care. Recheck seller, exact size, stock, current price and local formula before buying.

The separate manual checker remains in `/routine/`: users enter current local quotes, tax/delivery and a limit. It does not fetch values or re-optimize using those quotes; it checks the user's entered costs. Currency or selected/reused-product changes reset those amounts rather than converting or reusing another item's quote. The automatic basket selector uses only dated USD catalog prices and the survey cap. All choices/prices stay in session memory; Clear session resets them.

## Manufacturer facts and provenance

The six examples use US manufacturer pages and their complete ingredient lists checked on **11 October 2026**. Descriptions are brief factual summaries, with no reproduced photographs, logos, user reviews or marketing efficacy measurements. Product names remain their owners' trademarks. Regional formulas and package lists may differ or change, so users must verify their own packaging. No partnership or manufacturer endorsement is implied.

| Product example | Verified facts used | Survey ingredient presence | Primary source |
| --- | --- | --- | --- |
| Vanicream Gentle Facial Cleanser | Soap-free; glycerin listed; no botanical extracts described | Fragrance, niacinamide and oat not listed | [Manufacturer page](https://www.vanicream.com/product/vanicream-facial-cleanser) |
| CeraVe Foaming Facial Cleanser | Gel-to-foam; manufacturer targets normal-to-oily skin; contains ceramides | Niacinamide present; fragrance and oat not listed | [Manufacturer page](https://www.cerave.com/skincare/cleansers/foaming-facial-cleanser) |
| Vanicream Daily Facial Moisturizer | Lightweight lotion; squalane, hyaluronic acid and five ceramides | Fragrance, niacinamide and oat not listed | [Manufacturer page](https://www.vanicream.com/product/vanicream-daily-facial-moisturizer) |
| Vanicream Moisturizing Cream | Cream with petrolatum; facial/body use; fuller texture compared with the daily lotion | Fragrance, niacinamide and oat not listed | [Manufacturer page](https://www.vanicream.com/product/vanicream-moisturizing-cream) |
| Aveeno Calm + Restore Oat Gel Moisturizer | Lightweight gel; oat and feverfew listed; labeled fragrance-free | Oat present; niacinamide not listed; fragrance excluded by manufacturer | [Manufacturer page](https://www.aveeno.com/products/calm-restore-oat-gel-moisturizer-sensitive-skin) |
| Blue Lizard Sensitive Mineral SPF 50 Sunscreen Lotion | Broad spectrum; zinc oxide/titanium dioxide; 80-minute water resistance; aloe listed | Niacinamide and oat not listed; labeled fragrance-free | [Manufacturer page](https://bluelizardsunscreen.com/products/sensitive-mineral-sunscreen-lotion-spf-50) |

“Not listed” describes the checked manufacturer list; it is not an analytical test or an allergen-free guarantee. Sunscreen skin-tone appearance, regional availability, affordability and personal tolerance are not inferred by this survey.

## Guidance sources

- The [American Academy of Dermatology's budget routine guidance](https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget) supports keeping care simple and avoiding the assumption that higher prices mean better care.
- The [AAD's order-of-application guidance](https://www.aad.org/public/everyday-care/skin-care-basics/care/apply-skin-care-certain-order) supports cleansing followed by moisturizer and/or sunscreen.
- The [AAD's sunscreen guidance](https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen) supports broad-spectrum, water-resistant SPF 30 or higher, label-directed reapplication, shade and protective clothing.
- The [AAD's new-product testing guidance](https://www.aad.org/public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products) explains trying products on a small area for seven to ten days and stopping after a reaction; severe or unresolved reactions need professional advice. This does not replace medical allergy testing.

## Verification boundaries

Routine unit tests cover ordered categories, texture preference, self-report rules, ingredient exclusions, sensitivity handling, all supported skin-feel/sensitivity/texture/exclusion combinations, existing-product reuse, strict input validation, deterministic outputs and provenance. Result-guidance tests exercise every supported label, unsorted scores, each non-assessed state, invalid responses, task/class mismatches, no all-clear language and mutation isolation. Synthetic response fixtures test routing only; they are not model predictions or accuracy evidence.

Condition-aware tests cover changed selections for the same preferences with different accepted appearance categories, explicit texture conflicts, manufacturer-trait requirements, mandatory exclusions, owned-product reuse and abstention for all error/uncertain/other/lesion states. These fixtures test software policy, not accuracy. Price/choice tests cover validated dated offers, HTTPS links, integer-cent arithmetic, selected alternatives, stale/excluded-choice refusal, reused basics, missing-price refusal and mutation isolation. Browser integration must establish genuine inference, joint selection, updating subtotal and clear/reset behavior. The earlier release passed 119 unit tests; the latest execution is recorded in the project's validation report. Code tests do not establish medical efficacy, product superiority, price freshness or the survey's ability to predict tolerance.
