import { describe, expect, it } from "vitest";
import { AnalysisSchema } from "@/lib/types";

// This fixture tests transport validation only. It is never a live model response.
const unavailable = {
  status: "unavailable",
  message: "Model artifact unavailable",
  model: { version: "test-only", architecture: "test fixture", supported_image_type: "dermoscopic", classes: [], available: false },
  scores: [], quality: null, uncertainty: null, explanation: null,
  next_step: "A research model must be installed before inference.",
};

describe("analysis transport schema", () => {
  it("accepts an honest unavailable response without scores or explanations", () => {
    expect(AnalysisSchema.parse(unavailable).status).toBe("unavailable");
  });

  it("rejects malformed payloads instead of rendering unvalidated data", () => {
    expect(AnalysisSchema.safeParse({ ...unavailable, status: "diagnosed" }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...unavailable, model: undefined }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...unavailable, next_step: 42 }).success).toBe(false);
  });

  it("rejects scores in a no-classification state and incomplete assessed outputs", () => {
    expect(AnalysisSchema.safeParse({ ...unavailable, scores: [{ id: "nv", label: "Test fixture", score: 1 }] }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...unavailable, status: "assessed" }).success).toBe(false);
  });

  it("validates the class mapping using recorded genuine inference scores", async () => {
    const { readFileSync } = await import("node:fs");
    const report = JSON.parse(readFileSync("models/browser_parity.json", "utf8"));
    const manifest = JSON.parse(readFileSync("public/model/manifest.json", "utf8"));
    for (const sample of report.samples) {
      const valid = { ...unavailable, status: sample.status, model: manifest, scores: sample.scores, quality: { width: 28, height: 28, blur_variance: 20, brightness: .5, underexposed_fraction: 0, overexposed_fraction: 0, issues: [], passed: true }, uncertainty: { rejected: sample.status === "uncertain", reasons: [], score_type: "temperature_scaled_model_score" } };
      expect(AnalysisSchema.safeParse(valid).success).toBe(true);
      expect(AnalysisSchema.safeParse({ ...valid, status: "assessed", uncertainty: { ...valid.uncertainty, rejected: true } }).success).toBe(false);
    }
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid score %s", (score) => {
    expect(AnalysisSchema.safeParse({ ...unavailable, scores: [{ id: "nv", label: "Test fixture", score }] }).success).toBe(false);
  });
});
