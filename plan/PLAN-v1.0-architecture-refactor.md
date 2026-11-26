# Architecture Refactor Plan

| | |
|---|---|
| Version | 1.0 |
| Status | Active |
| Last updated | 2026-11-26 |
| Applies to | termi 0.12.0 → 1.0.0 |
| Rules | [AGENTS.md](../AGENTS.md) |

## 1. Goal

Bring the codebase in line with `AGENTS.md` without changing user-visible behavior: modular server and client, no comments in code, no import-time side effects, safe persistence, working tests and CI. Each phase ships as its own release, so every step can be verified and rolled back on its own.

## 2. Baseline (v0.12.0)

| Area | Finding |
|---|---|
| Server | `src/server.mjs` is 1,220 lines and holds about 12 responsibilities: tmux sessions, agent detection, transcripts, usage, files, git, Web Push, multi-machine proxy, snapshot/restore, ttyd watchdog, auth, routing and static files. |
| Client | `public/index.html` is 2,519 lines: ~500 lines of CSS and ~1,800 lines of JS in one global scope. |
| Agents | Agent-specific branches are spread over 7 functions (`HISTORY`, `transcriptFile`, `sessionTokens`, `chatItems`, `transcriptMessages`, `lastReply`, `resumeIdFor`). |
| Duplication | `transcriptMessages` and `chatItems` parse the same formats; the "real prompt" filter is repeated 3 times; `tailscale status --json` is called from two places. |
| Side effects | Importing `server.mjs` creates `~/.termi`, generates VAPID keys and reads state files, so tests write to the real home directory. |
| Persistence | `saveJson` is not atomic. A torn `vapid.json` regenerates keys and breaks every push subscription; a torn `subs.json` drops all subscriptions. `sessions.json` is read-modify-written from 4 places without serialization. |
| Performance | `sessions()` (ps, capture-pane per pane, transcript reads) is recomputed by 7 callers, including `watch` every 3 s, with no short cache or in-flight sharing. |
| Tests | `npm test` runs `node --test test/`, which fails on Node 24 with `MODULE_NOT_FOUND`. The 26 tests pass when run by file name. |
| Tooling | No lint, no format check, no CI. |
| Comments | Code is heavily commented in Vietnamese; much of it is important rationale (ttyd pty leak, Tailscale identity, macOS memory reporting). |

## 3. Principles

- Behavior-preserving: refactor phases change structure only. Any bug fix found on the way gets its own `fix:` commit and test.
- Move first, then improve: extract code verbatim into its new module, run tests, then clean it up in a separate commit.
- Comments are migrated, not lost: before deleting a comment, its rationale goes to `docs/NOTES-v1.0-implementation-notes.md` (or an `ADR`), in the same commit.
- Each phase ends green: `npm test` passes and CI is green.

## 4. Phases

### Phase 0 — Conventions (v0.12.1)

- [x] `AGENTS.md` and `AGENTS.vi.md` with engineering rules; `CLAUDE.md` imports them.
- [x] This plan in `plan/`.
- [x] English `README.md` with `README.vi.md`.
- [x] `CHANGELOG.md` and `CHANGELOG.vi.md` rebuilt from the release history.
- [x] Screenshots moved to `docs/assets/screenshots/`.

### Phase 1 — Tooling and test isolation (v0.13.0)

- Fix `npm test`: `node --test`.
- Add `scripts/check.mjs` (zero-dependency) that fails on: comments in `src/`, `public/`, `scripts/`; files > 300 lines; lines > 120 chars; doc names in `docs/` and `plan/` that break the naming rule. Start in report-only mode for legacy files listed in an allowlist that shrinks every phase.
- Add `npm run check` and `npm run verify` (`check` + `test` + `node --check` on every `.mjs`).
- Add `.github/workflows/ci.yml` running `npm run verify` on Node 24 (ubuntu + macOS).
- Add `.editorconfig`.
- Introduce `TERMI_DATA` (default `~/.termi`) so tests use a temp directory.

Done when: CI is green and no test touches the real home directory.

### Phase 2 — Configuration, startup and persistence (v0.14.0)

- `src/config.mjs`: every environment variable and constant (`PORT`, `TTYD_PORT`, `ROOTS`, `DATA`, limits).
- `src/store.mjs`: `readJson`, `writeJsonAtomic` (temp file + `rename`, mode `0600`), and a per-file queue so read-modify-write cycles never interleave. Corrupt files are reported, never silently regenerated for `vapid.json`.
- `src/server.mjs` becomes a bootstrap that calls `start(config)`; all top-level `await` and timers move into `start`.
- Tests: atomic write under concurrent updates; corrupt `vapid.json` is not overwritten.

Done when: importing any module has no side effects.

### Phase 3 — Extract pure modules (v0.15.0)

- `src/git/parse.mjs` (`parseStatus`, `parseNumstat`, `marksFromStatus`), `src/git/graph.mjs` (`graphLayout`), `src/git/run.mjs`, `src/git/ops.mjs`.
- `src/tmux/screen.mjs` (`agentState`, `parseChoices`, `parseMulti`, `stepsToSubmit`), `src/tmux/client.mjs`.
- `src/validate.mjs` (all `valid*` functions, `safePath`).
- `src/text.mjs` (`plainText`, `prettyModel`, `clip`).
- Remove comments from every moved function; migrate rationale to `docs/NOTES-v1.0-implementation-notes.md`.
- Tests are split to match: `test/git.test.mjs`, `test/screen.test.mjs`, `test/validate.test.mjs`.

### Phase 4 — Agent adapters (v0.16.0)

- `src/agents/index.mjs` defines the adapter interface and registry:

  | Member | Purpose |
  |---|---|
  | `id`, `name`, `cmd` | Identity and launch command |
  | `matchProcess(exe)` | Process detection |
  | `resumeCommand(id)` | Optional; resume a conversation |
  | `historyFiles()`, `parseHistory(lines)` | Past conversations |
  | `transcriptFile(cwd, pid)` | Current conversation file |
  | `chatItems(lines, limit)` | Messages and tool steps |
  | `sessionTokens(cwd, pid)` | Context usage |
  | `limits()` | Plan rate limits |
  | `resumeId(session)` | Id to restore after reboot |

- `src/agents/claude.mjs`, `codex.mjs`, `agy.mjs` implement it.
- Merge `transcriptMessages` into `chatItems`; one shared "real prompt" filter.
- Test fixtures: sample `.jsonl` transcripts per agent in `test/fixtures/`.

Done when: `grep "agent === '" src` returns nothing outside `src/agents/`.

### Phase 5 — HTTP layer and routes (v0.17.0)

- `src/http/router.mjs` (method + path table, body parsing, error mapping), `src/http/guard.mjs` (Host, identity, Origin, `X-Termi`), `src/http/static.mjs`, `src/http/proxy.mjs` (ttyd and peer proxy, WebSocket upgrade).
- `src/routes/sessions.mjs`, `files.mjs`, `git.mjs`, `notify.mjs`, `usage.mjs`, `settings.mjs`.
- `src/machines.mjs` with one cached `tailscaleStatus()` shared by peer discovery and `allowedUsers`.
- `src/push/vapid.mjs`, `webpush.mjs`, `watcher.mjs`; `src/snapshot.mjs`; `src/ttyd-watchdog.mjs`.
- Tests for the guard (spoofed Host, missing identity, foreign Origin, missing `X-Termi`) against a server started on an ephemeral port.

Done when: `src/server.mjs` is under 50 lines.

### Phase 6 — Session performance (v0.18.0)

- One `SessionService` that shares an in-flight `sessions()` call and caches the result for 1 s; all routes and the watcher read from it.
- `usage(name)` looks up one session without rebuilding the list.
- Parallelize per-pane `claudeSessionInfo` and read the usage file once per refresh.
- Measure before and after (`sessions()` time with 10 panes) and record the numbers in the release notes.

### Phase 7 — Client split (v0.19.0)

- `public/css/app.css`, `public/css/markdown.css`.
- `public/js/` ES modules: `api.mjs`, `icons.mjs`, `theme.mjs`, `state.mjs` (URL state), `sessions.mjs`, `terminal.mjs`, `composer.mjs`, `files.mjs`, `viewer.mjs`, `git.mjs`, `push.mjs`, `settings.mjs`, `main.mjs`.
- `index.html` keeps markup and one `<script type="module" src="js/main.mjs">`.
- Static file serving: whitelist `css/*.css` and `js/*.mjs` with the right content types; `x-termi-build` derives from the newest mtime under `public/`.
- Service worker cache list updated.
- Manual test checklist on Android Chrome, iOS Safari (home-screen app) and desktop: sessions, terminal reconnect, chat, files, git, push.

### Phase 8 — Zero comments and strict checks (v1.0.0)

- Remove all remaining comments from `src/`, `public/`, `scripts/`, migrating rationale to `docs/`.
- Move the usage header of `scripts/get.sh` into the README install section.
- Empty the `check.mjs` allowlist; violations now fail CI.
- Publish `docs/ARCH-v1.0-overview.md` describing the final module map.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Losing hard-won rationale when deleting comments | Migrate to `docs/NOTES-*` in the same commit; review diff for every deleted comment. |
| Regressions in terminal reconnect or push on real phones | Manual checklist per phase that touches the client or push; keep each phase small. |
| Installed instances break on upgrade (new files in `public/`) | `package.json` `files` already ships `public/`; verify `npm pack` contents in CI. |
| Peer machines on different versions | Keep `/api/*` responses backward compatible until 1.0.0. |

## 6. Tracking

Update the checkboxes and this document's version when a phase lands. Each phase's release notes link back to this plan.
