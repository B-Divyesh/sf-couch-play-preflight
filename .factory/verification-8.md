# Independent verification 8 — PASS

Date: 2026-08-30 UTC
Work order: `couch-play-preflight-verify-8`
Candidate: `d8760670701017691e03c3c7f481be485f8ab540`
Live URL: <https://couch-play-preflight.sociobot.in>

## Decision

**PASS.** The live backend identifies exactly as candidate
`d8760670701017691e03c3c7f481be485f8ab540`; the locally rebuilt production
entry asset is also exactly the asset served live (`index-9mmxaT0E.js`). The
earlier deployment-only create/read failure did not reproduce in fresh browser
or API evidence.

## Mandatory claims and first-read gate

`.factory/claims.json` exists with 17 entries. From the clean checkout, after
`npm ci`, I executed every exact `test` command in manifest order against the
shipped demo entry point. All passed:

`demo-isolated`, `sample-guests`, `demo-privacy`, `temporary-rooms`,
`no-account-or-install`, `offline-reload`, `local-room-discovery`, `join-card`,
`guest-capacity`, `capability-checks`, `input-practice`,
`touch-authenticity`, `large-text`, `reduced-motion`, `privacy-no-tracking`,
`game-fit-not-certification`, and `immediate-host-read`.

Cold live first read: “Preflight every device before your guests arrive.” It
plainly identifies hosts of family, classroom, and team games, explains that
phones, controllers, Wi-Fi, and the big screen are checked, and makes **Try it
with sample data** the first action. The action says it opens a ready room with
four sample guests. This satisfies the what / for whom / what to click first
gate. `/demo` showed the persistent “Demo — sample data, nothing is saved”
banner and the four named sample guests.

## Local verification

| Command | Result |
| --- | --- |
| `npm ci` | Passed; 88 packages installed, 0 vulnerabilities reported |
| `npm test` | Passed: 4 Vitest tests and all Rust API tests |
| `npm run lint` | Passed: TypeScript no-emit, Rust format check, Clippy with `-D warnings` |
| `BUILD_SHA=d8760670701017691e03c3c7f481be485f8ab540 npm run build` | Passed; exact live entry asset `index-9mmxaT0E.js` |
| `npm run test:browser` | Passed: restart/persistence, all claims, API boundaries, accessibility, privacy, service-worker update/offline, response policy, desktop, and 390px mobile |

The production bundle measured 56.53 kB JavaScript (20.60 kB gzip) and 18.74
kB CSS (5.09 kB gzip), within the static JavaScript and CSS budgets. Docker is
not installed in this disposable verifier container, so an image build was not
possible here; the source production build and live candidate identity were
verified instead.

## Fresh live product QA

- Created a real room from the homepage, then immediately reached its host
  board. A separate 390px mobile guest joined with Keyboard, completed the
  three-key practice, and the host board/API showed `practice_ok: true` and
  all ready checks. There were no console or page errors.
- Invalid room `ABCD` produced the usable, announced recovery text “Room not
  found or expired.”
- Boundary test: a fresh live room accepted exactly 12 sequential guests; the
  thirteenth returned `409 {"error":"This room already has 12 guests"}`;
  snapshot count was 12. The QA room was deleted afterwards (`204`). The full
  local suite also proves the 24-concurrent-join boundary.
- A 55-request live `/api/rooms/discover` burst from one client produced 41
  `200` and 14 `429`; every sampled 429 included `Retry-After: 1`. This is the
  observed allowance (40-request burst, with one token refilled during the
  short burst) and confirms enforcement.
- Keyboard: first Tab focused “Skip to main content” with a visible 3px gold
  outline; Enter moved focus to `#main`. Reduced-motion context measured the
  primary-action transition as `1e-06s`.
- Playwright axe WCAG 2 A/AA scans on live desktop landing, 390px landing,
  390px demo, and privacy page found **0 serious/critical** findings (0 total).
  Each had one h1, a main landmark, `lang=en`, no horizontal overflow, and no
  console/page errors.

## Privacy, headers, caching, and deployment evidence

- Live `/health` returned
  `{"status":"ok","build_sha":"d8760670701017691e03c3c7f481be485f8ab540"}`.
- Fresh live `/demo` → Reset demo → Start for real → `/privacy` made only
  same-origin static requests, no `/api` request while in demo, no third-party
  request, and left no browser cookies. No console/page errors occurred.
- HTML and API responses include CSP restricted to `self`, `nosniff`,
  `no-referrer`, and `X-Frame-Options: DENY`. The live hashed JS/CSS/image
  responses use `Cache-Control: public, max-age=31536000, immutable`; `sw.js`
  is not immutable. `robots.txt` and `sitemap.xml` are present.

## Defects

None found. Docker-image construction remains untested only because the
provided verifier environment has no `docker` executable; it is not a product
failure and does not contradict the verified live build identity.
