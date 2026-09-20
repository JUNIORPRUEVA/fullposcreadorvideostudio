# FullPOS Ad Studio

FullPOS Ad Studio is a TypeScript monorepo MVP for creating deterministic, professional software advertising videos. The first brand/template targets FullPOS Cloud and the architecture is prepared for Appyra, client products, and future templates.

## Stack

- Next.js, React, TypeScript, App Router
- NestJS, Prisma, SQLite
- Remotion and FFmpeg for video rendering
- npm workspaces

## Quick Start

```bash
npm install
npm run prisma:generate
npm run build
npm run render:demo
```

The demo render is written to `storage/renders/demo-fullpos-premium-vertical/final.mp4`.

## Safety

This project is independent. Do not connect it to DaleVentas production, do not reuse credentials from other projects, and do not write generated media to Git.
