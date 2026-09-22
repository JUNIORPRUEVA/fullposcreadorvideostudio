"""Pruebas del servicio HTTP local (FastAPI) con el motor de prueba."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from conftest import FakeProvider
from voice_engine.api import create_app
from voice_engine.engine import VoiceEngine
from voice_engine.models import SynthesisRequest


@pytest.fixture
def client(provider: FakeProvider, storage: Path, output_root: Path) -> TestClient:
    engine = VoiceEngine(provider, output_root=output_root, storage_root=storage, ffmpeg=None)
    return TestClient(create_app(engine))


def body(**overrides) -> dict:
    payload = {"text": "Hola mundo.", "voice": "ef_dora", "speed": 1.0, "pauseMs": 300, "format": "wav"}
    payload.update(overrides)
    return payload


def test_health_responde_sin_cargar_el_modelo(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["engine"]["loaded"] is False
    assert payload["version"]


def test_health_no_falla_si_el_motor_no_esta(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200


def test_lista_de_voces(client: TestClient):
    response = client.get("/voices")
    assert response.status_code == 200
    assert [voice["id"] for voice in response.json()["voices"]] == ["ef_dora", "em_alex", "em_santa"]


def test_synthesize_devuelve_metadatos(client: TestClient):
    response = client.post("/synthesize", json=body())
    assert response.status_code == 200
    payload = response.json()
    assert payload["format"] == "wav"
    assert payload["voice"] == "ef_dora"
    assert payload["durationSeconds"] > 0
    assert payload["relativePath"].startswith("generated-audio/")
    assert payload["bytes"] > 0


def test_preview_usa_el_texto_fijo(client: TestClient):
    response = client.post("/preview", json={"voice": "ef_dora", "speed": 1.0})
    assert response.status_code == 200
    assert response.json()["relativePath"].startswith("generated-audio/previews/")


def test_payload_invalido_devuelve_422(client: TestClient):
    response = client.post("/synthesize", json=body(pauseMs="trescientos"))
    assert response.status_code == 422


def test_texto_vacio_devuelve_400_con_codigo(client: TestClient):
    response = client.post("/synthesize", json=body(text="   "))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


def test_voz_inexistente_devuelve_400_con_las_validas(client: TestClient):
    response = client.post("/synthesize", json=body(voice="ef_fantasma"))
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "voice_not_found"
    assert "ef_dora" in error["message"]


def test_texto_largo_devuelve_413(provider: FakeProvider, storage: Path, output_root: Path):
    engine = VoiceEngine(provider, output_root=output_root, storage_root=storage, max_chars=40, ffmpeg=None)
    client = TestClient(create_app(engine))
    response = client.post("/synthesize", json=body(text="a" * 41))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "text_too_long"


def test_motor_no_instalado_devuelve_503(provider_not_installed: FakeProvider, storage: Path, output_root: Path):
    engine = VoiceEngine(provider_not_installed, output_root=output_root, storage_root=storage, ffmpeg=None)
    client = TestClient(create_app(engine))
    response = client.post("/synthesize", json=body())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "engine_unavailable"


def test_los_errores_no_exponen_trazas(client: TestClient):
    response = client.post("/synthesize", json=body(voice="ef_fantasma"))
    serialized = response.text
    assert "Traceback" not in serialized
    assert "site-packages" not in serialized


def test_token_opcional_protege_la_generacion(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("VOICE_ENGINE_TOKEN", "token-de-prueba")
    assert client.post("/synthesize", json=body()).status_code == 401
    # /health sigue libre: es la sonda de arranque.
    assert client.get("/health").status_code == 200
    authorized = client.post("/synthesize", json=body(), headers={"x-voice-token": "token-de-prueba"})
    assert authorized.status_code == 200


def test_from_payload_ignora_tipos_raros():
    request = SynthesisRequest.from_payload({"text": "hola", "voice": "ef_dora", "speed": "rapido", "pauseMs": "x", "format": 7})
    assert request.speed == 1.0
    assert request.pause_ms == 300
    assert request.format == "wav"
    assert request.text == "hola"
