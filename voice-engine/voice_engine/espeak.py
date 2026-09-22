"""Deteccion de espeak-ng.

Kokoro necesita espeak-ng para la fonetizacion del espanol (`lang_code='e'`).
Se prefiere la rueda `espeakng-loader` (contenida en el venv, sin permisos de admin)
y se acepta como alternativa una instalacion del sistema en el PATH.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from shutil import which


@dataclass(frozen=True)
class EspeakStatus:
    available: bool
    source: str  # "system" | "espeakng-loader" | "none"
    library_path: str | None = None
    data_path: str | None = None
    reason: str | None = None

    def as_dict(self) -> dict:
        return {
            "available": self.available,
            "source": self.source,
            "library": self.library_path,
            "data": self.data_path,
            "reason": self.reason,
        }


def configure_espeak() -> EspeakStatus:
    """Deja espeak-ng usable por `misaki`/`phonemizer` y reporta el resultado.

    Es idempotente y no lanza: si no hay espeak-ng devuelve `available=False` con el
    motivo, para que el servicio arranque degradado en lugar de morir.
    """
    executable = which("espeak-ng") or which("espeak")
    loader = _load_pip_loader()

    if loader is not None:
        library_path, data_path = loader
        if library_path:
            os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", library_path)
        if data_path:
            os.environ.setdefault("PHONEMIZER_ESPEAK_DATA_PATH", data_path)
        return EspeakStatus(
            available=True,
            source="espeakng-loader",
            library_path=library_path,
            data_path=data_path,
        )

    if executable:
        return EspeakStatus(available=True, source="system", library_path=executable)

    return EspeakStatus(
        available=False,
        source="none",
        reason=(
            "No se encontro espeak-ng. Ejecuta `npm run voice:setup` para instalar la rueda "
            "espeakng-loader en el entorno del motor, o instala eSpeak NG en el sistema."
        ),
    )


def _load_pip_loader() -> tuple[str | None, str | None] | None:
    """Devuelve (libreria, datos) del paquete `espeakng-loader`, si esta instalado."""
    try:
        import espeakng_loader  # type: ignore[import-not-found]
    except Exception:
        return None

    make_available = getattr(espeakng_loader, "make_library_available", None)
    if callable(make_available):
        try:
            make_available()
        except Exception:
            # La version que fija requirements.txt no lo necesita; si falla seguimos
            # con las rutas explicitas de abajo.
            pass

    library = _first_existing(
        getattr(espeakng_loader, "get_library_path", None),
        getattr(espeakng_loader, "get_library_dir", None),
    )
    data = _first_existing(
        getattr(espeakng_loader, "get_data_path", None),
        getattr(espeakng_loader, "get_data_dir", None),
    )
    if not library and not data:
        return None
    return library, data


def _first_existing(*getters) -> str | None:
    for getter in getters:
        if not callable(getter):
            continue
        try:
            value = getter()
        except Exception:
            continue
        if not value:
            continue
        text = str(value)
        if Path(text).exists():
            return text
    return None
