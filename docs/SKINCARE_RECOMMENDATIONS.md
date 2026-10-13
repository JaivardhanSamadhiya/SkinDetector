# Appearance and preference based skincare options

Added 11 October 2026; joint appearance/preference matching and priced options updated 12 October 2026. The results page immediately explains a selected cosmetic catalog combination. Implemented rules would combine an accepted acne-like or dermatitis-like research appearance result with the survey, but the current unavailable photo model cannot activate them for real uploads. This is a transparent rule system over a small catalog, not a product-response model, clinical treatment or a guarantee of the absolute best product. A dermoscopic lesion prediction never chooses a treatment. Filename tricks, fabricated confidence and generic LLM responses are not classification or selection inputs.

**Current release:** the genuine photo model is unavailable and condition matching remains inactive. The first baseline failed its predeclared gate; a body-location flag parsing audit then required cohort correction. The corrected experiment has previously observed test overlap and cannot establish fresh independent validation, so availability remains false regardless of numeric thresholds. The joint decision rules are implemented for a future accepted result and exercised with clearly identified synthetic software fixtures; those fixtures are never a live app prediction or evidence of classifier performance. The current app supplies general preference-based care on this unavailable path.

## How the image result and survey combine

`lib/condition-aware-routine.ts` validates the complete response against `AnalysisSchema` and checks the exact separate SCIN photo-model identity, input size and class mapping. Only an available, quality-passed, accepted `assessed` response with a top acne-like or dermatitis-like category activates appearance-based formulation rules. [The full policy](CONDITION_MATCHING_RULES.md) records the checks, sources and limitations. The rules do not establish that the appearance was correctly classified.

For the acne-like branch, cleanser and moisturizer candidates require a verified product-specific noncomedogenic manufacturer label; the current candidates are Vanicream Gentle Cleanser, Daily Moisturizer and Moisturizing Cream. An explicit texture preference or self-reported dry feel refines the moisturizer. For dermatitis-like appearance, simple fragrance-free cleansing and a cream for general barrier care become the default; an explicit light-texture preference selects lotion with a disclosed compromise against cream-focused eczema guidance. The broad dermatitis group is not a confirmed eczema diagnosis. Sunscreen stays a general sun-protection example, with acne compatibility and individual tolerance explicitly unverified.

Ingredient exclusions and owned-product reuse always take precedence. The selected item and any alternative must meet the applicable rules. The same default survey selects the light lotion for acne-like appearance and the cream for dermatitis-like appearance in software rule tests; an explicit light preference remains honored in either branch. These fixtures demonstrate rule behavior, not a functioning consumer detector. Prices describe the selected examples, not medical effectiveness, guaranteed tolerance or the cheapest basket.

Uncertain, other, unsupported, unavailable, quality-rejected, malformed or changed-model responses abstain from condition matching and show preference-only general care. There is no rosacea class, automatic allergy detection, skin-type inference or healthy-skin all-clear. Ordinary-photo inference uses its own trained model and never applies the dermoscopic network to phone photos. The standalone routine planner remains survey-only because it requires no image or inference.

## Separate dermoscopic lesion guidance

`lib/result-guidance.ts` first validates the complete response against `AnalysisSchema`. Only an `assessed` response with the documented dermoscopic image type, 28-pixel input and exact seven-category mapping can show label-specific education. It uses the highest score even if the score list is unsorted. The copy describes a **model label**, not a confirmed condition, and links to American Academy of Dermatology information. Melanoma, basal cell carcinoma and actinic keratosis/intraepithelial carcinoma categories explicitly direct users toward professional evaluation; mole-like and benign-sounding categories never supply an all-clear. Dermatofibroma and vascular categories use general skin-cancer evaluation guidance rather than inventing a diagnosis-specific product recommendation.

The seven-category lesion model cannot identify acne, rosacea, eczema or skin type from ordinary photographs. Its outputs take the `review_first` decision path and cannot activate the new photo model's cosmetic rules. Non-assessed lesion responses use generic unable-to-assess education. Neither model validates a photographed concern as suitable for cosmetic treatment.

## Inputs and privacy

`lib/skincare-preferences.ts` validates six self-reported inputs with a strict Zod schema:

- Skin feel: unsure, dry, oily, combination or balanced.
- Sensitivity: unsure, yes or no.
- Purchase preference: minimal or flexible.
- Texture: any, light or rich.
- Ingredients the person wants to avoid: fragrance, niacinamide and/or oat.
- Existing basic steps: cleanser, moisturizer and/or sunscreen.

These are preferences, not diagnoses. Unknown properties, unsupported options and duplicate selections are rejected. No age, pregnancy status, identity, contact information, medical history or free-text allergy record is needed. The browser keeps preferences and selected product-option IDs with the current analysis session in memory; neither is an input to the inference API. Editing or resetting preferences restores starting product choices, and session deletion clears choices and preferences alongside the image and analysis result. Manufacturer and retailer links leave SkinSnap and are subject to those sites' privacy practices.

## Routine rules

`buildSkincareRoutine` produces the survey-only baseline: gentle cleansing, moisturizer, then daytime sun protection. `buildConditionAwareRoutine` adds the accepted photo appearance's formulation criteria and ranking while preserving explicit exclusions, owned basics and texture constraints. Each step has morning/evening guidance, an explanation, an optional manufacturer example and up to one alternative. When two matching examples exist, the user can choose either with a radio control; one general sunscreen example is currently available. Ingredient exclusions, condition rules or reuse can reduce the number. The interface does not invent options to reach a target count.

Existing basics take priority at either purchase preference: their step has `reuseOwned: true`, no replacement product and no alternatives. The app cannot inspect an owned product or verify its compatibility with allergies; the person must review its label and tolerance. Both purchase modes fill only missing steps and can show alternatives, which replace the chosen example rather than add another purchase. Neither mode adds serums, exfoliants or drug treatments. There is no live-price feed, cheapest-basket computation, stock check, checkout, transaction, affiliate link or validated clinical combination score.

In survey-only matching, self-reported oily/combination feel with no reported sensitivity favors the normal-to-oily foaming cleanser; other answers favor a simple cleanser. Ingredient exclusions override either preference. An explicit moisturizer texture overrides the default; otherwise dry-feeling skin selects a richer example and other answers select a lighter lotion. Unknown or reported sensitivity removes botanical moisturizer candidates as a conservative design choice, **not a tested prediction of irritation or allergy**. Accepted condition branches restrict cleanser/moisturizer candidates further to the verified traits documented above. The sunscreen example still contains aloe and other ingredients; neither sensitivity selection nor filtering guarantees tolerance.

Every candidate and alternative is filtered against its documented fragrance/niacinamide/oat presence before selection. Only these three ingredient choices are supported. The system does not identify every possible allergen, test cross-contamination or verify later reformulations. People with other known allergies or unexplained reactions should have a qualified professional review the full current product label. The general no-match branch supplies category guidance instead of inventing a compatible product if no verified candidate remains.

Accepted photo appearance categories can change product filtering and ranking alongside the survey; lesion, uncertain and other outputs cannot. `lib/routine-selection.ts` accepts a choice only from the already-filtered examples for that step, so a stored or manipulated choice cannot bypass ingredient exclusions, appearance criteria or product reuse. Changing, bleeding, painful, concerning or persistent skin findings need appropriate professional evaluation; cosmetic guidance does not replace it. No product combination is claimed to treat a predicted disease or photographed lesion, and no prescription recommendation is generated.

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

Choosing an option immediately updates the selected-combination subtotal: one package per missing step, using the dated price, with no added item cost for a reused basic. A missing verified offer or no matching product prevents a complete price claim. The subtotal excludes tax and delivery; buying from different sellers may incur separate delivery fees. It does not normalize cost per ounce, rank price value, identify the cheapest basket or promise a medically optimal combination. Recheck the retailer's current price, seller, exact size, stock and local formulation before buying.

The separate manual budget checker remains available in `/routine/`: users enter current local quotes, tax, delivery and a limit. It does not fetch these values or automatically optimize the basket. Changing currency or the selected/reused product signature resets the entered amounts rather than converting or reusing another product's quote. Product choices and prices remain in session memory, and clearing the session resets them.

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
