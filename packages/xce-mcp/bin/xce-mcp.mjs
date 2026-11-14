#!/usr/bin/env node
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {EditorBridge} from '../lib/bridge-client.mjs';

const bridge = new EditorBridge();

const text = value => ({type: 'text', text: value === undefined || value === null ? '' : String(value)});

const imageBlock = image => {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec((image && image.url) || '');
    if (!match) {
        return null;
    }
    return {type: 'image', data: match[2], mimeType: match[1]};
};

const server = new Server(
    {name: 'xce', version: '0.1.0'},
    {
        capabilities: {tools: {}},
        instructions:
            'Tools that read and edit the project open in the XMUER Coding Engine desktop app. ' +
            'Start the app and open a project first. If a call says the editor is not connected, ' +
            'ask the user to open the app rather than retrying in a loop.'
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await bridge.list();
    return {
        tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.readOnly ? {readOnlyHint: true} : undefined
        }))
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
