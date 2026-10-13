import { describe, expect, it } from "vitest";
import { ClinicalManifestSchema, assessClinicalQuality } from "@/lib/browser-clinical-inference";
import { normalizePixels, resizeNearest } from "@/lib/browser-inference";
import { CLINICAL_CLASSES, CLINICAL_MODEL_VERSION } from "@/lib/clinical-task";

// Synthetic transport fixture only: it supplies no live predictions or weights.
const fixture = {
  version: CLINICAL_MODEL_VERSION, architecture: "test contract", input_size: 128,
  supported_image_type: "clinical_photo", available: true, classes: [...CLINICAL_CLASSES],
  preprocessing: { mean: [.485, .456, .406], std: [.229, .224, .225], resize: "nearest" },
  temperature: 1, uncertainty: { max_score_threshold: .65, margin_threshold: .15 },
  readiness: { passed: true, clinical_validation: false, independent_holdout: true, benchmark_minimums_passed: true, blocked_by_previously_examined_test: false, minimums: { macro_f1: .6, balanced_accuracy: .6, acne_recall: .5, dermatitis_recall: .5 }, measured: { macro_f1: .7, balanced_accuracy: .7, acne_recall: .6, dermatitis_recall: .6 } },
  onnx: { url: "/model-clinical/model.onnx", sha256: "0".repeat(64), input_name: "image", logits_output: "logits", activations_output: "activations" },
  classifier_weights: Array.from({ length: 3 }, () => Array(576).fill(0)),
};

describe("clinical-photo task integrity", () => {
  it("rejects wrong domains, versions, class order, tensor shapes, hashes and unavailable artifacts", () => {
    expect(ClinicalManifestSchema.safeParse(fixture).success).toBe(true);
    for (const invalid of [
      { ...fixture, available: false }, { ...fixture, version: "unreviewed" },
      { ...fixture, input_size: 28 }, { ...fixture, supported_image_type: "dermoscopic" },
      { ...fixture, classes: [...fixture.classes].reverse() },
      { ...fixture, classifier_weights: [[0], [0], [0]] },
      { ...fixture, onnx: { ...fixture.onnx, url: "https://example.com/model.onnx" } },
      { ...fixture, onnx: { ...fixture.onnx, sha256: "bad" } },
      { ...fixture, readiness: { ...fixture.readiness, passed: false } },
      { ...fixture, readiness: { ...fixture.readiness, measured: { ...fixture.readiness.measured, acne_recall: .1 } } },
      { ...fixture, uncertainty: { max_score_threshold: .5, margin_threshold: .1 } },
      { ...fixture, readiness: { ...fixture.readiness, independent_holdout: false } },
    ]) expect(ClinicalManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it("builds a full-image 128px ImageNet-normalized NCHW tensor, compositing transparency", () => {
    const rgb = resizeNearest(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]), 2, 1, 128);
    const tensor = normalizePixels(rgb, fixture.preprocessing.mean, fixture.preprocessing.std);
    expect(tensor.length).toBe(3 * 128 * 128);
    expect(tensor[0]).toBeCloseTo(-.485 / .229);
    expect(tensor[64]).toBeCloseTo((1 - .485) / .229);
    expect(tensor[128 * 128]).toBeCloseTo(-.456 / .224);
    expect(tensor[2 * 128 * 128 + 64]).toBeCloseTo((1 - .406) / .225);
  });

  it("requires 128 original pixels in both directions even if the resized tensor has detail", () => {
    const checker = new Float32Array(28 * 28 * 3);
    for (let i = 0; i < 28 * 28; i++) checker.set(Array(3).fill(i % 2 ? 90 : 170), i * 3);
    const small = assessClinicalQuality(checker, 127, 300);
    expect(small.passed).toBe(false);
    expect(small.issues).toContainEqual(expect.objectContaining({ code: "clinical_resolution", severity: "error" }));
    expect(small.issues.some(issue => issue.message.includes("uses only 28"))).toBe(false);
    expect(assessClinicalQuality(checker, 128, 300).passed).toBe(true);
  });

  it("rejects dark, blank and overexposed photos without establishing medical suitability", () => {
    for (const value of [0, 255]) {
      const quality = assessClinicalQuality(new Float32Array(28 * 28 * 3).fill(value), 512, 512);
      expect(quality.passed).toBe(false);
      expect(quality.issues.some(issue => issue.code === "blur")).toBe(true);
    }
  });
});
