"""Utilidades compartidas por las pruebas del motor.

Las pruebas NO necesitan Kokoro ni torch: el motor se ejercita con un proveedor
falso que genera audio determinista, de modo que la suite corre en segundos.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from voice_engine.engine import VoiceEngine
from voice_engine.errors import EngineUnavailableError
from voice_engine.models import Voice


class FakeProvider:
    """Proveedor determinista.

    - Marca el primer sample de cada fragmento con su indice, para poder verificar
      que el ensamblado respeta el orden.
    - La duracion crece con el texto, para poder verificar sumas y pausas.
    """

    def __init__(
        self,
        *,
        sample_rate: int = 24_000,
        installed: bool = True,
        espeak_available: bool = True,
        fail_on_index: int | None = None,
        seconds_per_char: float = 0.01,
        voices: list[str] | None = None,
    ) -> None:
        self.engine_id = "fake"
        self.label = "Proveedor de prueba"
        self.sample_rate_rate = sample_rate
        self.voices_available = voices or ["ef_dora", "em_alex", "em_santa"]
        self._installed = installed
        self._espeak_available = espeak_available
        self._fail_on_index = fail_on_index
        self._seconds_per_char = seconds_per_char
        self.calls: list[dict] = []
        self.load_count = 0
        self.load_attempts = 0
        self._loaded = False

    # --- contrato VoiceProvider -------------------------------------------------

    @property
    def sample_rate(self) -> int:
        return self.sample_rate_rate

    def status(self) -> dict:
        return {
            "id": self.engine_id,
            "label": self.label,
            "installed": self._installed,
            "loaded": self._loaded,
            "voicesSource": "test",
            "espeak": {"available": self._espeak_available, "source": "test", "reason": None},
            "reason": None if self._installed else "Motor no instalado (prueba).",
        }

    def load(self) -> None:
        """Como el proveedor real: idempotente. `load_attempts` cuenta las llamadas y
        `load_count` las cargas reales del modelo."""
        self.load_attempts += 1
        if self._loaded:
            return
        if not self._installed:
            raise EngineUnavailableError("Motor no instalado (prueba).")
        self._loaded = True
        self.load_count += 1

    def voices(self) -> list[Voice]:
        return [
            Voice(id=voice_id, name=voice_id.title(), gender="Femenina", language="es")
            for voice_id in self.voices_available
        ]

    def synthesize(self, text: str, voice: str, speed: float) -> np.ndarray:
        index = len(self.calls)
        self.calls.append({"text": text, "voice": voice, "speed": speed})
        if self._fail_on_index is not None and index == self._fail_on_index:
            raise RuntimeError("fallo simulado del modelo")
        frames = max(1, int(self.sample_rate * max(0.02, self._seconds_per_char * len(text)) / speed))
        # Amplitud constante y distinta por fragmento: permite verificar el orden
        # real dentro del archivo ensamblado (quedan por debajo del techo de -1 dBFS).
        return np.full(frames, 0.30 + 0.01 * index, dtype=np.float32)


@pytest.fixture
def storage(tmp_path: Path) -> Path:
    root = tmp_path / "storage"
    root.mkdir(parents=True, exist_ok=True)
    return root


@pytest.fixture
def output_root(storage: Path) -> Path:
    return storage / "generated-audio"


@pytest.fixture
def provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def provider_not_installed() -> FakeProvider:
    """Motor Kokoro ausente del entorno."""
    return FakeProvider(installed=False)


@pytest.fixture
def provider_no_espeak() -> FakeProvider:
    """Motor presente pero sin espeak-ng (no puede fonetizar espanol)."""
    return FakeProvider(espeak_available=False)


@pytest.fixture
def engine(provider: FakeProvider, storage: Path, output_root: Path) -> VoiceEngine:
    # ffmpeg=None: MP3 no disponible, WAV siempre.
    return VoiceEngine(provider, output_root=output_root, storage_root=storage, ffmpeg=None)


def piece_levels(audio: np.ndarray) -> list[float]:
    """Nivel de cada fragmento en el audio ensamblado, en orden de aparicion.

    Cada fragmento del proveedor falso tiene amplitud constante y creciente, asi que
    la lista resultante demuestra que el orden del guion se respeto.
    """
    levels: list[float] = []
    for value in audio:
        rounded = round(float(value), 3)
        if rounded <= 0:
            continue
        if not levels or rounded != levels[-1]:
            levels.append(rounded)
    return levels
