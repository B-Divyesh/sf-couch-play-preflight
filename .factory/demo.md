# Room Ready demo

Open [`/demo`](/demo) or click **Try it with sample data** on the first
screen. The demo opens a realistic, already-ready family picture-quiz room:
Mina on touch, Tom on keyboard, Ari on gamepad, and Jo on touch. It shows the
same readiness bench and host summary that a real host sees, without creating
a room or sending a request to `/api`.

The persistent banner says **Demo — sample data, nothing is saved**. **Reset
demo** restores the four-person fixture. **Start for real** deletes the
`demo:room-ready` session-storage key and returns to the host flow. Real host
tokens use their separate `host:<room-code>` session-storage keys; demo mode
never reads or writes them.

The service worker caches the demo shell after the first visit, so the demo
also reloads offline. Its cache name is generated from the built assets; an
updated release installs a new cache and removes the prior one.

The demo does not run same-network discovery. That feature belongs to real,
temporary rooms and remains isolated from the `demo:` namespace.
