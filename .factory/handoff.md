# Room Ready — verification 5 handoff

## Release disposition: **FAIL**

Candidate `d3e4338db01de509cb59742f22d08ad1ed70b5d5` is live at
<https://couch-play-preflight.sociobot.in> and `/health` reports that exact
SHA, but the deployed product does not complete its primary host workflow.

Fresh live browser evidence reproduced the same failure in **8 of 8** runs:
`POST /api/rooms` returned 200, the immediate host `GET` returned 404, and the
page rendered **“We couldn’t find this room.”** A later poll can see the room,
but the error screen cannot recover into the host board.

The mandatory claims gate also failed once: the exact `sample-guests` command
timed out during offline reload. All six claim commands ignore their `--grep`
argument and run the same monolithic script, so claims are not independently
selectable. Visitor-facing claims are missing from the manifest.

Additional release findings:

- desktop mouse clicks can change a failed touch capability check into a pass;
- no LAN discovery or same-local-session verification exists—network readiness
  only means the public `/health` endpoint responded;
- skip-link and SPA route changes leave focus on `BODY`;
- several 390 px navigation/footer targets are under 44 px;
- no real 404, canonical/social metadata, or `/demo` sitemap entry exists;
- port-only startup emits no configuration-status line;
- `cargo fmt --check` fails.

Full command output, API boundaries, rate-limit allowance, privacy/header
checks, accessibility results, offline behavior, and performance measurements
are recorded in [`.factory/verification-5.md`](verification-5.md).

## Checks run

```sh
npm ci
# every exact command in .factory/claims.json, in order
npm test
npm run lint
npm run build
cargo build --locked --release --manifest-path server/Cargo.toml
npm run test:browser
cargo fmt --manifest-path server/Cargo.toml -- --check
/opt/fleet/lib/verify-url.sh https://couch-play-preflight.sociobot.in <evidence-dir>
```

Independent Playwright flows covered cold first read, demo isolation/privacy,
desktop and 390 px layouts, keyboard/focus behavior, reduced motion, 200% text,
axe, service-worker control/offline reload, live create/read, invalid input and
recovery, room capacity/concurrency, authorization, headers, cookies, and
outgoing requests. Lighthouse 13 mobile scored 99/100/100/100 with LCP 1.3 s.

## What passed

- Cold first screen explains what the product does, who it serves, and the
  required one-click sample action.
- `/demo` has four realistic guests, an isolated session namespace, reset and
  Start for real, and makes no API/third-party request.
- Local unit/integration tests, configured lint/type checks, production bundle,
  release backend build, and a later standalone browser smoke pass.
- Live build identity, secure headers, same-origin privacy, API input/auth and
  12-guest boundaries, current-worker offline reload, zero automated axe
  violations, and performance/bundle budgets.
- API request allowance is enforced: in the observed 100-request burst, 43
  requests were allowed while refill occurred and 57 returned 429, all with
  `Retry-After: 1`.

## Next step

Do not release this candidate. Move live room state to a store shared across
all serving instances (prefer PostgreSQL), add a deployment-level create/read
gate, and address the claim isolation, false touch pass, LAN-scope, and
accessibility findings before requesting verification 6.
