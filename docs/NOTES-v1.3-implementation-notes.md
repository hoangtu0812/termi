# Implementation Notes

| | |
|---|---|
| Version | 1.3 |
| Status | Active |
| Last updated | 2026-11-26 |

Rationale that used to live in code comments. Source files carry no comments (see [AGENTS.md](../AGENTS.md)), so every non-obvious decision is recorded here, grouped by area. When you remove a legacy comment, add its reasoning to the matching section.

## Startup and configuration

- `src/server.mjs` is only the entry point: it loads the configuration and calls `start()`. Every other module can be imported without side effects, which `test/app.test.mjs` checks by importing them with an empty temporary `HOME`.
- The server code moved from `src/server.mjs` to `src/app.mjs` in Phase 2 and was split into the modules under `src/` in Phases 3–5. Plain `git blame` attributes the lines to those moves; use `git blame -C -C <file>` to follow a line back to where it came from.
- `src/start.mjs` builds every service once in `init(config)` and passes them to the route tables as one context object. `start(config)` adds the HTTP server and the timers: the state watcher every 3 s, the session snapshot every 30 s (and once 5 s after start), the ttyd watchdog every 2 minutes.
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

## Input validation (`src/validate.mjs`)

- `validHost` only accepts `localhost`, `127.0.0.1` or a `*.ts.net` name. This blocks DNS rebinding: a hostile page cannot point its own domain at `127.0.0.1` and talk to termi.
- `validKey` allows the named keys of the phone key bar plus the digits `1`–`9`. Agent confirmation menus react to real key presses, not to pasted text, so quick replies send a digit key.
- `safePath` resolves symlinks with `realpath` before checking that the result is inside a root, and compares against `root + path.sep` so a sibling folder such as `/home/me-evil` does not pass for `/home/me`.

## tmux (`src/tmux/`)

- `target(name)` returns `=name:`. The `=` prefix makes tmux match the session name exactly; without it tmux also accepts a unique prefix and could act on the wrong session.
- `serverStartTime()` returns `Infinity` when no tmux server is running (for example right after a reboot), so every saved session counts as lost and is offered for restore.

## Reading agent screens (`src/tmux/screen.mjs`)

- Agent state is inferred from the text on screen. This is a known shortcut: if Claude Code or Codex change their UI, the patterns must be updated (or replaced by agent hooks).
  - `waiting`: a confirmation prompt, or a numbered menu whose first row has a cursor (`❯ 1.` in Claude, `› 1.` in Codex).
  - `working`: the "esc to interrupt" hint is visible.
- `parseChoices` splits the screen into runs of consecutive `1.`, `2.`, `3.`… rows and takes the last run that contains a cursor. Numbered lists inside an agent reply have no cursor; they used to be mistaken for a menu.
- Multi-select menus (checkboxes, a `Submit` row) and menus that scroll (`↓ 3 more lines`) return no quick buttons from `parseChoices`: a digit only toggles a box there, and the button bar would flicker as the menu scrolls. `parseMulti` handles them instead.
- `parseMulti` skips the "Type something" free-text row; it cannot be answered with a checkbox.
- `stepsToSubmit` returns how many ↓ (positive) or ↑ (negative) presses move the cursor to `Submit`, or `null` when `Submit` is not visible yet because the list is scrolled. `/api/menu-submit` then presses ↓ and looks again.

## Git (`src/git/`)

- `git status --porcelain=v1 -z` puts the old name of a rename or copy in the next NUL-separated entry, so the parser skips one entry after `R` or `C`.
- `git --numstat` prints `-` instead of counts for binary files; they become `null`.
- File tab marks: a file gets its status letter (`M`, `A`, `D`, or `U` for untracked); a folder with any change below it gets `•`.
- Commit graph (`graphLayout`): each row has `col`, the lane of the commit, and `seg`, the line segments to draw as `[fromLane, fromY, toLane, toY]`, where `y` is `0` for the top edge of the row, `1` for the commit dot and `2` for the bottom edge. A lane holds the hash of the commit it is waiting for. A branch tip has no incoming segment; its first parent continues in the same lane and other parents take the first free lane.
- `unstage` in a repository without any commit has no `HEAD` to restore from, so it falls back to `git rm --cached`, which keeps the file on disk.
- `push` sets the upstream to `origin` when the branch has none.
- Every git call runs with `GIT_TERMINAL_PROMPT=0` (never wait for credentials) and `GIT_OPTIONAL_LOCKS=0` (do not take the index lock for read-only commands while an agent may be running git).

## Agents (`src/agents/`)

- Every agent is an adapter created by `createAgents({ home, dataDir })` in `src/agents/index.mjs`. Members an agent does not support fall back to defaults (no transcript, no limits, no resume), so Antigravity only declares its name, command and process match. Code outside `src/agents/` never branches on an agent id.
- Process detection reads the full command line from `ps -o args` rather than `comm`: on Linux `comm` is a truncated name without the path. Agents written in JavaScript run as `node …/codex.js` (Codex installed with npm), so for `node`, `bun` and `deno` the script path is used instead, with a `.js`/`.mjs`/`.cjs` extension removed. Claude Code's native installer runs from `~/.local/share/claude/versions/<version>`, which is matched by path.
- New sessions type the agent command into the tmux shell instead of starting the agent directly, so the session keeps its shell when the agent exits.
- Agents draw on the terminal's alternate screen, so tmux keeps no scrollback for them. Chat, the copy view and the card preview read the agent's own transcript file instead.

### Claude Code

- Transcripts live in `~/.claude/projects/<cwd with every non-alphanumeric character replaced by ->/<conversation uuid>.jsonl`. Files in subfolders (subagents) are not conversations and are skipped.
- Claude Code writes `~/.claude/sessions/<pid>.json` for each running process, including `sessionId` and the conversation `name`. This identifies the exact conversation of a tmux pane even when several sessions share a folder. It is an undocumented internal file (a known shortcut); when it is missing, termi falls back to the newest transcript of the folder.
- A conversation name with `nameSource: "derived"` is generated by Claude (for example `termi-fb`) and is not shown as a title. A `custom-title` record is the name the user gave the conversation and wins over the summary and the first prompt.
- Plan limits are only available through the statusline. `scripts/claude-statusline.mjs`, installed with `npm run claude-usage`, copies itself into the data directory and, when Claude Code runs it, writes `claude-usage.json` next to itself. Because Claude Code runs it outside termi's environment, it cannot read `TERMI_DATA`; its own location is the data directory. Per the Claude Code docs only Pro, Max and Ultra plans report `rate_limits`, and each window may be missing.
- The statusline stores live context usage by conversation id (and by folder, for older versions of the script). Entries older than 30 minutes are ignored and the transcript's last `usage` record is used instead.
- The card's model name prefers the statusline's display name (for example "Opus 5.5") and otherwise formats the model id of the latest reply.

### Codex

- Transcripts live in `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl`; the first record is `session_meta` with the conversation id and folder. The transcript of a folder is the newest of the 30 most recent rollouts whose `session_meta.cwd` matches.
- Plan limits and context usage come from the latest `token_count` event in the newest rollout file.
- Tool calls arrive as `function_call` or `custom_tool_call`. For `exec`/`shell` the command is taken from the `cmd: "…"` text or the `command` array.

### Transcript parsing

- Lines are read from the end of the file, newest first. Within one line the events are reversed before the whole list is reversed back, which keeps their original order.
- Text that the agent harness injects (starting with `<`, or Codex's `# AGENTS.md` preamble) is not a user message and is skipped.
- `chatItems` emits one item per text block and groups consecutive tool calls into one card; `transcriptMessages` joins the text blocks of a record into one message. They are kept separate because merging them would change the card preview and the copy view.
- Session listing runs every 3 seconds, so the transcript path is cached for 15 seconds per agent, folder and process, and the parsed latest reply is cached until the file's modification time changes.
- Conversation history reads only the head of each file and stops once id, folder and title are known (for Claude also a custom title). Entries are cached per file and modification time. Filtering by folder scans the 300 newest files, because the folder is only known after reading.

## Sessions (`src/sessions.mjs`, `src/snapshot.mjs`)

- A pane belongs to an agent when the agent process is one of its descendants. `agentPanes` walks up from every agent process (at most 64 levels, stopping at pid 1) and marks each ancestor; the first agent found wins.
- The session list is built every 3 seconds, so the uncommitted-file count of each folder is cached for 15 seconds. A folder that is not a git repository counts as `null`.
- The card preview drops box-drawing frames, the agent logo and the footer hints (`⏵`, `? for shortcuts`) and keeps the last three lines with real content. For agent sessions the latest reply from the transcript replaces it, because it reads better than captured terminal text; while the agent waits for a confirmation the screen is kept, because the question is not in the transcript.
- `since` (when the current state began, for "running for 3 minutes") is kept on the server so every device shows the same time.
- The snapshot is written every 30 seconds. An empty tmux (right after a reboot) never overwrites it. Sessions in the snapshot that are gone after tmux restarted become `pending` and are offered for restore. Closing a session on purpose removes it from the snapshot at once, so it is not offered again.

## Terminal routes (`src/routes/terminal.mjs`)

- `/api/resize` sets the tmux window to the size of the device that is looking at it. By default tmux only resizes on a key press, so a phone and a computer on the same session would see dots or a cut-off frame.
- `/api/refresh` asks tmux to redraw for every attached client; a live connection then gets text at once.
- `/api/send` leaves copy mode first: while the user scrolls back, typed text would be read as copy-mode commands. Text goes through `paste-buffer -p` (bracketed paste) so a multi-line message is not sent line by line.
- `/api/menu-submit` moves the cursor to `Submit` in a multi-select menu and presses Enter. When `Submit` is scrolled out of view it presses ↓ and looks again, up to 25 times.

## HTTP layer (`src/http/`)

- Request order (`handler.mjs`): Host check, identity check, Origin check, then the peer proxy (`/m/<machine>/…`), the ttyd proxy (`/term`), static files, the `X-Termi` check for POST, and finally the API router.
- Identity: `tailscale serve` puts the sender's login in `Tailscale-User-Login` and overwrites a forged header. Only the machine owner (or `TERMI_ALLOWED_USERS`) gets in. Tagged devices, shared machines and Funnel have no such identity and are refused. A request without the header is allowed only on `localhost`/`127.0.0.1`, i.e. directly on this machine. When the owner cannot be determined, every tailnet request is refused (fail closed).
- `X-Termi: 1` on POST: a custom header forces a CORS preflight that termi never answers, which blocks cross-site form posts (CSRF).
- WebSockets are not covered by CORS, so a foreign page could open one to the terminal. The upgrade is accepted only with the app's own Origin.
- Static pages are sent with `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` so no other site can frame termi (clickjacking).
- `/api/raw` serves images only, with `Content-Security-Policy: sandbox` and `nosniff`, so an SVG opened directly cannot run script on termi's origin.
- Every JSON response carries `x-termi-build`, the modification time of `index.html`. An open page that sees a different value reloads itself.
- The terminal (ttyd) is proxied under `/term` on the same origin as the app; only then can the app change the font size, scroll by touch and reconnect.

## Machines and peer proxy (`src/machines.mjs`, `src/http/proxy.mjs`)

- Other machines run their own termi behind `tailscale serve`; this machine forwards `/m/<machine>/…` to them. Only desktop peers (Windows, Linux, macOS) without tags that answer `/api/agents` count, and only those are proxied to. Without Tailscale (for example inside WSL) the list is just this machine.
- Proxying to a peer rewrites `Host` and `Origin` to the peer's name, because ttyd there checks the origin. This is safe because the local guards already refused foreign origins. The peer's `x-termi-build` is dropped: its UI version has nothing to do with the page that is open.
- The watcher also polls peers that run termi, so notifications only need to be enabled on one machine.

## ttyd watchdog (`src/ttyd-watchdog.mjs`)

- ttyd 1.7.7 does not clean up the tmux client of a connection that drops abruptly (phone asleep, lost signal). Every stuck client keeps a pty; at the file limit ttyd cannot open new terminals, and only restarting ttyd clears them.
- An orphan is a child of ttyd that is not an attached tmux client. With nobody connected ttyd is restarted at 20 orphans; while someone is using it, only at 150 (the terminal reconnects by itself).

## Files and uploads (`src/routes/files.mjs`)

- An upload is the raw file body. It is stored as `<data>/uploads/<timestamp>-<random>-<sanitized name>` (opened with `wx`, max 25 MB) and the path is returned so it can be pasted into a prompt.

## System usage (`src/system.mjs`)

- CPU is the 1-minute load average divided by the number of cores.
- On macOS `os.freemem()` does not count cached memory and always looks almost full, so memory comes from `memory_pressure`. On Linux it is `MemAvailable` from `/proc/meminfo`.

## Web Push

- termi sends Web Push messages without a payload. Without a payload only the VAPID signature (ES256 JWT) is required; no message encryption is needed. The app fetches the details from `/api/push/alert` when the notification arrives.
- Failed deliveries are logged, including 404/410, so it is clear why a subscription was removed.
- The in-app inbox keeps the last 30 events (agent done, agent waiting) even when push is not enabled. Notification settings (event kinds, quiet hours that may cross midnight, muted sessions) only filter push messages.

## Static files

- Bundled fonts are served from `/fonts/<name>.woff2` and `/fonts/fonts.css`. Only file names matching `^[a-z0-9-]+\.(woff2|css)$` are exposed.
