import { z } from "zod";

export const SKINCARE_STEPS = ["cleanser", "moisturizer", "sunscreen"] as const;
export const SKINCARE_AVOIDANCES = ["fragrance", "niacinamide", "oat"] as const;

const uniqueSelections = <T extends z.ZodType>(item: T) =>
  z.array(item).max(3).refine((values) => new Set(values).size === values.length, "Choose each option only once.");

/** Self-reported preferences, never inferred from an image or a model label. */
export const SkincarePreferencesSchema = z.strictObject({
  skinFeel: z.enum(["unsure", "dry", "oily", "combination", "balanced"]),
  sensitivity: z.enum(["unsure", "yes", "no"]),
  budget: z.enum(["minimal", "flexible"]),
  texture: z.enum(["any", "light", "rich"]),
  avoid: uniqueSelections(z.enum(SKINCARE_AVOIDANCES)),
  owned: uniqueSelections(z.enum(SKINCARE_STEPS)),
});

export type SkincarePreferences = z.infer<typeof SkincarePreferencesSchema>;
export type SkincareStepId = (typeof SKINCARE_STEPS)[number];
export type SkincareAvoidance = (typeof SKINCARE_AVOIDANCES)[number];

export const DEFAULT_SKINCARE_PREFERENCES: SkincarePreferences = {
  skinFeel: "unsure",
  sensitivity: "unsure",
  budget: "minimal",
  texture: "any",
  avoid: [],
  owned: [],
};
