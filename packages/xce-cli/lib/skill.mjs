/**
 * 给「不跑 MCP、只会执行命令 / 发 HTTP」的 agent 用的一份说明书（Agent Skill）。
 *
 * 内容只有调用方式和纪律，**没有工具清单** —— 清单要用 `xce tools` 现取，
 * 编辑器升级工具后这份文件不用跟着改。
 */

export const skillText = ({url, key}) => {
    const endpoint = url || 'http://127.0.0.1:49621/v1';
    const secret = key || '<API_KEY>';
    return `---
name: xce-editor
description: Read and change the project open in XMUER Coding Engine (a Scratch-like block editor). Use when the user asks to inspect or modify their XCE project, sprites, scripts, or block stacks, or wants the project run and checked.
---

# XMUER Coding Engine — editor tools

The user has XMUER Coding Engine (XCE) desktop open with a project. You can read and edit
that project through a small local HTTP API. Every call changes what the user sees in the
editor, so treat it like editing their open file.

## 1. Read the editor's instructions

\`\`\`bash
npx -y @caellab/xce-cli@latest instructions --url ${endpoint} --key ${secret}
\`\`\`

This is the editor's own system prompt — project rules, tool usage, block text format.
Read it before touching the project; do not work from this file alone.

## 2. See what you can do

\`\`\`bash
npx -y @caellab/xce-cli@latest tools --url ${endpoint} --key ${secret}
\`\`\`

That prints every tool with its JSON schema. The list is not fixed and this document
does not repeat it.

## 3. Call a tool

\`\`\`bash
npx -y @caellab/xce-cli@latest call xce_list_sprites '{}' --url ${endpoint} --key ${secret}
npx -y @caellab/xce-cli@latest call xce_write_script '{"sprite":"角色1","text":"when green flag clicked\\nsay [hi!]"}' --url ${endpoint} --key ${secret}
\`\`\`

For audio or other files too large for a JSON argument, upload the raw bytes first and
pass the returned id to the tool:

\`\`\`bash
curl -s -X POST "${endpoint}/assets?name=blast.mp3&mime=audio/mpeg" \\
  -H "Authorization: Bearer ${secret}" --data-binary @blast.mp3
# -> {"ok":true,"assetId":"a1",...}
npx -y @caellab/xce-cli@latest call xce_add_sound '{"sprite":"角色1","assetId":"a1"}' --url ${endpoint} --key ${secret}
\`\`\`

Or plain HTTP, if you would rather not run npx:

\`\`\`bash
curl -s ${endpoint}/instructions -H "Authorization: Bearer ${secret}"
curl -s ${endpoint}/tools -H "Authorization: Bearer ${secret}"
curl -s ${endpoint}/call -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"xce_list_sprites","args":{}}'
\`\`\`

A call returns \`{"ok":true,"content":"...","isError":false}\`. Text in \`content\` is written
for a human to read — quote the parts that matter, do not dump the whole thing.

## 4. Rules

- **Read before writing.** Read the editor instructions, then use a read tool so you know
  the sprite names and the current scripts. Do not guess sprite names.
- **One change per call.** Small edits are easy for the user to follow and easy to undo.
- **The reference documents are skills.** If a tool list includes \`xce_read_fast_docs\`,
  use it to load the editor's own docs instead of guessing block names or API details.
- **The user may be working in the panel at the same time.** If a call fails with
  \`E_BUSY\` or a timeout, wait for them to finish instead of retrying in a loop.
- **No editor connected** (\`E_NO_EDITOR\`) means the app is closed or no project is open.
  Ask the user to open one; retrying will not help.
- Do not print the API key back to the user in full, and do not write it into project files.
`;
};

export const claudeCodeSnippet = ({url, key}) =>
    `claude mcp add xce -- npx -y @caellab/xce-cli@latest mcp --url ${url} --key ${key}`;

export const zcodeSnippet = ({url, key}) => JSON.stringify({
    mcpServers: {
        xce: {
            command: 'npx',
            args: ['-y', '@caellab/xce-cli@latest', 'mcp', '--url', url, '--key', key]
        }
    }
}, null, 2);
