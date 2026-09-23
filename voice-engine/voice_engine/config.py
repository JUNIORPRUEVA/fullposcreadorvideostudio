"""Configuracion del motor. Todo por variables de entorno con valores locales seguros."""

from __future__ import annotations

import os
from pathlib import Path

# voice-engine/voice_engine/config.py -> parents[2] es la raiz del repositorio.
REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 4310

# Modelo Kokoro-82M v1.0 (incluye las voces espanolas ef_dora / em_alex / em_santa).
DEFAULT_MODEL_REPO = "hexgrad/Kokoro-82M"
DEFAULT_MODEL_FILE = "kokoro-v1_0.pth"

# Codigo de idioma de Kokoro para espanol: la primera letra del id de voz (`e`).
SPANISH_LANG_CODE = "e"

# Limites de validacion. El guion puede ser largo: el motor trocea y vuelve a unir.
MAX_TEXT_CHARS = 100_000
MIN_SPEED = 0.5
MAX_SPEED = 2.0
MAX_PAUSE_MS = 2_000
DEFAULT_PAUSE_MS = 300
# Tamano de fragmento enviado al modelo. Kokoro degrada en tramos muy largos.
DEFAULT_CHUNK_CHARS = 400
SUPPORTED_FORMATS = ("wav", "mp3")

# Nombre visible de la voz predeterminada del producto (se guarda en la BD del estudio).
FULLPOS_VOICE_KEY = "voice.fullpos.default"


def _int_env(name: str, fallback: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def host() -> str:
    return os.environ.get("VOICE_ENGINE_HOST", DEFAULT_HOST)


def port() -> int:
    return _int_env("VOICE_ENGINE_PORT", DEFAULT_PORT)


def storage_root() -> Path:
    """Raiz de archivos generados del estudio (`storage/`)."""
    configured = os.environ.get("VOICE_STORAGE_ROOT")
    return Path(configured).resolve() if configured else REPO_ROOT / "storage"


def output_root() -> Path:
    """Carpeta destino de los audios. Por defecto `storage/generated-audio`."""
    configured = os.environ.get("VOICE_OUTPUT_DIR")
    return Path(configured).resolve() if configured else storage_root() / "generated-audio"


def max_text_chars() -> int:
    return _int_env("VOICE_MAX_TEXT_CHARS", MAX_TEXT_CHARS)


def piper_root() -> Path:
    """Carpeta de los modelos Piper (no se versiona: se descargan con voice:setup)."""
    configured = os.environ.get("VOICE_PIPER_DIR")
    return Path(configured).resolve() if configured else REPO_ROOT / "voice-engine" / "voices" / "piper"


def piper_disabled() -> bool:
    """Permite arrancar sin Piper (p. ej. entornos sin onnxruntime)."""
    return (os.environ.get("VOICE_PIPER_DISABLED") or "").strip().lower() in {"1", "true", "yes", "si"}


def chunk_chars() -> int:
    return _int_env("VOICE_CHUNK_CHARS", DEFAULT_CHUNK_CHARS)


def model_repo() -> str:
    return os.environ.get("VOICE_MODEL_REPO", DEFAULT_MODEL_REPO)


def model_file() -> str:
    return os.environ.get("VOICE_MODEL_FILE", DEFAULT_MODEL_FILE)


def device() -> str:
    """CPU a proposito: la generacion local no debe competir con la GPU del estudio."""
    return os.environ.get("VOICE_DEVICE", "cpu")


def access_token() -> str:
    """Token opcional. Si esta definido, /synthesize y /preview lo exigen.

    El motor solo escucha en 127.0.0.1, pero cualquier proceso local podria hablarle.
    Es defensa en profundidad: desactivado por defecto (no se versiona ningun secreto).
    """
    return (os.environ.get("VOICE_ENGINE_TOKEN") or "").strip()


def ffmpeg_path() -> str | None:
    """Reutiliza el FFmpeg del sistema. Si no existe, MP3 no esta disponible y WAV si."""
    configured = (os.environ.get("VOICE_FFMPEG") or "").strip()
    if configured:
        return configured if Path(configured).exists() else None
    from shutil import which

    return which("ffmpeg")
