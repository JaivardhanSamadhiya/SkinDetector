import { AnalysisSchema } from "./types";

export interface ResultGuidance {
  title: string;
  description: string;
  nextStep: string;
  source: { title: string; url: string };
  labelId?: string;
}

const GENERAL_SOURCE = {
  title: "American Academy of Dermatology · Skin cancer symptoms and diagnosis",
  url: "https://www.aad.org/public/diseases/skin-cancer",
};

const GENERAL_NEXT_STEP = "Have a new, changing, bleeding, painful or non-healing spot examined by a healthcare professional regardless of the model output. The skincare options below do not treat or rule out a lesion.";

const LABELS = {
  akiec: "Actinic keratosis / intraepithelial carcinoma",
  bcc: "Basal cell carcinoma",
  bkl: "Benign keratosis-like lesions",
  df: "Dermatofibroma",
  mel: "Melanoma",
  nv: "Melanocytic nevi",
  vasc: "Vascular lesions",
} as const;

type LabelId = keyof typeof LABELS;

const LABEL_GUIDANCE: Record<LabelId, Omit<ResultGuidance, "labelId">> = {
  mel: {
    title: "About the melanoma model label",
    description: "Melanoma is the highest-ranked dataset category. This research score cannot diagnose cancer or determine whether a spot is harmless.",
    nextStep: "Arrange a professional skin examination for a new, changing or different-looking spot, or one that bleeds, hurts or does not heal. Do not delay care because of a model score or skincare purchase.",
    source: { title: "American Academy of Dermatology · Melanoma signs and symptoms", url: "https://www.aad.org/public/diseases/skin-cancer/types/common/melanoma/symptoms" },
  },
  bcc: {
    title: "About the basal cell carcinoma model label",
    description: "Basal cell carcinoma is the highest-ranked dataset category. A photograph and model score cannot confirm this cancer; examination and sometimes a biopsy are needed.",
    nextStep: "Have a persistent, changing, bleeding or non-healing spot examined by a healthcare professional. General skincare products do not treat basal cell carcinoma.",
    source: { title: "American Academy of Dermatology · Basal cell carcinoma", url: "https://www.aad.org/public/diseases/skin-cancer/basal-cell-carcinoma/" },
  },
  akiec: {
    title: "About the actinic keratosis / intraepithelial carcinoma model label",
    description: "This benchmark groups actinic keratosis with intraepithelial carcinoma. The model cannot distinguish or confirm these conditions.",
    nextStep: "Arrange an examination of a persistent rough patch, new growth or lip change. A clinician can confirm the cause and discuss treatment; skincare purchases are not treatment for this category.",
    source: { title: "American Academy of Dermatology · Actinic keratosis diagnosis and treatment", url: "https://www.aad.org/public/diseases/skin-cancer/actinic-keratosis-treatment" },
  },
  nv: {
    title: "About the melanocytic nevi model label",
    description: "Melanocytic nevi (moles) is the highest-ranked dataset category. A mole-like ranking cannot establish that a spot is benign or exclude melanoma.",
    nextStep: "Have a changing or different-looking mole examined by a healthcare professional. Do not use this score or a skincare routine as an all-clear.",
    source: { title: "American Academy of Dermatology · Moles signs and symptoms", url: "https://www.aad.org/public/diseases/a-z/moles-symptoms" },
  },
  bkl: {
    title: "About the benign keratosis-like model label",
    description: "Benign keratosis-like lesions is a dataset grouping. It does not prove this spot is benign or confirm seborrheic keratosis; other growths can look similar.",
    nextStep: "Have new, changing, irritated or bleeding growths checked by a healthcare professional. Avoid trying to remove an unidentified spot yourself.",
    source: { title: "American Academy of Dermatology · Seborrheic keratoses diagnosis and treatment", url: "https://www.aad.org/public/diseases/a-z/seborrheic-keratoses-treatment" },
  },
  df: {
    title: "About the dermatofibroma model label",
    description: "Dermatofibroma is the highest-ranked dataset category. This model cannot confirm the cause of a bump or exclude a look-alike.",
    nextStep: GENERAL_NEXT_STEP,
    source: GENERAL_SOURCE,
  },
  vasc: {
    title: "About the vascular lesions model label",
    description: "Vascular lesions is a broad benchmark category, not a confirmed diagnosis. The score does not establish which type of growth is present.",
    nextStep: GENERAL_NEXT_STEP,
    source: GENERAL_SOURCE,
  },
};

function genericGuidance(description: string): ResultGuidance {
  return {
    title: "Unable to assess · general care only",
    description,
    nextStep: GENERAL_NEXT_STEP,
    source: { ...GENERAL_SOURCE },
  };
}

/** Educational context only: model labels never select or prescribe products. */
export function buildResultGuidance(result?: unknown): ResultGuidance | null {
  if (result === null || result === undefined) return null;

  const parsed = AnalysisSchema.safeParse(result);
  if (!parsed.success) {
    return genericGuidance("The analysis response could not be validated. No condition-specific recommendation is made; general-care options use your stated preferences only.");
  }

  const analysis = parsed.data;
  if (analysis.status === "uncertain") {
    return genericGuidance("The model's uncertainty rule rejected this output. No condition-specific recommendation is made; general-care options use your stated preferences only.");
  }
  if (analysis.status === "unsupported") {
    return genericGuidance("This image type is outside the tested dermoscopic task. This model cannot identify acne, rosacea, eczema or your skin type from a selfie; general-care options use your stated preferences only.");
  }
  if (analysis.status === "unavailable") {
    return genericGuidance("Image analysis is unavailable. No condition-specific recommendation is made; general-care options use your stated preferences only.");
  }
  if (analysis.status === "quality_rejected") {
    return genericGuidance("The image did not pass the research quality checks. Retake guidance does not establish clinical suitability; no condition-specific recommendation is made.");
  }

  // Transport validity alone does not establish that a new model shares this task.
  const knownTask = analysis.model.supported_image_type === "dermoscopic"
    && analysis.model.input_size === 28
    && analysis.model.classes.length === Object.keys(LABELS).length
    && analysis.model.classes.every(({ id, label }) => Object.hasOwn(LABELS, id) && LABELS[id as LabelId] === label);
  if (!knownTask) {
    return genericGuidance("This model's image task or class mapping does not match the documented research categories. No condition-specific recommendation is made.");
  }

  const top = analysis.scores.reduce((highest, score) => score.score > highest.score ? score : highest);
  const guidance = LABEL_GUIDANCE[top.id as LabelId];
  return { ...guidance, labelId: top.id, source: { ...guidance.source } };
}
