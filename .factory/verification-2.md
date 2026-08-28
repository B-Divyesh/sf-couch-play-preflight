# Verification 2 — FAIL

Verifier work order: `couch-play-preflight-verify-2`  
Date: 2026-08-28  
Candidate: `2d497e8ff653a2a5df572a26f5464ce745e27533`  
Live URL: <https://couch-play-preflight.sociobot.in>

## Decision

**FAIL.** The candidate source builds and the live product flow is presently
functional, but the public deployment cannot be verified as this candidate.
`GET /health` on the live URL returned:

```json
{"status":"ok","build_sha":"development"}
```

It must identify the deployed immutable source revision, here
`2d497e8ff653a2a5df572a26f5464ce745e27533`. This is independent fresh
evidence, obtained after the prior deployment-only persistence failure was
repaired. Do not promote until the deployed container is rebuilt/released with
the required build identity and `/health` proves it.

## Defects

### High — live build identity is not the candidate

The service is healthy but reports the fallback string `development`, rather
than the requested candidate SHA. This fails the backend build-identity
contract and makes an exact live/candidate comparison impossible. The source
does support the contract: the local release binary, started with `PORT`,
`DATABASE_URL`, `DIST_DIR`, and `BUILD_SHA` all unset, returned the exact
candidate SHA. The production image/build invocation is therefore the failing
boundary.

### Low — strict Rust lint is not clean

`cargo clippy --locked --manifest-path server/Cargo.toml --all-targets -- -D warnings`
fails on `server/src/main.rs:286` with
`clippy::trim-split-whitespace`: `trim()` is redundant before
`split_whitespace()`. There is no repository lint script, and this does not
affect the exercised runtime flow, but a strict lint gate would fail.

## Passing evidence

All local commands began from a clean checkout at the candidate. No product
code was changed during verification.

| Area | Evidence |
| --- | --- |
| Install and tests | `npm ci` installed 88 packages with 0 audit vulnerabilities. `npm test` passed 3 Vitest tests and 6 Rust tests. |
| Type/build | `npx tsc -p frontend/tsconfig.json --noEmit`, `npm run build`, and `cargo build --locked --release --manifest-path server/Cargo.toml` passed. Production output is `dist/`. |
| Browser production smoke | `npm run test:browser` passed: local release server, desktop host + keyboard guest rehearsal, display confirmation/ready state, axe, privacy, offline reload, and 390px layout. |
| Budget | Built initial JS is 48,465 bytes / 18,420 gzip; CSS 15,644 bytes / 4,550 gzip; no font payload. Both are below the stated 200 KB JS and 50 KB CSS budgets. Hero assets are 35,782 and 73,262 bytes. |
| Local startup identity | With no application configuration variables supplied, the release server started on default port 8080 and `/health` returned `2d497e8ff653a2a5df572a26f5464ce745e27533`. |

## Fresh live product exercise

- Desktop host opened a `QA keyboard trivia` room, received a four-letter
  card/QR, and a keyboard guest joined from a separate context. Three key
  inputs passed the no-install rehearsal; the host confirmed the big screen;
  the board reached **“The room is ready.”** The temporary room was closed.
- At 390 x 844 CSS pixels, the join page had `scrollWidth === innerWidth`
  (no horizontal overflow). Keyboard Tab reached the visible skip link
  (`#main`, `:focus-visible`, solid outline). Large text toggled to pressed
  state and persisted in local storage. Reduced-motion emulation reduced
  transitions to `1e-06s`.
- Invalid/recovery UI: a blank guest name was stopped by required-field
  validation; an unknown four-letter room displayed “Room not found or
  expired” and restored the enabled **Join and run checks** button.
- API boundaries/recovery: malformed code 400, blank guest name 400,
  unsupported input 400, 61-character label 400, 17 KB body 413, 13th guest
  409, invalid guest/host tokens 403, no selected inputs 400, closed-room
  read 404. Normal create and close responses were 200 and 204.
- Fresh HTTP/1.1/no-keepalive persistence probe: 20/20 room reads and 12/12
  joins succeeded. A 100-request concurrent `/health` probe returned 100
  HTTP 200 responses. This confirms the earlier intermittent room-state
  deployment defect is not reproduced now.

## Accessibility, privacy, browser, PWA, and response policy

- Axe-core 4.13 WCAG A/AA scans of the live home and populated host board
  returned zero violations, therefore zero serious or critical findings.
  No page errors or console errors occurred in the desktop, guest, mobile,
  invalid/recovery, or reduced-motion probes.
- Browser request capture found no outbound third-party requests. The page
  uses only same-origin assets; no third-party fonts, scripts, analytics, or
  cookies were observed. Privacy and terms routes render their advertised
  temporary-storage/no-compatibility-guarantee information.
- Service worker installed and controlled a fresh page. After offline mode and
  reload, the cached home rendered and the offline notice was visible.
- Home, health, assets, service worker, privacy, and terms supplied CSP
  restricted to `self`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, and `X-Frame-Options: DENY`. Hashed JS/CSS
  use `Cache-Control: public, max-age=31536000, immutable`; HTML and service
  worker are not immutable-cached. No `Set-Cookie` header was observed.

## Environment limitation

The exact Docker build could not be executed because `docker` is not installed
in this verifier container. The release binary, production Vite build, and
repository browser smoke were executed directly.

## Required disposition

Rebuild/redeploy the candidate with `BUILD_SHA` supplied to the Docker build
as the candidate revision, then verify `GET /health` returns that exact value.
Also clear the strict Clippy warning. Re-run this verification after deploy;
the repaired persistence, cache, browser, PWA, privacy, and accessibility
checks should be retained as regression probes.
