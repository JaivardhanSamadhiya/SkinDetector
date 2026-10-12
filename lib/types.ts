import { z } from "zod";
export const ModelSchema = z.object({ version: z.string(), architecture: z.string(), input_size: z.number().optional(), supported_image_type: z.string(), classes: z.array(z.object({ id: z.string(), label: z.string() })), available: z.boolean() });
export const AnalysisSchema = z.object({
  status: z.enum(["assessed", "uncertain", "unsupported", "unavailable", "quality_rejected"]), message: z.string(),
  model: ModelSchema,
  scores: z.array(z.object({ id: z.string(), label: z.string(), score: z.number().min(0).max(1) })),
  quality: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), blur_variance: z.number().nonnegative(), brightness: z.number().min(0).max(1), underexposed_fraction: z.number().min(0).max(1), overexposed_fraction: z.number().min(0).max(1), issues: z.array(z.object({ code: z.string(), severity: z.enum(["warning", "error"]), message: z.string() })), passed: z.boolean() }).nullable(),
  uncertainty: z.object({ rejected: z.boolean(), reasons: z.array(z.string()), score_type: z.literal("temperature_scaled_model_score"), threshold: z.number().min(0).max(1).nullable().optional(), margin: z.number().min(0).max(1).nullable().optional() }).nullable(),
  explanation: z.object({ heatmap_data_url: z.string().max(8_000_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/), method: z.string(), disclaimer: z.string() }).nullable(),
  next_step: z.string()
}).superRefine((value, context) => {
  const hasOutput = value.status === "assessed" || value.status === "uncertain";
  if (!hasOutput) {
    if (value.scores.length || value.explanation) context.addIssue({ code: "custom", message: "Rejected or unavailable images must not contain predictions or an explanation.", path: ["scores"] });
    return;
  }
  const classes = new Map(value.model.classes.map(c => [c.id, c.label]));
  if (!value.model.available || !value.quality?.passed || !value.uncertainty || value.scores.length !== 7 || classes.size !== 7 || new Set(value.scores.map(s => s.id)).size !== 7 || value.scores.some(s => classes.get(s.id) !== s.label) || Math.abs(value.scores.reduce((sum, s) => sum + s.score, 0) - 1) > 1e-4) {
    context.addIssue({ code: "custom", message: "The model output does not match its validated class mapping and score contract.", path: ["scores"] });
  }
  if (value.uncertainty && value.uncertainty.rejected !== (value.status === "uncertain")) context.addIssue({ code: "custom", message: "The result status contradicts the uncertainty decision.", path: ["uncertainty"] });
});
export type AnalyzeResponse = z.infer<typeof AnalysisSchema>;
export type ModelInfo = z.infer<typeof ModelSchema>;
export type ImageType = "dermoscopic" | "smartphone" | "unknown";
