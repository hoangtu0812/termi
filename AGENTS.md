# termi — Engineering Rules for Coding Agents

English | [Tiếng Việt](AGENTS.vi.md)

These rules apply to every human and AI agent that changes this repository. They are mandatory. When a rule conflicts with an older part of the codebase, follow the rule for the code you touch and leave the rest to the refactor plan in `plan/`.

## 1. Product constraints

- termi is a zero-dependency Node.js (≥ 24) server plus a no-build static PWA. Do not add runtime dependencies, bundlers, transpilers or frameworks.
- Only Node built-in modules (`node:*`) on the server. Browser-native APIs and ES modules on the client.
- The server listens on `127.0.0.1` only. The single entry point from outside is `tailscale serve`. The one exception is embedded mode (`TERMI_TOKEN`, `docs/GUIDE-v1.5-embedded-mode.md`), where a trusted reverse proxy is the entry point and every request must carry the token.
- Client URLs are relative (`api/...`, not `/api/...`) so the app works under any path prefix.
- Supported hosts: macOS, Linux, Windows via WSL2. Any OS-specific branch must handle all three.

## 2. No comments in code

- Do not write comments in any source file: `.mjs`, `.js`, `.sh`, `.css`, `.html`, `.json`. This includes line comments, block comments, JSDoc, HTML comments, commented-out code, TODO/FIXME markers and section banners.
- The only allowed non-code lines are a shebang (`#!/bin/bash`, `#!/usr/bin/env node`) and machine directives that a tool requires to work.
- Make the code explain itself instead: precise names, small functions, named constants instead of magic numbers, early returns, and explicit data shapes.
- Rationale that cannot be expressed in code belongs in:
  - the commit message body (why this change was made),
  - `docs/` (why the system works this way: workarounds, platform quirks, security decisions),
  - tests (what behavior is required).
- When you edit a file that still contains legacy comments, move any non-obvious rationale from the lines you touch into the matching `docs/` file, then delete those comments in the same change.

## 3. Architecture and modularity

- One module = one responsibility. A module must be describable in one sentence without "and".
- Target layout (see `plan/` for the migration):

  ```
  src/
    server.mjs        bootstrap only: load config, call start()
    config.mjs        environment and constants
    store.mjs         JSON persistence with atomic writes
    http/             router, auth, static files, proxying
    routes/           one file per API area
    agents/           one adapter per agent (claude, codex, agy)
    tmux/             session listing and screen parsing
    git/              git runner, parsers, graph layout
    push/             VAPID, Web Push, state watcher
  public/
    index.html        markup only
    css/              stylesheets
    js/               native ES modules, one per feature
  ```

- Size limits: a source file ≤ 300 lines, a function ≤ 40 lines, a line ≤ 120 characters. Split before you exceed them.
- No side effects at import time. Importing a module must not create directories, read or write files, spawn processes, generate keys or start timers. Do that inside an explicit `start()` / `init()` function.
- Pass dependencies in (paths, roots, clocks, runners) instead of reading globals, so code is testable.
- Agent-specific behavior lives only in `src/agents/<agent>.mjs` behind a common interface. No `if (agent === 'claude')` outside that folder.
- Keep pure logic (parsers, layout, validation) separate from I/O. Pure functions must not touch the filesystem, network or processes.
- Do not duplicate logic. If two places parse the same format, extract one function.

## 4. Correctness and safety

- Never use a shell. Run external commands with `execFile` and an argument array.
- Validate every input from HTTP, files and other machines with the existing validators (`validName`, `validBranch`, `validRev`, `validUuid`, `validGitPath`, `safePath`). Add a validator plus a test for any new input type.
- Every filesystem path from a request must go through `safePath` (realpath + `TERMI_ROOTS` check).
- Never weaken the request guards: Host check, Tailscale identity check (fail closed), `X-Termi` header on POST, WebSocket Origin check, CSP and frame headers.
- Client code must not build HTML from data. Use `textContent` and DOM APIs; `innerHTML` is allowed only for static, trusted markup.
- Persist state with atomic writes (write a temp file, then `rename`) and serialize read-modify-write cycles on the same file.
- Bound every external read: timeouts on processes and fetches, size caps on bodies, files and output.
- Errors that reach the client use `fail(status, message)`. Unexpected errors are logged server-side and returned as a generic 500.
- Identifiers, file names and logs are in English. User-facing UI strings are written in Vietnamese and wrapped in `t()` from `public/js/i18n.mjs`; add the English text to `public/js/en-*.mjs` in the same change (`test/i18n.test.mjs` enforces both).

## 5. Style

- ES modules, `const` by default, `let` only when reassigned, never `var`.
- Async/await; no unhandled promises. Fire-and-forget calls must end with `.catch(...)` that logs.
- Prefer clarity over cleverness: one statement per line, no chained ternaries deeper than one level, no dense one-liners that hide control flow.
- Names: `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for module constants, `kebab-case` for file names.
- 2-space indentation, single quotes, semicolons, trailing commas in multi-line literals.

## 6. Tests

- Use `node:test` and `node:assert/strict` only.
- Every bug fix comes with a test that fails before the fix. Every new pure function comes with tests.
- Tests must not touch the real home directory, `~/.termi`, the user's tmux server, git remotes or the network. Use temp directories and injected dependencies. Tests that need tmux run a private server (`TMUX_TMPDIR` set to a temp directory, `TMUX` unset) through `test/helpers/server.mjs`.
- Run `npm run verify` (rule checks + tests) and make it pass before declaring a task done.
- Never add an entry to `scripts/check-allowlist.json`. Remove entries as files are cleaned up.

## 7. Documentation naming

- Every document in `docs/` and `plan/` is named `<PREFIX>-v<MAJOR>.<MINOR>-<kebab-slug>.md`, for example `PLAN-v1.0-architecture-refactor.md`.
- A Vietnamese translation uses the same name with `.vi.md`: `PLAN-v1.0-architecture-refactor.vi.md`.
- Prefixes:

  | Prefix | Folder | Use |
  |---|---|---|
  | `PLAN` | `plan/` | Implementation plans and roadmaps |
  | `ARCH` | `docs/` | Architecture and module design |
  | `ADR` | `docs/` | A single architecture decision record |
  | `SPEC` | `docs/` | API or behavior specifications |
  | `GUIDE` | `docs/` | How-to guides for users or developers |
  | `NOTES` | `docs/` | Implementation notes, workarounds and platform quirks |
  | `REVIEW` | `docs/` | Code or architecture reviews |

- The version is the document's own revision. Bump `MINOR` for additions or corrections, `MAJOR` for a rewrite or a change of direction. Rename with `git mv` so history follows the file, and update every link to it.
- Each document starts with a header: title, version, status (`Draft`, `Active`, `Done`, `Superseded`), last updated date (`YYYY-MM-DD`).
- Images and other assets go in `docs/assets/` and are exempt from the naming rule.
- Root files that tools look up by name keep their standard names: `README.md`, `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md`, plus their `.vi.md` translations.

## 8. Language policy

| Artifact | Language |
|---|---|
| Code identifiers, logs | English |
| Commit messages | English |
| GitHub releases and tags | English |
| `CHANGELOG.md` | English, with `CHANGELOG.vi.md` in Vietnamese |
| `README.md` | English, with `README.vi.md` in Vietnamese |
| `AGENTS.md` | English, with `AGENTS.vi.md` in Vietnamese |
| Docs and plans | English; a `.vi.md` translation is optional |
| UI text | Vietnamese source wrapped in `t()`, English in `public/js/en-*.mjs` |

When you change a document that has a translation, update both files in the same commit.

## 9. Commits

- Format: [Conventional Commits](https://www.conventionalcommits.org) in English.

  ```
  <type>(<scope>): <imperative summary, ≤ 72 chars, no trailing period>

  <body: what changed and why, wrapped at 72 chars>
  ```

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`.
- Scopes: `server`, `agents`, `tmux`, `git`, `push`, `http`, `ui`, `terminal`, `scripts`, `docs`, `release`.
- One logical change per commit. Do not mix refactoring with behavior changes.
- Every user-visible change adds a line under `## [Unreleased]` in both `CHANGELOG.md` and `CHANGELOG.vi.md` in the same commit.
- Agents commit only when asked.

## 10. Releases

- Versioning: [SemVer](https://semver.org). Tags are `vX.Y.Z`.
- Release steps:
  1. Move the `Unreleased` entries in both changelogs under `## [X.Y.Z] - YYYY-MM-DD`.
  2. Bump `version` in `package.json`.
  3. Commit `chore(release): vX.Y.Z`.
  4. Tag `vX.Y.Z` and create the GitHub release titled `vX.Y.Z` with the English changelog section as its notes.
  5. Run `npm run release:asset` to attach `termi-X.Y.Z.tgz`.
- Release notes are in English.

## 11. Definition of done

- `npm run verify` passes.
- No comments were added, and no file, function or line exceeds the size limits.
- Changelogs, README and docs (both languages where a translation exists) reflect the change.
- Security guards from section 4 are intact.
