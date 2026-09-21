# Deployment

Target project name: `ventas`.

Target services:

- `studio-db`
- `studio-backend`
- `studio-pwa`

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

## Production Database Architecture

Video Studio uses its own native EasyPanel PostgreSQL service:

```text
ventas
├── studio-db       PostgreSQL 17, internal only
├── studio-backend  API, uses DATABASE_URL for studio-db
└── studio-pwa      PWA
```

The `studio-db` service owns the `video_studio` database. Its application role is
dedicated to Video Studio and must not be reused by FullPOS or other services.

The existing `fullpos_database` service is separate and remains protected for
FullPOS data. Do not restore Video Studio data into `fullpos_database`, and do
not upgrade or modify FullPOS PostgreSQL as part of Video Studio deploys.

R2 is the canonical persistent media store. PostgreSQL stores metadata and R2
object keys; local filesystem paths are temporary cache/rollback details only.
