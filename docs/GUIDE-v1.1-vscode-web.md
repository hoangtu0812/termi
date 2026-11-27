# VS Code web next to termi

| | |
|---|---|
| Version | 1.1 |
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

## 2. Compress it

`code serve-web` sends its scripts uncompressed, about 25 MB on the first load. Over a relayed Tailscale connection (`tailscale status` shows `relay` instead of `direct`) that takes minutes, and an interrupted first load can leave a broken copy in the browser cache for a year because the files are served with `max-age=31536000`. `scripts/vscode-proxy.mjs` sits in front of it, compresses text responses with brotli or gzip (25 MB becomes about 6 MB) and passes WebSockets through unchanged. Run it as a second service, `vn.termi.vscode-proxy`:

```
/opt/homebrew/bin/node ~/.termi/app/current/scripts/vscode-proxy.mjs
```

It listens on `127.0.0.1:7683` and forwards to `7682`; `VSCODE_PROXY_PORT` and `VSCODE_UPSTREAM_PORT` change the ports.

## 3. Expose it on the tailnet only

```
tailscale serve --bg --https=9443 http://127.0.0.1:7683
```

The server listens on `127.0.0.1` and `tailscale serve` is the only way in, the same model as termi itself. That is why `--without-connection-token` is acceptable here: tailnet membership is the access check. Do not expose the port any other way.

## 4. Tell termi where it is

In Settings, under VS Code web, enter `https://<machine>.<tailnet>.ts.net:9443`. The Files panel then shows a `</>` button that opens the folder being browsed, using VS Code's `?folder=` query. Clear the field to hide the button. The value is stored in `~/.termi/editor.json`, so upgrades keep it.

## Notes

- VS Code asks once per folder whether to trust it (Restricted Mode).
- The editor uses about 300–500 MB of RAM while a window is open.
- If the editor shows "The editor failed to load" on one device only, clear that site's data in the browser and load it again.
- `scripts/install.sh uninstall` also removes the `vn.termi.vscode` and `vn.termi.vscode-proxy` services and the `:9443` serve entry.
