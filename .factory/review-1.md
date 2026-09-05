# Preflight game devices before guests arrive — strict review 1

Date: 2026-09-05 UTC

Work order: `couch-play-preflight-review-1`

Implementation reviewed: `d8760670701017691e03c3c7f481be485f8ab540`

Documentation baseline: `c28f2c187b8c683af14e25186e80bc2b6f9b1056`

Live URL: <https://couch-play-preflight.sociobot.in>

## Verdict: **FAIL**

The core live product works, and every declared claim command exits successfully.
The strict review still has **2 findings** and **5 untested or incompletely tested
public claims**. The claims contract makes either condition release-blocking.

No product code was changed.

## First screen before scrolling

Fresh 1440×900 desktop and independent 390×844 phone contexts opened at the
top of the live page.

- **Job:** “Preflight every device before your guests arrive.”
- **Audience:** hosts of family, classroom, and team games using phones,
  controllers, Wi-Fi, and a shared screen.
- **First action:** “Try it with sample data,” followed by “See a ready room
  with four sample guests.”
- **Page title:** “Room Ready — check game devices before guests arrive.”

The job, audience, first action, and job-naming title pass. The sample action
is visible without scrolling in both viewports.

## Findings

### High — five public claims lack a complete claim test

All 17 commands in `.factory/claims.json` ran independently and passed, but
passing commands are not sufficient when their assertions do not prove the
published promise. The following five claims remain untested under the
attached claims contract:

| Public claim | Gap |
| --- | --- |
| “Rooms expire after six hours” | `@claim:temporary-rooms` checks only the returned `expires_at` timestamp. It never advances time or proves that reads, joins, and updates are rejected after expiry. |
| “Touch practice accepts touch input, not mouse clicks” | `@claim:touch-authenticity` proves only that three mouse clicks do not count. It never sends touch input or asserts that three touches pass and reach the host. A separate live review probe showed the feature works, but the declared claim test remains incomplete. |
| “Room Ready compares the host-selected input mix” | `@claim:game-fit-not-certification` checks only that disclaimer text exists. It never changes the accepted inputs or asserts the resulting “Fits setup” and “Not selected” outcomes. |
| “The room record does not store the raw [network] address” | This privacy-page claim has no entry in `.factory/claims.json` and no sandbox test that inspects stored room data. |
| “Host and guest tokens live in session storage and disappear when the browser session ends” | This privacy-page claim has no entry in `.factory/claims.json`. The demo isolation test covers only the `demo:` key and does not prove real host/guest token lifetime. |

Required resolution: add independently selectable observable tests for these
claims, or narrow/remove the public wording. The existing commands must keep
their one-command-per-claim behavior.

### Medium — task screens still use metaphor and mood copy

The first-screen headline is plain, but the live product still uses cinematic
labels where the contract requires direct task language. Current examples
include “Set the room while it’s still quiet,” “One room, three signals,”
“Check your seat,” “Your seat check,” “Guest bench,” “The bench is empty,” and
the loading h1 “Bringing up the room lights…”. These phrases do not name the
action or state directly. `.factory/copy-audit.md` marks them as passing based
on length and banned-word checks, so that audit does not enforce the no-metaphor
and no-mood-heading rule.

Required resolution: replace them with literal setup, guest, check, loading,
and empty-state language; then update the copy audit.

## Declared claim command results

A detached clean checkout at the implementation commit was created. `npm ci`
installed 88 packages from the lockfile and reported zero vulnerabilities.
Every exact manifest command then passed independently, in file order:

`demo-isolated`, `sample-guests`, `demo-privacy`, `temporary-rooms`,
`no-account-or-install`, `offline-reload`, `local-room-discovery`, `join-card`,
`guest-capacity`, `capability-checks`, `input-practice`,
`touch-authenticity`, `large-text`, `reduced-motion`,
`privacy-no-tracking`, `game-fit-not-certification`, and
`immediate-host-read`.

This is command-pass evidence only. The five semantic coverage gaps above are
why the untested-claim count is not zero.

## Local candidate verification

| Command | Result |
| --- | --- |
| `npm test` | PASS — 4 Vitest tests and 10 Rust tests |
| `npm run lint` | PASS — TypeScript, Rust format, and Clippy `-D warnings` |
| `BUILD_SHA=d876067… npm run build` | PASS — `dist/` produced |
| `npm run test:browser` | PASS — all claims plus complete browser/API/accessibility/privacy/offline/update/startup suite |

The full browser command also passed durable SQLite stop/start persistence,
fresh-connection reads, post-restart joining, rate limiting after restart,
port-only startup logging, 24-way concurrent capacity, service-worker cache
replacement, 200% text, and route-focus checks. Each of the 17 claim commands
also runs the durable restart precheck, so restart persistence passed 18 times
in this clean checkout.

The candidate bundle is 56,534 bytes of JavaScript (20.59 kB gzip) and 18,740
bytes of CSS (5.09 kB gzip). The mobile hero is 35,782 bytes. These are within
the stated budgets.

## Fresh live functional evidence

- `/health` returned the exact implementation SHA. A candidate rebuild emitted
  `index-9mmxaT0E.js`; its SHA-256 exactly matched the live asset:
  `373d89319cdcc3b38d030c664f6ed72367932026d1f2f4e573c2314ec5dafd63`.
- A desktop host opened a real room, and a separate fresh phone context found
  it through same-network discovery. The phone joined as a keyboard guest,
  completed three inputs, and the host saved display readiness. The board
  reached “The room is ready,” and the API retained `practice_ok=true`.
  The review room was closed.
- A separate touch-enabled phone probe completed three real touch taps and
  persisted the passing practice result. Its review room was closed.
- Eight more fresh rooms produced 40/40 successful cross-connection reads
  before cleanup. The earlier alternating live 404 defect did not reproduce.
- A boundary room accepted exactly 12 sequential guests; the thirteenth
  returned 409 and the snapshot contained 12. Cross-room host authorization
  and an invalid guest token returned 403.
- Malformed code, blank name, unsupported input, 61-character label, no
  selected inputs, and a 17 kB body returned 400, 400, 400, 400, 400, and 413.
  A closed room returned the expected 404. The browser showed an announced,
  enabled retry path for that expected missing-room response.
- A 55-request discovery burst returned 41×200 and 14×429. Every 429 carried
  `Retry-After: 1`.

## Demo, privacy, accessibility, routes, and performance

- One click opened `/demo` with the persistent “Demo — sample data, nothing
  is saved” banner, the named sample guests Mina, Tom, Ari, and Jo, a family
  picture quiz, and “The room is ready.” Reset restored the fixture. Start for
  real removed the `demo:` key. The flow made no API or third-party request
  and created no host or guest key.
- Home, demo, privacy, terms, join, populated host, populated guest, and the
  deliberate 404 route had one h1, a main landmark, route-specific title, and
  zero axe WCAG A/AA violations. The 404 response status was correctly 404 and
  its designed page included a return link.
- The first Tab reached the skip link with a 3 px gold outline; Enter focused
  `main`. SPA navigation focused and announced the destination h1. Browser Back
  returned focus to the home h1 at scroll position zero.
- At 390 px there was no horizontal overflow, all effective touch targets were
  at least 44 px, large text persisted without overflow, and reduced motion
  measured `1e-06s`. Normal paths had no console or page errors. Expected 404
  network messages were classified as deliberate test responses, not defects.
- The live demo reloaded while offline under service-worker control and kept
  both the sample banner and offline notice. The clean local suite proved stale
  service-worker cache removal during an update.
- Privacy traffic stayed same-origin, no cookie was set, and no contact or
  account input appeared. HTML and API responses supplied CSP, `nosniff`,
  `no-referrer`, and denied framing. Hashed assets were immutable-cached;
  HTML and `sw.js` were not.
- `robots.txt`, `sitemap.xml`, canonical metadata, Open Graph/Twitter metadata,
  favicon, apple-touch icon, legal pages, internal links, and per-route titles
  passed. All crawled product links returned 200.
- Fresh Lighthouse mobile scores were Performance 100, Accessibility 100,
  Best Practices 100, and SEO 100. FCP and LCP were 1.1 s, TBT was 0 ms, and
  CLS was 0.

Evidence screenshots, the factory URL check, and Lighthouse JSON are under
`/work/.evidence/review-1-live/`.

## Earlier finding disposition

| Earlier issue | Current disposition |
| --- | --- |
| Split live SQLite state / immediate create-read 404 | Resolved in current evidence: real host/guest flow passed and 40/40 cross-connection reads succeeded. |
| Wrong or fallback build identity | Resolved: exact candidate SHA and matching live asset hash. |
| Missing immutable asset caching | Resolved: hashed JS/CSS/image responses are immutable; HTML and worker are not. |
| Strict Clippy and formatting failures | Resolved: current lint command passed. |
| Concurrent room capacity exceeded 12 | Resolved: Rust parallel test passed; live room stopped at 12 with 409. |
| Missing claims manifest and demo | Resolved structurally: 17 selectable commands and isolated one-click demo exist. Semantic claim coverage remains the new High finding above. |
| Flaky sample command / filters ignored | Resolved: all exact commands passed independently and `--grep` selects one claim. |
| Mouse clicks falsely passed touch practice | Resolved: the negative claim command passed; a separate live positive touch probe also passed. |
| LAN discovery absent | Resolved: same-network discovery and manual fallback passed; different-network behavior is covered by the Rust suite. |
| Skip/route focus and undersized mobile targets | Resolved in fresh live checks. |
| Missing 404, route metadata, sitemap demo route, and footer build | Resolved in fresh live checks. |
| Missing startup configuration log | Resolved by the port-only startup test. |
| Service-worker update not demonstrated | Resolved by the clean local update regression; live offline reload also passed. |

## Scope and limitation

Tenant accounts do not exist in this product; room-level bearer isolation was
checked instead. Live infrastructure was not restarted during this read-only
review. The clean candidate restart harness proved SQLite persistence across a
graceful process stop and restart. Docker and Podman are unavailable in this
container, so image construction could not be rerun locally. This does not
change the **FAIL** verdict, which is based on the two findings above.
