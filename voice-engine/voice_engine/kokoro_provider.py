"""Proveedor Kokoro-82M local (PyTorch, CPU).

- El modelo se carga una sola vez por proceso (`load()` es idempotente).
- `torch` y `kokoro` se importan dentro de las funciones: el servicio arranca y
  responde /health aunque el motor no este instalado, en lugar de morir al importar.
- La lista de voces se descubre contra Hugging Face; si no hay red, se usa la cache
  local y, como ultimo recurso, una lista conocida marcada como tal.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from .config import (
    DEFAULT_MODEL_REPO,
    SPANISH_LANG_CODE,
    device as configured_device,
    model_repo,
)
from .errors import EngineUnavailableError, EspeakMissingError, SynthesisFailedError
from .espeak import EspeakStatus, configure_espeak
from .models import Voice

LOGGER = logging.getLogger("voice_engine.kokoro")

# Se usa solo si no hay red ni cache con las voces descargadas (nunca como unica fuente).
FALLBACK_SPANISH_VOICES = ("ef_dora", "em_alex", "em_santa")

_LANGUAGE_BY_PREFIX = {
    "a": "en-us",
    "b": "en-gb",
    "e": "es",
    "f": "fr",
    "h": "hi",
    "i": "it",
    "j": "ja",
    "p": "pt",
    "z": "zh",
}
_GENDER_BY_CODE = {"f": "Femenina", "m": "Masculina"}

# Datos oficiales del modelo (hexgrad/Kokoro-82M): licencia Apache-2.0 y genero por
# voz documentado en VOICES.md. La calidad NO esta publicada por voz: se deja vacia.
KOKORO_LICENSE = "Apache-2.0 (hexgrad/Kokoro-82M)"
KOKORO_SOURCE_URL = "https://huggingface.co/hexgrad/Kokoro-82M"

DEFAULT_SAMPLE_RATE = 24_000


class KokoroProvider:
    engine_id = "kokoro"
    label = "Kokoro-82M (local)"

    def __init__(self, repo_id: str | None = None, espeak: EspeakStatus | None = None) -> None:
        self._repo_id = repo_id or model_repo() or DEFAULT_MODEL_REPO
        self._espeak = espeak or configure_espeak()
        self._pipeline = None
        self._load_error: str | None = None
        self._voices: list[Voice] | None = None
        self._voices_source = "unknown"

    # ---------------------------------------------------------------- estado

    @property
    def repo_id(self) -> str:
        return self._repo_id

    @property
    def sample_rate(self) -> int:
        if self._pipeline is None:
            return DEFAULT_SAMPLE_RATE
        for attribute in ("sample_rate", "SAMPLE_RATE"):
            value = getattr(self._pipeline, attribute, None)
            if isinstance(value, int) and value > 0:
                return value
        return DEFAULT_SAMPLE_RATE

    @property
    def espeak(self) -> EspeakStatus:
        return self._espeak

    def status(self) -> dict:
        installed, version, import_error = _kokoro_installation()
        return {
            "id": self.engine_id,
            "label": self.label,
            "installed": installed,
            "version": version,
            "loaded": self._pipeline is not None,
            "model": self._repo_id,
            "device": configured_device(),
            "sampleRate": self.sample_rate,
            "voicesSource": self._voices_source,
            # Solo si la lista ya esta en memoria: /health no debe salir a la red.
            "voicesTotal": len(self._voices) if self._voices is not None else None,
            "espeak": self._espeak.as_dict(),
            "reason": self._reason(installed, import_error),
        }

    def _reason(self, installed: bool, import_error: str | None) -> str | None:
        if self._load_error:
            return self._load_error
        if not installed:
            return import_error or "El motor Kokoro no esta instalado en el entorno de voz."
        if not self._espeak.available:
            return self._espeak.reason
        return None

    # ---------------------------------------------------------------- carga

    def load(self, voice: str | None = None) -> None:
        """Carga el pipeline una sola vez. Idempotente.

        Kokoro usa un unico modelo con muchas voces, asi que `voice` se ignora (existe
        para cumplir el contrato de `VoiceProvider`, que Piper si necesita).
        """
        if self._pipeline is not None:
            return
        if self._load_error:
            raise EngineUnavailableError(self._load_error)

        installed, _, import_error = _kokoro_installation()
        if not installed:
            self._load_error = import_error or "El motor Kokoro no esta instalado en el entorno de voz."
            raise EngineUnavailableError(self._load_error)
        if not self._espeak.available:
            self._load_error = self._espeak.reason
            raise EspeakMissingError(self._espeak.reason or "espeak-ng no disponible.")

        from kokoro import KPipeline  # import local: pesado y opcional

        LOGGER.info("Cargando Kokoro (%s) en %s...", self._repo_id, configured_device())
        try:
            try:
                self._pipeline = KPipeline(
                    lang_code=SPANISH_LANG_CODE,
                    repo_id=self._repo_id,
                    device=configured_device(),
                )
            except TypeError:
                # Firmas antiguas sin `device`.
                self._pipeline = KPipeline(lang_code=SPANISH_LANG_CODE, repo_id=self._repo_id)
        except Exception as error:  # pragma: no cover - depende del entorno real
            self._load_error = f"No se pudo cargar Kokoro: {_short(error)}"
            raise EngineUnavailableError(self._load_error) from error
        LOGGER.info("Kokoro listo (sample rate %s Hz).", self.sample_rate)

    # ---------------------------------------------------------------- voces

    def voices(self) -> list[Voice]:
        if self._voices is None:
            discovered, source = _discover_spanish_voices(self._repo_id)
            self._voices = discovered
            self._voices_source = source
        return list(self._voices)

    # ------------------------------------------------------------ sintesis

    def synthesize(self, text: str, voice: str, speed: float) -> np.ndarray:
        self.load()
        assert self._pipeline is not None  # noqa: S101 - invariante de load()
        try:
            pieces = [_audio_of(item) for item in self._pipeline(text, voice=voice, speed=speed)]
        except EspeakMissingError:
            raise
        except Exception as error:  # pragma: no cover - depende del modelo real
            raise SynthesisFailedError(f"Kokoro no pudo narrar el fragmento: {_short(error)}") from error

        usable = [np.asarray(piece, dtype=np.float32).reshape(-1) for piece in pieces if piece is not None]
        usable = [piece for piece in usable if piece.size > 0]
        if not usable:
            raise SynthesisFailedError("Kokoro devolvio audio vacio para este fragmento.")
        return np.concatenate(usable).astype(np.float32)


def _kokoro_installation() -> tuple[bool, str | None, str | None]:
    """Comprueba la instalacion SIN importar kokoro: importarlo arrastra torch (lento).

    /health se consulta con frecuencia, asi que aqui solo se mira el sistema de ficheros.
    """
    try:
        from importlib.util import find_spec

        if find_spec("kokoro") is None:
            return False, None, "El motor Kokoro no esta instalado en el entorno de voz."
    except Exception as error:
        return False, None, f"No se pudo verificar el motor Kokoro: {_short(error)}"
    try:
        from importlib.metadata import version

        return True, version("kokoro"), None
    except Exception:
        return True, None, None


def _audio_of(item) -> np.ndarray | None:
    """Kokoro devuelve `Result(audio=...)`; version antiguas devolvian una tupla."""
    audio = getattr(item, "audio", None)
    if audio is None and isinstance(item, (tuple, list)) and item:
        audio = item[-1]
    return None if audio is None else np.asarray(audio, dtype=np.float32)


def _discover_spanish_voices(repo_id: str) -> tuple[list[Voice], str]:
    """Voces en espanol del modelo, sin hardcodear nombres.

    Se une lo que ya esta en la cache local (certeza, sin red) con el listado del
    repositorio (completitud). Solo si ambas fuentes fallan se usa la lista conocida.
    """
    cached = _voices_from_cache(repo_id)
    remote = _voices_from_files(_repo_files(repo_id))

    merged = {voice.id: voice for voice in [*cached, *remote]}
    if merged:
        sources = "+".join(part for part in ("cache" if cached else "", "huggingface" if remote else "") if part)
        return sorted(merged.values(), key=lambda voice: voice.id), sources or "unknown"

    LOGGER.warning("No se pudo descubrir las voces de %s: se usa la lista conocida.", repo_id)
    return [voice_from_id(voice_id) for voice_id in FALLBACK_SPANISH_VOICES], "fallback"


def _repo_files(repo_id: str) -> list[str]:
    try:
        from huggingface_hub import list_repo_files

        return list(list_repo_files(repo_id))
    except Exception as error:  # sin red o sin cache: se degrada, no se cae
        LOGGER.warning("No se pudo listar las voces del repositorio %s: %s", repo_id, _short(error))
        return []


def _voices_from_cache(repo_id: str) -> list[Voice]:
    try:
        from huggingface_hub import scan_cache_dir

        for repo in scan_cache_dir().repos:
            if repo.repo_id != repo_id:
                continue
            files = [file.file_name for revision in repo.revisions for file in revision.files]
            return _voices_from_files(files)
    except Exception:
        return []
    return []


def _voices_from_files(files: list[str]) -> list[Voice]:
    spanish: list[Voice] = []
    for name in files:
        stem = Path(name).name
        if not name.replace("\\", "/").startswith("voices/") or not stem.endswith(".pt"):
            continue
        voice_id = stem[: -len(".pt")]
        if voice_id[:1] != SPANISH_LANG_CODE:
            continue
        spanish.append(voice_from_id(voice_id))
    return sorted(spanish, key=lambda voice: voice.id)


def voice_from_id(voice_id: str) -> Voice:
    """`ef_dora` -> Femenina / es. La 1a letra es el idioma, la 2a el genero.

    El genero sale de la convencion oficial de Kokoro, documentada en VOICES.md
    (seccion Spanish: 1F 2M). Si el codigo no es f/m, se deja sin especificar.
    """
    language = _LANGUAGE_BY_PREFIX.get(voice_id[:1], "es")
    name = voice_id[2:].replace("_", " ").strip().title() or voice_id
    return Voice(
        id=voice_id,
        name=name,
        gender=_GENDER_BY_CODE.get(voice_id[1:2]),
        language="es",
        engine="kokoro",
        locale=language,
        region=None,  # Kokoro no asigna pais a sus voces en espanol
        quality=None,
        license=KOKORO_LICENSE,
        commercial_ok=True,
        source_url=KOKORO_SOURCE_URL,
    )


def _short(error: Exception) -> str:
    text = str(error).strip().replace("\n", " ")
    return text[:300] if text else error.__class__.__name__
