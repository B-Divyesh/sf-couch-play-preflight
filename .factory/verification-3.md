# Verification 3 — FAIL

Work order: `couch-play-preflight-verify-3`
Date: 2026-08-28
Candidate: `356d4941a7c304c1147f3feb9744b20b2ca7640b`
Live URL: <https://couch-play-preflight.sociobot.in>

## Decision

**FAIL.** The public deployment is now demonstrably the requested candidate
and the previous cross-request state/identity failure does not reproduce.
However, concurrent joins bypass the documented hard 12-guest cap. This is a
backend integrity defect at a required boundary, reproduced live and locally.

## High defect — concurrent joins exceed the room cap

Room admission does a player count and an insert as separate operations. A
parallel caller can observe a pre-limit count before another caller inserts.

| Target | Probe | Result |
| --- | --- | --- |
| Live candidate | 24 parallel touch joins to a fresh room | 13 `200`, 11 `409`; room snapshot held **13** players |
| Local release binary | Same 24-parallel-join probe | 24 `200`; room snapshot held **24** players |

Sequential behavior is correct (the thirteenth join returns 409), but it is
not safe for a classroom/party QR join moment. Make count plus insert atomic
(for example, an immediate SQLite transaction or schema-backed slot claim) and
add a parallel-join regression. Do not promote until it passes.

## Passing local checks

- Clean `npm ci`: 88 packages, 0 audit vulnerabilities.
- `npm test`: 3 Vitest and 6 Rust tests passed.
- `npm run lint`: TypeScript no-emit and strict locked Clippy (`-D warnings`)
  passed.
- `npm run build` and `cargo build --locked --release --manifest-path
  server/Cargo.toml` passed. `npm run test:browser` passed against the built
  Vite output and release server.
- Build payload: JS 48,465 B (18,420 B gzip), CSS 15,644 B (4,550 B gzip), no
  font payload, mobile hero 35,782 B.
- Release `--version`, local default-config `/health`, and live `/health` all
  returned the exact candidate SHA.

## Fresh functional, browser, and deployment evidence

- Live desktop host opened a named room, produced a four-letter manual code/QR
  card, and a separate keyboard-only guest joined and completed three practice
  inputs. After display confirmation the host board said **“The room is
  ready.”** No console or page errors occurred.
- Blank name native validation, unknown-room recovery (enabled retry button),
  malformed code 400, blank name 400, unsupported input 400, invalid host 403,
  empty accepted inputs 400, 17 KB body 413, close 204, and read-after-close
  404 passed. Fresh HTTP/1.1 state reads were 20/20, sequential joins 12/12,
  and concurrent health requests 100/100.
- At 390 x 844 no horizontal overflow occurred. Keyboard first focus was the
  visible solid-outline skip link. `lang=en`, title, one h1, main landmark,
  image alts, and reduced-motion (`1e-06s` transition) passed. Axe 4.13 WCAG
  A/AA found zero violations, hence zero serious/critical findings.
- Browser capture found no third-party requests, cookies, console/page errors,
  or initial storage. Privacy/terms disclose temporary data, no contact data or
  analytics, and no untested-game compatibility claim.
- Service worker control, offline reload notice, and update cleanup passed: a
  seeded stale cache was removed on reactivation, leaving only
  `room-ready-shell-v1`.
- Live headers on HTML, health, legal pages, worker, and assets include CSP
  restricted to self, `nosniff`, `no-referrer`, and `DENY` framing. Hashed JS,
  CSS, and hero use `public, max-age=31536000, immutable`; HTML and worker are
  not immutable cached.
- Lighthouse 13 mobile: Performance 100, Accessibility 100, Best Practices
  100, SEO 100; FCP 0.94 s, LCP 1.15 s, TBT 56 ms, CLS 0.

## Environment limitation

Docker is not installed in the verifier image, so the exact container build
was not executed. The Dockerfile was inspected and the exact production Vite
build, release binary, local server, and live deployment were exercised.
