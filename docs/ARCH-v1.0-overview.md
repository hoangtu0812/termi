# Architecture Overview

| | |
|---|---|
| Version | 1.0 |
| Status | Active |
| Last updated | 2026-11-27 |
| Rules | [AGENTS.md](../AGENTS.md) |
| Rationale | [NOTES-v1.7-implementation-notes.md](NOTES-v1.7-implementation-notes.md) |

The module map of termi after the refactor in [PLAN-v1.8-architecture-refactor.md](../plan/PLAN-v1.8-architecture-refactor.md). Why individual parts work the way they do is in the implementation notes; this document only says where things live and how they connect.

## 1. Runtime picture

```
phone / laptop ──HTTPS──▶ tailscale serve ──HTTP──▶ termi server (127.0.0.1:7680)
                                                     ├─ /           static PWA (public/)
                                                     ├─ /api/*      JSON API (src/routes/)
                                                     ├─ /term/*     proxy ──▶ ttyd (127.0.0.1:7681) ──▶ attach.sh ──▶ tmux
                                                     └─ /m/<peer>/* proxy ──▶ termi on another tailnet machine
termi server ──execFile──▶ tmux, git, ps, tailscale
termi server ──reads──▶ agent transcripts (~/.claude, ~/.codex) and its data directory (~/.termi)
```

- One Node.js process with no dependencies. It listens on `127.0.0.1` only; `tailscale serve` is the single way in.
- Agents (Claude Code, Codex, Antigravity) run inside tmux sessions. termi never talks to an agent directly: it types into tmux and reads the agent's transcript files and screen.
- The browser client is a no-build PWA made of native ES modules.

## 2. Server (`src/`)

### Startup

| Module | Responsibility |
|---|---|
| `server.mjs` | Entry point: load the configuration and call `start()`. |
| `config.mjs` | Read `TERMI_*` environment variables; shared limits. |
| `start.mjs` | Build every service once (`init`), then start the HTTP server and the timers (`start`). |

`init()` returns one context object (configuration, store, agents, sessions, machines, push, …) that the route tables receive. No module does anything when it is imported.

### HTTP layer (`src/http/`)

| Module | Responsibility |
|---|---|
| `handler.mjs` | The order a request goes through: guards, peer proxy, ttyd proxy, static files, CSRF check, router. |
| `guard.mjs` | Host check, Tailscale identity, Origin check, `X-Termi` header. |
| `router.mjs` | Route tables keyed by `METHOD /path`, JSON bodies, raw and streaming responses, error responses. |
| `static.mjs` | Whitelisted static files and the UI build id. |
| `proxy.mjs` | HTTP and WebSocket proxying to ttyd and to peer machines. |

### API (`src/routes/`)

Each file returns a table of handlers built from the shared context.

| Module | Endpoints |
|---|---|
| `sessions.mjs` | List, create, rename, kill sessions; restore after a reboot. |
| `terminal.mjs` | Send text and keys, resize, refresh, capture text, chat view, submit menus. |
| `projects.mjs` | Suggested folders, conversation history, project tree, installed agents. |
| `files.mjs` | Directory listing, file contents, raw images, uploads. |
| `git.mjs` | Status, log and graph, diffs, git operations. |
| `notify.mjs` | Push key and subscriptions, last alert, inbox events, notification settings. |
| `usage.mjs` | Plan limits, session tokens, machine load; tailnet machines. |
| `settings.mjs` | Settings page info; quick actions. |

### Services

| Module | Responsibility |
|---|---|
| `sessions.mjs` | Build the session list from tmux panes, processes, screens and transcripts; create, rename and kill sessions. |
| `shared-result.mjs` | Share one in-flight result between concurrent callers and cache it briefly. |
| `snapshot.mjs` | Save the session list and compute what to restore after a reboot. |
| `machines.mjs` | Discover termi on other tailnet machines; find the machine owner. |
| `paths.mjs` | Resolve paths and enforce `TERMI_ROOTS`. |
| `repos.mjs` | Find git repositories under the roots. |
| `system.mjs` | CPU, memory and disk usage. |
| `ttyd-watchdog.mjs` | Restart ttyd when stuck clients pile up. |
| `store.mjs` | JSON state files with atomic, serialized writes. |
| `validate.mjs`, `text.mjs`, `errors.mjs` | Input validators, text helpers, HTTP errors. |

### Agents (`src/agents/`)

`index.mjs` builds one adapter per agent with a common shape (command, process match, transcript, chat events, usage, limits, resume, history). `claude.mjs` and `codex.mjs` hold everything specific to those agents; Antigravity is declared inline. `jsonl.mjs`, `chat.mjs`, `tools.mjs`, `history.mjs` and `reply.mjs` are shared transcript readers. No code outside this folder branches on an agent id.

### tmux, git and push

| Folder | Modules |
|---|---|
| `src/tmux/` | `client.mjs` (run tmux, exact session targets), `screen.mjs` (agent state, menus and previews read from the screen). |
| `src/git/` | `run.mjs` (git runner), `ops.mjs` (stage, commit, push…), `parse.mjs` (status, numstat, log), `graph.mjs` (commit graph lanes), `marks.mjs` (file tab marks). |
| `src/push/` | `vapid.mjs` (keys and signatures), `webpush.mjs` (delivery and subscriptions), `prefs.mjs` (notification settings), `watcher.mjs` (state changes → inbox and push). |

## 3. Client (`public/`)

- `index.html` is markup only. It loads `js/theme-init.js` (blocking, sets the theme before the first paint), ten stylesheets from `css/` in cascade order, and `js/main.mjs`.
- Every module in `js/` only declares. Listeners and timers are registered in an exported `setup…()` function; `main.mjs` calls them in a fixed order and starts polling.

| Area | Modules |
|---|---|
| Foundations | `dom.mjs`, `storage.mjs`, `state.mjs` (URL hash state and the shared `S` object), `api.mjs` (fetch, errors, build reload), `icons.mjs`, `theme.mjs`, `wake.mjs` |
| Layout | `render.mjs` (show the right panes for the URL), `topbar.mjs`, `switcher.mjs`, `navigation.mjs`, `poll.mjs` |
| Sessions | `sessions.mjs` (project tree), `welcome.mjs`, `new-session.mjs`, `history.mjs`, `seen.mjs`, `machines.mjs` |
| Terminal | `terminal.mjs` (ttyd iframe), `reconnect.mjs` (touch scroll, reconnect, stale detection), `keys.mjs` |
| Composer and chat | `composer.mjs`, `attachments.mjs`, `voice.mjs`, `quick.mjs`, `confirm.mjs`, `chat.mjs`, `sanitize.mjs` |
| Files and git | `files.mjs`, `viewer.mjs`, `markdown.mjs`, `highlight.mjs`, `diff.mjs`, `git.mjs`, `git-graph.mjs` |
| Notifications and settings | `push.mjs`, `inbox.mjs`, `notify-form.mjs`, `settings.mjs`, `usage.mjs`, `palette.mjs` |

`public/sw.js` is the service worker (push notifications, offline page) and `public/offline.html` the self-contained page it shows when the server cannot be reached.

## 4. Scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `get.sh` | Install or upgrade from a GitHub release. |
| `install.sh`, `install-linux.sh` | Set up the services (launchd or systemd) and `tailscale serve`. |
| `attach.sh` | Run by ttyd for each terminal: attach to an existing tmux session. |
| `claude-statusline.mjs` | Claude Code statusline that records plan limits and context usage. |
| `check.mjs`, `check-comments.mjs` | Repository rule checks (`npm run check`). |

## 5. Quality gates

- `npm run verify` runs the rule checks and every test. CI runs it on Ubuntu and macOS.
- `npm run check` fails on any comment, any file over 300 lines, any line over 120 characters, a syntax error or a misnamed document. The allowlist (`scripts/check-allowlist.json`) is empty and must stay empty.
- Function length (40 lines) is not checked automatically, because the checker has no JavaScript parser; reviewers check it.
- Tests use temporary directories, a private tmux server and a fake or real ttyd; they never touch the user's home, tmux, git remotes or the network. Client modules can be imported by Node, so their pure helpers have unit tests; `test/client.test.mjs` checks module wiring and the use of `innerHTML`.
