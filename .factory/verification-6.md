# Independent verification 6 — FAIL

## Candidate and scope

- Candidate: `f663d5a50376cc2899f02422f0f7d738c4adbb7f`
- Live URL: <https://couch-play-preflight.sociobot.in>
- Date: 2026-08-30 UTC
- Result: **FAIL — critical live deployment defect**

No product code was changed. This report is based on a clean checkout plus fresh live requests and browser contexts.

## First-read test: PASS

A cold desktop browser found the plain-language headline “Preflight every device before your guests arrive.” It names hosts of family, classroom, and team games with phones, controllers, Wi-Fi, and a shared display. The visible first action is the one-click **Try it with sample data** link, which promises a ready room with four sample guests. `/demo` opened the persistent “Demo — sample data, nothing is saved” banner and exactly four named sample guests.

## Required claims gate: PASS

`.factory/claims.json` exists and has 17 claims. From the clean checkout, after `npm ci`, every exact listed command passed independently, in manifest order: `demo-isolated`, `sample-guests`, `demo-privacy`, `temporary-rooms`, `no-account-or-install`, `offline-reload`, `local-room-discovery`, `join-card`, `guest-capacity`, `capability-checks`, `input-practice`, `touch-authenticity`, `large-text`, `reduced-motion`, `privacy-no-tracking`, `game-fit-not-certification`, and `immediate-host-read`.

`npm run test:browser` then passed without a filter: all 17 claims plus its complete browser, API boundary, accessibility, privacy, service-worker update/offline, response-policy, startup, desktop, and 390px checks.

## Local quality gates: PASS

| Command | Result |
| --- | --- |
| `npm ci` | 88 packages installed; 0 vulnerabilities reported |
| `npm test` | 4 Vitest tests and 8 Rust tests passed |
| `npm run lint` | TypeScript no-emit, `cargo fmt --check`, and Clippy `-D warnings` passed |
| `npm run build` | Passed; normal bundle 56.51 kB / 20.57 kB gzip |
| `BUILD_SHA=f663… npm run build` | Passed; entry 56.53 kB / 20.60 kB gzip |
| `npm run test:browser` | Passed complete suite |

The verifier environment has no `docker`, so `docker build` could not run. This is an environment limitation, not the release blocker below.

## Live candidate identity: PASS

`GET /health` returned:

```json
{"status":"ok","build_sha":"f663d5a50376cc2899f02422f0f7d738c4adbb7f"}
```

The live home referenced `assets/index-VQH4IdiF.js`. A candidate build with that SHA emitted the same filename and its SHA-256 matched the downloaded live asset exactly:

```text
652f6eb68cb50f1b281475e46111cc88236c5578231be788be308dee861dce97
```

The failure below is fresh evidence against the requested candidate, not a stale revision.

## Critical defect: live room state is split

**Severity: critical.** The researched job requires a host to open a temporary room and guests to join it reliably. The live service cannot do that.

Fresh same-client reproduction, repeated for eight newly-created rooms:

```text
POST /api/rooms                         -> 200
GET /api/rooms/<new code>, five times  -> 404, 200, 404, 200, 404
```

This exact alternating pattern occurred for `GZQY`, `TAKF`, `BXVL`, `QJUX`, `KMQB`, `TCEG`, `NZPC`, and `JZFY`. A prior cross-client probe created 12 rooms (`200` each) and received `404` on every immediate read. A real browser run opened a host room, then a separate guest context could not reliably continue past its room lookup.

The candidate's local Rust test proves independent connections see one SQLite database. The live alternation proves requests are being served by at least two independent state partitions. Exact deployment settings were not read, per the verifier's service-scope restriction. The source's stated single-replica SQLite contract is not true in the live deployment.

**Required remediation:** run one state-owning backend replica and repeat POST-to-GET verification across independent clients, or migrate rooms to a database designed for multiple replicas. UI retry is not a remedy for room visibility loss.

## Live product QA outside the blocker

### Privacy and network traffic: PASS

A clean `/demo` context requested only `/demo`, `/assets/index-VQH4IdiF.js`, and `/assets/index-Bt63kcK-.css`; it set no cookies, used only `demo:room-ready` session storage, and made no `/api` request. A clean `/privacy` context made same-origin page/CSS/JS requests only. No account, email, password, install manifest, third-party font, script, or runtime-service request was observed.

### Headers, cache, offline: PASS

Home, health, and 404 supplied `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and CSP `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. Hashed JS/CSS/image assets use `public, max-age=31536000, immutable`. The live versioned service worker controlled `/demo`; after cache population, an offline reload retained the demo banner and showed its offline status.

### Accessibility and responsive checks: PASS

`/opt/fleet/lib/verify-url.sh` passed against live home: 613 ms load, zero load console errors, correct title/lang, one h1, main landmark, complete alt text, and labeled buttons. Axe 4.13 found zero serious/critical WCAG 2 A/AA violations on `/`, `/demo`, `/privacy`, `/terms`, `/join`, and the 404. Keyboard first Tab reached the skip link, Enter focused `#main`, SPA navigation focused the destination h1, and normal loads had no console/page errors. At 390px the page had `scrollWidth: 390`; reduced-motion primary transition duration was `1e-06s`.

### Rate limiting: conditionally PASS, deployment evidence

The server emitted `429` with `Retry-After: 1` after a one-client burst. In a 100-request concurrent probe, 92 responses were normal `404`s and 8 were `429`; one `429` appeared by response position 36. Source configures a 40-request burst and one token per 50 ms (20/s) per client. The inconsistent observed allowance corroborates the split backend state/limiter evidence and cannot represent a coherent single-service allowance.

## Overall decision

The repository and candidate artifact meet local claims, test, browser, privacy, accessibility, and performance-size gates. The exact live candidate does not meet the core end-to-end acceptance criterion because temporary rooms are not consistently readable after creation. **FAIL.**
