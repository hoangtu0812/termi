# Changelog

English | [Tiếng Việt](CHANGELOG.vi.md)

All notable changes to termi are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Desktop layout in the style of VS Code: an activity bar on the left (Sessions, File, Git, Pipelines; history, notifications and settings at the bottom), a side panel showing the chosen view, and a main area with only Chat | Terminal of the open session. Files and diffs open in the main area. Badges move to the activity bar icons.
- Desktop is denser: 13.5 px text and a thinner header.

### Removed
- The row of session tabs under the header (switch sessions from the side panel or Ctrl/Cmd+K).
- The two-column split of File/Git next to the terminal on very wide screens, replaced by the side panel.
- The on-screen key row on devices with a mouse and keyboard (it stays on touch devices).

## [1.9.0] - 2026-11-27

### Added
- Pipelines is its own tab (Chat · Terminal · File · Git · Pipelines) with its own repository picker; the Git / Pipelines switch inside the Git tab is gone.
- Phones: the bottom bar is Sessions · Chat · Terminal · Code; Code opens the last of File, Git or Pipelines, switched by a sub-tab bar at the top.
- Each session remembers the tab it was last viewed in.
- Tab badges: Chat shows a dot for an unseen reply, Git the number of uncommitted files, Pipelines a red dot when the latest run on the current branch failed or a blue dot while one runs (checked every minute in the background).
- Desktop shortcuts Alt+1…5 for Chat, Terminal, File, Git and Pipelines, also inside the terminal.

## [1.8.0] - 2026-11-27

### Added
- Pipelines in the Git tab (Git / Pipelines switch): GitHub Actions and Azure Pipelines runs of the selected repository, read with the `gh` and `az` CLIs already signed in on the machine (`GET /api/ci`). Filter by pipeline (with its last three results) and by the current branch, runs grouped as queued, running and completed with trigger, author, branch, commit, age and duration; a run opens on the web. Refreshes every 15 s while shown.

## [1.7.0] - 2026-11-27

### Added
- Interface language: Vietnamese or English, switched in Settings → Ngôn ngữ · Language (the page reloads). Dates, voice input and push notifications follow the choice; server messages shown in the app are translated too. New UI text is written in Vietnamese inside `t()` with its English in `public/js/en-*.mjs`, enforced by `test/i18n.test.mjs`.

### Changed
- Architecture overview updated to `docs/ARCH-v1.4-overview.md` with the modules added since 1.0.

## [1.6.0] - 2026-11-27

### Added
- Incident alerts (push and inbox): a machine that stops answering for 5 minutes and when it returns, the disk under the home folder above 95 % or below 5 GB free (at most once a day), termi restarting after a crash, and ttyd being restarted by the watchdog. A new "Sự cố…" switch in the notification settings turns them off.

## [1.5.0] - 2026-11-27

### Added
- Embedded mode: with `TERMI_TOKEN` set, termi accepts requests that carry the token in `X-Termi-Token` instead of a Tailscale identity, so it can run behind another app's reverse proxy (for example one sandbox container per user). See `docs/GUIDE-v1.5-embedded-mode.md`.
- Embedded mode: the token must be at least 32 characters, and it is never forwarded to other machines or to ttyd.

### Changed
- The web app uses relative URLs, so it works when served under a path prefix such as `/sandbox/ui/`.

## [1.4.0] - 2026-11-27

### Changed
- Session states update over a server push stream (`GET /api/stream`): new sessions, "waiting for you" and finished replies show within about a second, and the app polls only every 15 s as a fallback, which saves battery on phones.

## [1.3.0] - 2026-11-27

### Added
- WSL: the installer keeps the Linux distribution running at Windows logon, so the machine no longer disappears from the list when the Ubuntu window is closed.
- macOS: the server rotates `~/Library/Logs/termi.*.log` above 5 MB.

### Changed
- Implementation notes renamed to `docs/NOTES-v1.9-implementation-notes.md` with the rationale for this release.
- While termi restarts (for example during an upgrade) the app shows the "connecting" page and returns by itself instead of a browser 502 error; API calls treat it as a lost connection.

## [1.2.0] - 2026-11-27

### Added
- Switching sessions keeps up to four terminals connected in the background, so going back is instant and does not reload.
- A connection dot in the header (green / amber / red) shows whether the server and terminal are reachable and how long ago data arrived.
- Messages sent while offline are kept in an outbox, shown above the composer, and sent automatically when the connection returns.

### Changed
- A new termi build no longer reloads the page by itself while you use it; a "Có bản termi mới · Tải lại" bar appears instead.

## [1.1.0] - 2026-11-27

### Added
- Session list: filter chips (All / Waiting / Working / Idle) with counts, and rename/close buttons that appear on hover.
- Git history is grouped by day ("Hôm nay", "Hôm qua", then dates) and shows an author initial badge.
- Two-column diffs highlight the changed part of each modified line.
- Files tab: clickable breadcrumb path, search by file name across the folder (`GET /api/find`), line numbers when viewing code.
- Phones: dialogs open as bottom sheets, swipe from the left edge to go back, pull down to refresh chat, files, git and the session list, light haptics on send, tab change and closing a session.

### Changed
- Long session names keep their distinguishing tail (`BSR-Digi…-3`) instead of being cut at the end.
- The chat column stays 820px wide but the whole pane scrolls, not only the column.

### Fixed
- `npm run check` no longer fails on macOS AppleDouble (`._*`) files created on exFAT drives.

## [1.0.1] - 2026-11-27

### Fixed
- Settings → "Báo khi": checkboxes sat above their labels and the quiet-hours time fields took a full line each; they now line up, and on phones the time range wraps as one block.

## [1.0.0] - 2026-11-27

### Added
- Engineering rules for coding agents in `AGENTS.md` (Vietnamese: `AGENTS.vi.md`), loaded by Claude Code through `CLAUDE.md`.
- Architecture refactor plan `plan/PLAN-v1.8-architecture-refactor.md`.
- Implementation notes `docs/NOTES-v1.9-implementation-notes.md` for rationale moved out of code comments.
- `npm run check`: zero-dependency checks for comments, file and line length, syntax and document names, with an allowlist for legacy files that can only shrink.
- `npm run verify` (check + tests) and a GitHub Actions CI workflow on Ubuntu and macOS.
- `.editorconfig`.
- `TERMI_DATA` environment variable to choose the data directory (default `~/.termi`).
- Changelog in English and Vietnamese.

### Changed
- README is now in English, with the Vietnamese version in `README.vi.md`.
- Screenshots moved to `docs/assets/screenshots/`.
- Documents in `docs/` and `plan/` follow the `<PREFIX>-v<MAJOR>.<MINOR>-<slug>.md` naming rule.
- Commits, releases and the changelog are written in English.
- State files in the data directory are written atomically and one at a time per file.
- A corrupt state file is moved aside as `<name>.corrupt-<timestamp>` and logged instead of being silently replaced.
- A corrupt `vapid.json` stops the server with a clear error instead of generating a new key, which would break every push subscription.
- `src/server.mjs` is now only the entry point; the server code moved to `src/app.mjs`, with configuration in `src/config.mjs` and persistence in `src/store.mjs`.
- Validation, text helpers, git and tmux code moved out of `src/app.mjs` into `src/validate.mjs`, `src/text.mjs`, `src/git/` and `src/tmux/`, each with its own tests.
- Agent-specific code (Claude Code, Codex, Antigravity) moved into one adapter per agent under `src/agents/`.
- `src/app.mjs` is gone: the HTTP layer lives in `src/http/`, the API in one file per area under `src/routes/`, Web Push in `src/push/`, and sessions, snapshots, machines and the ttyd watchdog in their own modules; `src/start.mjs` wires them together.
- Server logs are in English.
- The web client is split into `public/css/` (10 stylesheets) and `public/js/` (native ES modules); `index.html` is markup only. Any change to a UI file now makes open pages reload.
- Comments were removed from every source file, including the installers, the service worker and the Claude statusline; their rationale lives in `docs/NOTES-v1.9-implementation-notes.md`. The rule-check allowlist is empty.
- Every function is at most 40 lines; client modules no longer touch the browser while loading, so their logic has unit tests.
- The shell scripts are executable in the repository.
- `docs/ARCH-v1.4-overview.md` describes the module map.

### Performance
- The session list is built at most once per second and shared by every open device and the notification watcher; five concurrent requests with 10 agent sessions dropped from about 65 ms to 19 ms.
- Usage, chat and copy views look up one session instead of rebuilding the whole list (18 ms to 7 ms with 10 sessions).

### Fixed
- `npm test` failed on Node 24 (`MODULE_NOT_FOUND`) and ran no tests.
- Tests no longer write to the real `~/.termi`.
- Claude usage was missing when the server ran with a `TERMI_DATA` other than `~/.termi`; the statusline now writes next to its installed copy.
- The chat view no longer fails on a tool call whose input is the JSON value `null`.
- Closing a session, restoring and the periodic snapshot could overwrite each other's changes to `sessions.json`.

## [0.12.0] - 2026-11-26

### Changed
- Claude-style chat: replies without bubbles, code blocks with a language bar and copy button, compact step cards.
- The terminal uses the app's color palette, with inner padding and a bar cursor.
- The welcome screen shows a greeting and offers to continue the most recent conversation.
- Agents are picked from cards with their logos.

## [0.11.0] - 2026-11-26

### Changed
- New look: Be Vietnam Pro and JetBrains Mono fonts (terminal included), a minimal palette, and the "working" bar became a small pill in the header.

### Fixed
- Numbered lists in agent replies were mistaken for a choice menu.

## [0.10.5] - 2026-11-26

### Fixed
- WSL: use ports 7690/7691 because Windows already holds 7680, and bind ttyd to 127.0.0.1 in mirrored networking mode.

## [0.10.4] - 2026-11-26

### Added
- Selecting text in the terminal copies it to the clipboard (OSC 52 from tmux).

### Removed
- The row of recently sent messages above the message box (the last message can still be recalled with ↑).

## [0.10.3] - 2026-11-26

### Fixed
- Screen flicker: when the connection looks stalled, ask tmux to redraw first and reload only if it is really stalled.

## [0.10.2] - 2026-11-26

### Fixed
- Screen flicker: the terminal reloaded for no reason on clicks or key presses that produced no output.

## [0.10.1] - 2026-11-26

### Added
- Paste images or drag and drop files into the chat box.

### Fixed
- Flicker caused by the confirmation bar showing and hiding, which kept resizing the terminal.

## [0.10.0] - 2026-11-26

### Added
- Multi-select menus answered inside the app.
- Editable quick actions.
- One session list across all machines.
- Notification settings.

### Fixed
- The terminal regains its full size when returning to a window after a phone forced it smaller.

## [0.9.0] - 2026-11-26

### Added
- Chat shows the steps the agent takes.
- Command palette (Ctrl/Cmd+K).
- "What the agent is doing" bar.
- Quick actions list.

### Fixed
- Flickering confirmation bar.

## [0.8.1] - 2026-11-26

### Added
- Conversation names as shown in Claude, and the model in use.

### Fixed
- The tab bar disappeared after sending a message.

## [0.8.0] - 2026-11-26

### Added
- Project tree like Claude Code desktop.
- Chat mode.
- Quick confirmation buttons.
- Voice input.
- Settings page.

## [0.7.0] - 2026-11-26

### Changed
- The tmux window follows the size of the device being touched or typed on, not only when the terminal opens.
- A more app-like UI, quick session switching and nicer code viewing.

## [0.6.0] - 2026-11-26

### Added
- Install without cloning: `scripts/get.sh` downloads the installer from the latest release.
- Split view on desktop, smart message box, live session cards and a notification inbox.

## [0.5.0] - 2026-11-26

### Added
- Session cards preview the agent's latest reply.
- Commit view with a file list; a cleaner Git tab.
- Sessions grouped by project folder, a + button to create a session in a project, and history filtered by the session's folder.
- Restore sessions after a machine reboot.

### Fixed
- The terminal no longer freezes after the phone sleeps or changes networks.
- ttyd pty leaks are cleaned up and reconnects are more robust.
- Closed sessions were recreated when opening an old link or reconnecting.

## [0.4.0] - 2026-11-26

### Changed
- The terminal fits its frame; the File tab shows icons and git status; new session list and welcome screen.

## [0.3.0] - 2026-11-26

### Added
- Agent icons on session cards and history (Claude, OpenAI Codex, Antigravity, shell).
- 📋 Copy button that opens the session text for selecting and copying.
- `npm run claude-usage` shortcut.

### Changed
- Usage panel with icons and a pinned close button; the send button sends in one tap.

### Security
- Only the machine owner can access termi.
- WebSockets from foreign origins are blocked.
- The page cannot be embedded by other sites.

## [0.2.1] - 2026-11-26

### Added
- Notification test shows its result, and dead subscriptions are renewed automatically.

## [0.2.0] - 2026-11-26

### Added
- Usage in the header: agent plan limits, session context and machine resources.

### Changed
- A slimmer header whose subtitle shows only agent · state · folder name.

## [0.1.0] - 2026-11-26

### Added
- Web app to manage Claude Code sessions in tmux from a phone.
- Create a session in any folder, with recent folder suggestions.
- Git graph with colored lanes, merge lines and branch labels.
- Markdown preview in the file viewer, with SVG images and Mermaid diagrams.
- Auto / Light / Dark theme.
- Terminal with swipe to scroll, font size controls and tap or automatic reconnect.
- Screen Wake Lock while the app is open.
- ⚡ Quick actions that send prepared requests to Claude.
- Multiple agents: Claude Code, Codex and Antigravity.
- Control several machines in the tailnet, with an installer for Linux and WSL.
- Image gallery picker; attachments shown as thumbnails.
- The page reloads itself when a new version is available.
- README with logo, tech stack, screenshots, architecture and install guide.

### Changed
- Standard project layout: `src/`, `scripts/`, `test/`, `package.json`.

### Fixed
- Toolbar keys no longer open the phone keyboard.
- The terminal font size no longer resets on reload.
- The message box was covered by the open keyboard.
- Terminal font on Android (Courier removed from the font list).
- macOS `._*` junk files on NTFS drives are ignored.

[Unreleased]: https://github.com/hoangtu0812/termi/compare/v1.9.0...HEAD
[1.9.0]: https://github.com/hoangtu0812/termi/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/hoangtu0812/termi/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/hoangtu0812/termi/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/hoangtu0812/termi/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/hoangtu0812/termi/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/hoangtu0812/termi/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/hoangtu0812/termi/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/hoangtu0812/termi/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/hoangtu0812/termi/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/hoangtu0812/termi/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/hoangtu0812/termi/compare/v0.12.0...v1.0.0
[0.12.0]: https://github.com/hoangtu0812/termi/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/hoangtu0812/termi/compare/v0.10.5...v0.11.0
[0.10.5]: https://github.com/hoangtu0812/termi/compare/v0.10.4...v0.10.5
[0.10.4]: https://github.com/hoangtu0812/termi/compare/v0.10.3...v0.10.4
[0.10.3]: https://github.com/hoangtu0812/termi/compare/v0.10.2...v0.10.3
[0.10.2]: https://github.com/hoangtu0812/termi/compare/v0.10.1...v0.10.2
[0.10.1]: https://github.com/hoangtu0812/termi/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/hoangtu0812/termi/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/hoangtu0812/termi/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/hoangtu0812/termi/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/hoangtu0812/termi/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/hoangtu0812/termi/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/hoangtu0812/termi/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/hoangtu0812/termi/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/hoangtu0812/termi/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/hoangtu0812/termi/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/hoangtu0812/termi/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/hoangtu0812/termi/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hoangtu0812/termi/releases/tag/v0.1.0
