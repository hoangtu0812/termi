# VS Code web next to termi

| | |
|---|---|
| Version | 1.0 |
| Status | Active |
| Last updated | 2026-11-27 |

termi does not host an editor. It can open the current folder in a VS Code web server that runs on the same machine. This guide sets one up with the official `code serve-web` command and wires it into termi.

## 1. Run VS Code web as a service (macOS)

VS Code must be installed. Create `~/Library/LaunchAgents/vn.termi.vscode.plist` that runs:

```
/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code-tunnel serve-web \
  --host 127.0.0.1 --port 7682 --without-connection-token \
  --accept-server-license-terms --disable-telemetry
```

with `RunAtLoad` and `KeepAlive` set, then load it:

```
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/vn.termi.vscode.plist
```

The first start downloads the VS Code server, so the page can take a few seconds to answer. The log is in `~/Library/Logs/termi.vscode.log`. On Linux, run the same `code serve-web` arguments from a systemd user unit.

## 2. Expose it on the tailnet only

```
tailscale serve --bg --https=9443 http://127.0.0.1:7682
```

The server listens on `127.0.0.1` and `tailscale serve` is the only way in, the same model as termi itself. That is why `--without-connection-token` is acceptable here: tailnet membership is the access check. Do not expose the port any other way.

## 3. Tell termi where it is

In Settings, under VS Code web, enter `https://<machine>.<tailnet>.ts.net:9443`. The Files panel then shows a `</>` button that opens the folder being browsed, using VS Code's `?folder=` query. Clear the field to hide the button. The value is stored in `~/.termi/editor.json`, so upgrades keep it.

## Notes

- VS Code asks once per folder whether to trust it (Restricted Mode).
- The editor uses about 300–500 MB of RAM while a window is open.
- `scripts/install.sh uninstall` also removes the `vn.termi.vscode` service and the `:9443` serve entry.
