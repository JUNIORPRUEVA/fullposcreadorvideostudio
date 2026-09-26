# Local Development — FullPOS Video Studio

## DESARROLLO NORMAL

1. Abrir `FullPOS-Ad-Studio` en VS Code.
2. Presionar **F5** (configuración `FULLPOS VIDEO STUDIO — LOCAL DEV`).
3. Esperar: se levanta el túnel DB → API → Web y **Chrome se abre solo** en <http://localhost:3000/>.
4. Trabajar.

Puertos: API `4000` · Web `3000` · inspector Node `9229` · túnel DB `15432`.
Logs: terminales `Studio API` / `Studio Web`, y `storage/temp/logs/*.dev.out.log`.

## HOT RELOAD

Guardar un archivo y mirar Chrome:

- `apps/web/**` → Fast Refresh (sin reiniciar).
- `apps/api/src/**` → `tsx watch` recompila y reinicia la API sola; `/health` vuelve a responder.

Nunca hace falta `npm run build` ni reiniciar a mano.

## STOP

`Shift+F5` (detiene la sesión y apaga API, Web y túnel), o:

```powershell
npm run dev:studio:stop
```

Deja libres 3000, 4000, 9229 y 15432 y no toca procesos ajenos. Repetirlo es inofensivo
(la segunda vez responde "Nothing to stop").

## ALTERNATIVA (sin VS Code)

```powershell
npm run dev:studio         # túnel + API + Web en watch, espera readiness y abre el navegador (~16 s)
npm run dev:studio:health  # informe: API, Web, túnel, inspector, DB (sin secretos), FFmpeg/FFprobe
```

`npm run dev:studio` abre una sola ventana de navegador; F5 abre la suya (no se duplican).

## DB

Se usa la **misma** base PostgreSQL `video_studio` de siempre, vía túnel SSH (`127.0.0.1:15432`).

- Prohibido en el arranque: migraciones, seeds, reset, `db push`.
- Los comandos destructivos quedan bloqueados salvo opt-in explícito:
  `$env:STUDIO_ALLOW_DESTRUCTIVE_DB = 1`.

## BREAKPOINTS

- Frontend: la sesión de Chrome de F5 ya permite breakpoints en `apps/web/**`.
- Backend: el inspector está siempre activo en `127.0.0.1:9229`; para parar en `apps/api/src/**`
  elegir en Run and Debug la configuración `Studio: API Debug (Node attach)` (opcional, no bloquea el F5 normal).

## FFMPEG

FFmpeg/FFprobe locales (`C:\Users\pc\AppData\Local\Microsoft\WinGet\Links\`), usados por el motor de vídeo.
Se comprueban en `npm run dev:studio:health`.

## PROBLEMAS TÍPICOS

| Síntoma | Qué hacer |
| --- | --- |
| `PORT 4000 ALREADY IN USE BY UNKNOWN PROCESS` | Otro programa usa el puerto. Ciérralo o cambia `PORT` en `apps/api/.env`. Nada se mata solo. |
| `API NOT READY` | Mirar la terminal `Studio API` (error de compilación). Chrome no se abre. |
| El túnel no sube | Revisar `STUDIO_DB_SSH_KEY` / `STUDIO_DB_SSH_HOST` en `apps/api/.env`. |
| Inspector DOWN | `Studio: Stop Dev` y volver a pulsar F5. |
