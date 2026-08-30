# Room Ready — independent verification 5

Date: 2026-08-30  
Candidate: `d3e4338db01de509cb59742f22d08ad1ed70b5d5`  
Live URL: <https://couch-play-preflight.sociobot.in>

## Release disposition: **FAIL**

The live deployment reports the requested candidate SHA, the cold first screen
and isolated demo pass, and the local unit/build/lint suite is mostly healthy.
The release still fails its core job: a room created from the live UI is not
available to the immediately following host read. This reproduced in **8 of 8**
fresh browser sessions after an initial isolated reproduction. The required
claims gate also had a failing manifest command and is not independently
filterable by claim.

## Release-blocking evidence

### Critical — every fresh live host flow failed at create → read

In a clean Playwright context, the homepage submitted `POST /api/rooms`, stored
the returned host token in session storage, and navigated to `/host?room=…`.
The immediate host `GET` then returned 404, and the product rendered **“We
couldn’t find this room. Room not found or expired.”**

The first captured example was:

- `POST /api/rooms` → 200 for room `WEDQ`
- immediate `GET /api/rooms/WEDQ` → 404
- a polling `GET /api/rooms/WEDQ` 2.5 seconds later → 200

The later 200 does not recover the UI. The first 404 replaces the host board
with an error screen; subsequent polling only tries to update roster elements
which no longer exist.

An independent eight-session repetition produced rooms `PFLH`, `GPPK`,
`EFSA`, `XKWB`, `ERAY`, `ZRKG`, `TMSH`, and `YSMF`. All eight POSTs returned
200; all eight immediate GETs returned 404; all eight pages showed the missing
room error. This is consistent with requests reaching isolated state even
though the repository and handoff describe a single SQLite writer. Whatever
the infrastructure cause, the deployed primary workflow is unusable.

### Required claims gate failed and does not isolate claims

After `npm ci`, every exact command in `.factory/claims.json` was run in file
order. Results:

| Claim | Exact command result |
| --- | --- |
| `demo-isolated` | PASS |
| `sample-guests` | **FAIL** — `page.reload` timed out after 30 seconds at `frontend/e2e/smoke.mjs:204` |
| `demo-privacy` | PASS |
| `temporary-rooms` | PASS |
| `no-account-or-install` | PASS |
| `offline-reload` | PASS |

A later complete `npm run test:browser` passed, which makes the failure flaky,
not acceptable under the contract that any failing claim command blocks the
release.

There is a second structural problem: all six manifest commands append
`--grep @claim:…`, but `frontend/e2e/smoke.mjs` never reads `process.argv`.
Every command therefore runs the same monolithic smoke script. Claim tags are
comments inside that script rather than independently selectable tests; some
blocks carry more than one tag. The manifest cannot prove one test per claim.

The claims list is also incomplete. Visitor-facing README/page claims about QR
and printable/TV cards, 12-guest capacity, capability/practice checks, large
text, reduced motion, analytics/contact-data privacy, and third-party scripts
have no claims entries of their own.

### High — capability checks can return a false touch pass

In a local production server and desktop Chromium with `maxTouchPoints=0` and
`(pointer: coarse) = false`, Room Ready initially reported **“The browser
cannot see this input yet.”** Three normal mouse clicks on the touch practice
floor then produced **“Practice passed”**, persisted `input_ok=true` and
`practice_ok=true`, and cleared the note. The `pointerup` rehearsal path
overrides the failed touch capability check, so a mouse can certify touch.

### High — the required LAN/local-session check is absent

The researched brief requires LAN discovery with a manual-code fallback and
preflight of devices on the same local session. The implementation only calls
the public same-origin `/health` endpoint and considers a response under five
seconds a network pass. It cannot distinguish the host Wi-Fi from guest Wi-Fi,
cellular service, or any other internet connection. The manual room code is
present, but it is the only join mechanism rather than a fallback to LAN
discovery. This does not establish local-session readiness.

## Other findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| High | SPA and skip-link focus management do not meet the attached accessibility/site-structure contract. | Enter on the visible skip link changed the hash to `#main` but left focus on `BODY`; keyboard navigation to `/demo` also left focus on `BODY` instead of the new h1, with no dedicated route announcement. |
| Medium | Mobile navigation/footer targets are below 44×44 CSS px. | At 390 px: wordmark 129×30, Demo 40×19, Privacy 52×19, Large text 68×40, and footer links 51×16 / 41×16. |
| Medium | Required route/metadata structure is incomplete. | `/not-a-real-route` returns 200 and renders home; no designed 404 exists. Pages have no canonical, Open Graph/Twitter image metadata, or apple-touch icon. The sitemap omits `/demo`; the footer omits build/version identity. |
| Medium | Port-only startup does not emit the mandatory configuration line. | The release binary started and served with an environment containing only `PORT=18123`, but emitted no startup log identifying defaulted/generated configuration because the INFO event is filtered when `RUST_LOG` is absent. |
| Low | Rust formatting check fails. | `cargo fmt --manifest-path server/Cargo.toml -- --check` reports formatting diffs in `server/build.rs` and `server/src/main.rs`. Configured TypeScript/Clippy lint still passes. |

## Acceptance evidence that passed

### First read and demo

The mandatory cold first-read gate passes. The first viewport says:

- what: **“Preflight every device before your guests arrive.”**
- for whom: hosts of family, classroom, and team games
- first click: **“Try it with sample data”**, followed by “See a ready room
  with four sample guests.”

`/demo` immediately showed four named guests and the persistent **“Demo —
sample data, nothing is saved”** banner. Its request log was same-origin only,
contained no `/api` call, and used only `demo:room-ready` in session storage.
Reset worked; Start for real removed the demo key.

### Candidate identity and local gates

- Live `GET /health` → 200 with
  `build_sha=d3e4338db01de509cb59742f22d08ad1ed70b5d5`.
- `npm ci` → 88 packages installed; audit reported zero vulnerabilities.
- `npm test` → PASS: 3 Vitest tests and 7 Rust tests.
- `npm run lint` → PASS: TypeScript no-emit and strict locked Clippy.
- `npm run build` → PASS and produced `dist/index.html`.
- locked release backend build → PASS; the binary reports the candidate SHA.
- `npm run test:browser` → PASS on a later standalone run, including the local
  release-server update/offline regression. This does not cover the broken
  deployed persistence boundary.
- The compiled release binary started from a clean temporary directory with
  only `PORT=18123`; `/health` and `/` returned 200.
- Docker/Podman is unavailable in this verifier, so the Dockerfile could only
  be inspected, not executed. It is multi-stage, uses `rust:1-alpine`, embeds
  build identity from args, and runs as a non-root user.

### Live API boundaries

On a directly exercised room path:

- 60-character game label accepted; 61 rejected with 400.
- 28-character guest name accepted; 29, blank name, invalid input, and invalid
  room code rejected with 400.
- Incorrect host/guest tokens returned 403.
- An overlong note returned 400; valid guest and host updates returned 204 and
  persisted.
- With one existing guest, 12 concurrent joins returned 11×200 and 1×409;
  exactly 12 guests persisted.
- Incorrect close returned 403; authorized close returned 204; the next read
  returned 404.
- One direct create followed by 20 reads returned 20×200. This narrower probe
  does not mitigate the 8/8 browser create→read failure above.

Rate limiting is active on API routes. A 100-request burst using one forwarded
client produced **43 normal 404s and 57 HTTP 429s**. Every limited response had
`Retry-After: 1`. A different forwarded client immediately received a normal
404. The observed burst allowance was 43 responses while refill occurred.

### Privacy, security, PWA, accessibility, and performance

- Cold and demo browser logs used only the product origin. Demo made no API
  request. No cookies or third-party scripts/fonts were observed.
- Live HTML and API responses send CSP, `nosniff`, `no-referrer`, and deny
  framing. Hashed JS sends `public, max-age=31536000, immutable`.
- The current live service worker controlled `/demo`; cache
  `room-ready-shell-3845ce72ff28` existed; a fully offline reload restored the
  demo and showed the offline notice with no page error.
- The factory `verify-url.sh` passed: 601 ms load, `lang=en`, title, one h1,
  main landmark, complete alt text, labeled buttons, and zero console errors.
- Playwright axe 4.13 found zero WCAG 2 A/AA violations on `/`, `/demo`,
  `/privacy`, `/terms`, `/join`, and the 390 px home. The standalone axe CLI
  could not start its Selenium Chrome session against the installed Playwright
  Chromium; the same axe engine ran successfully through Playwright.
- First Tab exposed a 3 px high-contrast skip-link outline. Reduced-motion
  transition duration was `1e-06s`. The 390 px page had no horizontal overflow;
  200% text also retained content without relative horizontal overflow.
- Lighthouse 13 live mobile: Performance 99, Accessibility 100, Best Practices
  100, SEO 100; FCP 1.1 s, LCP 1.3 s, TBT 100 ms, CLS 0, 61 KiB transferred.
- Built payloads: JS 51,910 B (18,990 B gzip), CSS 17,283 B (4,893 B gzip),
  mobile hero 35,782 B, no font payload.

## Required next steps

1. Put all live room requests on one genuinely shared store (prefer
   PostgreSQL), or prove a single replica with persistent storage and repeat
   the browser create→immediate-read regression against the deployment.
2. Make each claim command select exactly one real test and remove the flaky
   offline reload; add every visitor-facing claim to the manifest.
3. Do not let mouse events turn a failed touch capability into a pass.
4. Implement or honestly narrow the LAN/local-session promise.
5. Repair route focus/skip focus, mobile touch targets, 404/metadata, startup
   logging, and Rust formatting before the next candidate.
