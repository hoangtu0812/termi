# Implementation Notes

| | |
|---|---|
| Version | 1.2 |
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

## Web Push

- termi sends Web Push messages without a payload. Without a payload only the VAPID signature (ES256 JWT) is required; no message encryption is needed. The app fetches the details from `/api/push/alert` when the notification arrives.

## Static files

- Bundled fonts are served from `/fonts/<name>.woff2` and `/fonts/fonts.css`. Only file names matching `^[a-z0-9-]+\.(woff2|css)$` are exposed.
