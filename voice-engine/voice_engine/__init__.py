"""Motor TTS local de FullPOS Voice Studio (Fase 1: solo narracion, sin video).

Este paquete se mantiene desacoplado del backend NestJS y del frontend Next.js:
el navegador nunca lo llama directamente. El unico consumidor es
`apps/api/src/voice/`, que actua como frontera.

Importante: los modulos de nivel superior (`voice_engine.text`, `voice_engine.audio`,
`voice_engine.engine`) NO importan torch ni kokoro al cargarse. La carga del modelo es
perezosa (una sola vez por proceso) para que las pruebas y el arranque sean rapidos.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
