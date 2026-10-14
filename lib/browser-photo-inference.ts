import { z } from "zod";
import { CLINICAL_CLASSES, PHOTO_MODEL_INPUT_SIZE, PHOTO_MODEL_VERSION } from "./clinical-task";
import { assessClinicalQuality } from "./browser-clinical-inference";
import { normalizePixels, resizeNearest, temperatureScores } from "./browser-inference";
import { decodeImage, validateDimensions, validateImageFile } from "./image-validation";
import { ModelSchema, type AnalyzeResponse, type ModelInfo } from "./types";

export { PHOTO_MODEL_VERSION } from "./clinical-task";
const INPUT_SIZE = PHOTO_MODEL_INPUT_SIZE;
const MANIFEST_URL = "/model-photo/manifest.json";
const MAX_MODEL_BYTES = 512 * 1024 * 1024;

/** Research readiness checks are required independently of a declared available flag. */
export const PhotoManifestSchema = ModelSchema.extend({
  version: z.literal(PHOTO_MODEL_VERSION),
  available: z.literal(true),
  architecture: z.string().min(1),
  backbone: z.enum(["dinov2_vits14", "dinov2_vitb14"]),
  head: z.enum(["linear", "rbf"]),
  input_size: z.literal(INPUT_SIZE),
  supported_image_type: z.literal("clinical_photo"),
  preprocessing: z.object({
    mean: z.tuple([z.literal(.485), z.literal(.456), z.literal(.406)]),
    std: z.tuple([z.literal(.229), z.literal(.224), z.literal(.225)]),
    resize: z.literal("nearest"),
  }),
  temperature: z.number().positive(),
  uncertainty: z.object({
    max_score_threshold: z.number().min(.65).max(1),
    margin_threshold: z.number().min(.15).max(1),
  }),
  readiness: z.object({
    passed: z.literal(true),
    independent_holdout: z.literal(true),
    blocked_by_previously_examined_test: z.literal(false),
    clinical_validation: z.literal(false),
    benchmark_minimums_passed: z.literal(true),
    sufficient_supported_class_samples: z.literal(true),
    scin_dermatitis_recall_minimum_passed: z.literal(true),
    minimums: z.object({
      macro_f1: z.literal(.6), balanced_accuracy: z.literal(.6),
      acne_recall: z.literal(.5), dermatitis_recall: z.literal(.5),
    }),
    measured: z.object({
      macro_f1: z.number().min(.6).max(1), balanced_accuracy: z.number().min(.6).max(1),
      acne_recall: z.number().min(.5).max(1), dermatitis_recall: z.number().min(.5).max(1),
    }),
  }),
  test_group_support: z.object({
    acne: z.number().int().min(30), dermatitis: z.number().int().min(30), other: z.number().int().nonnegative(),
  }),
  deployment_validation: z.object({
    onnx_verified: z.literal(true), quantized_benchmark_passed: z.literal(true), preprocessing_verified: z.literal(true),
  }),
  onnx: z.object({
    url: z.literal("/model-photo/model.onnx"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    input_name: z.literal("image"),
    logits_output: z.literal("logits"),
  }),
}).refine(value => value.classes.length === CLINICAL_CLASSES.length
  && CLINICAL_CLASSES.every((item, index) => value.classes[index].id === item.id && value.classes[index].label === item.label),
"The photo artifact has an incompatible class mapping.");

type PhotoManifest = z.infer<typeof PhotoManifestSchema>;
type Session = import("onnxruntime-web").InferenceSession;
const FALLBACK: ModelInfo = {
  version: PHOTO_MODEL_VERSION, architecture: "DINOv2 photo research model (artifact not loaded)",
  input_size: INPUT_SIZE, supported_image_type: "clinical_photo",
  classes: CLINICAL_CLASSES.map(item => ({ ...item })), available: false,
};
const NEXT_STEP = "This research appearance category cannot diagnose a disease, grade acne, rule out a serious condition, or determine the medically best products. Seek professional advice for a new, changing, painful, bleeding, rapidly spreading or persistent concern. A skincare routine must not delay care.";
let manifestPromise: Promise<PhotoManifest> | undefined;
let sessionCache: { key: string; promise: Promise<Session> } | undefined;

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
}

/** Stop publishing this request while a shared model download or WASM operation finishes. */
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  checkAbort(signal);
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException("Analysis cancelled", "AbortError")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

function getManifest(): Promise<PhotoManifest> {
  if (!manifestPromise) {
    const pending = fetch(MANIFEST_URL, { cache: "no-cache", redirect: "error" }).then(async response => {
      if (!response.ok) throw new Error("Photo research metadata is unavailable.");
      return PhotoManifestSchema.parse(await response.json());
    }).catch(error => {
      if (manifestPromise === pending) manifestPromise = undefined;
      throw error;
    });
    manifestPromise = pending;
  }
  return manifestPromise;
}

function getSession(manifest: PhotoManifest): Promise<Session> {
  const key = `${manifest.onnx.url}:${manifest.onnx.sha256}`;
  if (!sessionCache || sessionCache.key !== key) {
    const pending = (async () => {
      const response = await fetch(manifest.onnx.url, { redirect: "error" });
      if (!response.ok) throw new Error("The verified photo model is unavailable.");
      const declaredSize = response.headers.get("content-length");
      if (declaredSize !== null && (!Number.isFinite(Number(declaredSize)) || Number(declaredSize) <= 0 || Number(declaredSize) > MAX_MODEL_BYTES)) {
        throw new Error("Photo model download has an invalid size.");
      }
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_MODEL_BYTES) throw new Error("Photo model download has an invalid size.");
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const digest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
      if (digest !== manifest.onnx.sha256) throw new Error("Photo model integrity verification failed.");
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = new URL("/ort/", window.location.origin).href;
      return ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    })().catch(error => {
      if (sessionCache?.promise === pending) sessionCache = undefined;
      // A deployment may have replaced the failed artifact. Revalidate metadata on retry.
      manifestPromise = undefined;
      throw error;
    });
    sessionCache = { key, promise: pending };
  }
  return sessionCache.promise;
}

/**
 * Executes a verified local ONNX artifact after bounded image decoding and
 * technical quality screening. No input image is uploaded or persisted here.
 * Availability must be established by real evaluation before app integration.
 */
export async function analyzePhotoImage(file: File, signal?: AbortSignal, onProgress?: (stage: string) => void): Promise<AnalyzeResponse> {
  const empty = (status: AnalyzeResponse["status"], message: string, quality: AnalyzeResponse["quality"] = null, model = FALLBACK): AnalyzeResponse => ({
    status, message, model, quality, scores: [], uncertainty: null, explanation: null, next_step: NEXT_STEP,
  });
  checkAbort(signal);
  const validation = validateImageFile(file);
  if (!validation.valid) throw new Error(validation.error);
  onProgress?.("Checking the photo and its image quality…");
  await decodeImage(file); // Header dimensions, encoding, animation and decoded bounds are checked first.
  checkAbort(signal);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const width = bitmap.width, height = bitmap.height;
  let canvas: HTMLCanvasElement | undefined;
  let pixels: Float32Array;
  let quality: NonNullable<AnalyzeResponse["quality"]>;
  try {
    checkAbort(signal);
    validateDimensions(width, height);
    canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser could not read the photo.");
    context.drawImage(bitmap, 0, 0);
    const rgba = context.getImageData(0, 0, width, height).data;
    // Both projections explicitly composite source alpha onto white, then use
    // the same whole-image pixel-center nearest transform as Python training.
    pixels = resizeNearest(rgba, width, height, INPUT_SIZE);
    quality = assessClinicalQuality(resizeNearest(rgba, width, height, 28), width, height);
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    bitmap.close();
  }
  checkAbort(signal);
  if (!quality.passed) return empty("quality_rejected", "This photo did not pass the technical quality checks. Review the retake guidance; passing these checks would not establish medical suitability.", quality);
  let manifest: PhotoManifest;
  try { manifest = await waitFor(getManifest(), signal); }
  catch {
    checkAbort(signal);
    return empty("unavailable", "The photo research model is unavailable or has not passed all its declared evaluation and deployment checks. No appearance-based product selection was made.", quality);
  }
  const model: ModelInfo = {
    version: manifest.version, architecture: manifest.architecture, input_size: manifest.input_size,
    supported_image_type: manifest.supported_image_type, classes: manifest.classes, available: true,
  };
  checkAbort(signal);
  onProgress?.("Loading the verified photo model on your device…");
  let session: Session;
  try { session = await waitFor(getSession(manifest), signal); }
  catch {
    checkAbort(signal);
    return empty("unavailable", "The photo model could not load on this device. No prediction or appearance-based product selection is available. You can retry the analysis.", quality, { ...model, available: false });
  }
  checkAbort(signal);
  onProgress?.("Analyzing the photo and checking uncertainty…");
  let rawScores: number[];
  try {
    const ort = await import("onnxruntime-web/wasm");
    checkAbort(signal);
    const input = new ort.Tensor("float32", normalizePixels(pixels, manifest.preprocessing.mean, manifest.preprocessing.std), [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const outputs = await waitFor(session.run({ [manifest.onnx.input_name]: input }), signal);
    checkAbort(signal);
    const logits = outputs[manifest.onnx.logits_output];
    if (!logits || logits.type !== "float32" || !(logits.data instanceof Float32Array)
      || logits.data.length !== 3 || logits.dims.length !== 2 || logits.dims[0] !== 1 || logits.dims[1] !== 3) {
      throw new Error("The photo model returned an incompatible tensor.");
    }
    rawScores = temperatureScores(logits.data, manifest.temperature);
  } catch {
    checkAbort(signal);
    sessionCache = undefined;
    manifestPromise = undefined;
    return empty("unavailable", "Photo inference failed or returned an invalid output. No usable prediction or appearance-based product selection is available.", quality, { ...model, available: false });
  }
  checkAbort(signal);
  const scores = manifest.classes.map((item, index) => ({ ...item, score: rawScores[index] })).sort((a, b) => b.score - a.score);
  const margin = scores[0].score - scores[1].score;
  const reasons: string[] = [];
  if (scores[0].score < manifest.uncertainty.max_score_threshold) reasons.push("The leading model score is below the documented research threshold.");
  if (margin < manifest.uncertainty.margin_threshold) reasons.push("The leading appearance categories are too close under the research separation rule.");
  if (scores[0].id === "other") reasons.push("Other / unsupported appearance does not identify a condition. It cannot select condition-based products and is not a validated detector of every unsupported image.");
  const rejected = reasons.length > 0;
  onProgress?.("Preparing the research result and its limitations…");
  return {
    status: rejected ? "uncertain" : "assessed",
    message: rejected
      ? "Unable to select a supported appearance reliably from this photo. General survey guidance remains available."
      : "A research appearance category is available. This is not a diagnosis or a measure of condition severity.",
    model, scores, quality, explanation: null,
    uncertainty: { rejected, reasons, score_type: "temperature_scaled_model_score", threshold: manifest.uncertainty.max_score_threshold, margin },
    next_step: NEXT_STEP,
  };
}
