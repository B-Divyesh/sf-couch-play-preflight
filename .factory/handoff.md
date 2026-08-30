# Room Ready — independent verification 8 handoff

## Release disposition: **PASS**

Verified candidate: `d8760670701017691e03c3c7f481be485f8ab540`
Verified URL: <https://couch-play-preflight.sociobot.in>

The live `/health` response reports that exact immutable commit and the
production rebuild with the same `BUILD_SHA` emitted the exact JS asset served
live: `index-9mmxaT0E.js`.

## What was verified

- All 17 manifest claim commands were run independently from a clean checkout
  and passed; the unfiltered `npm run test:browser` also passed.
- `npm test`, `npm run lint`, and the production build passed. The first-load
  JS is 20.60 kB gzip; CSS is 5.09 kB gzip.
- Fresh live host → mobile guest → keyboard practice → host-read flow passed.
  The invalid-room recovery, 12-guest boundary, rate limit, privacy traffic,
  service worker/offline regression, keyboard skip link/focus, reduced motion,
  desktop and 390px layout, headers, caching, and metadata were checked.
- Live rate limit was observed at a 40-request burst allowance: 55 quick
  requests returned 41× `200` and 14× `429`, with `Retry-After: 1` on 429.
- Live axe WCAG 2 A/AA scans found no serious or critical issues.

## How to verify

```sh
npm ci
npm test
npm run lint
BUILD_SHA=d8760670701017691e03c3c7f481be485f8ab540 npm run build
npm run test:browser
```

Then visit `/`, `/demo`, `/privacy`, and `/terms`. Full evidence is in
`.factory/verification-8.md`.

## Known gap

The verifier container has no `docker` executable, so Docker image construction
was not run locally. The container's exact source identity was nevertheless
confirmed through the live backend and production asset hash.
