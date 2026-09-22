"""Pruebas de la deteccion de espeak-ng (sin depender del sistema)."""

from __future__ import annotations

import pytest

from voice_engine import espeak


def test_espeak_esta_disponible_en_el_entorno_del_motor():
    status = espeak.configure_espeak()
    assert status.available is True, status.reason
    assert status.source in {"espeakng-loader", "system"}


def test_sin_rueda_ni_sistema_se_reporta_el_motivo(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(espeak, "_load_pip_loader", lambda: None)
    monkeypatch.setattr(espeak, "which", lambda name: None)
    status = espeak.configure_espeak()
    assert status.available is False
    assert status.source == "none"
    assert "espeak-ng" in (status.reason or "")
    assert "voice:setup" in (status.reason or "")


def test_usa_el_ejecutable_del_sistema_si_existe(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(espeak, "_load_pip_loader", lambda: None)
    monkeypatch.setattr(espeak, "which", lambda name: "C:/fake/espeak-ng.exe" if name == "espeak-ng" else None)
    status = espeak.configure_espeak()
    assert status.available is True
    assert status.source == "system"


def test_configura_las_variables_de_phonemizer(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("PHONEMIZER_ESPEAK_LIBRARY", raising=False)
    monkeypatch.delenv("PHONEMIZER_ESPEAK_DATA_PATH", raising=False)
    monkeypatch.setattr(espeak, "_load_pip_loader", lambda: ("C:/lib/espeak-ng.dll", "C:/data/espeak-ng-data"))
    status = espeak.configure_espeak()
    assert status.available is True
    assert status.source == "espeakng-loader"
    assert espeak.os.environ["PHONEMIZER_ESPEAK_LIBRARY"] == "C:/lib/espeak-ng.dll"
    assert espeak.os.environ["PHONEMIZER_ESPEAK_DATA_PATH"] == "C:/data/espeak-ng-data"
