"""Pruebas unitarias del proveedor Kokoro (sin cargar torch ni el modelo)."""

from __future__ import annotations

import sys

from voice_engine import kokoro_provider
from voice_engine.kokoro_provider import (
    FALLBACK_SPANISH_VOICES,
    _discover_spanish_voices,
    _voices_from_files,
    voice_from_id,
)


def test_voice_from_id_interpreta_idioma_y_genero():
    dora = voice_from_id("ef_dora")
    assert (dora.language, dora.gender, dora.name) == ("es", "Femenina", "Dora")
    alex = voice_from_id("em_alex")
    assert (alex.language, alex.gender, alex.name) == ("es", "Masculina", "Alex")
    santa = voice_from_id("em_santa")
    assert santa.name == "Santa"


def test_solo_se_listan_las_voces_espanolas():
    files = [
        "config.json",
        "kokoro-v1_0.pth",
        "voices/af_bella.pt",
        "voices/ef_dora.pt",
        "voices/em_alex.pt",
        "voices/em_santa.pt",
        "voices/zf_xiaobei.pt",
        "other/ef_no_es_voz.pt",
    ]
    voices = _voices_from_files(files)
    assert [voice.id for voice in voices] == ["ef_dora", "em_alex", "em_santa"]
    assert all(voice.language == "es" for voice in voices)


def test_sin_red_ni_cache_se_usa_la_lista_conocida(monkeypatch):
    monkeypatch.setattr(kokoro_provider, "_repo_files", lambda repo_id: [])
    monkeypatch.setattr(kokoro_provider, "_voices_from_cache", lambda repo_id: [])
    voices, source = _discover_spanish_voices("hexgrad/Kokoro-82M")
    assert source == "fallback"
    assert [voice.id for voice in voices] == list(FALLBACK_SPANISH_VOICES)


def test_cache_y_repositorio_se_unen(monkeypatch):
    monkeypatch.setattr(kokoro_provider, "_voices_from_cache", lambda repo_id: [voice_from_id("ef_dora")])
    monkeypatch.setattr(kokoro_provider, "_repo_files", lambda repo_id: ["voices/ef_dora.pt", "voices/em_alex.pt"])
    voices, source = _discover_spanish_voices("hexgrad/Kokoro-82M")
    assert [voice.id for voice in voices] == ["ef_dora", "em_alex"]
    assert source == "cache+huggingface"


def test_status_no_importa_torch():
    """/health se consulta seguido: no puede arrastrar la carga de torch."""
    provider = kokoro_provider.KokoroProvider()
    report = provider.status()
    assert report["id"] == "kokoro"
    assert report["model"] == "hexgrad/Kokoro-82M"
    assert "torch" not in sys.modules
