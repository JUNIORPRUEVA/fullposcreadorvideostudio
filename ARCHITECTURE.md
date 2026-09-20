# Architecture

FullPOS Video Studio is now a general video engine, not only an advertising generator.

Core reusable capabilities:

- Project persistence with `videoType`, template, duration, format, narration style, subtitles, assets, and storyboard scenes.
- Remotion rendering for deterministic UI, devices, text, callouts, subtitles, course/tutorial templates, and advertisement templates.
- Audio pipeline for voice, music, previews, and future per-scene narration.
- AI pipeline for optional background/video generation through R2 signed URLs and RunPod, never as authoritative UI for instructional content.
- Local development storage under `storage/uploads`, `storage/renders`, `storage/audio`, `storage/ai-video`, and `storage/ai-backgrounds`.
- Cloud target: PostgreSQL is the structured source of truth, Cloudflare R2 is canonical persistent object storage, and local disk is temporary/cache/render workspace only.
- Public production access requires authentication before project, brand, asset, render, settings, or AI endpoints are exposed.

Instructional content must preserve source UI pixels. Allowed transformations are deterministic zoom, pan, crop, masks, highlights, callouts, cursor/click indicators, and subtitles.
