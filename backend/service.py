from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import pickle
import re
import threading
from pathlib import Path

import numpy as np
from PIL import Image
import torch

from .images import assess_quality, preprocess
from .model import CLASS_IDS, CLASS_LABELS, SkinCNN, VERSION
from .schemas import AnalysisResponse, ClassLabel, Explanation, ModelInfo, Score, Uncertainty

ROOT = Path(__file__).resolve().parents[1]
NEXT_STEP = "For any new, changing, bleeding, painful or worrying lesion, seek evaluation from a qualified health professional. This research output cannot decide whether care is needed."
ARCHITECTURE = "SkinCNN: Conv24/48/64 + BatchNorm/ReLU, two max pools, global average pooling, linear 7-class head"


class ModelUnavailableError(RuntimeError):
    pass


class ModelService:
    def __init__(self, checkpoint: Path | None = None, manifest: Path | None = None):
        self.checkpoint = checkpoint or Path(os.environ.get("MODEL_CHECKPOINT", ROOT / "models" / "skinsnap_derma_cnn.pt"))
        self.manifest_path = manifest or Path(os.environ.get("MODEL_MANIFEST", ROOT / "public" / "model" / "manifest.json"))
        self.model: SkinCNN | None = None
        self.manifest: dict | None = None
        self._lock = threading.Lock()

    def load(self):
        with self._lock:
            if self.model is not None:
                return
            try:
                manifest = json.loads(self.manifest_path.read_text(encoding="utf-8-sig"))
                if not isinstance(manifest, dict) or manifest["available"] is not True or manifest["version"] != VERSION:
                    raise ValueError("Unavailable or incompatible model")
                if manifest["input_size"] != 28 or manifest["supported_image_type"] != "dermoscopic":
                    raise ValueError("Unsupported model task")
                expected = manifest["checkpoint_sha256"]
                if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
                    raise ValueError("Invalid checkpoint digest")
                if hashlib.sha256(self.checkpoint.read_bytes()).hexdigest() != expected:
                    raise ValueError("Model integrity check failed")
                checkpoint = torch.load(self.checkpoint, map_location="cpu", weights_only=True)
                if checkpoint["version"] != VERSION:
                    raise ValueError("Version mismatch")
                model = SkinCNN()
                model.load_state_dict(checkpoint["state_dict"], strict=True)
                model.eval()
                if manifest["classes"] != [{"id": cid, "label": label} for cid, label in zip(CLASS_IDS, CLASS_LABELS)]:
                    raise ValueError("Unsupported class mapping")
                preprocessing = manifest["preprocessing"]
                mean = np.asarray(preprocessing["mean"], dtype=np.float32)
                std = np.asarray(preprocessing["std"], dtype=np.float32)
                if mean.shape != (3,) or std.shape != (3,) or not np.isfinite(mean).all() or not np.isfinite(std).all() or not (std > 0).all():
                    raise ValueError("Invalid preprocessing")
                expected_preprocessing = {"resize": "nearest", "exif_orientation": True, "transparent_background": "white", "layout": "NCHW", "range_before_normalization": [0, 1]}
                if any(preprocessing[key] != value for key, value in expected_preprocessing.items()):
                    raise ValueError("Unsupported preprocessing")
                temperature = manifest["temperature"]
                if isinstance(temperature, bool) or not isinstance(temperature, (float, int)) or not np.isfinite(temperature) or temperature <= 0:
                    raise ValueError("Invalid calibration")
                if manifest["score_type"] != "temperature_scaled_model_score":
                    raise ValueError("Unsupported score type")
                for key in ("max_score_threshold", "margin_threshold"):
                    value = manifest["uncertainty"][key]
                    if isinstance(value, bool) or not isinstance(value, (float, int)) or not np.isfinite(value) or not 0 <= value <= 1:
                        raise ValueError("Invalid uncertainty rule")
                with torch.no_grad():
                    test = model(torch.zeros(1, 3, 28, 28))
                    if test.shape != (1, 7) or not torch.isfinite(test).all():
                        raise ValueError("Invalid inference output")
                self.manifest, self.model = manifest, model
            except (OSError, RuntimeError, KeyError, IndexError, ValueError, TypeError, AttributeError, EOFError, pickle.UnpicklingError, json.JSONDecodeError):
                raise ModelUnavailableError("The verified trained model is unavailable. No scores were generated.") from None

    def info(self):
        try:
            self.load()
            available = True
        except ModelUnavailableError:
            available = False
        return ModelInfo(version=VERSION, architecture=ARCHITECTURE, input_size=28, supported_image_type="dermoscopic", classes=[ClassLabel(id=cid, label=label) for cid, label in zip(CLASS_IDS, CLASS_LABELS)], available=available)

    def analyze(self, image: Image.Image, image_type: str, include_explanation: bool = True):
        quality = assess_quality(image)
        model_info = self.info()
        threshold, margin_threshold = .65, .15
        blank_uncertainty = Uncertainty(rejected=True, reasons=[], threshold=threshold, margin=0.)
        common = dict(model=model_info, scores=[], quality=quality, uncertainty=blank_uncertainty, explanation=None, next_step=NEXT_STEP)
        if image_type != "dermoscopic":
            common["uncertainty"] = blank_uncertainty.model_copy(update={"reasons": ["Supported image domain was not confirmed. There is no validated automatic domain detector."]})
            return AnalysisResponse(status="unsupported", message="Unable to assess: this model supports dermoscopic lesion images only. Smartphone photographs, selfies and unknown image types are outside its evaluated task.", **common)
        if not quality.passed:
            common["uncertainty"] = blank_uncertainty.model_copy(update={"reasons": [i.message for i in quality.issues if i.severity == "error"]})
            return AnalysisResponse(status="quality_rejected", message="Unable to assess: the image failed basic technical checks. These checks do not establish medical suitability.", **common)
        if not model_info.available:
            common["uncertainty"] = blank_uncertainty.model_copy(update={"reasons": ["Verified model weights could not be loaded."]})
            return AnalysisResponse(status="unavailable", message="Inference is unavailable. No prediction or score has been generated.", **common)
        manifest, model = self.manifest, self.model
        threshold = manifest["uncertainty"]["max_score_threshold"]
        margin_threshold = manifest["uncertainty"]["margin_threshold"]
        try:
            tensor = preprocess(image, manifest["preprocessing"]["mean"], manifest["preprocessing"]["std"])
            with torch.no_grad():
                logits, activations = model.explain(tensor)
                if logits.shape != (1, 7) or activations.shape != (1, 64, 7, 7) or not torch.isfinite(logits).all() or not torch.isfinite(activations).all():
                    raise ModelUnavailableError("Inference failed safely. No usable scores were generated.")
                probabilities = torch.softmax(logits / manifest["temperature"], dim=1)[0].numpy()
        except (RuntimeError, ValueError, TypeError, IndexError, AttributeError):
            raise ModelUnavailableError("Inference failed safely. No usable scores were generated.") from None
        if not np.isfinite(probabilities).all():
            raise ModelUnavailableError("Inference failed safely. No usable scores were generated.")
        ranking = np.argsort(probabilities)[::-1]
        top, second = int(ranking[0]), int(ranking[1])
        margin = float(probabilities[top] - probabilities[second])
        reasons = []
        if probabilities[top] < threshold:
            reasons.append(f"Top model score is below the fixed research threshold ({threshold:.2f}).")
        if margin < margin_threshold:
            reasons.append(f"Two leading model scores are close (minimum margin {margin_threshold:.2f}).")
        scores = [Score(id=CLASS_IDS[i], label=CLASS_LABELS[i], score=float(probabilities[i])) for i in ranking]
        explanation = None
        if include_explanation:
            weights = model.classifier.weight[top].detach().numpy()
            cam = np.maximum((activations[0].numpy() * weights[:, None, None]).sum(axis=0), 0)
            if cam.max() > 1e-8:
                cam = cam / cam.max()
            colors = np.stack([np.clip(2 * cam, 0, 1), np.clip(2 - 2 * cam, 0, 1), 1 - cam], axis=2)
            heatmap = Image.fromarray(np.uint8(colors * 255)).resize((image.width, image.height), Image.Resampling.BILINEAR)
            heatmap.thumbnail((1024, 1024))
            buffer = io.BytesIO()
            heatmap.save(buffer, format="PNG")
            explanation = Explanation(heatmap_data_url="data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"), method="CAM (equivalent to final-layer Grad-CAM)", disclaimer="Highlights final-layer features influencing the top model score. A coarse activation map is not a lesion boundary, causal explanation or evidence that the label is medically correct.")
        return AnalysisResponse(status="uncertain" if reasons else "assessed", message="Unable to assess reliably: the model's research uncertainty rule rejected this result." if reasons else "Research model output generated. Scores rank dataset labels; this is not a diagnosis or an all-clear.", model=model_info, scores=scores, quality=quality, uncertainty=Uncertainty(rejected=bool(reasons), reasons=reasons, threshold=threshold, margin=margin), explanation=explanation, next_step=NEXT_STEP)
