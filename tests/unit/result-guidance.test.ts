import { describe, expect, it } from "vitest";
import { buildResultGuidance } from "@/lib/result-guidance";
import { AnalysisSchema, type AnalyzeResponse } from "@/lib/types";

// Synthetic transport fixtures exercise guidance routing, not model accuracy.
const classes = [
  { id: "akiec", label: "Actinic keratosis / intraepithelial carcinoma" },
  { id: "bcc", label: "Basal cell carcinoma" },
  { id: "bkl", label: "Benign keratosis-like lesions" },
  { id: "df", label: "Dermatofibroma" },
  { id: "mel", label: "Melanoma" },
  { id: "nv", label: "Melanocytic nevi" },
  { id: "vasc", label: "Vascular lesions" },
];

function assessed(id = "nv"): AnalyzeResponse {
  return {
    status: "assessed", message: "Synthetic transport fixture",
    model: { version: "test-only", architecture: "test-only", supported_image_type: "dermoscopic", input_size: 28, available: true, classes: classes.map(item => ({ ...item })) },
    scores: classes.map(item => ({ ...item, score: item.id === id ? 0.94 : 0.01 })),
    quality: { width: 28, height: 28, blur_variance: 20, brightness: 0.5, underexposed_fraction: 0, overexposed_fraction: 0, issues: [], passed: true },
    uncertainty: { rejected: false, reasons: [], score_type: "temperature_scaled_model_score" },
    explanation: null, next_step: "Test only",
  };
}

describe("non-diagnostic result-aware education", () => {
  it("returns no image-specific context for the standalone planner", () => {
    expect(buildResultGuidance()).toBeNull();
    expect(buildResultGuidance(null)).toBeNull();
  });

  it.each(classes)("links valid assessed $id output to qualified education", ({ id }) => {
    const result = assessed(id);
    expect(AnalysisSchema.safeParse(result).success).toBe(true);
    const guide = buildResultGuidance(result)!;
    expect(guide.labelId).toBe(id);
    expect(guide.title).toContain("model label");
    expect(guide.description).toMatch(/cannot|does not|not a confirmed/);
    expect(guide.nextStep).toMatch(/professional|clinician/);
    expect(new URL(guide.source.url).hostname).toBe("www.aad.org");
    expect(guide.source.title).toContain("American Academy of Dermatology");
  });

  it("uses the highest score even when the scores and class mapping are unsorted", () => {
    const result = assessed("bcc");
    result.scores.reverse();
    result.model.classes.reverse();
    expect(buildResultGuidance(result)?.labelId).toBe("bcc");
  });

  it("never treats an uncertain high score as an assessed label", () => {
    const result = assessed("mel");
    result.status = "uncertain";
    result.uncertainty!.rejected = true;
    const guide = buildResultGuidance(result)!;
    expect(guide).not.toHaveProperty("labelId");
    expect(guide.title).toContain("Unable to assess");
    expect(guide.description).toContain("uncertainty rule rejected");
    expect(guide.description).not.toContain("Melanoma");
  });

  it.each(["unsupported", "unavailable", "quality_rejected"] as const)("provides generic guidance for %s without fabricated predictions", status => {
    const result = { ...assessed("mel"), status, scores: [], explanation: null, uncertainty: null };
    expect(AnalysisSchema.safeParse(result).success).toBe(true);
    expect(buildResultGuidance(result)).not.toHaveProperty("labelId");
    expect(buildResultGuidance(result)?.title).toContain("Unable to assess");
  });

  it("explains domain and retake limitations without implying suitability", () => {
    const base = { ...assessed(), scores: [], uncertainty: null };
    expect(buildResultGuidance({ ...base, status: "unsupported" })?.description).toContain("cannot identify acne, rosacea, eczema or your skin type from a selfie");
    expect(buildResultGuidance({ ...base, status: "quality_rejected" })?.description).toContain("does not establish clinical suitability");
  });

  it.each([
    ["contradictory rejection", (value: AnalyzeResponse) => { value.uncertainty!.rejected = true; }],
    ["unavailable model", (value: AnalyzeResponse) => { value.model.available = false; }],
    ["failed quality", (value: AnalyzeResponse) => { value.quality!.passed = false; }],
    ["missing quality", (value: AnalyzeResponse) => { value.quality = null; }],
    ["missing uncertainty", (value: AnalyzeResponse) => { value.uncertainty = null; }],
    ["empty scores", (value: AnalyzeResponse) => { value.scores = []; }],
    ["nonfinite score", (value: AnalyzeResponse) => { value.scores[0].score = Number.NaN; }],
    ["duplicate scores", (value: AnalyzeResponse) => { value.scores[1] = { ...value.scores[0] }; }],
    ["invalid sum", (value: AnalyzeResponse) => { value.scores[0].score = 0.5; }],
  ] as const)("fails closed for %s", (_name, alter) => {
    const result = assessed("mel");
    alter(result);
    expect(buildResultGuidance(result)).not.toHaveProperty("labelId");
    expect(buildResultGuidance(result)?.description).toContain("could not be validated");
  });

  it.each([
    ["unknown class", (value: AnalyzeResponse) => { value.model.classes[0] = { id: "acne", label: "Acne" }; value.scores[0] = { ...value.model.classes[0], score: value.scores[0].score }; }],
    ["renamed known class", (value: AnalyzeResponse) => { value.model.classes[0].label = "Acne"; value.scores[0].label = "Acne"; }],
    ["smartphone model", (value: AnalyzeResponse) => { value.model.supported_image_type = "smartphone"; }],
    ["different resolution", (value: AnalyzeResponse) => { value.model.input_size = 224; }],
    ["unspecified resolution", (value: AnalyzeResponse) => { delete value.model.input_size; }],
  ] as const)("does not transfer guidance to a schema-valid %s", (_name, alter) => {
    const result = assessed("mel");
    alter(result);
    expect(AnalysisSchema.safeParse(result).success).toBe(true);
    expect(buildResultGuidance(result)).not.toHaveProperty("labelId");
    expect(buildResultGuidance(result)?.description).toContain("does not match");
  });

  it.each([{}, "mel", 42, false])("handles malformed input %s without throwing or assigning a label", value => {
    expect(buildResultGuidance(value)?.title).toContain("Unable to assess");
    expect(buildResultGuidance(value)).not.toHaveProperty("labelId");
  });

  it("does not reassure on benign-sounding labels or mutate shared guidance and input", () => {
    const result = assessed("bkl");
    const original = JSON.stringify(result);
    const first = buildResultGuidance(result)!;
    expect(first.description).toContain("does not prove this spot is benign");
    expect(buildResultGuidance(assessed("nv"))?.description).toContain("cannot establish that a spot is benign");
    first.source.url = "https://example.com";
    first.title = "Changed locally";
    expect(buildResultGuidance(result)?.source.url).toContain("www.aad.org");
    expect(buildResultGuidance(result)?.title).not.toBe(first.title);
    expect(JSON.stringify(result)).toBe(original);
  });
});
