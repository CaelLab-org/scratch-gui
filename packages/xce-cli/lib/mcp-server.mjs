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
    const server = new Server(
        {name: 'xce', version},
        {
            capabilities: {tools: {}, prompts: {}},
            instructions:
                'Tools that read and edit the project open in the XMUER Coding Engine desktop app. ' +
                'Start the app and open a project first. If a call says the editor is not connected, ' +
                'ask the user to open the app rather than retrying in a loop. ' +
                'The editor\'s reference documents (skills) are exposed as prompts: list them when the ' +
                'user asks about the editor, this team, or the sites around it, and load the matching ' +
                'one instead of guessing.'
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
            prompts: skills.map(skill => ({
                name: skill.name,
                description: skill.description
            }))
        };
    });

    server.setRequestHandler(GetPromptRequestSchema, async request => {
        const name = request.params.name;
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
