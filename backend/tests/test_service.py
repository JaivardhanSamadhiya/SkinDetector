import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
import pytest
from pydantic import ValidationError
import torch

from backend.model import SkinCNN, VERSION
from backend.service import ModelService, ModelUnavailableError
from backend.schemas import AnalysisResponse, Score

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def trained_service():
    result = ModelService()
    result.load()
    return result


def patterned_image():
    rng = np.random.default_rng(3)
    return Image.fromarray(rng.integers(20, 230, (64, 64, 3), dtype=np.uint8))


def test_missing_model_unavailable(tmp_path):
    service = ModelService(tmp_path / "missing.pt", tmp_path / "missing.json")
    assert not service.info().available
    assert service.analyze(patterned_image(), "dermoscopic").status == "unavailable"


def test_real_trained_model_loads(trained_service):
    assert trained_service.info().available
    assert trained_service.info().version == VERSION
    assert len(trained_service.info().classes) == 7
    assert trained_service.model.training is False


def test_checkpoint_integrity_rejected(tmp_path):
    manifest = json.loads((ROOT / "public/model/manifest.json").read_text())
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest))
    checkpoint = tmp_path / "bad.pt"
    checkpoint.write_bytes(b"invalid model")
    with pytest.raises(ModelUnavailableError):
        ModelService(checkpoint, path).load()


@pytest.mark.parametrize("bad_std", [[float("inf"), 1, 1], [0, 1, 1], [1, 1]])
def test_invalid_preprocessing_rejected(tmp_path, bad_std):
    manifest = json.loads((ROOT / "public/model/manifest.json").read_text())
    manifest["preprocessing"]["std"] = bad_std
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest))
    with pytest.raises(ModelUnavailableError):
        ModelService(ROOT / "models/skinsnap_derma_cnn.pt", path).load()


@pytest.mark.parametrize("field,value", [
    ("temperature", 0), ("temperature", float("nan")), ("temperature", True),
    ("input_size", 224), ("supported_image_type", "smartphone"),
    ("score_type", "disease_probability"), ("uncertainty", {}),
    ("uncertainty", {"max_score_threshold": -1, "margin_threshold": .15}),
    ("uncertainty", {"max_score_threshold": .65, "margin_threshold": float("inf")}),
    ("uncertainty", {"max_score_threshold": True, "margin_threshold": .15}),
    ("classes", []), ("preprocessing", []), ("checkpoint_sha256", "malformed"),
])
def test_malformed_manifest_fails_unavailable_before_analysis(tmp_path, field, value):
    manifest = json.loads((ROOT / "public/model/manifest.json").read_text())
    manifest[field] = value
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest))
    service = ModelService(ROOT / "models/skinsnap_derma_cnn.pt", path)
    assert service.info().available is False
    with patterned_image() as image:
        result = service.analyze(image, "dermoscopic")
    assert result.status == "unavailable" and result.scores == []


@pytest.mark.parametrize("document", [[], None, "model", {"available": False}])
def test_non_manifest_json_is_unavailable(tmp_path, document):
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(document))
    assert ModelService(ROOT / "models/skinsnap_derma_cnn.pt", path).info().available is False


def test_non_model_artifact_with_matching_checksum_rejected(tmp_path):
    checkpoint = tmp_path / "bad.pt"
    checkpoint.write_bytes(b"this is not a valid pickle")
    manifest = json.loads((ROOT / "public/model/manifest.json").read_text())
    manifest["checkpoint_sha256"] = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest))
    with pytest.raises(ModelUnavailableError):
        ModelService(checkpoint, path).load()


@pytest.mark.parametrize("image_type", ["smartphone", "unknown"])
def test_unsupported_image_domain_no_scores(trained_service, image_type):
    result = trained_service.analyze(patterned_image(), image_type)
    assert result.status == "unsupported" and result.scores == [] and result.explanation is None
    assert "Smartphone" in result.message


def test_quality_rejection_no_scores(trained_service):
    result = trained_service.analyze(Image.new("RGB", (256, 256), "white"), "dermoscopic")
    assert result.status == "quality_rejected" and result.scores == []


def test_genuine_inference_deterministic_and_valid_schema(trained_service):
    demo = json.loads((ROOT / "public/demo/manifest.json").read_text())["images"][0]
    with Image.open(ROOT / "public" / demo["path"].lstrip("/")) as image:
        first = trained_service.analyze(image.convert("RGB"), "dermoscopic")
        second = trained_service.analyze(image.convert("RGB"), "dermoscopic")
    assert first.status in ("assessed", "uncertain") and len(first.scores) == 7
    assert first.scores == second.scores
    assert sum(score.score for score in first.scores) == pytest.approx(1, abs=1e-6)
    assert [x.score for x in first.scores] == sorted((x.score for x in first.scores), reverse=True)
    assert first.explanation.heatmap_data_url.startswith("data:image/png;base64,")
    assert "not a lesion boundary" in first.explanation.disclaimer
    assert AnalysisResponse.model_validate_json(first.model_dump_json()) == first


def test_uncertainty_rule_rejects_flat_logits(trained_service, monkeypatch):
    original = trained_service.model.explain
    monkeypatch.setattr(trained_service.model, "explain", lambda x: (torch.zeros(1, 7), torch.ones(1, 64, 7, 7)))
    result = trained_service.analyze(patterned_image(), "dermoscopic", False)
    assert result.status == "uncertain" and result.uncertainty.rejected
    assert len(result.uncertainty.reasons) == 2 and result.explanation is None
    monkeypatch.setattr(trained_service.model, "explain", original)


def test_nonfinite_inference_fails_safely(trained_service, monkeypatch):
    monkeypatch.setattr(trained_service.model, "explain", lambda x: (torch.full((1, 7), float("nan")), torch.ones(1, 64, 7, 7)))
    with pytest.raises(ModelUnavailableError):
        trained_service.analyze(patterned_image(), "dermoscopic")


@pytest.mark.parametrize("logits,activations", [
    (torch.zeros(1, 6), torch.ones(1, 64, 7, 7)),
    (torch.zeros(1, 7), torch.ones(1, 63, 7, 7)),
    (torch.zeros(1, 7), torch.full((1, 64, 7, 7), float("nan"))),
])
def test_invalid_inference_tensor_fails_safely(trained_service, monkeypatch, logits, activations):
    monkeypatch.setattr(trained_service.model, "explain", lambda x: (logits, activations))
    with patterned_image() as image, pytest.raises(ModelUnavailableError):
        trained_service.analyze(image, "dermoscopic")


def test_runtime_inference_failure_is_safe(trained_service, monkeypatch):
    def fail(tensor):
        raise RuntimeError("Internal inference detail that must not be returned")
    monkeypatch.setattr(trained_service.model, "explain", fail)
    with patterned_image() as image, pytest.raises(ModelUnavailableError, match="failed safely"):
        trained_service.analyze(image, "dermoscopic")


def test_score_schema_rejects_invalid_probability_values():
    for value in (-.1, 1.1, float("nan")):
        with pytest.raises(ValidationError):
            Score(id="nv", label="nevi", score=value)
