#!/usr/bin/env node
import {createRequire} from 'node:module';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import {EditorBridge, cachedInstructions} from '../lib/bridge-client.mjs';

const require = createRequire(import.meta.url);
const {version} = require('../package.json');

const bridge = new EditorBridge();

// MCP 的 instructions 只能在构造 Server 时定下来，之后改不了。所以：
//   1) 先带上上次编辑器连上时缓存的完整系统提示词（hub 每次连上都重新落盘）；
//   2) 再补一段只管这条 MCP 通道的话；
//   3) 真要最新版，工具 xce_read_instructions 随时能读。
const INSTRUCTIONS_PROMPT = 'xce_instructions';
const TRANSPORT_NOTE =
    'Transport: these tools read and edit the project open in the XMUER Coding Engine desktop app. ' +
    'Start the app and open a project first. If a call says the editor is not connected, ask the user ' +
    'to open the app rather than retrying in a loop. The editor\'s reference documents (skills) are ' +
    'exposed as prompts: list them when the user asks about the editor, CaelLab, or the sites around ' +
    'it, and load the matching one instead of guessing. If the editor instructions above are missing ' +
    'or stale, call the xce_read_instructions tool before working. Large files cannot be uploaded ' +
    'through MCP: xce_add_sound takes a URL or base64 data here; the /v1/assets endpoint is for the ' +
    'HTTP bridge only.';
const cached = cachedInstructions().trim();
const instructions = cached ? `${cached}\n\n---\n\n${TRANSPORT_NOTE}` : TRANSPORT_NOTE;

const text = value => ({type: 'text', text: value === undefined || value === null ? '' : String(value)});

const imageBlock = image => {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec((image && image.url) || '');
    if (!match) {
        return null;
    }
    return {type: 'image', data: match[2], mimeType: match[1]};
};

const server = new Server(
    {name: 'xce', version},
    {
        capabilities: {tools: {}, prompts: {}},
        instructions
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    const {tools} = await bridge.list();
    return {
        tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.readOnly ? {readOnlyHint: true} : undefined
        }))
    };
});

// skill 当成 MCP prompt 给出去：客户端里能列出来、按需加载，
// 正文仍由编辑器提供（xce_read_fast_docs），不在这个包里存副本。
// 另外固定挂一条 xce_instructions：有些客户端不会自动把 instructions 交给模型，
// 用户手动加载这一条就能把编辑器的完整说明灌进去。
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const {skills} = await bridge.list();
    return {
        prompts: [{
            name: INSTRUCTIONS_PROMPT,
            description: 'The editor\'s full instructions for this agent (project rules, tool usage, block format).'
        }].concat(skills.map(skill => ({
            name: skill.name,
            description: skill.description
        })))
    };
});

server.setRequestHandler(GetPromptRequestSchema, async request => {
    const name = request.params.name;
    if (name === INSTRUCTIONS_PROMPT) {
        let body = '';
        try {
            const result = await bridge.call('xce_read_instructions', {});
            body = result.isError ? '' : String(result.content || '');
        } catch (error) {
            body = '';
        }
        if (!body) body = cachedInstructions();
        if (!body) {
            throw new Error('The editor is not connected, so its instructions cannot be read right now. ' +
                'Start XMUER Coding Engine and open a project, then try again.');
        }
        return {
            description: 'The editor\'s full instructions for this agent.',
            messages: [{
                role: 'user',
                content: {type: 'text', text: body}
            }]
        };
    }
    const {skills} = await bridge.list();
    const skill = skills.find(entry => entry.name === name);
    if (!skill) {
        throw new Error(`Unknown prompt: ${name}. List prompts to see what the editor offers.`);
    }
    const result = await bridge.call('xce_read_fast_docs', {name});
    if (result.isError) {
        throw new Error(String(result.content || `Could not read ${name}.`));
    }
    return {
        description: skill.description,
        messages: [{
            role: 'user',
            content: {type: 'text', text: String(result.content || '')}
        }]
    };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
    const {name, arguments: args} = request.params;
    try {
        const result = await bridge.call(name, args || {});
        const content = [];
        if (result.content) {
            content.push(text(result.content));
        }
        for (const image of result.images || []) {
            const block = imageBlock(image);
            if (block) {
                content.push(block);
            }
        }
        return {content, isError: !!result.isError};
    } catch (error) {
        return {content: [text(error.message)], isError: true};
    }
});

await server.connect(new StdioServerTransport());
