from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ClassLabel(StrictModel):
    id: str
    label: str


class ModelInfo(StrictModel):
    version: str
    architecture: str
    input_size: int
    supported_image_type: str
    classes: list[ClassLabel]
    available: bool


class QualityIssue(StrictModel):
    code: str
    severity: Literal["warning", "error"]
    message: str


class Quality(StrictModel):
    width: int
    height: int
    blur_variance: float
    brightness: float
    underexposed_fraction: float
    overexposed_fraction: float
    issues: list[QualityIssue]
    passed: bool


class Score(ClassLabel):
    score: float = Field(ge=0, le=1)


class Uncertainty(StrictModel):
    rejected: bool
    reasons: list[str]
    score_type: Literal["temperature_scaled_model_score"] = "temperature_scaled_model_score"
    threshold: float
    margin: float


class Explanation(StrictModel):
    heatmap_data_url: str
    method: Literal["CAM (equivalent to final-layer Grad-CAM)"]
    disclaimer: str


class AnalysisResponse(StrictModel):
    status: Literal["assessed", "uncertain", "unsupported", "unavailable", "quality_rejected"]
    message: str
    model: ModelInfo
    scores: list[Score]
    quality: Quality
    uncertainty: Uncertainty
    explanation: Explanation | None
    next_step: str
