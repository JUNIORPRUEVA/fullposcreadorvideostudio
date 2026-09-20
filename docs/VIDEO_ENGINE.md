# Video Engine

The first template is `FullPOSPremiumVertical`.

- Format: 1080x1920
- FPS: 30
- Duration: 25 seconds
- Frames: 750
- Output: MP4/H.264
- Audio: optional voiceover WAV plus generated local background music WAV. Voiceover uses local Windows SAPI Spanish voices when available; otherwise the script is saved and the render continues without narration.

Screenshots are used as immutable evidence. The renderer may crop, scale, position, mask, shadow, and place screenshots into device mockups, but it must not modify the visible software content.

Scene framing supports per-scene scale/position tuning so product screens can be larger and readable in 9:16 ads.
# General Video Engine

FullPOS Video Studio now supports a reusable video engine beyond advertisements:

- `ADVERTISEMENT`
- `QUICK_TUTORIAL`
- `COURSE`
- `ONBOARDING`
- `FEATURE_SPOTLIGHT`
- `SUPPORT`
- `BRAND_MOTIVATIONAL`
- `FREEFORM`

Template V2 metadata defines supported video types, aspect ratios, duration mode, AI/music/voice/screen-recording support, and chapter support.

Scene model V2 supports title, screenshot, screen recording, device showcase, AI background, text, chapter, callout, summary, CTA, image, video, brand intro, and brand outro scene types. Focus keyframes and callouts are deterministic Remotion overlays and must not mutate source media.

Current local templates:

- SaaS Premium Ad: existing advertisement flow.
- Quick Tutorial: vertical instructional preview with zoom, callouts, subtitles, and real UI.
- Professional Course: 16:9 course scene preview with chapter/lower-third/subtitle structure.
- Hybrid AI: AI background only, with real UI/device rendered on top by Remotion.
