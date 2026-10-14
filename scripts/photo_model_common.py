"""Shared, deterministic preprocessing and models for the second photo experiment."""
from __future__ import annotations

import hashlib
import json
import inspect
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps
import torch
from torch import nn

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/photo-v2"
MODEL = ROOT / "models/photo-v2"
SEED = 20261013
SIZE = 224
CLASSES = ["acne", "dermatitis", "other"]
LABELS = ["Acne-like appearance", "Dermatitis-like appearance", "Other / unsupported appearance"]
MEAN = np.array([.485, .456, .406], dtype=np.float32)
STD = np.array([.229, .224, .225], dtype=np.float32)
DINOV2_COMMIT = "7764ea0f912e53c92e82eb78a2a1631e92725fc8"


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temp.replace(path)


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def rgb_image(image):
    image = ImageOps.exif_transpose(image)
    if image.mode == "RGB":
        return image
    if image.mode not in {"RGBA", "LA", "P"}:
        return image.convert("RGB")
    image = image.convert("RGBA")
    background = Image.new("RGBA", image.size, "white")
    background.alpha_composite(image)
    return background.convert("RGB")


def resize_rgb(image, size=SIZE):
    """Whole-image pixel-center nearest resize, exactly reproducible in JS.

    No random crop can remove the visible concern. Aspect distortion is a stated
    limitation; this transform does not establish clinical image suitability.
    """
    a = np.asarray(rgb_image(image))
    h, w = a.shape[:2]
    xs = np.minimum(w - 1, np.floor((np.arange(size) + .5) * w / size).astype(int))
    ys = np.minimum(h - 1, np.floor((np.arange(size) + .5) * h / size).astype(int))
    return a[ys[:, None], xs[None, :]].copy()


def preprocess(image):
    a = resize_rgb(image).astype(np.float32) / 255.
    return np.transpose((a - MEAN) / STD, (2, 0, 1)).copy()


def preprocessing_fingerprint():
    value = {"size": SIZE, "mean": MEAN.tolist(), "std": STD.tolist(), "code": [inspect.getsource(f) for f in [rgb_image, resize_rgb, preprocess]]}
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def backbone_artifact(name):
    path = ROOT / "data/torch-cache/checkpoints" / (name + "_pretrain.pth")
    if not path.exists(): raise FileNotFoundError("Pretrained artifact not downloaded: " + str(path))
    return {"name": name, "sha256": sha256(path), "bytes": path.stat().st_size, "source_commit": DINOV2_COMMIT,
            "url": f"https://dl.fbaipublicfiles.com/dinov2/{name}/{name}_pretrain.pth"}


def load_backbone(name="dinov2_vits14"):
    vendor = ROOT / "data/vendor/dinov2"
    if not vendor.exists():
        raise FileNotFoundError("Clone facebookresearch/dinov2 at " + DINOV2_COMMIT + " into data/vendor/dinov2 first.")
    import subprocess
    revision = subprocess.check_output(["git", "-c", "safe.directory=" + vendor.as_posix(), "-C", str(vendor), "rev-parse", "HEAD"], text=True).strip()
    if revision != DINOV2_COMMIT:
        raise ValueError("DINOv2 source revision differs from the recorded protocol.")
    torch.hub.set_dir(str(ROOT / "data/torch-cache"))
    return torch.hub.load(str(vendor), name, source="local", pretrained=True, verbose=False).eval()


class FeatureModel(nn.Module):
    def __init__(self, backbone):
        super().__init__()
        self.backbone = backbone

    def forward(self, image):
        x = self.backbone.forward_features(image)
        return torch.cat([x["x_norm_clstoken"], x["x_norm_patchtokens"].mean(dim=1)], dim=1)


class PhotoModel(nn.Module):
    def __init__(self, backbone, weights, bias, centers=None, gamma=None):
        super().__init__()
        self.features = FeatureModel(backbone)
        self.register_buffer("weights", torch.tensor(weights, dtype=torch.float32))
        self.register_buffer("bias", torch.tensor(bias, dtype=torch.float32))
        self.register_buffer("centers", torch.tensor(centers, dtype=torch.float32) if centers is not None else None)
        self.gamma = gamma

    def forward(self, image):
        features = self.features(image)
        if self.centers is not None:
            # A train-only radial-basis feature map; all operators have browser ONNX implementations.
            distance = (features * features).sum(dim=1, keepdim=True) + (self.centers * self.centers).sum(dim=1)[None, :] - 2 * features @ self.centers.T
            features = torch.exp(-self.gamma * torch.clamp(distance, min=0))
        return features @ self.weights.T + self.bias
