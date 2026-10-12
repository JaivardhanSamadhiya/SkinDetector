import { describe, expect, it } from "vitest";
import { DEFAULT_SKINCARE_PREFERENCES } from "@/lib/skincare-preferences";
import { buildSkincareRoutine } from "@/lib/skincare-routine";
import { calculateRoutineBudget, formatBudgetMoney, parseBudgetAmount, type RoutineBudgetInput } from "@/lib/routine-budget";

function input(overrides: Partial<RoutineBudgetInput> = {}): RoutineBudgetInput {
  const steps = buildSkincareRoutine({ ...DEFAULT_SKINCARE_PREFERENCES, owned: ["sunscreen"] }).steps;
  const quotes = Object.fromEntries(steps.flatMap(step => step.product ? [[step.product.id, step.id === "cleanser" ? "0.10" : "0.20"]] : []));
  return { steps, quotes, cap: "0.80", tax: "0.40", delivery: "0", currency: "USD", ...overrides };
}

describe("manual routine quote validation", () => {
  it("parses exact cents including zero and one decimal", () => {
    expect(parseBudgetAmount("0")).toEqual({ status: "valid", cents: 0 });
    expect(parseBudgetAmount("12.3")).toEqual({ status: "valid", cents: 1230 });
    expect(parseBudgetAmount(" 99999.99 ")).toEqual({ status: "valid", cents: 9_999_999 });
  });
  it("keeps blank amounts missing rather than inventing a zero quote", () => {
    expect(parseBudgetAmount(" ")).toEqual({ status: "missing" });
    expect(calculateRoutineBudget(input({ quotes: {}, tax: "", delivery: "", cap: "" })).status).toBe("incomplete");
  });
  it.each(["-1", "1e2", "NaN", "Infinity", "100000", "1.234", "1,000", "$10", ".50", "01", "1."])("rejects invalid decimal %s", value => {
    expect(parseBudgetAmount(value).status).toBe("invalid");
  });
});

describe("manual routine budget calculations", () => {
  it("adds item prices and fee amounts in integer cents, excluding reused products", () => {
    const result = calculateRoutineBudget(input());
    expect(result).toMatchObject({ status: "complete", reusedCount: 1, subtotalCents: 30, totalCents: 70, capCents: 80, differenceCents: 10, withinBudget: true });
  });
  it("reports over-limit quotes and accepts an exact limit", () => {
    expect(calculateRoutineBudget(input({ cap: "0.69" }))).toMatchObject({ status: "complete", differenceCents: -1, withinBudget: false });
    expect(calculateRoutineBudget(input({ cap: "0.70" }))).toMatchObject({ status: "complete", differenceCents: 0, withinBudget: true });
  });
  it("requires tax and delivery even when item prices are known", () => {
    const result = calculateRoutineBudget(input({ delivery: "" }));
    expect(result).toMatchObject({ status: "incomplete", issues: ["Enter delivery amount."] });
    expect(result).not.toHaveProperty("totalCents");
  });
  it("uses zero item cost when all basics are reused without demanding item quotes", () => {
    const steps = buildSkincareRoutine({ ...DEFAULT_SKINCARE_PREFERENCES, owned: ["cleanser", "moisturizer", "sunscreen"] }).steps;
    expect(calculateRoutineBudget(input({ steps, quotes: {}, tax: "0", delivery: "0", cap: "0" }))).toMatchObject({ status: "complete", reusedCount: 3, totalCents: 0, withinBudget: true });
  });
  it("does not turn a missing catalog match into a free purchase", () => {
    const data = input();
    const steps = data.steps.map(step => step.id === "cleanser" ? { ...step, product: null } : step);
    const result = calculateRoutineBudget(input({ steps }));
    expect(result.status).toBe("incomplete");
    expect(result.issues.join(" ")).toContain("No verified catalog match");
    expect(result).not.toHaveProperty("totalCents");
  });
  it("does not reuse another product's entered quote after preferences choose a different example", () => {
    const data = input();
    const steps = buildSkincareRoutine({ ...DEFAULT_SKINCARE_PREFERENCES, texture: "rich", owned: ["sunscreen"] }).steps;
    const result = calculateRoutineBudget({ ...data, steps });
    expect(result.status).toBe("incomplete");
    expect(result.issues.join(" ")).toContain("Moisturizing Cream");
  });
  it("rejects malformed amounts and unsupported currencies without producing a total", () => {
    for (const override of [{ tax: "-1" }, { currency: "JPY" }]) {
      const result = calculateRoutineBudget(input(override));
      expect(result.status).toBe("invalid");
      expect(result).not.toHaveProperty("totalCents");
    }
  });
  it("supports fixed two-decimal currencies without converting the entered value", () => {
    for (const currency of ["USD", "EUR", "GBP"]) expect(calculateRoutineBudget(input({ currency }))).toMatchObject({ status: "complete", currency, totalCents: 70 });
    expect(formatBudgetMoney(1230, "USD")).toBe("$12.30");
  });
});
