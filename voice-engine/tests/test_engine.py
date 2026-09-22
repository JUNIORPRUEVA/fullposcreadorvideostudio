"""Pruebas del motor completo (con proveedor falso: sin torch ni modelo)."""

from __future__ import annotations

from pathlib import Path

import pytest

from conftest import FakeProvider, piece_levels
from voice_engine.audio import duration_seconds, read_wav
from voice_engine.engine import PREVIEW_TEXT, VoiceEngine
from voice_engine.errors import (
    EngineUnavailableError,
    InvalidRequestError,
    TextTooLongError,
    VoiceNotFoundError,
)
from voice_engine.models import SynthesisRequest


def request(**overrides) -> SynthesisRequest:
    payload = {
        "text": "Hola mundo.",
        "voice": "ef_dora",
        "speed": 1.0,
        "pause_ms": 300,
        "format": "wav",
    }
    payload.update(overrides)
    return SynthesisRequest(**payload)


# ------------------------------------------------------------------ feliz


def test_genera_un_wav_real_con_la_duracion_esperada(engine: VoiceEngine, provider: FakeProvider):
    result = engine.synthesize(request(text="Hola mundo.\n\nAdios mundo.", pause_ms=300))

    path = engine.output_root / result.relative_path.split("generated-audio/", 1)[1]
    assert path.exists()
    samples, sample_rate = read_wav(path)
    assert sample_rate == provider.sample_rate
    assert samples.size > 0
    # 11 y 12 caracteres a 10 ms/caracter + 300 ms de pausa entre parrafos.
    assert result.duration_seconds == pytest.approx(0.11 + 0.3 + 0.12, abs=0.01)
    assert duration_seconds(path) == pytest.approx(result.duration_seconds, abs=0.01)
    assert result.format == "wav"
    assert result.bytes == path.stat().st_size > 0


def test_respeta_el_orden_de_los_fragmentos(engine: VoiceEngine):
    result = engine.synthesize(request(text="Uno.\n\nDos.\n\nTres.", pause_ms=0))
    path = engine.output_root / result.relative_path.split("generated-audio/", 1)[1]
    samples, _ = read_wav(path)
    assert piece_levels(samples) == [0.30, 0.31, 0.32]


def test_guion_largo_se_trocea_y_se_reensambla_completo(engine: VoiceEngine, provider: FakeProvider):
    paragraphs = [f"Parrafo {index} con varias palabras para narrar." for index in range(12)]
    text = "\n\n".join(paragraphs)
    result = engine.synthesize(request(text=text, pause_ms=0))

    assert len(result.chunks) == 12
    assert len(provider.calls) == 12
    for index, call in enumerate(provider.calls):
        assert call["text"] == paragraphs[index]
    assert result.text_characters == len(text)
    assert result.text_words == 84  # 7 palabras x 12 parrafos


def test_las_claves_del_resultado_son_estables(engine: VoiceEngine):
    payload = engine.synthesize(request()).as_dict()
    for key in (
        "generationId",
        "fileName",
        "relativePath",
        "format",
        "durationSeconds",
        "bytes",
        "sampleRate",
        "voice",
        "speed",
        "pauseMs",
        "engine",
        "createdAt",
        "textCharacters",
        "textWords",
        "chunks",
    ):
        assert key in payload


def test_el_audio_queda_bajo_generated_audio_con_nombre_seguro(engine: VoiceEngine):
    result = engine.synthesize(request())
    assert result.relative_path.startswith("generated-audio/")
    assert result.relative_path.endswith(".wav")
    assert ".." not in result.relative_path
    assert result.file_name == f"ef_dora-{result.generation_id}.wav"


def test_escribe_un_manifiesto_con_la_configuracion_usada(engine: VoiceEngine):
    result = engine.synthesize(request(voice="em_alex", speed=1.1, pause_ms=250))
    manifest = (engine.output_root / result.relative_path.split("generated-audio/", 1)[1]).with_suffix(".json")
    assert manifest.exists()
    body = manifest.read_text(encoding="utf-8")
    assert '"em_alex"' in body
    assert '"speed": 1.1' in body
    assert '"pauseMs": 250' in body
    assert result.generation_id in body


# --------------------------------------------------------- consistencia


def test_tres_generaciones_seguidas_usan_la_misma_voz_y_configuracion(engine: VoiceEngine, provider: FakeProvider):
    """El objetivo de la Fase 1: repetir la misma narracion manana y obtener la misma voz."""
    results = [
        engine.synthesize(request(text="Bienvenido a FullPOS Cloud. Esta es una prueba.", voice="ef_dora", speed=1.0))
        for _ in range(3)
    ]
    assert len({result.generation_id for result in results}) == 3
    assert {result.voice for result in results} == {"ef_dora"}
    assert {result.speed for result in results} == {1.0}
    assert {result.sample_rate for result in results} == {provider.sample_rate}
    durations = {result.duration_seconds for result in results}
    assert len(durations) == 1  # mismo texto + misma voz = misma duracion
    for result in results:
        path = engine.output_root / result.relative_path.split("generated-audio/", 1)[1]
        assert path.exists() and duration_seconds(path) > 0
    assert {call["voice"] for call in provider.calls} == {"ef_dora"}


def test_el_modelo_se_carga_una_sola_vez(engine: VoiceEngine, provider: FakeProvider):
    for _ in range(4):
        engine.synthesize(request())
    # El motor pide cargar en cada peticion; el proveedor carga el modelo UNA vez.
    assert provider.load_attempts == 4
    assert provider.load_count == 1


def test_no_se_carga_el_modelo_si_la_peticion_es_invalida(engine: VoiceEngine, provider: FakeProvider):
    with pytest.raises(InvalidRequestError):
        engine.synthesize(request(text="   "))
    assert provider.load_count == 0


# ------------------------------------------------------------ validacion


def test_texto_vacio(engine: VoiceEngine):
    with pytest.raises(InvalidRequestError):
        engine.synthesize(request(text="\n\n   "))


def test_texto_demasiado_largo(provider: FakeProvider, storage: Path, output_root: Path):
    small = VoiceEngine(provider, output_root=output_root, storage_root=storage, max_chars=50, ffmpeg=None)
    with pytest.raises(TextTooLongError) as error:
        small.synthesize(request(text="a" * 51))
    assert "50" in str(error.value)


@pytest.mark.parametrize("bad_speed", [0.1, 3.0, -1.0])
def test_velocidad_fuera_de_rango(engine: VoiceEngine, bad_speed: float):
    with pytest.raises(InvalidRequestError):
        engine.synthesize(request(speed=bad_speed))


@pytest.mark.parametrize("bad_pause", [-1, 5_000])
def test_pausa_fuera_de_rango(engine: VoiceEngine, bad_pause: int):
    with pytest.raises(InvalidRequestError):
        engine.synthesize(request(pause_ms=bad_pause))


def test_formato_no_soportado(engine: VoiceEngine):
    with pytest.raises(InvalidRequestError):
        engine.synthesize(request(format="ogg"))


def test_mp3_sin_ffmpeg_explica_que_falta(engine: VoiceEngine):
    with pytest.raises(InvalidRequestError) as error:
        engine.synthesize(request(format="mp3"))
    assert "FFmpeg" in str(error.value)


def test_voz_inexistente_lista_las_validas(engine: VoiceEngine):
    with pytest.raises(VoiceNotFoundError) as error:
        engine.synthesize(request(voice="ef_fantasma"))
    message = str(error.value)
    assert "ef_dora" in message and "em_santa" in message


def test_fallo_del_modelo_no_deja_archivo_a_medias(storage: Path, output_root: Path):
    failing = FakeProvider(fail_on_index=1)
    engine = VoiceEngine(failing, output_root=output_root, storage_root=storage, ffmpeg=None)
    with pytest.raises(RuntimeError):
        engine.synthesize(request(text="Uno.\n\nDos.", pause_ms=0))
    assert not list(output_root.rglob("*.wav"))


def test_motor_no_instalado(provider_not_installed: FakeProvider, storage: Path, output_root: Path):
    engine = VoiceEngine(provider_not_installed, output_root=output_root, storage_root=storage, ffmpeg=None)
    with pytest.raises(EngineUnavailableError):
        engine.synthesize(request())


# -------------------------------------------------------------- preview


def test_preview_usa_texto_fijo_y_carpeta_previews(engine: VoiceEngine, provider: FakeProvider):
    result = engine.preview(SynthesisRequest(text="", voice="ef_dora", speed=1.0, pause_ms=0, format="wav"))
    assert result.relative_path.startswith("generated-audio/previews/")
    assert result.format == "wav"
    assert provider.calls[-1]["text"] == PREVIEW_TEXT
    assert result.pause_ms == 0


def test_preview_recorta_textos_largos(engine: VoiceEngine, provider: FakeProvider):
    result = engine.preview(
        SynthesisRequest(text="palabra " * 200, voice="em_alex", speed=1.0, pause_ms=0, format="wav")
    )
    assert len(provider.calls[-1]["text"]) <= 320
    assert result.voice == "em_alex"


# ----------------------------------------------------- health y voces


def test_health_ok_y_formatos_disponibles(engine: VoiceEngine):
    report = engine.health()
    assert report["status"] == "ok"
    assert report["usable"] is True
    assert report["formats"] == ["wav"]  # sin ffmpeg no se anuncia mp3
    assert report["limits"]["maxTextChars"] > 500
    assert report["reason"] is None


def test_health_degradado_si_falta_espeak(provider_no_espeak: FakeProvider, storage: Path, output_root: Path):
    engine = VoiceEngine(provider_no_espeak, output_root=output_root, storage_root=storage, ffmpeg=None)
    report = engine.health()
    assert report["status"] == "degraded"
    assert report["usable"] is False


def test_health_degradado_si_falta_el_motor(provider_not_installed: FakeProvider, storage: Path, output_root: Path):
    engine = VoiceEngine(provider_not_installed, output_root=output_root, storage_root=storage, ffmpeg=None)
    report = engine.health()
    assert report["status"] == "degraded"
    assert report["engine"]["installed"] is False


def test_lista_de_voces(engine: VoiceEngine):
    report = engine.voices()
    assert report["engine"] == "fake"
    assert [voice["id"] for voice in report["voices"]] == ["ef_dora", "em_alex", "em_santa"]
    assert report["sampleRate"] == 24_000
    assert all(voice["language"] == "es" for voice in report["voices"])
