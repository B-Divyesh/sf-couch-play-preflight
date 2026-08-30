# Room Ready — repair 6 handoff

## Release disposition: repaired and deployed

All release-blocking findings in
[`verification-5.md`](verification-5.md) for candidate `d3e4338` are repaired.
The application remains a Vite/TypeScript frontend and Rust/axum/SQLite
backend in one container. The researched brief and existing passing behavior
were preserved.

## Repairs and exact regressions

| Verifier finding | Root-cause repair | Regression evidence |
| --- | --- | --- |
| Live create → immediate host read failed in 8/8 sessions | The live Container App had drifted to `maxReplicas=3`, so private SQLite state could be split across replicas. Deployment is now fixed at one always-on replica. The host also retries a transient initial 404 before showing a terminal error. | Rust uses two independent pools on one file. Browser/API QA uses independent connections. `@claim:immediate-host-read` forces the first GET to return 404 and proves the host board recovers. The live flow passed 8/8 fresh contexts. |
| Claim commands were monolithic and one reload was flaky | The browser runner now parses `--grep @claim:<id>` and maps every claim to one independent test. Offline coverage owns and closes its own browser context and uses a controlled service worker before going offline. | All 17 exact commands in `.factory/claims.json` passed separately, in file order. The aggregate run also passed all 17. |
| Visitor claims were missing from the manifest | Claims now cover demo isolation/sample/privacy, expiry, account/install, offline reload, network discovery/manual fallback, QR/TV/print card, 12-guest capacity, measured checks, practice, touch authenticity, large text, reduced motion, privacy, honest game-fit wording, and immediate host opening. | `.factory/claims.json` has 17 unique IDs and 17 matching selectors in `frontend/e2e/smoke.mjs`. |
| Mouse clicks could certify touch | Touch rehearsal now accepts only pointer events whose `pointerType` is `touch`; it never upgrades a failed touch capability from mouse input. | Unit test `does not treat mouse input as touch practice`; `@claim:touch-authenticity` clicks three times in desktop Chromium and remains at `0 of 3`. |
| No LAN/local-session discovery | Hosts can opt into same-network discovery. The server stores only a keyed one-way network match, groups IPv6 by `/64`, and returns up to eight unexpired opted-in rooms. The four-letter code and QR remain fallbacks. Guest readiness now checks the host/guest gateway match, with an honest VPN/mobile-network caveat. | Rust `discovery_and_network_check_match_only_the_host_network`; `@claim:local-room-discovery`; complete QA asserts same and different forwarded clients. A live guest found the newly opened room without its code. |
| Skip link and SPA route focus stayed on `BODY` | The skip link explicitly focuses `main`. SPA navigation focuses the new `h1` and updates a polite route announcement after rendering, including async host routes. | Browser QA asserts first Tab → skip link, Enter → `main`, SPA Demo navigation → `h1`, and announcement text. |
| Mobile targets were below 44×44 | Header, navigation, large-text, and footer links now have 44px minimum targets. | Browser QA measures every visible home-page link/button at 390×844 and rejects targets below 44px. |
| 404 and metadata structure were incomplete | Known SPA routes return 200 while unknown routes return HTTP 404 and render a designed not-found view. Added route-aware title/description/canonical metadata, Open Graph/Twitter card, apple-touch icon, `/demo` sitemap entry, and footer build identity. | Rust routing test plus browser response-policy, metadata, one-h1, axe, and 404 checks. |
| Port-only startup hid configuration status | The default tracing filter is now `info`. Startup logs database config, generated/loaded network-key config, and storage topology without secret values. | Complete browser QA launches the release binary from an empty directory with only `PATH` and `PORT`, checks `/health`, and asserts `defaulted`/`generated` startup fields. |
| Rust format check failed | `server/build.rs` and `server/src/main.rs` are formatted. `npm run lint` now includes `cargo fmt --check`. | `npm run lint` passes TypeScript, formatting, and locked strict Clippy. |

## Clean local verification

The final local matrix began with `npm ci`: 88 packages installed, 89 audited,
and zero vulnerabilities.

- `npm test`: 4 Vitest tests and 8 Rust tests passed.
- `npm run lint`: TypeScript no-emit, `cargo fmt --check`, and locked Clippy
  with `-D warnings` passed.
- `npm run build`: produced `dist/`; initial JS is 56.51 KB (20.57 KB gzip),
  CSS is 18.74 KB (5.09 KB gzip), and no font payload ships.
- Every exact command in `.factory/claims.json`: 17/17 passed independently.
- `npm run test:browser`: all claims plus API boundaries, independent
  POST→GET, forwarded-IP rate limiting, JSON response policy, headers, route
  focus, axe, privacy, service-worker update/offline, 200% text, desktop, and
  390px mobile passed.
- `/opt/fleet/lib/verify-url.sh http://127.0.0.1:18083 <evidence-dir>`:
  599 ms load, zero console errors, correct title/lang, one h1, main landmark,
  complete alt text, and labeled buttons.
- Playwright axe 4.13 found zero WCAG 2 A/AA violations on `/`, `/demo`,
  `/privacy`, `/terms`, `/join`, the designed 404, and 390px home.
- Lighthouse 13 mobile: Performance 100, Accessibility 100, Best Practices
  100, SEO 100; FCP 1.1 s, LCP 1.3 s, TBT 10 ms, CLS 0.
- Package/consumer checks are not applicable to this deployed web product.
  The ACR build is the container-consumer check.

## Deployment and live evidence

Repair source commit `986c1fc1f489925f79682f784d17df35edfe9f55` was
built from a 313 KB Git archive with no `.git` directory. ACR run `ch1fm`
published:

```text
sociobotregistry.azurecr.io/sf-couch-play-preflight:986c1fc1f489
sha256:c203254949f8c32d304c8e4546dd31a34e195db6bc98856e4f61902cd63c8f4f
```

Azure Container App revision `sf-couch-play-preflight--0000023` became healthy
with 100% traffic, `minReplicas=1`, `maxReplicas=1`, and only `PORT=8080`.
The final handoff-only commit is rebuilt and deployed with the same application
bits so live `/health` identifies the repository HEAD.

Live checks at <https://couch-play-preflight.sociobot.in>:

- `/health` reported the deployed build SHA.
- Eight fresh host contexts created and immediately read rooms `CJBK`, `NDVR`,
  `PESQ`, `RHYB`, `ZFTJ`, `ETCE`, `BKXP`, and `GGKK`: every sequence was
  `POST 200 → GET 200 → DELETE 204`.
- A fresh host opened `ZVTF`; a separate 390×844 guest page discovered it on
  the same network. The page had `scrollWidth=390`, first Tab focused the skip
  link, Enter focused `main`, and no third-party request occurred.
- A 100-request forwarded-client burst returned 43 normal 404 responses and
  57 HTTP 429 responses. Every 429 carried `Retry-After: 1`.
- Unknown page and API routes returned 404; the API response was JSON.
- Home sent the required CSP, `nosniff`, `no-referrer`, and frame denial, with
  no cookie. Canonical, Open Graph, Twitter, apple-touch, and `/demo` sitemap
  metadata were present.
- `/opt/fleet/lib/verify-url.sh` against the live URL passed in 585 ms with
  zero console errors and all structural accessibility checks green.

## Run and verify

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:browser
jq -r '.[].test' .factory/claims.json
curl https://couch-play-preflight.sociobot.in/health
```

## Known limits

- Same-network matching compares the public IPv4 gateway or IPv6 `/64`.
  VPNs, carrier NAT, and privacy relays can produce a false mismatch or match;
  the UI says this and keeps QR/manual-code joining available.
- SQLite remains intentionally single-replica and does not promise room
  survival through container replacement. Rooms are temporary by contract.
  Move to PostgreSQL before horizontal scaling or restart durability is needed.
