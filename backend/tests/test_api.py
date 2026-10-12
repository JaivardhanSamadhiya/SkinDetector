import io
import asyncio
from pathlib import Path
import numpy as np
from PIL import Image
import pytest
import httpx
from fastapi.testclient import TestClient

from backend.main import app
from backend.images import MAX_FILE_BYTES


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as result:
        yield result


def png():
    buffer = io.BytesIO()
    Image.fromarray(np.random.default_rng(44).integers(20, 230, (64, 64, 3), dtype=np.uint8)).save(buffer, "PNG")
    return buffer.getvalue()


def test_status_endpoint_reports_real_model(client):
    response = client.get("/v1/model")
    assert response.status_code == 200
    assert response.json()["available"] is True
    assert response.headers["cache-control"] == "no-store"


def test_consent_required(client):
    response = client.post("/v1/analyze", files={"file": ("sample.png", png(), "image/png")}, data={"image_type": "dermoscopic"})
    assert response.status_code == 422


def test_invalid_uploaded_file(client):
    response = client.post("/v1/analyze", files={"file": ("script.png", b"<script>evil()</script>", "image/png")}, data={"consent": "true"})
    assert response.status_code == 400


def test_invalid_domain_value(client):
    response = client.post("/v1/analyze", files={"file": ("sample.png", png(), "image/png")}, data={"consent": "true", "image_type": "any photo"})
    assert response.status_code == 422


def test_smartphone_upload_safe_unsupported_state(client):
    response = client.post("/v1/analyze", files={"file": ("rosacea.jpg", png(), "image/png")}, data={"consent": "true", "image_type": "smartphone"})
    assert response.status_code == 200
    assert response.json()["status"] == "unsupported" and response.json()["scores"] == []


def test_upload_to_results_and_filename_independence(client):
    image = png()
    kwargs = {"data": {"consent": "true", "image_type": "dermoscopic", "include_explanation": "false"}}
    first = client.post("/v1/analyze", files={"file": ("rosacea.png", image, "image/png")}, **kwargs)
    second = client.post("/v1/analyze", files={"file": ("melanoma.png", image, "image/png")}, **kwargs)
    assert first.status_code == second.status_code == 200
    assert len(first.json()["scores"]) == 7
    assert first.json()["scores"] == second.json()["scores"]
    assert first.headers["x-content-type-options"] == "nosniff"


def test_large_upload_with_content_length_rejected(client):
    response = client.post("/v1/analyze", files={"file": ("large.png", b"x" * (MAX_FILE_BYTES + 512 * 1024), "image/png")}, data={"consent": "true"})
    assert response.status_code == 413


def test_chunked_body_without_content_length_is_bounded(client):
    boundary = "skinsnap-test-boundary"
    def chunks():
        yield f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.png"\r\nContent-Type: image/png\r\n\r\n'.encode()
        for _ in range(11):
            yield b"x" * (1024 * 1024)
        yield f"\r\n--{boundary}--\r\n".encode()
    request = client.build_request("POST", "/v1/analyze", content=chunks(), headers={"content-type": f"multipart/form-data; boundary={boundary}"})
    assert "content-length" not in request.headers
    assert client.send(request).status_code == 413


def test_real_asgi_stream_is_stopped_without_content_length(monkeypatch):
    # ASGITransport forwards each yielded chunk as its own http.request message.
    # This exercises cumulative bounds instead of a client-aggregated body.
    consumed = 0
    from starlette import formparsers
    real_spool = formparsers.SpooledTemporaryFile
    spools = []
    def spool(*args, **kwargs):
        result = real_spool(*args, **kwargs)
        spools.append(result)
        return result
    monkeypatch.setattr(formparsers, "SpooledTemporaryFile", spool)
    async def chunks():
        nonlocal consumed
        yield b'--test\r\nContent-Disposition: form-data; name="file"; filename="big.png"\r\nContent-Type: image/png\r\n\r\n'
        for _ in range(30):
            consumed += 1
            yield b"x" * (1024 * 1024)
        yield b"\r\n--test--\r\n"
    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            req = client.build_request("POST", "/v1/analyze", content=chunks(), headers={"content-type": "multipart/form-data; boundary=test"})
            assert "content-length" not in req.headers
            return await client.send(req)
    response = asyncio.run(request())
    assert response.status_code == 413
    assert consumed == 11  # Remaining chunks are never consumed/spooled.
    assert spools and all(file.closed for file in spools)


def test_unavailable_model_error_state(client, monkeypatch, tmp_path):
    from backend import main
    from backend.service import ModelService
    monkeypatch.setattr(main, "service", ModelService(tmp_path / "missing.pt", tmp_path / "missing.json"))
    response = client.post("/v1/analyze", files={"file": ("sample.png", png(), "image/png")}, data={"consent": "true", "image_type": "dermoscopic"})
    assert response.status_code == 200 and response.json()["status"] == "unavailable"
    assert response.json()["scores"] == []


def test_inference_failure_returns_safe_error(client, monkeypatch):
    from backend import main
    from backend.service import ModelUnavailableError
    class FailingService:
        def analyze(self, *args):
            raise ModelUnavailableError("Inference failed safely. No usable scores were generated.")
    monkeypatch.setattr(main, "service", FailingService())
    response = client.post("/v1/analyze", files={"file": ("sample.png", png(), "image/png")}, data={"consent": "true", "image_type": "dermoscopic"})
    assert response.status_code == 503
    assert "failed safely" in response.json()["detail"]


def test_busy_service_closes_decoded_image_and_upload(client, monkeypatch):
    from backend import main
    from starlette.datastructures import UploadFile
    captured = {}
    real_decode, real_close = main.decode_image, UploadFile.close
    def decode(*args):
        image = real_decode(*args)
        captured["image"] = image
        return image
    async def close(upload):
        await real_close(upload)
        captured["upload_closed"] = upload.file.closed
    class BusySlots:
        def acquire(self, blocking):
            return False
    monkeypatch.setattr(main, "decode_image", decode)
    monkeypatch.setattr(main, "inference_slots", BusySlots())
    monkeypatch.setattr(UploadFile, "close", close)
    response = client.post("/v1/analyze", files={"file": ("sample.png", png(), "image/png")}, data={"consent": "true", "image_type": "dermoscopic"})
    assert response.status_code == 503 and "busy" in response.json()["detail"]
    assert captured["upload_closed"] is True
    with pytest.raises(ValueError, match="closed image"):
        captured["image"].getpixel((0, 0))
