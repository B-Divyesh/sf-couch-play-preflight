# Room Ready — repair 7 handoff

## Release disposition: PASS

Deployed product revision: `7a24d941334df83ee781ff8cd7d830802376eba9`.
Live `/health` returns this exact build SHA.

## Fixed

- Enforced the live `sf-couch-play-preflight` template at one replica
  (`minReplicas=1`, `maxReplicas=1`) with its durable
  `sf-couch-play-preflight-data` volume mounted at `/data`.
- SQLite defaults to `/data/room-ready.sqlite3`, with full-synchronous
  rollback journaling. Azure Files lacks SQLite byte-range locking, so the
  strictly single-writer deployment uses SQLite's `unix-none` VFS.
- Added a production-process regression for fresh create/read, server restart,
  persisted join, and forwarded-IP `429`/`Retry-After` behavior. Added tests
  for the durable database URI and journal configuration.

## Evidence

- Before repair, live `f663d5a…` was still served. The independent verifier's
  eight-room alternating `404/200` report remains the exact failure record;
  nine new pre-repair probes here happened to read 200 consistently.
- `npm ci` passed with 0 vulnerabilities. `npm test` passed (4 Vitest, 10
  Rust); `npm run lint`, `npm run build`, and `npm run test:browser` all
  passed. Built JS is 56.51 kB / 20.57 kB gzip; CSS is 18.74 kB / 5.09 kB gzip.
- Live template inspection confirmed image `7a24d941334d`, one replica, and
  `/data` mount. Startup logged `database_config=defaulted` and
  `storage_topology=single-replica-single-writer`.
- Fresh room `KGUL` read `200,200,200,200,200`. After restarting revision
  `sf-couch-play-preflight--0000031`, the same five fresh reads were all 200.
  A 100-request concurrent fresh burst produced 9 HTTP 429s, all with
  `Retry-After: 1`.
- Live `verify-url.sh` passed in 710 ms with title/lang/one h1/main/alts and
  no console errors. CSP, `nosniff`, `no-referrer`, and frame denial headers
  are present.

## Known gaps

Rooms are intentionally six-hour ephemeral. Do not scale this SQLite service
horizontally; migrate rooms to PostgreSQL before using multiple replicas.
