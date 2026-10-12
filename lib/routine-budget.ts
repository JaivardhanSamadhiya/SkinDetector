import type { SkincareRoutineStep } from "@/lib/skincare-routine";

export const ROUTINE_CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type RoutineCurrency = (typeof ROUTINE_CURRENCIES)[number];
export type BudgetAmount = { status: "missing" | "invalid" } | { status: "valid"; cents: number };

/** Parse decimal quotes without binary floating-point rounding or currency conversion. */
export function parseBudgetAmount(raw: string): BudgetAmount {
  const text = raw.trim();
  if (!text) return { status: "missing" };
  if (!/^(0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(text)) return { status: "invalid" };
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents < 10_000_000 ? { status: "valid", cents } : { status: "invalid" };
}

export type RoutineBudgetInput = {
  steps: SkincareRoutineStep[];
  currency: string;
  quotes: Record<string, string>;
  cap: string;
  tax: string;
  delivery: string;
};
export type RoutineBudgetResult = {
  status: "incomplete" | "invalid";
  issues: string[];
  reusedCount: number;
} | {
  status: "complete";
  issues: [];
  reusedCount: number;
  currency: RoutineCurrency;
  subtotalCents: number;
  totalCents: number;
  capCents: number;
  differenceCents: number;
  withinBudget: boolean;
};

/** Adds only selected missing basics. No live pricing, optimality or savings inference. */
export function calculateRoutineBudget(input: RoutineBudgetInput): RoutineBudgetResult {
  const reusedCount = input.steps.filter(step => step.reuseOwned).length;
  const issues: string[] = [];
  let invalid = !(ROUTINE_CURRENCIES as readonly string[]).includes(input.currency);
  if (invalid) issues.push("Choose a supported currency.");
  const amounts: Record<string, number> = {};
  function read(label: string, raw: string) {
    const value = parseBudgetAmount(raw);
    if (value.status === "valid") amounts[label] = value.cents;
    else {
      issues.push(value.status === "missing" ? `Enter ${label}.` : `Use a nonnegative amount below 100000, with up to two decimal places, for ${label}.`);
      invalid ||= value.status === "invalid";
    }
  }
  read("spending limit", input.cap);
  read("sales tax amount", input.tax);
  read("delivery amount", input.delivery);
  for (const step of input.steps) {
    if (step.reuseOwned) continue;
    if (!step.product) {
      issues.push(`No verified catalog match for ${step.id}; a complete basket cannot be calculated.`);
      continue;
    }
    read(`price for ${step.product.brand} ${step.product.name}`, input.quotes[step.product.id] ?? "");
  }
  if (issues.length) return { status: invalid ? "invalid" : "incomplete", issues, reusedCount };
  const subtotalCents = input.steps.reduce((total, step) => total + (step.reuseOwned || !step.product ? 0 : amounts[`price for ${step.product.brand} ${step.product.name}`]), 0);
  const totalCents = subtotalCents + amounts["sales tax amount"] + amounts["delivery amount"];
  const capCents = amounts["spending limit"];
  return { status: "complete", issues: [], reusedCount, currency: input.currency as RoutineCurrency, subtotalCents, totalCents, capCents, differenceCents: capCents - totalCents, withinBudget: totalCents <= capCents };
}

export function formatBudgetMoney(cents: number, currency: RoutineCurrency): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
