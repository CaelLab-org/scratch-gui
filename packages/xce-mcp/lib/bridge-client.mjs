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

export class EditorBridge {
    constructor () {
        this.socket = null;
        this.connecting = null;
        this.listWaiter = null;
        this.seq = 0;
        this.pending = new Map();
        this.tools = [];
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
                    resolve();
                } else if (message.type === 'tools') {
                    this.tools = message.tools || [];
                    if (this.listWaiter) {
                        const waiter = this.listWaiter;
                        this.listWaiter = null;
                        waiter(this.tools);
                    }
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
            });
        });
    }

    async list () {
        try {
            await this.connect();
        } catch (error) {
            return cachedTools();
        }
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                this.listWaiter = null;
                resolve(this.tools);
            }, LIST_TIMEOUT_MS);
            this.listWaiter = tools => {
                clearTimeout(timer);
                resolve(tools);
            };
            try {
                this.socket.send(JSON.stringify({type: 'list'}));
            } catch (error) {
                clearTimeout(timer);
                this.listWaiter = null;
                resolve(cachedTools());
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
