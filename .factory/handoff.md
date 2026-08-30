# Room Ready — verification 4 handoff

## Release disposition: **FAIL**

Independent QA on 2026-08-30 could not resolve requested candidate
`03d3cb9a001fb0438dd97482d938232e3e798ce8`: it is absent locally and from
`origin`. The live URL instead reports
`03d3cb3bb52303812876778b8c133413ebdf34f8` from `/health`.

The live product also fails its core host flow: a Playwright-created room
received 200 from `POST /api/rooms`, then its immediate host read returned 404
“Room not found or expired.” `.factory/claims.json` and `.factory/demo.md` are
missing, and there is no mandatory one-click sample-data demo. These are
release blockers. Local checks for the available revision pass, but do not
make the different, faulty live deployment releasable.

Exact evidence, all command results, live headers/privacy/accessibility checks,
rate result (42 normal / 8 429 with `Retry-After: 1` in a 50-request burst),
and required repairs are in [`.factory/verification-4.md`](verification-4.md).

Do not deploy or claim acceptance until the listed critical and high findings
are repaired and independently reverified.

---

# Previous repair handoff

Work order: `couch-play-preflight-repair-4`

Verifier report: commit `b56bc84fa71a7205d044bcef15e6d656cf173d52`

Failed candidate: `356d4941a7c304c1147f3feb9744b20b2ca7640b`

Repair code commits: `0e80d6b`, `3cb6b1b`, `75736c4`

Live URL: <https://couch-play-preflight.sociobot.in>

## Release disposition

**Repaired and deployed.** The only finding in verification 3,
including its controller-required exact reproduction, is fixed at the SQLite
admission boundary. Behavior that passed verification 3 remains covered.

## Finding, reproduction, and repair

Before any code change, the unchanged candidate was built as a release binary
and given a fresh SQLite database. Twenty-four simultaneous HTTP joins to one
new room returned **24 HTTP 200 responses**, and its snapshot contained **24
players**. This matches the verifier's local failure exactly.

The join handler previously released its database connection between the room
lookup, player count, and insert. Parallel requests could therefore observe
the same count. Admission now starts `BEGIN IMMEDIATE` before checking the room
and count, then commits the insert in that same transaction. SQLite reserves
the writer before any request can make an admission decision, so both one- and
multi-connection execution preserve the hard limit.

Exact regression coverage exists at two boundaries:

- Rust test `parallel_joins_never_exceed_the_room_guest_limit` starts 24 joins
  through an eight-connection SQLite pool and asserts 12 successes, 12 HTTP
  conflict results, and exactly 12 persisted players.
- `npm run test:browser` repeats 24 simultaneous HTTP joins against the release
  binary and asserts the same 12/12 split and 12-player snapshot.

The response-policy regression now also proves API throttling returns 429 with
a positive `Retry-After` and keys clients by the first `X-Forwarded-For`
address. The container build now follows current stable Rust through
`rust:1-alpine`.

## Local verification evidence

All commands ran after a clean `npm ci` (88 packages, 89 audited, zero
vulnerabilities):

- `npm test`: 3 Vitest tests and 7 Rust tests passed.
- `npm run lint`: TypeScript no-emit and locked Clippy for all targets with
  `-D warnings` passed.
- `npm run build`: production output was written to `dist/`. Initial JS is
  48,465 B / 18,420 B gzip; CSS is 15,644 B / 4,550 B gzip; no fonts ship; the
  mobile hero is 35,782 B.
- `cargo build --locked --release --manifest-path server/Cargo.toml` passed.
  The binary reported the exact source revision even when a hostile runtime
  `BUILD_SHA` was supplied.
- `npm run test:browser` passed the release-server capacity regression,
  forwarded-IP rate policy, desktop host plus keyboard guest flow, three-key
  rehearsal, ready state, axe scan, privacy request capture, service-worker
  offline reload, response headers, and 390px mobile layout.
- A separate API matrix passed 100/100 concurrent health calls; 12 accepted and
  12 rejected concurrent joins; a 12-player snapshot; malformed code, blank
  name, unsupported input, overlong label, 17 KB body, invalid host, empty
  accepted-input, close, and read-after-close policies; `429 + Retry-After`;
  first-hop forwarded-IP isolation; CSP, `nosniff`, `no-referrer`, framing
  denial, no cookies, and immutable asset caching.
- `/opt/fleet/lib/verify-url.sh` passed with 0 console errors, `lang=en`, a
  descriptive title, exactly one h1, a main landmark, complete image alt text,
  and labeled buttons.
- Fresh Playwright contexts passed desktop, 390×844 mobile, keyboard-first skip
  link with a visible solid outline, reduced motion (`1e-06s`), zero axe WCAG
  A/AA violations on home/privacy/terms/mobile, no initial local/session
  storage, no cookies, no third-party requests, no console/page errors, stale
  service-worker cache cleanup, and offline reload. Mobile document width was
  exactly 390px.
- Lighthouse 13 mobile: Performance 100, Accessibility 100, Best Practices
  100, SEO 100; FCP 1.2 s, LCP 1.2 s, TBT 40 ms, CLS 0.
- Package/consumer testing is not applicable to this deployed web product.

## Deployment evidence

- Factory ACR build `ch1av` published
  `sociobotregistry.azurecr.io/sf-couch-play-preflight:75736c4d358b` with
  digest `sha256:2ae812be278fe4e216a781725db7bfac25b413abf36f1a7b90d1048abcf74e2a`.
- Azure Container App revision `sf-couch-play-preflight--0000017` became
  healthy with only `PORT=8080` supplied at runtime. Scaling was explicitly
  constrained to `minReplicas=1` and `maxReplicas=1` for local SQLite.
- Live `/health` returned the complete deployed revision
  `75736c4d358b5be9dd23aefb9b408f488e2bbb8a`.
- The final live 24-way probe returned 12 HTTP 200 and 12 HTTP 409 responses;
  the room snapshot contained exactly 12 players. The live rate probe returned
  HTTP 429 with `Retry-After: 1`, while another forwarded client received the
  expected room-not-found response rather than sharing the limit.
- The worker URL verifier returned HTTP 200 in 574 ms with zero browser errors,
  `lang=en`, one h1, a main landmark, complete image alt text, and labeled
  buttons. A fresh live desktop host and keyboard guest reached the ready state,
  then closed the room, with zero axe violations, console errors, or third-party
  requests.

## Run and verify

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:browser
```

The container must run with exactly one replica while it uses local SQLite.
After deployment, compare `git rev-parse HEAD` with the full `build_sha` from
`GET /health`, rerun the live 24-way join probe, and run `verify-url.sh`.

## Known limits and next steps

- Room state survives requests on one always-on replica but not container
  replacement. Move it to PostgreSQL before allowing more than one replica or
  promising restart durability. Azure Files is not suitable for SQLite locks.
- Browsers cannot prove an arbitrary television or casting chain, so the host
  confirms the display.
- Gamepad readiness depends on browser exposure after an input gesture.
- The brief's under-five-minute target requires an observed four-to-eight-person
  usability study; the product does not state that target as achieved.

---

# Previous repair handoff

Work order: `couch-play-preflight-repair-3`

Verifier report: commit `76756dda9082ba1c7fb14ddf233f8d0300b25014`,
candidate `2d497e8ff653a2a5df572a26f5464ce745e27533`

Completed: 2026-08-28

## Release disposition

**Repaired and deployed.** The verifier's live identity blocker and strict
Clippy defect were reproduced, fixed at their source boundaries, and covered
by regressions. The researched brief, visual system, host/guest behavior,
Vite frontend, and Rust/axum + SQLite container class are unchanged.

| Finding | Reproduction and root cause | Repair and regression |
| --- | --- | --- |
| Live `/health` returned `development` instead of the candidate | Confirmed on the public URL before repair. The `.git`-free ACR build accepted the Docker default when its invocation did not populate `BUILD_SHA`; runtime `BUILD_SHA` could also mutate an image's identity. | Docker accepts all factory contract names (`BUILD_SHA`, `GIT_SHA`, `SOURCE_COMMIT`), resolves the first non-placeholder value, and runs the built binary with `--version` to prove the exact embedded value before publishing. `/health` now uses only that immutable value. The browser regression starts the binary with a hostile runtime override and asserts `/health` still equals `--version`. |
| Strict Clippy failed on `trim().split_whitespace()` | Reproduced with the verifier's exact `cargo clippy --locked ... -D warnings` command. | Removed the redundant `trim()` without changing normalization. Added `npm run lint` so TypeScript and strict Rust lint are a documented gate. Existing whitespace-normalization coverage passes. |

## Container and deployment evidence

- ACR run `chbq` proved the new Docker identity assertion in a source archive
  that explicitly excluded `.git`.
- Final product-code image build `chc1` succeeded with tag `d3704615688a` and
  digest
  `sha256:60ce376b7cf0bbe8f5c2deac12fd55fb3227937c1fb42777fba17fbbb813fe26`.
- Azure Container App revision `sf-couch-play-preflight--0000011` was healthy
  with image `sociobotregistry.azurecr.io/sf-couch-play-preflight:d3704615688a`,
  `minReplicas: 1`, `maxReplicas: 1`, and only `PORT=8080` supplied at runtime.
- Live `/health` returned the full immutable image source revision
  `d3704615688ac2d8141353e859258c93153cdecb`.
- Fresh HTTP/1.1 connections produced 20/20 successful room reads and 12/12
  successful joins; a 13th join returned 409, close returned 204, and the
  closed-room read returned 404. A concurrent health probe returned 100/100
  HTTP 200 responses.

The existing Azure Files share was tested during deployment and rejected: its
SMB locking caused SQLite startup failures even for a fresh database. The live
deployment therefore uses one always-on local SQLite replica, which preserves
the verifier-passing cross-request behavior and prevents split-brain routing.
Room data can be lost if Azure replaces that replica. A future durability
upgrade should use PostgreSQL or a POSIX-locking volume, not SQLite over SMB.

## Complete verification evidence

All local checks ran from a clean `npm ci` install (88 packages installed, 89
audited, zero vulnerabilities):

- `npm test`: 3 Vitest tests and 6 Rust unit/integration tests passed.
- `npm run lint`: TypeScript no-emit check and strict locked Clippy for all
  targets passed with zero warnings.
- `npm run build`: production output written to `dist/`; initial JS 48,465 B
  (18,158 B gzip), CSS 15,644 B (4,559 B gzip), no font payload, mobile hero
  35,782 B. All are within product budgets.
- `cargo build --locked --release --manifest-path server/Cargo.toml`: passed;
  the executable's `--version` exactly matched the Git revision.
- `npm run test:browser`: passed against the production server. Desktop host,
  separate keyboard guest, three-key rehearsal, display confirmation, ready
  state, axe WCAG A/AA, third-party request capture, service-worker offline
  reload, security headers, immutable asset caching, and 390×844 overflow all
  passed.
- Extended browser checks: visible first-focus skip link, reduced-motion
  transition `1e-06s`, persisted large-text preference, privacy and terms
  routes, zero page/console errors, and zero third-party requests passed.
- Worker URL verification: title `Room Ready — party game preflight`, `lang=en`,
  one `<h1>`, `<main>`, all image alt text, labeled buttons, and no console
  errors passed locally and live.
- Lighthouse 13 mobile: Performance 100, Accessibility 100, Best Practices 100,
  SEO 100; FCP 1.1 s, LCP 1.1 s, TBT 0 ms, CLS 0.
- API recovery policy: malformed code 400, blank name 400, unsupported input
  400, overlong text 400, oversized body 413, 13th guest 409, invalid guest
  and host tokens 403, empty accepted inputs 400, and closed room 404.
- Response/privacy policy: CSP, `nosniff`, `no-referrer`, and `DENY` framing
  headers passed on home, health, privacy, terms, service worker, and assets;
  no cookies were set; hashed assets were immutable-cached while HTML and the
  service worker were not.
- Package/consumer testing is not applicable to this deployed web product.

## Run and verify

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:browser
```

For a local container-equivalent server:

```sh
DATABASE_URL='sqlite://room-ready.db?mode=rwc' \
  DIST_DIR=dist PORT=8080 server/target/release/room-ready-server
curl http://127.0.0.1:8080/health
```

Release builds must pass the source revision as a Docker build argument. The
Dockerfile accepts all three factory names and verifies the result internally.

## Known limits and next steps

- Room records are temporary and currently survive requests on the one live
  replica, but not a container replacement. Move room storage to PostgreSQL
  before enabling multiple replicas or requiring restart durability.
- Browser APIs cannot prove an arbitrary television/casting chain; the host
  intentionally confirms the big screen.
- Gamepad readiness depends on browser exposure after an input gesture.
- The brief's under-five-minute success target still needs a real observed
  four-to-eight-person usability study.
