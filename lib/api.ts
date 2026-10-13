import { AnalysisSchema, type AnalyzeResponse, type ImageType } from "@/lib/types";
export const INFERENCE_URL = (process.env.NEXT_PUBLIC_INFERENCE_URL || "").replace(/\/$/, "");
export async function analyzeImage(file: File, imageType: ImageType, signal?: AbortSignal, onProgress?: (stage: string) => void): Promise<AnalyzeResponse> {
  if (imageType === "clinical_photo") {
    const { analyzeClinicalImage } = await import("@/lib/browser-clinical-inference");
    return AnalysisSchema.parse(await analyzeClinicalImage(file, signal, onProgress));
  }
  if (!INFERENCE_URL) {
    const { analyzeBrowserImage } = await import("@/lib/browser-inference");
    return AnalysisSchema.parse(await analyzeBrowserImage(file, imageType, signal, onProgress));
  }
  onProgress?.("Sending image to your configured research service…");
  const form = new FormData(); form.append("file", file); form.append("image_type", imageType); form.append("consent", "true");
  const response = await fetch(`${INFERENCE_URL}/v1/analyze`, { method: "POST", body: form, signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !payload?.status) throw new Error(payload?.detail?.message || (typeof payload?.detail === "string" ? payload.detail : "The inference service could not process this image. Please try again."));
  const parsed = AnalysisSchema.safeParse(payload);
  if (!parsed.success) throw new Error("The inference service returned an invalid response. No result is available.");
  return parsed.data;
}
