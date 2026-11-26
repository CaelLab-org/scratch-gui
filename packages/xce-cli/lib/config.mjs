/**
 * 发现两台"入口"：本机桥（WS，桌面版启动时写的 ai-bridge.json）和对外接口
 * （HTTP，用户在设置页打开「外部接入」后写的 ai-access.json）。
 *
 * 优先用命令行参数，其次用环境变量，最后才读用户目录里的发现文件。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const appDir = () => process.env.XCE_APP_DIR || path.join(
    process.env.APPDATA || path.join(os.homedir(), '.config'),
    'XMUER Coding Engine'
);

const readJson = file => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        return null;
    }
};

export const bridgeFile = () => process.env.XCE_BRIDGE_FILE || path.join(appDir(), 'ai-bridge.json');
export const accessFile = () => path.join(appDir(), 'ai-access.json');

const trimSlash = value => String(value || '').replace(/\/+$/, '');

/**
 * 解析出这一次要用的通道。返回：
 *   {transport: 'http', url, key}   走网络
 *   {transport: 'ws', port, token}  走本机桥
 *   null                            都没找到
 */
export const resolveTarget = flags => {
    const url = flags.url || process.env.XCE_URL;
    const key = flags.key || process.env.XCE_KEY;
    if (url) {
        return {transport: 'http', url: trimSlash(url), key: key || ''};
    }
    const bridge = readJson(bridgeFile());
    if (bridge && bridge.port && bridge.token) {
        return {transport: 'ws', port: bridge.port, token: bridge.token};
    }
    const access = readJson(accessFile());
    if (access && access.enabled && access.key && access.port) {
        return {transport: 'http', url: `http://127.0.0.1:${access.port}/v1`, key: access.key};
    }
    return null;
};

export const cachedFromDiscovery = () => {
    const bridge = readJson(bridgeFile());
    const access = readJson(accessFile());
    return {
        tools: (bridge && Array.isArray(bridge.tools) ? bridge.tools : []),
        skills: (bridge && Array.isArray(bridge.skills) ? bridge.skills : []),
        instructions: (bridge && typeof bridge.instructions === 'string' ? bridge.instructions : ''),
        access: access || null
    };
};

export const appPaths = () => ({appDir: appDir(), bridge: bridgeFile(), access: accessFile()});
