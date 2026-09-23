"""Proveedor Piper local (ONNX Runtime, CPU).

Segundo motor TTS del Voice Studio. A diferencia de Kokoro (un modelo unico con
muchas voces), Piper carga **un modelo ONNX por voz**, asi que `load(voice)` es por
voz y se cachea para no recargar entre fragmentos.

Los metadatos de cada voz (locale, region, calidad, licencia y dataset) NO se inventan:
salen del catalogo verificado `data/piper_voices.json`, construido a partir de los
MODEL_CARD oficiales de rhasspy/piper-voices (ver docs/VOICE_LICENSES.md).
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

import numpy as np

from .config import piper_disabled, piper_root
from .errors import EngineUnavailableError, InvalidRequestError, SynthesisFailedError
from .models import Voice

LOGGER = logging.getLogger("voice_engine.piper")

CATALOG_PATH = Path(__file__).resolve().parent / "data" / "piper_voices.json"
INT16_SCALE = 32768.0
# Piper no esta instalado en el entorno del motor: la pagina debe seguir funcionando.
INSTALL_HINT = "El motor Piper no esta instalado: ejecuta `npm run voice:setup`."


@lru_cache(maxsize=1)
def load_catalog() -> dict:
    """Catalogo verificado de voces Piper (se lee una sola vez)."""
    try:
        return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except Exception as error:  # pragma: no cover - el archivo va versionado
        LOGGER.error("No se pudo leer el catalogo de voces Piper: %s", error)
        return {"repo": "rhasspy/piper-voices", "voices": []}


def catalog_voices() -> list[dict]:
    return list(load_catalog().get("voices", []))


def model_paths(entry: dict, root: Path | None = None) -> tuple[Path, Path]:
    """(modelo .onnx, configuracion .onnx.json) dentro de la carpeta local.

    Se reproduce la estructura del repositorio (es/es_AR/daniela/high/...) porque es la
    que crea `hf_hub_download(local_dir=...)` al descargar: asi no se duplican archivos.
    """
    base = root or piper_root()
    files = [Path(name) for name in entry.get("files", [])]
    model = base / files[0] if files else base / entry["id"] / f"{entry['id']}.onnx"
    config = base / files[1] if len(files) > 1 else model.with_suffix(model.suffix + ".json")
    return model, config


def voice_from_catalog(entry: dict, *, available: bool) -> Voice:
    quality = entry.get("quality")
    note = None
    if not available:
        note = "Modelo no descargado todavia: ejecuta `npm run voice:setup` para bajarlo."
    elif entry.get("commercialUse") == "review":
        note = "Licencia del dataset a revisar para uso comercial (CC BY-SA 4.0)."
    return Voice(
        id=entry["id"],
        name=entry.get("name") or entry["id"],
        # El model card no especifica genero: se deja sin dato en lugar de inventarlo.
        gender=entry.get("gender"),
        language="es",
        engine="piper",
        locale=entry.get("locale"),
        region=entry.get("region"),
        quality=quality,
        license=entry.get("datasetLicense"),
        commercial_ok=entry.get("commercialUse") == "ok",
        source_url=entry.get("sourceUrl"),
        available=available,
        note=note,
    )


class PiperProvider:
    engine_id = "piper"
    label = "Piper (local)"

    def __init__(self, root: Path | None = None, catalog: list[dict] | None = None) -> None:
        self._root = Path(root or piper_root())
        self._catalog = catalog if catalog is not None else catalog_voices()
        self._pipelines: dict[str, object] = {}
        self._sample_rate: int | None = None
        self._load_error: str | None = None

    # ---------------------------------------------------------------- estado

    @property
    def root(self) -> Path:
        return self._root

    @property
    def sample_rate(self) -> int:
        return int(self._sample_rate or 22050)

    def status(self) -> dict:
        installed, version, error = _piper_installation()
        ready = [entry for entry in self._catalog if model_paths(entry, self._root)[0].exists()]
        reason = None
        if piper_disabled():
            reason = "Piper esta desactivado (VOICE_PIPER_DISABLED)."
        elif self._load_error:
            reason = self._load_error
        elif not installed:
            reason = error or INSTALL_HINT
        elif not ready:
            reason = "No hay voces Piper descargadas: ejecuta `npm run voice:setup`."
        return {
            "id": self.engine_id,
            "label": self.label,
            "installed": installed,
            "version": version,
            "loaded": bool(self._pipelines),
            "model": "varios (un .onnx por voz)",
            "device": "cpu",
            "sampleRate": self.sample_rate,
            "voicesTotal": len(self._catalog),
            "voicesReady": len(ready),
            "root": str(self._root),
            "espeak": None,  # Piper trae su propio fonemizador; se comprueba narrando
            "reason": reason,
        }

    @property
    def catalog(self) -> list[dict]:
        return list(self._catalog)

    # ---------------------------------------------------------------- carga

    def load(self, voice: str | None = None) -> None:
        if piper_disabled():
            raise EngineUnavailableError("Piper esta desactivado (VOICE_PIPER_DISABLED).")
        if not voice:
            raise InvalidRequestError("Piper necesita que se indique la voz a cargar.")

        entry = self._entry(voice)
        model, _config = model_paths(entry, self._root)
        if not model.exists():
            raise EngineUnavailableError(
                f"La voz Piper '{voice}' no esta descargada. Ejecuta `npm run voice:setup`."
            )
        if voice in self._pipelines:
            self._sample_rate = _sample_rate_of(self._pipelines[voice], self._sample_rate)
            return

        installed, _, error = _piper_installation()
        if not installed:
            self._load_error = error or INSTALL_HINT
            raise EngineUnavailableError(self._load_error)

        from piper import PiperVoice  # import local: arrastra onnxruntime

        LOGGER.info("Cargando la voz Piper %s...", voice)
        try:
            pipeline = PiperVoice.load(str(model))
        except Exception as failure:  # pragma: no cover - depende del modelo real
            self._load_error = f"No se pudo cargar la voz Piper {voice}: {_short(failure)}"
            raise EngineUnavailableError(self._load_error) from failure
        self._pipelines[voice] = pipeline
        self._sample_rate = _sample_rate_of(pipeline, self._sample_rate)

    # ---------------------------------------------------------------- voces

    def voices(self) -> list[Voice]:
        return [voice_from_catalog(entry, available=model_paths(entry, self._root)[0].exists()) for entry in self._catalog]

    # ------------------------------------------------------------ sintesis

    def synthesize(self, text: str, voice: str, speed: float) -> np.ndarray:
        self.load(voice)
        pipeline = self._pipelines[voice]
        try:
            from piper import SynthesisConfig

            # En Piper `length_scale` es lo inverso a la velocidad (2.0 = mitad de rapido).
            config = SynthesisConfig(length_scale=1.0 / max(0.1, speed), volume=1.0)
            pieces = [_audio_of(chunk) for chunk in pipeline.synthesize(text, syn_config=config)]
        except Exception as failure:  # pragma: no cover - depende del modelo real
            raise SynthesisFailedError(f"Piper no pudo narrar el fragmento: {_short(failure)}") from failure

        usable = [piece for piece in pieces if piece.size > 0]
        if not usable:
            raise SynthesisFailedError("Piper devolvio audio vacio para este fragmento.")
        self._sample_rate = _sample_rate_of(pipeline, self._sample_rate)
        return np.concatenate(usable).astype(np.float32)

    # ------------------------------------------------------------- internos

    def _entry(self, voice: str) -> dict:
        for entry in self._catalog:
            if entry.get("id") == voice:
                return entry
        disponibles = ", ".join(str(entry.get("id")) for entry in self._catalog)
        raise InvalidRequestError(f"La voz Piper '{voice}' no esta en el catalogo. Disponibles: {disponibles}.")


def _piper_installation() -> tuple[bool, str | None, str | None]:
    """Comprueba Piper SIN importarlo (importarlo arrastra onnxruntime)."""
    try:
        from importlib.util import find_spec

        if find_spec("piper") is None:
            return False, None, INSTALL_HINT
    except Exception as error:
        return False, None, f"No se pudo verificar Piper: {_short(error)}"
    try:
        from importlib.metadata import version

        return True, version("piper-tts"), None
    except Exception:
        return True, None, None


def _audio_of(chunk) -> np.ndarray:
    """Chunk de Piper -> mono float32 en [-1, 1]."""
    raw = getattr(chunk, "audio_int16_bytes", None)
    if raw is None:
        audio = getattr(chunk, "audio", None)
        return np.asarray(audio, dtype=np.float32).reshape(-1) if audio is not None else np.zeros(0, dtype=np.float32)
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / INT16_SCALE


def _sample_rate_of(pipeline, fallback: int | None) -> int | None:
    config = getattr(pipeline, "config", None)
    value = getattr(config, "sample_rate", None)
    return int(value) if isinstance(value, int) and value > 0 else fallback


def _short(error: Exception) -> str:
    text = str(error).strip().replace("\n", " ")
    return text[:300] if text else error.__class__.__name__
