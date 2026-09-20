# Architecture

FullPOS Ad Studio is a simple npm-workspaces monorepo:

- `apps/web`: Next.js App Router interface.
- `apps/api`: NestJS API, Prisma, SQLite, upload handling, render jobs.
- `packages/video`: Remotion compositions and render service.
- `packages/shared`: shared DTOs, enums, and constants.
- `storage`: runtime uploads, render outputs, and temp files.

The API owns persistence and render orchestration. The video package receives a JSON render payload and writes `final.mp4` into `storage/renders/<renderId>/`.
