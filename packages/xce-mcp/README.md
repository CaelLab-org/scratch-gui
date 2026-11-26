# xce-mcp

让本机的 MCP 客户端直接读写 **XMUER Coding Engine 桌面版**里打开的那个项目。

它自己不含任何编辑逻辑：桌面版启动时在主进程开一个只监听 `127.0.0.1` 的 AI 桥，编辑器把当前这套 AI 工具（`xce_*`）和技能清单报给桥；这个包只做 MCP ⇄ 桥的转接。

完整说明（各客户端配置、排错、安全边界）：<https://engine.xmuer.online/desktop/mcp/>

## 条件

- Windows 桌面版（`XMUER Coding Engine`），并且打开了一个项目
- Node.js 20+

## 配置

Claude Code：

```bash
claude mcp add xce -- npx -y xce-mcp
```

通用 `mcpServers` 配置（Cursor、Cline、Windsurf 等）：

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

各客户端的文件位置：

| 客户端 | 位置 | 顶层键 |
|---|---|---|
| Claude Code | `claude mcp add` | — |
| ZCode | `~/.zcode/cli/config.json` | `mcp.servers` |
| Cursor | `~/.cursor/mcp.json` 或 `.cursor/mcp.json` | `mcpServers` |
| VS Code | 项目里的 `.vscode/mcp.json` | `servers` |
| Codex CLI | `~/.codex/config.toml` | `[mcp_servers.xce]` |
| Cline / Windsurf | 客户端设置里加 | `mcpServers` |

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

## 工具（tools）

工具清单就是编辑器里 AI 面板那套 `xce_*`，schema 由编辑器在运行时给出；服务没连上时用上次写下的清单。大致分这几类：

- 读项目：`xce_read_project` / `xce_read_state` / `xce_list_sprites` / `xce_read_costume` / `xce_read_stage`
- 写项目：`xce_write_script` / `xce_edit_script` / `xce_delete_script` / `xce_add_sprite` / `xce_edit_costume`
- 建东西：`xce_create_variable` / `xce_create_list` / `xce_create_procedure`（自定义积木）/ `xce_add_extension`（内置扩展）
- 运行：`xce_run_project` / `xce_trigger_event`
- 记忆与笔记：`xce_read_memory` / `xce_save_memory` / `xce_read_project_memory` / `xce_write_project_memory`
- 联网：`xce_read_online` / `xce_search`

调用串行执行；面板自己正在跑一轮时，外部来的**写操作**会被拒绝（避免两边同时改一个项目）。只读操作不受影响。

## 技能（prompts）

编辑器里的参考文档（内置 `xce_fastdocs_*`，加上用户自己写或导入的技能）以 **MCP prompt** 的形式给出去：

- `prompts/list` 返回名字和一行描述；没连上时用上次缓存的清单。
- `prompts/get` 实时从编辑器读正文。编辑器没开、或没打开项目时会报错。
- 正文不在这个包里存副本；技能改了不用重发 npm 包。

在编辑器「设置 → 技能」里可以新增，也可以从 `.md` 文件导入。格式跟 `SKILL.md` 一致：

```markdown
---
name: my_rules
description: 一行话，写清什么时候该读它
---

正文。
```

没有 `---` 头也能导入，按文件名起名。名字只能用字母、数字、下划线、连字符（2~40 位）。

## 排错

| 现象 | 处理 |
|---|---|
| 客户端里没有 `xce` 工具 | 先在终端跑 `npx -y xce-mcp`，看装包或启动报错 |
| `editor is not connected` | 桌面版开着但没打开项目，打开一个再试 |
| 写操作被拒绝 | 面板里的 XCE Agent 正在跑一轮，等它结束 |
| `E_AUTH` | 应用重启过，口令变了；重启客户端让它重读发现文件 |
| prompt 只有清单没有正文 | 应用没开或没打开项目，正文是实时读的 |

## 许可

Apache-2.0，见 LICENSE。它不包含 XMUER Coding Engine 的代码或工具描述；随编辑器分发的部分按编辑器自己的许可（AGPL-3.0-only）。
