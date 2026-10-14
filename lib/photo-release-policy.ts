/**
 * Release restriction, added after reviewing the locked v2 evaluation.
 * This is not a predeclared model-selection threshold or clinical validation.
 * See models/photo-v2/evaluation.json and docs/PHOTO_EVALUATION_REPORT.md:
 * accepted acne/dermatitis rankings were correct in only 147/308 test cases.
 * Preserve the experimental score/margin rules; do not use their passing flag
 * as permission to select products for a presumed condition.
 */
export const PHOTO_PRODUCT_MATCHING_ENABLED = false;
export const PHOTO_PRODUCT_RESTRICTION = "Evaluation found too many incorrect acne and dermatitis matches to use this model for condition-specific product selection. These scores are research rankings only; your survey preferences determine the product options.";
