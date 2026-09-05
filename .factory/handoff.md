# Room Ready — strict review 1 handoff

## Release disposition: **FAIL**

Implementation reviewed: `d8760670701017691e03c3c7f481be485f8ab540`

Documentation baseline: `c28f2c187b8c683af14e25186e80bc2b6f9b1056`

Live URL: <https://couch-play-preflight.sociobot.in>

The product's core live flow, candidate identity, local gates, accessibility,
privacy traffic, offline behavior, persistence, and backend boundaries passed.
Release remains blocked by **2 findings** and **5 untested or incompletely
tested public claims**.

## Findings to repair

1. Add or correct claim tests for actual six-hour expiry, positive touch
   practice, input-mix comparison outcomes, raw-network-address storage, and
   real host/guest session-token lifetime.
2. Replace metaphor and mood copy such as “Your seat check,” “Guest bench,”
   “Bringing up the room lights…,” and “One room, three signals” with literal
   task and state labels. Update `.factory/copy-audit.md` accordingly.

Full evidence and required wording are in [`.factory/review-1.md`](review-1.md).

## What passed

- All 17 exact manifest commands passed independently from a clean detached
  checkout, and the unfiltered browser suite passed.
- `npm test`, `npm run lint`, and the candidate production build passed.
- Live `/health` reports the exact candidate SHA, and the rebuilt entry asset
  hash matches live.
- Fresh desktop host → phone guest → practice → host-ready, live touch
  practice, 40/40 cross-connection reads, 12-guest capacity, invalid recovery,
  token isolation, and 41×200 / 14×429 rate limiting passed.
- Demo isolation/reset/exit, privacy traffic, legal and 404 routes, keyboard
  focus/back behavior, reduced motion, 390 px and large-text layout, offline
  reload, headers, metadata, links, and zero-violation axe scans passed.
- Fresh Lighthouse mobile scores were 100 in all four measured categories;
  LCP was 1.1 s, TBT 0 ms, and CLS 0.

## Reproduce

```sh
npm ci
npm test
npm run lint
BUILD_SHA=d8760670701017691e03c3c7f481be485f8ab540 npm run build
npm run test:browser
```

Then run each exact command in `.factory/claims.json` independently and review
the five coverage gaps listed in `.factory/review-1.md`.

## Limitation

Docker and Podman are unavailable in this verifier container, so image
construction was not rerun. No product code, deployment, infrastructure, DNS,
or billing state was changed.
