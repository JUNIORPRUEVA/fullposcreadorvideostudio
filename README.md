# FullPOS Video Studio

FullPOS Video Studio is a TypeScript monorepo for creating deterministic, professional software videos for advertising, training, tutorials, onboarding, support, product updates, brand content, and free-form videos.

The repository/folder name has not been renamed yet. Existing advertisement flows remain supported, but the product direction is now a general video production system.

## Stack

- Next.js, React, TypeScript, App Router
- NestJS, Prisma, SQLite for local legacy data; PostgreSQL is the cloud target
- Remotion and FFmpeg for video rendering
- General video types, storyboard scenes, screen recordings, voice, music, R2, RunPod, and hybrid AI backgrounds
- npm workspaces

## Quick Start

```bash
npm install
npm run prisma:generate
npm run build
npm run render:demo
```

Local previews include:

- Quick Tutorial: `storage/renders/quick-tutorial-preview/final.mp4`
- Professional Course scene: `storage/renders/professional-course-scene-preview/final.mp4`
- Hybrid AI mobile: `storage/renders/hybrid-mobile-preview/final.mp4`

## Safety

This project is independent. Do not connect it to DaleVentas production, do not reuse credentials from other projects, and do not write generated media to Git.

## Cloud Direction

Production cloud deployment must use PostgreSQL for structured data and private Cloudflare R2 for persistent files. Local filesystem paths are valid only for development, temporary cache, and render workspaces. Public PWA access requires authentication.
