"""Servicio HTTP local del motor de voz (FastAPI).

Superficie minima: GET /health, GET /voices, POST /synthesize, POST /preview.
Escucha solo en 127.0.0.1. El consumidor es `apps/api/src/voice/` (frontera);
el navegador nunca habla con este servicio.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import __version__
from .config import access_token, device, model_repo
from .engine import VoiceEngine
from .errors import UnauthorizedError, VoiceEngineError
from .kokoro_provider import KokoroProvider
from .models import SynthesisRequest

LOGGER = logging.getLogger("voice_engine.api")


class SynthesizeBody(BaseModel):
    text: str | None = None
    voice: str | None = None
    speed: float = 1.0
    pauseMs: int = 300
    format: str = "wav"


class PreviewBody(BaseModel):
    text: str | None = None
    voice: str | None = None
    speed: float = 1.0


def build_default_engine() -> VoiceEngine:
    return VoiceEngine(KokoroProvider())


def create_app(engine: VoiceEngine | None = None) -> FastAPI:
    voice_engine = engine or build_default_engine()
    app = FastAPI(
        title="FullPOS Voice Engine",
        description="Motor TTS local (Kokoro-82M). Solo localhost: lo consume el API del estudio.",
        version=__version__,
    )
    app.state.engine = voice_engine

    @app.exception_handler(VoiceEngineError)
    async def _voice_error(_request: Request, error: VoiceEngineError) -> JSONResponse:
        # Sin trazas hacia el cliente: solo codigo y mensaje.
        LOGGER.warning("Motor de voz: %s (%s)", error.message, error.code)
        return JSONResponse(status_code=error.status, content={"error": error.as_dict()})

    @app.get("/health")
    def health() -> dict:
        report = voice_engine.health()
        report["version"] = __version__
        report["model"] = model_repo()
        report["device"] = device()
        return report

    @app.get("/voices")
    def voices() -> dict:
        return voice_engine.voices()

    @app.post("/synthesize")
    async def synthesize(body: SynthesizeBody, request: Request) -> dict:
        _check_token(request)
        result = voice_engine.synthesize(SynthesisRequest.from_payload(_payload(body)))
        return result.as_dict()

    @app.post("/preview")
    async def preview(body: PreviewBody, request: Request) -> dict:
        _check_token(request)
        result = voice_engine.preview(SynthesisRequest.from_payload(_payload(body)))
        return result.as_dict()

    return app


def _payload(body: BaseModel) -> dict:
    if hasattr(body, "model_dump"):
        return body.model_dump()  # pydantic v2
    return body.dict()  # pragma: no cover - pydantic v1


def _check_token(request: Request) -> None:
    """Token opcional de defensa en profundidad para un servicio local."""
    expected = access_token()
    if expected and request.headers.get("x-voice-token") != expected:
        raise UnauthorizedError("Token del motor de voz invalido o ausente.")


app = create_app()
