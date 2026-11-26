/**
 * MCP（stdio）这一层：把编辑器的工具清单、skill 清单原样转给客户端。
 *
 * 这里**不存任何工具描述或技能正文** —— 清单在连接时向编辑器现要，skill 正文等
 * prompts/get 时再调 xce_read_fast_docs 取。包本身只负责传输。
 */
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import {cachedFromDiscovery} from './config.mjs';

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

const text = value => ({
    type: 'text',
    text: value === undefined || value === null ? '' : String(value)
});

const imageBlock = image => {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec((image && image.url) || '');
    if (!match) {
        return null;
    }
    return {type: 'image', data: match[2], mimeType: match[1]};
};

export const startMcpServer = async ({client, version}) => {
    // MCP 的 instructions 在构造时定死：先用上次编辑器落盘的完整提示词，
    // 没有就只给通道说明；最新版随时可以用 xce_read_instructions 读。
    const cached = cachedFromDiscovery().instructions.trim();
    const server = new Server(
        {name: 'xce', version},
        {
            capabilities: {tools: {}, prompts: {}},
            instructions: cached ? `${cached}\n\n---\n\n${TRANSPORT_NOTE}` : TRANSPORT_NOTE
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const {tools} = await client.list();
        return {
            tools: tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
                annotations: tool.readOnly ? {readOnlyHint: true} : undefined
            }))
        };
    });

    server.setRequestHandler(ListPromptsRequestSchema, async () => {
        const {skills} = await client.list();
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
                body = await client.readInstructions();
            } catch (error) {
                body = '';
            }
            if (!body) body = cachedFromDiscovery().instructions;
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
        const {skills} = await client.list();
        const skill = skills.find(entry => entry.name === name);
        if (!skill) {
            throw new Error(`Unknown prompt: ${name}. List prompts to see what the editor offers.`);
        }
        const result = await client.call('xce_read_fast_docs', {name});
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
            const result = await client.call(name, args || {});
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
};
