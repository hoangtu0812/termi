# Implementation Notes

| | |
|---|---|
| Version | 1.0 |
| Status | Active |
| Last updated | 2026-11-26 |

Rationale that used to live in code comments. Source files carry no comments (see [AGENTS.md](../AGENTS.md)), so every non-obvious decision is recorded here, grouped by area. When you remove a legacy comment, add its reasoning to the matching section.

## Startup and configuration

- `src/server.mjs` is only the entry point: it loads the configuration and calls `start()`. Every other module can be imported without side effects, which `test/app.test.mjs` checks by importing them with an empty temporary `HOME`.
- The server code moved from `src/server.mjs` to `src/app.mjs` in Phase 2. Plain `git blame` attributes every line to that move; use `git blame -C -C src/app.mjs` to see where each line came from.
- `src/config.mjs` is the only place that reads `TERMI_*` environment variables. `process.env` elsewhere is used only to pass `PATH` and git settings to child processes.
- The server listens on `127.0.0.1` only. The single way in from outside is `tailscale serve` (set up by `scripts/install.sh` and `scripts/install-linux.sh`).
- Diff and file responses are capped at `MAX_OUTPUT_CHARS` (300,000 characters) because larger payloads freeze phone browsers.

## Data directory and persistence

- The data directory (`TERMI_DATA`, default `~/.termi`) holds uploaded files and the VAPID private key, so it is created with mode `700` and every file with mode `600`.
- `src/store.mjs` writes JSON atomically: a temp file in the same directory, `fsync`, then `rename`. A crash leaves either the old file or the new one, never a torn file.
- Writes and read-modify-write cycles on the same file run through a per-file queue. `sessions.json` is updated by the 30-second snapshot, by closing a session and by restore/dismiss; without the queue those could overwrite each other.
- A corrupt `vapid.json` stops the server instead of being regenerated. A new key would silently invalidate every push subscription on every device.
- Other corrupt state files (`subs.json`, `notify.json`, `sessions.json`, `quick.json`) are moved aside as `<name>.corrupt-<timestamp>`, logged, and treated as empty, so the app keeps working and the data can still be recovered by hand.
- The session snapshot keeps the `pending` list (sessions lost in a reboot and not restored yet) when it rewrites `sessions.json`, so a restore offer survives until it is accepted or dismissed.

## Web Push

- termi sends Web Push messages without a payload. Without a payload only the VAPID signature (ES256 JWT) is required; no message encryption is needed. The app fetches the details from `/api/push/alert` when the notification arrives.

## Static files

- Bundled fonts are served from `/fonts/<name>.woff2` and `/fonts/fonts.css`. Only file names matching `^[a-z0-9-]+\.(woff2|css)$` are exposed.
