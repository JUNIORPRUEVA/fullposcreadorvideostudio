# Backup And Restore

Production PostgreSQL backup target:

- daily `pg_dump`
- compressed
- timestamped
- SHA256 hash
- minimum 7 daily backups retained
- preferred off-host copy under private R2 `backups/postgres/`

Restore validation must use a temporary database/container and must never overwrite production.

Phase 9 local SQLite rollback source:

```text
apps/api/prisma/dev.before-cloud-migration-20260920-154434.db
```
