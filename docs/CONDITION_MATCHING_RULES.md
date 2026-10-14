# Appearance and preference matching

This policy selects basic cosmetic-care examples from the six-item checked catalog. It combines an accepted research-model appearance category with survey preferences. It does not establish a diagnosis, prescribe treatment, assess every contraindication, or identify the clinically best product for a person. No comparative product-outcome study has been performed.

## Input and abstention contract

`buildConditionAwareRoutine(preferences, result)` validates survey input and the complete analysis response. Its return value contains a `routine` and a `decision` with `condition_matched`, `general_only`, or `review_first` status.

The helper recognizes both exact documented photo contracts. **V2 is independently barred from condition-driven care:** its fixed-threshold accepted test accuracy was 47.73%, so it supplies general preference-based options even if a payload claims an accepted result. This is a post-test safety restriction, not a validated new operating point. The historical v1 manifest remains unavailable. Future appearance rules retain the following contract checks and are exercised with labeled software fixtures:

- Historical version/input: `skinsnap-scin-mobilenet-v1` / 128 pixels.
- V2 version/input: `skinsnap-photo-dinov2-v2` / 224 pixels; recognized for strict validation but blocked from condition matching.
- Supported image type: `clinical_photo`.
- Exact labels: `acne` / `Acne-like appearance`, `dermatitis` / `Dermatitis-like appearance`, `other` / `Other / unsupported appearance`.
- Status must be `assessed`, model available, quality checks passed without an error, and uncertainty decision present and accepted.
- The highest-ranked category must be acne or dermatitis. An other/unsupported appearance, uncertainty rejection, quality rejection, missing artifact, malformed response, changed task/version, or absent result cannot activate condition-specific ranking.
- The matching helper independently recomputes the leading score and top-two separation: score must be at least 0.65 and margin at least 0.15. It honors a stricter declared score threshold, rejects nonempty rejection reasons, and rejects a contradictory reported margin. An accepted flag or lowered declared threshold cannot bypass these gates.

Transport acceptance is not clinical validation or payload authentication. A fabricated payload with consistently high scores cannot be distinguished from real inference by a pure matching function; the actual browser inference path verifies the model artifact and runs the classifier. The classifier's training/evaluation documentation governs its actual limitations; these rules provide no additional evidence that a photo has been correctly classified. Synthetic rule-test fixtures are confined to tests and are never application predictions or evaluation measurements.

Dermoscopic outputs always take the `review_first` path. A mole, melanoma, basal-cell, keratosis, dermatofibroma or vascular benchmark label never selects lesion-treatment products. Cosmetic examples on that path retain survey-only ranking. A new, changing, bleeding, painful or non-healing spot warrants professional assessment regardless of a model result.

## Selection policy

1. Enforce each selected fragrance, niacinamide and oat exclusion across selected items and alternatives. These three filters are not a complete allergy screen.
2. Retain owned basic steps without a replacement purchase. The survey cannot inspect or approve an owned product; users must check the full current label and existing professional advice.
3. Apply the supported appearance category's formulation criteria to missing cleanser/moisturizer steps.
4. Honor explicit light/rich moisturizer texture in both the selected item and substitute candidates. Otherwise use the condition-specific default below, refined by self-reported dry feel for acne.
5. Build an ordinal preference order with one checked item per missing basic and eligible substitutes. Alternatives replace an item rather than add a purchase.
6. Enumerate complete eligible baskets against the numeric USD cap. Choose the smallest summed preference-rank offset among affordable baskets, then price, then stable order. If none fits, show the cheapest complete eligible basket and shortfall without dropping required basics or weakening exclusions. Owned steps add zero purchase cost; unknown/missing prices prevent a complete affordability claim.

The minimal/flexible preference affects reuse/explanation, not severity, efficacy, additional treatment or an assertion that expensive products work better. Both use the same basic candidate set. The numeric cap is separate, defaults to $50, and applies to dated USD packages before tax/delivery. Basket optimization is restricted to the small eligible catalog and ordinal preferences; it does not establish the cheapest market price or medically best combination. Manual alternatives can exceed the cap and are flagged. Reported/unknown sensitivity reinforces simple candidates and adds the sunscreen aloe/tolerance warning; reporting no sensitivity never establishes tolerance.

| Appearance category | Cleanser | Moisturizer | Sunscreen boundary |
| --- | --- | --- | --- |
| Acne-like | Require a product-specific verified noncomedogenic manufacturer claim. The currently qualifying cleanser is Vanicream Gentle Facial Cleanser. | Eligible candidates are Vanicream Daily Facial Moisturizer and Vanicream Moisturizing Cream, both explicitly labeled noncomedogenic. Default to the light lotion unless dry feel or explicit rich texture favors cream. | Blue Lizard meets general broad-spectrum/SPF/water-resistance criteria; acne-specific noncomedogenic compatibility was not verified and is explicitly unknown. |
| Dermatitis-like | Favor the simple, fragrance-free, soap-free Vanicream cleanser for basic barrier care. | Default to fragrance-free Vanicream cream. Explicit light texture selects the daily lotion with a disclosed compromise against cream-focused eczema guidance. | Blue Lizard remains a general mineral-SPF example. It contains aloe; the image category cannot predict tolerance. |

The dermatitis label includes different possible causes, including contact dermatitis and eczema. Atopic-dermatitis guidance supplies conservative basic barrier-care traits; it does not confirm atopic dermatitis, establish a cause, or imply that cosmetic care treats every dermatitis.

## Product evidence boundaries

Manufacturer pages were reviewed October 12, 2026:

- [Vanicream Gentle Facial Cleanser](https://www.vanicream.com/product/vanicream-facial-cleanser): soap-free, noncomedogenic, no botanical extracts; supports the simple-cleansing/noncomedogenic criteria.
- [Vanicream Daily Facial Moisturizer](https://www.vanicream.com/product/vanicream-daily-facial-moisturizer): lightweight lotion, noncomedogenic, no botanical extracts; supports the light-texture/noncomedogenic criteria.
- [Vanicream Moisturizing Cream](https://www.vanicream.com/product/vanicream-moisturizing-cream): cream, noncomedogenic, fragrance-free, no botanical extracts; contains petrolatum and fatty cetearyl alcohol. Neither ingredient is rejected using a generic alcohol/comedogenicity keyword rule.
- [CeraVe Foaming Facial Cleanser](https://www.cerave.com/skincare/cleansers/foaming-facial-cleanser): normal-to-oily positioning and niacinamide are verified. The reviewed page did not provide an unequivocal product-specific noncomedogenic claim; general noncomedogenic-cleanser advice is not treated as that claim. It remains in survey-only matching but is excluded from the stricter acne branch.
- [Aveeno Calm + Restore Oat Gel](https://www.aveeno.com/products/calm-restore-oat-gel-moisturizer-sensitive-skin): oat/botanical ingredients and gel texture are verified. A noncomedogenic claim was not verified; it is excluded from these condition branches. It is not the separately formulated Aveeno Eczema Therapy product, and that product's drug/treatment claims are not transferred to this gel.
- [Blue Lizard Sensitive Mineral SPF 50](https://bluelizardsunscreen.com/products/sensitive-mineral-sunscreen-lotion-spf-50): mineral filters, fragrance-free formulation, aloe, broad-spectrum SPF 50 and 80-minute water resistance are verified. A noncomedogenic/oil-free claim was not verified.

Formulas and local packages can change. Manufacturer descriptions and seals are not evidence of individual tolerance or superior clinical outcomes. Shopping links do not transmit the analysis or survey, and displayed retail offers remain dated snapshots, not live stock/checkout quotes.

## Care guidance and professional assessment

The rules are an engineering interpretation of [AAD acne product-label guidance](https://www.aad.org/public/diseases/acne/really-acne/adult-acne) and [AAD atopic-dermatitis basic care](https://www.aad.org/public/diseases/eczema/types/atopic-dermatitis/atopic-dermatitis-coping). They do not implement drug treatment. The current classifier has no rosacea class, so rosacea guidance never becomes an image-detected branch.

Users should seek medical attention for a widespread, rapidly spreading, painful, blistering, open or infected-looking rash, fever, or involvement of eyes, lips, mouth or genital skin. Trouble breathing/swallowing or swelling of lips/eyes may require emergency care. These signs cannot be ruled out by this classifier. See [AAD rash assessment guidance](https://www.aad.org/public/everyday-care/itchy-skin/rash/rash-101) and [AAD skin-cancer information](https://www.aad.org/public/diseases/skin-cancer).

Persistent/worsening concerns, deep painful acne, scarring, other allergies and unexplained reactions need qualified professional advice. Small-area product testing and stopping a new product if a reaction occurs remain part of the general routine guidance. A product match never takes precedence over care.

## Tests

`tests/unit/condition-aware-routine.test.ts` covers different selections for the same preferences under accepted acne/dermatitis fixtures, explicit texture conflicts, manufacturer-trait restrictions, all selected ingredient-exclusion combinations, owned-product reuse, uncertainty/error/other abstention, exact task identity, malformed output, all seven dermoscopic labels, and deterministic non-mutation behavior. These are software-policy tests; they are not model accuracy, diagnostic-safety, allergy-safety, or product-efficacy validation.
