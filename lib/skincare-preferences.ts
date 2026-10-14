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
  totalBudgetUsd: z.number().finite().min(0).max(10000)
    .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Use dollars and cents (at most two decimal places).")
    .default(50),
  texture: z.enum(["any", "light", "rich"]),
  avoid: uniqueSelections(z.enum(SKINCARE_AVOIDANCES)),
  owned: uniqueSelections(z.enum(SKINCARE_STEPS)),
});

// Old session/test inputs without a numeric cap remain valid; parsing always supplies it.
export type SkincarePreferences = z.input<typeof SkincarePreferencesSchema>;
export type NormalizedSkincarePreferences = z.output<typeof SkincarePreferencesSchema>;
export type SkincareStepId = (typeof SKINCARE_STEPS)[number];
export type SkincareAvoidance = (typeof SKINCARE_AVOIDANCES)[number];

export const DEFAULT_SKINCARE_PREFERENCES: SkincarePreferences = {
  skinFeel: "unsure",
  sensitivity: "unsure",
  budget: "minimal",
  totalBudgetUsd: 50,
  texture: "any",
  avoid: [],
  owned: [],
};
