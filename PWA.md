# PWA

The web app includes:

- `apps/web/public/manifest.webmanifest`
- `apps/web/public/sw.js`
- local SVG app icons
- service worker registration in production

Installability target:

- Chrome / Edge on Windows
- HTTPS production URL
- standalone display mode

Offline policy:

- Cache the app shell only.
- PostgreSQL remains the source of truth.
- Cloud mutations must not be treated as successful while offline.
