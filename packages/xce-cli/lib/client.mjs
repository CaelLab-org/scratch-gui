/**
 * 两种传输共用一套 {list, call} 接口：
 *   - ws   ：桌面版本机桥（127.0.0.1 + 每次启动现生成的口令，发现文件里读）
 *   - http ：对外接口（固定端口 + 用户开的 API key，可以跨机器）
 *
 * 上层（MCP server / CLI）不需要知道自己走的是哪条。
 */
import {WebSocket} from 'ws';
import {cachedFromDiscovery} from './config.mjs';

const CALL_TIMEOUT_MS = 180000;
const CONNECT_TIMEOUT_MS = 5000;
const LIST_TIMEOUT_MS = 3000;

const NOT_RUNNING =
    'XMUER Coding Engine desktop is not running, or its AI bridge has not started. ' +
    'Start the app and open a project, then try again.';

const AUTH_HINT =
    'The editor rejected the API key. Open the editor\'s AI panel → 设置 → 外部接入, ' +
    'make sure it is on, and copy the key again.';

class WsClient {
    constructor ({port, token}) {
        this.port = port;
        this.token = token;
        this.socket = null;
        this.connecting = null;
        this.listWaiters = new Set();
        this.seq = 0;
        this.pending = new Map();
        this.tools = [];
        this.skills = [];
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
            const socket = new WebSocket(`ws://127.0.0.1:${this.port}`);
            const timer = setTimeout(() => {
                socket.terminate();
                reject(new Error('Timed out connecting to the editor.'));
            }, CONNECT_TIMEOUT_MS);

            const fail = error => {
                clearTimeout(timer);
                socket.terminate();
                reject(new Error(NOT_RUNNING + (error && error.message ? ` (${error.message})` : '')));
            };

            socket.on('error', fail);
            socket.on('open', () => {
                socket.send(JSON.stringify({type: 'hello', role: 'client', token: this.token}));
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
                    resolve();
                } else if (message.type === 'error' && message.code === 'E_AUTH') {
                    fail(new Error(AUTH_HINT));
                } else if (message.type === 'tools') {
                    this.tools = message.tools || [];
                    this.skills = message.skills || [];
                    const waiters = Array.from(this.listWaiters);
                    this.listWaiters.clear();
                    waiters.forEach(waiter => waiter({tools: this.tools, skills: this.skills}));
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
                const waiters = Array.from(this.listWaiters);
                this.listWaiters.clear();
                const cached = cachedFromDiscovery();
                waiters.forEach(waiter => waiter({tools: cached.tools, skills: cached.skills}));
            });
        });
    }

    async list () {
        try {
            await this.connect();
        } catch (error) {
            const cached = cachedFromDiscovery();
            return {tools: cached.tools, skills: cached.skills};
        }
        return new Promise(resolve => {
            let timer = 0;
            const waiter = result => {
                clearTimeout(timer);
                this.listWaiters.delete(waiter);
                resolve(result);
            };
            timer = setTimeout(() => waiter({tools: this.tools, skills: this.skills}), LIST_TIMEOUT_MS);
            this.listWaiters.add(waiter);
            try {
                this.socket.send(JSON.stringify({type: 'list'}));
            } catch (error) {
                waiter({tools: this.tools, skills: this.skills});
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

    async health () {
        return {ok: true, transport: 'ws', editor: true};
    }
}

class HttpClient {
    constructor ({url, key}) {
        this.url = url;
        this.key = key;
    }

    headers () {
        const headers = {'content-type': 'application/json'};
        if (this.key) {
            headers.authorization = `Bearer ${this.key}`;
        }
        return headers;
    }

    async request (path, options) {
        const response = await fetch(`${this.url}${path}`, {
            ...options,
            headers: {...this.headers(), ...((options && options.headers) || {})}
        });
        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }
        if (response.status === 401) {
            throw new Error(AUTH_HINT);
        }
        if (!response.ok) {
            const detail = payload && payload.message ? payload.message : `HTTP ${response.status}`;
            throw new Error(String(detail));
        }
        return payload || {};
    }

    async list () {
        const payload = await this.request('/tools', {method: 'GET'});
        return {
            tools: Array.isArray(payload.tools) ? payload.tools : [],
            skills: Array.isArray(payload.skills) ? payload.skills : []
        };
    }

    async call (name, args) {
        return this.request('/call', {
            method: 'POST',
            body: JSON.stringify({name, args: args || {}})
        });
    }

    async health () {
        return this.request('/health', {method: 'GET'});
    }
}

export const createClient = target => {
    if (!target) {
        throw new Error(NOT_RUNNING);
    }
    return target.transport === 'http' ?
        new HttpClient({url: target.url, key: target.key}) :
        new WsClient({port: target.port, token: target.token});
};

export {NOT_RUNNING, AUTH_HINT};
