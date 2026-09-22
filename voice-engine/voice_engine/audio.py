"""Ensamblado de audio: silencios, concatenacion, WAV y (si hay FFmpeg) MP3.

Se reutiliza el FFmpeg del sistema en lugar de empaquetar otra distribucion.
WAV es el formato principal para CapCut; MP3 es opcional.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

from .errors import AudioEncodingError


def silence(sample_rate: int, milliseconds: int) -> np.ndarray:
    """Silencio mono float32 de la duracion pedida."""
    frames = int(round(sample_rate * max(0, milliseconds) / 1000))
    return np.zeros(max(0, frames), dtype=np.float32)


def as_mono_float32(samples: np.ndarray) -> np.ndarray:
    """Normaliza a mono float32 en el rango [-1, 1]."""
    array = np.asarray(samples, dtype=np.float32)
    if array.ndim == 2:
        # (frames, canales) -> media mono
        array = array.mean(axis=1) if array.shape[1] <= array.shape[0] else array.mean(axis=0)
    return np.clip(array.reshape(-1), -1.0, 1.0).astype(np.float32)


def concatenate(pieces: list[np.ndarray], sample_rate: int, pauses_ms: list[int]) -> np.ndarray:
    """Une los fragmentos en orden, insertando `pauses_ms[i]` despues del fragmento i."""
    if len(pauses_ms) != len(pieces):
        raise ValueError("pauses_ms debe tener la misma longitud que pieces.")
    parts: list[np.ndarray] = []
    for index, piece in enumerate(pieces):
        parts.append(as_mono_float32(piece))
        pause = pauses_ms[index]
        if pause > 0:
            parts.append(silence(sample_rate, pause))
    if not parts:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(parts).astype(np.float32)


def peak(samples: np.ndarray) -> float:
    array = np.asarray(samples, dtype=np.float32)
    return float(np.max(np.abs(array))) if array.size else 0.0


def normalize_peak(samples: np.ndarray, target_db: float = -1.0) -> np.ndarray:
    """Aplica una unica ganancia al archivo final (no altera el contenido narrado).

    Solo atenua: nunca amplifica, para no subir el ruido de fondo del modelo.
    """
    array = np.asarray(samples, dtype=np.float32)
    current_peak = peak(array)
    if current_peak <= 0:
        return array
    target = 10 ** (target_db / 20)
    if current_peak <= target:
        return array
    return (array * (target / current_peak)).astype(np.float32)


def write_wav(path: Path, samples: np.ndarray, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), as_mono_float32(samples), sample_rate, subtype="PCM_16")


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    samples, sample_rate = sf.read(str(path), dtype="float32", always_2d=False)
    return np.asarray(samples, dtype=np.float32).reshape(-1), int(sample_rate)


def duration_seconds(path: Path) -> float:
    info = sf.info(str(path))
    if info.samplerate <= 0:
        return 0.0
    return round(info.frames / info.samplerate, 3)


def encode_mp3(wav_path: Path, mp3_path: Path, ffmpeg: str | None, timeout_seconds: int = 120) -> Path:
    """Convierte el WAV final a MP3 con el FFmpeg del sistema."""
    if not ffmpeg:
        raise AudioEncodingError(
            "FFmpeg no esta disponible: instala FFmpeg o genera el audio en formato WAV."
        )
    mp3_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav_path),
         "-codec:a", "libmp3lame", "-q:a", "2", str(mp3_path)],
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        check=False,
    )
    if result.returncode != 0 or not mp3_path.exists() or mp3_path.stat().st_size == 0:
        detail = (result.stderr or result.stdout or "").strip().splitlines()
        raise AudioEncodingError(f"FFmpeg no pudo generar el MP3: {detail[-1] if detail else 'error desconocido'}")
    return mp3_path
