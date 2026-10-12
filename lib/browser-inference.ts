import { z } from "zod";
import { ModelSchema, type AnalyzeResponse, type ImageType, type ModelInfo } from "./types";
import { decodeImage, validateImageFile } from "./image-validation";

const ManifestSchema = ModelSchema.extend({
  input_size: z.literal(28),
  preprocessing: z.object({ mean: z.array(z.number()).length(3), std: z.array(z.number().positive()).length(3), resize: z.literal("nearest") }),
  temperature: z.number().positive(),
  uncertainty: z.object({ max_score_threshold: z.number().min(0).max(1), margin_threshold: z.number().min(0).max(1) }),
  onnx: z.object({ url: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), input_name: z.string(), logits_output: z.string(), activations_output: z.string() }),
  classifier_weights: z.array(z.array(z.number()).length(64)).length(7),
}).refine(m => m.classes.length === 7 && m.available && m.supported_image_type === "dermoscopic", "Unsupported model manifest");
type Manifest = z.infer<typeof ManifestSchema>;
const NEXT_STEP = "An image cannot rule out a concerning lesion. Arrange professional evaluation for a new, changing, bleeding, painful or non-healing spot, regardless of this research output.";
const EXPLANATION_LIMIT = "This map shows image regions contributing to this model's score. It does not establish a diagnosis, identify lesion boundaries, or prove medical correctness.";
const FALLBACK_MODEL: ModelInfo = { available: false, version: "unavailable", architecture: "SkinCNN (24/48/64 convolutions, global average pooling, seven-class head)", input_size: 28, supported_image_type: "dermoscopic", classes: [] };
let manifestPromise: Promise<Manifest> | undefined;
let sessionPromise: Promise<import("onnxruntime-web").InferenceSession> | undefined;

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
}

async function getManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetch("/model/manifest.json", { cache: "no-cache" }).then(async response => {
      if (!response.ok) throw new Error("Model metadata is unavailable.");
      return ManifestSchema.parse(await response.json());
    }).catch(error => { manifestPromise = undefined; throw error; });
  }
  return manifestPromise;
}

async function getSession(manifest: Manifest) {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import("onnxruntime-web/wasm");
      // Single-thread WASM runs without cross-origin isolation or remote services.
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = new URL("/ort/", window.location.origin).href;
      ort.env.wasm.proxy = false;
      const url = new URL(manifest.onnx.url, window.location.origin);
      if (url.origin !== window.location.origin) throw new Error("Model must be served from this application.");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Trained model weights are unavailable.");
      const bytes = await response.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const digest = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
      if (digest !== manifest.onnx.sha256) throw new Error("Model integrity check failed.");
      return ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    })().catch(error => { sessionPromise = undefined; throw error; });
  }
  return sessionPromise;
}

/** Same pixel-center nearest-neighbor mapping as Pillow's NEAREST resize. */
export function resizeNearest(rgba: Uint8ClampedArray, width: number, height: number, size = 28): Float32Array {
  const output = new Float32Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.min(width - 1, Math.floor((x + 0.5) * width / size));
    const sy = Math.min(height - 1, Math.floor((y + 0.5) * height / size));
    const start = (sy * width + sx) * 4;
    const alpha = rgba[start + 3] / 255;
    for (let c = 0; c < 3; c++) output[(y * size + x) * 3 + c] = Math.round(rgba[start + c] * alpha + 255 * (1 - alpha));
  }
  return output;
}

export function normalizePixels(pixels: Float32Array, mean: number[], std: number[]): Float32Array {
  const count = pixels.length / 3;
  const output = new Float32Array(pixels.length);
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) output[c * count + i] = (pixels[i * 3 + c] / 255 - mean[c]) / std[c];
  return output;
}

export function assessBrowserQuality(pixels: Float32Array, width: number, height: number): NonNullable<AnalyzeResponse["quality"]> {
  const size = 28;
  const gray = new Float32Array(size * size);
  let sum = 0, under = 0, over = 0, lapSum = 0, lapSquared = 0;
  for (let i = 0; i < gray.length; i++) {
    gray[i] = .299 * pixels[i * 3] + .587 * pixels[i * 3 + 1] + .114 * pixels[i * 3 + 2];
    sum += gray[i]; under += Number(gray[i] < 12); over += Number(gray[i] > 243);
  }
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = y * size + x;
    const lap = -4 * gray[i] + gray[i - size] + gray[i + size] + gray[i - 1] + gray[i + 1];
    lapSum += lap; lapSquared += lap * lap;
  }
  const count = (size - 2) ** 2;
  const blur = Math.max(0, lapSquared / count - (lapSum / count) ** 2);
  const brightness = sum / gray.length / 255, underFraction = under / gray.length, overFraction = over / gray.length;
  const issues: NonNullable<AnalyzeResponse["quality"]>["issues"] = [];
  const add = (code: string, severity: "warning" | "error", message: string) => issues.push({ code, severity, message });
  if (Math.min(width, height) < 28) add("resolution", "error", "Use an image at least 28 pixels in each direction; resizing cannot restore detail.");
  else if (Math.min(width, height) < 128) add("low_resolution", "warning", "This is a small research image. The model uses only 28×28 pixels; fine lesion detail is lost.");
  if (blur < 2) add("blur", "error", "Too little visible detail. Retake in focus and avoid uniform or blank images.");
  else if (blur < 10) add("blur", "warning", "The image may be blurred. Improve focus before relying on a research score.");
  if (brightness < .08 || underFraction > .85) add("underexposure", "error", "The image is too dark. Use even lighting without deep shadows.");
  else if (brightness < .2) add("underexposure", "warning", "Low light may hide visual detail. Use even lighting.");
  if (brightness > .94 || overFraction > .85) add("overexposure", "error", "The image is washed out. Avoid glare and direct flash.");
  else if (brightness > .85) add("overexposure", "warning", "Bright lighting may wash out detail. Avoid glare.");
  return { width, height, blur_variance: blur, brightness, underexposed_fraction: underFraction, overexposed_fraction: overFraction, issues, passed: !issues.some(i => i.severity === "error") };
}

export function temperatureScores(logits: ArrayLike<number>, temperature: number): number[] {
  const scaled = Array.from(logits, x => x / temperature);
  if (!scaled.every(Number.isFinite) || !Number.isFinite(temperature) || temperature <= 0) throw new Error("Invalid model output.");
  const max = Math.max(...scaled), exp = scaled.map(x => Math.exp(x - max)), total = exp.reduce((a, b) => a + b, 0);
  return exp.map(x => x / total);
}

function activationOverlay(activations: ArrayLike<number>, weights: number[], imageWidth: number, imageHeight: number, size = 7): string {
  const heat = new Float32Array(size * size);
  for (let c = 0; c < weights.length; c++) for (let i = 0; i < heat.length; i++) heat[i] += weights[c] * activations[c * heat.length + i];
  let max = 0;
  for (let i = 0; i < heat.length; i++) { heat[i] = Math.max(0, heat[i]); max = Math.max(max, heat[i]); }
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!; const raster = ctx.createImageData(size, size);
  for (let i = 0; i < heat.length; i++) {
    const value = max > 0 ? heat[i] / max : 0;
    raster.data.set([255, Math.round(200 * (1 - value)), 55, Math.round(value * 220)], i * 4);
  }
  ctx.putImageData(raster, 0, 0);
  // Inference resizes the whole image to a square; map it back to the original
  // aspect ratio so an object-fit:contain overlay aligns even on rectangular inputs.
  const result = document.createElement("canvas"), scale = Math.min(1, 512 / Math.max(imageWidth, imageHeight));
  result.width = Math.max(1, Math.round(imageWidth * scale)); result.height = Math.max(1, Math.round(imageHeight * scale));
  result.getContext("2d")!.drawImage(canvas, 0, 0, result.width, result.height);
  return result.toDataURL("image/png");
}

export async function analyzeBrowserImage(file: File, imageType: ImageType, signal?: AbortSignal, onProgress?: (stage: string) => void): Promise<AnalyzeResponse> {
  const empty = (status: AnalyzeResponse["status"], message: string, model = FALLBACK_MODEL, quality: AnalyzeResponse["quality"] = null): AnalyzeResponse => ({ status, message, model, quality, scores: [], uncertainty: null, explanation: null, next_step: NEXT_STEP });
  checkAbort(signal);
  if (imageType !== "dermoscopic") return empty("unsupported", "This model supports dermoscopic lesion images only. It cannot assess facial selfies, ordinary smartphone photos or an unknown image type.");
  const validation = validateImageFile(file);
  if (!validation.valid) throw new Error(validation.error);
  onProgress?.("Checking image quality…");
  await decodeImage(file); // Includes bounded header inspection before allocating decoded pixels.
  checkAbort(signal);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let pixels: Float32Array;
  const width = bitmap.width, height = bitmap.height;
  try {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Your browser could not decode this image.");
    ctx.drawImage(bitmap, 0, 0);
    pixels = resizeNearest(ctx.getImageData(0, 0, width, height).data, width, height);
    canvas.width = 0; canvas.height = 0;
  } finally { bitmap.close(); }
  const quality = assessBrowserQuality(pixels!, width, height);
  let manifest: Manifest;
  try { manifest = await getManifest(); }
  catch { return empty("unavailable", "Trained model metadata is unavailable. No prediction has been generated.", FALLBACK_MODEL, quality); }
  const model: ModelInfo = { version: manifest.version, architecture: manifest.architecture, input_size: manifest.input_size, supported_image_type: manifest.supported_image_type, classes: manifest.classes, available: true };
  if (!quality.passed) return empty("quality_rejected", "Unable to assess this image. Review the image-quality guidance and try again.", model, quality);
  checkAbort(signal);
  onProgress?.("Loading verified model weights on your device…");
  let session: import("onnxruntime-web").InferenceSession;
  try { session = await getSession(manifest); }
  catch { return empty("unavailable", "The model could not load on this device. No prediction has been generated. Try a current browser or use the local research API.", { ...model, available: false }, quality); }
  checkAbort(signal);
  onProgress?.("Running the trained image classifier…");
  const ort = await import("onnxruntime-web/wasm");
  const tensor = new ort.Tensor("float32", normalizePixels(pixels!, manifest.preprocessing.mean, manifest.preprocessing.std), [1, 3, 28, 28]);
  let outputs: import("onnxruntime-web").InferenceSession.OnnxValueMapType;
  try { outputs = await session.run({ [manifest.onnx.input_name]: tensor }); }
  catch { return empty("unavailable", "Model inference failed. No usable prediction is available.", model, quality); }
  checkAbort(signal);
  const logits = outputs[manifest.onnx.logits_output]?.data as Float32Array | undefined;
  if (!logits || logits.length !== manifest.classes.length) throw new Error("Unexpected model output. No result is available.");
  const rawScores = temperatureScores(logits, manifest.temperature);
  const scores = manifest.classes.map((c, i) => ({ ...c, score: rawScores[i] })).sort((a, b) => b.score - a.score);
  const margin = scores[0].score - scores[1].score, reasons: string[] = [];
  if (scores[0].score < manifest.uncertainty.max_score_threshold) reasons.push("The leading model score is below the research acceptance threshold.");
  if (margin < manifest.uncertainty.margin_threshold) reasons.push("The two leading labels have similar model scores.");
  const rejected = reasons.length > 0;
  onProgress?.("Preparing results and the explanation map…");
  const activations = outputs[manifest.onnx.activations_output]?.data as Float32Array | undefined;
  const index = manifest.classes.findIndex(c => c.id === scores[0].id);
  const explanation = activations?.length === 64 * 7 * 7 ? { heatmap_data_url: activationOverlay(activations, manifest.classifier_weights[index], width, height), method: "CAM (equivalent to final-layer Grad-CAM)", disclaimer: EXPLANATION_LIMIT } : null;
  return { status: rejected ? "uncertain" : "assessed", message: rejected ? "Unable to assess reliably: the model output is uncertain." : "A research model output is available. This is not a clinical diagnosis.", model, scores, quality, uncertainty: { rejected, reasons, score_type: "temperature_scaled_model_score", threshold: manifest.uncertainty.max_score_threshold, margin }, explanation, next_step: NEXT_STEP };
}
