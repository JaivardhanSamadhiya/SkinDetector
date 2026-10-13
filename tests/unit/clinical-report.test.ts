import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ClinicalReportSchema } from "@/components/research-dashboard";
import { ClinicalManifestSchema } from "@/lib/browser-clinical-inference";

const report = JSON.parse(readFileSync("public/model-clinical/evaluation.json", "utf8"));
const manifest = JSON.parse(readFileSync("public/model-clinical/manifest.json", "utf8"));

describe("actual clinical research evidence and release gate", () => {
  it("validates the executed corrected experiment without calling its reused test independent", () => {
    const parsed = ClinicalReportSchema.parse(report);
    expect(parsed.independent_holdout).toBe(false);
    expect(parsed.post_audit_test_overlap).toBe(129);
    expect(parsed.readiness.passed).toBe(false);
    expect(parsed.test.selective.total).toBe(148);
    expect(parsed.test.per_class.acne.recall).toBeCloseTo(1 / 9);
    expect(ClinicalManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects fabricated report totals, changed engineering minimums and release flags", () => {
    for (const changed of [
      { ...report, readiness: { ...report.readiness, passed: true } },
      { ...report, readiness: { ...report.readiness, minimums: { ...report.readiness.minimums, macro_f1: .2 } } },
      { ...report, test: { ...report.test, selective: { ...report.test.selective, total: 1000 } } },
      { ...report, independent_holdout: true },
    ]) expect(ClinicalReportSchema.safeParse(changed).success).toBe(false);
  });

  it("cannot enable the real failed artifact by changing availability or suppressing audit flags", () => {
    expect(ClinicalManifestSchema.safeParse({ ...manifest, available: true }).success).toBe(false);
    expect(ClinicalManifestSchema.safeParse({ ...manifest, available: true, readiness: { ...manifest.readiness, passed: true, independent_holdout: true, blocked_by_previously_examined_test: false, benchmark_minimums_passed: true } }).success).toBe(false);
  });
});
