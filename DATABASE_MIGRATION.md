# Database Migration

Current local source:

```text
apps/api/prisma/dev.db
```

Fresh rollback backup for Phase 9:

```text
apps/api/prisma/dev.before-cloud-migration-20260920-154434.db
```

SHA256:

```text
B4D78B27990C32815077EABAC4B4B7F8D2AD016DE87DC5B9CA280BC36C9CB7D3
```

Baseline SQLite counts:

| Table | Count |
| --- | ---: |
| BrandProfile | 2 |
| BrandAsset | 0 |
| Project | 21 |
| VideoScene | 32 |
| Asset | 86 |
| RenderJob | 15 |
| AiVideoJob | 5 |
| AppSetting | 0 |

PostgreSQL target schema:

```text
apps/api/prisma/schema.postgres.prisma
```

## Production Native PostgreSQL Cutover

Phase 9N cut over production Video Studio to a native EasyPanel PostgreSQL 17
service:

```text
EasyPanel project: ventas
Database service: studio-db
PostgreSQL: 17.x
Database: video_studio
Owner role: video_studio_user
```

`studio-backend` connects to `studio-db` over the private EasyPanel/Docker
network. PostgreSQL is not exposed publicly.

The existing FullPOS PostgreSQL service remains separate:

```text
EasyPanel service: fullpos_database
PostgreSQL: 16.x
Status: PROTECTED - DO NOT MODIFY for Video Studio
```

Do not restore Video Studio into `fullpos_database`; PostgreSQL 17 dumps are not
a safe restore target for PostgreSQL 16.

The legacy pre-cutover Video Studio data directory is preserved on the server as
rollback-only:

```text
/etc/easypanel/projects/ventas/studio-db-legacy-rollback-20260921T020741Z
```

Do not delete it without a separate explicit cleanup phase.

Production cutover backups are stored under:

```text
/root/migration-backups/studio-native-9n-20260921T020704Z
```

That directory contains the current-source PG17 dump, post-restore native
`studio-db` dump, checksums, EasyPanel metadata backup, and Docker service
rollback specs. Do not document or commit database passwords.
