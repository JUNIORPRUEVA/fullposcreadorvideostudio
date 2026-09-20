# Project Status

Current product direction:

- Display name: FullPOS Video Studio.
- Scope: general video studio for advertisements, tutorials, courses/training, onboarding, feature demos, support, brand/motivational, and free-form videos.
- Existing advertisement functionality is preserved.
- RunPod/R2/hybrid AI remain available, but no new paid RunPod request was made in Phase 7.

Implemented Phase 7 foundation:

- `videoType` on projects with existing projects backfilled by Prisma default as `ADVERTISEMENT`.
- Template metadata V2.
- General scene model and storyboard persistence.
- Screen recording asset support for MP4/WebM metadata.
- Quick Tutorial and Professional Course preview compositions.
- Demo course project: `Curso profesional — Cómo registrar una venta`.

Previous MVP scope:

- Project CRUD: initial implementation.
- Asset upload: initial implementation.
- Render job lifecycle: internal worker, no external queue.
- First Remotion template: `FullPOSPremiumVertical`.
- Demo MP4 generation: expected at `storage/renders/demo-fullpos-premium-vertical/final.mp4`.
- Phase 2 premium vertical MP4 validated at `storage/renders/phase2-premium-test/final.mp4`.
- Phase 3 in progress: premium framing, local audio pipeline, functional UI actions, settings, project duplicate/delete, video listing/open/download.
- Prisma hardening: use `npm run db:push` for reproducible SQLite initialization on Windows. It sets `RUST_LOG=info` because Prisma 6.19.3 schema-engine exits with a blank SQLite `Schema engine error` on this host otherwise.

Latest local validation:

- `ffprobe` via Remotion local binary: `h264`, `1080x1920`, `30 fps`, `25.000s`, `750 frames`, `5,708,088 bytes`.
- `npm.cmd run prisma:validate`: passed.
- `npm.cmd run db:push`: passed; SQLite database already in sync.
- `npm.cmd run e2e:local`: passed; render completed at 100% and downloaded MP4 was non-empty.
- Local dev servers were stopped after E2E; no deployment has been run.

No production deployment has been configured.
