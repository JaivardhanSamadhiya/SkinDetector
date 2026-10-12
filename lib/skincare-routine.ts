import {
  SkincarePreferencesSchema,
  type SkincareAvoidance,
  type SkincarePreferences,
  type SkincareStepId,
} from "@/lib/skincare-preferences";
import { getProductOffer, type ProductOffer } from "@/lib/product-offers";

export type SkincareProduct = {
  id: string;
  name: string;
  brand: string;
  url: string;
  description: string;
  ingredientNote: string;
  sourceDate: string;
  offer?: ProductOffer;
};

type CatalogProduct = SkincareProduct & {
  step: SkincareStepId;
  texture: "light" | "rich" | "any";
  /** Presence checked against the full US manufacturer ingredient list. */
  contains: Record<SkincareAvoidance, boolean>;
  botanicalIngredients: boolean;
};

export type SkincareRoutineStep = {
  id: SkincareStepId;
  title: string;
  when: string;
  guidance: string;
  reason: string;
  reuseOwned: boolean;
  product: SkincareProduct | null;
  alternatives: SkincareProduct[];
};

export type SkincareRoutine = {
  summary: string;
  steps: SkincareRoutineStep[];
  notes: string[];
  references: { title: string; url: string }[];
};

const VERIFIED_DATE = "2026-10-11";
const NO_SELECTED_INGREDIENTS = { fragrance: false, niacinamide: false, oat: false };

/**
 * A small educational catalog, not a store or a clinical formulary.
 * Manufacturer facts are documented in docs/SKINCARE_RECOMMENDATIONS.md.
 * Dated retail listings are separate from manufacturer ingredient facts.
 * No live availability, review score, affiliate attribution or efficacy rank.
 */
export const SKINCARE_PRODUCT_CATALOG: readonly CatalogProduct[] = [
  {
    id: "vanicream-gentle-cleanser",
    name: "Gentle Facial Cleanser",
    brand: "Vanicream",
    step: "cleanser",
    texture: "any",
    url: "https://www.vanicream.com/product/vanicream-facial-cleanser",
    description: "A soap-free facial cleanser; the manufacturer lists glycerin and no botanical extracts.",
    ingredientNote: "No fragrance, niacinamide or oat is listed in the checked US ingredient list. Check your own package for changes and other ingredients you avoid.",
    sourceDate: VERIFIED_DATE,
    contains: { ...NO_SELECTED_INGREDIENTS },
    botanicalIngredients: false,
  },
  {
    id: "cerave-foaming-cleanser",
    name: "Foaming Facial Cleanser",
    brand: "CeraVe",
    step: "cleanser",
    texture: "any",
    url: "https://www.cerave.com/skincare/cleansers/foaming-facial-cleanser",
    description: "A gel-to-foam cleanser marketed for normal to oily skin, with ceramides and niacinamide.",
    ingredientNote: "Contains niacinamide. No fragrance or oat is listed in the checked US ingredient list; formulations can change.",
    sourceDate: VERIFIED_DATE,
    contains: { fragrance: false, niacinamide: true, oat: false },
    botanicalIngredients: false,
  },
  {
    id: "vanicream-daily-moisturizer",
    name: "Daily Facial Moisturizer",
    brand: "Vanicream",
    step: "moisturizer",
    texture: "light",
    url: "https://www.vanicream.com/product/vanicream-daily-facial-moisturizer",
    description: "A lightweight lotion with squalane, hyaluronic acid and five ceramides.",
    ingredientNote: "No fragrance, niacinamide or oat is listed in the checked US ingredient list. It contains other ingredients that may not suit every person.",
    sourceDate: VERIFIED_DATE,
    contains: { ...NO_SELECTED_INGREDIENTS },
    botanicalIngredients: false,
  },
  {
    id: "vanicream-moisturizing-cream",
    name: "Moisturizing Cream",
    brand: "Vanicream",
    step: "moisturizer",
    texture: "rich",
    url: "https://www.vanicream.com/product/vanicream-moisturizing-cream",
    description: "A richer cream containing petrolatum; the manufacturer permits facial and body use.",
    ingredientNote: "No fragrance, niacinamide or oat is listed in the checked US ingredient list. Includes propylene glycol and cetearyl alcohol; check the full local label.",
    sourceDate: VERIFIED_DATE,
    contains: { ...NO_SELECTED_INGREDIENTS },
    botanicalIngredients: false,
  },
  {
    id: "aveeno-oat-gel",
    name: "Calm + Restore Oat Gel Moisturizer",
    brand: "Aveeno",
    step: "moisturizer",
    texture: "light",
    url: "https://www.aveeno.com/products/calm-restore-oat-gel-moisturizer-sensitive-skin",
    description: "A lightweight gel moisturizer containing oat and feverfew, labeled fragrance-free.",
    ingredientNote: "Contains oat and botanical extracts, including feverfew. No niacinamide is listed in the checked US ingredient list. Avoid this example if you avoid oat.",
    sourceDate: VERIFIED_DATE,
    contains: { fragrance: false, niacinamide: false, oat: true },
    botanicalIngredients: true,
  },
  {
    id: "blue-lizard-sensitive-spf50",
    name: "Sensitive Mineral SPF 50 Sunscreen Lotion",
    brand: "Blue Lizard",
    step: "sunscreen",
    texture: "any",
    url: "https://bluelizardsunscreen.com/products/sensitive-mineral-sunscreen-lotion-spf-50",
    description: "Broad-spectrum SPF 50 with zinc oxide and titanium dioxide; labeled water-resistant for 80 minutes and fragrance-free.",
    ingredientNote: "Contains aloe. No niacinamide or oat is listed in the checked US ingredient list. The selected filters do not check every sunscreen ingredient or predict tolerance.",
    sourceDate: VERIFIED_DATE,
    contains: { ...NO_SELECTED_INGREDIENTS },
    botanicalIngredients: true,
  },
];

const REFERENCES: SkincareRoutine["references"] = [
  {
    title: "AAD: A simple routine on a budget",
    url: "https://www.aad.org/public/everyday-care/skin-care-basics/care/skin-care-budget",
  },
  {
    title: "AAD: Applying skin care in order",
    url: "https://www.aad.org/public/everyday-care/skin-care-basics/care/apply-skin-care-certain-order",
  },
  {
    title: "AAD: How to apply sunscreen",
    url: "https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen",
  },
  {
    title: "AAD: Testing a new skin care product",
    url: "https://www.aad.org/public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products",
  },
];

function publicProduct(product: CatalogProduct): SkincareProduct {
  const { step: _step, texture: _texture, contains: _contains, botanicalIngredients: _botanical, ...facts } = product;
  return { ...facts, offer: getProductOffer(product.id) };
}

function orderedCandidates(step: SkincareStepId, profile: SkincarePreferences): CatalogProduct[] {
  const candidates = SKINCARE_PRODUCT_CATALOG.filter((product) =>
    product.step === step && profile.avoid.every((ingredient) => !product.contains[ingredient]),
  );
  const preferredCleanser =
    (profile.skinFeel === "oily" || profile.skinFeel === "combination") && profile.sensitivity === "no"
      ? "cerave-foaming-cleanser"
      : "vanicream-gentle-cleanser";
  const preferredTexture = profile.texture !== "any" ? profile.texture : profile.skinFeel === "dry" ? "rich" : "light";
  // Botanical moisturizer candidates are not used when sensitivity is unknown or reported.
  // This conservative preference rule is not a validated allergy or tolerance prediction.
  const filtered = candidates.filter((product) =>
    step !== "moisturizer" || profile.sensitivity === "no" || !product.botanicalIngredients,
  );
  return filtered.map((product, index) => {
    const score = step === "cleanser"
      ? Number(product.id === preferredCleanser) * 10
      : step === "moisturizer"
        ? Number(product.texture === preferredTexture) * 10 + Number(product.id === "vanicream-daily-moisturizer")
        : 0;
    return { product, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(({ product }) => product);
}

const STEP_CONTENT: Record<SkincareStepId, { title: string; when: string; guidance: string }> = {
  cleanser: {
    title: "Cleanse gently",
    when: "Morning as needed · Evening",
    guidance: "Use a gentle cleanser with lukewarm water and your fingertips; rinse and pat dry. Avoid scrubbing or adding exfoliating steps automatically.",
  },
  moisturizer: {
    title: "Moisturize",
    when: "Morning · Evening, as needed",
    guidance: "Apply a moisturizer after cleansing. Choose a texture you find comfortable and follow the product label; one tolerated moisturizer can serve both routines.",
  },
  sunscreen: {
    title: "Protect from the sun",
    when: "Morning · Reapply outdoors",
    guidance: "Use broad-spectrum, water-resistant SPF 30 or higher as directed. Reapply at least every two hours outdoors and after swimming, sweating or towel drying according to the label; also seek shade and wear protective clothing.",
  },
};

/** Deterministic cosmetic preference matching. Deliberately accepts no image/model output. */
export function buildSkincareRoutine(preferences: SkincarePreferences): SkincareRoutine {
  const profile = SkincarePreferencesSchema.parse(preferences);
  const steps = (["cleanser", "moisturizer", "sunscreen"] as const).map((id): SkincareRoutineStep => {
    const reuseOwned = profile.owned.includes(id);
    const candidates = orderedCandidates(id, profile);
    const selected = candidates[0];
    const product = reuseOwned || !selected ? null : publicProduct(selected);
    let reason: string;
    if (reuseOwned) {
      reason = "You already own this basic step. Keep a product you tolerate after checking its current label against your avoidances; SkinSnap cannot inspect your existing product.";
    } else if (!selected) {
      reason = "No verified catalog example matches these choices. Use the category guidance and ask a pharmacist or dermatologist to review your ingredient restrictions.";
    } else if (id === "cleanser") {
      reason = selected.id === "cerave-foaming-cleanser"
        ? "You described oily or combination skin and no sensitivity; this example is marketed for normal to oily skin. This preference match does not predict results."
        : "A straightforward cleansing example for a gentle basic routine; your selected ingredient exclusions were checked against its published list.";
    } else if (id === "moisturizer") {
      reason = profile.texture !== "any"
        ? `You prefer a ${profile.texture === "light" ? "lighter lotion or gel" : "richer cream"}; this example matches that texture preference.`
        : profile.skinFeel === "dry"
          ? "You described dry-feeling skin; a richer cream is the selected texture example. This is self-reported comfort guidance, not a skin diagnosis."
          : "A lightweight lotion keeps the routine simple when you have no richer-texture preference.";
    } else {
      reason = "This catalog example meets the broad-spectrum, SPF 30+ and water-resistance criteria. Check its finish and full ingredients yourself; the survey cannot predict tolerance or appearance on your skin.";
    }
    return {
      id,
      ...STEP_CONTENT[id],
      reason,
      reuseOwned,
      product,
      alternatives: reuseOwned ? [] : candidates.slice(1, 2).map(publicProduct),
    };
  });
  return {
    summary: profile.budget === "minimal"
      ? "A simple three-step routine that reuses your existing basics and keeps optional product examples to the gaps."
      : "A simple three-step routine with optional examples matched to your texture and ingredient preferences, reusing basics you already own.",
    steps,
    notes: [
      "This routine uses your survey answers, not the image or the model category. These products do not diagnose or treat the photographed lesion; professional evaluation comes first for a concerning or changing spot.",
      "Product combinations are educational examples, not a clinically validated best combination. A larger budget does not add more treatment steps or imply better outcomes.",
      "Ingredient filters cover fragrance, niacinamide and oat only. They do not guarantee allergy safety; if you have other allergies or unexplained reactions, ask a qualified professional to review the full label before choosing a product.",
      "Test a new product on a small area first, following AAD guidance for seven to ten days and the product's directions. Stop if a reaction develops; get professional help for severe or persistent reactions.",
      "Examples use dated US manufacturer ingredient information. Retail prices are dated US-dollar snapshots for the stated sizes, excluding tax and delivery; prices, sellers, stock and local formulas can change. Recheck the linked listing and your package. No affiliate links or checkout are used.",
      profile.budget === "minimal"
        ? "The budget choice minimizes extra products and avoids duplicate purchases; it does not calculate the cheapest basket. Compare current local prices and sizes before buying."
        : "Alternatives are optional texture or formulation examples, not add-on purchases. Compare current local costs if you choose to buy.",
    ],
    references: REFERENCES.map((reference) => ({ ...reference })),
  };
}
