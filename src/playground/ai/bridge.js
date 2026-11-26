/*
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / XMUER Coding Engine
 * Licensed under the GNU Affero General Public License, Version 3 (AGPL-3.0-only)
 * https://www.gnu.org/licenses/agpl-3.0.txt
 * Source: https://github.com/CaelLab-org/scratch-gui
 * Project: https://engine.xmuer.online/
 */

// 桌面版的外部工具通道：Electron 主进程起一个只监听 127.0.0.1 的 hub，页面连上去，
// 把同一套工具（tools.js）借给本机的 MCP 客户端。网页版没有这条 preload，直接不连。

import {createTools} from './tools.js';
import {buildExternalInstructions} from './instructions.js';

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 15000;

export const bridgeInfo = () => {
    const preload = typeof window === 'undefined' ? null : window.EditorPreload;
    return preload && preload.aiBridge ? preload.aiBridge : null;
};

// 出去只带工具的名字、说明和参数结构 —— handler 和 port 都留在页面里
const descriptors = tools => tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    readOnly: !!tool.readOnly
}));

// skill 只报名字和一行描述（正文让客户端按需调 xce_read_fast_docs 读，跟面板里的模型一个待遇）
const skillDescriptors = skills => skills.map(skill => ({
    name: skill.name,
    description: skill.description || ''
}));

const messageOf = error => (error && error.message) || String(error);

export const startEditorBridge = ({getPort, getSkills, isBusy}) => {
    const info = bridgeInfo();
    if (!info || !info.port || !info.token) {
        return () => {};
    }

    let stopped = false;
    let socket = null;
    let timer = 0;
    let retryIn = RETRY_MIN_MS;

    const toolsNow = () => {
        const port = getPort();
        return createTools({
            port,
            skills: getSkills() || [],
            // 外置 AI 拿不到面板每轮现拼的 system prompt，这里让它能按需再读一份
            getInstructions: () => buildExternalInstructions({port: getPort(), tools: toolsNow()})
        });
    };

    const instructionsNow = () => buildExternalInstructions({port: getPort(), tools: toolsNow()});

    const send = message => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    };

    const sendTools = () => {
        send({
            type: 'tools',
            tools: descriptors(toolsNow()),
            skills: skillDescriptors(getSkills() || []),
            instructions: instructionsNow()
        });
    };

    const run = async (name, args) => {
        const tool = toolsNow().find(entry => entry.name === name);
        if (!tool) {
            return {content: `Unknown tool: ${name}`, isError: true};
        }
        if (!tool.readOnly && isBusy()) {
            return {
                content: 'The user is running a turn in the editor\'s AI panel. Retry after it finishes.',
                isError: true
            };
        }
        try {
            // 外置通道一律把图交出去（xce_read_stage / xce_read_costume）；对方模型看不看得见
            // 由对方的客户端决定，看不见时提示词里已经让它直说，而不是假装看见了
            const result = await tool.handler(args || {}, {supportsImage: true});
            return {
                content: result.content,
                isError: !!result.isError,
                images: result.images || null
            };
        } catch (error) {
            return {content: messageOf(error), isError: true};
        }
    };

    const handle = async message => {
        if (message.type === 'list') {
            sendTools();
        } else if (message.type === 'call') {
            const result = await run(message.name, message.args);
            send({type: 'result', id: message.id, ...result});
        }
    };

    const connect = () => {
        if (stopped) return;
        const retry = () => {
            if (stopped || timer) return;
            timer = setTimeout(() => {
                timer = 0;
                connect();
            }, retryIn);
            retryIn = Math.min(retryIn * 2, RETRY_MAX_MS);
        };
        let ws;
        try {
            ws = new WebSocket(`ws://127.0.0.1:${info.port}`);
        } catch (error) {
            retry();
            return;
        }
        socket = ws;
        ws.onopen = () => {
            retryIn = RETRY_MIN_MS;
            ws.send(JSON.stringify({type: 'hello', role: 'editor', token: info.token}));
        };
        ws.onmessage = event => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (error) {
                return;
            }
            if (message.type === 'welcome') {
                sendTools();
                return;
            }
            handle(message);
        };
        ws.onclose = () => {
            if (socket === ws) {
                socket = null;
            }
            retry();
        };
        ws.onerror = () => {
            try {
                ws.close();
            } catch (error) {
                // 已经关了
            }
        };
    };

    connect();

    return () => {
        stopped = true;
        if (timer) {
            clearTimeout(timer);
        }
        timer = 0;
        if (socket) {
            try {
                socket.close();
            } catch (error) {
                // 已经关了
            }
        }
        socket = null;
    };
};
