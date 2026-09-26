# RunPod video lab (isolated POC)

A small, self-contained tool that proves one thing:

> real FullPOS screenshots → RunPod image-to-video → clips → **local** FFmpeg → finished ad video

It exists to answer "can we get better quality by driving RunPod directly?" **before** anything
is wired into FullPOS Video Studio.

## Result of the first real run (2026-09-21)

**Answer: no — not for software UI.** WAN 2.2 image-to-video re-renders the interface instead of
preserving it. Four real FullPOS screens were animated, and every clip silently rewrote the product:

| Original capture | What the model produced |
| --- | --- |
| `FullPOS Cloud` | `FactPRO Cloud`, `FunPOS Cloud`, `FullPOS Classic` |
| `VENTAS NETAS RD$ 84,803.00` | `RD$ 94,803.00`, `IMPORTE DE VENTAS` |
| `LISMEIRY ENCARNACION` | `LUSMARY ENCARNACION` |
| `CÁPSULAS PHYTOEMAGRY` | `CÁPSULAS FITO…` |
| `© 2026 FullPOS Cloud` | `© 2025 FunPOS Cloud`, `© 2024 FullPOS Classic` |
| `Cobros por método de pago` | `Colores permitidos de pago` (invented) |
| invoice `10720683` | different invoice numbers every clip |

Measured at frame 0 — before any camera movement — the generated frame differs from a pixel-exact
render in **1.2–1.8 % of pixels**, and the drift grows across the 5 seconds. The prompts forbade all
of this; the model did it anyway.

This is exactly the failure `AGENTS.md` anticipates: *"never use generative AI as the authoritative
renderer of software UI … use deterministic Remotion zoom, pan, crop, highlight…"*.

The lab therefore also ships the **deterministic** path, which animates the *captured pixels* and is
pixel-exact by construction:

```bash
node tools/runpod-video-test/scripts/run.mjs --deterministic   # free, exact text
node tools/runpod-video-test/scripts/run.mjs --compare         # A/B page, both versions
```

RunPod remains useful for content where nothing must stay literally readable (abstract backgrounds,
mood shots) — **never** as the renderer of a screen whose text matters.

## Isolation guarantees

| Rule | How it is enforced here |
| --- | --- |
| Video Studio is not modified | This folder only *reads* `apps/api/src/ai-video/**`. Nothing under `apps/web` or `apps/api` is edited. |
| No production render | Every FFmpeg/FFprobe call runs on this machine. No server, no SSH, no EasyPanel. |
| No production database | The lab never opens a database. It only reads the existing `RUNPOD_API_KEY` and R2 settings. |
| No secrets in output | All console output passes through a redactor; signed URLs are masked; the API key is never printed, logged or stored. |
| Nothing generated is committed | `output/`, `temp/`, real screenshots, audio, MP4s and job records are gitignored. |
| Real screenshots are never altered | Input images are opened read-only. Any transformation writes a **copy** under `temp/`. |

## Requirements

- Node 20.11+ (developed on Node 24). `tsx` and `@aws-sdk/*` come from the repo's already-installed
  workspace `node_modules` — **no new dependency is added**.
- FFmpeg **and** FFprobe on `PATH` (with `drawtext`, `xfade`, `scale`, `pad`, `overlay`, `fade`).
  The lab looks for them but **never installs anything**.
- `RUNPOD_API_KEY` and the `R2_*` settings, resolved exactly like the product does
  (process env first, then `apps/api/.env`).

Check everything before spending anything:

```bash
node tools/runpod-video-test/scripts/run.mjs --check
```

## Recommended input (real FullPOS screens)

The video order is the alphabetical order of the file names, and the name also drives the
on-screen caption. These names map to verified captions:

| File name | Screen | Caption it produces |
| --- | --- | --- |
| `01-productos.png` | Productos / inventario (table + filter sidebar) | Control de inventario |
| `02-facturacion.png` | Facturación (invoice list + detail) | Facturación rápida |
| `03-pos-mobile.png` | Mobile POS (cards + cart drawer) | Tu negocio en el bolsillo |
| `04-venta-rapida.png` | Venta rápida (desktop POS) | Gestiona tus ventas |
| `05-reportes.png` | Reportes (chart + margins) | Información en un solo lugar |

With the default `--max-jobs 4`, the **first four** are used and the fifth is reported as skipped.
Run `--check` to see the label every file in `input/images/` would receive *before* paying for anything.

A caption is only inferred when the file name is unambiguous. Otherwise a neutral phrase is used, so a
screen is never mislabelled. To pin exact wording, copy `input/captions.example.json` to
`input/captions.json` and edit it — anything listed there wins.

## Layout

```
tools/runpod-video-test/
  input/
    images/      <- drop REAL screenshots here (PNG/JPG/JPEG/WEBP)
    logo/        <- optional logo
    audio/       <- optional music (MP3/WAV/M4A)
  output/
    clips/       <- downloaded clips (clip-01.mp4 ... + 01-test.mp4)
    frames/      <- extracted frames (per clip, and final)
    final/       <- fullpos-runpod-demo.mp4
    review.html  <- input vs frames vs clip
    review-final.html
  temp/          <- state, segments, labels, selftest (gitignored)
  scripts/       <- run.mjs + lib/
```

## Usage

```bash
# 1. full pipeline (max 4 paid jobs)
node tools/runpod-video-test/scripts/run.mjs

# 2. see exactly what would be sent, and the cost, without spending anything
node tools/runpod-video-test/scripts/run.mjs --dry-run

# 3. cheapest possible real test: one clip, then stop
node tools/runpod-video-test/scripts/run.mjs --first-only

# 4. prove the local half of the pipeline (frames, composition, review pages)
node tools/runpod-video-test/scripts/run.mjs --selftest

# 5. re-assemble from clips already on disk (no RunPod)
node tools/runpod-video-test/scripts/run.mjs --compose-only

# 6. rebuild / open the review pages
node tools/runpod-video-test/scripts/run.mjs --review

# 7. pixel-exact alternative: animate the REAL screenshots locally (no AI, no cost)
node tools/runpod-video-test/scripts/run.mjs --deterministic

# 8. A/B page: RunPod vs deterministic, with measured pixel difference
node tools/runpod-video-test/scripts/run.mjs --compare

# 9. recover clips for jobs that already ran but whose files are missing (free)
node tools/runpod-video-test/scripts/run.mjs --recover --jobs "01-facturacion.png=<jobId>"
```

| Option | Meaning |
| --- | --- |
| `--max-jobs N` | Jobs to spend this run. Default 4. **Hard cap 4** (POC limit). |
| `--profile ID` | `preview` (WAN 2.2 720p, ≈$0.30), `premium` (WAN 2.6 720p, ≈$0.50), `premium-1080p` (WAN 2.6 1080p, ≈$0.75). |
| `--first-only` | Generate only the first clip, then stop. |
| `--dry-run` | Fully offline: no RunPod call, no R2 upload, no cost. |
| `--force` | Regenerate clips that are already completed and valid. |
| `--timeout-min N` | Polling timeout per job (default 15). |
| `--compose-only` | Skip generation; assemble from existing clips. |
| `--deterministic` | Skip RunPod entirely: animate the real screenshots with FFmpeg (`--motion push-in\|push-in-up`, `--local-seconds N`). Free, and text stays exact. |
| `--compare` | Build `output/compare.html`: both versions side by side with measured pixel difference. |
| `--recover` | Re-download clips for jobs that already ran but whose files are missing. Free — it only re-reads the job status. |
| `--formats 9:16,1:1` | Also render vertical/square cuts (16:9 is the master). |
| `--music PATH` / `--no-music` | Force or disable music. |
| `--logo PATH` / `--no-logo` | Force or disable the logo. |
| `--keep-r2` | Keep the lab's temporary R2 objects instead of deleting them. |
| `--no-open` | Do not open the review page in a browser. |

## How it works

1. **Discover** images in `input/images/`, alphabetically (numeric-aware, so `01-…`, `02-…` order is kept).
2. **Validate** each file: readability, magic bytes, MIME, width, height, size. Corrupt files are rejected
   by name and reason instead of crashing the run.
3. **Publish** the image the way the product already does: upload to R2 under the lab-only prefix
   `poc-runpod-video/<run>/…` and hand RunPod a short-lived presigned GET URL. The object is deleted after
   the job unless `--keep-r2` is passed.
4. **Generate** one real job per image against the existing RunPod endpoint, then poll politely
   (5 s → 15 s backoff) with a hard timeout.
5. **Download** and validate each clip with FFprobe (stream, codec, resolution, fps, duration, size).
6. **Extract** 5 frames per clip (start / 25% / 50% / 75% / end) and analyse them technically.
7. **Compose** locally: normalise → caption → crossfade → optional music → H.264 master.
   A clip whose aspect does not match the master (a **portrait phone screen in a 16:9 ad**) is placed on a
   blurred, slightly darkened fill of itself instead of being pillarboxed with hard black bars. The original
   UI pixels are never stretched, cropped or redrawn.
8. **Verify**: FFprobe the master, extract 7 frames, check for black/flat frames, write the review pages.
9. **Report** per-job metrics and a machine-readable `output/report.json`.

### Quality gate

The **first** clip is gated before any further money is spent. It must pass all of:

`JOB COMPLETED` · `MP4 VALID` · `DURATION VALID` · `NO BLACK OUTPUT` · `FRAME EXTRACTION PASS` · `PLAYBACK PASS`

If it fails, the run stops (`POC_NO_GO`) instead of generating the remaining clips.

### Cost control

- `MAX RUNPOD JOBS = 4` — an absolute ceiling, even if more images are supplied.
- A completed clip that still probes cleanly is **skipped** on later runs, so re-running is free.
- `--dry-run` prints the exact payload with the image URL masked and charges nothing.
- Cost comes from the product's own profile table. If RunPod does not report a real cost,
  the lab says so instead of inventing a number.

## What is reused (not duplicated)

The lab imports the product's own modules, so the request/response contract cannot drift:

| Reused | From |
| --- | --- |
| Profile table, endpoints, sizes, duration, estimated cost | `apps/api/src/ai-video/ai-video.profiles.ts` |
| Request payload (`buildRunpodInput`) | `apps/api/src/ai-video/runpod-public-video.provider.ts` |
| Response parsing (`parseRunpodResponse`) | same file |
| Credential resolution (`readRunpodApiKey`) | `apps/api/src/ai-video/runpod-env.ts` |
| R2 config + S3 client (`readR2Config`, `createR2Client`) | `apps/api/src/ai-video/r2-env.ts`, `r2-signed-url-ai-asset-transport.ts` |

**One deliberate difference:** the product calls the endpoint's synchronous `/runsync` route with a 30 s
timeout, which is too short for a real render. The lab uses the **async route of the same endpoint**
(`/run` + `/status/{id}`) so it can report a real job id, poll and time out properly.

**Contract warning (verified 2026-09-21):** this endpoint returns the finished video in
`output.result`, with the price in `output.cost` (USD 0.30 per 5 s 720p clip). The product's
`RunpodPublicVideoProvider.parseRunpodResponse()` only reads `output.video_url`, so it cannot see the
result of its own endpoint and reports *"RunPod no devolvió output.video_url"* for a job that
actually succeeded and was charged. The lab works around this in `parseProviderResult()` (product
parser first, tolerant extractor second) — the product code was deliberately **not** modified.

## Text and UI rules

- **No marketing copy is generated by a model.** Every on-screen word is drawn locally by FFmpeg
  `drawtext`, from a UTF-8 text file — no escaping bugs, no hallucinated text inside screenshots.
- Prompts ask only for a gentle push-in with restrained depth, and forbid redesigning the UI,
  inventing elements, or adding people/hands. The WAN 2.2 `negative_prompt` is strengthened with
  UI-specific terms while keeping the product's own.
- Captions are inferred **only** when the file name is unambiguous (`01-facturacion.png` →
  "Facturación rápida"), and specific signals beat generic ones (`03-pos-mobile.png` → "Tu negocio en el
  bolsillo", not "Facturación rápida"). `input/captions.json` overrides everything.
- The logo appears only on the intro/outro cards, never over a screenshot. `input/logo/` is empty by
  default: an unverified logo is not added to a FullPOS ad.

## Output

- `output/final/fullpos-runpod-demo.mp4` — 16:9 master. The master is sized from the **landscape** sources
  (a portrait clip is fitted into it, it never drags the master vertical), and stays at the source
  resolution rather than being destructively upscaled.
- `output/clips/clip-0N.mp4` — one per image, in narrative order (`01-test.mp4` is a copy of the first).
- `output/frames/…` — extracted review frames.
- `output/review.html`, `output/review-final.html` — human review pages (open directly from disk).
- `output/formats-plan.json` — the prepared 9:16 and 1:1 commands (rendered only with `--formats`).
- `output/report.json` — metrics for the run.
- `output/compare.html` — A/B page (RunPod vs deterministic) with the pixel-difference metric.
- `output/clips-local/` — pixel-exact clips built by `--deterministic`.

## Not in scope

- No integration with FullPOS Video Studio (no "Ver paso / Ver capítulo / Exportar" changes).
- No deploy, no EasyPanel, no SSH, no production database, no Meta Ads.
- No music downloads and no generated commercial copy.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `WAITING FOR INPUT IMAGES` | Drop screenshots in `input/images/` (PNG/JPG/JPEG/WEBP). |
| `WAITING_FOR_RUNPOD_CREDENTIAL` | `RUNPOD_API_KEY` is missing. Add it to `apps/api/.env` yourself — never paste it in chat. |
| `FFmpeg/FFprobe were not found` | Install FFmpeg (e.g. `winget install Gyan.FFmpeg`) and reopen the terminal. |
| `Could not load the existing TypeScript provider` | Run through the CLI (`run.mjs` re-executes itself with `tsx`). If you call a `lib/*.mjs` file directly, pass `--import=tsx/esm`. |
| Console shows odd accented characters | Only affects old Windows code pages. Video text is written as UTF-8 and is correct regardless. |
