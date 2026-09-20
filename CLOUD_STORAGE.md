# Cloud Storage

Production persistent files belong in private Cloudflare R2.

Canonical object-key layout:

```text
brands/<brandId>/logos/...
brands/<brandId>/assets/...
projects/<projectId>/assets/...
projects/<projectId>/audio/...
projects/<projectId>/renders/...
projects/<projectId>/ai/...
backups/postgres/...
```

Never persist signed URLs. Store `storageProvider` and `objectKey`; generate short-lived signed URLs on demand.

Local filesystem is allowed only for:

- development uploads
- temporary render workspace
- cache
- rollback SQLite backup

R2 bucket must remain private.
