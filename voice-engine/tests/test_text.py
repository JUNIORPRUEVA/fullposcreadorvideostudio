"""Pruebas del troceo y la normalizacion del guion."""

from __future__ import annotations

from voice_engine.text import (
    IN_PARAGRAPH_BREAK,
    NO_BREAK,
    PARAGRAPH_BREAK,
    normalize_text,
    split_into_chunks,
    stats,
)


def test_normalize_limpia_sin_cambiar_el_contenido():
    raw = "  Hola,\r\n\r\n\r\n  mundo.\tCon acentos: cancion, nino, " + "\u00e1" + "rbol.  \n\x07fIN  "
    normalized = normalize_text(raw)
    assert "\r" not in normalized
    assert "\x07" not in normalized
    assert "\n\n\n" not in normalized
    assert "  " not in normalized
    # El texto sigue diciendo lo mismo, con sus acentos y signos.
    assert normalized.startswith("Hola,")
    assert "cancion, nino, " + "\u00e1" + "rbol." in normalized
    assert normalized.endswith("fIN")


def test_normalize_no_toca_acentos_ni_signos():
    text = "\u00bfC\u00f3mo est\u00e1s? \u00a1Bien! \u2014 dijo ella\u2026"
    assert normalize_text(text) == text


def test_texto_vacio_no_produce_fragmentos():
    assert split_into_chunks("") == []
    assert split_into_chunks("   \n\n  ") == []
    assert stats("   ")["words"] == 0


def test_cada_parrafo_es_un_fragmento():
    text = "Primer parrafo corto.\n\nSegundo parrafo corto.\n\nTercer parrafo."
    chunks = split_into_chunks(text)
    assert [chunk.text for chunk in chunks] == ["Primer parrafo corto.", "Segundo parrafo corto.", "Tercer parrafo."]
    # Fin de parrafo = pausa completa; el ultimo no deja silencio colgando.
    assert [chunk.break_after for chunk in chunks] == [PARAGRAPH_BREAK, PARAGRAPH_BREAK, NO_BREAK]


def test_oraciones_de_un_parrafo_se_agrupan_hasta_el_limite():
    text = "Uno. Dos. Tres. Cuatro. Cinco. Seis."
    chunks = split_into_chunks(text, max_chars=14)
    assert len(chunks) > 1
    assert all(len(chunk.text) <= 14 for chunk in chunks)
    # Los cortes dentro del mismo parrafo usan la pausa corta.
    assert chunks[0].break_after == IN_PARAGRAPH_BREAK
    assert chunks[-1].break_after == NO_BREAK
    # No se pierde texto: reconstruir el parrafo debe dar lo mismo.
    assert " ".join(chunk.text for chunk in chunks) == text


def test_oracion_larga_se_corta_solo_en_espacios():
    words = [f"palabra{index}" for index in range(60)]
    text = " ".join(words)
    chunks = split_into_chunks(text, max_chars=100)
    assert len(chunks) > 1
    assert all(len(chunk.text) <= 100 for chunk in chunks)
    for chunk in chunks:
        for word in chunk.text.split(" "):
            assert word in words  # ninguna palabra quedo partida


def test_palabra_mas_larga_que_el_limite_no_se_rompe():
    long_word = "x" * 250
    chunks = split_into_chunks(f"corto {long_word} final", max_chars=80)
    assert any(long_word in chunk.text for chunk in chunks)


def test_guion_largo_produce_varios_fragmentos_ordenados():
    text = "\n\n".join(f"Parrafo numero {index}. Su segunda oracion." for index in range(20))
    chunks = split_into_chunks(text, max_chars=120)
    assert len(chunks) >= 20
    # El orden del guion se conserva exactamente.
    joined = " ".join(chunk.text for chunk in chunks)
    assert joined.startswith("Parrafo numero 0.")
    assert joined.endswith("Su segunda oracion.")


def test_stats_cuenta_caracteres_palabras_y_parrafos():
    report = stats("Hola mundo.\n\nSegunda linea aqui.")
    assert report["characters"] == len("Hola mundo.\n\nSegunda linea aqui.")
    assert report["words"] == 5
    assert report["paragraphs"] == 2
