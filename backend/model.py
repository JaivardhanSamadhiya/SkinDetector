"""Small, explicitly research-only CNN shared by training and inference."""
from __future__ import annotations

import torch
from torch import nn

CLASS_IDS = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]
CLASS_LABELS = [
    "Actinic keratosis / intraepithelial carcinoma",
    "Basal cell carcinoma",
    "Benign keratosis-like lesions",
    "Dermatofibroma",
    "Melanoma",
    "Melanocytic nevi",
    "Vascular lesions",
]
VERSION = "skinsnap-derma-cnn-v1"
INPUT_SIZE = 28


class SkinCNN(nn.Module):
    """RGB28 → 24/48/64 convolutions → GAP → 7-class linear layer.

    No pretrained weights. GAP + a linear head makes CAM algebraically
    equivalent (up to a positive scale) to Grad-CAM at the final activation.
    """

    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 24, 3, padding=1, bias=False), nn.BatchNorm2d(24), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(24, 48, 3, padding=1, bias=False), nn.BatchNorm2d(48), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(48, 64, 3, padding=1, bias=False), nn.BatchNorm2d(64), nn.ReLU(),
        )
        self.classifier = nn.Linear(64, 7)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        activations = self.features(x)
        return self.classifier(activations.mean(dim=(2, 3)))

    def explain(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        activations = self.features(x)
        return self.classifier(activations.mean(dim=(2, 3))), activations


class ExportModel(nn.Module):
    def __init__(self, model: SkinCNN) -> None:
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        return self.model.explain(x)
