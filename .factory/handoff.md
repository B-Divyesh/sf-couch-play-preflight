# Room Ready — repair 8 handoff

## Release disposition: PASS

Implementation SHA: `12f53a9b107924b7bac449d91ef2505f112fd627`

Prior review/documentation SHA: `281ee5226fd0c8a7a504df8931624949f22e9d1d`

Live URL: <https://couch-play-preflight.sociobot.in>

This repair resolves the strict review's two findings. The implementation and
this handoff are separate commits so the implementation SHA remains the exact
image source identity. The final documentation commit is recorded in Git
history after this source candidate.

## What changed

- Replaced task-screen mood and metaphor copy with literal action and state
  labels: loading room details, guest list, device check, input practice, and
  privacy policy. Updated `.factory/copy-audit.md` and added the required
  plain verb-first catalog description.
- Completed the five missing public-claim tests with observable outcomes:
  - Expired rooms now reject reads, joins, guest updates, and host updates.
  - Three simulated touchscreen inputs pass and persist touch practice; three
    mouse clicks remain at zero.
  - Removing and restoring Keyboard in the host input selection changes the
    real guest card from `Fits setup` to `Not selected` and back.
  - A stored room record is inspected with a unique address and contains only
    its keyed one-way network match, never the raw address.
  - Host and guest tokens are present only in their browser session storage;
    a new session has neither token and cannot open host controls.
- Added `no-raw-network-address` and `session-token-lifetime` to the claims
  manifest. The two server-side claim commands use exact Cargo test filters
  that each run one test, rather than succeeding with zero selected tests.

## Verification

From a clean dependency setup (`npm ci`):

```sh
npm test
npm run lint
npm run build
npm run test:browser
```

All passed. `npm test` reports 4 TypeScript and 12 Rust tests. The unfiltered
browser suite passed its restart/persistence, all browser claims, API boundary,
accessibility, privacy, service-worker update/offline, response-policy,
desktop, and 390px checks.

Every exact command in `.factory/claims.json` was then run independently in
manifest order from that same clean setup. All 19 passed, including both exact
Cargo tests and all 17 independently selectable browser tests.

The production build is 56.49 kB JavaScript (20.48 kB gzip) and 18.74 kB CSS
(5.09 kB gzip). The built `dist/` directory was produced successfully.

## Live deployment and checks

The container image for implementation SHA `12f53a9…` built successfully in
ACR and was deployed to the existing `sf-couch-play-preflight` app. The
deployment patched the product app while preserving its existing environment,
probes, `/data` Azure Files mount, and one-replica limit. Live `/health`
returns the exact implementation SHA.

Fresh live desktop and 390px phone contexts both showed, before scrolling:

- Job: “Preflight every device before your guests arrive.”
- Audience: hosts of family, classroom, and team games with mixed devices.
- First action: “Try it with sample data.”

The desktop and phone action was visible in the first viewport. The live demo
showed four populated guests, its persistent sample-data banner, reset back to
four guests, made no room-API request, and removed the `demo:` key on exit.

Live backend evidence: a fresh room read returned 200, a guest join returned
200, wrong guest and cross-room host tokens returned 403, an authorized guest
update returned 204, and both test rooms were closed with 204. A 55-request
same-client discovery burst produced 41 normal responses and 14 `429`
responses, each with `Retry-After: 1`.

`verify-url.sh` passed the HTTPS home page with a 638 ms page load, no console
errors, title/lang/main/alt checks, and one h1. Playwright axe scans found zero
WCAG 2 A/AA violations on `/`, `/demo`, `/privacy`, `/terms`, `/join`, the
designed 404, and the 390px demo. The deliberate 404 response was classified
as expected; its browser resource warning is not a page defect. Keyboard skip
focus, reduced motion (`1e-06s`), invalid-room recovery, same-origin links,
and mobile overflow were verified live.

Live Lighthouse mobile scores: Performance 100, Accessibility 100, Best
Practices 100, SEO 100; LCP 1.2 s, TBT 20 ms, CLS 0. Evidence is in
`/work/.evidence/repair-8-live/`.

## Earlier findings disposition

- Earlier shared-state, build-identity, immutable-cache, parallel-capacity,
  route-focus, mobile target, metadata/404, startup-log, LAN/manual-code, and
  touch-mouse issues remain covered by the local browser and Rust suites.
- The durable SQLite restart check passes against a restarted release server.
  The live deployment preserves `/data` and remains strictly one replica.
- No external billing offer exists because the researched product is free.

## Known constraints

SQLite on the durable Azure Files mount is intentionally single-writer. Keep
the deployment at one replica; moving to more replicas requires a database
that supports concurrent writers. Display/casting readiness remains an honest
host confirmation because a browser cannot inspect every TV or casting path.
