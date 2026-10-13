import { z } from "zod";
import { ModelSchema, type AnalyzeResponse, type ModelInfo } from "./types";
import { CLINICAL_CLASSES, CLINICAL_MODEL_VERSION } from "./clinical-task";
import { activationOverlay, assessBrowserQuality, normalizePixels, resizeNearest, temperatureScores } from "./browser-inference";
import { decodeImage, validateImageFile } from "./image-validation";

export const ClinicalManifestSchema = ModelSchema.extend({
  version: z.literal(CLINICAL_MODEL_VERSION), input_size: z.literal(128), supported_image_type: z.literal("clinical_photo"),
  preprocessing: z.object({ mean: z.array(z.number()).length(3), std: z.array(z.number().positive()).length(3), resize: z.literal("nearest") }),
  temperature: z.number().positive(),
  uncertainty: z.object({ max_score_threshold: z.number().min(.65).max(1), margin_threshold: z.number().min(.15).max(1) }),
  readiness: z.object({
    passed: z.literal(true), clinical_validation: z.literal(false), independent_holdout: z.literal(true), benchmark_minimums_passed: z.literal(true), blocked_by_previously_examined_test: z.literal(false),
    minimums: z.object({ macro_f1: z.literal(.6), balanced_accuracy: z.literal(.6), acne_recall: z.literal(.5), dermatitis_recall: z.literal(.5) }),
    measured: z.object({ macro_f1: z.number().min(.6).max(1), balanced_accuracy: z.number().min(.6).max(1), acne_recall: z.number().min(.5).max(1), dermatitis_recall: z.number().min(.5).max(1) }),
  }),
  onnx: z.object({ url: z.literal("/model-clinical/model.onnx"), sha256: z.string().regex(/^[a-f0-9]{64}$/), input_name: z.string(), logits_output: z.string(), activations_output: z.string() }),
  classifier_weights: z.array(z.array(z.number()).length(576)).length(3),
}).refine(value => value.available && value.classes.length === 3 && CLINICAL_CLASSES.every((item, index) => item.id === value.classes[index].id && item.label === value.classes[index].label), "The clinical research artifact is unavailable or incompatible.");
type ClinicalManifest = z.infer<typeof ClinicalManifestSchema>;
const FALLBACK: ModelInfo = { version: CLINICAL_MODEL_VERSION, architecture: "MobileNetV3 Small feature extractor + three-class linear research head", input_size: 128, supported_image_type: "clinical_photo", classes: CLINICAL_CLASSES.map(item => ({ ...item })), available: false };
const NEXT_STEP = "This experimental photo model cannot diagnose a disease or choose treatment. Seek professional advice for a new, spreading, painful, bleeding, infected-looking or persistent skin change; skincare purchases must not delay care.";
let manifestPromise: Promise<ClinicalManifest> | undefined;
let sessionPromise: Promise<import("onnxruntime-web").InferenceSession> | undefined;
const checkAbort = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError"); };

/** Technical screening on a 28px projection, with the photo task's own minimum. */
export function assessClinicalQuality(pixels28: Float32Array, width: number, height: number): NonNullable<AnalyzeResponse["quality"]> {
  const quality = assessBrowserQuality(pixels28, width, height);
  quality.issues = quality.issues.filter(issue => issue.code !== "resolution" && issue.code !== "low_resolution");
  if (Math.min(width, height) < 128) quality.issues.push({ code: "clinical_resolution", severity: "error", message: "Use a close-up photo at least 128 pixels in both directions; enlarging a thumbnail cannot recover detail." });
  quality.passed = !quality.issues.some(issue => issue.severity === "error");
  return quality;
}

async function getManifest() {
  if (!manifestPromise) manifestPromise = fetch("/model-clinical/manifest.json", { cache: "no-cache" }).then(async response => {
    if (!response.ok) throw new Error("Clinical-photo research metadata is unavailable.");
    return ClinicalManifestSchema.parse(await response.json());
  }).catch(error => { manifestPromise = undefined; throw error; });
  return manifestPromise;
}
async function getSession(manifest: ClinicalManifest) {
  if (!sessionPromise) sessionPromise = (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = new URL("/ort/", window.location.origin).href;
    const response = await fetch(manifest.onnx.url);
    if (!response.ok) throw new Error("Clinical-photo research weights are unavailable.");
    const bytes = await response.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const digest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
    if (digest !== manifest.onnx.sha256) throw new Error("Clinical model integrity check failed.");
    return ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  })().catch(error => { sessionPromise = undefined; throw error; });
  return sessionPromise;
}

export async function analyzeClinicalImage(file: File, signal?: AbortSignal, onProgress?: (stage: string) => void): Promise<AnalyzeResponse> {
  const empty = (status: AnalyzeResponse["status"], message: string, model = FALLBACK, quality: AnalyzeResponse["quality"] = null): AnalyzeResponse => ({ status, message, model, quality, scores: [], explanation: null, uncertainty: null, next_step: NEXT_STEP });
  checkAbort(signal);
  const validation = validateImageFile(file);
  if (!validation.valid) throw new Error(validation.error);
  await decodeImage(file);
  checkAbort(signal);
  onProgress?.("Checking the close-up skin photo…");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const width = bitmap.width, height = bitmap.height;
  let pixels: Float32Array, quality: NonNullable<AnalyzeResponse["quality"]>;
  try {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("This browser could not decode the photo.");
    ctx.drawImage(bitmap, 0, 0);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    pixels = resizeNearest(rgba, width, height, 128);
    quality = assessClinicalQuality(resizeNearest(rgba, width, height, 28), width, height);
    canvas.width = 0; canvas.height = 0;
  } finally { bitmap.close(); }
  if (!quality!.passed) return empty("quality_rejected", "This photo failed the research quality checks. Retake it in focus with even lighting; these checks do not establish medical suitability.", FALLBACK, quality!);
  let manifest: ClinicalManifest;
  try { manifest = await getManifest(); }
  catch { return empty("unavailable", "The experimental skin-photo model is unavailable or has not passed its declared benchmark gate. No condition-based product selection was made.", FALLBACK, quality!); }
  const model: ModelInfo = { ...FALLBACK, available: true, architecture: manifest.architecture };
  checkAbort(signal);
  onProgress?.("Loading the separate trained skin-photo model on your device…");
  let session: import("onnxruntime-web").InferenceSession;
  try { session = await getSession(manifest); }
  catch { return empty("unavailable", "The skin-photo model could not load. No condition-based selection was made.", { ...model, available: false }, quality!); }
  checkAbort(signal);
  onProgress?.("Analyzing the photo and checking uncertainty…");
  const ort = await import("onnxruntime-web/wasm");
  let outputs: import("onnxruntime-web").InferenceSession.OnnxValueMapType;
  try { outputs = await session.run({ [manifest.onnx.input_name]: new ort.Tensor("float32", normalizePixels(pixels!, manifest.preprocessing.mean, manifest.preprocessing.std), [1, 3, 128, 128]) }); }
  catch { return empty("unavailable", "Skin-photo inference failed. No condition-based product selection was made.", model, quality!); }
  checkAbort(signal);
  const logits = outputs[manifest.onnx.logits_output]?.data as Float32Array | undefined;
  if (!logits || logits.length !== 3) throw new Error("Invalid skin-photo model output. No recommendation was made.");
  const rawScores = temperatureScores(logits, manifest.temperature);
  const scores = CLINICAL_CLASSES.map((item, index) => ({ ...item, score: rawScores[index] })).sort((a, b) => b.score - a.score);
  const margin = scores[0].score - scores[1].score;
  const reasons: string[] = [];
  if (scores[0].score < manifest.uncertainty.max_score_threshold) reasons.push("The highest research score is below the documented uncertainty threshold.");
  if (margin < manifest.uncertainty.margin_threshold) reasons.push("The leading appearance categories are too close to distinguish reliably.");
  if (scores[0].id === "other") reasons.push("The model did not select a supported acne-like or dermatitis-like appearance; no condition-based products can be chosen.");
  const rejected = reasons.length > 0;
  const activations = outputs[manifest.onnx.activations_output]?.data as Float32Array | undefined;
  const explanation = activations?.length === 576 * 4 * 4 ? { method: "CAM", heatmap_data_url: activationOverlay(activations, manifest.classifier_weights[CLINICAL_CLASSES.findIndex(item => item.id === scores[0].id)], width, height, 4), disclaimer: "These regions contributed to this research model's score. The overlay does not identify disease boundaries, establish a diagnosis, or prove the chosen product is suitable." } : null;
  return { status: rejected ? "uncertain" : "assessed", message: rejected ? "Unable to choose a condition-based catalog match from this photo. General survey guidance remains available." : "An experimental skin-photo appearance category was selected. It can inform transparent cosmetic catalog matching, not diagnosis or treatment.", model, scores, quality: quality!, uncertainty: { rejected, reasons, score_type: "temperature_scaled_model_score", threshold: manifest.uncertainty.max_score_threshold, margin }, explanation, next_step: NEXT_STEP };
}
