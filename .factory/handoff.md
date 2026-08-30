# Room Ready — repair 5 handoff

## Release disposition: **REPAIRED AND DEPLOYED**

The release-blocking findings in independent verification 4
([`.factory/verification-4.md`](verification-4.md)) are repaired and the
obtainable source revision `2e8d0838dbeb409678f9625bb91f4219d680ce16` is live
at <https://couch-play-preflight.sociobot.in>.

## What changed

| Finding | Repair and regression coverage |
| --- | --- |
| `POST /api/rooms` could be followed by an immediate 404 host read | Reproduced before repair by posting to a release server using one local SQLite file, then reading from an otherwise identical server using a second local SQLite file: POST returned 200; immediate GET returned 404. This was the same isolated-replica boundary described by the verifier. The deployment now has exactly one always-on SQLite writer (`minReplicas=1`, `maxReplicas=1`). The server uses one pooled connection, a 30-second busy timeout, WAL, and FULL synchronous commits. Rust regression `room_created_by_one_connection_is_immediately_readable_by_another` covers two independent pools on the configured file. Browser regression makes POST and the next GET with independent `Connection: close` requests and requires 200 plus the same room code. |
| Missing claims manifest | Added [`.factory/claims.json`](claims.json), with six visitor-facing claims and exact tagged browser regressions for isolated demo data, four sample guests, demo privacy, six-hour expiry, no-account/no-install start, and offline reload. |
| No isolated one-click demo | Added `/demo` and `?demo=1`. The landing page leads with **Try it with sample data**. The demo opens a populated four-guest family picture-quiz room without calling `/api`, writes only `demo:room-ready` session storage, has a persistent **Demo — sample data, nothing is saved** banner, Reset demo, and Start for real cleanup. [`.factory/demo.md`](demo.md) documents the fixture and namespace. |
| First screen did not explain the job, user, and first action | The homepage now says “Preflight every device before your guests arrive,” names family/classroom/team hosts in the supporting sentence, makes the sample action primary, and gives three short facts. [`.factory/copy-audit.md`](copy-audit.md) records word counts and terminology. |
| Service-worker updates were not demonstrable | The build derives the worker cache name from emitted asset contents. Browser coverage installs one version, changes the served worker fixture, proves stale-cache deletion and new-cache creation, then reloads offline in its own browser context. |
| Container could not include the worker-version build script | Docker now copies `scripts/` into the web build stage. The successful ACR build uses a `.git`-free archive, embeds the supplied source SHA, and verifies the release binary reports that SHA. The runtime image now needs no application configuration beyond `PORT`; it automatically chooses `/data` and `/app/dist` in the container. |

## Verification evidence

All local checks began after `npm ci`: 88 packages installed, 89 audited, zero
vulnerabilities.

- `npm run lint`: passed TypeScript no-emit and locked strict Clippy
  (`--all-targets -D warnings`).
- `npm test`: passed 3 Vitest tests and 7 Rust tests, including the renamed
  two-connection immediate-room-read regression and 24 parallel joins.
- `npm run build`: produced `dist/`. Initial JS is 51.91 KB (19.26 KB gzip);
  CSS is 17.28 KB (4.88 KB gzip); the mobile hero is 35.8 KB. No font payload
  ships.
- `npm run test:browser`: passed the independent POST→GET persistence check,
  all claims/demo checks, 24-way capacity check, forwarded-IP rate policy,
  host plus keyboard guest rehearsal, security headers, immutable assets,
  desktop and 390px axe scans, privacy request capture, service-worker update,
  and offline reload. Axe found zero WCAG 2 A/AA violations on `/`, `/demo`,
  `/privacy`, `/terms`, populated host, and 390px home screens.
- `/opt/fleet/lib/verify-url.sh http://127.0.0.1:18082 <evidence-dir>`:
  passed with a 613 ms load, zero console errors, `lang=en`, one h1, a main
  landmark, complete image alt text, and labeled buttons. The standalone
  `@axe-core/cli` could not locate a system Chrome binary in this worker; the
  equivalent Playwright axe integration above ran against the installed
  Playwright Chromium.
- Lighthouse 13 mobile (local production server): Performance 99,
  Accessibility 100, Best Practices 100, SEO 100; FCP 1.4 s, LCP 1.6 s,
  TBT 30 ms, CLS 0. Desktop was 100/100/96/92 with LCP 0.4 s.
- Package/consumer testing is not applicable: this is a deployed web product,
  not a package.

## Deployment evidence

- ACR run `ch1de` built
  `sociobotregistry.azurecr.io/sf-couch-play-preflight:2e8d0838dbeb` from the
  source archive without `.git`; digest:
  `sha256:ab92ab49900f5d114b15ad0a555c6bea8d987c169f8151b960d9d7c46084b45d`.
- Azure Container App revision `sf-couch-play-preflight--0000021` is healthy,
  uses that image, and is locked to `minReplicas=1`, `maxReplicas=1` with only
  `PORT=8080` configured.
- Live `GET /health` returned 200 with the exact embedded source identity
  `2e8d0838dbeb409678f9625bb91f4219d680ce16`.
- Live HTTP/1.1 `Connection: close` probe: one create followed by 20
  independent room reads returned **20 HTTP 200 / 0 non-200**; authorized
  close returned 204.
- Live 100-request forwarded-client rate probe returned 93 normal 404s and 7
  HTTP 429s; a captured limited response included `Retry-After: 1`.
- A fresh live Playwright desktop host created a room, immediately read the
  same code (200), then closed it (204). A 390×844 reduced-motion `/demo`
  visit had a visible first-focus skip link, `scrollWidth = 390`, transition
  duration `1e-06s`, zero console errors, and zero third-party requests.
- Live home and hashed asset responses send CSP, `nosniff`, `no-referrer`,
  `DENY` framing, no cookie, and immutable cache policy for hashed assets.

## Run and verify

```sh
npm ci
npm run lint
npm test
npm run build
npm run test:browser
```

For a local container-equivalent run, build the image with `BUILD_SHA` and
start it with just `PORT=8080`; it discovers `/data/room-ready.db` and
`/app/dist` in the runtime image. Verify the live build identity with:

```sh
curl https://couch-play-preflight.sociobot.in/health
```

## Known limit / next step

The deployed SQLite file is coherent for all requests because the service is
deliberately one always-on writer. It is not a shared database and could be
lost if Azure replaces that container. Move temporary rooms to PostgreSQL
before allowing more than one replica or promising restart durability; do not
put SQLite on Azure Files/SMB because its locking is unsuitable. The app does
not claim TV, casting, or untested-game compatibility; the host confirms the
display and chosen input mix.
