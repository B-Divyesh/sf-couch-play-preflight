# Room Ready — verification 6 handoff

## Release disposition: FAIL — do not release

Independent verification of candidate `f663d5a50376cc2899f02422f0f7d738c4adbb7f` at <https://couch-play-preflight.sociobot.in> found a critical live deployment failure. The frontend and `/health` identify this exact candidate, but room state is split between backend state partitions. A real room can therefore disappear between the host's create request and a guest/host read.

## Release-blocking defect

**Critical — live room persistence is inconsistent.** On August 30, 2026, eight fresh `POST /api/rooms` requests each returned `200`; five immediately following `GET /api/rooms/<code>` requests from the same client then alternated `404, 200, 404, 200, 404` for every room. A separate twelve-room cross-client probe returned `404` for all twelve immediate reads. This is incompatible with the product's host/guest flow and proves that requests reach independent room stores (consistent with more than one SQLite-backed backend instance). It is not a stale frontend: `/health` returns the full candidate SHA and the live entry bundle hashes byte-for-byte to a production build of this commit.

The deployment must be constrained to one state-owning replica or use a real shared database before another verification. Do not treat UI retry behavior as a remedy for this loss of room visibility.

## What passed locally

- `npm ci` completed with 0 vulnerabilities.
- All 17 exact commands in `.factory/claims.json` passed independently from the demo entry point; the aggregate `npm run test:browser` also passed all claims plus browser/API/accessibility/privacy/offline/mobile checks.
- `npm test`: 4 Vitest and 8 Rust tests passed.
- `npm run lint` passed TypeScript, Rust formatting, and strict Clippy.
- `npm run build` passed. With the candidate build SHA, the entry bundle was 56.53 kB (20.60 kB gzip) and exactly matched the live asset.

## Live checks that passed

- Cold first read clearly explains the device preflight, the intended hosts, and the first action, **Try it with sample data**. The one-click demo opens four sample guests.
- `/health` returned `f663d5a50376cc2899f02422f0f7d738c4adbb7f`; live asset `index-VQH4IdiF.js` SHA-256 matched the candidate production build.
- Demo and Privacy made same-origin static requests only, set no cookies, and demo used only `demo:room-ready` session storage with no `/api` traffic.
- Required CSP, `nosniff`, `no-referrer`, and frame-denial headers are present; hashed assets are immutable. The live service worker controlled `/demo` and reloaded it offline.
- `verify-url.sh` passed: title/lang/one h1/main/alt/button checks, no load console errors, 613 ms load. Axe found no serious/critical WCAG 2 A/AA issue on `/`, `/demo`, `/privacy`, `/terms`, `/join`, or the live 404. Keyboard skip link and route-heading focus passed; 390px had no horizontal overflow; reduced motion was `1e-06s`.
- Live rate limiting did produce `429` with `Retry-After: 1`. A 100-request concurrent single-client probe observed 92 `404` and 8 `429`; because room state and limiter state are split, this cannot be accepted as a coherent single-service allowance. Source configuration is burst 40, replenishing one token per 50 ms.

## Verification record

Full evidence and reproduction commands are in [`.factory/verification-6.md`](verification-6.md). No product code was modified during verification. Docker was unavailable in this verifier image, so a container-image rebuild could not be run; the repository's exact production frontend build and release-browser suite were run instead.
