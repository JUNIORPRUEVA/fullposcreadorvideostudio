# FullPOS Voice Studio — Licencias de motores y voces (Fase 2)

Documento de trazabilidad de licencias. **Regla del proyecto:** si hay cualquier duda
razonable sobre el uso comercial, la voz **NO se marca como aprobada** y se dice
explícitamente en la interfaz ("Licencia a revisar para uso comercial").

Última verificación: **2026-09-22**, contra los model cards oficiales enlazados abajo.

---

## 1. Motores (runtime)

| Motor | Versión fijada | Licencia del runtime | Uso comercial | Notas |
| --- | --- | --- | --- | --- |
| Kokoro | `kokoro==0.9.4` | Apache-2.0 | Sí | Pesos de `hexgrad/Kokoro-82M`, licencia Apache-2.0. Corre en CPU con `torch` (BSD-3-Clause). |
| Piper | `piper-tts==1.8.0` | **GPL-3.0-or-later** | **Revisar** | El runtime `piper-tts` es GPL-3.0-or-later: se ejecuta como **proceso local separado** (`127.0.0.1:4310`), no se enlaza ni se redistribuye con la aplicación. Trae su propio fonemizador (`espeakbridge.pyd` + `espeak-ng-data`) e `onnxruntime` (MIT). |
| espeak-ng (para Kokoro) | `espeakng-loader==0.2.4` | GPL-3.0-or-later (espeak-ng) | Revisar | Se usa **como rueda** en el venv del motor, invocada localmente para fonetizar. Mismo criterio que Piper: proceso local, no se redistribuye. |
| FFmpeg | binario del sistema | LGPL/GPL según build | Sí (se invoca por CLI) | Solo para exportar MP3 (`-f mp3`). El motor usa WAV nativo por defecto. |

**Consecuencia práctica:** Kokoro (Apache-2.0) es el motor "limpio" para material
publicable sin ataduras; Piper queda detrás de la misma frontera local (proceso
independiente por HTTP) y su licencia GPL-3.0-or-later está pendiente de revisión
antes de distribuir binarios del estudio a terceros.

---

## 2. Voces

### 2.1 Kokoro (`hexgrad/Kokoro-82M`, Apache-2.0)

| Voz | `voiceId` | Idioma | Género (fuente oficial `VOICES.md`) | Calidad | Uso comercial |
| --- | --- | --- | --- | --- | --- |
| Dora | `ef_dora` | es | Femenina | — | Sí (Apache-2.0) |
| Alex | `em_alex` | es | Masculina | — | Sí (Apache-2.0) |
| Santa | `em_santa` | es | Masculina | — | Sí (Apache-2.0) |

- Fuente: <https://huggingface.co/hexgrad/Kokoro-82M> (`VOICES.md`).
- El género se toma **solo** de esa lista oficial; si no aparece, la interfaz muestra
  "Género no especificado".
- Las voces Kokoro de español **no declaran país**: el filtro "Latinoamérica" no las
  incluye (se muestran en el grupo "Kokoro").

### 2.2 Piper (`rhasspy/piper-voices`, MIT para el repositorio de modelos)

Catálogo verificado voz por voz contra el `MODEL_CARD` oficial
(<https://huggingface.co/rhasspy/piper-voices>).

| Voz | `voiceId` | Locale / Región | Calidad | Licencia del modelo | Dataset | Licencia del dataset | Género (model card) | Uso comercial |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Daniela | `es_AR-daniela-high` | `es_AR` / Argentina | high | MIT | SLR61 — *Crowdsourced high-quality Argentinian Spanish speech data set* (<https://www.openslr.org/61/>) | CC BY-SA 4.0 | **no especificado** | **REVISAR** |
| Ald | `es_MX-ald-medium` | `es_MX` / México | medium | MIT | *Ald Mexican Spanish speech dataset* (<https://huggingface.co/datasets/rmcpantoja/Ald_Mexican_Spanish_speech_dataset>) | Unlicense (dominio público) | **no especificado** | Sí |
| Claude | `es_MX-claude-high` | `es_MX` / México | high | MIT | *HirCoir/Piper-TTS-Spanish* (<https://huggingface.co/spaces/HirCoir/Piper-TTS-Spanish>) | apache-2.0 | **no especificado** | Sí |

Detalle de cada decisión:

- **Daniela (REVISAR).** El modelo es MIT, pero se entrenó con SLR61, que es
  **CC BY-SA 4.0**: exige atribución y *share-alike*. Mientras no se revise el alcance
  del share-alike para material de cliente, la voz se marca como **no aprobada para
  uso comercial** y la interfaz lo advierte. No se elimina del catálogo: es útil para
  pruebas internas y para narraciones donde la licencia ya esté revisada.
- **Ald (Sí).** Dataset *Unlicense* (dominio público) y la voz padre
  (`es_ES-davefx-medium`) usa un dataset CC0: cadena limpia.
- **Claude (Sí).** Dataset publicado como `apache-2.0`; uso comercial permitido con
  aviso de licencia.
- En las tres voces el `MODEL_CARD` **no declara género**. El catálogo guarda
  `"gender": null` y la interfaz muestra "Género no especificado". El nombre del
  hablante no se usa como prueba de género.

---

## 3. Cómo se aplica esto en el producto

1. El catálogo (`voice-engine/voice_engine/data/piper_voices.json`) es la única fuente
   de verdad: cada entrada lleva `license`, `commercialOk`, `sourceUrl` y una nota.
2. La interfaz muestra los datos verificados como *chips* bajo el selector
   (región, motor, calidad, género) y añade el aviso
   "Licencia a revisar para uso comercial" cuando `commercialOk` es `false`.
3. **Nunca** se inventa género, país ni licencia: si la fuente no lo dice, se deja
   vacío y se muestra "Género no especificado".
4. Las voces sin modelo descargado aparecen deshabilitadas y no se pueden generar.

## 4. Pendientes / decisiones humanas

- Revisar el alcance de **CC BY-SA 4.0** (SLR61) antes de usar a Daniela en material
  comercial de un cliente.
- Decidir si se distribuirán binarios del estudio a terceros: en ese caso la licencia
  **GPL-3.0-or-later de `piper-tts`** debe revisarse con asesoría legal.
- Añadir nuevas voces solo con `MODEL_CARD` público que declare licencia del modelo y
  del dataset.
