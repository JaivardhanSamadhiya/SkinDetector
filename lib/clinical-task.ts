export const CLINICAL_MODEL_VERSION = "skinsnap-scin-mobilenet-v1";
export const PHOTO_MODEL_VERSION = "skinsnap-photo-dinov2-v2";
export const PHOTO_MODEL_INPUT_SIZE = 224;
export const CLINICAL_CLASSES = [
  { id: "acne", label: "Acne-like appearance" },
  { id: "dermatitis", label: "Dermatitis-like appearance" },
  { id: "other", label: "Other / unsupported appearance" },
] as const;
