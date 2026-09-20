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

Migration remains NO-GO until a dedicated SQLite-to-PostgreSQL import has reconciled every table and relation with zero orphan records.
