import type { SkincareStepId } from "@/lib/skincare-preferences";
import type { SkincareRoutine, SkincareRoutineStep } from "@/lib/skincare-routine";

export type RoutineChoices = Partial<Record<SkincareStepId, string>>;

/** A choice can select only an already-filtered example; it cannot bypass exclusions. */
export function selectRoutineProducts(routine: SkincareRoutine, choices: RoutineChoices): SkincareRoutine {
  return { ...routine, steps: routine.steps.map(step => {
    if (step.reuseOwned || !step.product) return step;
    const options = [step.product, ...step.alternatives];
    const product = options.find(option => option.id === choices[step.id]) ?? step.product;
    return { ...step, product, alternatives: options.filter(option => option.id !== product.id) };
  }) };
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
