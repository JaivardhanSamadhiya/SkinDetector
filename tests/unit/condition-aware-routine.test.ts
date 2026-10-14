import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildConditionAwareRoutine, CONDITION_MATCHING_MODEL_VERSION, CONDITION_MATCHING_MIN_MARGIN, CONDITION_MATCHING_MIN_SCORE } from "@/lib/condition-aware-routine";
import { DEFAULT_SKINCARE_PREFERENCES, type SkincarePreferences } from "@/lib/skincare-preferences";
import { buildSkincareRoutine, SKINCARE_PRODUCT_CATALOG, type SkincareRoutine } from "@/lib/skincare-routine";
import { AnalysisSchema } from "@/lib/types";
import { PHOTO_MODEL_VERSION } from "@/lib/clinical-task";

const CLASSES = [
  { id: "acne", label: "Acne-like appearance" },
  { id: "dermatitis", label: "Dermatitis-like appearance" },
  { id: "other", label: "Other / unsupported appearance" },
];

function preferences(overrides: Partial<SkincarePreferences> = {}): SkincarePreferences {
  return { ...DEFAULT_SKINCARE_PREFERENCES, avoid: [], owned: [], ...overrides };
}

// Deliberately synthetic transport fixtures for rule tests. They are never used
// by the application, displayed as predictions, or counted as model evaluation.
function clinicalFixture(top: "acne" | "dermatitis" | "other" = "acne") {
  return {
    status: "assessed",
    message: "Synthetic rule-test fixture only",
    model: {
      version: CONDITION_MATCHING_MODEL_VERSION,
      architecture: "Synthetic fixture for the documented clinical-photo task",
      input_size: 128,
      supported_image_type: "clinical_photo",
      available: true,
      classes: CLASSES.map(item => ({ ...item })),
    },
    scores: CLASSES.map(item => ({ ...item, score: item.id === top ? .8 : .1 })),
    quality: { width: 256, height: 256, blur_variance: 20, brightness: .5, underexposed_fraction: 0, overexposed_fraction: 0, issues: [] as { code: string; severity: "warning" | "error"; message: string }[], passed: true },
    uncertainty: { rejected: false, reasons: [] as string[], score_type: "temperature_scaled_model_score" },
    explanation: null,
    next_step: "Test fixture only",
  };
}

function productIds(routine: SkincareRoutine): string[] {
  return routine.steps.flatMap(step => [step.product, ...step.alternatives].flatMap(product => product ? [product.id] : []));
}

describe("condition-aware basic cosmetic-care policy", () => {
  it.each(["acne", "dermatitis"] as const)("keeps even a high-score v2 %s ranking out of condition-specific product selection", condition => {
    const fixture = clinicalFixture(condition);
    fixture.model.version = PHOTO_MODEL_VERSION;
    fixture.model.input_size = 224;
    const answers = preferences({ totalBudgetUsd: 39, texture: "rich" });
    const output = buildConditionAwareRoutine(answers, fixture);
    expect(output.decision.status).toBe("general_only");
    expect(output.decision.conditionId).toBeUndefined();
    expect(output.decision.explanation).toContain("too many incorrect");
    expect(output.routine).toEqual(buildSkincareRoutine(answers));
  });
  it("combines accepted appearance criteria with the numeric cap without adding excluded formulas", () => {
    const output = buildConditionAwareRoutine(preferences({ totalBudgetUsd: 39, avoid: ["niacinamide", "oat"] }), clinicalFixture("acne"));
    expect(output.decision.status).toBe("condition_matched");
    expect(output.routine.budgetSelection).toMatchObject({ status: "within_budget", subtotalCents: 3866, adjustedSteps: ["moisturizer"] });
    expect(output.routine.steps[1].product?.id).toBe("vanicream-moisturizing-cream");
    expect(output.routine.steps[1].reason).toContain("eligible substitute");
    expect(productIds(output.routine)).not.toContain("cerave-foaming-cleanser");
    expect(productIds(output.routine)).not.toContain("aveeno-oat-gel");
  });

  it("keeps the accepted-category explicit texture restriction even when it makes the cap infeasible", () => {
    const output = buildConditionAwareRoutine(preferences({ totalBudgetUsd: 39, texture: "light" }), clinicalFixture("dermatitis"));
    expect(output.decision.status).toBe("condition_matched");
    expect(output.routine.steps[1].product?.id).toBe("vanicream-daily-moisturizer");
    expect(output.routine.steps[1].alternatives).toEqual([]);
    expect(output.routine.budgetSelection).toMatchObject({ status: "over_budget", subtotalCents: 3946, minimumSubtotalCents: 3946 });
    expect(output.routine.steps.filter(step => step.product)).toHaveLength(3);
  });

  it("uses the same budgeted survey basket after a failed photo and never infers a care condition from budget", () => {
    const answers = preferences({ totalBudgetUsd: 39, skinFeel: "dry" });
    const fixture = clinicalFixture("acne");
    const failed = { ...fixture, status: "unavailable", scores: [], quality: null, uncertainty: null, explanation: null };
    const output = buildConditionAwareRoutine(answers, failed);
    expect(output.decision.status).toBe("general_only");
    expect(output.routine).toEqual(buildSkincareRoutine(answers));
  });

  it("uses no appearance branch without an image-analysis result", () => {
    for (const result of [null, undefined]) {
      const output = buildConditionAwareRoutine(preferences(), result);
      expect(output.decision.status).toBe("general_only");
      expect(output.decision.conditionId).toBeUndefined();
      expect(output.routine).toEqual(buildSkincareRoutine(preferences()));
    }
  });

  it("accepts the documented three-label transport fixture before applying its policy", () => {
    expect(AnalysisSchema.safeParse(clinicalFixture()).success).toBe(true);
    const output = buildConditionAwareRoutine(preferences(), clinicalFixture());
    expect(output.decision.status).toBe("condition_matched");
    expect(output.decision.conditionId).toBe("acne");
    expect(output.decision.explanation).toContain("not a diagnosis");
  });

  it("changes the default moisturizer using the accepted appearance category with identical preferences", () => {
    const input = preferences();
    const acne = buildConditionAwareRoutine(input, clinicalFixture("acne"));
    const dermatitis = buildConditionAwareRoutine(input, clinicalFixture("dermatitis"));
    expect(acne.routine.steps[1].product?.id).toBe("vanicream-daily-moisturizer");
    expect(dermatitis.routine.steps[1].product?.id).toBe("vanicream-moisturizing-cream");
    expect(dermatitis.decision.conditionId).toBe("dermatitis");
    expect(dermatitis.routine.steps[1].reason).toContain("shifts the default");
  });

  it("limits acne-conditioned cleanser and moisturizer choices to verified product-specific noncomedogenic labels", () => {
    const output = buildConditionAwareRoutine(preferences({ sensitivity: "no", skinFeel: "oily" }), clinicalFixture("acne"));
    expect(output.routine.steps[0].product?.id).toBe("vanicream-gentle-cleanser");
    expect(productIds(output.routine)).not.toContain("cerave-foaming-cleanser");
    expect(productIds(output.routine)).not.toContain("aveeno-oat-gel");
    expect(output.routine.steps[0].reason).toContain("not acne treatment");
  });

  it("does not reject noncomedogenic rich cream because it contains petrolatum or fatty alcohol", () => {
    const output = buildConditionAwareRoutine(preferences({ texture: "rich" }), clinicalFixture("acne"));
    expect(output.routine.steps[1].product?.id).toBe("vanicream-moisturizing-cream");
    expect(output.routine.steps[1].reason).toContain("explicit texture preference");
  });

  it("honors explicit light texture and explains its compromise with dermatitis care guidance", () => {
    const output = buildConditionAwareRoutine(preferences({ skinFeel: "dry", texture: "light" }), clinicalFixture("dermatitis"));
    expect(output.routine.steps[1].product?.id).toBe("vanicream-daily-moisturizer");
    expect(output.routine.steps[1].reason).toContain("preference compromise");
    expect(output.routine.steps[1].reason).toContain("does not confirm eczema");
    expect(output.decision.reasons.join(" ")).toContain("takes precedence");
    expect(output.routine.steps[1].alternatives).toEqual([]);
  });

  it.each(["light", "rich"] as const)("honors explicit %s moisturizer texture in both condition policies", texture => {
    for (const condition of ["acne", "dermatitis"] as const) {
      const output = buildConditionAwareRoutine(preferences({ texture }), clinicalFixture(condition));
      for (const product of [output.routine.steps[1].product, ...output.routine.steps[1].alternatives]) {
        expect(SKINCARE_PRODUCT_CATALOG.find(item => item.id === product!.id)?.texture).toBe(texture);
      }
    }
  });

  it("offers only eligible substitute moisturizers when texture is not explicitly constrained", () => {
    const acne = buildConditionAwareRoutine(preferences({ sensitivity: "no" }), clinicalFixture("acne"));
    expect(acne.routine.steps[1].alternatives.map(product => product.id)).toEqual(["vanicream-moisturizing-cream"]);
    const dermatitis = buildConditionAwareRoutine(preferences(), clinicalFixture("dermatitis"));
    expect(dermatitis.routine.steps[1].alternatives.map(product => product.id)).toEqual(["vanicream-daily-moisturizer"]);
    expect(productIds(dermatitis.routine)).not.toContain("aveeno-oat-gel");
  });

  it("discloses that the sunscreen is a general SPF example with unverified acne compatibility", () => {
    const output = buildConditionAwareRoutine(preferences(), clinicalFixture("acne"));
    expect(output.routine.steps[2].product?.id).toBe("blue-lizard-sensitive-spf50");
    expect(output.routine.steps[2].reason).toContain("no acne-specific noncomedogenic claim was verified");
    expect(output.routine.steps[2].reason).toContain("compatibility is unknown");
  });

  it("discloses aloe and individual sunscreen tolerance limits for dermatitis", () => {
    const step = buildConditionAwareRoutine(preferences(), clinicalFixture("dermatitis")).routine.steps[2];
    expect(step.reason).toContain("contains aloe");
    expect(step.reason).toContain("cannot predict");
  });

  it("enforces selected ingredient exclusions across both categories and all feel, texture and sensitivity inputs", () => {
    const avoids: SkincarePreferences["avoid"][] = [[], ["fragrance"], ["niacinamide"], ["oat"], ["fragrance", "niacinamide"], ["fragrance", "oat"], ["niacinamide", "oat"], ["fragrance", "niacinamide", "oat"]];
    for (const condition of ["acne", "dermatitis"] as const) {
      for (const skinFeel of ["unsure", "dry", "oily", "combination", "balanced"] as const) {
        for (const texture of ["any", "light", "rich"] as const) {
          for (const sensitivity of ["unsure", "yes", "no"] as const) {
            for (const avoid of avoids) {
              const output = buildConditionAwareRoutine(preferences({ avoid, skinFeel, texture, sensitivity }), clinicalFixture(condition));
              for (const id of productIds(output.routine)) {
                const product = SKINCARE_PRODUCT_CATALOG.find(item => item.id === id)!;
                for (const ingredient of avoid) expect(product.contains[ingredient]).toBe(false);
              }
            }
          }
        }
      }
    }
  });

  it("honors owned basics without approving their suitability or adding duplicate purchases", () => {
    for (const condition of ["acne", "dermatitis"] as const) {
      const all = buildConditionAwareRoutine(preferences({ owned: ["cleanser", "moisturizer", "sunscreen"] }), clinicalFixture(condition));
      expect(productIds(all.routine)).toEqual([]);
      expect(all.routine.steps.every(step => step.reuseOwned && step.product === null && step.alternatives.length === 0)).toBe(true);
      expect(all.routine.steps[0].reason).toContain("does not establish");
      const partial = buildConditionAwareRoutine(preferences({ owned: ["cleanser"] }), clinicalFixture(condition));
      expect(partial.routine.steps[0].product).toBeNull();
      expect(partial.routine.steps.filter(step => step.product)).toHaveLength(2);
    }
  });

  it("does not add treatment steps or imply better outcomes for a larger budget", () => {
    for (const condition of ["acne", "dermatitis"] as const) {
      const minimal = buildConditionAwareRoutine(preferences({ budget: "minimal" }), clinicalFixture(condition));
      const flexible = buildConditionAwareRoutine(preferences({ budget: "flexible" }), clinicalFixture(condition));
      expect(productIds(minimal.routine)).toEqual(productIds(flexible.routine));
      expect(flexible.routine.steps.map(step => step.id)).toEqual(["cleanser", "moisturizer", "sunscreen"]);
      expect(flexible.decision.reasons.join(" ")).toContain("does not imply a better outcome");
    }
  });

  it("never maps the other or unsupported appearance to a condition or changes the base routine", () => {
    const input = preferences({ texture: "light", sensitivity: "no" });
    const output = buildConditionAwareRoutine(input, clinicalFixture("other"));
    expect(output.decision.status).toBe("general_only");
    expect(output.decision.conditionId).toBeUndefined();
    expect(output.routine).toEqual(buildSkincareRoutine(input));
  });

  it("abstains on rejected uncertainty and ignores a high top score", () => {
    const fixture = clinicalFixture();
    fixture.status = "uncertain";
    fixture.uncertainty.rejected = true;
    fixture.uncertainty.reasons = ["Synthetic rejection fixture"];
    const output = buildConditionAwareRoutine(preferences(), fixture);
    expect(output.decision.status).toBe("general_only");
    expect(output.decision.conditionId).toBeUndefined();
  });

  it("independently rejects a below-policy top score despite a declared accepted flag and looser threshold", () => {
    const fixture = clinicalFixture();
    const scores = [
      { ...fixture.scores[0], score: .64 },
      { ...fixture.scores[1], score: .26 },
      { ...fixture.scores[2], score: .1 },
    ];
    const result = { ...fixture, scores, uncertainty: { ...fixture.uncertainty, threshold: .1, margin: .54 } };
    expect(AnalysisSchema.safeParse(result).success).toBe(true);
    expect(buildConditionAwareRoutine(preferences(), result).decision.status).toBe("general_only");
  });

  it("recomputes score separation rather than accepting a forged reported high margin", () => {
    const fixture = clinicalFixture();
    const result = { ...fixture, uncertainty: { ...fixture.uncertainty, margin: .99 } };
    expect(AnalysisSchema.safeParse(result).success).toBe(true);
    expect(buildConditionAwareRoutine(preferences(), result).decision.status).toBe("general_only");
  });

  it("accepts canonical threshold equality and rejects a stricter declared threshold or rejection reasons", () => {
    expect(CONDITION_MATCHING_MIN_SCORE).toBe(.65);
    expect(CONDITION_MATCHING_MIN_MARGIN).toBe(.15);
    const fixture = clinicalFixture();
    const scores = [{ ...fixture.scores[0], score: .65 }, { ...fixture.scores[1], score: .25 }, { ...fixture.scores[2], score: .1 }];
    const accepted = { ...fixture, scores, uncertainty: { ...fixture.uncertainty, threshold: .65, margin: .4 } };
    expect(buildConditionAwareRoutine(preferences(), accepted).decision.status).toBe("condition_matched");
    expect(buildConditionAwareRoutine(preferences(), { ...accepted, uncertainty: { ...accepted.uncertainty, threshold: .66 } }).decision.status).toBe("general_only");
    expect(buildConditionAwareRoutine(preferences(), { ...fixture, uncertainty: { ...fixture.uncertainty, reasons: ["Contradictory rejection reason"] } }).decision.status).toBe("general_only");
  });

  it("does not depend on score-array order and accepts a consistent reported margin", () => {
    const fixture = clinicalFixture();
    const result = { ...fixture, scores: [...fixture.scores].reverse(), uncertainty: { ...fixture.uncertainty, threshold: .65, margin: .7 } };
    expect(buildConditionAwareRoutine(preferences(), result).decision.status).toBe("condition_matched");
    expect(buildConditionAwareRoutine(preferences(), result).routine.steps[1].product?.id).toBe("vanicream-daily-moisturizer");
  });

  it("explains sensitivity and purchasing priority without claiming tolerance or treatment effectiveness", () => {
    const minimal = buildConditionAwareRoutine(preferences({ sensitivity: "yes", budget: "minimal" }), clinicalFixture());
    expect(minimal.decision.reasons.join(" ")).toContain("sensitivity is reported or unknown");
    expect(minimal.decision.reasons.join(" ")).toContain("sunscreen contains aloe");
    expect(minimal.decision.reasons.join(" ")).toContain("dollar cap applies to dated prices");
    const flexible = buildConditionAwareRoutine(preferences({ sensitivity: "no", budget: "flexible" }), clinicalFixture());
    expect(flexible.decision.reasons.join(" ")).toContain("does not predict tolerance");
    expect(flexible.decision.reasons.join(" ")).toContain("flexible purchasing priority");
  });

  it.each(["unsupported", "unavailable", "quality_rejected"])("abstains when status is %s", status => {
    const fixture = clinicalFixture();
    const output = buildConditionAwareRoutine(preferences(), { ...fixture, status, scores: [], quality: null, uncertainty: null, explanation: null });
    expect(output.decision.status).toBe("general_only");
    expect(output.routine).toEqual(buildSkincareRoutine(preferences()));
  });

  it.each(["version", "input_size", "supported_image_type", "classes"])("abstains if the clinical identity's %s changes", field => {
    const fixture = clinicalFixture();
    const replacements = { version: "unreviewed-version", input_size: 28, supported_image_type: "smartphone", classes: CLASSES.map(item => ({ ...item, label: "Different label" })) };
    const model = { ...fixture.model, [field]: replacements[field as keyof typeof replacements] };
    const output = buildConditionAwareRoutine(preferences(), { ...fixture, model });
    expect(output.decision.status).toBe("general_only");
    expect(output.decision.conditionId).toBeUndefined();
  });

  it("rejects contradictory availability, uncertainty and quality states", () => {
    const fixture = clinicalFixture();
    const invalid = [
      { ...fixture, model: { ...fixture.model, available: false } },
      { ...fixture, uncertainty: { ...fixture.uncertainty, rejected: true } },
      { ...fixture, uncertainty: null },
      { ...fixture, quality: null },
      { ...fixture, quality: { ...fixture.quality, passed: false } },
      { ...fixture, quality: { ...fixture.quality, issues: [{ code: "bad", severity: "error", message: "Synthetic error fixture" }] } },
    ];
    for (const result of invalid) expect(buildConditionAwareRoutine(preferences(), result).decision.status).toBe("general_only");
  });

  it("does not act on malformed data, duplicate classes, mismatched labels or invalid scores", () => {
    const fixture = clinicalFixture();
    const invalid = [
      "acne", {}, { disease: "acne" },
      { ...fixture, scores: [] },
      { ...fixture, scores: fixture.scores.map(score => ({ ...score, score: Number.NaN })) },
      { ...fixture, scores: fixture.scores.map(score => ({ ...score, score: .9 })) },
      { ...fixture, scores: fixture.scores.map(score => ({ ...score, label: "Forged label" })) },
      { ...fixture, model: { ...fixture.model, classes: [CLASSES[0], CLASSES[0], CLASSES[2]] } },
    ];
    for (const result of invalid) {
      const output = buildConditionAwareRoutine(preferences(), result);
      expect(output.decision.status).toBe("general_only");
      expect(output.routine).toEqual(buildSkincareRoutine(preferences()));
    }
  });

  it("keeps dermoscopic lesion outputs review-first and never uses their labels to choose products", () => {
    const manifest = JSON.parse(readFileSync("public/model/manifest.json", "utf8"));
    const input = preferences({ skinFeel: "oily", sensitivity: "no" });
    for (const top of manifest.classes) {
      const result = { ...clinicalFixture(), model: manifest, scores: manifest.classes.map((item: { id: string; label: string }) => ({ ...item, score: item.id === top.id ? .7 : .05 })) };
      expect(AnalysisSchema.safeParse(result).success).toBe(true);
      const output = buildConditionAwareRoutine(input, result);
      expect(output.decision.status).toBe("review_first");
      expect(output.decision.conditionId).toBeUndefined();
      expect(output.routine.steps).toEqual(buildSkincareRoutine(input).steps);
      expect(output.decision.explanation).toContain("no lesion label changes product ranking");
    }
  });

  it("includes provenance, professional-review guidance and individual-tolerance limitations", () => {
    const output = buildConditionAwareRoutine(preferences(), clinicalFixture("dermatitis"));
    expect(output.routine.references.some(source => source.url.includes("atopic-dermatitis"))).toBe(true);
    expect(output.routine.references.some(source => source.url.endsWith("rash-101"))).toBe(true);
    const notes = output.routine.notes.join(" ");
    expect(notes).toContain("not clinically validated treatment");
    expect(notes).toContain("multiple possible causes");
    expect(notes).toContain("do not guarantee allergy safety");
    expect(notes).toContain("emergency care");
    expect(notes).toContain("seven to ten days");
    expect(notes).toContain("US manufacturer");
    expect(notes).toContain("No affiliate links or checkout");
    expect(notes).toContain("Ingredient filters cover fragrance, niacinamide and oat only");
    expect(notes).toContain("not a medical effectiveness score");
    expect(notes).not.toContain("not the image or the model category");
  });

  it("rejects malformed survey preferences instead of bypassing explicit restrictions", () => {
    expect(() => buildConditionAwareRoutine({ ...preferences(), avoid: ["unknown"] } as unknown as SkincarePreferences, clinicalFixture())).toThrow();
    expect(() => buildConditionAwareRoutine({ ...preferences(), owned: ["cleanser", "cleanser"] } as SkincarePreferences, clinicalFixture())).toThrow();
  });

  it("is deterministic and does not mutate preferences, results, catalog, offers or earlier outputs", () => {
    const input = preferences({ avoid: ["oat", "fragrance"] });
    const result = clinicalFixture("dermatitis");
    const before = JSON.stringify({ input, result, catalog: SKINCARE_PRODUCT_CATALOG });
    const first = buildConditionAwareRoutine(input, result);
    const second = buildConditionAwareRoutine(input, result);
    expect(second).toEqual(first);
    first.routine.steps[1].product!.name = "Mutated locally";
    first.routine.steps[1].product!.offer!.priceCents = 1;
    first.routine.references[0].title = "Mutated locally";
    first.decision.source!.title = "Mutated locally";
    expect(buildConditionAwareRoutine(input, result)).toEqual(second);
    expect(JSON.stringify({ input, result, catalog: SKINCARE_PRODUCT_CATALOG })).toBe(before);
  });
});
