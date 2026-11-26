#!/usr/bin/env node
/**
 * xce — 从命令行 / 从别的 AI agent 里驱动 XMUER Coding Engine。
 *
 *   xce mcp                        MCP（stdio）服务器，给 Claude Code / ZCode 这类客户端用
 *   xce tools                      列出编辑器现在提供的工具和 skill
 *   xce call <name> ['{"a":1}']    调一个工具
 *   xce skill [--out SKILL.md]     生成给"只会跑命令的 agent"看的说明书
 *   xce doctor                     体检：发现文件、通道、并试一次连接
 *
 * 通道二选一，自动判断：
 *   --url http://host:49621/v1 --key xce_...   走网络（别的机器也能用）
 *   （不传）                                    走桌面版本机桥（127.0.0.1）
 */
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {createClient} from '../lib/client.mjs';
import {resolveTarget, appPaths, cachedFromDiscovery} from '../lib/config.mjs';
import {startMcpServer} from '../lib/mcp-server.mjs';
import {skillText, claudeCodeSnippet, zcodeSnippet} from '../lib/skill.mjs';

const require = createRequire(import.meta.url);
const {version} = require('../package.json');

const USAGE = `xce ${version} — XMUER Coding Engine command line

Usage:
  xce mcp [--url URL --key KEY]          MCP server over stdio (for Claude Code, ZCode, ...)
  xce tools [--url URL --key KEY]        List the editor's tools and skills
  xce instructions [--url URL --key KEY] Print the editor's instructions (its system prompt)
  xce call <tool> [json] [--url ... ]    Call one tool
  xce skill [--out FILE]                 Write the agent skill file (SKILL.md)
  xce doctor                             Check the connection

Options:
  --url <http://host:49621/v1>   Use the editor's network endpoint instead of the local bridge
  --key <xce_...>                API key for that endpoint (Settings → 外部接入)
  --json                         Print raw JSON (tools / call)
  --out <file>                   Where to write the skill file (default: ./SKILL.md)

Without --url, xce reads the discovery file the desktop app writes on launch.`;

const parse = argv => {
    const flags = {};
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--url' || arg === '--key' || arg === '--out') {
            flags[arg.slice(2)] = argv[++i];
        } else if (arg === '--json') {
            flags.json = true;
        } else if (arg.startsWith('--url=') || arg.startsWith('--key=') || arg.startsWith('--out=')) {
            const [name, ...value] = arg.slice(2).split('=');
            flags[name] = value.join('=');
        } else if (arg === '-h' || arg === '--help') {
            flags.help = true;
        } else {
            rest.push(arg);
        }
    }
    return {flags, rest};
};

const fail = (message, code = 1) => {
    process.stderr.write(`${message}\n`);
    process.exit(code);
};

const printTools = async (client, asJson) => {
    const {tools, skills} = await client.list();
    if (asJson) {
        process.stdout.write(`${JSON.stringify({tools, skills}, null, 2)}\n`);
        return;
    }
    if (!tools.length) {
        process.stdout.write('No tools. Is the editor open with a project?\n');
        return;
    }
    const width = Math.min(28, Math.max(...tools.map(tool => tool.name.length)) + 2);
    for (const tool of tools) {
        const pad = tool.name.length >= width ? `${tool.name}\n${' '.repeat(width)}` : tool.name.padEnd(width);
        const ro = tool.readOnly ? ' [read-only]' : '';
        process.stdout.write(`  ${pad}${(tool.description || '').split('\n')[0]}${ro}\n`);
    }
    if (skills.length) {
        process.stdout.write(`\nSkills (load with xce_read_fast_docs):\n`);
        for (const skill of skills) {
            process.stdout.write(`  ${skill.name} — ${skill.description || ''}\n`);
        }
    }
    process.stdout.write(`\n${tools.length} tools, ${skills.length} skills.\n`);
};

const main = async () => {
    const {flags, rest} = parse(process.argv.slice(2));
    const invokedAsMcp = path.basename(process.argv[1] || '').startsWith('xce-mcp');
    let command = rest.shift() || (invokedAsMcp ? 'mcp' : '');
    if (flags.help || command === 'help' || !command) {
        process.stdout.write(`${USAGE}\n`);
        process.exit(command || flags.help ? 0 : 1);
    }

    // 说明、体检这两个命令不需要通道
    if (command === 'skill') {
        const target = resolveTarget(flags) || {};
        const url = flags.url || (target.transport === 'http' ? target.url : '');
        const key = flags.key || (target.transport === 'http' ? target.key : '');
        const out = flags.out || 'SKILL.md';
        fs.writeFileSync(out, skillText({url, key}), 'utf8');
        process.stdout.write(`Wrote ${path.resolve(out)}\n`);
        return;
    }

    if (command === 'doctor') {
        const paths = appPaths();
        const target = resolveTarget(flags);
        const cached = cachedFromDiscovery();
        process.stdout.write(`App data:   ${paths.appDir}\n`);
        process.stdout.write(`Bridge:     ${fs.existsSync(paths.bridge) ? 'found' : 'missing'}\n`);
        process.stdout.write(`Access:     ${cached.access && cached.access.enabled ? `on (port ${cached.access.port})` : 'off'}\n`);
        if (!target) {
            fail('No target: the app is not running, or external access is off and no bridge file exists.', 2);
        }
        process.stdout.write(`Transport:  ${target.transport}${target.url ? ` (${target.url})` : ''}\n`);
        const client = createClient(target);
        try {
            const {tools, skills} = await client.list();
            process.stdout.write(`Editor:     reachable — ${tools.length} tools, ${skills.length} skills\n`);
        } catch (error) {
            fail(`Editor:     not reachable — ${error.message}`, 2);
        }
        return;
    }

    if (command === 'snippets') {
        const target = resolveTarget(flags);
        const url = flags.url || (target && target.transport === 'http' ? target.url : '');
        const key = flags.key || (target && target.transport === 'http' ? target.key : '');
        if (!url || !key) {
            fail('Need --url and --key (turn on 设置 → 外部接入 in the editor).', 2);
        }
        process.stdout.write(`Claude Code:\n${claudeCodeSnippet({url, key})}\n\n`);
        process.stdout.write(`ZCode / generic MCP config:\n${zcodeSnippet({url, key})}\n`);
        return;
    }

    const target = resolveTarget(flags);
    if (!target) {
        fail('XMUER Coding Engine is not running, or its bridge has not started.\n' +
            'Start the app and open a project. For network access, turn on 设置 → 外部接入 ' +
            'and pass --url / --key.', 2);
    }
    const client = createClient(target);

    if (command === 'mcp') {
        await startMcpServer({client, version});
        return;
    }

    if (command === 'tools') {
        await printTools(client, flags.json);
        return;
    }

    if (command === 'instructions') {
        const body = await client.readInstructions();
        if (!body) {
            fail('The editor did not return its instructions. Is the app running with a project open?', 2);
        }
        process.stdout.write(`${body}\n`);
        return;
    }

    if (command === 'call') {
        const name = rest[0];
        if (!name) {
            fail('Usage: xce call <tool> [json]', 2);
        }
        let args = {};
        if (rest[1]) {
            try {
                args = JSON.parse(rest[1]);
            } catch (error) {
                fail(`Second argument must be JSON: ${error.message}`, 2);
            }
        }
        const result = await client.call(name, args);
        if (flags.json) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        } else if (result.content !== undefined && result.content !== null) {
            process.stdout.write(`${result.content}\n`);
        }
        if (result.isError) {
            process.exit(3);
        }
        return;
    }

    fail(`Unknown command: ${command}\n\n${USAGE}`, 2);
};

main().catch(error => fail(error.message || String(error)));
