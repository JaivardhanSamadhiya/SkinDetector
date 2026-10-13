import { AnalysisSchema } from "@/lib/types";
import { CLINICAL_CLASSES, CLINICAL_MODEL_VERSION } from "@/lib/clinical-task";
import { getProductOffer } from "@/lib/product-offers";
import { SkincarePreferencesSchema, type SkincarePreferences } from "@/lib/skincare-preferences";
import {
  buildSkincareRoutine,
  SKINCARE_PRODUCT_CATALOG,
  type SkincareProduct,
  type SkincareRoutine,
  type SkincareRoutineStep,
} from "@/lib/skincare-routine";

export type CareConditionId = "acne" | "dermatitis";
export type CareDecision = {
  status: "condition_matched" | "general_only" | "review_first";
  title: string;
  explanation: string;
  reasons: string[];
  conditionId?: CareConditionId;
  source?: { title: string; url: string };
};
export type ConditionAwareRoutine = { routine: SkincareRoutine; decision: CareDecision };

export const CONDITION_MATCHING_MODEL_VERSION = CLINICAL_MODEL_VERSION;
export const CONDITION_MATCHING_MIN_SCORE = .65;
export const CONDITION_MATCHING_MIN_MARGIN = .15;
const CLINICAL_LABELS = {
  acne: "Acne-like appearance",
  dermatitis: "Dermatitis-like appearance",
  other: "Other / unsupported appearance",
} as const;

const SOURCES = {
  acne: {
    title: "AAD · Skin care and product labels for acne-prone skin",
    url: "https://www.aad.org/public/diseases/acne/really-acne/adult-acne",
  },
  dermatitis: {
    title: "AAD · Atopic dermatitis basic skin care",
    url: "https://www.aad.org/public/diseases/eczema/types/atopic-dermatitis/atopic-dermatitis-coping",
  },
  rash: {
    title: "AAD · When a rash needs medical attention",
    url: "https://www.aad.org/public/everyday-care/itchy-skin/rash/rash-101",
  },
  lesion: {
    title: "AAD · Skin cancer symptoms and diagnosis",
    url: "https://www.aad.org/public/diseases/skin-cancer",
  },
} as const;

type CatalogProduct = (typeof SKINCARE_PRODUCT_CATALOG)[number];

// Product-specific manufacturer claims checked on 2026-10-12. Neither a label
// nor these rules establish individual tolerance or comparative effectiveness.
const VERIFIED_NONCOMEDOGENIC = new Set([
  "vanicream-gentle-cleanser",
  "vanicream-daily-moisturizer",
  "vanicream-moisturizing-cream",
]);
const BARRIER_CARE_PRODUCTS = new Set([
  "vanicream-gentle-cleanser",
  "vanicream-daily-moisturizer",
  "vanicream-moisturizing-cream",
]);

function publicProduct(product: CatalogProduct): SkincareProduct {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    url: product.url,
    description: product.description,
    ingredientNote: product.ingredientNote,
    sourceDate: product.sourceDate,
    offer: getProductOffer(product.id),
  };
}

function generalDecision(explanation: string): CareDecision {
  return {
    status: "general_only",
    title: "General care from your preferences",
    explanation,
    reasons: ["No supported, accepted clinical-photo category was used to select products."],
  };
}

function candidatesFor(step: SkincareRoutineStep, profile: SkincarePreferences, conditionId: CareConditionId): CatalogProduct[] {
  const candidates = SKINCARE_PRODUCT_CATALOG.filter(product => {
    if (product.step !== step.id || profile.avoid.some(ingredient => product.contains[ingredient])) return false;
    if (step.id === "sunscreen") return true;
    if (conditionId === "acne" && !VERIFIED_NONCOMEDOGENIC.has(product.id)) return false;
    if (conditionId === "dermatitis" && !BARRIER_CARE_PRODUCTS.has(product.id)) return false;
    if (step.id === "moisturizer" && profile.texture !== "any" && product.texture !== profile.texture) return false;
    return true;
  });
  const preferredTexture = profile.texture !== "any"
    ? profile.texture
    : conditionId === "dermatitis" || profile.skinFeel === "dry" ? "rich" : "light";
  return candidates.map((product, index) => ({
    product,
    index,
    score: step.id === "moisturizer" ? Number(product.texture === preferredTexture) : 0,
  })).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.product);
}

function conditionStep(step: SkincareRoutineStep, profile: SkincarePreferences, conditionId: CareConditionId): SkincareRoutineStep {
  // We cannot inspect an owned product. Keep reuse visible without approving its
  // ingredients, claiming a condition match, or adding a duplicate purchase.
  if (step.reuseOwned) return {
    ...step,
    product: null,
    alternatives: [],
    reason: `${step.reason} The appearance category does not establish that an owned product is suitable for this condition; review its full label and any professional advice.`,
  };
  const candidates = candidatesFor(step, profile, conditionId);
  const selected = candidates[0];
  if (!selected) return {
    ...step,
    product: null,
    alternatives: [],
    reason: "No checked catalog item meets this appearance-based care policy and your explicit preferences. Do not relax an ingredient exclusion; ask a qualified professional to review suitable options.",
  };
  let reason: string;
  if (step.id === "cleanser") {
    reason = conditionId === "acne"
      ? "The acne-like research category adds a verified noncomedogenic-label criterion. This soap-free, gentle catalog example meets that criterion and your selected ingredient exclusions; it is not acne treatment."
      : "The dermatitis-like research category favors simple, fragrance-free, mild cleansing for basic barrier care. This soap-free catalog example meets those formulation traits and your selected ingredient exclusions; it does not establish the cause of a rash.";
  } else if (step.id === "moisturizer") {
    if (conditionId === "dermatitis") {
      reason = profile.texture === "light"
        ? "You explicitly prefer a light texture, so this fragrance-free lotion is selected. AAD eczema care favors a cream or ointment; the lotion is a preference compromise, not a full match to that guidance. Dermatitis-like appearance does not confirm eczema."
        : "The dermatitis-like research category shifts the default toward a fragrance-free cream for basic barrier care, consistent with AAD eczema guidance. Your ingredient exclusions and any explicit rich-texture preference remain honored; this is not treatment for a confirmed dermatitis diagnosis.";
    } else {
      reason = `The acne-like research category restricts this step to manufacturer-labeled noncomedogenic examples. This ${selected.texture === "rich" ? "cream" : "lightweight lotion"} also matches ${profile.texture !== "any" ? "your explicit texture preference" : profile.skinFeel === "dry" ? "your dry-feeling skin preference" : "the default light-texture preference"}; individual tolerance and acne response are unknown.`;
    }
  } else {
    reason = conditionId === "acne"
      ? "General sun-protection example only: this product meets broad-spectrum SPF 30+ and water-resistance criteria, but no acne-specific noncomedogenic claim was verified. Its acne compatibility is unknown; check the full label and ask a pharmacist or dermatologist for a suitable alternative if needed."
      : "General sun-protection example only: broad-spectrum mineral SPF 50 meets the basic sun-protection criteria. It contains aloe, and the dermatitis-like category cannot predict whether you will tolerate this formula. Check the full label and professional advice.";
  }
  return {
    ...step,
    reason,
    product: publicProduct(selected),
    alternatives: candidates.slice(1, 2).map(publicProduct),
  };
}

/**
 * Combines an accepted output from one documented clinical-photo research task
 * with validated survey preferences. It neither diagnoses nor prescribes.
 * Untrusted, unsupported, uncertain and lesion outputs cannot enter care rules.
 */
export function buildConditionAwareRoutine(preferences: SkincarePreferences, result?: unknown): ConditionAwareRoutine {
  const profile = SkincarePreferencesSchema.parse(preferences);
  const routine = buildSkincareRoutine(profile);
  if (result === null || result === undefined) return {
    routine,
    decision: generalDecision("No image-analysis result is available. These cosmetic examples use your stated preferences only."),
  };
  const parsed = AnalysisSchema.safeParse(result);
  if (!parsed.success) return {
    routine,
    decision: generalDecision("The analysis response could not be validated. No condition-specific product selection is made."),
  };
  const analysis = parsed.data;
  if (analysis.model.supported_image_type === "dermoscopic") return {
    routine: {
      ...routine,
      notes: [
        "A dermoscopic lesion label cannot choose products to treat that lesion. These optional cosmetic examples use survey preferences only; professional review takes precedence over shopping for a concerning spot.",
        ...routine.notes.slice(1),
      ],
    },
    decision: {
      status: "review_first",
      title: "Professional review comes first",
      explanation: "The dermoscopic research task concerns lesion categories. It cannot determine which cosmetic products treat the photographed spot, and no lesion label changes product ranking.",
      reasons: ["Have a new, changing, bleeding, painful or non-healing spot examined regardless of the model output."],
      source: { ...SOURCES.lesion },
    },
  };
  const knownTask = analysis.model.version === CONDITION_MATCHING_MODEL_VERSION
    && analysis.model.supported_image_type === "clinical_photo"
    && analysis.model.input_size === 128
    && analysis.model.classes.length === CLINICAL_CLASSES.length
    && analysis.model.classes.every(({ id, label }) => CLINICAL_CLASSES.some(item => item.id === id && item.label === label));
  if (!knownTask) return {
    routine,
    decision: generalDecision("This model version, image task or class mapping does not match the documented clinical-photo care policy. These examples use preferences only."),
  };
  if (analysis.status !== "assessed" || !analysis.quality?.passed || analysis.quality.issues.some(issue => issue.severity === "error") || !analysis.uncertainty || analysis.uncertainty.rejected) return {
    routine,
    decision: generalDecision("The image analysis was unavailable, unsupported, rejected for quality, or uncertain. No appearance-specific product ranking is made."),
  };
  // Do not let a declared accepted flag, lower declared threshold, or forged
  // reported margin bypass the documented acceptance policy. This validates
  // score consistency; it cannot authenticate where a payload originated.
  const ranked = [...analysis.scores].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const margin = top.score - ranked[1].score;
  const scoreThreshold = Math.max(CONDITION_MATCHING_MIN_SCORE, analysis.uncertainty.threshold ?? CONDITION_MATCHING_MIN_SCORE);
  const reportedMargin = analysis.uncertainty.margin;
  if (top.score < scoreThreshold || margin < CONDITION_MATCHING_MIN_MARGIN || analysis.uncertainty.reasons.length > 0 || (reportedMargin !== null && reportedMargin !== undefined && Math.abs(reportedMargin - margin) > 1e-4)) return {
    routine,
    decision: generalDecision("The scores do not satisfy the documented acceptance threshold and separation rule, or contradict the reported uncertainty decision. No appearance-specific product ranking is made."),
  };
  if (top.id !== "acne" && top.id !== "dermatitis") return {
    routine,
    decision: generalDecision("The model ranked an other or unsupported appearance. This category does not identify a condition or justify condition-specific products."),
  };
  const conditionId = top.id;
  const source = SOURCES[conditionId];
  const explicitTextureConflict = conditionId === "dermatitis" && profile.texture === "light";
  const decision: CareDecision = {
    status: "condition_matched",
    conditionId,
    title: "Selected catalog match for appearance and preferences",
    explanation: `${CLINICAL_LABELS[conditionId]} is the accepted research-model category, not a diagnosis. It informs basic cosmetic-care criteria; your ingredient exclusions, texture choices and existing basics inform the selection. These products do not treat or confirm that condition.`,
    reasons: [
      conditionId === "acne"
        ? "The acne-like category restricts cleanser and moisturizer candidates to verified noncomedogenic manufacturer labels."
        : "The dermatitis-like category favors simple fragrance-free cleansing and a cream for basic barrier care; this broad category does not confirm atopic dermatitis.",
      "Selected fragrance, niacinamide and oat exclusions are mandatory across the chosen products and alternatives; other allergens are not assessed.",
      profile.owned.length ? "Owned basics are retained without duplicate purchases; their suitability cannot be checked from this survey." : "One selected item fills each basic step; alternatives are substitutes, not extra purchases.",
      explicitTextureConflict
        ? "Your explicit light-texture preference takes precedence; a lotion is a disclosed compromise with cream-focused eczema guidance."
        : "Texture and self-reported skin feel refine eligible moisturizer choices; a larger budget does not imply a better outcome.",
      profile.sensitivity === "no"
        ? "You reported no sensitivity, but that does not predict tolerance. The condition policy still uses simple eligible moisturizers and keeps every selected ingredient exclusion."
        : "Because sensitivity is reported or unknown, any new cleanser or moisturizer example is restricted to formulas without botanical extracts. The catalog sunscreen contains aloe and still requires a full-label and tolerance check; owned products cannot be inspected and no allergy safety is inferred.",
      profile.budget === "minimal"
        ? "Your minimal purchasing priority keeps only the three basic steps and reuses owned products. The dated subtotal is for missing items; this is not a cheapest-basket calculation."
        : "Your flexible purchasing priority allows comparison of eligible substitutes, not extra treatment steps. A higher budget does not establish better outcomes; compare the dated item costs before buying.",
      "Seek professional advice for a persistent or worsening concern; urgent rash warning signs take precedence over product selection.",
    ],
    source: { ...source },
  };
  return {
    decision,
    routine: {
      ...routine,
      summary: "A selected three-step catalog combination using the supported appearance category and your preferences, keeping tolerated owned basics.",
      steps: routine.steps.map(step => conditionStep(step, profile, conditionId)),
      notes: [
        "This combination uses an accepted clinical-photo research category together with survey answers. Image appearance cannot confirm a disease, assess all contraindications, or establish the clinically best products for you.",
        "The selected items are transparent formulation and preference matches within a small catalog, not clinically validated treatment or a comparative efficacy ranking. Dermatitis includes multiple possible causes; eczema guidance is supportive basic care, not proof of the cause.",
        ...routine.notes.slice(2),
        "Get medical attention for a widespread, rapidly spreading, painful, blistering, open or infected-looking rash, fever, or involvement of eyes, lips, mouth or genital skin. Trouble breathing or swallowing, or swelling of lips or eyes, may need emergency care. This photo model does not assess those signs.",
      ],
      references: [...routine.references, { ...source }, { ...SOURCES.rash }],
    },
  };
}
