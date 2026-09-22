"""Pre-descarga de los pesos de Kokoro.

Se ejecuta durante `npm run voice:setup` para que la primera narracion no dependa de
la red. Despues de esto, la generacion es 100% local.
"""

from __future__ import annotations

import argparse
import logging
import sys

from .config import model_file, model_repo
from .kokoro_provider import FALLBACK_SPANISH_VOICES, _discover_spanish_voices

LOGGER = logging.getLogger("voice_engine.prefetch")


def prefetch(model_weights: bool = True) -> int:
    try:
        from huggingface_hub import hf_hub_download
    except Exception as error:  # pragma: no cover - depende del entorno
        print(f"No se pudo importar huggingface_hub: {error}", file=sys.stderr)
        return 1

    repo = model_repo()
    voices, source = _discover_spanish_voices(repo)
    voice_ids = [voice.id for voice in voices] or list(FALLBACK_SPANISH_VOICES)
    patterns = [f"voices/{voice_id}.pt" for voice_id in voice_ids]
    if model_weights:
        patterns = ["config.json", model_file(), *patterns]

    failures = 0
    for pattern in patterns:
        try:
            path = hf_hub_download(repo_id=repo, filename=pattern)
            print(f"OK   {pattern} -> {path}")
        except Exception as error:
            failures += 1
            print(f"FALLO {pattern}: {error}", file=sys.stderr)

    print(f"Voces espanolas detectadas ({source}): {', '.join(voice_ids)}")
    return 1 if failures else 0


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Descarga los pesos de Kokoro para uso offline.")
    parser.add_argument("--voices-only", action="store_true", help="No descargar los pesos del modelo.")
    arguments = parser.parse_args()
    raise SystemExit(prefetch(model_weights=not arguments.voices_only))


if __name__ == "__main__":
    main()
