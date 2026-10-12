"""Bounded image decoding, EXIF orientation and deterministic preprocessing."""
from __future__ import annotations

import io
import warnings
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
import torch

from .schemas import Quality, QualityIssue

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 12_000_000
ALLOWED_MIMES = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class ImageValidationError(ValueError):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def decode_image(data: bytes, mime: str | None) -> Image.Image:
    if not data:
        raise ImageValidationError("Choose an image first.")
    if len(data) > MAX_FILE_BYTES:
        raise ImageValidationError("Image must be 10 MB or smaller.", 413)
    if mime not in ALLOWED_MIMES:
        raise ImageValidationError("Only JPEG, PNG and WebP images are supported.", 415)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                if source.format != ALLOWED_MIMES[mime]:
                    raise ImageValidationError("The file contents do not match its image type.", 415)
                if source.width * source.height > MAX_PIXELS:
                    raise ImageValidationError("Image exceeds the 12-megapixel decoding limit.", 413)
                if getattr(source, "n_frames", 1) != 1:
                    raise ImageValidationError("Animated images are unsupported.", 415)
                source.verify()
            with Image.open(io.BytesIO(data)) as source:
                image = ImageOps.exif_transpose(source)
                # Composite transparent pixels against white; never pass hidden RGB to the model.
                if image.mode in ("RGBA", "LA") or "transparency" in image.info:
                    rgba = image.convert("RGBA")
                    white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
                    image = Image.alpha_composite(white, rgba)
                return image.convert("RGB").copy()
    except ImageValidationError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ImageValidationError("Image exceeds the safe decoding limit.", 413) from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise ImageValidationError("This file could not be decoded as a valid image.") from None


def assess_quality(image: Image.Image) -> Quality:
    # Resolution-independent heuristics on exactly the model's 28×28 view.
    pixels = np.asarray(image.resize((28, 28), Image.Resampling.NEAREST), dtype=np.float32)
    gray = pixels[..., 0] * .299 + pixels[..., 1] * .587 + pixels[..., 2] * .114
    laplacian = -4 * gray[1:-1, 1:-1] + gray[:-2, 1:-1] + gray[2:, 1:-1] + gray[1:-1, :-2] + gray[1:-1, 2:]
    blur = float(laplacian.var())
    brightness = float(gray.mean() / 255)
    under = float((gray < 12).mean())
    over = float((gray > 243).mean())
    issues: list[QualityIssue] = []
    if min(image.size) < 28:
        issues.append(QualityIssue(code="resolution", severity="error", message="Use an image at least 28 pixels in each direction; resizing cannot restore detail."))
    elif min(image.size) < 128:
        issues.append(QualityIssue(code="low_resolution", severity="warning", message="This is a small research image. The model uses only 28×28 pixels; fine lesion detail is lost."))
    if blur < 2:
        issues.append(QualityIssue(code="blur", severity="error", message="Too little visible detail. Retake in focus, keep the camera steady and avoid uniform or blank images."))
    elif blur < 10:
        issues.append(QualityIssue(code="blur", severity="warning", message="The image may be blurred. Improve focus before relying on a research score."))
    if brightness < .08 or under > .85:
        issues.append(QualityIssue(code="underexposure", severity="error", message="The image is too dark. Use even lighting without deep shadows."))
    elif brightness < .2:
        issues.append(QualityIssue(code="underexposure", severity="warning", message="Low light may hide visual detail. Use even lighting."))
    if brightness > .94 or over > .85:
        issues.append(QualityIssue(code="overexposure", severity="error", message="The image is washed out. Avoid glare and direct flash."))
    elif brightness > .85:
        issues.append(QualityIssue(code="overexposure", severity="warning", message="Bright lighting may wash out detail. Avoid glare."))
    return Quality(width=image.width, height=image.height, blur_variance=round(blur, 5), brightness=round(brightness, 6), underexposed_fraction=round(under, 6), overexposed_fraction=round(over, 6), issues=issues, passed=not any(i.severity == "error" for i in issues))


def preprocess(image: Image.Image, mean: list[float], std: list[float], size: int = 28) -> torch.Tensor:
    # Pixel-center nearest resize has a deterministic equivalent in TypeScript.
    array = np.asarray(image.resize((size, size), Image.Resampling.NEAREST), dtype=np.float32) / 255
    array = (array - np.asarray(mean, dtype=np.float32)) / np.asarray(std, dtype=np.float32)
    return torch.from_numpy(array.transpose(2, 0, 1).copy()).unsqueeze(0)
