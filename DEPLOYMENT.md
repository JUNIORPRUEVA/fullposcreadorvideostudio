# Deployment

Target project name: `fullpos-video-studio`.

Target services:

- `fullpos-video-studio-db`
- `fullpos-video-studio-api`
- `fullpos-video-studio-pwa`

Use the repository root as Docker build context.

API Dockerfile:

```text
Dockerfile.api
```

PWA Dockerfile:

```text
Dockerfile.web
```

Required production gates:

- `/health` returns HTTP 200.
- `NODE_ENV=production`.
- `AUTH_REQUIRED=true`.
- `JWT_SECRET` configured server-side only.
- `OWNER_EMAIL` and one-time `OWNER_PASSWORD` configured before first login.
- `CORS_ORIGINS` contains only approved HTTPS PWA origins.
- PostgreSQL is internal-only and has no public `5432` binding.
- R2 credentials are backend-only.

Do not deploy if authentication is disabled or if production still depends on SQLite/local Windows paths.
