# xce-mcp

让本机的 MCP 客户端直接读写 **XMUER Coding Engine 桌面版**里打开的那个项目。

它自己不含任何编辑逻辑：桌面版启动时在主进程开一个只监听 `127.0.0.1` 的 AI 桥，编辑器把当前这套 AI 工具（`xce_*`）报给桥；这个包只做 MCP ⇄ 桥的转接。

## 条件

- Windows 桌面版（`XMUER Coding Engine`），编辑器里打开一个项目
- Node.js 20+

## 配置

Claude Code：

```bash
claude mcp add xce -- npx -y xce-mcp
```

通用 `mcpServers` 配置：

```json
{
  "mcpServers": {
    "xce": {
      "command": "npx",
      "args": ["-y", "xce-mcp"]
    }
  }
}
```

从源码跑：

```bash
node packages/xce-mcp/bin/xce-mcp.mjs
```

## 它怎么找到编辑器

桌面版启动时把端口和一次性口令写进 `%APPDATA%\XMUER Coding Engine\ai-bridge.json`（只监听 `127.0.0.1`，口令每次启动重新生成）。这个包读那个文件去连。

环境变量：

| 变量 | 作用 |
|---|---|
| `XCE_BRIDGE_FILE` | 换一个发现文件 |
| `XCE_BRIDGE_PORT` / `XCE_BRIDGE_TOKEN` | 直接给端口和口令（跳过发现文件，调试用） |

## 行为

- 工具清单就是编辑器里 AI 面板那套 `xce_*`，schema 由编辑器在运行时给出；服务没连上时用上次写下的清单。
- 调用串行执行；面板自己正在跑一轮时，外部来的**写操作**会被拒绝（避免两边同时改一个项目）。
- 编辑器断开后调用会报 `E_NO_EDITOR`，重新打开编辑器即恢复。

## 许可

Apache-2.0，见 LICENSE。它不包含 XMUER Coding Engine 的代码或工具描述；随编辑器分发的部分按编辑器自己的许可（AGPL-3.0-only）。
