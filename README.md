# Room Ready

Room Ready is a device preflight for people hosting family, classroom, or team
party games. Before guests are waiting, a host opens a temporary room and
shares a QR code or four-letter fallback. Each guest checks their browser,
connection, chosen input, and a no-install practice pad. The host sees one live
readiness board and declares which mix of touch, keyboard, and gamepad inputs
the planned setup accepts.

It deliberately does not recommend games or claim that an untested game will
work. Display readiness is a host confirmation because browsers cannot
reliably inspect every TV/casting path.

Live product: <https://couch-play-preflight.sociobot.in>

Try the isolated sample room at <https://couch-play-preflight.sociobot.in/demo>.
It contains four realistic guest checks, never calls the room API, and can be
reset or discarded from its persistent demo banner.

## What ships

- Responsive vanilla TypeScript/Vite interface for hosts and 390px phones
- Rust 2021 `axum` service with SQLite, structured logs, request limits,
  secure headers, health reporting, and graceful shutdown
- Six-hour ephemeral rooms for up to 12 guests, with private mutation tokens
- QR, manual room code, full-screen TV card, and printable join card
- Measured capability checks, three-input practice, mixed-input comparison,
  offline state, large-text control, and reduced-motion treatment
- Local privacy and terms routes with no accounts, analytics, contact data,
  third-party fonts, or runtime CDNs
- One-click `/demo` with four sample guests in the `demo:` session-storage
  namespace; it never reads or writes a real host or guest room

## Run locally

Requirements: Node 22+, npm, and a current Rust toolchain.

```sh
npm install
npm run build
DATABASE_URL='sqlite://room-ready.db?mode=rwc' cargo run --manifest-path server/Cargo.toml
```

Open <http://localhost:8080>. For live frontend development, run the backend
above and `npm run dev` in a second terminal; Vite proxies `/api` and `/health`
to port 8080.

## Test and verify

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:browser
```

`npm test` runs the TypeScript model suite and Rust API suite, including 24
parallel joins across multiple SQLite connections. `npm run test:browser`
checks immediate POST-to-host-read persistence across independent HTTP
connections, demo isolation, the same capacity boundary through the release
server, host/guest flow, forwarded-IP rate limiting, accessibility, privacy,
versioned service-worker update plus offline reload, and the 390px layout.
The production output is exactly `dist/`, with `dist/index.html` at its root.
Every visitor-facing claim is listed in [`.factory/claims.json`](.factory/claims.json);
the isolated sample is documented in [`.factory/demo.md`](.factory/demo.md).

Runtime configuration is environment-only:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `DATABASE_URL` | local `sqlite://room-ready.db?mode=rwc`; `/data/room-ready.db` in the container | SQLite connection |
| `DIST_DIR` | local `dist`; `/app/dist` in the container | Built frontend directory |
| `RUST_LOG` | library default | Structured log filter |

## Container deployment

The root `Dockerfile` builds the Vite bundle and release Rust binary in
separate stages, then runs as an unprivileged Alpine user on port 8080. Its
release binary embeds the immutable `BUILD_SHA`, `GIT_SHA`, or `SOURCE_COMMIT`
supplied by the release build, so `/health` reports the image's actual source
revision and cannot be changed by runtime configuration. A production SQLite
deployment must be constrained to exactly one always-on replica
(`minReplicas=1`, `maxReplicas=1`). SQLite is intentionally a single-writer
store, not a cross-replica database. This topology makes a committed room
immediately visible to every subsequent request. Do not scale it horizontally
or place its database on SMB/Azure Files. Migrate to PostgreSQL before
requiring replica or replacement durability.

```sh
docker build --build-arg BUILD_SHA="$(git rev-parse HEAD)" -t room-ready .
docker run --rm -p 8080:8080 -v room-ready-data:/data room-ready
```

Deployment, DNS, and billing are intentionally outside this repository. Room
Ready v1 is free.

## Product and art documentation

The researched product contract is in [`.factory/brief.json`](.factory/brief.json),
the visual system and generated-image provenance are in
[`.factory/design.md`](.factory/design.md), and verification notes are in
[`.factory/handoff.md`](.factory/handoff.md).

MIT licensed. See [`LICENSE`](LICENSE).
