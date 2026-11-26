# Changelog

English | [Tiếng Việt](CHANGELOG.vi.md)

All notable changes to termi are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Engineering rules for coding agents in `AGENTS.md` (Vietnamese: `AGENTS.vi.md`), loaded by Claude Code through `CLAUDE.md`.
- Architecture refactor plan `plan/PLAN-v1.7-architecture-refactor.md`.
- Implementation notes `docs/NOTES-v1.5-implementation-notes.md` for rationale moved out of code comments.
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

[Unreleased]: https://github.com/hoangtu0812/termi/compare/v0.12.0...HEAD
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
