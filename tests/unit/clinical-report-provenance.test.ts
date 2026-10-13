import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ClinicalReportSchema } from "@/components/research-dashboard";

const correctedReport = JSON.parse(readFileSync(new URL("../../public/model-clinical/evaluation.json", import.meta.url), "utf8"));
const fixture = () => structuredClone(correctedReport);

describe("clinical research report provenance", () => {
  it("accepts the corrected exploratory report while keeping release unavailable", () => {
    const report = ClinicalReportSchema.parse(fixture());
    expect(report.independent_holdout).toBe(false);
    expect(report.post_audit_test_overlap).toBeGreaterThan(0);
    expect(report.readiness.passed).toBe(false);
    expect(report.readiness.blocked_by_previously_examined_test).toBe(true);
  });

  it("rejects a report that omits the test-reuse disclosure", () => {
    const report = fixture();
    delete report.independent_holdout;
    delete report.post_audit_test_overlap;
    delete report.audit_correction;
    expect(ClinicalReportSchema.safeParse(report).success).toBe(false);
  });

  it("rejects a false independent-holdout claim when examined cases overlap", () => {
    const report = fixture();
    report.independent_holdout = true;
    report.readiness.independent_holdout = true;
    expect(ClinicalReportSchema.safeParse(report).success).toBe(false);
  });

  it("rejects release availability that ignores numeric failure or test reuse", () => {
    const report = fixture();
    report.readiness.passed = true;
    expect(ClinicalReportSchema.safeParse(report).success).toBe(false);
  });

  it("rejects readiness metadata that contradicts the corrected report", () => {
    const report = fixture();
    report.readiness.post_audit_test_overlap = 0;
    expect(ClinicalReportSchema.safeParse(report).success).toBe(false);
  });
});
