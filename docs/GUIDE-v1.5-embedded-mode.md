# Embedded mode

| | |
|---|---|
| Version | 1.5 |
| Status | Active |
| Last updated | 2026-11-27 |

termi normally listens on `127.0.0.1` and trusts the identity that `tailscale serve` attaches to each request. Embedded mode lets another application put termi behind its own reverse proxy instead, for example Flowie, which runs one sandbox container per user and serves termi at `/api/v1/sandbox/ui/`.

## Turning it on

| Variable | Value |
|---|---|
| `TERMI_TOKEN` | A long random secret (at least 32 characters). |
| `TERMI_HOST` | The address the proxy reaches, for example `0.0.0.0` inside a container. |

With `TERMI_TOKEN` set:

- every HTTP request and WebSocket upgrade must carry `X-Termi-Token: <token>`; the comparison is constant-time and the Tailscale identity check is not used;
- the Host check, the Origin check and the `X-Termi` header on POST stay in force, so the proxy sends `Host: localhost:<port>`, drops or rewrites `Origin` after checking it itself, and passes `X-Termi` through.

Never set `TERMI_HOST` to a reachable address without `TERMI_TOKEN`: without a Tailscale identity header termi then only checks that the Host header says `localhost`, which any client can send.

## What the proxy must do

- Authenticate the person and pick the one termi instance that belongs to them; never let a request choose the instance.
- Keep the token on the server side; it must never reach the browser.
- Strip its own prefix before forwarding, so termi still sees `/`, `/api/...` and `/term/...`.
- Redirect the prefix without a trailing slash to the prefix with one: the web app uses relative URLs and resolves them against the page address.
- Do not buffer `text/event-stream` responses (`api/stream`). If the proxy buffers them the app still works but falls back to polling the session list every 3 seconds.
