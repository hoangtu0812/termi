# Architecture Refactor Plan

| | |
|---|---|
| Version | 1.8 |
| Status | Done |
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
- Comments are migrated, not lost: before deleting a comment, its rationale goes to `docs/NOTES-v1.7-implementation-notes.md` (or an `ADR`), in the same commit.
- Each phase ends green: `npm test` passes and CI is green.

## 4. Phases

### Phase 0 — Conventions (v0.12.1)

- [x] `AGENTS.md` and `AGENTS.vi.md` with engineering rules; `CLAUDE.md` imports them.
- [x] This plan in `plan/`.
- [x] English `README.md` with `README.vi.md`.
- [x] `CHANGELOG.md` and `CHANGELOG.vi.md` rebuilt from the release history.
- [x] Screenshots moved to `docs/assets/screenshots/`.

### Phase 1 — Tooling and test isolation (v0.13.0) — done

- [x] Fix `npm test`: `node --test` (auto-discovers `test/**/*.test.mjs`).
- [x] Add `scripts/check.mjs` and `scripts/check-comments.mjs` (zero-dependency). They fail on comments in `src/`, `public/`, `scripts/`, `test/`; files > 300 lines; lines > 120 chars; syntax errors in `.mjs`/`.js`; document names in `docs/` and `plan/` that break the naming rule. Vendored fonts in `public/fonts/` are skipped.
- [x] Legacy violations are listed per file and rule in `scripts/check-allowlist.json` and reported as `legacy`. An entry that is no longer violated is an error, so the list can only shrink.
- [x] Add `npm run check` and `npm run verify` (`check` + `test`).
- [x] Add `.github/workflows/ci.yml` running `npm run verify` and `npm pack --dry-run` on Node 24 (ubuntu + macOS).
- [x] Add `.editorconfig`.
- [x] Introduce `TERMI_DATA` (default `~/.termi`); tests run against a temp directory and remove it afterwards.

Done when: CI is green and no test touches the real home directory.

Result: 35 tests pass; `npm run check` reports 0 errors and 21 allowlisted legacy violations across 10 files.

### Phase 2 — Configuration, startup and persistence (v0.14.0) — done

- [x] `src/config.mjs`: `loadConfig(env, home)` returns every `TERMI_*` setting; `MAX_OUTPUT_CHARS` and `MAX_UPLOAD_BYTES` live here.
- [x] `src/store.mjs`: `read`, `write`, `update`, `remove`. Writes are atomic (temp file + `fsync` + `rename`, mode `0600`) and serialized per file. A strict read of a corrupt file throws; a lenient read moves it aside as `<name>.corrupt-<timestamp>` and logs it.
- [x] `vapid.json` is read strictly: a corrupt key stops the server with a clear message instead of being regenerated.
- [x] `sessions.json` is changed only through `store.update`, so the snapshot, close, restore and dismiss paths no longer overwrite each other.
- [x] The former `src/server.mjs` moved to `src/app.mjs` (see its line history from before the move with `git blame -C -C src/app.mjs`), which exports `init(config)` and `start(config)`; all top-level `await` and timers moved into them. `src/server.mjs` is a 9-line entry point, so the installers keep working unchanged.
- [x] Comments removed from every line touched; their rationale moved to `docs/NOTES-v1.7-implementation-notes.md`.
- [x] Tests: atomic writes, 50 concurrent updates, write order, failed updates, corrupt files (strict and lenient), `init` keeps the VAPID key and refuses a corrupt one, config parsing, and a child-process test that imports every library module with an empty `HOME` and asserts nothing was created.

Done when: importing any module has no side effects.

Result: 48 tests pass. Running the old `server.mjs` under the same test creates `~/.termi`; the new modules create nothing.

### Phase 3 — Extract pure modules (v0.15.0) — done

- [x] `src/git/parse.mjs` (`parseStatus`, `parseNumstat`, `parseLog`, `marksFromStatus`, `LOG_FORMAT`), `src/git/graph.mjs` (`graphLayout`), `src/git/run.mjs` (`git`), `src/git/ops.mjs` (`GIT_OPS`).
- [x] `src/tmux/screen.mjs` (`agentState`, `parseChoices`, `parseMulti`, `stepsToSubmit`), `src/tmux/client.mjs` (`tmux`, `target`, `serverStartTime`).
- [x] `src/validate.mjs` (all `valid*` functions, `validKey`, `safePath`, `safeDir`); `safePath` now always takes the roots explicitly.
- [x] `src/text.mjs` (`plainText`, `prettyModel`, `clip`); `src/errors.mjs` (`fail`).
- [x] Moved code was rewritten to the rules (no comments, small functions, named constants); rationale moved to `docs/NOTES-v1.7-implementation-notes.md`.
- [x] Before the old code was deleted, old and new implementations were compared on 702 inputs (validators, model names, markdown, 15 agent screens, git status/numstat/log, the real commit history of this repo and 400 random commit graphs) with identical results.
- [x] Tests split: `test/git.test.mjs` (including stage/unstage/commit against a temporary repository), `test/screen.test.mjs`, `test/validate.test.mjs`, `test/text.test.mjs`.

Result: 61 tests pass; `src/app.mjs` went from 1,260 to 1,111 lines and from 139 to 112 comments.

### Phase 4 — Agent adapters (v0.16.0) — done

- [x] `src/agents/index.mjs`: `createAgents({ home, dataDir })` returns the registry (`list`, `get`, `has`, `nameOf`, `detect`, `installed`, `limits`). Adapters that lack a member get a default.
- [x] `src/agents/claude.mjs`, `src/agents/codex.mjs`; Antigravity is declared inline (name, command, process match).
- [x] Shared pieces: `jsonl.mjs` (file reading, injected-text filter), `chat.mjs` (`chatItems`, `transcriptMessages`), `tools.mjs` (`toolSummary`), `history.mjs`, `reply.mjs` (latest reply with caches), `process.mjs` (command line to executable).
- [x] `scripts/claude-statusline.mjs` writes `claude-usage.json` next to its installed copy, so a server running with another `TERMI_DATA` sees Claude usage.
- [x] Test fixtures: sample Claude and Codex transcripts and process files in `test/fixtures/home/`.
- [x] `test/http.test.mjs` starts the server on a random port and exercises read-only endpoints, path refusal, session validation and the request guards.
- Deviation: `transcriptMessages` was not merged into `chatItems`. They differ (joined vs. separate text blocks) and merging would change the card preview and copy view.

Done when: `grep "agent === '" src` returns nothing outside `src/agents/`. Met.

Result: 76 tests pass. Old and new code were compared on fixture data (283 checks) and on the real `~/.claude` data of the development machine (175 checks) with identical results; the one difference is that `toolSummary` no longer throws on a tool input of `"null"`. A manual run caught a helper (`inRoots`) deleted by the extraction script; the new HTTP test fails without it.

### Phase 5 — HTTP layer and routes (v0.17.0) — done

- [x] `src/http/router.mjs` (method + path table, JSON body parsing, raw and streaming responses, error mapping), `src/http/guard.mjs` (Host, identity, Origin, `X-Termi`), `src/http/static.mjs`, `src/http/proxy.mjs` (ttyd and peer proxy, WebSocket upgrade), `src/http/handler.mjs` (the order in which a request passes the guards, proxies, static files and router).
- [x] `src/routes/sessions.mjs`, `terminal.mjs`, `projects.mjs`, `files.mjs`, `git.mjs`, `notify.mjs`, `usage.mjs`, `settings.mjs`. `terminal.mjs` (send, resize, refresh, capture, chat, menu) and `projects.mjs` (dirs, history, projects, agents) were added so no route file mixes areas.
- [x] `src/machines.mjs`: peer discovery (cached 20 s) and the owner identity (cached once found). Deviation: the raw `tailscale status` call is not cached separately; both callers already cache their own result.
- [x] `src/push/vapid.mjs`, `webpush.mjs`, `watcher.mjs`, plus `prefs.mjs` for notification settings; `src/snapshot.mjs`; `src/ttyd-watchdog.mjs`.
- [x] Also extracted: `src/sessions.mjs` (session list and creation), `src/paths.mjs` (`TERMI_ROOTS` checks), `src/repos.mjs`, `src/system.mjs`, `src/git/marks.mjs`; `src/start.mjs` wires everything and exports `init()`/`start()`.
- [x] HTTP tests cover every route, the static files, the ttyd proxy and the WebSocket upgrade guard (`test/http.test.mjs`, `test/routes-sessions.test.mjs`, `test/routes-data.test.mjs`). They run a private tmux server and a fake ttyd, and were written and passed against `src/app.mjs` before the split.
- [x] The side-effect test now imports every module under `src/` except the entry point.

Done when: `src/app.mjs` no longer exists; its code lives in the modules above. Met.

Result: 103 tests pass. The baseline tests found a Phase 4 regression (the snapshot threw for sessions without an agent), fixed in its own commit before the split. Old and new servers were run side by side on the development machine's real tmux and agent data: 27 of 27 responses identical, including chat, capture and usage of two live Claude Code sessions. Server logs are now in English. The Codex adapter was split into smaller functions to meet the 40-line limit.

### Phase 6 — Session performance (v0.18.0) — done

- [x] `src/shared-result.mjs`: callers that arrive while the session list is being built share that build, and the result is reused for 1 s. Creating, renaming and killing a session invalidates it, so the next request sees the change at once. Routes, the snapshot and the watcher all read from it.
- [x] `sessions.locate(name)` lists the panes of one session only and skips screen capture, git and transcripts. `/api/usage` uses it; `/api/chat` and `/api/capture` use `sessions.find(name)`, which adds the screen state for that one session.
- [x] The conversation of each agent pane is looked up in parallel instead of one pane at a time.
- [x] `claude-usage.json` is parsed once per change (inode, mtime and size) instead of once per session on every refresh.
- [x] Measured with `createSessions` directly, median of 15 runs, cache expired between runs:

  | Case | Before | After |
  |---|---|---|
  | One list, 10 agent panes | 18–19 ms | 18–19 ms |
  | 5 concurrent lists, 10 agent panes | 63–68 ms | 19 ms |
  | Usage lookup of one session, 10 panes | 18 ms | 6–7 ms |
  | One list, 2 real Claude Code sessions | 11.6 ms | 10.9 ms |
  | 5 concurrent lists, 2 real sessions | 27 ms | 11 ms |

  A single list is not faster: its time is the tmux, `ps` and `git` processes it starts. The gain is that the watcher and every open device share one build per second instead of starting their own.

Result: 109 tests pass. Old and new servers returned identical responses for 27 requests against the real tmux and agent data.

### Phase 7 — Client split (v0.19.0) — done

- [x] `public/css/`: 10 stylesheets linked in the original cascade order (`fonts`, `base`, `sessions`, `topbar`, `panes`, `viewer`, `chat`, `widgets`, `dialogs`, `mobile`). The plan named two files; one file per area keeps each under 300 lines.
- [x] `public/js/`: 42 ES modules plus the classic `theme-init.js`. The plan listed 13; the old script had more features than that, and the 300-line limit needs smaller files. Each module only declares; `setup…()` functions hold the statements and `main.mjs` runs them in the old order.
- [x] `index.html` is markup only: no `<style>`, no inline script, one `<script type="module" src="/js/main.mjs">`. It left the allowlist.
- [x] Static serving whitelists `css/*.css` and `js/*.mjs`/`*.js`; `x-termi-build` is the newest modification time of every UI file (cached 1 s).
- [x] Service worker: no change needed. It caches only `offline.html` for navigations and never caches app files, so new modules need no cache list.
- [x] All client comments removed; their rationale is in `docs/NOTES-v1.7-implementation-notes.md` (Client section).
- [x] Verification: a headless Chrome driver (scratch tooling, not in the repo) ran 18 steps on a 1400×900 desktop and a 390×844 phone viewport against the old and new client on the same fixture server (sessions, terminal, chat, files, Markdown preview, git, diff, settings, palette, new session, usage, inbox, quick actions, slash suggestions, session menu, light theme). Visible text, DOM structure and the computed style of every element were identical in all 432 comparisons, with no console errors or failed requests. `test/client.test.mjs` checks that every import names an existing export and that `index.html` loads existing files.
- [ ] Manual checklist on real devices, to be done by the owner before release:
  - Android Chrome and iOS Safari as a home-screen app: open a session, type in the terminal, rotate, lock and unlock the phone (terminal must reconnect), switch sessions by swiping the title bar.
  - Chat view: send a message, attach a photo, answer a confirm prompt with a quick button.
  - File tab: open a Markdown file and an image; Git tab: stage, commit, view a diff.
  - Enable push, send a test notification, tap it to open the session.
  - Desktop: Ctrl/Cmd+K palette, split view at ≥ 1200 px, theme switch.
- Known gaps moved to Phase 8 (all resolved there): a few modules still read `localStorage` or create an element at load time, many client functions exceed 40 lines, and some markup is still built with `innerHTML` from escaped strings.

### Phase 8 — Zero comments and strict checks (v1.0.0) — done

- [x] Comments removed from `public/sw.js`, `public/offline.html`, `scripts/*.sh`, `scripts/claude-statusline.mjs` and `test/server.test.mjs`; their rationale is in `docs/NOTES-v1.7-implementation-notes.md` (service worker, installers, statusline).
- [x] The usage header of `scripts/get.sh` was already in the README install section; the missing `TERMI_REPO` option was added in both languages.
- [x] `scripts/check-allowlist.json` is empty, so every violation fails `npm run verify` and CI.
- [x] Client: no module touches the browser while loading (`setup…()` does it), so all modules but `main.mjs` import in Node; every function in `src/`, `public/`, `scripts/` and `test/` is at most 40 lines (measured with a parser; 24 functions were split, including `createClaudeAgent` and `createMachines` on the server); `innerHTML` is limited to trusted markup and three guarded rendering paths, enforced by `test/client.test.mjs`. Two imports shadowed by locals, left over from the mechanical split, were removed.
- [x] `docs/ARCH-v1.0-overview.md` describes the final module map.
- [x] Shell scripts are stored with the executable bit.
- Verification: generated systemd units and launchd plists compared with the old scripts (identical except one comment line that systemd ignores); the statusline compared old against new on install, update, recording, forwarding and uninstall (identical), and the same flow is now `test/statusline.test.mjs`. The headless Chrome comparison was extended to 25 steps per viewport with a real ttyd terminal (typing, font size, Markdown source, code file, commit diff, diff mode, quiet hours, palette Enter, quick-action editor, session context menu, history): 900 of 900 checks identical to the Phase 7 client, with no JavaScript errors.
- Not automated: the 40-line function limit (the checker has no parser) and the manual phone checklist from Phase 7.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Losing hard-won rationale when deleting comments | Migrate to `docs/NOTES-*` in the same commit; review diff for every deleted comment. |
| Regressions in terminal reconnect or push on real phones | Manual checklist per phase that touches the client or push; keep each phase small. |
| Installed instances break on upgrade (new files in `public/`) | `package.json` `files` already ships `public/`; verify `npm pack` contents in CI. |
| Peer machines on different versions | Keep `/api/*` responses backward compatible until 1.0.0. |

## 6. Tracking

Update the checkboxes and this document's version when a phase lands.

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-26 | Initial plan. |
| 1.1 | 2026-11-26 | Phase 1 done. |
| 1.2 | 2026-11-26 | Phase 2 done; later phases now start from `src/app.mjs`. |
| 1.3 | 2026-11-26 | Phase 3 done; statusline data directory added to Phase 4. |
| 1.4 | 2026-11-26 | Phase 4 done; HTTP guard tests partly delivered early. |
| 1.5 | 2026-11-26 | Phase 5 done; `src/app.mjs` removed. |
| 1.6 | 2026-11-26 | Phase 6 done; measurements recorded. |
| 1.7 | 2026-11-26 | Phase 7 done; client gaps added to Phase 8. |
| 1.8 | 2026-11-27 | Phase 8 done; plan complete. |

Each phase's release notes link back to this plan.
