# Verification — FAIL

Verifier work order: couch-play-preflight-verify-1  
Date: 2026-08-28  
Candidate: ed221b5cedbffabd465b2b18bbefada87add817c  
Live URL: https://couch-play-preflight.sociobot.in

## Decision

**FAIL.** The public service does not reliably preserve a room between
requests. This breaks the core host-plus-guest preflight flow and the live
service cannot be confirmed as the requested candidate.

## Blockers and defects

### Critical — live room state is inconsistent across requests

Using fresh HTTP/1.1 connections against the public URL, a newly-created room
code (WDTA) produced:

| Operation | HTTP 200 | HTTP 404 |
| --- | ---: | ---: |
| 20 consecutive GET /api/rooms/WDTA | 8 | 12 |
| 12 consecutive POST /api/rooms/WDTA/join | 6 | 6 |

The successful requests and failures were interleaved over 2.8 seconds. A
host can therefore open a room and a guest can immediately be told that it
does not exist. This strongly indicates a deployment persistence boundary
(such as multiple runtime instances with non-shared SQLite state), not a
normal validation response. It violates the smallest useful product and must
be fixed before release.

### High — deployment build identity does not match the candidate

GET /health on the public service returned HTTP 200 with:

    {"status":"ok","build_sha":"57ee656f0fd9e84816107f33381c5f3e5f7ded64"}

The verification target is ed221b5cedbffabd465b2b18bbefada87add817c. The
deployment therefore does not identify itself as the candidate required by
this work order. The app-source tree is inherited from the earlier commit,
but that is not an acceptable substitute for backend build identity.

### Medium — hashed production assets are not cacheable

The live JS and CSS responses have no Cache-Control header. For example,
/assets/index-6F-2nOcD.js (48,465 bytes) and
/assets/index-C6jKL_PC.css (15,644 bytes) return content type, last-modified,
and security headers but no immutable cache policy. This misses the stated
long-lived immutable caching requirement for hashed assets.

## Passing local evidence

All commands were run from the clean checkout at the candidate commit.

- npm ci: passed; 87 packages audited, 0 vulnerabilities.
- npm test: passed; 3 Vitest assertions and 3 Rust tests.
- npx tsc -p frontend/tsconfig.json --noEmit: passed.
- npm run build: passed. dist/ contains JS 48,465 bytes (18,158 gzip), CSS
  15,644 bytes (4,559 gzip), and no font payload; initial JS is below 200 KB.
- cargo build --locked --release --manifest-path server/Cargo.toml: passed.
- The exact container build could not be run in this verifier container:
  docker is not installed (docker: command not found). This is an environment
  limitation, not a passing Docker verification.

Local release-server API exercise, with BUILD_SHA set to the candidate:

- /health returned the requested candidate SHA.
- Create, snapshot, twelve successful joins, authenticated host update, and
  close/re-read lifecycle passed.
- Boundary/recovery responses: malformed room code 400, blank name 400,
  unsupported input 400, 61-character label 400, thirteenth guest 409,
  bad guest token 403, bad host token 403, no selected inputs 400, oversized
  17 KB request body 413, and closed room 404.
- 100 concurrent local /health requests all returned 200 and the one expected
  build identity.

Local Playwright exercise of the production build passed: host opens a room,
keyboard guest joins, completes three-key rehearsal, host confirms the
display, and the board reaches “The room is ready,” with no page or console
errors.

## Live browser, accessibility, privacy, and PWA evidence

One ordinary live browser route passed before the persistence probe exposed
the intermittent failure: host room creation, QR generation, blank-name
native validation, keyboard guest join, three-key practice, display
confirmation, and ready summary. This does not mitigate the Critical defect.

- Chromium desktop and 390 x 844 mobile were exercised. The 390px page had no
  horizontal overflow. Keyboard Tab revealed the skip link and the focus
  treatment. With reduced motion emulated, transition duration computed to
  1e-06s and motion preference was active.
- axe-core 4.13 WCAG A/AA scan found zero violations on the home and populated
  host screens; therefore zero serious or critical findings in those scans.
- No console errors or page errors were observed in desktop, guest, or mobile
  flows.
- Browser request capture found no outbound third-party requests. The home
  document contains no external resource reference. No CDN fonts/scripts are
  used.
- Response headers on home, health, JS, CSS, and service worker include CSP
  restricting default/script/style/connect sources to self, X-Content-Type-
  Options: nosniff, Referrer-Policy: no-referrer, and X-Frame-Options: DENY.
  No Set-Cookie header was observed.
- In a fresh browser profile, the service worker installed and controlled the
  page. Its cache contained the shell and declared image resources; after
  clearing the HTTP cache and emulating offline, a reload rendered the cached
  home page and its offline notice. Source inspection confirms a versioned
  cache name, skipWaiting, clients.claim, and deletion of old cache names.

## Required release disposition

Do not promote this candidate. Deploy only after room state is shared and
durable across all public runtime instances (or traffic is constrained to the
one persistent instance), then redeploy with BUILD_SHA set to the exact
candidate and add immutable caching for hashed assets. Re-run this
verification, especially the cross-connection room read/join probe.
