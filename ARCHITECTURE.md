# Architecture

FullPOS Video Studio is now a general video engine, not only an advertising generator.

Core reusable capabilities:

- Project persistence with `videoType`, template, duration, format, narration style, subtitles, assets, and storyboard scenes.
- Remotion rendering for deterministic UI, devices, text, callouts, subtitles, course/tutorial templates, and advertisement templates.
- Audio pipeline for voice, music, previews, and future per-scene narration.
- AI pipeline for optional background/video generation through R2 signed URLs and RunPod, never as authoritative UI for instructional content.
- Storage under `storage/uploads`, `storage/renders`, `storage/audio`, `storage/ai-video`, and `storage/ai-backgrounds`.

Instructional content must preserve source UI pixels. Allowed transformations are deterministic zoom, pan, crop, masks, highlights, callouts, cursor/click indicators, and subtitles.
