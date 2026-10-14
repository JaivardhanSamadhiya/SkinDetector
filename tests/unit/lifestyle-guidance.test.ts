import { describe, expect, it } from "vitest";
import type { CareDecision } from "@/lib/condition-aware-routine";
import { buildConditionAwareRoutine } from "@/lib/condition-aware-routine";
import { buildLifestyleGuidance } from "@/lib/lifestyle-guidance";
import { DEFAULT_SKINCARE_PREFERENCES, type SkincarePreferences } from "@/lib/skincare-preferences";

const preferences = (overrides: Partial<SkincarePreferences> = {}): SkincarePreferences => ({
  ...DEFAULT_SKINCARE_PREFERENCES, avoid: [], owned: [], ...overrides,
});

// Policy fixtures, never model predictions or evidence of classifier accuracy.
const decision = (overrides: Partial<CareDecision> = {}): CareDecision => ({
  status: "general_only", title: "Test", explanation: "Test", reasons: [], ...overrides,
});

describe("evidence-linked lifestyle guidance", () => {
  it("uses preferences only when there is no accepted appearance", () => {
    for (const input of [undefined, null, decision()]) {
      const output = buildLifestyleGuidance(preferences(), input);
      expect(output.basis).toBe("preferences_only");
      expect(output.tips.some(tip => tip.basis === "accepted_appearance")).toBe(false);
      expect(output.explanation).toContain("No accepted image category");
    }
  });

  it("keeps an unavailable or invalid image result out of appearance-specific habits", () => {
    const policy = buildConditionAwareRoutine(preferences(), { status: "model_unavailable", scores: [] });
    const output = buildLifestyleGuidance(preferences(), policy.decision);
    expect(output.basis).toBe("preferences_only");
    expect(output.tips.map(tip => tip.id)).not.toContain("acne-gentle-habits");
    expect(output.tips.map(tip => tip.id)).not.toContain("dermatitis-comfort");
  });

  it("does not use a condition ID attached to a general-only decision", () => {
    const output = buildLifestyleGuidance(preferences(), decision({ conditionId: "acne" }));
    expect(output.basis).toBe("preferences_only");
    expect(output.tips.every(tip => tip.basis !== "accepted_appearance")).toBe(true);
  });

  it("keeps professional review first for lesion decisions without adding disease habits", () => {
    const output = buildLifestyleGuidance(preferences(), decision({ status: "review_first", conditionId: "acne" }));
    expect(output.basis).toBe("review_first");
    expect(output.explanation).toContain("Professional evaluation takes priority");
    expect(output.tips.every(tip => tip.basis !== "accepted_appearance")).toBe(true);
    expect(output.review.action).toContain("Do not wait");
    expect(output.review.source.url).toContain("skin-cancer");
  });

  it("adds supported acne habits only to an accepted acne-like decision", () => {
    const output = buildLifestyleGuidance(preferences(), decision({ status: "condition_matched", conditionId: "acne" }));
    expect(output.basis).toBe("accepted_appearance");
    expect(output.tips[0].id).toBe("acne-gentle-habits");
    expect(output.tips[0].basis).toBe("accepted_appearance");
    expect(output.tips[0].reason).toContain("does not confirm acne");
    expect(output.tips.map(tip => tip.id)).not.toContain("dermatitis-comfort");
  });

  it("does not present broad dermatitis as confirmed eczema", () => {
    const output = buildLifestyleGuidance(preferences({ skinFeel: "dry" }), decision({ status: "condition_matched", conditionId: "dermatitis" }));
    expect(output.tips[0].id).toBe("dermatitis-comfort");
    expect(output.tips[0].reason).toContain("does not confirm eczema");
    expect(output.tips.filter(tip => tip.id === "dry-feel-comfort")).toHaveLength(0);
  });

  it("does not infer a disease from dry-feeling skin in the survey", () => {
    const output = buildLifestyleGuidance(preferences({ skinFeel: "dry" }));
    expect(output.basis).toBe("preferences_only");
    expect(output.tips[0].id).toBe("dry-feel-comfort");
    expect(output.tips[0].basis).toBe("survey");
    expect(output.tips[0].reason).toContain("does not identify why");
    expect(output.tips.some(tip => tip.basis === "accepted_appearance")).toBe(false);
  });

  it("does not invent a condition for an incomplete accepted decision", () => {
    const output = buildLifestyleGuidance(preferences(), decision({ status: "condition_matched" }));
    expect(output.basis).toBe("preferences_only");
    expect(output.tips.every(tip => tip.basis !== "accepted_appearance")).toBe(true);
  });

  it("shows the source of sensitivity guidance without promising allergy safety", () => {
    for (const sensitivity of ["yes", "no", "unsure"] as const) {
      const tip = buildLifestyleGuidance(preferences({ sensitivity })).tips.find(item => item.id === "introduce-carefully")!;
      expect(tip.basis).toBe("survey");
      expect(tip.action).toContain("cannot rule out allergy");
      expect(tip.reason).toContain(sensitivity === "yes" ? "reported sensitivity" : sensitivity === "no" ? "reported no sensitivity" : "unsure about sensitivity");
    }
  });

  it("reuses owned basics without approving unseen formulas or prescribing extra purchases", () => {
    const output = buildLifestyleGuidance(preferences({ owned: ["cleanser", "moisturizer"], budget: "flexible" }));
    const tip = output.tips.find(item => item.id === "keep-it-simple")!;
    expect(tip.reason).toContain("cleanser, moisturizer");
    expect(tip.reason).toContain("has not inspected");
    expect(tip.action).toContain("do not need to buy every alternative");
  });

  it("links every habit and review notice to HTTPS primary AAD guidance", () => {
    const outputs = [
      buildLifestyleGuidance(preferences({ skinFeel: "dry" })),
      buildLifestyleGuidance(preferences(), decision({ status: "condition_matched", conditionId: "acne" })),
      buildLifestyleGuidance(preferences(), decision({ status: "condition_matched", conditionId: "dermatitis" })),
      buildLifestyleGuidance(preferences(), decision({ status: "review_first" })),
    ];
    for (const output of outputs) {
      expect(new Set(output.tips.map(tip => tip.id)).size).toBe(output.tips.length);
      for (const source of [...output.tips.map(tip => tip.source), output.review.source]) {
        expect(new URL(source.url).origin).toBe("https://www.aad.org");
      }
    }
  });

  it("rejects invalid preferences rather than inventing answers", () => {
    expect(() => buildLifestyleGuidance({ ...preferences(), skinFeel: "eczema" } as unknown as SkincarePreferences)).toThrow();
  });
});
