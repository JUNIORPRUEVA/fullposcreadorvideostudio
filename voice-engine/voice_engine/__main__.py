"""Arranque del servicio: `python -m voice_engine`."""

from __future__ import annotations

import logging

import uvicorn

from .config import host, port

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
    logger = logging.getLogger("voice_engine")
    bind_host = host()
    bind_port = port()
    logger.info("FullPOS Voice Engine -> http://%s:%s (solo local)", bind_host, bind_port)
    # Sin `reload`: el modelo debe cargarse una sola vez por proceso.
    uvicorn.run("voice_engine.api:app", host=bind_host, port=bind_port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
