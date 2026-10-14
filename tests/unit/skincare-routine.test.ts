import { describe, expect, it } from "vitest";
import { DEFAULT_SKINCARE_PREFERENCES, SkincarePreferencesSchema, type SkincarePreferences } from "@/lib/skincare-preferences";
import { buildSkincareRoutine, SKINCARE_PRODUCT_CATALOG, type SkincareRoutine } from "@/lib/skincare-routine";

function profile(overrides: Partial<SkincarePreferences> = {}): SkincarePreferences {
  return { ...DEFAULT_SKINCARE_PREFERENCES, avoid: [], owned: [], ...overrides };
}

function productIds(routine: SkincareRoutine) {
  return routine.steps.flatMap((step) => [step.product, ...step.alternatives].filter((product) => product !== null).map((product) => product.id));
}

describe("survey-driven educational skin care", () => {
  it("returns only the three ordered basic care steps with morning/evening guidance", () => {
    const routine = buildSkincareRoutine(profile());
    expect(routine.steps.map((step) => step.id)).toEqual(["cleanser", "moisturizer", "sunscreen"]);
    expect(routine.steps[0].when).toContain("Evening");
    expect(routine.steps[2].guidance).toContain("SPF 30");
    expect(routine.steps[2].guidance).toContain("water-resistant");
  });

  it("selects a richer example for self-reported dry skin", () => {
    expect(buildSkincareRoutine(profile({ skinFeel: "dry" })).steps[1].product?.id).toBe("vanicream-moisturizing-cream");
  });

  it("honors an explicit lighter texture rather than overriding it with skin feel", () => {
    const step = buildSkincareRoutine(profile({ skinFeel: "dry", texture: "light" })).steps[1];
    expect(step.product?.id).toBe("vanicream-daily-moisturizer");
    expect(step.reason).toContain("prefer a lighter");
  });

  it("offers the normal-to-oily cleanser example only for the matching self-report", () => {
    const oily = profile({ skinFeel: "oily", sensitivity: "no" });
    expect(buildSkincareRoutine(oily).steps[0].product?.id).toBe("cerave-foaming-cleanser");
    expect(buildSkincareRoutine({ ...oily, sensitivity: "yes" }).steps[0].product?.id).toBe("vanicream-gentle-cleanser");
    expect(buildSkincareRoutine({ ...oily, sensitivity: "unsure" }).steps[0].product?.id).toBe("vanicream-gentle-cleanser");
  });

  it("removes niacinamide from the suggested combination and alternatives", () => {
    const routine = buildSkincareRoutine(profile({ skinFeel: "oily", sensitivity: "no", budget: "flexible", avoid: ["niacinamide"] }));
    expect(productIds(routine)).not.toContain("cerave-foaming-cleanser");
    expect(routine.steps[0].product?.id).toBe("vanicream-gentle-cleanser");
  });

  it("removes the oat-containing alternative when oat is excluded", () => {
    const input = profile({ sensitivity: "no", texture: "light", budget: "flexible" });
    expect(productIds(buildSkincareRoutine(input))).toContain("aveeno-oat-gel");
    expect(productIds(buildSkincareRoutine({ ...input, avoid: ["oat"] }))).not.toContain("aveeno-oat-gel");
  });

  it("does not offer botanical moisturizer examples for unknown or reported sensitivity", () => {
    for (const sensitivity of ["yes", "unsure"] as const) {
      expect(productIds(buildSkincareRoutine(profile({ sensitivity, budget: "flexible" })))).not.toContain("aveeno-oat-gel");
    }
  });

  it("enforces every selected ingredient exclusion across all feel, sensitivity and texture combinations", () => {
    const avoidSets: SkincarePreferences["avoid"][] = [[], ["fragrance"], ["niacinamide"], ["oat"], ["fragrance", "niacinamide"], ["fragrance", "oat"], ["niacinamide", "oat"], ["fragrance", "niacinamide", "oat"]];
    for (const skinFeel of ["unsure", "dry", "oily", "combination", "balanced"] as const) {
      for (const sensitivity of ["yes", "no", "unsure"] as const) {
        for (const texture of ["any", "light", "rich"] as const) {
          for (const avoid of avoidSets) {
            const ids = productIds(buildSkincareRoutine(profile({ skinFeel, sensitivity, texture, budget: "flexible", avoid })));
            for (const id of ids) {
              const candidate = SKINCARE_PRODUCT_CATALOG.find((product) => product.id === id)!;
              for (const excluded of avoid) expect(candidate.contains[excluded]).toBe(false);
            }
          }
        }
      }
    }
  });

  it("reuses existing basics without suggesting replacements or extra purchases at either budget", () => {
    for (const budget of ["minimal", "flexible"] as const) {
      const routine = buildSkincareRoutine(profile({ budget, owned: ["cleanser", "moisturizer", "sunscreen"] }));
      expect(productIds(routine)).toEqual([]);
      expect(routine.steps.every((step) => step.reuseOwned && step.product === null && step.alternatives.length === 0)).toBe(true);
      expect(routine.steps[0].reason).toContain("cannot inspect your existing product");
    }
  });

  it("fills only unowned steps and offers comparisons without adding purchase steps", () => {
    const routine = buildSkincareRoutine(profile({ owned: ["cleanser", "moisturizer"] }));
    expect(routine.steps[0].product).toBeNull();
    expect(routine.steps[1].product).toBeNull();
    expect(routine.steps[2].product?.id).toBe("blue-lizard-sensitive-spf50");
    expect(routine.steps.filter(step => step.product)).toHaveLength(1);
    expect(routine.notes.join(" ")).toContain("without dropping a step");
  });

  it("shows alternative examples at either purchasing priority while keeping one selected item per step", () => {
    for (const budget of ["minimal", "flexible"] as const) {
      const routine = buildSkincareRoutine(profile({ budget }));
      expect(routine.steps[0].alternatives).toHaveLength(1);
      expect(routine.steps[1].alternatives).toHaveLength(1);
      expect(routine.steps[2].alternatives).toHaveLength(0);
      expect(routine.steps.filter(step => step.product)).toHaveLength(3);
    }
  });

  it("never accepts diagnosis or model output as a recommendation input", () => {
    expect(() => buildSkincareRoutine({ ...profile(), modelLabel: "mel" } as SkincarePreferences)).toThrow();
    expect(() => buildSkincareRoutine({ ...profile(), confidence: 0.99 } as SkincarePreferences)).toThrow();
    expect(buildSkincareRoutine(profile()).notes[0]).toContain("not the image or the model category");
  });

  it("rejects malformed and duplicate constraint inputs", () => {
    expect(SkincarePreferencesSchema.safeParse({ ...profile(), skinFeel: "rosacea" }).success).toBe(false);
    expect(SkincarePreferencesSchema.safeParse({ ...profile(), avoid: ["unknown-ingredient"] }).success).toBe(false);
    expect(SkincarePreferencesSchema.safeParse({ ...profile(), owned: ["serum"] }).success).toBe(false);
    expect(SkincarePreferencesSchema.safeParse({ ...profile(), avoid: ["oat", "oat"] }).success).toBe(false);
    expect(SkincarePreferencesSchema.safeParse({ ...profile(), owned: ["cleanser", "cleanser"] }).success).toBe(false);
    expect(SkincarePreferencesSchema.safeParse({ skinFeel: "unsure" }).success).toBe(false);
  });

  it("is deterministic and does not mutate survey answers, defaults, catalog or previous outputs", () => {
    const input = profile({ skinFeel: "combination", sensitivity: "no", budget: "flexible", avoid: ["oat", "fragrance"] });
    const original = JSON.stringify(input);
    const catalogBefore = JSON.stringify(SKINCARE_PRODUCT_CATALOG);
    const first = buildSkincareRoutine(input);
    const second = buildSkincareRoutine(input);
    expect(first).toEqual(second);
    expect(buildSkincareRoutine({ ...input, avoid: [...input.avoid].reverse() })).toEqual(first);
    first.steps[0].product!.name = "Changed locally";
    first.references[0].title = "Changed locally";
    expect(second.steps[0].product!.name).not.toBe("Changed locally");
    expect(buildSkincareRoutine(input)).toEqual(second);
    expect(JSON.stringify(input)).toBe(original);
    expect(JSON.stringify(SKINCARE_PRODUCT_CATALOG)).toBe(catalogBefore);
    expect(DEFAULT_SKINCARE_PREFERENCES.avoid).toEqual([]);
  });

  it("provides ingredient, regional formulation, professional-care and reaction limitations", () => {
    const notes = buildSkincareRoutine(profile()).notes.join(" ");
    expect(notes).toContain("do not guarantee allergy safety");
    expect(notes).toContain("other allergies");
    expect(notes).toContain("professional evaluation comes first");
    expect(notes).toContain("seven to ten days");
    expect(notes).toContain("US manufacturer");
    expect(notes).toContain("No affiliate links or checkout");
  });

  it("publishes only catalog provenance and cosmetic facts, without invented retail measurements", () => {
    expect(SKINCARE_PRODUCT_CATALOG).toHaveLength(6);
    const hosts = new Set(["www.vanicream.com", "www.cerave.com", "www.aveeno.com", "bluelizardsunscreen.com"]);
    for (const product of SKINCARE_PRODUCT_CATALOG) {
      expect(hosts.has(new URL(product.url).hostname)).toBe(true);
      expect(product.sourceDate).toBe("2026-10-11");
      expect(product.ingredientNote.length).toBeGreaterThan(40);
      expect(product).not.toHaveProperty("price");
      expect(product).not.toHaveProperty("stock");
      expect(product).not.toHaveProperty("reviews");
      expect(product.name).not.toMatch(/retinol|salicylic|prescription|treat|cure/i);
    }
  });
});
