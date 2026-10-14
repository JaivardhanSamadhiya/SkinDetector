import { z } from "zod";
import { CLINICAL_CLASSES, PHOTO_MODEL_INPUT_SIZE, PHOTO_MODEL_VERSION } from "./clinical-task";

const rate = z.number().min(0).max(1);
const count = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const backbone = z.enum(["dinov2_vits14", "dinov2_vitb14"]);
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-7;
const ids = CLINICAL_CLASSES.map(item => item.id);
const classMetric = z.object({ precision: rate, recall: rate, "f1-score": rate, support: count });
const classMetrics = z.object({ acne: classMetric, dermatitis: classMetric, other: classMetric });
const groupCounts = z.object({ acne: count, dermatitis: count, other: count });
const gateValues = z.object({ macro_f1: rate, balanced_accuracy: rate, acne_recall: rate, dermatitis_recall: rate });
const minimums = z.object({ macro_f1: z.literal(.6), balanced_accuracy: z.literal(.6), acne_recall: z.literal(.5), dermatitis_recall: z.literal(.5) });

/** Metrics must be reproducible from the recorded 3x3 confusion counts. */
export const PhotoMetricsSchema = z.object({
  n: count.positive(), accuracy: rate, macro_f1: rate, balanced_accuracy: rate,
  confusion_matrix: z.array(z.array(count).length(3)).length(3), per_class: classMetrics,
  ece_10: rate, brier_multiclass: z.number().min(0).max(2), nll: z.number().nonnegative(),
}).superRefine((metrics, context) => {
  const matrix = metrics.confusion_matrix;
  const supports = matrix.map(row => row.reduce((sum, value) => sum + value, 0));
  const n = supports.reduce((sum, value) => sum + value, 0);
  const f1: number[] = [], observedRecall: number[] = [];
  let correct = 0;
  ids.forEach((id, index) => {
    const metric = metrics.per_class[id];
    const truePositive = matrix[index][index];
    const predicted = matrix.reduce((sum, row) => sum + row[index], 0);
    const recall = supports[index] ? truePositive / supports[index] : 0;
    const precision = predicted ? truePositive / predicted : 0;
    const harmonic = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
    if (metric.support !== supports[index] || !close(metric.recall, recall) || !close(metric.precision, precision) || !close(metric["f1-score"], harmonic)) {
      context.addIssue({ code: "custom", path: ["per_class", id], message: "Class measurements do not match confusion counts." });
    }
    f1.push(harmonic);
    if (supports[index]) observedRecall.push(recall);
    correct += truePositive;
  });
  // sklearn's declared labels include all three classes in macro-F1, whereas
  // balanced_accuracy_score averages recall only over classes present in y_true.
  if (metrics.n !== n || !close(metrics.accuracy, correct / n)
    || !close(metrics.macro_f1, f1.reduce((sum, value) => sum + value, 0) / 3)
    || !close(metrics.balanced_accuracy, observedRecall.reduce((sum, value) => sum + value, 0) / observedRecall.length)) {
    context.addIssue({ code: "custom", message: "Aggregate measurements do not match confusion counts." });
  }
});

const sourceMetrics = z.object({ SCIN: PhotoMetricsSchema, "Fitzpatrick17k-C": PhotoMetricsSchema });
const interval = z.tuple([rate, rate]).refine(([lower, upper]) => lower <= upper, "Interval bounds are reversed.");
const intervals = z.object({
  macro_f1_95_group_bootstrap: interval,
  balanced_accuracy_95_group_bootstrap: interval,
  bootstrap_resamples: count.positive(),
  limitations: z.string().min(1),
}).passthrough();

// Floating deployment repair and the failed int8 experiment are different
// artifacts. A successful float export cannot turn the int8 failure into a pass.
const deploymentValidation = z.object({
  onnx_verified: z.boolean(), preprocessing_verified: z.boolean(),
  quantized_benchmark_passed: z.boolean().optional(),
  artifact_benchmark_passed: z.boolean().optional(),
  format: z.enum(["float32", "float16_constants_float32_compute"]).optional(),
  browser_verified: z.boolean().optional(),
  quantized_test: PhotoMetricsSchema.optional(), onnx_sha256: hash.optional(),
}).passthrough().superRefine((artifact, context) => {
  if (artifact.format) {
    if (artifact.artifact_benchmark_passed === undefined || artifact.browser_verified === undefined) {
      context.addIssue({ code: "custom", message: "Floating artifact reports require their own benchmark and browser verification flags." });
    }
  } else if (artifact.quantized_benchmark_passed === undefined || artifact.artifact_benchmark_passed !== undefined) {
    context.addIssue({ code: "custom", message: "An artifact benchmark needs a documented format; legacy int8 reports require the quantized benchmark flag." });
  }
});

export const PhotoEvaluationSchema = z.object({
  version: z.literal(PHOTO_MODEL_VERSION), backbone, head: z.enum(["linear", "rbf"]),
  head_C: z.number().positive(), gamma: z.number().positive().nullable(), temperature: z.number().positive(),
  test: PhotoMetricsSchema, test_group_support: groupCounts, source_test: sourceMetrics,
  validation: PhotoMetricsSchema, source_validation: sourceMetrics,
  readiness: z.object({
    passed: z.boolean(), benchmark_minimums_passed: z.boolean(), minimums, measured: gateValues,
    independent_holdout: z.boolean(), blocked_by_previously_examined_test: z.boolean(), clinical_validation: z.literal(false),
    sufficient_supported_class_samples: z.boolean(), scin_dermatitis_recall_minimum_passed: z.boolean(),
  }),
  selective: z.object({ count, coverage: rate, accuracy: rate.nullable() }),
  lock: z.object({
    backbone, head_sha256: hash, cohort_sha256: hash, protocol_sha256: hash, preprocessing_sha256: hash,
    backbone_provenance: z.object({ name: backbone, sha256: hash, bytes: count.positive(), source_commit: revision, url: z.string().url() }),
  }),
  protocol: z.object({
    seed: count, input_size: z.literal(PHOTO_MODEL_INPUT_SIZE), backbones: z.array(backbone).length(2), backbone_source_commit: revision,
    features: z.string().min(1), preprocessing: z.string().min(1),
    linear_C: z.array(z.number().positive()).min(1), rbf_C: z.array(z.number().positive()).min(1), rbf_gamma: z.array(z.number().positive()).min(1),
    rbf_landmarks_per_class: count.positive(), model_selection: z.string().min(1), training_views: z.string().min(1), evaluation_views: z.string().min(1),
    calibration: z.string().min(1), minimums, score_threshold: z.literal(.65), margin_threshold: z.literal(.15),
    additional_release_requirements: z.array(z.string()), clinical_validation: z.literal(false), patient_ids_available: z.literal(false), test_policy: z.string().min(1),
  }),
  limitations: z.array(z.string().min(1)).min(1),
  // Export verification may arrive after the frozen PyTorch/feature-head test.
  // Its failure is a reportable result, never a reason to hide measured metrics.
  deployment_validation: deploymentValidation.optional(),
  uncertainty_intervals: intervals.optional(),
  bootstrap: z.record(z.string(), z.unknown()).optional(),
  confidence_intervals: z.record(z.string(), z.unknown()).optional(),
  available: z.boolean().optional(),
}).superRefine((report, context) => {
  const problem = (message: string) => context.addIssue({ code: "custom", message });
  for (const split of ["test", "validation"] as const) {
    const pooled = report[split], sources = Object.values(split === "test" ? report.source_test : report.source_validation);
    if (sources.reduce((sum, source) => sum + source.n, 0) !== pooled.n
      || pooled.confusion_matrix.some((row, r) => row.some((value, c) => sources.reduce((sum, source) => sum + source.confusion_matrix[r][c], 0) !== value))) {
      problem(`${split} source counts do not reconstruct the pooled evaluation.`);
    }
    for (const metric of ["nll", "brier_multiclass"] as const) {
      if (!close(sources.reduce((sum, source) => sum + source[metric] * source.n, 0) / pooled.n, pooled[metric])) problem(`${split} ${metric} differs from the weighted source measurement.`);
    }
  }
  const measured = {
    macro_f1: report.test.macro_f1, balanced_accuracy: report.test.balanced_accuracy,
    acne_recall: report.test.per_class.acne.recall, dermatitis_recall: report.test.per_class.dermatitis.recall,
  };
  const benchmarkPassed = Object.entries(report.readiness.minimums).every(([key, value]) => measured[key as keyof typeof measured] >= value);
  const samplePassed = report.test_group_support.acne >= 30 && report.test_group_support.dermatitis >= 30;
  const scinPassed = report.source_test.SCIN.per_class.dermatitis.recall >= .5;
  const passed = benchmarkPassed && samplePassed && scinPassed && report.readiness.independent_holdout && !report.readiness.blocked_by_previously_examined_test;
  if (!Object.entries(measured).every(([key, value]) => close(report.readiness.measured[key as keyof typeof measured], value))
    || report.readiness.benchmark_minimums_passed !== benchmarkPassed
    || report.readiness.sufficient_supported_class_samples !== samplePassed
    || report.readiness.scin_dermatitis_recall_minimum_passed !== scinPassed
    || report.readiness.passed !== passed
    || report.readiness.blocked_by_previously_examined_test === report.readiness.independent_holdout) {
    problem("Readiness flags do not agree with the measured gates and holdout history.");
  }
  if (ids.some(id => report.test_group_support[id] > report.test.per_class[id].support
    || (report.test.per_class[id].support > 0 && report.test_group_support[id] < 1))) problem("Group support is inconsistent with test case counts.");
  if (report.selective.count > report.test.n || !close(report.selective.coverage, report.selective.count / report.test.n)
    || (report.selective.count === 0) !== (report.selective.accuracy === null)
    || (report.selective.accuracy !== null && !close(report.selective.count * report.selective.accuracy, Math.round(report.selective.count * report.selective.accuracy)))) {
    problem("Selective-result counts, coverage or accuracy are inconsistent.");
  }
  const provenance = report.lock.backbone_provenance;
  if (report.lock.backbone !== report.backbone || provenance.name !== report.backbone
    || provenance.source_commit !== report.protocol.backbone_source_commit
    || provenance.url !== `https://dl.fbaipublicfiles.com/dinov2/${report.backbone}/${report.backbone}_pretrain.pth`
    || new Set(report.protocol.backbones).size !== 2 || !report.protocol.backbones.includes(report.backbone)) problem("Backbone provenance does not agree with the frozen protocol.");
  if (!(report.head === "linear" ? report.protocol.linear_C : report.protocol.rbf_C).includes(report.head_C)
    || (report.head === "linear" && report.gamma !== null)
    || (report.head === "rbf" && (report.gamma === null || !report.protocol.rbf_gamma.includes(report.gamma)))) problem("Selected head settings were not in the frozen search.");
  if (report.deployment_validation?.quantized_test) {
    const quantized = report.deployment_validation.quantized_test;
    if (quantized.n !== report.test.n || ids.some(id => quantized.per_class[id].support !== report.test.per_class[id].support)) problem("Quantized evaluation uses different test case counts.");
  }
  const artifact = report.deployment_validation;
  const deployedChecksPassed = artifact && artifact.onnx_verified && artifact.preprocessing_verified
    && (artifact.format ? artifact.artifact_benchmark_passed && artifact.browser_verified : artifact.quantized_benchmark_passed);
  if (artifact?.artifact_benchmark_passed && !report.readiness.passed) problem("Floating artifact benchmark contradicts the measured readiness gates.");
  if (report.available === true && (!report.readiness.passed || !deployedChecksPassed)) problem("Availability contradicts the measured evaluation or artifact checks.");
});

export type PhotoEvaluation = z.infer<typeof PhotoEvaluationSchema>;
export type PhotoMetrics = z.infer<typeof PhotoMetricsSchema>;
