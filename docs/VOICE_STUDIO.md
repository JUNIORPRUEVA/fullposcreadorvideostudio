# FullPOS Voice Studio (Fase 1)

Generador **local** de narración TTS para los videos del estudio.

> **Alcance de la Fase 1:** producir audio (WAV/MP3) a partir de un guion, con una voz
> consistente y repetible. El video sigue editándose en CapCut:
> `Guion → FullPOS Voice Studio → WAV/MP3 → CapCut`.
> No hay edición de video, timeline, sincronización con CapCut, clonación de voz,
> login nuevo, nube ni APIs TTS de pago.

---

## 1. Arquitectura

```
Navegador (Next.js)
  │  POST /voice/generate   (JSON, Authorization opcional)
  ▼
apps/api  (NestJS, :4000) ── apps/api/src/voice/
  │      · valida el payload
  │      · es la ÚNICA frontera hacia el motor
  │      · firma las URLs de audio (HMAC) y sirve el archivo
  ▼  HTTP local (127.0.0.1:4310)
voice-engine  (Python + FastAPI, solo localhost)
  │      · trocea el guion, narra cada fragmento y los une
  ▼
Kokoro-82M (PyTorch, CPU)  →  storage/generated-audio/…
```

**Decisión clave:** el navegador nunca invoca scripts de Python. Si el motor está
apagado, el API responde `503` con un mensaje accionable y la página no se rompe.

### Componentes

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| UI | `apps/web/app/voice-studio/` | Guion, contador, selección de voz, prueba, generación, reproductor, descarga, Voz FullPOS |
| API | `apps/api/src/voice/` | Frontera, validación, timeout, firma de URLs, servicio de archivos, preferencia de voz |
| Motor | `voice-engine/` | Servicio TTS persistente; carga el modelo **una sola vez** por proceso |
| Salida | `storage/generated-audio/` | Audios + manifiesto `.json` con la configuración usada |

### Puertos locales

| Puerto | Servicio |
| --- | --- |
| 3000 | Web (Next.js) |
| 4000 | API del estudio (NestJS) |
| 4100 | Gateway de assets de IA (existente) |
| **4310** | **voice-engine (este documento)** |
| 9229 / 15432 | Inspector de Node / túnel SSH de la base de datos |

---

## 2. Requisitos (Windows)

| Requisito | Versión usada | Nota |
| --- | --- | --- |
| Python | **3.12.14** | `kokoro` exige `>=3.10,<3.13`; `torch` no publica ruedas para 3.13+ |
| uv | 0.12.17 | Instala Python 3.12 en el perfil del usuario (sin admin) |
| torch | 2.14.0+cpu | Índice CPU de PyTorch (evita la distribución CUDA de ~2.5 GB) |
| kokoro | 0.9.4 | Modelo Kokoro-82M (Apache-2.0) |
| espeak-ng | vía `espeakng-loader` | Rueda de Python: sin instalador MSI ni permisos de admin |
| FFmpeg | 9.0 (ya instalado) | **Solo** para MP3; el WAV no lo necesita |

> Si tu único Python es 3.13+, **no** importa: `voice:setup` obtiene 3.12 con `uv`
> dentro de `%APPDATA%\uv\python` y no toca la instalación del sistema.

### Dependencias exactas

Se fijan en `voice-engine/requirements.txt` (runtime) y `voice-engine/requirements-dev.txt`
(pruebas). `torch` se instala aparte desde el índice CPU porque PEP 621 no puede expresar
"desde otro índice".

---

## 3. Instalación

```powershell
npm run voice:setup
```

Qué hace, en orden:

1. Verifica que exista un Python base en el PATH.
2. Instala `uv` (si falta) y obtiene **CPython 3.12** para el usuario.
3. Crea `voice-engine\.venv`.
4. Instala `torch` (CPU), luego `requirements-dev.txt` (kokoro, fastapi, uvicorn,
   soundfile, numpy, espeakng-loader, pytest).
5. Imprime un informe `VOICE_SETUP_REPORT` con las versiones reales y el estado de espeak-ng.
6. Descarga los pesos de Kokoro (una sola vez) para que la generación funcione sin red.

Opciones: `-SkipModelDownload`, `-Recreate`, `-PythonVersion 3.12`.

**Nada de esto se despliega ni se registra como servicio.** Si el motor no está instalado,
la página de Voice Studio sigue funcionando y explica qué ejecutar.

---

## 4. Cómo arrancar

```powershell
# 1. Motor de voz (dejar la terminal abierta; Ctrl+C para detener)
npm run voice:dev

# 2. Estudio (API + Web) como siempre
npm run dev:studio
#   o F5 con "FULLPOS VIDEO STUDIO - LOCAL DEV"
```

Luego abrir:

```
http://localhost:3000/voice-studio
```

En el estudio principal hay un acceso **Voice Studio** al final de la barra lateral.

### Detener el motor

- `Ctrl+C` en la terminal de `npm run voice:dev`, o
- cerrar la ventana. No hay servicio de Windows ni proceso residente.

---

## 5. Cómo elegir voz

1. Elige una voz en el selector (se descubren automáticamente las voces **españolas**
   del modelo; hoy: `ef_dora`, `em_alex`, `em_santa`).
2. Pulsa **Probar voz**: narra siempre el mismo texto para poder compararlas en igualdad
   de condiciones.
3. Ajusta **velocidad** (0.85x – 1.15x, por defecto 1.00x) y **pausa** entre bloques
   (0 – 1000 ms, por defecto 300 ms).
4. Pulsa **Establecer como voz FullPOS** para guardarla como predeterminada
   (`voice.fullpos.default`). Si la base de datos no responde, se guarda solo en este
   navegador y la página lo avisa.

---

## 6. Generar narración

1. Pega el guion completo (no hay límite de 500 caracteres; el tope local es 100 000).
2. Pulsa **Generar narración**.
3. Al terminar verás el reproductor, la voz, la duración, el tamaño, el formato y los
   fragmentos usados, más los botones de descarga.

El motor divide el guion por **párrafos** y, si un párrafo es muy largo, por **oraciones**
(agrupándolas hasta ~400 caracteres, nunca cortando palabras). Cada fragmento se narra por
separado y se vuelve a unir en orden, insertando la pausa configurada con una escala menor
en los cortes internos de un mismo párrafo. El último fragmento no deja silencio colgando.

---

## 7. Dónde quedan los audios

```
storage/generated-audio/
├── 2026-09-22/
│   ├── ef_dora-1a2b3c4d.wav     ← narración
│   └── ef_dora-1a2b3c4d.json    ← manifiesto (voz, velocidad, pausa, fragmentos, duración)
└── previews/
    └── ef_dora-9f8e7d6c.wav     ← pruebas de voz
```

- Los nombres son generados por el motor: voz + 8 caracteres aleatorios. No se aceptan
  rutas del usuario (sin path traversal, sin sobrescrituras).
- Estos archivos **no se versionan** (`.gitignore`).
- Para MP3 se conserva además el WAV maestro.

### Variables de entorno (opcionales)

| Variable | Dónde | Por defecto | Uso |
| --- | --- | --- | --- |
| `VOICE_ENGINE_URL` | API | `http://127.0.0.1:4310` | URL del motor |
| `VOICE_ENGINE_TOKEN` | ambos | *(vacío)* | Token compartido opcional (defensa en profundidad) |
| `VOICE_ENGINE_TIMEOUT_MS` | API | `900000` | Timeout de síntesis |
| `VOICE_ENGINE_PORT` / `VOICE_ENGINE_HOST` | motor | `4310` / `127.0.0.1` | Escucha local |
| `VOICE_OUTPUT_DIR` / `VOICE_STORAGE_ROOT` | motor | `storage/` + `generated-audio/` | Destino de audios |
| `VOICE_CHUNK_CHARS` | motor | `400` | Tamaño de fragmento |
| `VOICE_MAX_TEXT_CHARS` | motor | `100000` | Tope de guion |
| `VOICE_FFMPEG` | motor | FFmpeg del PATH | Ruta explícita a FFmpeg |
| `VOICE_DEVICE` | motor | `cpu` | Dispositivo de torch |

No hay secretos versionados: `.env` sigue ignorado y el token está apagado por defecto.

---

## 8. API

Motor (`voice-engine`, solo localhost):

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/health` | Estado del motor, espeak-ng, FFmpeg, formatos y límites |
| GET | `/voices` | Voces españolas disponibles |
| POST | `/synthesize` | Narración completa |
| POST | `/preview` | Muestra corta de una voz |

Estudio (`apps/api`, la única ruta que usa el navegador):

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/voice/health` | Estado (nunca falla: explica el motivo) |
| GET | `/voice/voices` | Voces + voz FullPOS guardada |
| POST | `/voice/preview` | Prueba de voz (URL firmada) |
| POST | `/voice/generate` | Narración (URL firmada + metadatos) |
| GET/PUT | `/voice/voice-preference` | Leer/guardar la Voz FullPOS |
| GET | `/voice/files/:carpeta/:archivo` | Reproductor/descarga (URL firmada, `?download=1`) |

> El repositorio no usa prefijo `/api` en el backend; por eso las rutas son `/voice/...`
> y no `/api/voice/...`. El prefijo público lo decide el despliegue.

---

## 9. Pruebas

```powershell
npm run voice:test                       # pytest del motor (sin modelo: proveedor falso)
npm run voice:smoke                      # smoke test REAL: arranca el motor y narra de verdad
npm run test --workspace @fullpos-ad-studio/api    # incluye apps/api/src/voice/*.test.ts
npm run test --workspace @fullpos-ad-studio/web    # contador, selectores, parseo y render
```

`voice:smoke` es la prueba que demuestra lo importante: genera **el mismo texto 3 veces con la
misma voz** y comprueba con `ffprobe` que los 3 archivos existen, no están corruptos, duran lo
mismo y comparten voz/velocidad/pausa; después narra un guion de 3 párrafos y verifica que el
troceo conserva el orden y el texto. Si el motor no está arrancado, lo arranca y lo detiene solo.

Cobertura del motor: salud, troceo, validación, ensamblado de WAV, **orden correcto de los
fragmentos**, cargas únicas del modelo, audio fuera de `storage/`, errores de payload,
motor apagado, token opcional y ausencia de trazas.

---

## 10. Troubleshooting

| Síntoma | Causa y solución |
| --- | --- |
| «El motor de voz local no está disponible» (503) | El proceso está apagado. `npm run voice:dev`. |
| «El motor Kokoro no está instalado» | Falta el entorno: `npm run voice:setup`. |
| «espeak-ng no disponible» | `npm run voice:setup` (instala `espeakng-loader`) o instala eSpeak NG en el sistema. |
| MP3 deshabilitado | No se encontró FFmpeg. El WAV funciona igual; instala FFmpeg para MP3. |
| La primera generación tarda mucho | El modelo se carga una sola vez (30–60 s la primera vez). Las siguientes son inmediatas. |
| «El motor de voz no respondió en 900 s» | El guion es muy largo para CPU. Divide el guion o sube `VOICE_ENGINE_TIMEOUT_MS`. |
| El puerto 4310 está ocupado | `npm run voice:dev -- -Port 4311` y `VOICE_ENGINE_URL=http://127.0.0.1:4311` en el API. |
| «No se pudo guardar la voz FullPOS» | La base de datos no responde (túnel SSH). Se guarda en el navegador; el resto sigue funcionando. |
| El audio no suena en la página | El token del estudio cambió: recarga y vuelve a entrar. Las URLs firmadas caducan en 15 minutos. |

---

## 11. Limitaciones conocidas (Fase 1)

- Las voces españolas del modelo son **español genérico**, no una voz dominicana. Si
  ninguna encaja, el motor está desacoplado (`VoiceProvider`) para cambiar de motor sin
  rehacer ni la API ni la página.
- Generación **en serie y en CPU**: una narración a la vez; no hay cola ni trabajos en
  segundo plano. La petición HTTP espera el resultado.
- `storage/generated-audio/previews/` **acumula** pruebas de voz: no hay limpieza
  automática (borrar a mano cuando moleste).
- No hay historial de narraciones en la interfaz: el archivo queda en disco y se descarga
  desde el navegador.
- El motor **no** está incluido en el `F5`/`npm run dev:studio`; se arranca aparte con
  `npm run voice:dev` (para no acoplar el editor de video al motor de voz).
- Sin autenticación propia: el motor solo escucha en `127.0.0.1` y el API reutiliza la
  sesión del estudio (`videoStudioToken`).

---

## 12. Siguientes pasos sugeridos

1. Escuchar `ef_dora`, `em_alex` y `em_santa` y fijar la **Voz FullPOS**.
2. Validar la consistencia real repitiendo una narración en días distintos.
3. Solo después: afinar tono/acento (diccionario de pronunciación, énfasis) o evaluar otro
   motor manteniendo esta misma arquitectura.
