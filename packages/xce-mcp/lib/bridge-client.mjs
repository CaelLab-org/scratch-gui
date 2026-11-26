import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';

const CALL_TIMEOUT_MS = 180000;
const CONNECT_TIMEOUT_MS = 5000;
const LIST_TIMEOUT_MS = 3000;

const NOT_RUNNING =
    'XMUER Coding Engine desktop is not running, or its AI bridge has not started. ' +
    'Start the app and open a project, then try again.';

const discoveryFile = () => process.env.XCE_BRIDGE_FILE || path.join(
    process.env.APPDATA || path.join(os.homedir(), '.config'),
    'XMUER Coding Engine',
    'ai-bridge.json'
);

const readDiscovery = () => {
    if (process.env.XCE_BRIDGE_PORT && process.env.XCE_BRIDGE_TOKEN) {
        return {
            port: Number(process.env.XCE_BRIDGE_PORT),
            token: process.env.XCE_BRIDGE_TOKEN
        };
    }
    try {
        return JSON.parse(fs.readFileSync(discoveryFile(), 'utf8'));
    } catch (error) {
        return null;
    }
};

// 上次编辑器连上时写下的工具清单：app 关着也能先答 tools/list，别让客户端看到空服务
export const cachedTools = () => {
    const info = readDiscovery();
    return info && Array.isArray(info.tools) ? info.tools : [];
};

// skill 的清单一并缓存：app 关着也能先答 prompts/list（正文要等 app 开了才读得到）
export const cachedSkills = () => {
    const info = readDiscovery();
    return info && Array.isArray(info.skills) ? info.skills : [];
};

// 上次编辑器连上时写下的系统提示词。MCP 的 instructions 只能在构造 Server 时定一次，
// 所以启动先拿这份缓存；要最新版就直接调 xce_read_instructions 工具。
export const cachedInstructions = () => {
    const info = readDiscovery();
    return info && typeof info.instructions === 'string' ? info.instructions : '';
};

export class EditorBridge {
    constructor () {
        this.socket = null;
        this.connecting = null;
        this.listWaiters = new Set();
        this.seq = 0;
        this.pending = new Map();
        this.tools = [];
        this.skills = [];
        this.instructions = cachedInstructions();
    }

    connect () {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        if (!this.connecting) {
            this.connecting = this.openSocket().finally(() => {
                this.connecting = null;
            });
        }
        return this.connecting;
    }

    openSocket () {
        return new Promise((resolve, reject) => {
            const info = readDiscovery();
            if (!info || !info.port || !info.token) {
                reject(new Error(NOT_RUNNING));
                return;
            }
            const socket = new WebSocket(`ws://127.0.0.1:${info.port}`);
            const timer = setTimeout(() => {
                socket.terminate();
                reject(new Error('Timed out connecting to the editor.'));
            }, CONNECT_TIMEOUT_MS);

            const settle = error => {
                clearTimeout(timer);
                socket.terminate();
                reject(new Error(NOT_RUNNING + (error && error.message ? ` (${error.message})` : '')));
            };

            socket.on('error', settle);
            socket.on('open', () => {
                socket.send(JSON.stringify({type: 'hello', role: 'client', token: info.token}));
            });
            socket.on('message', raw => {
                let message;
                try {
                    message = JSON.parse(raw.toString());
                } catch (error) {
                    return;
                }
                if (message.type === 'welcome') {
                    clearTimeout(timer);
                    this.socket = socket;
                    this.tools = message.tools || [];
                    this.skills = message.skills || [];
                    if (typeof message.instructions === 'string' && message.instructions) {
                        this.instructions = message.instructions;
                    }
                    resolve();
                } else if (message.type === 'tools') {
                    this.tools = message.tools || [];
                    this.skills = message.skills || [];
                    if (typeof message.instructions === 'string' && message.instructions) {
                        this.instructions = message.instructions;
                    }
                    // tools/list 和 prompts/list 可能同时在等这一条
                    const waiters = Array.from(this.listWaiters);
                    this.listWaiters.clear();
                    waiters.forEach(waiter => waiter({
                        tools: this.tools, skills: this.skills, instructions: this.instructions
                    }));
                } else if (message.type === 'result' || message.type === 'error') {
                    const entry = this.pending.get(message.id);
                    if (!entry) {
                        return;
                    }
                    this.pending.delete(message.id);
                    clearTimeout(entry.timer);
                    if (message.type === 'error') {
                        entry.reject(new Error(`${message.code}: ${message.message}`));
                    } else {
                        entry.resolve(message);
                    }
                }
            });
            socket.on('close', () => {
                if (this.socket === socket) {
                    this.socket = null;
                }
                this.pending.forEach(entry => {
                    clearTimeout(entry.timer);
                    entry.reject(new Error('The editor disconnected.'));
                });
                this.pending.clear();
                // 等清单的请求别干耗到超时
                const waiters = Array.from(this.listWaiters);
                this.listWaiters.clear();
                waiters.forEach(waiter => waiter({
                    tools: cachedTools(), skills: cachedSkills(), instructions: cachedInstructions()
                }));
            });
        });
    }

    // 工具和 skill 清单一起来自编辑器；连不上就用上次缓存的
    async list () {
        try {
            await this.connect();
        } catch (error) {
            return {tools: cachedTools(), skills: cachedSkills(), instructions: cachedInstructions()};
        }
        return new Promise(resolve => {
            let timer = 0;
            const waiter = result => {
                clearTimeout(timer);
                this.listWaiters.delete(waiter);
                resolve(result);
            };
            timer = setTimeout(() => waiter({
                tools: this.tools, skills: this.skills, instructions: this.instructions
            }), LIST_TIMEOUT_MS);
            this.listWaiters.add(waiter);
            try {
                this.socket.send(JSON.stringify({type: 'list'}));
            } catch (error) {
                waiter({tools: cachedTools(), skills: cachedSkills(), instructions: cachedInstructions()});
            }
        });
    }

    async call (name, args) {
        await this.connect();
        const id = `m${++this.seq}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Timed out waiting for ${name}.`));
            }, CALL_TIMEOUT_MS);
            this.pending.set(id, {resolve, reject, timer});
            this.socket.send(JSON.stringify({type: 'call', id, name, args: args || {}}));
        });
    }
}
