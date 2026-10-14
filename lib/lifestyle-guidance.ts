import type { CareDecision } from "@/lib/condition-aware-routine";
import { SkincarePreferencesSchema, type SkincarePreferences } from "@/lib/skincare-preferences";

export type LifestyleTip = {
  id: string;
  title: string;
  action: string;
  reason: string;
  basis: "general" | "survey" | "accepted_appearance";
  source: { title: string; url: string };
};

export type LifestyleGuidance = {
  basis: "preferences_only" | "accepted_appearance" | "review_first";
  explanation: string;
  tips: LifestyleTip[];
  review: { title: string; action: string; source: LifestyleTip["source"] };
};

const SOURCES = {
  testing: {
    title: "AAD · Test new skin care products",
    url: "https://www.aad.org/public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products",
  },
  sunscreen: {
    title: "AAD · How to apply sunscreen",
    url: "https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen",
  },
  budget: {
    title: "AAD · A simple routine on a budget",
    url: "https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget",
  },
  dry: {
    title: "AAD · Everyday habits for dry skin",
    url: "https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin",
  },
  acne: {
    title: "AAD · Skin care habits for acne",
    url: "https://www.aad.org/public/diseases/acne/skin-care/tips",
  },
  dermatitis: {
    title: "AAD · Atopic dermatitis skin care",
    url: "https://www.aad.org/public/diseases/eczema/types/atopic-dermatitis/atopic-dermatitis-coping",
  },
  rash: {
    title: "AAD · When a rash needs medical attention",
    url: "https://www.aad.org/public/everyday-care/itchy-skin/rash/rash-101",
  },
  lesion: {
    title: "AAD · Changes to discuss with a dermatologist",
    url: "https://www.aad.org/public/diseases/skin-cancer/abcdes-melanoma",
  },
} as const;

/**
 * Educational daily habits. This consumes an already-validated care decision;
 * it never interprets an image, raw scores, or self-reported skin feel as disease.
 */
export function buildLifestyleGuidance(preferences: SkincarePreferences, decision?: CareDecision | null): LifestyleGuidance {
  const profile = SkincarePreferencesSchema.parse(preferences);
  const condition = decision?.status === "condition_matched"
    && (decision.conditionId === "acne" || decision.conditionId === "dermatitis")
    ? decision.conditionId : undefined;
  const reviewFirst = decision?.status === "review_first";
  const tips: LifestyleTip[] = [
    {
      id: "introduce-carefully",
      title: "Give a new product a small-area trial",
      action: "Follow the product directions and AAD's small-area testing guidance for 7–10 days before wider use. Stop using it if a reaction develops; a home trial cannot rule out allergy.",
      reason: profile.sensitivity === "yes"
        ? "You reported sensitivity. A catalog match cannot predict how your skin will react."
        : profile.sensitivity === "unsure"
          ? "You are unsure about sensitivity. Start cautiously rather than assuming a new formula will suit you."
          : "You reported no sensitivity, but reactions to a new formula are still possible.",
      basis: "survey",
      source: SOURCES.testing,
    },
    {
      id: "sun-protection",
      title: "Make sun protection a daily habit",
      action: "Use broad-spectrum, water-resistant SPF 30+ as directed before going outdoors. Reapply at least every two hours outdoors and after swimming or sweating, following the label.",
      reason: "This is general sun-protection guidance for every routine; a photo result cannot measure your sun exposure.",
      basis: "general",
      source: SOURCES.sunscreen,
    },
    {
      id: "keep-it-simple",
      title: profile.owned.length ? "Keep the basics that already suit you" : "Keep your routine manageable",
      action: "Build around cleansing, moisturizing and sun protection. You do not need to buy every alternative or add an exfoliating step to follow this routine.",
      reason: profile.owned.length
        ? `You already have ${profile.owned.join(", ")}. Reuse tolerated products after checking their labels; SkinSnap has not inspected those formulas.`
        : profile.budget === "minimal"
          ? "Your survey prioritizes fewer purchases. The three basic categories keep optional spending visible."
          : "Your flexible budget allows comparison; spending more does not establish better skin outcomes.",
      basis: "survey",
      source: SOURCES.budget,
    },
  ];

  if (condition === "acne") tips.unshift({
    id: "acne-gentle-habits",
    title: "Be gentle after sweating; leave bumps alone",
    action: "Cleanse gently after sweating, use your fingertips instead of a scrub, and avoid picking or squeezing bumps. Seek professional advice for persistent, painful or scarring breakouts.",
    reason: "The accepted acne-like appearance category adds these basic habits. It does not confirm acne or determine its severity.",
    basis: "accepted_appearance",
    source: SOURCES.acne,
  });

  if (condition === "dermatitis") tips.unshift({
    id: "dermatitis-comfort",
    title: "Reduce friction and keep bathing brief",
    action: "Try short, warm baths or showers, then moisturize while skin is damp. Choose comfortable, loose clothing and fragrance-free laundry products if these suit you.",
    reason: "The dermatitis-like category adds supportive habits drawn from eczema care. Several conditions can look similar; this does not confirm eczema or identify a trigger.",
    basis: "accepted_appearance",
    source: SOURCES.dermatitis,
  });
  else if (profile.skinFeel === "dry") tips.unshift({
    id: "dry-feel-comfort",
    title: "Pair a short shower with moisturizer",
    action: "Keep baths or showers around 5–10 minutes in warm water. Pat dry gently and apply a tolerated moisturizer while skin is still damp.",
    reason: "You described dry-feeling skin in the survey. This comfort tip does not identify why your skin feels dry.",
    basis: "survey",
    source: SOURCES.dry,
  });

  return {
    basis: reviewFirst ? "review_first" : condition ? "accepted_appearance" : "preferences_only",
    explanation: reviewFirst
      ? "Professional evaluation takes priority for the photographed lesion. These optional everyday habits are general or survey-based and do not treat it."
      : condition
        ? "Your accepted appearance category and survey determine which basic habits appear. They support everyday care; they cannot diagnose a condition or replace a treatment plan."
        : "These habits use your survey and general skin-care guidance. No accepted image category was used to personalize them.",
    tips,
    review: reviewFirst ? {
      title: "Have a concerning spot examined",
      action: "Ask a qualified clinician about a new, changing, itching or bleeding spot. Do not wait for a routine to work or rely on a model result to rule out a serious condition.",
      source: SOURCES.lesion,
    } : {
      title: "When everyday care is not enough",
      action: "Get medical advice for a widespread, rapidly spreading, painful, blistering or infected-looking rash, fever, or a rash near eyes or mouth. Seek emergency care for breathing or swallowing difficulty or swelling of the lips or eyes.",
      source: SOURCES.rash,
    },
  };
}
