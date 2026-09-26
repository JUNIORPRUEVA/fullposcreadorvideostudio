# FullPOS Voice Studio (Fases 1 y 2)

Generador **local** de narración TTS para los videos del estudio, con **dos motores**
(Kokoro y Piper) y voces de **español latinoamericano**.

> **Alcance:** producir audio (WAV/MP3) a partir de un guion, con una voz consistente y
> repetible. El video sigue editándose en CapCut:
> `Guion → FullPOS Voice Studio → WAV/MP3 → CapCut`.
> No hay edición de video, timeline, sincronización con CapCut, clonación de voz,
> login nuevo, nube ni APIs TTS de pago.
>
> **Fase 1:** motor Kokoro + voces españolas + generación completa.
> **Fase 2:** segundo motor local (Piper) con voces latinas verificadas, filtros y grupos
> en el selector, metadatos verificados por voz, arranque con doble clic en Windows y
> documento de licencias (`docs/VOICE_LICENSES.md`).

---

## CÓMO ABRIR VOICE STUDIO

**La forma normal (Windows):** doble clic en `Open-Voice-Studio.cmd`, en la raíz del
repositorio. El launcher:

1. Comprueba dependencias (Node, `node_modules`, `voice-engine\.venv`) y avisa qué falta.
2. Comprueba los puertos y **no duplica** nada que ya esté en marcha (si el estudio ya
   está levantado, lo reutiliza; nunca mata procesos ajenos).
3. Arranca solo lo que falta: **motor de voz** (:4310), **API** (:4000) y **web** (:3000).
4. Espera con *health checks* reales (`/health` del motor, `/health` del API y
   `/voice-studio` del web).
5. Abre el navegador en <http://localhost:3000/voice-studio>.
6. Imprime una tabla por componente (puerto, estado, detalle). Si algo falla, explica
   cuál es el componente, deja el log en `storage\temp\logs\` y **no cierra la ventana**
   (se queda esperando un Enter para que puedas leer el error).

```powershell
# equivalente desde terminal, si prefieres verlo ahí
npm run voice:studio            # arranca y abre el navegador
npm run voice:studio -- -NoBrowser   # sin abrir el navegador
```

Para que el arranque tenga sentido, la primera vez (una sola vez) hay que instalar el
entorno: **doble clic en `Install-Voice-Studio.cmd`** (o `npm run voice:setup`).

### Sesión: no hay que iniciar sesión cada vez

El estudio tiene un único dueño y guarda la sesión en el navegador
(`localStorage.videoStudioToken`), igual para el editor y para `/voice-studio`:

- El token dura **`AUTH_TOKEN_TTL_DAYS`** días (30 por defecto; en esta máquina `3650`) y
  **se renueva solo**: al abrir el estudio y al volver a la pestaña (como mucho una
  comprobación cada 5 minutos) el API devuelve un token nuevo si al actual le queda menos
  de la mitad de su vida. Mientras se use el estudio, la sesión no caduca.
- Si un token deja de servir, la web lo descarta sola y muestra la pantalla de acceso con el
  aviso «La sesión caducó. Vuelve a entrar».
- Se cierra a mano con **Salir**, al final de la barra lateral del estudio.
- Cambiar `AUTH_TOKEN_TTL_DAYS` en `apps/api/.env` requiere reiniciar el API.

### Modo desarrollador (paso a paso)

```powershell
# 1. Motor de voz (deja la terminal abierta; Ctrl+C para detenerlo)
npm run voice:dev

# 2. Estudio (API + Web) como siempre
npm run dev:studio
#   o F5 con "FULLPOS VIDEO STUDIO - LOCAL DEV"
```

Luego abrir <http://localhost:3000/voice-studio>. En el estudio principal hay un acceso
**Voice Studio** al final de la barra lateral.

---

## CÓMO CERRAR VOICE STUDIO

**Doble clic en `Stop-Voice-Studio.cmd`** (en la raíz del repositorio). Ese script:

- Detiene **solo** los procesos que arrancó el estudio de voz (motor, API y web),
  identificados por los pids que guardó el launcher y por su linea de comandos.
- Nunca cierra `node.exe`/`python.exe` ajenos ni procesos del sistema.
- No toca la base de datos ni el túnel SSH.
- Al final verifica los puertos e informa cuál quedó libre.

```powershell
npm run voice:studio:stop             # cierre normal
npm run voice:studio:stop -- -Force   # barre además el motor si quedó huérfano
```

Si el estudio lo arrancaste a mano con `npm run voice:dev` / `npm run dev:studio`, ciérralo
de la forma de siempre (Ctrl+C o las tareas `Studio: Stop Dev`).

---

## 1. Arquitectura

```
Navegador (Next.js)
  │  POST /voice/generate   (JSON, Authorization opcional)
  ▼
apps/api  (NestJS, :4000) ── apps/api/src/voice/
  │      · valida el payload (incluido el motor elegido)
  │      · es la ÚNICA frontera hacia el motor
  │      · firma las URLs de audio (HMAC) y sirve el archivo
  ▼  HTTP local (127.0.0.1:4310)
voice-engine  (Python + FastAPI, solo localhost)
  │      · trocea el guion, narra cada fragmento y los une
  ├── KokoroProvider → Kokoro-82M (PyTorch, CPU)  24 000 Hz
  └── PiperProvider  → un .onnx por voz (onnxruntime, CPU)  22 050 Hz
  ▼
storage/generated-audio/…
```

**Decisión clave:** el navegador nunca invoca scripts de Python. Si el motor está
apagado, el API responde `503` con un mensaje accionable y la página no se rompe.

Los dos motores viven detrás de la misma interfaz `VoiceProvider` (`load(voice)` +
`status()`), así que añadir un tercer motor no toca ni la API ni la página.

### Componentes

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| UI | `apps/web/app/voice-studio/` | Guion, contador, filtros, selector agrupado por motor, prueba, generación, reproductor, descarga, Voz FullPOS |
| API | `apps/api/src/voice/` | Frontera, validación (incluido el motor), timeout, firma de URLs, servicio de archivos, preferencia de voz |
| Motor | `voice-engine/` | Servicio TTS persistente; carga cada modelo **una sola vez** por proceso |
| Motores | `voice-engine/voice_engine/{kokoro,piper}_provider.py` | Kokoro (Apache-2.0) y Piper (GPL-3.0-or-later, proceso local) |
| Catálogo | `voice-engine/voice_engine/data/piper_voices.json` | Voces Piper verificadas: licencia, dataset, locale, calidad y `gender: null` si el model card no lo dice |
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
| piper-tts | **1.8.0** | Segundo motor (Fase 2). Runtime **GPL-3.0-or-later**: ver `docs/VOICE_LICENSES.md` |
| onnxruntime | 1.30.0 | Inferencia CPU de los modelos Piper (lo instala `piper-tts`) |
| Voces Piper | 3 modelos (~229 MB) | `es_AR-daniela-high`, `es_MX-ald-medium`, `es_MX-claude-high` en `voice-engine\voices\piper\` |
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

**La forma fácil (Windows):** doble clic en `Install-Voice-Studio.cmd`, en la raíz del
repositorio. Comprueba Node.js, ejecuta `npm install` si falta y llama a `voice:setup`.
Es idempotente: si ya está instalado, solo verifica y termina rápido. La primera vez
tarda varios minutos (~1 GB de descargas) y **no necesita permisos de administrador**.

> **Cierra el estudio antes de instalar** (`Stop-Voice-Studio.cmd`). `voice:setup` recrea
> `voice-engine\.venv`, así que un motor que esté ejecutándose desde ese entorno se cae
> durante la instalación. Después: `Open-Voice-Studio.cmd` otra vez.

Desde consola, lo mismo:

```powershell
npm install            # dependencias de JavaScript (una sola vez)
npm run voice:setup    # motor: Python 3.12 + kokoro + piper + modelos
```

Qué hace `voice:setup`, en orden:

1. Verifica que exista un Python base en el PATH.
2. Instala `uv` (si falta) y obtiene **CPython 3.12** para el usuario.
3. Crea `voice-engine\.venv`.
4. Instala `torch` (CPU), luego `requirements-dev.txt` (kokoro, **piper-tts + onnxruntime**, fastapi,
   uvicorn, soundfile, numpy, espeakng-loader, pytest).
5. Imprime un informe `VOICE_SETUP_REPORT` con las versiones reales (incluye `piper`) y el
   estado de espeak-ng.
6. Descarga los pesos de Kokoro **y las 3 voces Piper de español latinoamericano**
   (una sola vez) para que la generación funcione sin red.

Opciones: `-SkipModelDownload`, `-SkipPiperVoices`, `-Recreate`, `-PythonVersion 3.12`.

**Nada de esto se despliega ni se registra como servicio.** Si el motor no está instalado,
la página de Voice Studio sigue funcionando y explica qué ejecutar.

---

## 4. Cómo arrancar

La forma normal es **doble clic en `Open-Voice-Studio.cmd`**: ver
[CÓMO ABRIR VOICE STUDIO](#cómo-abrir-voice-studio) arriba. El arranque manual sigue
funcionando igual (útil para depurar el motor con la consola delante):

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
- cerrar la ventana, o
- **doble clic en `Stop-Voice-Studio.cmd`** si lo arrancaste con el launcher
  (ver [CÓMO CERRAR VOICE STUDIO](#cómo-cerrar-voice-studio)).

No hay servicio de Windows ni proceso residente.

---

## 5. Cómo elegir voz

El selector está **agrupado por motor** y trae dos grupos con los nombres del producto:

- **Kokoro** — `ef_dora` (Dora), `em_alex` (Alex), `em_santa` (Santa). Español genérico.
- **Español latino / Piper** — Daniela (`es_AR`, Argentina), Ald (`es_MX`, México),
  Claude (`es_MX`, México).

1. **Filtros** encima del selector: `Todas` · `Femeninas` · `Masculinas` · `Latinoamérica`.
   *Latinoamérica* agrupa las voces que declaran locale `es_XX` de la región; las voces
   Kokoro no declaran país, así que no aparecen en ese filtro (siguen en `Todas`).
2. Debajo del selector aparecen los **datos verificados** de la voz elegida (región,
   motor, calidad y género). Si el model card de la voz no declara género, se muestra
   **"Género no especificado"**: no se inventa a partir del nombre.
3. Si la voz tiene la licencia pendiente de revisión, se añade el aviso
   **"Licencia a revisar para uso comercial"** y una nota bajo el selector.
   El detalle está en `docs/VOICE_LICENSES.md`.
4. Pulsa **Probar voz**: narra siempre **el mismo texto** para todas las voces, así se
   comparan en igualdad de condiciones (el texto es idéntico para Kokoro y Piper).
5. Ajusta **velocidad** (0.85x – 1.15x, por defecto 1.00x) y **pausa** entre bloques
   (0 – 1000 ms, por defecto 300 ms).
6. Pulsa **Establecer como voz FullPOS** para guardarla como predeterminada
   (`voice.fullpos.default`, con motor + voz + locale + velocidad). Si la base de datos no
   responde, se guarda solo en este navegador y la página lo avisa.

Las voces cuyo modelo **no** está descargado aparecen deshabilitadas ("no descargada") y
no se pueden generar hasta ejecutar `npm run voice:setup`.

> Los dos motores se oyen distinto y **no igualan volumen**: medido con el mismo texto,
> Kokoro queda alrededor de −26 dBFS de RMS y Piper alrededor de −15 dBFS. Si vas a
> mezclar voces de motores distintos en un mismo video, iguala el nivel en la edición.

---

## 6. Generar narración

1. Pega el guion completo (no hay límite de 500 caracteres; el tope local es 100 000).
2. Pulsa **Generar narración**.
3. Al terminar verás el reproductor, la voz, la duración, el tamaño, el formato, el nombre
   del archivo, la carpeta donde quedó y los botones **Reproducir**, **Descargar** y
   **Abrir carpeta** (esta última abre la carpeta en el Explorador de Windows).

> La página scrollea como cualquier web: rueda, `PageDown`/`PageUp`, `Inicio`/`Fin` y barra
del navegador. El estudio fija `html/body` (`overflow: hidden`) porque su app scrollea
dentro de `.main`; Voice Studio lo revierte **solo para esta ruta** con `:has()` y deja un
respaldo por si el navegador no soporta `:has()` (ahí scrollea el propio contenedor).

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
| `VOICE_PIPER_DIR` | motor | `voice-engine\voices\piper` | Raíz de los modelos Piper (misma estructura que el repo `rhasspy/piper-voices`) |
| `VOICE_PIPER_DISABLED` | motor | *(vacío)* | `1`/`true` para arrancar **solo** con Kokoro |

No hay secretos versionados: `.env` sigue ignorado y el token está apagado por defecto.

---

## 8. API

Motor (`voice-engine`, solo localhost):

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/health` | Estado de **cada** motor (`engines[]`), espeak-ng, FFmpeg, formatos y límites |
| GET | `/voices` | Voces de todos los motores: lista plana + grupos por motor + metadatos verificados |
| POST | `/synthesize` | Narración completa (`engine` opcional) |
| POST | `/preview` | Muestra corta de una voz (`engine` opcional) |

Si se omite `engine`, la voz se busca en todos los motores. Si se envía, se valida contra
ese motor y, si la voz no es suya, el motor responde `400` **diciendo en qué motor sí existe**.
Un motor no instalado no bloquea al otro: `usable` es verdadero mientras haya **al menos un**
motor listo.

Estudio (`apps/api`, la única ruta que usa el navegador):

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/voice/health` | Estado (nunca falla: explica el motivo) |
| GET | `/voice/voices` | Voces + **grupos por motor** + voz FullPOS guardada |
| POST | `/voice/preview` | Prueba de voz (URL firmada) |
| POST | `/voice/generate` | Narración (URL firmada + metadatos, incluye el motor) |
| POST | `/voice/open-folder` | Abre en el Explorador de Windows la carpeta de audios |
| GET/PUT | `/voice/voice-preference` | Leer/guardar la Voz FullPOS |
| GET | `/voice/files/:carpeta/:archivo` | Reproductor/descarga (URL firmada, `?download=1`) |

`/voice/open-folder` acepta como máximo el **nombre** de una carpeta conocida
(`{"folder":"2026-09-22"}`, `{"folder":"previews"}`) o nada para abrir la raíz de
audios. El navegador nunca envía una ruta: el backend la resuelve dentro de
`storage/generated-audio`, rechaza cualquier otra cosa con `400` y lanza `explorer.exe`
sin shell. En sistemas que no son Windows responde `503` explicando que es una función local.

> El repositorio no usa prefijo `/api` en el backend; por eso las rutas son `/voice/...`
> y no `/api/voice/...`. El prefijo público lo decide el despliegue.
>
> El PUT de `/voice/voice-preference` necesita `PUT` en la lista CORS del API
> (`apps/api/src/main.ts`). Si añades métodos nuevos al cliente, revisa esa lista:
> un `PUT` bloqueado por CORS hace que la voz se guarde solo en el navegador.

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
motor apagado, token opcional y ausencia de trazas. Con la Fase 2 se añaden los casos de
**multi-motor**: catálogo Piper (licencias y `gender: null`), ruta de los `.onnx`, voces no
descargadas, desactivación por entorno, una sola carga por voz, conversión int16→float32,
mapeo de `length_scale = 1/velocidad` y motores independientes.

Resultados de referencia (2026-09-22, este equipo):

| Suite | Resultado |
| --- | --- |
| `voice:test` (pytest del motor) | **94 pasan** |
| API (`apps/api/src/voice/*.test.ts`) | **81 pasan** |
| Web (`apps/web/app/voice-studio/*.test.tsx?`) | **67 pasan** |

---

## 10. Troubleshooting

| Síntoma | Causa y solución |
| --- | --- |
| «El motor de voz local no está disponible» (503) o «Motor de voz no disponible» | El motor se apagó (por ejemplo al cerrar la consola que lo lanzó). **Doble clic en `Open-Voice-Studio.cmd`**: lo vuelve a arrancar y reutiliza el API y la web si ya están. También `npm run voice:dev` / `npm run voice:studio`. |
| «El motor Kokoro no está instalado» | Falta el entorno: **doble clic en `Install-Voice-Studio.cmd`** (o `npm run voice:setup`). |
| «La sesion expiro. Vuelve a entrar al estudio» | El token de este navegador ya no sirve (se borró el almacenamiento local, o pasó más de `AUTH_TOKEN_TTL_DAYS` sin abrir el estudio). Entra a <http://localhost:3000/>, inicia sesión y vuelve a `/voice-studio`; la sesión es la misma. |
| «espeak-ng no disponible» | `npm run voice:setup` (instala `espeakng-loader`) o instala eSpeak NG en el sistema. |
| MP3 deshabilitado | No se encontró FFmpeg. El WAV funciona igual; instala FFmpeg para MP3. |
| La primera generación tarda mucho | El modelo se carga una sola vez (30–60 s la primera vez). Las siguientes son inmediatas. |
| «El motor de voz no respondió en 900 s» | El guion es muy largo para CPU. Divide el guion o sube `VOICE_ENGINE_TIMEOUT_MS`. |
| El puerto 4310 está ocupado | `npm run voice:dev -- -Port 4311` y `VOICE_ENGINE_URL=http://127.0.0.1:4311` en el API. |
| Acabo de instalar/actualizar el motor y el estudio dejó de responder | `voice:setup` recrea el `.venv` y tumba el motor que corría dentro. Vuelve a abrir con `Open-Voice-Studio.cmd` (o `npm run voice:studio`). |
| «No se pudo guardar la voz FullPOS» | La base de datos no responde (túnel SSH). Se guarda en el navegador; el resto sigue funcionando. |
| El audio no suena en la página | El token del estudio cambió: recarga y vuelve a entrar. Las URLs firmadas caducan en 15 minutos. |
| «Abrir carpeta» no hace nada / da error | Es una función local de Windows (el servidor abre el Explorador). En otros sistemas responde 503 explicándolo; desde otra máquina no aplica. |

---

## 11. Limitaciones conocidas

- Las voces Kokoro de español son **español genérico**, no una voz dominicana ni de un país
  concreto: no declaran país, así que quedan fuera del filtro "Latinoamérica". Las voces
  latinas disponibles son de Piper (Argentina y México).
- La voz **Daniela** (`es_AR-daniela-high`) está marcada como **no aprobada para uso
  comercial** hasta revisar el share-alike de su dataset (CC BY-SA 4.0). Ver
  `docs/VOICE_LICENSES.md`.
- El runtime de **Piper es GPL-3.0-or-later**: se ejecuta como proceso local separado, pero
  debe revisarse antes de distribuir binarios del estudio a terceros.
- Generación **en serie y en CPU**: una narración a la vez; no hay cola ni trabajos en
  segundo plano. La petición HTTP espera el resultado.
- Los motores **no igualan volumen** entre sí (Kokoro ≈ −26 dBFS RMS, Piper ≈ −15 dBFS).
- `storage/generated-audio/previews/` **acumula** pruebas de voz: no hay limpieza
  automática (borrar a mano cuando moleste).
- No hay historial de narraciones en la interfaz: el archivo queda en disco y se descarga
  desde el navegador.
- El motor **no** está incluido en el `F5`/`npm run dev:studio`; el launcher
  (`Open-Voice-Studio.cmd`) sí lo arranca, pero se mantiene desacoplado del editor de video.
- Sin autenticación propia: el motor solo escucha en `127.0.0.1` y el API reutiliza la
  sesión del estudio (`videoStudioToken`). Esa sesión es **persistente y deslizante**: vive
  en `localStorage`, se renueva mientras el estudio se use y solo se pierde si caduca
  (`AUTH_TOKEN_TTL_DAYS`), si se borra el almacenamiento del navegador o si se pulsa *Salir*.

---

## 12. Siguientes pasos sugeridos

1. Escuchar las 6 voces y fijar la **Voz FullPOS** (Kokoro o Piper).
2. Decidir sobre la licencia de Daniela y sobre la distribución de binarios (Piper GPL).
3. Validar la consistencia real repitiendo una narración en días distintos.
4. Solo después: afinar tono/acento (diccionario de pronunciación, énfasis) o evaluar otro
   motor manteniendo esta misma arquitectura (basta un `VoiceProvider` nuevo).
