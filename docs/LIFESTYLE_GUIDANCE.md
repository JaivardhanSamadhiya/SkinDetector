# Product explanations and everyday habits

Implemented in `components/routine-recommendations.tsx`, `components/lifestyle-guidance.tsx`, and `lib/lifestyle-guidance.ts`. Guidance sources were checked on 12 October 2026. This module is educational and has no clinical validation or outcome measurements.

## Category choices and explanations

The routine shows the first eligible catalog option for cleanser, moisturizer, and sunscreen together, with its dated package price. This is labeled **Top catalog match**, meaning the existing deterministic rule's first choice within the small checked catalog. It is not a comparative efficacy ranking, a medical recommendation, a prediction of tolerance, a cheapest-basket calculation, or the best product on the market. A sole eligible option explicitly states that no comparison was possible. An owned step remains a reuse suggestion, with no purchase added or approval of an unseen formula.

Each option now explains its actual texture or cleansing characteristics, the user's selected ingredient exclusions, and whether an accepted appearance category was used. The initial recommendation stays labeled even if a user chooses an alternative; a separate Selected marker follows their choice. An alternative cannot inherit the first option's texture rationale. The image cannot establish sunscreen compatibility, so that limitation stays visible for accepted acne-like and dermatitis-like categories. Product facts, filtering, prices, selection policy, and model acceptance remain in their existing modules.

## Habit selection

`buildLifestyleGuidance` validates preferences and consumes a `CareDecision` from the existing condition-aware routine policy. It never consumes raw images or scores.

| Input | Visible personalization |
| --- | --- |
| No result, unavailable, rejected, uncertain or unsupported result | General habits and explicitly survey-based comfort guidance only |
| Self-reported dry skin feel | A brief warm-bathing/moisturizing tip; no disease inferred |
| Reported, absent or unknown sensitivity | Different explanation for cautiously trying a new product; no tolerance guarantee |
| Owned basics or budget preference | Reuse and simple-routine explanation without inspecting existing formulas |
| Accepted acne-like care decision | Gentle post-sweat cleansing and avoiding picking; no severity determination |
| Accepted dermatitis-like care decision | Basic bathing and clothing comfort guidance; eczema is not confirmed |
| Dermoscopic / review-first decision | Professional evaluation notice precedes optional general habits; lesion labels do not generate cosmetic treatment |

Condition-linked tips require both `status=condition_matched` and a supported `conditionId`. An incomplete decision or a condition ID on a general-only/review-first decision cannot unlock them. The classifier's readiness and uncertainty requirements are not changed by this module. The sources below support educational content; they do not validate SkinSnap's model or rule-based selection.

## Primary references

- [AAD: Testing a new skin care product](https://www.aad.org/public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products) — cautious small-area introduction and reactions.
- [AAD: How to apply sunscreen](https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen) — general application and reapplication guidance.
- [AAD: Skin care on a budget](https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget) — a simple basic routine.
- [AAD: Dry skin care](https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin) — short warm bathing and moisturizer after washing.
- [AAD: Acne care habits](https://www.aad.org/public/diseases/acne/skin-care/tips) — gentle cleansing and avoiding picking.
- [AAD: Atopic dermatitis skin care](https://www.aad.org/public/diseases/eczema/types/atopic-dermatitis/atopic-dermatitis-coping) — supportive bathing, clothing and skin-care habits; broader dermatitis-like appearance does not establish this diagnosis.
- [AAD: Rash warning signs](https://www.aad.org/public/everyday-care/itchy-skin/rash/rash-101) — professional and emergency evaluation guidance.
- [AAD: Changes associated with melanoma](https://www.aad.org/public/diseases/skin-cancer/abcdes-melanoma) — reasons to seek examination, independent of a model result.

No dietary restriction, supplement, sleep or hydration prescription, promised cure, prescription medication, or measured improvement is generated. Persistent or concerning findings require professional assessment. The source is visible on each habit card, alongside whether the card came from general guidance, the survey, or an accepted appearance category.

## Tests

`tests/unit/lifestyle-guidance.test.ts` covers missing/unavailable/invalid results, invalid preferences, inconsistent decisions, review-first precedence, survey-only dry skin, both supported appearance branches, sensitivity, owned products, and primary-source links. It uses explicitly labeled policy fixtures, never fabricated model evaluation data.
