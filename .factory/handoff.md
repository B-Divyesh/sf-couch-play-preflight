# Room Ready — repair handoff

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
