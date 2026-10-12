"""Bounded, ephemeral-upload API. Do not expose as a clinical service."""
from __future__ import annotations

import os
import threading
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .images import MAX_FILE_BYTES, ImageValidationError, decode_image
from .schemas import AnalysisResponse, ModelInfo
from .service import ModelService, ModelUnavailableError

service = ModelService()
inference_slots = threading.BoundedSemaphore(2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Check availability without preventing the explicit unavailable state.
    await run_in_threadpool(service.info)
    yield


app = FastAPI(title="SkinSnap Research Inference", version="1.0.0", lifespan=lifespan)
origins = [x.strip() for x in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


class BodyLimitMiddleware:
    """Limit actual received bytes before multipart can spool an unbounded body."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        total = 0

        async def bounded_receive():
            nonlocal total
            message = await receive()
            if message["type"] == "http.request":
                total += len(message.get("body", b""))
                if total > MAX_FILE_BYTES + 256 * 1024:
                    raise HTTPException(413, "Upload exceeds the 10 MB limit.")
            return message

        return await self.app(scope, bounded_receive, send)


app.add_middleware(BodyLimitMiddleware)


@app.middleware("http")
async def security_headers(request, call_next):
    # Content-Length bounds also multipart framing; independently cap decoded file.
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            too_large = int(content_length) > MAX_FILE_BYTES + 256 * 1024
        except ValueError:
            return JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)
        if too_large:
            return JSONResponse({"detail": "Upload exceeds the 10 MB limit."}, status_code=413)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/health")
def health():
    return {"status": "ok", "model_available": service.info().available}


@app.get("/v1/model", response_model=ModelInfo)
def model_info():
    return service.info()


@app.post("/v1/analyze", response_model=AnalysisResponse)
@app.post("/infer", response_model=AnalysisResponse, include_in_schema=False)
async def analyze(file: Annotated[UploadFile, File()], image_type: Annotated[Literal["dermoscopic", "smartphone", "unknown"], Form()] = "unknown", consent: Annotated[bool, Form()] = False, include_explanation: Annotated[bool, Form()] = True):
    image = None
    try:
        if not consent:
            raise HTTPException(422, "Confirm that you have permission to process this image and understand the research-only use.")
        data = await file.read(MAX_FILE_BYTES + 1)
        image = await run_in_threadpool(decode_image, data, file.content_type)
        if not inference_slots.acquire(blocking=False):
            raise HTTPException(503, "The research model is busy. Try again shortly.")
        try:
            return await run_in_threadpool(service.analyze, image, image_type, include_explanation)
        finally:
            inference_slots.release()
    except ImageValidationError as error:
        raise HTTPException(error.status, str(error)) from None
    except ModelUnavailableError as error:
        raise HTTPException(503, str(error)) from None
    finally:
        if image is not None:
            image.close()
        # UploadFile may use an OS temporary spool. Closing deletes that spool.
        # No original images, filenames, scores or personal data are logged/saved.
        await file.close()
