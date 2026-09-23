"""Contrato del proveedor de voz.

El motor no conoce a Kokoro directamente: habla con este protocolo. Eso permite
probar el motor completo con un proveedor falso (sin torch) y cambiar de modelo en
el futuro sin tocar el servicio HTTP ni el API del estudio.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np

from .models import Voice


@runtime_checkable
class VoiceProvider(Protocol):
    @property
    def engine_id(self) -> str: ...

    @property
    def label(self) -> str: ...

    @property
    def sample_rate(self) -> int: ...

    def status(self) -> dict:
        """Estado del motor (`installed`, `loaded`, `reason`, ...). Nunca lanza."""
        ...

    def load(self, voice: str | None = None) -> None:
        """Carga el modelo. Debe ser idempotente y cargarlo UNA sola vez por proceso.

        `voice` permite a los motores con un modelo por voz (Piper) cargar solo la voz
        pedida; los que tienen un modelo unico (Kokoro) lo ignoran.
        """
        ...

    def voices(self) -> list[Voice]:
        """Voces disponibles. Puede lanzar EngineUnavailableError si no hay motor."""
        ...

    def synthesize(self, text: str, voice: str, speed: float) -> np.ndarray:
        """Devuelve audio mono float32 del fragmento pedido."""
        ...
