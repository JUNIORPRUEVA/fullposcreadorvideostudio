"""Orquestacion: validacion, troceo, sintesis, ensamblado y guardado.

Aqui vive toda la logica que puede probarse sin torch: el proveedor entra por
inyeccion (`VoiceProvider`), de modo que las pruebas usan un proveedor falso.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Sequence

from . import text as text_module
from .audio import concatenate, duration_seconds, encode_mp3, normalize_peak, write_wav
from .config import (
    DEFAULT_PAUSE_MS,
    MAX_PAUSE_MS,
    MAX_SPEED,
    MIN_SPEED,
    SUPPORTED_FORMATS,
    chunk_chars as configured_chunk_chars,
    ffmpeg_path,
    max_text_chars as configured_max_text_chars,
    model_file,
    output_root as configured_output_root,
    storage_root as configured_storage_root,
)
from .errors import InvalidRequestError, TextTooLongError, VoiceNotFoundError
from .models import ChunkReport, SynthesisRequest, SynthesisResult
from .provider import VoiceProvider

LOGGER = logging.getLogger("voice_engine")

# Texto fijo de prueba de voces (Fase 1). El usuario puede escuchar todas las voces
# disponibles antes de elegir la suya.
PREVIEW_TEXT = (
    "Bienvenido a FullPOS Cloud. En este tutorial aprenderas a configurar tu negocio "
    "y realizar tus primeras ventas."
)
PREVIEW_MAX_CHARS = 320
PREVIEW_FOLDER = "previews"

# Centinela: distingue "resuelve el FFmpeg del sistema" de "no hay FFmpeg" (None).
_AUTO = object()


def _status_usable(status: dict) -> bool:
    """Un motor esta usable si esta instalado y su fonemizador esta disponible.

    Piper trae su propio fonemizador, asi que devuelve `espeak: None` y eso no bloquea.
    """
    if not status.get("installed"):
        return False
    espeak = status.get("espeak")
    if isinstance(espeak, dict) and not espeak.get("available", True):
        return False
    return True


class VoiceEngine:
    """Orquestador multi-motor.

    Acepta un proveedor suelto (`VoiceEngine(provider)`, usado por las pruebas) o varios
    (`providers=[kokoro, piper]`). La seleccion de motor va por el campo `engine` de la
    peticion; si no viene, la voz se busca en todos los motores.
    """

    def __init__(
        self,
        provider: VoiceProvider | None = None,
        *,
        providers: Sequence[VoiceProvider] | None = None,
        output_root: Path | None = None,
        storage_root: Path | None = None,
        chunk_chars: int | None = None,
        max_chars: int | None = None,
        ffmpeg: object = _AUTO,
    ) -> None:
        if provider is not None and providers is not None:
            raise ValueError("Usa `provider` o `providers`, no ambos.")
        selected = [provider] if provider is not None else list(providers or [])
        if not selected:
            raise ValueError("VoiceEngine necesita al menos un proveedor de voz.")
        self._providers: list[VoiceProvider] = selected
        self._by_engine: dict[str, VoiceProvider] = {item.engine_id: item for item in selected}
        self._output_root = Path(output_root or configured_output_root()).resolve()
        self._storage_root = Path(storage_root or configured_storage_root()).resolve()
        self._chunk_chars = int(chunk_chars or configured_chunk_chars())
        self._max_chars = int(max_chars or configured_max_text_chars())
        self._ffmpeg: str | None = ffmpeg_path() if ffmpeg is _AUTO else ffmpeg  # type: ignore[assignment]

    # ------------------------------------------------------------- consultas

    @property
    def provider(self) -> VoiceProvider:
        """Proveedor principal (el primero). Se mantiene por compatibilidad."""
        return self._providers[0]

    @property
    def providers(self) -> list[VoiceProvider]:
        return list(self._providers)

    @property
    def output_root(self) -> Path:
        return self._output_root

    def health(self) -> dict:
        """Nunca lanza: la pagina debe poder mostrar por que motor no esta listo."""
        statuses = [provider.status() for provider in self._providers]
        usable = [status for status in statuses if _status_usable(status)]
        primary = statuses[0]
        formats = ["wav"] + (["mp3"] if self._ffmpeg else [])
        reasons = [str(status.get("reason")) for status in statuses if status.get("reason")]
        return {
            "status": "ok" if usable else "degraded",
            "usable": bool(usable),
            # `engine`/`espeak` se mantienen de Fase 1 (motor principal).
            "engine": primary,
            "engines": statuses,
            "espeak": primary.get("espeak") or {},
            "python": sys.version.split()[0],
            "ffmpeg": {"available": bool(self._ffmpeg), "path": self._ffmpeg},
            "formats": formats,
            "limits": {
                "maxTextChars": self._max_chars,
                "chunkChars": self._chunk_chars,
                "minSpeed": MIN_SPEED,
                "maxSpeed": MAX_SPEED,
                "maxPauseMs": MAX_PAUSE_MS,
            },
            "paths": {
                "storageRoot": str(self._storage_root),
                "outputRoot": str(self._output_root),
            },
            "reason": None if usable else "; ".join(reasons) or "Ningun motor de voz esta disponible.",
        }

    def voices(self) -> dict:
        """Voces de todos los motores (lista plana + agrupadas por motor).

        La lista plana conserva el formato de Fase 1 y ahora cada entrada trae su motor,
        locale, region, calidad y licencia.
        """
        flat: list[dict] = []
        engines: list[dict] = []
        for provider in self._providers:
            status = provider.status()
            voices = provider.voices()
            flat.extend(voice.as_dict(provider.engine_id) for voice in voices)
            engines.append(
                {
                    "id": provider.engine_id,
                    "label": provider.label,
                    "source": status.get("voicesSource") or status.get("root"),
                    "sampleRate": provider.sample_rate,
                    "installed": bool(status.get("installed")),
                    "reason": status.get("reason"),
                    "voices": [voice.as_dict(provider.engine_id) for voice in voices],
                }
            )
        primary = self._providers[0]
        return {
            "engine": primary.engine_id,
            "label": primary.label,
            "source": engines[0]["source"] if engines else None,
            "sampleRate": primary.sample_rate,
            "engines": engines,
            "voices": flat,
        }

    # ------------------------------------------------------------ sintesis

    def preview(self, request: SynthesisRequest) -> SynthesisResult:
        """Muestra corta de una voz. Siempre WAV (es solo para escuchar)."""
        candidate = text_module.normalize_text(request.text)[:PREVIEW_MAX_CHARS].strip()
        return self.synthesize(
            SynthesisRequest(
                text=candidate or text_module.normalize_text(PREVIEW_TEXT),
                voice=request.voice,
                speed=request.speed,
                pause_ms=0,
                format="wav",
                engine=request.engine,
            ),
            folder=PREVIEW_FOLDER,
        )

    def synthesize(self, request: SynthesisRequest, folder: str | None = None) -> SynthesisResult:
        text = text_module.normalize_text(request.text)
        if not text:
            raise InvalidRequestError("El guion esta vacio: escribe o pega el texto a narrar.")
        if len(text) > self._max_chars:
            raise TextTooLongError(
                f"El guion tiene {len(text)} caracteres y el limite local es {self._max_chars}. "
                "Divide el guion en partes."
            )

        speed = self._validate_speed(request.speed)
        pause_ms = self._validate_pause(request.pause_ms)
        audio_format = self._validate_format(request.format)
        provider, voice = self._resolve_target(request.engine, request.voice)
        chunks = text_module.split_into_chunks(text, self._chunk_chars)
        if not chunks:
            raise InvalidRequestError("No se pudo extraer narracion del guion enviado.")

        # Carga perezosa: el modelo (o la voz, en Piper) se carga una vez y se reutiliza.
        provider.load(voice)
        sample_rate = provider.sample_rate

        pieces = []
        pauses: list[int] = []
        reports: list[ChunkReport] = []
        for index, chunk in enumerate(chunks):
            started = perf_counter()
            try:
                piece = provider.synthesize(chunk.text, voice, speed)
            except Exception as error:
                note = f"fragmento {index + 1} de {len(chunks)}"
                if hasattr(error, "add_note"):
                    error.add_note(note)
                LOGGER.error("Fallo al narrar el %s: %s", note, error)
                raise
            pause = int(round(pause_ms * chunk.break_after))
            pieces.append(piece)
            pauses.append(pause)
            reports.append(
                ChunkReport(
                    index=index,
                    characters=len(chunk.text),
                    pause_ms=pause,
                    elapsed_seconds=round(perf_counter() - started, 3),
                )
            )

        track = normalize_peak(concatenate(pieces, sample_rate, pauses))
        if track.size == 0:
            raise InvalidRequestError("El motor devolvio audio vacio.")

        generation_id = secrets.token_hex(4)
        created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        stem = f"{voice}-{generation_id}"
        target_folder = folder or datetime.now().strftime("%Y-%m-%d")
        directory = self._output_root / target_folder

        wav_path = directory / f"{stem}.wav"
        write_wav(wav_path, track, sample_rate)
        master_relative = self._relative(wav_path)

        final_path = wav_path
        final_format = audio_format
        if audio_format == "mp3":
            mp3_path = directory / f"{stem}.mp3"
            final_path = encode_mp3(wav_path, mp3_path, self._ffmpeg)  # type: ignore[arg-type]
            final_format = "mp3"

        stats = text_module.stats(text)
        result = SynthesisResult(
            generation_id=generation_id,
            file_name=final_path.name,
            relative_path=self._relative(final_path) or "",
            master_relative_path=master_relative if final_format == "mp3" else None,
            format=final_format,
            duration_seconds=duration_seconds(final_path),
            bytes=final_path.stat().st_size,
            sample_rate=sample_rate,
            voice=voice,
            speed=speed,
            pause_ms=pause_ms,
            engine=provider.engine_id,
            created_at=created_at,
            text_characters=stats["characters"],
            text_words=stats["words"],
            chunks=reports,
        )
        self._write_manifest(final_path, result, request)
        return result

    # ------------------------------------------------------------ validacion

    def _validate_speed(self, speed: float) -> float:
        if not isinstance(speed, (int, float)) or isinstance(speed, bool):
            raise InvalidRequestError("La velocidad debe ser un numero.")
        value = float(speed)
        if value < MIN_SPEED or value > MAX_SPEED:
            raise InvalidRequestError(f"La velocidad debe estar entre {MIN_SPEED} y {MAX_SPEED}.")
        return round(value, 3)

    def _validate_pause(self, pause_ms: int) -> int:
        if not isinstance(pause_ms, int) or isinstance(pause_ms, bool):
            raise InvalidRequestError("La pausa debe ser un numero entero de milisegundos.")
        if pause_ms < 0 or pause_ms > MAX_PAUSE_MS:
            raise InvalidRequestError(f"La pausa debe estar entre 0 y {MAX_PAUSE_MS} ms.")
        return pause_ms

    def _validate_format(self, audio_format: str) -> str:
        value = (audio_format or "wav").strip().lower()
        if value not in SUPPORTED_FORMATS:
            raise InvalidRequestError(f"Formato no soportado: usa {' o '.join(SUPPORTED_FORMATS)}.")
        if value == "mp3" and not self._ffmpeg:
            raise InvalidRequestError(
                "MP3 no esta disponible porque FFmpeg no se encontro. Genera el audio en WAV."
            )
        return value

    def _resolve_target(self, engine: str | None, voice: str) -> tuple[VoiceProvider, str]:
        """Devuelve (proveedor, id nativo de la voz) validando motor y disponibilidad."""
        candidate = (voice or "").strip()
        if not candidate:
            raise VoiceNotFoundError("Selecciona una voz antes de generar.")
        requested = (engine or "").strip().lower()

        if requested:
            provider = self._by_engine.get(requested)
            if provider is None:
                raise InvalidRequestError(
                    f"El motor '{requested}' no esta disponible. Motores activos: {', '.join(self._by_engine) or '(ninguno)'}."
                )
            return self._check_voice(provider, candidate)

        # Sin motor explicito: se busca la voz en todos los motores activos.
        matches = [
            provider
            for provider in self._providers
            if any(item.id == candidate for item in provider.voices())
        ]
        if not matches:
            raise VoiceNotFoundError(self._not_found_message(candidate))
        if len(matches) > 1:
            activos = ", ".join(provider.engine_id for provider in matches)
            raise InvalidRequestError(
                f"La voz '{candidate}' existe en varios motores ({activos}): indica el motor al generar."
            )
        return self._check_voice(matches[0], candidate)

    def _check_voice(self, provider: VoiceProvider, voice: str) -> tuple[VoiceProvider, str]:
        entries = provider.voices()
        found = next((item for item in entries if item.id == voice), None)
        if found is None:
            disponibles = ", ".join(item.id for item in entries) or "(ninguna)"
            # Si la voz existe en otro motor, decirlo: ahorra al usuario buscar a mano.
            otros = [
                other.engine_id
                for other in self._providers
                if other is not provider and any(item.id == voice for item in other.voices())
            ]
            extra = f" Si existe en: {', '.join(otros)}." if otros else ""
            raise VoiceNotFoundError(
                f"La voz '{voice}' no existe en el motor {provider.engine_id}. Disponibles: {disponibles}.{extra}"
            )
        if not found.available:
            raise InvalidRequestError(
                found.note or f"La voz '{voice}' todavia no esta lista para usarse (modelo sin descargar)."
            )
        return provider, voice

    def _not_found_message(self, voice: str) -> str:
        available = [item.id for provider in self._providers for item in provider.voices()]
        return f"La voz '{voice}' no esta disponible. Voces validas: {', '.join(available) or '(ninguna)'}."

    # ---------------------------------------------------------------- rutas

    def _relative(self, path: Path) -> str | None:
        """Ruta relativa a la raiz de storage, o None si el archivo cae fuera."""
        try:
            relative = path.resolve().relative_to(self._storage_root)
        except ValueError:
            LOGGER.warning("El audio quedo fuera de storage: %s", path)
            return None
        return str(Path(relative)).replace(os.sep, "/")

    def _write_manifest(self, audio_path: Path, result: SynthesisResult, request: SynthesisRequest) -> None:
        """Manifiesto junto al audio: permite auditar que voz/speed produjo el archivo."""
        manifest = {
            "engine": result.engine,
            "request": {
                "engine": request.engine or result.engine,
                "voice": request.voice,
                "speed": result.speed,
                "pauseMs": result.pause_ms,
                "format": request.format,
                "textCharacters": result.text_characters,
            },
            "result": result.as_dict(),
        }
        try:
            audio_path.with_suffix(".json").write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except OSError as error:  # el audio ya esta escrito: no se pierde el trabajo
            LOGGER.warning("No se pudo escribir el manifiesto de %s: %s", audio_path.name, error)
