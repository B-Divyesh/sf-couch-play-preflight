# Room Ready v1 handoff

Work order: `couch-play-preflight-build-1`

Completed: 2026-08-27

## What was built

- Finished responsive host and guest preflight, served as one container by a
  Rust `axum` backend.
- Host flow: optional activity label, six-hour room, four-letter manual code,
  QR join link, print card, full-screen TV card, live roster, accepted-input
  selection, display confirmation, readiness summary, and confirmed close.
- Guest flow: manual/QR join, name and input selection, secure-browser and
  service reachability checks, browser input detection, reduced-motion status,
  optional screen-wake request, and a three-input touch/keyboard/gamepad
  rehearsal.
- Mixed-input readiness compares each measured guest input to host-declared
  requirements. Copy explicitly avoids making untested game compatibility
  claims.
- SQLite room state with parameterized queries, six-hour expiry, 12-guest cap,
  private host/guest update tokens, request body limits, per-IP rate limiting,
  restrictive CSP and security headers, structured JSON logs, `/health` build
  SHA, and graceful shutdown.
- First-class loading, empty, expired/not-found, offline, unauthorized-host,
  validation, retry, and destructive-confirmation states.
- Local `/privacy` and `/terms`, large-text mode, keyboard routes, visible focus,
  reduced-motion fallbacks, 390px layout, and installable offline shell cache.
- Cinematic original hero artwork generated for this product. Source prompt,
  generation metadata, review, and license notes are in `.factory/design.md`
  and `assets/src/`; shipped WebP variants are 35 KB and 72 KB.

## Run and deploy

```sh
npm install
npm test
npm run build
DATABASE_URL='sqlite://room-ready.db?mode=rwc' cargo run --manifest-path server/Cargo.toml
```

The exact frontend build command is `npm run build`; it writes
`dist/index.html`. The root multi-stage `Dockerfile` builds both artifacts,
runs as a non-root user, exposes port 8080, and uses `/data` for SQLite.

Environment variables: `PORT`, `DATABASE_URL`, `DIST_DIR`, `BUILD_SHA`, and
`RUST_LOG`. No secret is required.

## Verification

- `npm test`: passed — 3 Vitest assertions and 3 Rust tests. Rust lifecycle
  coverage exercises create, join, guest update, host setup update, snapshot,
  close, and expiry/not-found behavior.
- `npm run build`: passed. Initial bundle: JS 48.47 KB / 18.42 KB gzip; CSS
  15.64 KB / 4.55 KB gzip; no font payload; mobile hero 35 KB.
- `npx tsc -p frontend/tsconfig.json`: passed.
- `cargo build --release --manifest-path server/Cargo.toml`: passed.
- `/opt/fleet/lib/verify-url.sh`: passed; title, `lang`, one `h1`, main
  landmark, alt text, and zero browser console errors.
- Axe 4.13 WCAG A/AA checks on home, populated host, and join screens: zero
  violations (24/21/21 passing rule groups).
- Playwright desktop + 390×844 smoke: passed. It opened a room, joined a
  keyboard guest, completed three practice inputs, confirmed the display, and
  reached “The room is ready.” Deep links return HTTP 200.
- Lighthouse 13 mobile simulated throttling: Performance 100, Accessibility
  100, Best Practices 100, SEO 100; FCP 1.1 s, LCP 1.2 s, CLS 0, TBT 0 ms.
  INP is unavailable from a no-interaction lab trace; TBT and the interactive
  smoke show no blocking work.
- Load smoke: 100 concurrent `/health` requests, 100 successful in 194 ms
  (about 515 requests/second locally).
- Security smoke: CSP, `nosniff`, `DENY` framing, and no-referrer headers were
  observed; service worker, robots, sitemap, assets, and SPA deep links return
  correct content types/statuses.
- `docker build` could not be executed because the worker image has no Docker
  CLI/daemon. Both exact Docker build stages were executed independently via
  `npm run build` and `cargo build --release`.

## Known limits

- Browser security models cannot verify an arbitrary TV/casting chain. The host
  explicitly confirms that the display is connected and visible.
- Gamepad support depends on the browser exposing the Gamepad API after a
  button press. The rehearsal provides a specific reconnect/retry message.
- The service checks reachability to this Room Ready deployment. It does not
  probe a game’s private LAN port or automatically discover a host; QR and the
  manual code are the dependable discovery paths.
- Rooms expire lazily when another room is created, in addition to being
  excluded immediately after expiry. A scheduled cleanup would reduce stale
  database rows for a very quiet deployment.
- The brief’s target of 80% of observed groups ready under five minutes still
  needs a real four-to-eight-person usability study; the automated flow is not
  a substitute for that measurement.

## Suggested next steps

1. Run the four-to-eight-person timed study and refine wording around the most
   common failed check.
2. Add optional WebSocket/SSE pushes if 2.5-second host polling becomes visible
   under venue-scale use.
3. Add a scheduled expired-room deletion task and deployment-level SQLite
   backup/retention policy if persistent volumes are enabled.
