import { describe, expect, it } from "vitest";
import { assessBrowserQuality, normalizePixels, resizeNearest, temperatureScores } from "@/lib/browser-inference";

describe("browser model preprocessing", () => {
  it("samples source pixel centers and composites transparency against white", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]);
    const resized = resizeNearest(rgba, 2, 2, 4);
    expect(Array.from(resized.slice(0, 3))).toEqual([255, 0, 0]);
    expect(Array.from(resized.slice(9, 12))).toEqual([0, 255, 0]);
    expect(Array.from(resized.slice(36, 39))).toEqual([0, 0, 255]);
    expect(Array.from(resized.slice(45, 48))).toEqual([255, 255, 255]);
  });

  it("normalizes RGB to deterministic NCHW channel order", () => {
    const pixels = new Float32Array([0, 127.5, 255, 255, 0, 127.5]);
    expect(Array.from(normalizePixels(pixels, [.5, .5, .5], [.25, .25, .25]))).toEqual([-2, 2, 0, -2, 2, 0]);
  });

  it("rejects flat dark and blown-out views while describing why", () => {
    const dark = assessBrowserQuality(new Float32Array(28 * 28 * 3), 280, 280);
    expect(dark.passed).toBe(false);
    expect(dark.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["blur", "underexposure"]));
    const white = assessBrowserQuality(new Float32Array(28 * 28 * 3).fill(255), 280, 280);
    expect(white.passed).toBe(false);
    expect(white.issues.map(issue => issue.code)).toContain("overexposure");
  });

  it("detects insufficient original resolution even with a correctly sized model tensor", () => {
    const checker = new Float32Array(28 * 28 * 3);
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
      const value = (x + y) % 2 ? 90 : 170;
      checker.set([value, value, value], (y * 28 + x) * 3);
    }
    expect(assessBrowserQuality(checker, 27, 28).issues).toContainEqual(expect.objectContaining({ code: "resolution", severity: "error" }));
    expect(assessBrowserQuality(checker, 280, 280).passed).toBe(true);
  });
});

describe("model score transformation", () => {
  it("uses validated temperature and numerically stable normalization", () => {
    expect(temperatureScores([0, Math.log(3)], 1)[1]).toBeCloseTo(.75);
    const scores = temperatureScores([1000, 1001, 1002], 1.7);
    expect(scores.every(Number.isFinite)).toBe(true);
    expect(scores.reduce((sum, score) => sum + score, 0)).toBeCloseTo(1);
    expect(scores[2]).toBeGreaterThan(scores[1]);
    expect(temperatureScores([0, Math.log(3)], 2)[1]).toBeLessThan(.75);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid temperature %s", (temperature) => {
    expect(() => temperatureScores([0, 1], temperature)).toThrow(/Invalid model output/);
  });

  it("rejects non-finite logits", () => {
    expect(() => temperatureScores([0, Number.NaN], 1)).toThrow();
  });
});
