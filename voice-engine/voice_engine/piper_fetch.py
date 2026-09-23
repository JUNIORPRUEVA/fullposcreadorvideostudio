"""Descarga los modelos de voz Piper del catalogo verificado.

`python -m voice_engine.piper_fetch` (lo llama `npm run voice:setup`).

Los archivos se guardan en `voice-engine/voices/piper/` respetando la estructura del
repositorio de origen. Solo se descargan modelos del catalogo `data/piper_voices.json`
(cada uno con su licencia ya revisada en docs/VOICE_LICENSES.md).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import piper_root
from .piper_provider import catalog_voices, load_catalog, model_paths


def fetch(only: list[str] | None = None, force: bool = False) -> int:
    try:
        from huggingface_hub import hf_hub_download
    except Exception as error:  # pragma: no cover - depende del entorno
        print(f"No se pudo importar huggingface_hub: {error}", file=sys.stderr)
        return 1

    catalog = load_catalog()
    repo = catalog.get("repo", "rhasspy/piper-voices")
    root = piper_root()
    root.mkdir(parents=True, exist_ok=True)

    selected = [entry for entry in catalog_voices() if not only or entry.get("id") in only]
    if only:
        desconocidas = [name for name in only if name not in {entry.get("id") for entry in catalog_voices()}]
        for name in desconocidas:
            print(f"AVISO la voz '{name}' no esta en el catalogo; se omite.", file=sys.stderr)

    failures = 0
    for entry in selected:
        voice_id = entry.get("id")
        model, config = model_paths(entry, root)
        if model.exists() and config.exists() and not force:
            print(f"OK   {voice_id} (ya descargado)")
            continue
        for remote in entry.get("files", []):
            target = root / Path(remote)
            try:
                # local_dir reproduce la ruta del repo dentro de nuestra carpeta.
                path = hf_hub_download(repo_id=repo, filename=remote, local_dir=str(root))
                size = Path(path).stat().st_size / (1024 * 1024)
                print(f"OK   {remote} -> {target} ({size:.1f} MB)")
            except Exception as error:
                failures += 1
                print(f"FALLO {remote}: {error}", file=sys.stderr)
        licencia = entry.get("datasetLicense")
        uso = entry.get("commercialUse")
        aviso = "  [REVISAR USO COMERCIAL]" if uso != "ok" else ""
        print(f"     licencia del dataset: {licencia} · uso comercial: {uso}{aviso}")

    if failures:
        print(f"Descarga incompleta: {failures} archivo(s) fallaron.", file=sys.stderr)
    return 1 if failures else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Descarga los modelos de voz Piper del catalogo.")
    parser.add_argument("--voice", action="append", default=None, help="Descargar solo esta voz (repetible).")
    parser.add_argument("--force", action="store_true", help="Volver a descargar aunque ya exista.")
    arguments = parser.parse_args()
    raise SystemExit(fetch(only=arguments.voice, force=arguments.force))


if __name__ == "__main__":
    main()
