import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLINICAL_CLASSES } from "@/lib/clinical-task";
import { PHOTO_MODEL_VERSION, PhotoManifestSchema } from "@/lib/browser-photo-inference";

const runtime = vi.hoisted(() => ({ create: vi.fn(), run: vi.fn(), tensor: vi.fn() }));
vi.mock("onnxruntime-web/wasm", () => ({
  env: { wasm: {} },
  InferenceSession: { create: runtime.create },
  Tensor: class {
    constructor(public type: string, public data: Float32Array, public dims: number[]) {
      runtime.tensor(type, data, dims);
    }
  },
}));

// Synthetic transport/decoder/runtime fixtures only. They do not supply app
// predictions, real trained weights, evaluation metrics, or classifier evidence.
const weightBytes = new Uint8Array([11, 24, 39, 52, 78]);
const weightHash = createHash("sha256").update(weightBytes).digest("hex");
function manifestFixture() {
  return {
    version: PHOTO_MODEL_VERSION, architecture: "DINOv2 Small + linear head; synthetic contract fixture",
    backbone: "dinov2_vits14", head: "linear", input_size: 224,
    supported_image_type: "clinical_photo", available: true, classes: CLINICAL_CLASSES.map(item => ({ ...item })),
    preprocessing: { mean: [.485, .456, .406], std: [.229, .224, .225], resize: "nearest" },
    temperature: 1, uncertainty: { max_score_threshold: .65, margin_threshold: .15 },
    readiness: {
      passed: true, clinical_validation: false, independent_holdout: true,
      benchmark_minimums_passed: true, blocked_by_previously_examined_test: false,
      sufficient_supported_class_samples: true, scin_dermatitis_recall_minimum_passed: true,
      minimums: { macro_f1: .6, balanced_accuracy: .6, acne_recall: .5, dermatitis_recall: .5 },
      measured: { macro_f1: .7, balanced_accuracy: .7, acne_recall: .6, dermatitis_recall: .6 },
    },
    test_group_support: { acne: 31, dermatitis: 38, other: 200 },
    deployment_validation: { onnx_verified: true, quantized_benchmark_passed: true, preprocessing_verified: true },
    onnx: { url: "/model-photo/model.onnx", sha256: weightHash, input_name: "image", logits_output: "logits" },
  };
}

type ManifestFixture = ReturnType<typeof manifestFixture>;
const invalidManifests: [string, (value: ManifestFixture) => void][] = [
  ["unavailable flag", value => { value.available = false; }],
  ["unreviewed version", value => { value.version = "unreviewed"; }],
  ["unreviewed backbone", value => { value.backbone = "different-model"; }],
  ["unreviewed head", value => { value.head = "other"; }],
  ["wrong input size", value => { value.input_size = 128; }],
  ["wrong domain", value => { value.supported_image_type = "dermoscopic"; }],
  ["wrong class order", value => { value.classes.reverse(); }],
  ["duplicate class", value => { value.classes[1] = value.classes[0]; }],
  ["failed readiness", value => { value.readiness.passed = false; }],
  ["examined test", value => { value.readiness.blocked_by_previously_examined_test = true; }],
  ["missing independent holdout", value => { value.readiness.independent_holdout = false; }],
  ["failed benchmark", value => { value.readiness.benchmark_minimums_passed = false; }],
  ["unsupported clinical-validation claim", value => { value.readiness.clinical_validation = true; }],
  ["insufficient supported groups flag", value => { value.readiness.sufficient_supported_class_samples = false; }],
  ["insufficient SCIN recall flag", value => { value.readiness.scin_dermatitis_recall_minimum_passed = false; }],
  ["low measured F1", value => { value.readiness.measured.macro_f1 = .59; }],
  ["low measured balanced accuracy", value => { value.readiness.measured.balanced_accuracy = .59; }],
  ["low measured acne recall", value => { value.readiness.measured.acne_recall = .49; }],
  ["low measured dermatitis recall", value => { value.readiness.measured.dermatitis_recall = .49; }],
  ["weakened minimum", value => { value.readiness.minimums.acne_recall = .1; }],
  ["too few acne groups", value => { value.test_group_support.acne = 29; }],
  ["too few dermatitis groups", value => { value.test_group_support.dermatitis = 29; }],
  ["unverified ONNX", value => { value.deployment_validation.onnx_verified = false; }],
  ["failed quantized benchmark", value => { value.deployment_validation.quantized_benchmark_passed = false; }],
  ["unverified preprocessing", value => { value.deployment_validation.preprocessing_verified = false; }],
  ["foreign model URL", value => { value.onnx.url = "https://example.invalid/model.onnx"; }],
  ["wrong model path", value => { value.onnx.url = "/model-clinical/model.onnx"; }],
  ["invalid artifact hash", value => { value.onnx.sha256 = "not-a-hash"; }],
  ["wrong input tensor name", value => { value.onnx.input_name = "pixels"; }],
  ["wrong output tensor name", value => { value.onnx.logits_output = "probability"; }],
  ["wrong normalization", value => { value.preprocessing.mean[0] = .5; }],
  ["wrong standard deviation", value => { value.preprocessing.std[2] = .5; }],
  ["different interpolation", value => { value.preprocessing.resize = "bilinear"; }],
  ["invalid temperature", value => { value.temperature = Number.POSITIVE_INFINITY; }],
  ["weakened score threshold", value => { value.uncertainty.max_score_threshold = .64; }],
  ["weakened margin threshold", value => { value.uncertainty.margin_threshold = .14; }],
];

describe("photo-v2 research manifest", () => {
  it("accepts the complete transport contract for each declared architecture and head", () => {
    for (const backbone of ["dinov2_vits14", "dinov2_vitb14"]) for (const head of ["linear", "rbf"]) {
      expect(PhotoManifestSchema.safeParse({ ...manifestFixture(), backbone, head }).success).toBe(true);
    }
  });

  it.each(invalidManifests)("rejects %s even with available=true", (_name, mutate) => {
    const value = manifestFixture();
    mutate(value);
    expect(PhotoManifestSchema.safeParse(value).success).toBe(false);
  });
});

function pngFile(width = 128, height = 128) {
  const header = new Uint8Array(33);
  header.set([137, 80, 78, 71, 13, 10, 26, 10]);
  header.set(new TextEncoder().encode("IHDR"), 12);
  const view = new DataView(header.buffer);
  view.setUint32(8, 13); view.setUint32(16, width); view.setUint32(20, height);
  header[24] = 8; header[25] = 6;
  return new File([header], "synthetic-decoder-fixture.png", { type: "image/png" });
}

function logitOutput(values: number[] = [4, 1, 0]) {
  return { logits: { type: "float32", data: new Float32Array(values), dims: [1, 3] } };
}

function installBrowser(width = 128, height = 128, flat?: number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = flat ?? (60 + (x * 13 + y * 7) % 140);
    rgba.set([value, value, value, 255], (y * width + x) * 4);
  }
  const close = vi.fn();
  const bitmap = vi.fn().mockImplementation(async () => ({ width, height, close }));
  const canvases: { width: number; height: number; getContext: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal("createImageBitmap", bitmap);
  vi.stubGlobal("window", { location: { origin: "https://skinsnap.example" } });
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("document", { createElement: vi.fn((tag: string) => {
    if (tag !== "canvas") throw new Error("Unexpected test element");
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: rgba })) })) };
    canvases.push(canvas);
    return canvas;
  }) });
  return { rgba, close, bitmap, canvases };
}

function serve(value = manifestFixture(), bytes = weightBytes) {
  const fetch = vi.fn(async (input: string | URL, _init?: RequestInit) => {
    if (String(input) === "/model-photo/manifest.json") return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    if (String(input) === "/model-photo/model.onnx") return new Response(bytes, { status: 200 });
    throw new Error("Unexpected network request: " + String(input));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("photo-v2 browser inference failure boundaries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    runtime.create.mockResolvedValue({ run: runtime.run });
    runtime.run.mockResolvedValue(logitOutput());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("never downloads weights or executes a session for an unavailable artifact", async () => {
    installBrowser();
    const value = manifestFixture(); value.available = false;
    const fetch = serve(value);
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    const result = await analyzePhotoImage(pngFile());
    expect(result).toMatchObject({ status: "unavailable", scores: [], explanation: null, uncertainty: null, model: { available: false } });
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(["/model-photo/manifest.json"]);
    expect(runtime.create).not.toHaveBeenCalled();
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it("does not bypass deployment checks when declared availability and readiness are true", async () => {
    installBrowser();
    const value = manifestFixture(); value.deployment_validation.quantized_benchmark_passed = false;
    const fetch = serve(value);
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    expect((await analyzePhotoImage(pngFile())).status).toBe("unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(runtime.create).not.toHaveBeenCalled();
  });

  it("checks file and decoded dimension bounds before metadata or model access", async () => {
    const browser = installBrowser(); const fetch = serve();
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    await expect(analyzePhotoImage(new File(["script"], "script.svg", { type: "image/svg+xml" }))).rejects.toThrow(/JPEG, PNG, or WebP/);
    await expect(analyzePhotoImage(pngFile(4000, 4000))).rejects.toThrow(/12 megapixels/);
    expect(browser.bitmap).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["low-resolution", "dark", "blank"])("rejects %s images before fetching model metadata", async kind => {
    const size = kind === "low-resolution" ? 127 : 128;
    const browser = installBrowser(size, 128, kind === "dark" ? 0 : kind === "blank" ? 128 : undefined);
    const fetch = serve();
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    const result = await analyzePhotoImage(pngFile(size, 128));
    expect(result.status).toBe("quality_rejected");
    expect(result.scores).toEqual([]);
    expect(result.quality?.passed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledTimes(2);
  });

  it("builds the 224px CHW tensor with white alpha, uses fixed output mapping, and clears bitmap/canvas resources", async () => {
    const browser = installBrowser();
    browser.rgba.set([0, 0, 0, 0], 0);
    browser.rgba.set([0, 0, 0, 128], 4);
    const fetch = serve(); const progress = vi.fn();
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    const file = pngFile();
    const result = await analyzePhotoImage(file, undefined, progress);
    expect(browser.bitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(browser.close).toHaveBeenCalledTimes(2);
    expect(browser.canvases.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
    const [type, tensor, dimensions] = runtime.tensor.mock.calls[0] as [string, Float32Array, number[]];
    expect(type).toBe("float32");
    expect(dimensions).toEqual([1, 3, 224, 224]);
    expect(tensor.length).toBe(3 * 224 * 224);
    expect(tensor[0]).toBeCloseTo((1 - .485) / .229, 5);
    expect(tensor[2]).toBeCloseTo((127 / 255 - .485) / .229, 5);
    expect(tensor[224 * 224]).toBeCloseTo((1 - .456) / .224, 5);
    expect(result.status).toBe("assessed");
    expect(result.scores.map(score => score.id)).toEqual(["acne", "dermatitis", "other"]);
    expect(result.scores.reduce((sum, score) => sum + score.score, 0)).toBeCloseTo(1);
    expect(result.explanation).toBeNull();
    expect(result.message).toContain("not a diagnosis");
    expect(progress).toHaveBeenCalledWith("Preparing the research result and its limitations…");
    expect(fetch.mock.calls.every(([, init]) => !init || !(init as RequestInit).body)).toBe(true);
  });

  it("shares validated model resources across sequential images without caching their pixels", async () => {
    const browser = installBrowser(); const fetch = serve();
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    await analyzePhotoImage(pngFile());
    const firstPixel = (runtime.tensor.mock.calls[0][1] as Float32Array)[0];
    browser.rgba[0] = 210;
    await analyzePhotoImage(pngFile());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(runtime.create).toHaveBeenCalledTimes(1);
    expect(runtime.run).toHaveBeenCalledTimes(2);
    expect((runtime.tensor.mock.calls[1][1] as Float32Array)[0]).not.toBe(firstPixel);
  });

  it("retries failed metadata instead of caching the failure", async () => {
    installBrowser(); const fetch = serve();
    fetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    expect((await analyzePhotoImage(pngFile())).status).toBe("unavailable");
    expect((await analyzePhotoImage(pngFile())).status).toBe("assessed");
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("manifest.json"))).toHaveLength(2);
  });

  it("verifies bytes before loading ONNX and permits a clean retry after an integrity failure", async () => {
    installBrowser(); const fetch = serve(manifestFixture(), new Uint8Array([0]));
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    const result = await analyzePhotoImage(pngFile());
    expect(result.status).toBe("unavailable");
    expect(result.scores).toEqual([]);
    expect(runtime.create).not.toHaveBeenCalled();
    fetch.mockImplementation(async input => String(input).endsWith("manifest.json")
      ? new Response(JSON.stringify(manifestFixture()), { status: 200 })
      : new Response(weightBytes, { status: 200 }));
    expect((await analyzePhotoImage(pngFile())).status).toBe("assessed");
    expect(runtime.create).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized declared model downloads before constructing an ONNX session", async () => {
    installBrowser(); const fetch = serve();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(manifestFixture()), { status: 200 }));
    fetch.mockResolvedValueOnce(new Response(weightBytes, { status: 200, headers: { "content-length": String(513 * 1024 * 1024) } }));
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    expect((await analyzePhotoImage(pngFile())).status).toBe("unavailable");
    expect(runtime.create).not.toHaveBeenCalled();
  });

  it("rejects a confident other category without presenting an out-of-domain guarantee", async () => {
    installBrowser(); serve(); runtime.run.mockResolvedValue(logitOutput([0, 1, 5]));
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    const result = await analyzePhotoImage(pngFile());
    expect(result.status).toBe("uncertain");
    expect(result.scores[0].id).toBe("other");
    expect(result.uncertainty?.rejected).toBe(true);
    expect(result.uncertainty?.reasons.join(" ")).toContain("not a validated detector");
    expect(result.explanation).toBeNull();
  });

  it("applies both score and margin uncertainty rules to close scores", async () => {
    installBrowser(); serve(); runtime.run.mockResolvedValue(logitOutput([1, 1, 0]));
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    const result = await analyzePhotoImage(pngFile());
    expect(result.status).toBe("uncertain");
    expect(result.uncertainty?.reasons).toHaveLength(2);
    expect(result.uncertainty?.margin).toBe(0);
  });

  it("honors a stricter artifact threshold rather than silently using the minimum", async () => {
    installBrowser(); const value = manifestFixture(); value.uncertainty.max_score_threshold = .99; serve(value);
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    const result = await analyzePhotoImage(pngFile());
    expect(result.status).toBe("uncertain");
    expect(result.uncertainty?.threshold).toBe(.99);
  });

  it.each([
    ["missing logits", {}],
    ["wrong shape", { logits: { type: "float32", data: new Float32Array([4, 1, 0]), dims: [3, 1] } }],
    ["wrong type", { logits: { type: "int32", data: new Int32Array([4, 1, 0]), dims: [1, 3] } }],
    ["non-finite logits", logitOutput([4, Number.NaN, 0])],
  ])("returns no scores for %s", async (_name, output) => {
    installBrowser(); serve(); runtime.run.mockResolvedValue(output);
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    expect(await analyzePhotoImage(pngFile())).toMatchObject({ status: "unavailable", scores: [], explanation: null, uncertainty: null });
  });

  it("recovers from session creation or execution failures on a later attempt", async () => {
    installBrowser(); serve(); runtime.create.mockRejectedValueOnce(new Error("unsupported runtime"));
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    expect((await analyzePhotoImage(pngFile())).status).toBe("unavailable");
    runtime.run.mockRejectedValueOnce(new Error("execution failed"));
    expect((await analyzePhotoImage(pngFile())).status).toBe("unavailable");
    expect((await analyzePhotoImage(pngFile())).status).toBe("assessed");
    expect(runtime.create).toHaveBeenCalledTimes(3);
  });

  it("honors cancellation before decoding or network access", async () => {
    const browser = installBrowser(); const fetch = serve();
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    const controller = new AbortController(); controller.abort();
    await expect(analyzePhotoImage(pngFile(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(browser.bitmap).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not publish a result when cancelled during pending inference", async () => {
    installBrowser(); serve();
    let resolveRun!: (value: ReturnType<typeof logitOutput>) => void;
    runtime.run.mockImplementationOnce(() => new Promise(resolve => { resolveRun = resolve; }));
    const { analyzePhotoImage } = await import("@/lib/browser-photo-inference");
    const controller = new AbortController();
    const pending = analyzePhotoImage(pngFile(), controller.signal);
    await vi.waitFor(() => expect(runtime.run).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    resolveRun(logitOutput());
  });
});
