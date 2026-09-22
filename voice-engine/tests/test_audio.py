"""Pruebas del ensamblado de audio (sin modelo: numpy + soundfile)."""

from __future__ import annotations

import numpy as np
import pytest

from voice_engine.audio import (
    as_mono_float32,
    concatenate,
    duration_seconds,
    encode_mp3,
    normalize_peak,
    peak,
    read_wav,
    silence,
    write_wav,
)
from voice_engine.errors import AudioEncodingError

SAMPLE_RATE = 24_000


def test_silencio_tiene_la_duracion_pedida():
    assert silence(SAMPLE_RATE, 500).size == SAMPLE_RATE // 2
    assert silence(SAMPLE_RATE, 0).size == 0
    assert silence(SAMPLE_RATE, -50).size == 0


def test_concatenacion_respeta_orden_y_pausas():
    first = np.full(SAMPLE_RATE // 4, 0.5, dtype=np.float32)
    second = np.full(SAMPLE_RATE // 4, 0.7, dtype=np.float32)
    track = concatenate([first, second], SAMPLE_RATE, [250, 0])
    expected = len(first) + SAMPLE_RATE // 4 + len(second)
    assert track.size == expected
    assert float(track[0]) == pytest.approx(0.5)
    assert float(track[-1]) == pytest.approx(0.7)
    # Los 250 ms del medio son silencio.
    middle = track[len(first) : len(first) + SAMPLE_RATE // 4]
    assert float(np.max(np.abs(middle))) == 0.0


def test_concatenacion_exige_una_pausa_por_fragmento():
    with pytest.raises(ValueError):
        concatenate([np.zeros(10, dtype=np.float32)], SAMPLE_RATE, [0, 100])


def test_concatenacion_vacia_devuelve_vacio():
    assert concatenate([], SAMPLE_RATE, []).size == 0


def test_audio_estereo_se_convierte_a_mono():
    stereo = np.stack([np.full(100, 0.4, dtype=np.float32), np.full(100, 0.6, dtype=np.float32)], axis=1)
    mono = as_mono_float32(stereo)
    assert mono.shape == (100,)
    assert float(mono[0]) == pytest.approx(0.5, abs=1e-6)


def test_audio_se_recorta_al_rango_valido():
    mono = as_mono_float32(np.array([2.0, -3.0], dtype=np.float32))
    assert float(mono[0]) == 1.0
    assert float(mono[1]) == -1.0


def test_normalize_peak_atenua_pero_nunca_amplifica():
    loud = np.array([1.0, -1.0], dtype=np.float32)
    quiet = np.array([0.05, -0.05], dtype=np.float32)
    assert peak(normalize_peak(loud)) < 1.0
    assert peak(normalize_peak(quiet)) == pytest.approx(0.05, abs=1e-6)


def test_wav_escrito_se_puede_leer_y_tiene_duracion(tmp_path):
    path = tmp_path / "prueba.wav"
    track = np.zeros(SAMPLE_RATE, dtype=np.float32)
    write_wav(path, track, SAMPLE_RATE)
    assert path.exists()
    samples, sample_rate = read_wav(path)
    assert sample_rate == SAMPLE_RATE
    assert samples.size == SAMPLE_RATE
    assert duration_seconds(path) == pytest.approx(1.0, abs=0.01)


def test_mp3_sin_ffmpeg_falla_con_mensaje_claro(tmp_path):
    wav = tmp_path / "origen.wav"
    write_wav(wav, np.zeros(1000, dtype=np.float32), SAMPLE_RATE)
    with pytest.raises(AudioEncodingError) as error:
        encode_mp3(wav, tmp_path / "salida.mp3", None)
    assert "FFmpeg" in str(error.value)
