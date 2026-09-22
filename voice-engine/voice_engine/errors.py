"""Errores del motor con su codigo y estado HTTP asociado.

El servicio Python los traduce a respuestas JSON `{"error": {"code", "message"}}`
sin exponer trazas, y el API NestJS vuelve a sanearlas antes de llegar al navegador.
"""

from __future__ import annotations


class VoiceEngineError(RuntimeError):
    code = "voice_engine_error"
    status = 500

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message

    def as_dict(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


class InvalidRequestError(VoiceEngineError):
    code = "invalid_request"
    status = 400


class UnauthorizedError(VoiceEngineError):
    code = "unauthorized"
    status = 401


class VoiceNotFoundError(VoiceEngineError):
    code = "voice_not_found"
    status = 400


class TextTooLongError(VoiceEngineError):
    code = "text_too_long"
    status = 413


class EngineUnavailableError(VoiceEngineError):
    code = "engine_unavailable"
    status = 503


class EspeakMissingError(EngineUnavailableError):
    code = "espeak_missing"


class SynthesisFailedError(VoiceEngineError):
    code = "synthesis_failed"
    status = 500


class AudioEncodingError(VoiceEngineError):
    code = "audio_encoding_failed"
    status = 503
