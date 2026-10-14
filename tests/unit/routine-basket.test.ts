import { describe, expect, it } from "vitest";
import { DEFAULT_SKINCARE_PREFERENCES, SkincarePreferencesSchema } from "@/lib/skincare-preferences";
import { buildSkincareRoutine, SKINCARE_PRODUCT_CATALOG } from "@/lib/skincare-routine";
import { chooseBudgetBasket, selectRoutineProducts, summarizeSelectedPrices } from "@/lib/routine-selection";

const profile = (totalBudgetUsd = 50) => ({ ...DEFAULT_SKINCARE_PREFERENCES, totalBudgetUsd, avoid: [], owned: [] });

describe("numeric survey budget", () => {
  it("defaults a legacy survey to $50 without changing the old answers", () => {
    const legacy: Record<string, unknown> = { ...profile() };
    delete legacy.totalBudgetUsd;
    expect(SkincarePreferencesSchema.parse(legacy)).toEqual({ ...legacy, totalBudgetUsd: 50 });
  });
  it.each([0, .01, 38.66, 39.46, 10000])("accepts a finite dollar-and-cent cap of %s", cap => {
    expect(SkincarePreferencesSchema.parse(profile(cap)).totalBudgetUsd).toBe(cap);
  });
  it.each([-1, NaN, Infinity, -Infinity, 10000.01, 1.001, "50", null])("rejects invalid cap %s", cap => {
    expect(SkincarePreferencesSchema.safeParse({ ...profile(), totalBudgetUsd: cap }).success).toBe(false);
  });
});

describe("complete eligible catalog baskets", () => {
  it("retains preferred products when affordable rather than equating cheapest with best fit", () => {
    const routine = buildSkincareRoutine(profile());
    expect(routine.steps[1].product?.id).toBe("vanicream-daily-moisturizer");
    expect(routine.budgetSelection).toMatchObject({ capCents: 5000, subtotalCents: 3946, minimumSubtotalCents: 3866,
      status: "within_budget", eligibleBasketCount: 4, adjustedSteps: [] });
  });
  it("honors an exact-cent cap, switches an eligible moisturizer below it, and explains that change", () => {
    const exact = buildSkincareRoutine(profile(39.46));
    expect(exact.steps[1].product?.id).toBe("vanicream-daily-moisturizer");
    expect(exact.budgetSelection?.status).toBe("within_budget");
    const lower = buildSkincareRoutine(profile(39.45));
    expect(lower.steps[1].product?.id).toBe("vanicream-moisturizing-cream");
    expect(lower.budgetSelection).toMatchObject({ subtotalCents: 3866, status: "within_budget", adjustedSteps: ["moisturizer"] });
    expect(lower.steps[1].reason).toContain("eligible substitute");
    expect(lower.steps[1].reason).not.toContain("matches that texture");
    expect(lower.steps[1].rankedProductIds).toEqual(["vanicream-daily-moisturizer", "vanicream-moisturizing-cream"]);
  });
  it("shows a full cheapest eligible basket when the cap is insufficient, including a zero cap", () => {
    for (const cap of [0, 10, 38.65]) {
      const routine = buildSkincareRoutine(profile(cap));
      expect(routine.steps.filter(step => step.product)).toHaveLength(3);
      expect(routine.budgetSelection).toMatchObject({ status: "over_budget", subtotalCents: 3866, minimumSubtotalCents: 3866 });
    }
  });
  it("keeps tolerated owned steps fixed without replacement even when the cap is zero", () => {
    const routine = buildSkincareRoutine({ ...profile(0), owned: ["cleanser", "moisturizer", "sunscreen"] });
    expect(routine.steps.every(step => step.reuseOwned && !step.product && !step.alternatives.length)).toBe(true);
    expect(routine.budgetSelection).toMatchObject({ status: "within_budget", subtotalCents: 0, minimumSubtotalCents: 0, eligibleBasketCount: 1 });
  });
  it("charges only the missing sunscreen and handles an exact cap after ownership", () => {
    const routine = buildSkincareRoutine({ ...profile(15.48), owned: ["cleanser", "moisturizer"] });
    expect(routine.budgetSelection).toMatchObject({ status: "within_budget", subtotalCents: 1548, eligibleBasketCount: 1 });
  });
  it("never purchases or offers an excluded ingredient to meet a cap", () => {
    for (const cap of [0, 38.66, 39.46, 100]) {
      const routine = buildSkincareRoutine({ ...profile(cap), skinFeel: "oily", sensitivity: "no", avoid: ["niacinamide", "oat"] });
      const products = routine.steps.flatMap(step => step.product ? [step.product, ...step.alternatives] : []);
      expect(products.some(product => /cerave|aveeno/.test(product.id))).toBe(false);
      for (const product of products) {
        const facts = SKINCARE_PRODUCT_CATALOG.find(candidate => candidate.id === product.id)!;
        expect(facts.contains.niacinamide || facts.contains.oat).toBe(false);
      }
    }
  });
  it("compares complete combinations across categories instead of independent per-item caps", () => {
    const routine = buildSkincareRoutine({ ...profile(40), skinFeel: "oily", sensitivity: "no" });
    expect(routine.steps[0].product?.id).toBe("vanicream-gentle-cleanser");
    expect(routine.steps[1].product?.id).toBe("vanicream-daily-moisturizer");
    expect(routine.budgetSelection).toMatchObject({ subtotalCents: 3946, status: "within_budget", eligibleBasketCount: 6, adjustedSteps: ["cleanser"] });
    expect(routine.steps[0].reason).not.toContain("marketed for normal to oily");
  });
  it("does not claim a complete price or affordable basket when a step or price is unknown", () => {
    const missingProduct = buildSkincareRoutine(profile());
    missingProduct.steps[2].product = null;
    expect(chooseBudgetBasket(missingProduct, 100).budgetSelection).toMatchObject({ status: "incomplete_catalog", subtotalCents: null, minimumSubtotalCents: null, missingSteps: ["sunscreen"] });
    const missingOffer = buildSkincareRoutine(profile());
    missingOffer.steps[0].product!.offer = undefined;
    expect(chooseBudgetBasket(missingOffer, 100).budgetSelection).toMatchObject({ status: "incomplete_catalog", subtotalCents: null, missingSteps: ["cleanser"] });
  });
  it("updates the budget warning after a manual alternative without changing the default basket", () => {
    const initial = buildSkincareRoutine(profile(39.46));
    const selection = selectRoutineProducts(initial, { cleanser: "cerave-foaming-cleanser" });
    expect(selection.budgetSelection).toMatchObject({ status: "over_budget", subtotalCents: 4326 });
    expect(summarizeSelectedPrices(selection.steps).subtotalCents).toBe(4326);
    expect(initial.budgetSelection).toMatchObject({ status: "within_budget", subtotalCents: 3946 });
  });
  it("does not mutate survey, catalog, or previous routines while comparing options", () => {
    const input = profile(39);
    const before = JSON.stringify(input);
    const catalog = JSON.stringify(SKINCARE_PRODUCT_CATALOG);
    const first = buildSkincareRoutine(input);
    const previous = JSON.stringify(first);
    expect(buildSkincareRoutine(input)).toEqual(first);
    chooseBudgetBasket(first, 20);
    expect(JSON.stringify(first)).toBe(previous);
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(SKINCARE_PRODUCT_CATALOG)).toBe(catalog);
  });
  it("retains the original preference ordering when a basket is recalculated at a larger cap", () => {
    const lower = buildSkincareRoutine(profile(39));
    const larger = chooseBudgetBasket(lower, 50);
    expect(larger.steps[1].product?.id).toBe("vanicream-daily-moisturizer");
    expect(larger.steps[1].reason).toContain("lightweight lotion");
    expect(larger.budgetSelection?.adjustedSteps).toEqual([]);
  });
});
