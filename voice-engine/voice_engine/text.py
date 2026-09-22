"""Normalizacion y troceo del guion.

Objetivo: poder recibir un guion largo (varios miles de caracteres) y partirlo en
fragmentos que el modelo pueda narrar de forma estable, sin cortar palabras y sin
introducir pausas artificiales excesivas.

No se altera el contenido: no se traduce, no se reescribe, no se cambian signos ni
acentos. Solo se limpian caracteres de control y espacios sobrantes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .config import DEFAULT_CHUNK_CHARS

# Escala aplicada a la pausa configurada por el usuario.
PARAGRAPH_BREAK = 1.0  # fin de parrafo: pausa completa
IN_PARAGRAPH_BREAK = 0.4  # corte forzado dentro del mismo parrafo: pausa corta
NO_BREAK = 0.0  # ultimo fragmento: sin silencio extra

_SPACES = re.compile(r"[ \t\u00a0\u2007\u202f]+")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_MANY_NEWLINES = re.compile(r"\n{3,}")
_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")
_SENTENCE_END = re.compile(r"(?<=[.!?…])\s+")


@dataclass(frozen=True)
class Chunk:
    """Fragmento de guion listo para narrar.

    `break_after` es la fraccion de la pausa configurada que se inserta despues de
    este fragmento (0.0 = sin silencio adicional).
    """

    text: str
    break_after: float


def normalize_text(text: str) -> str:
    """Limpia el guion sin cambiar su contenido."""
    if not isinstance(text, str):
        return ""
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = _CONTROL_CHARS.sub("", cleaned)
    cleaned = _SPACES.sub(" ", cleaned)
    cleaned = "\n".join(line.strip() for line in cleaned.split("\n"))
    cleaned = _MANY_NEWLINES.sub("\n\n", cleaned)
    return cleaned.strip()


def split_into_chunks(text: str, max_chars: int = DEFAULT_CHUNK_CHARS) -> list[Chunk]:
    """Divide el guion en fragmentos narrables.

    - Los parrafos siempre empiezan un fragmento nuevo.
    - Dentro de un parrafo se agrupan oraciones hasta `max_chars`.
    - Una oracion mas larga que `max_chars` se corta solo en espacios (nunca a mitad
      de palabra).
    """
    limit = max(8, int(max_chars))
    normalized = normalize_text(text)
    if not normalized:
        return []

    chunks: list[Chunk] = []
    paragraphs = [block for block in _PARAGRAPH_SPLIT.split(normalized) if block.strip()]

    for paragraph in paragraphs:
        # Un salto de linea simple dentro del parrafo es solo un espacio.
        flat = _SPACES.sub(" ", paragraph.replace("\n", " ")).strip()
        if not flat:
            continue
        pieces = _pack_sentences(flat, limit)
        for index, piece in enumerate(pieces):
            is_last_piece = index == len(pieces) - 1
            chunks.append(Chunk(text=piece, break_after=PARAGRAPH_BREAK if is_last_piece else IN_PARAGRAPH_BREAK))

    if chunks:
        # El ultimo fragmento del guion completo nunca deja silencio colgando.
        chunks[-1] = Chunk(text=chunks[-1].text, break_after=NO_BREAK)
    return chunks


def _pack_sentences(paragraph: str, limit: int) -> list[str]:
    """Agrupa oraciones hasta `limit` caracteres; corta oraciones largas en espacios."""
    pieces: list[str] = []
    current = ""
    for sentence in _sentences(paragraph):
        for part in _split_oversized(sentence, limit):
            candidate = f"{current} {part}".strip() if current else part
            if len(candidate) <= limit:
                current = candidate
                continue
            if current:
                pieces.append(current)
            current = part
    if current:
        pieces.append(current)
    return pieces


def _sentences(paragraph: str) -> list[str]:
    return [item.strip() for item in _SENTENCE_END.split(paragraph) if item.strip()]


def _split_oversized(sentence: str, limit: int) -> list[str]:
    """Corta una oracion que no cabe en `limit` sin partir palabras."""
    if len(sentence) <= limit:
        return [sentence]
    parts: list[str] = []
    current = ""
    for word in sentence.split(" "):
        candidate = f"{current} {word}".strip() if current else word
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            parts.append(current)
        # Una "palabra" mas larga que el limite (URL, cadena rara) se deja entera:
        # preferimos un fragmento largo a romper una palabra.
        current = word
    if current:
        parts.append(current)
    return parts


def stats(text: str) -> dict[str, int]:
    """Conteo de caracteres/palabras usado por la interfaz y las pruebas."""
    normalized = normalize_text(text)
    return {
        "characters": len(normalized),
        "words": len(re.findall(r"\S+", normalized)),
        "paragraphs": len([block for block in _PARAGRAPH_SPLIT.split(normalized) if block.strip()]),
    }
