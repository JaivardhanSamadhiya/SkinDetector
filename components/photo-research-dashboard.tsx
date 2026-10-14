"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Download, Info, LoaderCircle, Microscope } from "lucide-react";
import { Eyebrow } from "@/components/shared";
import { CLINICAL_CLASSES } from "@/lib/clinical-task";
import { PhotoEvaluationSchema, type PhotoEvaluation, type PhotoMetrics } from "@/lib/photo-evaluation-schema";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const sources = ["SCIN", "Fitzpatrick17k-C"] as const;

function SourceTable({ title, metrics }: { title: string; metrics: PhotoEvaluation["source_test"] }) {
  return <div className="report-table-wrap"><table className="report-table">
    <caption>{title}. A missing reference class has no measurable recall.</caption>
    <thead><tr><th scope="col">Source</th><th scope="col">Acne / dermatitis / other cases</th><th scope="col">Accuracy</th><th scope="col">Macro-F1</th><th scope="col">Balanced accuracy</th><th scope="col">Acne recall</th><th scope="col">Dermatitis recall</th></tr></thead>
    <tbody>{sources.map(source => { const value = metrics[source]; return <tr key={source}><th scope="row">{source}</th><td>{value.per_class.acne.support} / {value.per_class.dermatitis.support} / {value.per_class.other.support}</td><td>{percent(value.accuracy)}</td><td>{percent(value.macro_f1)}</td><td>{percent(value.balanced_accuracy)}</td><td>{value.per_class.acne.support ? percent(value.per_class.acne.recall) : "Not measurable · 0 cases"}</td><td>{value.per_class.dermatitis.support ? percent(value.per_class.dermatitis.recall) : "Not measurable · 0 cases"}</td></tr>; })}</tbody>
  </table></div>;
}

function CalibrationRow({ name, metrics }: { name: string; metrics: PhotoMetrics }) {
  return <tr><th scope="row">{name}</th><td>{metrics.ece_10.toFixed(4)}</td><td>{metrics.nll.toFixed(4)}</td><td>{metrics.brier_multiclass.toFixed(4)}</td></tr>;
}

export function PhotoResearchDashboard() {
  const [report, setReport] = useState<PhotoEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/model-photo/evaluation.json", { signal: controller.signal, cache: "no-cache", redirect: "error" }).then(async response => {
      if (!response.ok) throw new Error("The new photo evaluation has not been published. Measured results will appear after the frozen test and integrity checks are completed.");
      const parsed = PhotoEvaluationSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("The photo evaluation could not be verified. No performance figures or readiness claim can be displayed from this report.");
      if (!controller.signal.aborted) setReport(parsed.data);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The photo evaluation is currently unavailable."); });
    return () => controller.abort();
  }, []);

  const artifact = report?.deployment_validation;
  const artifactPassed = !!artifact && artifact.onnx_verified && artifact.quantized_benchmark_passed && artifact.preprocessing_verified;
  return <section className="report-section" aria-labelledby="photo-v2-title" data-testid="photo-research-report" data-state={error ? "unavailable" : report ? "measured" : "loading"}>
    <Eyebrow>ORDINARY-PHOTO RESEARCH · DINOv2</Eyebrow><h2 id="photo-v2-title">The evidence behind the new photo task.</h2>
    <p>This separate experiment studies acne-like, dermatitis-like and other / unsupported appearances using SCIN volunteer photographs and corrected Fitzpatrick17k-C atlas partitions. It does not identify every disease, establish acne severity, or validate arbitrary face and body photographs.</p>
    {error ? <div className="report-state" role="status"><Info size={19}/><div><strong>Evaluation pending or unavailable</strong><p>{error}</p></div></div> : !report ? <div className="report-state" role="status"><LoaderCircle className="spinning" size={19}/>Loading the recorded photo evaluation…</div> : <>
      <div className="report-state" role="status" data-testid="photo-evaluation-readiness" data-passed={report.readiness.passed}>
        {report.readiness.passed ? <CheckCircle2 size={20}/> : <Info size={20}/>}<div><strong>{report.readiness.passed ? "The declared research evaluation gates passed." : "The declared research evaluation gates did not pass."}</strong><p>{report.readiness.passed ? "Passing these engineering gates supports this limited experiment; it does not establish clinical readiness or universal photo accuracy." : "These measured results remain visible for transparency. Failed evaluation cannot enable appearance-based recommendations."} Artifact checks and website availability are separate.</p></div>
      </div>
      <div className="research-summary">
        <div className="research-model-card"><span className="research-status"><CheckCircle2 size={15}/>MEASURED PHOTO EXPERIMENT</span><h3>{report.backbone === "dinov2_vits14" ? "DINOv2 ViT-S/14" : "DINOv2 ViT-B/14"} + {report.head === "linear" ? "linear classifier" : "RBF feature classifier"}</h3><div className="classes-list">{CLINICAL_CLASSES.map(item => <span key={item.id}>{item.id.toUpperCase()}</span>)}</div><p>{report.version} · RGB {report.protocol.input_size} × {report.protocol.input_size} · seed {report.protocol.seed}</p><p>Frozen pretrained features and a trained three-category head. No transformer explanation overlay is claimed for this release.</p></div>
        <div className="research-domain-card"><Microscope size={29} strokeWidth={1.4}/><h3>A limited dataset experiment.</h3><p>SCIN labels are retrospective dermatologist differentials; atlas source labels are a different reference standard. The pooled result combines those sources, so read each source separately.</p><p>{report.readiness.independent_holdout ? "The holdout was reserved from this SkinSnap training, model-selection and calibration experiment." : "A fresh holdout independent of this experiment was not established."} Patient independence is unproven, and overlap with DINOv2 pretraining is unknown.</p></div>
      </div>
      <div className="metric-grid">{[
        { name: "Overall test accuracy", value: percent(report.test.accuracy), description: "All test cases, before uncertainty rejection" },
        { name: "Macro-F1", value: percent(report.test.macro_f1), description: "Equal weight for the three category F1 values" },
        { name: "Balanced accuracy", value: percent(report.test.balanced_accuracy), description: "Mean recall over represented reference classes" },
        { name: "Test cases", value: report.test.n.toLocaleString(), description: "First available view per case; not a patient count" },
      ].map(metric => <div className="metric-card" key={metric.name}><span>{metric.name}</span><strong>{metric.value}</strong><p>{metric.description}</p></div>)}</div>

      <div className="report-table-wrap"><table className="report-table"><caption>Held-out photo category measurements</caption><thead><tr><th scope="col">Appearance category</th><th scope="col">Cases</th><th scope="col">Duplicate groups</th><th scope="col">Recall</th><th scope="col">Precision</th><th scope="col">F1</th></tr></thead><tbody>{CLINICAL_CLASSES.map(item => { const value = report.test.per_class[item.id]; return <tr key={item.id}><th scope="row">{item.label}</th><td>{value.support}</td><td>{report.test_group_support[item.id]}</td><td>{value.support ? percent(value.recall) : "Not measurable"}</td><td>{percent(value.precision)}</td><td>{percent(value["f1-score"])}</td></tr>; })}</tbody></table></div>
      <p>Duplicate groups are connected case/image groups from the recorded leakage checks. Neither the group count nor the case count establishes a count of independent patients. Fixed gates require macro-F1 ≥ 0.60, balanced accuracy ≥ 0.60, acne and dermatitis recall ≥ 0.50, at least 30 test groups for each supported appearance, and SCIN dermatitis recall ≥ 0.50.</p>
      {report.uncertainty_intervals ? <p data-testid="photo-confidence-intervals">Recorded 95% group-bootstrap intervals: macro-F1 {report.uncertainty_intervals.macro_f1_95_group_bootstrap.map(percent).join("–")}; balanced accuracy {report.uncertainty_intervals.balanced_accuracy_95_group_bootstrap.map(percent).join("–")}. {report.uncertainty_intervals.bootstrap_resamples.toLocaleString()} resamples. {report.uncertainty_intervals.limitations}</p> : <p>Uncertainty intervals have not been published in this report. Point estimates alone do not establish performance on a new population.</p>}

      <div className="report-chart confusion-chart"><h3>Where the categories were confused</h3><p>Rows are the source reference categories; columns are model predictions. These counts do not represent confirmed clinical diagnoses.</p><div className="confusion-wrap"><table className="confusion-table"><caption>Photo test confusion counts, including rejected predictions</caption><thead><tr><th scope="col">Reference ↓ / predicted →</th>{CLINICAL_CLASSES.map(item => <th key={item.id} scope="col">{item.id}</th>)}</tr></thead><tbody>{report.test.confusion_matrix.map((row, index) => <tr key={CLINICAL_CLASSES[index].id}><th scope="row">{CLINICAL_CLASSES[index].id}</th>{row.map((value, column) => <td key={column} style={{ backgroundColor: index === column ? "#e6efdf" : "#f5f3ed" }}>{value}</td>)}</tr>)}</tbody></table></div></div>
      <SourceTable title="Test performance by source" metrics={report.source_test}/>
      <SourceTable title="Validation performance by source, used for model selection and calibration" metrics={report.source_validation}/>
      <div className="research-limitation" data-testid="photo-source-limitations"><h3>Atlas accuracy does not establish smartphone-face accuracy.</h3><p>{report.source_test.SCIN.per_class.acne.support === 0 ? "SCIN contributes no fresh acne test cases here: its acne cases were already examined in the earlier SkinSnap experiment and were retained for development only. Acne test performance therefore comes from the atlas source and does not independently establish acne accuracy for volunteer smartphone photos." : "The two sources have different image acquisition and reference labels. Read their class counts before comparing performance."}</p><p>Source-specific macro-F1 still includes all three declared labels. When a reference class is absent, its F1 contribution is zero, while balanced accuracy averages only represented classes. A missing class is an evidence gap, not a zero-recall experiment.</p></div>

      <div className="report-table-wrap"><table className="report-table"><caption>Recorded calibration diagnostics after validation-only temperature scaling</caption><thead><tr><th scope="col">Partition</th><th scope="col">ECE · 10 bins</th><th scope="col">Negative log likelihood</th><th scope="col">Multiclass Brier</th></tr></thead><tbody><CalibrationRow name="Validation · used for fitting temperature" metrics={report.validation}/><CalibrationRow name="Test · not used for fitting temperature" metrics={report.test}/></tbody></table></div>
      <p>Temperature: {report.temperature.toFixed(2)}. {report.protocol.calibration}. These are dataset calibration diagnostics. A temperature-scaled score is not a medical probability or a validated estimate for an arbitrary user photo.</p>
      <div className="research-limitation"><h3>Rejection and the accepted subset</h3><p>The research policy rejects a leading score below {report.protocol.score_threshold.toFixed(2)}, a top-two margin below {report.protocol.margin_threshold.toFixed(2)}, or an other / unsupported result. It is not a validated detector of all out-of-domain images and cannot provide a healthy-skin all-clear.</p><p>{report.selective.count} of {report.test.n} test cases met the score policy ({percent(report.selective.coverage)} coverage). {report.selective.accuracy === null ? "There were no accepted cases, so accepted-subset accuracy is undefined." : `Accuracy on that accepted subset was ${percent(report.selective.accuracy)}; this excludes the rejected cases and must not replace overall accuracy.`}</p></div>

      <div className="report-table-wrap"><table className="report-table"><caption>Training, provenance and artifact status</caption><tbody>
        <tr><th scope="row">Features and trained head</th><td>{report.protocol.features}. {report.head === "linear" ? "A trained linear head uses the frozen features." : `A trained radial-basis feature head uses up to ${report.protocol.rbf_landmarks_per_class} train-only landmarks per class.`} Selected C = {report.head_C}{report.gamma === null ? "" : `; gamma = ${report.gamma}`}.</td></tr>
        <tr><th scope="row">Selection</th><td>{report.protocol.model_selection}. The held-out test is opened only after selection and calibration are locked.</td></tr>
        <tr><th scope="row">Training and evaluation views</th><td>{report.protocol.training_views}. {report.protocol.evaluation_views}.</td></tr>
        <tr><th scope="row">Preprocessing</th><td>{report.protocol.preprocessing}. The entire image is resized without a detected lesion crop; changing its aspect ratio is a limitation.</td></tr>
        <tr><th scope="row">Pretrained provenance</th><td><a href={report.lock.backbone_provenance.url} target="_blank" rel="noreferrer">Recorded DINOv2 weights <ArrowUpRight size={13}/></a><br/>SHA-256: <code>{report.lock.backbone_provenance.sha256}</code><br/>Source revision: <code>{report.lock.backbone_provenance.source_commit}</code></td></tr>
        <tr><th scope="row">Frozen head / cohort / protocol</th><td><code>{report.lock.head_sha256}</code><br/><code>{report.lock.cohort_sha256}</code><br/><code>{report.lock.protocol_sha256}</code></td></tr>
        <tr><th scope="row">ONNX deployment checks</th><td data-testid="photo-artifact-validation">{!artifact ? "Artifact verification has not been published; browser model availability is not established." : <>{artifactPassed ? "All three recorded artifact checks passed." : "One or more recorded artifact checks did not pass."}<br/>ONNX execution: {artifact.onnx_verified ? "verified" : "not verified"}; quantized benchmark: {artifact.quantized_benchmark_passed ? "passed" : "not passed"}; preprocessing parity: {artifact.preprocessing_verified ? "verified" : "not verified"}. {report.available === false && "This report marks the artifact unavailable."}</>}</td></tr>
      </tbody></table></div>
      {artifact?.quantized_test && <div className="report-table-wrap"><table className="report-table"><caption>Recorded quantized ONNX test measurements on the same test case counts</caption><thead><tr><th scope="col">Accuracy</th><th scope="col">Macro-F1</th><th scope="col">Balanced accuracy</th></tr></thead><tbody><tr><td>{percent(artifact.quantized_test.accuracy)}</td><td>{percent(artifact.quantized_test.macro_f1)}</td><td>{percent(artifact.quantized_test.balanced_accuracy)}</td></tr></tbody></table></div>}
      <div className="research-limitations"><div className="research-limitation"><h3>Research rights and commercial use</h3><p>Fitzpatrick17k lists CC BY-NC-SA 3.0 terms; the corrected release and original image rights also need attribution and review. SCIN uses its own Data Use License. This combined research artifact is not cleared for a paid consumer deployment by passing a numerical benchmark.</p><a href="https://github.com/mattgroh/fitzpatrick17k#licensing" target="_blank" rel="noreferrer">Fitzpatrick17k licensing <ArrowUpRight size={13}/></a><br/><a href="https://github.com/google-research-datasets/scin" target="_blank" rel="noreferrer">SCIN source and terms <ArrowUpRight size={13}/></a></div><div className="research-limitation"><h3>What remains unvalidated</h3><p>No clinical diagnosis, disease-severity estimate, reliable serious-disease exclusion, universal skin-tone performance, or comparative product benefit is established. A high aggregate score cannot fill absent classes, missing patient IDs, unmeasured subgroups or a different imaging domain.</p><details><summary>Additional recorded limitations</summary><ul>{report.limitations.map(item => <li key={item}>{item}</li>)}</ul></details></div></div>
      <div className="research-links"><a href="/model-photo/evaluation.json" download><Download size={15}/>Download the measured evaluation JSON</a><a href="https://github.com/facebookresearch/dinov2" target="_blank" rel="noreferrer">DINOv2 architecture and pretrained components <ArrowUpRight size={14}/></a></div>
    </>}
  </section>;
}
