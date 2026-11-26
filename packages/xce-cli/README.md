# xce-cli

Command line access to the project open in **XMUER Coding Engine** — a Scratch-like block
editor. Built for AI agents: it speaks MCP, and it also has plain commands for agents that
only run shell commands.

The package holds no tool descriptions and no editor code. Tools are read from the running
editor every time, so it keeps working when the editor adds new ones.

## Two ways in

| Transport | Who it is for | Setup |
| --- | --- | --- |
| Local bridge (WebSocket) | Desktop app on the same machine | Nothing — the app writes `ai-bridge.json` on launch |
| Network endpoint (HTTP) | Another machine, a container, a web-based agent | Editor → AI panel → 设置 → 外部接入 → turn on, copy URL + key |

The network endpoint is **off by default**. Turning it on generates an API key and listens on
port `49621`; turning it off stops listening immediately. The key stays the same across
restarts until you rotate it.

## Commands

```bash
xce mcp                       # MCP server over stdio
xce tools                     # list tools and skills
xce call <tool> '{"a":1}'     # call one tool
xce skill --out SKILL.md      # write an agent skill file
xce doctor                    # check what is reachable
xce snippets                  # print config snippets for network mode
```

Options: `--url http://host:49621/v1`, `--key xce_...`, `--json`, `--out <file>`.
Without `--url` it uses the local bridge (or the network endpoint if that is the only one on).

## MCP

```bash
# Claude Code
claude mcp add xce -- npx -y xce-cli@latest mcp --url http://192.168.1.10:49621/v1 --key xce_...

# any client that reads a JSON config
{
  "mcpServers": {
    "xce": {
      "command": "npx",
      "args": ["-y", "xce-cli@latest", "mcp", "--url", "http://192.168.1.10:49621/v1", "--key", "xce_..."]
    }
  }
}
```

`tools/list` returns the editor's tools; the editor's reference documents are exposed as MCP
**prompts** (`prompts/list` / `prompts/get`), with the text fetched from the editor when the
prompt is loaded.

## HTTP

```bash
curl -s http://127.0.0.1:49621/v1/health
curl -s http://127.0.0.1:49621/v1/tools -H "Authorization: Bearer $XCE_KEY"
curl -s http://127.0.0.1:49621/v1/call -H "Authorization: Bearer $XCE_KEY" \
  -H "Content-Type: application/json" -d '{"name":"xce_read_project","args":{}}'
```

`/v1/health` is unauthenticated and returns only liveness. Everything else needs the key.

## Notes

- Calls are serialized: two clients cannot write the same project at once.
- `E_NO_EDITOR` means the app is running but no project is open.
- If the user is running a turn in the editor's AI panel, write calls fail fast instead of
  queueing behind it.
- Only `GET /v1/health`, `GET /v1/tools`, `POST /v1/call` exist. No filesystem, no shell.

Licensed under Apache-2.0.
