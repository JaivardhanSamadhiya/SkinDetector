import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PhotoEvaluationSchema, PhotoMetricsSchema } from "@/lib/photo-evaluation-schema";
import { PHOTO_MODEL_VERSION } from "@/lib/clinical-task";

const labels = ["acne", "dermatitis", "other"] as const;
// Entirely synthetic arithmetic fixtures for report integrity. These values are
// never loaded by the website, used as model predictions, or claimed as evidence.
function metrics(matrix: number[][]) {
  const support = matrix.map(row => row.reduce((sum, value) => sum + value, 0));
  const n = support.reduce((sum, value) => sum + value, 0);
  const entries = labels.map((label, index) => {
    const tp = matrix[index][index];
    const predicted = matrix.reduce((sum, row) => sum + row[index], 0);
    const precision = predicted ? tp / predicted : 0;
    const recall = support[index] ? tp / support[index] : 0;
    return [label, { precision, recall, "f1-score": precision + recall ? 2 * precision * recall / (precision + recall) : 0, support: support[index] }] as const;
  });
  const per_class = Object.fromEntries(entries) as Record<typeof labels[number], { precision: number; recall: number; "f1-score": number; support: number }>;
  return {
    n, confusion_matrix: matrix,
    accuracy: matrix.reduce((sum, row, index) => sum + row[index], 0) / n,
    macro_f1: entries.reduce((sum, [, value]) => sum + value["f1-score"], 0) / 3,
    balanced_accuracy: entries.filter(([, value]) => value.support).reduce((sum, [, value]) => sum + value.recall, 0) / entries.filter(([, value]) => value.support).length,
    per_class, ece_10: .05, brier_multiclass: .25, nll: .6,
  };
}

function fixture() {
  const SCIN = metrics([[0, 0, 0], [3, 30, 7], [4, 6, 50]]);
  const fitz = metrics([[32, 4, 4], [4, 30, 6], [5, 5, 50]]);
  const combined = metrics(SCIN.confusion_matrix.map((row, i) => row.map((value, j) => value + fitz.confusion_matrix[i][j])));
  const minimums = { macro_f1: .6, balanced_accuracy: .6, acne_recall: .5, dermatitis_recall: .5 };
  return {
    version: PHOTO_MODEL_VERSION, backbone: "dinov2_vits14", head: "linear", head_C: .1, gamma: null as number | null, temperature: 1.25,
    test: combined, test_group_support: { acne: 35, dermatitis: 60, other: 100 }, source_test: { SCIN, "Fitzpatrick17k-C": fitz },
    validation: structuredClone(combined), source_validation: structuredClone({ SCIN, "Fitzpatrick17k-C": fitz }),
    readiness: {
      passed: true, benchmark_minimums_passed: true, minimums: { ...minimums },
      measured: { macro_f1: combined.macro_f1, balanced_accuracy: combined.balanced_accuracy, acne_recall: combined.per_class.acne.recall, dermatitis_recall: combined.per_class.dermatitis.recall },
      independent_holdout: true, blocked_by_previously_examined_test: false, clinical_validation: false,
      sufficient_supported_class_samples: true, scin_dermatitis_recall_minimum_passed: true,
    },
    selective: { count: 60, coverage: .25, accuracy: .9 as number | null },
    lock: {
      backbone: "dinov2_vits14", head_sha256: "a".repeat(64), cohort_sha256: "b".repeat(64), protocol_sha256: "c".repeat(64), preprocessing_sha256: "d".repeat(64),
      backbone_provenance: { name: "dinov2_vits14", sha256: "e".repeat(64), bytes: 123456, source_commit: "f".repeat(40), url: "https://dl.fbaipublicfiles.com/dinov2/dinov2_vits14/dinov2_vits14_pretrain.pth" },
    },
    protocol: {
      seed: 20261013, input_size: 224, backbones: ["dinov2_vits14", "dinov2_vitb14"], backbone_source_commit: "f".repeat(40),
      features: "Synthetic protocol description", preprocessing: "Synthetic preprocessing description",
      linear_C: [.01, .1, 1], rbf_C: [.1, 1], rbf_gamma: [.0003, .001], rbf_landmarks_per_class: 256,
      model_selection: "Validation macro-F1", training_views: "All train views", evaluation_views: "First case view", calibration: "Validation temperature grid",
      minimums: { ...minimums }, score_threshold: .65, margin_threshold: .15, additional_release_requirements: [],
      clinical_validation: false, patient_ids_available: false, test_policy: "Frozen test",
    },
    limitations: ["Synthetic fixture, not model performance evidence."],
  };
}

type Fixture = ReturnType<typeof fixture>;
function updateTestSources(value: Fixture, scin: number[][], fitz: number[][]) {
  value.source_test = { SCIN: metrics(scin), "Fitzpatrick17k-C": metrics(fitz) };
  value.test = metrics(scin.map((row, i) => row.map((n, j) => n + fitz[i][j])));
  value.readiness.measured = { macro_f1: value.test.macro_f1, balanced_accuracy: value.test.balanced_accuracy, acne_recall: value.test.per_class.acne.recall, dermatitis_recall: value.test.per_class.dermatitis.recall };
  value.selective.coverage = value.selective.count / value.test.n;
}

describe("photo evaluation measurements", () => {
  it("verifies the measured frozen model report without treating aggregate accuracy as product-matching evidence", () => {
    const recorded = JSON.parse(readFileSync(new URL("../../models/photo-v2/evaluation.json", import.meta.url), "utf8"));
    const report = PhotoEvaluationSchema.parse(recorded);
    expect(report.test.n).toBe(2356);
    expect(report.source_test.SCIN.per_class.acne.support).toBe(0);
    expect(report.selective.accuracy).toBeLessThan(.5);
    expect(report.readiness.clinical_validation).toBe(false);
  });

  it("preserves the real rejected int8 conversion as a distinct failed measurement", () => {
    const recorded = JSON.parse(readFileSync(new URL("../../models/photo-v2/onnx-evaluation.json", import.meta.url), "utf8"));
    const report = PhotoEvaluationSchema.parse(recorded);
    expect(report.test.n).toBe(2356);
    expect(report.readiness.passed).toBe(false);
    expect(report.deployment_validation?.quantized_benchmark_passed).toBe(false);
    expect(report.test.per_class.acne.recall).toBe(0);
  });

  it("validates a self-consistent synthetic report without requiring an exported artifact", () => {
    const report = PhotoEvaluationSchema.parse(fixture());
    expect(report.test.n).toBe(240);
    expect(report.test.accuracy).toBe(.8);
    expect(report.readiness.passed).toBe(true);
    expect(report.deployment_validation).toBeUndefined();
    expect(report.available).toBeUndefined();
  });

  it("preserves the SCIN acne evidence gap and sklearn absent-class metric definitions", () => {
    const scin = fixture().source_test.SCIN;
    expect(PhotoMetricsSchema.safeParse(scin).success).toBe(true);
    expect(scin.per_class.acne.support).toBe(0);
    expect(scin.per_class.acne.recall).toBe(0);
    expect(scin.balanced_accuracy).toBeCloseTo((30 / 40 + 50 / 60) / 2);
    expect(scin.macro_f1).toBeCloseTo((scin.per_class.dermatitis["f1-score"] + scin.per_class.other["f1-score"]) / 3);
  });

  it.each([
    ["count", (r: Fixture) => { r.test.n += 1; }],
    ["matrix", (r: Fixture) => { r.test.confusion_matrix[0][0] += 1; }],
    ["support", (r: Fixture) => { r.test.per_class.acne.support += 1; }],
    ["recall", (r: Fixture) => { r.test.per_class.acne.recall = 1; }],
    ["precision", (r: Fixture) => { r.test.per_class.acne.precision = 1; }],
    ["F1", (r: Fixture) => { r.test.per_class.acne["f1-score"] = 1; }],
    ["accuracy", (r: Fixture) => { r.test.accuracy = 1; }],
    ["macro-F1", (r: Fixture) => { r.test.macro_f1 = 1; }],
    ["balanced accuracy", (r: Fixture) => { r.test.balanced_accuracy = 1; }],
    ["calibration", (r: Fixture) => { r.test.nll = Number.NaN; }],
    ["source calibration", (r: Fixture) => { r.source_test.SCIN.brier_multiclass = 1; }],
    ["source sum", (r: Fixture) => { r.source_test.SCIN = structuredClone(r.source_test["Fitzpatrick17k-C"]); }],
  ])("rejects an inconsistent %s", (_name, mutate) => {
    const report = fixture(); mutate(report);
    expect(PhotoEvaluationSchema.safeParse(report).success).toBe(false);
  });

  it.each([
    ["declared measured recall", (r: Fixture) => { r.readiness.measured.acne_recall = .99; }],
    ["weakened minimum", (r: Fixture) => { r.readiness.minimums.macro_f1 = .4; }],
    ["wrong benchmark flag", (r: Fixture) => { r.readiness.benchmark_minimums_passed = false; }],
    ["wrong sample flag", (r: Fixture) => { r.readiness.sufficient_supported_class_samples = false; }],
    ["wrong SCIN flag", (r: Fixture) => { r.readiness.scin_dermatitis_recall_minimum_passed = false; }],
    ["too few groups with passed flag", (r: Fixture) => { r.test_group_support.acne = 29; }],
    ["groups greater than cases", (r: Fixture) => { r.test_group_support.acne = 100; }],
    ["contradictory holdout flags", (r: Fixture) => { r.readiness.blocked_by_previously_examined_test = true; }],
    ["unsupported clinical validity", (r: Fixture) => { r.readiness.clinical_validation = true; }],
    ["unexplained failed final gate", (r: Fixture) => { r.readiness.passed = false; }],
  ])("rejects %s", (_name, mutate) => {
    const report = fixture(); mutate(report);
    expect(PhotoEvaluationSchema.safeParse(report).success).toBe(false);
  });

  it("accepts an honest failure from too few groups without hiding measurements", () => {
    const report = fixture(); report.test_group_support.acne = 29;
    report.readiness.sufficient_supported_class_samples = false;
    report.readiness.passed = false;
    expect(PhotoEvaluationSchema.safeParse(report).success).toBe(true);
  });

  it("accepts an explicitly blocked reused test, preserving failed readiness", () => {
    const report = fixture(); report.readiness.independent_holdout = false;
    report.readiness.blocked_by_previously_examined_test = true;
    report.readiness.passed = false;
    expect(PhotoEvaluationSchema.safeParse(report).success).toBe(true);
  });

  it("rejects hidden poor SCIN dermatitis recall despite a passing pooled experiment", () => {
    const report = fixture();
    updateTestSources(report, [[0, 0, 0], [3, 15, 22], [4, 6, 50]], [[32, 4, 4], [0, 40, 0], [5, 5, 50]]);
    expect(report.test.per_class.dermatitis.recall).toBeGreaterThan(.5);
    expect(report.source_test.SCIN.per_class.dermatitis.recall).toBeLessThan(.5);
    expect(PhotoEvaluationSchema.safeParse(report).success).toBe(false);
    report.readiness.scin_dermatitis_recall_minimum_passed = false;
    report.readiness.passed = false;
    expect(PhotoEvaluationSchema.safeParse(report).success).toBe(true);
  });

  it("shows a real benchmark failure only when every declared flag matches", () => {
    const report = fixture();
    updateTestSources(report, [[0, 0, 0], [3, 30, 7], [4, 6, 50]], [[10, 10, 20], [4, 30, 6], [5, 5, 50]]);
    report.readiness.benchmark_minimums_passed = false;
    report.readiness.passed = false;
    expect(PhotoEvaluationSchema.safeParse(report).success).toBe(true);
  });

  it("keeps a zero-coverage accepted-subset accuracy undefined", () => {
    const report = fixture(); report.selective = { count: 0, coverage: 0, accuracy: null };
    expect(PhotoEvaluationSchema.safeParse(report).success).toBe(true);
    report.selective.accuracy = 0;
    expect(PhotoEvaluationSchema.safeParse(report).success).toBe(false);
  });

  it("rejects fabricated selective coverage or impossible accepted accuracy", () => {
    for (const selective of [
      { count: 60, coverage: 1, accuracy: .9 },
      { count: 300, coverage: 1, accuracy: .9 },
      { count: 60, coverage: .25, accuracy: null },
      { count: 60, coverage: .25, accuracy: .911 },
    ]) expect(PhotoEvaluationSchema.safeParse({ ...fixture(), selective }).success).toBe(false);
  });

  it("allows artifact failures as report data but cannot claim availability", () => {
    const report = {
      ...fixture(), available: false,
      deployment_validation: { onnx_verified: true, quantized_benchmark_passed: false, preprocessing_verified: true },
    };
    expect(PhotoEvaluationSchema.safeParse(report).success).toBe(true);
    expect(PhotoEvaluationSchema.safeParse({ ...report, available: true }).success).toBe(false);
    expect(PhotoEvaluationSchema.safeParse({ ...fixture(), available: true }).success).toBe(false);
    report.deployment_validation.quantized_benchmark_passed = true;
    expect(PhotoEvaluationSchema.safeParse({ ...report, available: true }).success).toBe(true);
  });

  it("checks optional quantized measurements against the same test case counts", () => {
    const report = fixture();
    const deployment_validation = { onnx_verified: true, quantized_benchmark_passed: true, preprocessing_verified: true, quantized_test: structuredClone(report.test) };
    expect(PhotoEvaluationSchema.safeParse({ ...report, deployment_validation }).success).toBe(true);
    deployment_validation.quantized_test = structuredClone(report.source_test.SCIN);
    expect(PhotoEvaluationSchema.safeParse({ ...report, deployment_validation }).success).toBe(false);
  });

  it.each(["float32", "float16_constants_float32_compute"] as const)("supports %s without changing a historical int8 failure to a pass", format => {
    const deployment_validation = {
      format, onnx_verified: true, artifact_benchmark_passed: true,
      quantized_benchmark_passed: false, preprocessing_verified: true, browser_verified: true,
    };
    const parsed = PhotoEvaluationSchema.parse({ ...fixture(), available: true, deployment_validation });
    expect(parsed.deployment_validation?.artifact_benchmark_passed).toBe(true);
    expect(parsed.deployment_validation?.quantized_benchmark_passed).toBe(false);
    expect(parsed.deployment_validation?.format).toBe(format);
  });

  it("reports a pending float browser check but rejects availability until it passes", () => {
    const deployment_validation = { format: "float32", onnx_verified: true, artifact_benchmark_passed: true, preprocessing_verified: true, browser_verified: false };
    expect(PhotoEvaluationSchema.safeParse({ ...fixture(), available: false, deployment_validation }).success).toBe(true);
    expect(PhotoEvaluationSchema.safeParse({ ...fixture(), available: true, deployment_validation }).success).toBe(false);
    deployment_validation.browser_verified = true;
    expect(PhotoEvaluationSchema.safeParse({ ...fixture(), available: true, deployment_validation }).success).toBe(true);
  });

  it.each([
    { format: "float32", onnx_verified: true, preprocessing_verified: true, browser_verified: true },
    { format: "float32", onnx_verified: true, preprocessing_verified: true, artifact_benchmark_passed: true },
    { format: "int8", onnx_verified: true, preprocessing_verified: true, artifact_benchmark_passed: true, browser_verified: true },
    { onnx_verified: true, preprocessing_verified: true, artifact_benchmark_passed: true, browser_verified: true },
    { onnx_verified: true, preprocessing_verified: true },
  ])("rejects an ambiguous or incompletely described artifact", deployment_validation => {
    expect(PhotoEvaluationSchema.safeParse({ ...fixture(), deployment_validation }).success).toBe(false);
  });

  it("does not turn low accepted accuracy into an aggregate gate failure or hide the measurement", () => {
    const report = fixture(); report.selective.accuracy = .45;
    const parsed = PhotoEvaluationSchema.parse(report);
    expect(parsed.readiness.passed).toBe(true);
    expect(parsed.selective.accuracy).toBe(.45);
    expect(parsed.selective.count * parsed.selective.accuracy!).toBe(27);
  });

  it("rejects a claimed float benchmark pass when the measured gates failed", () => {
    const report = fixture(); report.test_group_support.acne = 29;
    report.readiness.sufficient_supported_class_samples = false;
    report.readiness.passed = false;
    const deployment_validation = { format: "float32", onnx_verified: true, artifact_benchmark_passed: true, preprocessing_verified: true, browser_verified: true };
    expect(PhotoEvaluationSchema.safeParse({ ...report, deployment_validation }).success).toBe(false);
    deployment_validation.artifact_benchmark_passed = false;
    expect(PhotoEvaluationSchema.safeParse({ ...report, deployment_validation }).success).toBe(true);
  });

  it("accepts recorded intervals but rejects reversed or out-of-range bounds", () => {
    const intervals = { macro_f1_95_group_bootstrap: [.5, .8], balanced_accuracy_95_group_bootstrap: [.6, .9], bootstrap_resamples: 2000, limitations: "Synthetic interval fixture" };
    expect(PhotoEvaluationSchema.safeParse({ ...fixture(), uncertainty_intervals: intervals }).success).toBe(true);
    for (const bounds of [[.8, .5], [-.1, .8], [.5, 1.1]]) {
      expect(PhotoEvaluationSchema.safeParse({ ...fixture(), uncertainty_intervals: { ...intervals, macro_f1_95_group_bootstrap: bounds } }).success).toBe(false);
    }
  });

  it("rejects a mismatched backbone, foreign weight URL or unregistered head setting", () => {
    const report = fixture();
    for (const changed of [
      { ...report, backbone: "dinov2_vitb14" },
      { ...report, head_C: 999 },
      { ...report, head: "linear", gamma: .001 },
      { ...report, head: "rbf", gamma: .02 },
      { ...report, lock: { ...report.lock, backbone_provenance: { ...report.lock.backbone_provenance, url: "https://example.invalid/weights" } } },
      { ...report, lock: { ...report.lock, head_sha256: "missing" } },
    ]) expect(PhotoEvaluationSchema.safeParse(changed).success).toBe(false);
    expect(PhotoEvaluationSchema.safeParse({ ...report, head: "rbf", gamma: .001 }).success).toBe(true);
  });
});
