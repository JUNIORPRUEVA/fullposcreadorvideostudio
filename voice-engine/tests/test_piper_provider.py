"""Pruebas del proveedor Piper (sin onnxruntime ni modelos reales).

Se sustituye el modulo `piper` por un doble y se comprueba lo que de verdad importa:
que el catalogo sea el verificado, que el speed se traduzca a `length_scale`, que el
audio int16 se convierta a mono float32 y que una voz sin descargar no se cargue.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from voice_engine import piper_provider
from voice_engine.errors import EngineUnavailableError, InvalidRequestError
from voice_engine.piper_provider import (
    PiperProvider,
    catalog_voices,
    load_catalog,
    model_paths,
    voice_from_catalog,
)

CATALOG_IDS = ["es_AR-daniela-high", "es_MX-ald-medium", "es_MX-claude-high"]


# --------------------------------------------------------------- dobles

class FakeAudioChunk:
    def __init__(self, samples: list[int], sample_rate: int = 22050) -> None:
        self.sample_rate = sample_rate
        self.audio_int16_bytes = np.asarray(samples, dtype=np.int16).tobytes()


class FakePiperVoice:
    load_calls: list[str] = []

    def __init__(self, sample_rate: int) -> None:
        self.config = SimpleNamespace(sample_rate=sample_rate)
        self.synthesized: list[tuple[str, dict]] = []

    @classmethod
    def load(cls, model_path, *args, **kwargs):  # noqa: ANN001 - imita la API real
        cls.load_calls.append(str(model_path))
        return cls(22050)

    def synthesize(self, text: str, syn_config=None, include_alignments=False):  # noqa: ANN001
        self.synthesized.append((text, getattr(syn_config, "kwargs", {})))
        return [FakeAudioChunk([0, 16384, -16384])]


def install_fake_piper(monkeypatch: pytest.MonkeyPatch) -> None:
    """Deja `piper` disponible con la API documentada, sin instalar nada."""

    class FakeSynthesisConfig:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

    module = types.ModuleType("piper")
    module.PiperVoice = FakePiperVoice
    module.SynthesisConfig = FakeSynthesisConfig
    monkeypatch.setitem(sys.modules, "piper", module)
    monkeypatch.setattr(piper_provider, "_piper_installation", lambda: (True, "1.8.0-test", None))
    FakePiperVoice.load_calls = []


def make_model(root: Path, voice_id: str) -> None:
    entry = next(item for item in catalog_voices() if item["id"] == voice_id)
    model, config = model_paths(entry, root)
    model.parent.mkdir(parents=True, exist_ok=True)
    model.write_bytes(b"\x00" * 16)
    config.write_text("{}", encoding="utf-8")


# -------------------------------------------------------------- catalogo

def test_el_catalogo_tiene_las_tres_voces_latinas_verificadas():
    catalog = load_catalog()
    assert catalog["repo"] == "rhasspy/piper-voices"
    ids = [entry["id"] for entry in catalog_voices()]
    assert ids == CATALOG_IDS

    daniela = next(entry for entry in catalog_voices() if entry["id"] == "es_AR-daniela-high")
    assert daniela["locale"] == "es_AR"
    assert daniela["region"] == "Argentina"
    assert daniela["quality"] == "high"
    assert daniela["datasetLicense"].startswith("Attribution-ShareAlike")
    assert daniela["commercialUse"] == "review"

    ald = next(entry for entry in catalog_voices() if entry["id"] == "es_MX-ald-medium")
    assert ald["locale"] == "es_MX"
    assert ald["quality"] == "medium"
    assert ald["datasetLicense"].startswith("Unlicense")
    assert ald["commercialUse"] == "ok"

    claude = next(entry for entry in catalog_voices() if entry["id"] == "es_MX-claude-high")
    assert claude["quality"] == "high"
    assert claude["datasetLicense"] == "apache-2.0"
    assert claude["commercialUse"] == "ok"


def test_ninguna_voz_piper_declara_genero_inventado():
    for entry in catalog_voices():
        assert entry["gender"] is None, entry["id"]


def test_los_modelos_se_guardan_con_la_estructura_del_repositorio(tmp_path: Path):
    entry = next(item for item in catalog_voices() if item["id"] == "es_AR-daniela-high")
    model, config = model_paths(entry, tmp_path)
    assert model == tmp_path / "es" / "es_AR" / "daniela" / "high" / "es_AR-daniela-high.onnx"
    assert config == tmp_path / "es" / "es_AR" / "daniela" / "high" / "es_AR-daniela-high.onnx.json"


def test_voice_from_catalog_marca_las_no_descargadas_y_las_dudosas():
    entry = next(item for item in catalog_voices() if item["id"] == "es_AR-daniela-high")
    missing = voice_from_catalog(entry, available=False)
    assert missing.available is False
    assert "voice:setup" in (missing.note or "")
    assert missing.engine == "piper"
    assert missing.region == "Argentina"
    assert missing.gender is None

    ready = voice_from_catalog(entry, available=True)
    assert ready.available is True
    assert "comercial" in (ready.note or "")  # licencia del dataset a revisar
    assert ready.commercial_ok is False


# ---------------------------------------------------------------- estado

def test_sin_modelos_descargados_no_hay_voces_listas(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(piper_provider, "_piper_installation", lambda: (True, "1.8.0-test", None))
    provider = PiperProvider(root=tmp_path)

    assert all(voice.available is False for voice in provider.voices())
    status = provider.status()
    assert status["voicesTotal"] == 3
    assert status["voicesReady"] == 0
    assert "voice:setup" in str(status["reason"])

    with pytest.raises(EngineUnavailableError):
        provider.load("es_MX-ald-medium")


def test_piper_no_instalado_se_reporta_sin_romper(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(piper_provider, "_piper_installation", lambda: (False, None, "El motor Piper no esta instalado."))
    provider = PiperProvider(root=tmp_path)
    status = provider.status()
    assert status["installed"] is False
    assert "no esta instalado" in str(status["reason"])
    with pytest.raises(EngineUnavailableError):
        provider.load("es_MX-ald-medium")


def test_piper_se_puede_desactivar_por_entorno(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    install_fake_piper(monkeypatch)
    make_model(tmp_path, "es_MX-ald-medium")
    monkeypatch.setenv("VOICE_PIPER_DISABLED", "1")
    provider = PiperProvider(root=tmp_path)
    assert "desactivado" in str(provider.status()["reason"])
    with pytest.raises(EngineUnavailableError):
        provider.load("es_MX-ald-medium")


def test_una_voz_fuera_del_catalogo_se_rechaza(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    install_fake_piper(monkeypatch)
    provider = PiperProvider(root=tmp_path)
    with pytest.raises(InvalidRequestError) as error:
        provider.load("es_AR-voz-inventada")
    assert "catalogo" in str(error.value)


# --------------------------------------------------------------- sintesis

def test_sintetiza_y_convierte_int16_a_float32(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    install_fake_piper(monkeypatch)
    make_model(tmp_path, "es_MX-ald-medium")
    provider = PiperProvider(root=tmp_path)

    audio = provider.synthesize("Bienvenido a FullPOS Cloud.", "es_MX-ald-medium", 1.0)

    assert audio.dtype == np.float32
    assert audio.shape == (3,)
    assert audio[1] == pytest.approx(0.5, abs=1e-4)  # 16384 / 32768
    assert audio[2] == pytest.approx(-0.5, abs=1e-4)
    assert provider.sample_rate == 22050
    assert FakePiperVoice.load_calls == [str(model_paths(next(e for e in catalog_voices() if e["id"] == "es_MX-ald-medium"), tmp_path)[0])]


@pytest.mark.parametrize("speed,expected", [(1.0, 1.0), (1.25, 0.8), (0.5, 2.0), (0.85, 1.176)])
def test_la_velocidad_se_traduce_a_length_scale(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, speed: float, expected: float):
    install_fake_piper(monkeypatch)
    make_model(tmp_path, "es_MX-claude-high")
    provider = PiperProvider(root=tmp_path)

    provider.synthesize("Hola.", "es_MX-claude-high", speed)

    pipeline = provider._pipelines["es_MX-claude-high"]
    _, syn_config = pipeline.synthesized[-1]
    assert syn_config["length_scale"] == pytest.approx(expected, abs=1e-3)
    assert syn_config["volume"] == 1.0


def test_la_voz_se_carga_una_sola_vez_por_proceso(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    install_fake_piper(monkeypatch)
    make_model(tmp_path, "es_MX-ald-medium")
    provider = PiperProvider(root=tmp_path)

    for _ in range(3):
        provider.synthesize("Fragmento.", "es_MX-ald-medium", 1.0)

    assert len(FakePiperVoice.load_calls) == 1
    assert provider.status()["loaded"] is True


def test_sin_voz_indicada_piper_no_adivina(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    install_fake_piper(monkeypatch)
    provider = PiperProvider(root=tmp_path)
    with pytest.raises(InvalidRequestError):
        provider.load(None)


def test_un_fallo_de_piper_no_rompe_el_servicio(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    install_fake_piper(monkeypatch)
    make_model(tmp_path, "es_MX-ald-medium")

    def explota(*args, **kwargs):  # noqa: ANN002, ANN003
        raise RuntimeError("onnxruntime se cayo")

    monkeypatch.setattr(FakePiperVoice, "synthesize", explota)
    provider = PiperProvider(root=tmp_path)
    from voice_engine.errors import SynthesisFailedError

    with pytest.raises(SynthesisFailedError) as error:
        provider.synthesize("Hola.", "es_MX-ald-medium", 1.0)
    assert "onnxruntime" in str(error.value)
