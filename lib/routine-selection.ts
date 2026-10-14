import type { SkincareStepId } from "@/lib/skincare-preferences";
import type { SkincareRoutine, SkincareRoutineStep } from "@/lib/skincare-routine";
import { SkincarePreferencesSchema } from "@/lib/skincare-preferences";
import { formatOfferPrice } from "@/lib/product-offers";

export type RoutineChoices = Partial<Record<SkincareStepId, string>>;

export type RoutineBudgetSelection = {
  capCents: number;
  status: "within_budget" | "over_budget" | "incomplete_catalog";
  subtotalCents: number | null;
  minimumSubtotalCents: number | null;
  eligibleBasketCount: number;
  adjustedSteps: SkincareStepId[];
  missingSteps: SkincareStepId[];
};

/**
 * Enumerate the small, already-filtered catalog. A rank is an ordinal preference,
 * never a clinical score. Ingredient/appearance filters run before this function.
 * Owned steps are fixed at no purchase; unknown prices cannot imply affordability.
 */
export function chooseBudgetBasket(routine: SkincareRoutine, totalBudgetUsd = 50): SkincareRoutine {
  const capCents = Math.round(SkincarePreferencesSchema.shape.totalBudgetUsd.parse(totalBudgetUsd) * 100);
  const options = routine.steps.map(step => {
    if (step.reuseOwned) return [null];
    if (!step.product) return [];
    const candidates = [step.product, ...step.alternatives];
    return step.rankedProductIds
      ? candidates.sort((a, b) => step.rankedProductIds!.indexOf(a.id) - step.rankedProductIds!.indexOf(b.id))
      : candidates;
  });
  const missingSteps = routine.steps.filter((step, index) => !step.reuseOwned &&
    (!options[index].length || options[index].some(product => !product?.offer))).map(step => step.id);
  if (missingSteps.length) return {
    ...routine,
    budgetSelection: { capCents, status: "incomplete_catalog", subtotalCents: null, minimumSubtotalCents: null,
      eligibleBasketCount: 0, adjustedSteps: [], missingSteps },
  };
  type Basket = { indices: number[]; subtotal: number; penalty: number };
  let baskets: Basket[] = [{ indices: [], subtotal: 0, penalty: 0 }];
  for (const candidates of options) {
    baskets = baskets.flatMap(basket => candidates.map((product, index) => ({
      indices: [...basket.indices, index], subtotal: basket.subtotal + (product?.offer?.priceCents ?? 0), penalty: basket.penalty + index,
    })));
  }
  const tieBreak = (a: Basket, b: Basket) => {
    for (let index = 0; index < a.indices.length; index++) {
      if (a.indices[index] !== b.indices[index]) return a.indices[index] - b.indices[index];
    }
    return 0;
  };
  const byCost = [...baskets].sort((a, b) => a.subtotal - b.subtotal || a.penalty - b.penalty || tieBreak(a, b));
  const affordable = baskets.filter(basket => basket.subtotal <= capCents)
    .sort((a, b) => a.penalty - b.penalty || a.subtotal - b.subtotal || tieBreak(a, b));
  const selected = affordable[0] ?? byCost[0];
  // This also handles the all-owned basket, whose subtotal is exactly zero.
  const status = affordable.length ? "within_budget" : "over_budget";
  const adjustedSteps: SkincareStepId[] = [];
  const steps = routine.steps.map((step, index) => {
    const candidates = options[index];
    const product = candidates[selected.indices[index]];
    if (step.reuseOwned || !product) return step;
    const changed = selected.indices[index] !== 0;
    if (changed) adjustedSteps.push(step.id);
    return {
      ...step,
      product,
      alternatives: candidates.flatMap(candidate => candidate !== null && candidate.id !== product.id ? [candidate] : []),
      rankedProductIds: candidates.flatMap(candidate => candidate ? [candidate.id] : []),
      preferenceReason: step.preferenceReason ?? step.reason,
      reason: changed
        ? `${product.brand} ${product.name} is an eligible substitute selected ${status === "within_budget" ? "to fit the complete combination within" : "for the lowest-cost complete combination available against"} your ${formatOfferPrice(capCents)} USD cap. It keeps the checked ingredient exclusions and any applicable appearance criteria. Compare its texture and formula with the alternatives below; lower price does not establish equal tolerance or medical benefit.`
        : step.preferenceReason ?? step.reason,
      budgetReason: changed
        ? `Preference rank ${selected.indices[index] + 1} in this category; the dollar cap changed the starting choice.`
        : `First preference in this category. ${status === "within_budget" ? "The complete starting combination fits your cap before tax and delivery." : "Even the lowest-cost complete eligible combination exceeds your cap."}`,
    };
  });
  return { ...routine, steps, budgetSelection: {
    capCents, status, subtotalCents: selected.subtotal, minimumSubtotalCents: byCost[0].subtotal,
    eligibleBasketCount: baskets.length, adjustedSteps, missingSteps: [],
  } };
}

/** A choice can select only an already-filtered example; it cannot bypass exclusions. */
export function selectRoutineProducts(routine: SkincareRoutine, choices: RoutineChoices): SkincareRoutine {
  const steps = routine.steps.map(step => {
    if (step.reuseOwned || !step.product) return step;
    const options = [step.product, ...step.alternatives];
    const product = options.find(option => option.id === choices[step.id]) ?? step.product;
    return { ...step, product, alternatives: options.filter(option => option.id !== product.id) };
  });
  const price = summarizeSelectedPrices(steps);
  return { ...routine, steps, ...(routine.budgetSelection ? { budgetSelection: {
    ...routine.budgetSelection,
    subtotalCents: price.complete ? price.subtotalCents : null,
    status: !price.complete ? "incomplete_catalog" as const : price.subtotalCents <= routine.budgetSelection.capCents ? "within_budget" as const : "over_budget" as const,
  } } : {}) };
}

export function summarizeSelectedPrices(steps: SkincareRoutineStep[]) {
  let subtotalCents = 0;
  let itemCount = 0;
  const missing: string[] = [];
  for (const step of steps) {
    if (step.reuseOwned) continue;
    const offer = step.product?.offer;
    if (!offer) { missing.push(step.id); continue; }
    subtotalCents += offer.priceCents;
    itemCount++;
  }
  return { subtotalCents, itemCount, missing, complete: missing.length === 0 };
}
