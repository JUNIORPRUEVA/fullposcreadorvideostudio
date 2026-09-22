"""Tipos de datos del motor (sin dependencias pesadas)."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Voice:
    id: str
    name: str
    gender: str  # "Femenina" | "Masculina"
    language: str  # "es"

    def as_dict(self, engine: str) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "gender": self.gender,
            "language": self.language,
            "engine": engine,
            "available": True,
        }


@dataclass(frozen=True)
class SynthesisRequest:
    text: str
    voice: str
    speed: float = 1.0
    pause_ms: int = 300
    format: str = "wav"

    @classmethod
    def from_payload(cls, payload: dict) -> "SynthesisRequest":
        """Construye la peticion desde un JSON sin lanzar: la validacion es del motor."""
        raw_speed = payload.get("speed", 1.0)
        raw_pause = payload.get("pauseMs", payload.get("pause_ms", 300))
        raw_format = payload.get("format", "wav")
        return cls(
            text=payload.get("text") if isinstance(payload.get("text"), str) else "",
            voice=payload.get("voice") if isinstance(payload.get("voice"), str) else "",
            speed=float(raw_speed) if isinstance(raw_speed, (int, float)) and not isinstance(raw_speed, bool) else 1.0,
            pause_ms=int(raw_pause) if isinstance(raw_pause, int) and not isinstance(raw_pause, bool) else 300,
            format=raw_format.strip().lower() if isinstance(raw_format, str) else "wav",
        )


@dataclass(frozen=True)
class ChunkReport:
    index: int
    characters: int
    pause_ms: int
    # Tiempo de reloj que tardo el modelo en narrar este fragmento (no es la duracion
    # del audio resultante: sirve para diagnosticar fragmentos lentos).
    elapsed_seconds: float


@dataclass(frozen=True)
class SynthesisResult:
    generation_id: str
    file_name: str
    relative_path: str
    format: str
    duration_seconds: float
    bytes: int
    sample_rate: int
    voice: str
    speed: float
    pause_ms: int
    engine: str
    created_at: str
    text_characters: int
    text_words: int
    master_relative_path: str | None = None
    chunks: list[ChunkReport] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "generationId": self.generation_id,
            "fileName": self.file_name,
            "relativePath": self.relative_path,
            "masterRelativePath": self.master_relative_path,
            "format": self.format,
            "durationSeconds": self.duration_seconds,
            "bytes": self.bytes,
            "sampleRate": self.sample_rate,
            "voice": self.voice,
            "speed": self.speed,
            "pauseMs": self.pause_ms,
            "engine": self.engine,
            "createdAt": self.created_at,
            "textCharacters": self.text_characters,
            "textWords": self.text_words,
            "chunks": [
                {
                    "index": chunk.index,
                    "characters": chunk.characters,
                    "pauseMs": chunk.pause_ms,
                    "elapsedSeconds": chunk.elapsed_seconds,
                }
                for chunk in self.chunks
            ],
        }
