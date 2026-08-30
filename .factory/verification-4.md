# Room Ready — independent verification 4

Date: 2026-08-30  
Requested candidate: `03d3cb9a001fb0438dd97482d938232e3e798ce8`  
Live URL: <https://couch-play-preflight.sociobot.in>

## Release disposition: **FAIL**

The requested candidate cannot be verified or released. It is not a commit in
the supplied clean checkout or the configured `origin` remote: `git fetch
origin 03d3cb9a001fb0438dd97482d938232e3e798ce8` returned `not our ref` and
`git cat-file -e` confirms it is absent. The remote `main`, clean checkout,
and live `GET /health` instead identify
`03d3cb3bb52303812876778b8c133413ebdf34f8`. Therefore the deployed product
does not match the candidate named in this work order.

It also has independent acceptance failures on the currently live revision.

## Mandatory claims and demo gate — failed before product testing

- `.factory/claims.json` is **missing**. There were consequently no declared
  claim commands to run. Per the claims contract, a missing manifest is a
  release-blocking failure.
- `.factory/demo.md` is **missing**.
- The live cold first screen has headline “Everyone ready before game time,”
  explains device checks only in the following paragraph, does not say that
  it is for hosts, and offers “Open a test room,” not the required visible
  “Try it with sample data” action. It does not answer the required what / for
  whom / first click set in plain words.
- `/demo` returns the normal landing screen. It has no sample-data action,
  “Demo — sample data, nothing is saved” banner, Reset demo, or Start for
  real control. No isolated demo namespace or sample fixture is documented.

These facts alone require FAIL.

## Live deployment evidence

### Critical: a newly created room is immediately unavailable

This was reproduced in a fresh Playwright context at the live URL:

1. `POST /api/rooms` returned **200** and a valid four-letter code (`NVDS`; the
   ephemeral authorization token is deliberately omitted here).
2. The application persisted that host token in its tab session storage and
   navigated to `/host?room=NVDS`.
3. Its immediate `GET /api/rooms/NVDS` returned **404** with `Room not found
   or expired`; the rendered screen said “We couldn’t find this room.”

An earlier independent browser repetition had the same result for `HTZK`.
This prevents the host from doing the product's main job. It is consistent
with requests being routed across more than one isolated local-SQLite
instance; regardless of root cause, persistence is not reliable across the
live request boundary. Do not release until a create is readable by every
subsequent request (and an actual host/guest flow passes on the deployment).

### API boundary probes

On a separate same-path API probe, create, one valid keyboard join, snapshot,
and close produced 200/200/200/204; the snapshot had one player. Blank name,
unsupported input, overlong name, and malformed room code returned 400. A
24-way join burst after one existing guest returned 11 successful joins and
13 409 responses; the snapshot contained exactly 12 players. It was closed
and then returned 404. This confirms the capacity boundary on that path, but
does not mitigate the cross-request room-loss failure above.

The documented server rate policy was enforced: 50 same-forwarded-client
requests observed 42 normal 404 responses and 8 **429** responses; every 429
had `Retry-After: 1`. The observed initial allowance was 42 responses during
this burst (the configured limiter refills while a burst is being processed).

`GET /health` returned 200 and
`build_sha=03d3cb3bb52303812876778b8c133413ebdf34f8`, not the requested
candidate.

## Local clean-checkout evidence (available revision `03d3cb3…` only)

After `npm ci` (88 packages; audit reported zero vulnerabilities):

| Check | Result |
| --- | --- |
| `npm test` | PASS — 3 Vitest tests and 7 Rust tests |
| `npm run lint` | PASS — TypeScript no-emit and strict locked Clippy |
| `npm run build` | PASS — `dist/` produced |
| release Rust build | PASS — `cargo build --locked --release --manifest-path server/Cargo.toml` |
| `npm run test:browser` | PASS — local release server capacity, rate, host/guest, axe, privacy, offline and 390px smoke |

Built payloads: initial JavaScript 48,465 B (18,420 B gzip), CSS 15,644 B
(4,550 B gzip), and mobile hero 35,782 B. These are within the stated static
budgets. The exact Docker production build could not be executed because this
verification environment has no `docker` executable.

## Live browser / privacy / accessibility evidence

- Cold-load request capture contained only the product origin: HTML, its
  JavaScript, CSS, and self-hosted hero image. It set no cookies and had zero
  console or page errors on that cold load.
- The current service worker took control and an offline reload displayed the
  documented offline notice with no page error. A true update across a newly
  deployed service-worker version was not observable without changing the
  deployment.
- At 390×844, document `scrollWidth` equalled 390. With reduced motion,
  primary-control transition duration was `1e-06s`. The first Tab focused the
  visible skip link with a `3px` outline.
- Axe found zero serious or critical WCAG 2 A/AA findings on `/`, `/privacy`,
  and `/terms`; each had one `h1`.
- Live responses sent CSP, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, and `X-Frame-Options: DENY`; the HTML
  response sent no explicit `Cache-Control` value and the hashed JS used
  `public, max-age=31536000, immutable`.

## Findings by severity

| Severity | Finding | Required resolution |
| --- | --- | --- |
| Critical | Requested commit is absent and live reports a different SHA. | Supply/fetch the actual immutable candidate, deploy it, and verify `/health` exactly matches it. |
| Critical | Live `POST /api/rooms` then immediate `GET /api/rooms/:code` can return 404. | Use shared durable storage or guaranteed single-instance routing; add a deployed regression that creates then reads across independent connections/instances. |
| Critical | `.factory/claims.json` is missing. | Add every user-reliant claim and one independent clean-demo test tagged for each. |
| High | No required one-click sample-data demo or demo documentation/isolation. | Implement `/demo` or `?demo=1` with realistic sample data, banner, reset/start-real controls, separate storage, and `.factory/demo.md`. |
| High | First screen fails the plain-words gate. | State the host situation and job in the headline/subheading and make “Try it with sample data” the first primary action. |
| Medium | Service-worker update across a release was not independently demonstrable. | Add a versioned update regression that proves stale cache cleanup and offline reload after upgrade. |

## Re-run

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:browser
```

After deploying the real candidate, first confirm `GET /health` is the exact
candidate SHA, then repeat the create → immediate host read/browser host flow,
the claims manifest commands from a fresh demo context, and the rate probe.
