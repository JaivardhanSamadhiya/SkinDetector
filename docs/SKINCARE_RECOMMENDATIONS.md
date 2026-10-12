# Survey-based skincare education

Added 11 October 2026. This module is a deterministic education feature, separate from the dermoscopic research classifier. It does not use a predicted lesion category, image pixels, confidence, filename or an LLM to recommend a product. A classification result cannot establish someone's skincare needs or make a lesion safe to treat with cosmetics.

## Inputs and privacy

`lib/skincare-preferences.ts` validates six self-reported inputs with a strict Zod schema:

- Skin feel: unsure, dry, oily, combination or balanced.
- Sensitivity: unsure, yes or no.
- Purchase preference: minimal or flexible.
- Texture: any, light or rich.
- Ingredients the person wants to avoid: fragrance, niacinamide and/or oat.
- Existing basic steps: cleanser, moisturizer and/or sunscreen.

These are preferences, not diagnoses. Unknown properties, unsupported options and duplicate selections are rejected. No age, pregnancy status, identity, contact information, medical history or free-text allergy record is needed. The browser keeps the preferences with the current analysis session in memory; they are not an input to the inference API. The app's session deletion clears preferences alongside the image and analysis result. Manufacturer links leave SkinSnap and are subject to those sites' privacy practices.

## Routine rules

`buildSkincareRoutine` produces three ordered categories: gentle cleansing, moisturizer, then daytime sun protection. Each has morning/evening guidance, an explanation of the survey match, an optional manufacturer example and optional alternatives.

Existing basics take priority at either purchase preference: their step has `reuseOwned: true`, no replacement product and no alternatives. The app cannot inspect an owned product or verify its compatibility with allergies; the person must review its label and tolerance. Minimal mode hides alternatives and fills only missing steps. Flexible mode allows one alternative per step when available; it does not add serums, exfoliants or drug treatments. There is no live-price feed, cheapest-basket computation, stock check, checkout, transaction, affiliate link or validated clinical combination score.

For cleanser examples, self-reported oily/combination feel with no reported sensitivity favors the normal-to-oily foaming example; other answers favor a simple cleanser. Ingredient exclusions override either preference. An explicit moisturizer texture overrides the default; otherwise dry-feeling skin selects a richer example and other answers select a lighter lotion. Unknown or reported sensitivity removes botanical moisturizer candidates as a conservative design choice, **not a tested prediction of irritation or allergy**. The sunscreen example still contains aloe and other ingredients; neither sensitivity selection nor filtering guarantees tolerance.

Every candidate and alternative is filtered against its documented fragrance/niacinamide/oat presence before selection. Only these three ingredient choices are supported. The system does not identify every possible allergen, test cross-contamination or verify later reformulations. People with other known allergies or unexplained reactions should have a qualified professional review the full current product label. The general no-match branch supplies category guidance instead of inventing a compatible product if no verified candidate remains.

The recommendation does not change with a model prediction. Changing, bleeding, painful, concerning or persistent skin findings need appropriate professional evaluation; cosmetic guidance does not replace it. No product combination is claimed to treat melanoma, basal-cell carcinoma or any other model label, and no prescription recommendation is generated.

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

## Verification

`tests/unit/skincare-routine.test.ts` adds 15 tests for ordered categories, texture preference, dry/oily self-report rules, niacinamide and oat exclusions, sensitivity handling, all 360 skin-feel/sensitivity/texture/exclusion combinations, existing-product reuse at both budgets, purchase limits, strict input validation, deterministic independent outputs, no model-label input, limitations and provenance.

Ran `npm run test:unit -- --run tests/unit/skincare-routine.test.ts`: **15 passed**. This verifies code behavior, not medical efficacy, product superiority or the survey's ability to predict tolerance. Browser-level survey-to-results verification is documented with the application integration checks.
