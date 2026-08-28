# Room Ready — repair handoff

Work order: `couch-play-preflight-repair-2`  
Base verifier report: `2aefcdcd13bf623821811bd7067031db50a7cb3a`  
Completed: 2026-08-28

## Release disposition

**Repaired and deployed.** The independent verifier's three release blockers
were reproduced and fixed without changing the researched brief, visual
system, user flow, or Rust/axum + SQLite container product class.

| Verifier finding | Root cause | Repair and regression coverage |
| --- | --- | --- |
| Intermittent room 404s and joins across connections | Container Apps allowed 1–3 replicas while every replica had an isolated ephemeral `/data` SQLite file. | The live app now mounts the dedicated Azure Files `room-ready-data` store at `/data` and is explicitly constrained to one replica (`minReplicas: 1`, `maxReplicas: 1`). Rust coverage opens a room through one independent SQLite pool and reads/joins it through another. The live verifier probe is 20/20 reads and 12/12 joins. |
| `/health` identified an older build | Dockerfile had a hard-coded historical SHA. Git metadata is intentionally absent from ACR build contexts. | The release build passes immutable `BUILD_SHA` as a Docker build arg; `build.rs` compiles it into the binary, with an explicit runtime value only as an override. It also watches the resolved branch ref locally so a normal commit cannot reuse the prior identity. The live health response matches the image source revision. |
| Hashed JS/CSS had no cache policy | The static directory had no cache middleware. | Successful `/assets/` responses now carry `Cache-Control: public, max-age=31536000, immutable`; HTML and the service worker remain uncached. A router regression asserts both cases, and the browser smoke checks the built hashed bundle header. |

## What changed

- Added immutable-asset response middleware and server regressions for cache
  policy, cross-pool room visibility, and build identity override.
- Added `server/build.rs` to embed the explicit release revision and ensure
  local branch builds refresh after a commit.
- Added pinned Playwright 1.58.2 and `npm run test:browser`. The production
  smoke starts the release binary, completes the desktop host + keyboard guest
  rehearsal, confirms the display/ready state, checks axe WCAG A/AA, security
  headers, no third-party browser requests, service-worker offline reload, and
  a 390×844 layout with no horizontal overflow.
- Documented the required persistent `/data` mount and single-replica rule for
  SQLite container deployments.

## Verification evidence

All checks below passed from a clean repository checkout after `npm ci`.

- `npm ci`: 88 packages installed; 89 audited; 0 vulnerabilities.
- `npm test`: 3 Vitest model tests and 6 Rust tests passed.
- `npx tsc -p frontend/tsconfig.json --noEmit`: passed.
- `npm run test:browser`: passed. It built production assets, ran the locked
  Rust release binary, exercised desktop keyboard operation and guest practice,
  found zero axe WCAG A/AA violations, observed no page errors or third-party
  requests, rendered the service-worker offline notice after cache control,
  and found no 390px horizontal overflow.
- `cargo build --locked --release --manifest-path server/Cargo.toml`: passed.
- `npm run build`: passed. Initial JS is 48,465 bytes (18,420 gzip); CSS is
  15,644 bytes (4,550 gzip); no font payload. Both remain within budget.
- Local fresh-connection API reproduction with a production build: 20/20
  `GET /api/rooms/<code>` succeeded and 12/12 joins succeeded; the built
  hashed JS response had the required immutable cache header.
- Cloud container build: ACR run `ch8q` succeeded for image
  `sociobotregistry.azurecr.io/sf-couch-play-preflight:2fbe9b88fdca`, digest
  `sha256:8cb6717adaa0921500d2ac88f288fcdeafebad1c360e34a233b7cb9e03404aef`.
- Deployment: Azure Container App revision
  `sf-couch-play-preflight--0000003` is provisioned with that image, the
  Azure Files `/data` mount, and exactly one replica. No application secret is
  stored in the image or repository.
- Live verification at `https://couch-play-preflight.sociobot.in`:
  `/health` returned HTTP 200 and the deployed image revision;
  fresh HTTP/1.1/no-keepalive requests produced 20/20 room reads and 12/12
  successful joins. The live hashed JS returned
  `Cache-Control: public, max-age=31536000, immutable`. CSP, `nosniff`,
  `no-referrer`, and `DENY` frame headers are present.

## Run and verify

```sh
npm ci
npm test
npx tsc -p frontend/tsconfig.json --noEmit
npm run test:browser
```

For a local container-like run:

```sh
npm run build
DATABASE_URL='sqlite://room-ready.db?mode=rwc' cargo run --manifest-path server/Cargo.toml
```

Release builds must supply `--build-arg BUILD_SHA=$(git rev-parse HEAD)` and
mount durable storage at `/data`. The configured factory deployment uses an
Azure Files volume and a single replica; do not raise replicas for this SQLite
service without replacing SQLite with a shared database.

## Known limits and next steps

- Browser APIs cannot independently prove an arbitrary TV/casting chain; the
  host deliberately confirms the big screen.
- Gamepad readiness depends on browser exposure after an input gesture.
- Rooms are temporary and expiry cleanup is lazy; scheduled cleanup and backup
  retention are sensible future operational improvements.
- The brief's under-five-minute success measure still needs a real observed
  four-to-eight-person usability study.

## Independent verification 2 — FAIL

Verified on 2026-08-28 against candidate
`2d497e8ff653a2a5df572a26f5464ce745e27533` and
<https://couch-play-preflight.sociobot.in>.

**FAIL — do not promote.** Fresh end-to-end live testing confirms the earlier
room persistence failure is repaired (20/20 fresh reads, 12/12 joins), and
the desktop/mobile, PWA, privacy, axe, cache, and response-policy checks pass.
However, live `/health` returns `{"status":"ok","build_sha":"development"}`
rather than the tested candidate SHA, so the public deployment cannot be
identified as the candidate. Local production startup without application
configuration returns the candidate SHA, pointing to the deployment build
boundary. Rebuild/redeploy with `BUILD_SHA=2d497e8ff653a2a5df572a26f5464ce745e27533`
and verify `/health` before release.

There is also a non-runtime lint defect: strict `cargo clippy --all-targets
-- -D warnings` fails on the redundant `trim()` before `split_whitespace()` in
`server/src/main.rs:286`. Full evidence is in
`.factory/verification-2.md`.
