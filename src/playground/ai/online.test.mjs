// xce_read_online 的无头自测：HTML 提取、head 摘要规则、抓取链路（用假 fetch）
// 用法：node src/playground/ai/online.test.mjs
/* eslint-disable no-console */
import {htmlToText, extractHead, fetchOnline, HEAD_CAP, BODY_CAP} from './online.js';
import {createTools} from './tools.js';

const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

// ---------- 1. htmlToText ----------
const page = `<!DOCTYPE html>
<html><head><title>测试页</title><style>.x{color:red}</style></head>
<body>
<!-- 注释不该出现 -->
<nav style="display:none">隐藏的导航</nav>
<h1>大标题</h1>
<p>第一段，带 <b>加粗</b> 和 <a href="/x">链接</a>。</p>
<script>console.log("脚本内容必须消失");</script>
<p>第二段</p>
<span class="hidden" style="visibility: hidden">看不见的字</span>
<ul><li>甲</li><li>乙</li></ul>
<div hidden="hidden">hidden 属性的内容</div>
</body></html>`;
const text = htmlToText(page);
check('正文有内容', text.length > 10, JSON.stringify(text.slice(0, 60)));
check('标签全部剥掉', !/<[a-z!/]/i.test(text));
check('script/style/注释不出现', !/console\.log|color:red|注释不该出现/.test(text));
check('display:none 与 visibility:hidden 的内容不出现', !/隐藏的导航|看不见的字/.test(text));
check('hidden 属性的内容不出现', !/hidden 属性的内容/.test(text));
check('块级标签换行（标题、段落、列表各有行）',
    text.includes('大标题') && text.includes('第一段，带 加粗 和 链接。') &&
    /甲/.test(text) && /乙/.test(text), JSON.stringify(text));
check('连续空行被压成最多一行', !/\n{3,}/.test(text));

// ---------- 2. extractHead ----------
const withBoth = extractHead('<html><head><title>官网</title><meta name="description" content="这是一段说明"></head></html>');
check('title + description 都取到',
    withBoth.includes('Title: 官网') && withBoth.includes('Site description: 这是一段说明'), JSON.stringify(withBoth));
check('没有 title 返回 null（整段不给）', extractHead('<html><head></head></html>') === null);
check('title 里的标签被剥掉',
    extractHead('<title>一<b>x</b>二</title>').includes('Title: 一x二'));
const longDesc = '很'.repeat(3000);
const capped = extractHead(`<title>T</title><meta name="description" content="${longDesc}">`);
check('head 超过 2KB 被截到上限', capped.length <= HEAD_CAP, String(capped.length));
check('超过 2KB 时只保住 title 开头', capped.startsWith('Title: T'), JSON.stringify(capped.slice(0, 20)));
const titleOnly = extractHead('<title>只有标题</title><meta name="description" content="太长才不带'.repeat(400) + '">');
check('description 塞不下时只给 title',
    titleOnly.startsWith('Title: 只有标题') && !titleOnly.includes('Site description'),
    JSON.stringify(titleOnly.slice(0, 30)));

// ---------- 3. fetchOnline：直连成功（HTML） ----------
const HTML_PAGE = '<html><head><title>甲页</title><meta name="description" content="说明"></head>' +
    '<body><p>正文内容 ' + '词'.repeat(300) + '</p></body></html>';
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ok: true, status: 200, text: async () => HTML_PAGE});
try {
    const out = await fetchOnline('https://example.com/a');
    check('直连成功：head 摘要在最前', out.content.startsWith('Title: 甲页'), out.content.slice(0, 30));
    check('直连成功：正文是提取后的文本', out.content.includes('正文内容') && !/<p>/.test(out.content));
    check('直连成功：没截断', out.truncated === false);
    check('直连成功：不提代理', !/proxy/i.test(out.content));
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 4. 直连被 CORS 挡住 → 报实情，不编内容（用户明确不要第三方代理） ----------
globalThis.fetch = async () => {
    // 浏览器跨域被拒时的真实形状：抛 TypeError（fetch 本身失败）
    throw new TypeError('Failed to fetch');
};
try {
    let message = null;
    try {
        await fetchOnline('https://example.com/blocked');
    } catch (e) {
        message = e.message;
    }
    check('CORS 拒读时报人话（含桌面端出口）',
        !!message && /CORS/.test(message) && /remembered content/i.test(message) &&
        /engine\.xmuer\.online\/engine/.test(message), message);
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 5. HTTP 4xx/5xx 也要报得出来 ----------
globalThis.fetch = async () => ({ok: false, status: 404, text: async () => 'not found'});
try {
    let message = null;
    try {
        await fetchOnline('https://example.com/missing');
    } catch (e) {
        message = e.message;
    }
    check('404 报 HTTP 状态', !!message && /404/.test(message), message);
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 6. 正文超过 20KB → 截断且告诉模型 ----------
const longBody = '<html><head><title>长页</title></head><body><p>' + '长'.repeat(BODY_CAP + 500) + '</p></body></html>';
globalThis.fetch = async () => ({ok: true, status: 200, text: async () => longBody});
try {
    const out = await fetchOnline('https://example.com/long');
    check('正文截断到 20KB', out.truncated === true && out.content.length < BODY_CAP + HEAD_CAP + 400,
        `content=${out.content.length}`);
    check('截断必须写进结果里（折叠的要告诉 AI）', out.content.includes('only the beginning is shown'), out.content.slice(-120));
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 7. 地址不合法 ----------
try {
    let message = null;
    try {
        await fetchOnline('不是网址');
    } catch (e) {
        message = e.message;
    }
    check('非法地址直接报错', !!message && /http/.test(message), message);
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 8. 工具接好了 ----------
const tools = createTools({port: {}, skills: []});
const tool = tools.find(t => t.name === 'xce_read_online');
check('工具表里有 xce_read_online', !!tool);
check('工具 description 提到 20KB / 5 秒 / CORS（能力边界说死）',
    /20KB/.test(tool.description) && /5 second/.test(tool.description) && /CORS/.test(tool.description));
const bad = await (async () => {
    // handler 直接抛（loop.executeTool 会包成 isError 结果）；这里只验它确实拒绝
    try {
        await tool.handler({url: 'javascript:alert(1)'}, {});
        return null;
    } catch (e) {
        return e.message;
    }
})();
check('非 http(s) 的地址被拒', !!bad && /http/.test(bad), String(bad).slice(0, 60));

// ---------- 9. 桌面版：交给主进程取（没有 CORS），页面自己的 fetch 完全不碰 ----------
const DESKTOP_PAGE = '<html><head><title>桌面取回来的页</title></head><body><p>桌面正文</p></body></html>';
const ipcCalls = [];
let browserFetchCalls = 0;
globalThis.window = {
    EditorPreload: {
        fetchOnline: async (url, timeoutMs) => {
            ipcCalls.push([url, timeoutMs]);
            return {ok: true, status: 200, text: DESKTOP_PAGE, truncated: false};
        }
    }
};
globalThis.fetch = async () => {
    browserFetchCalls++;
    return {ok: true, status: 200, text: () => Promise.resolve('不该走这里')};
};
try {
    const out = await fetchOnline('https://example.com/desktop');
    check('桌面版走主进程通道（preload.fetchOnline）',
        ipcCalls.length === 1 && ipcCalls[0][0] === 'https://example.com/desktop', JSON.stringify(ipcCalls));
    check('桌面版一次都不碰页面里的 fetch', browserFetchCalls === 0, `调用 ${browserFetchCalls} 次`);
    check('桌面版取回来的内容照常提取',
        out.content.includes('Title: 桌面取回来的页') && out.content.includes('桌面正文'), out.content.slice(0, 40));
    check('桌面版超时按默认 5 秒传过去', ipcCalls[0][1] === 5000, String(ipcCalls[0][1]));
} finally {
    delete globalThis.window;
    globalThis.fetch = originalFetch;
}

// ---------- 10. 桌面版失败：报网络问题，不许再甩锅给 CORS ----------
globalThis.window = {EditorPreload: {fetchOnline: async () => ({ok: false, networkError: 'net::ERR_NAME_NOT_RESOLVED'})}};
try {
    let message = null;
    try {
        await fetchOnline('https://nope.invalid/x');
    } catch (e) {
        message = e.message;
    }
    check('桌面版网络失败报网络原因、且说明与 CORS 无关',
        !!message && /ERR_NAME_NOT_RESOLVED/.test(message) && /CORS is not involved/.test(message), message);
    check('桌面版失败也照样要求换路子（不是把活儿推回用户）',
        !!message && /never invent page content/i.test(message));
} finally {
    delete globalThis.window;
}

// ---------- 11. 桌面版：HTTP 状态与二进制都报得清楚 ----------
globalThis.window = {EditorPreload: {fetchOnline: async () => ({ok: false, status: 404, text: 'not found'})}};
try {
    let message = null;
    try {
        await fetchOnline('https://example.com/missing');
    } catch (e) {
        message = e.message;
    }
    check('桌面版 404 报 HTTP 状态', !!message && /HTTP 404/.test(message), message);
} finally {
    delete globalThis.window;
}

globalThis.window = {EditorPreload: {fetchOnline: async () => ({ok: false, status: 200, binary: 'image/png'})}};
try {
    let message = null;
    try {
        await fetchOnline('https://example.com/pic.png');
    } catch (e) {
        message = e.message;
    }
    check('桌面版遇到二进制直接说不是文字页',
        !!message && /not a text page/.test(message) && /image\/png/.test(message), message);
} finally {
    delete globalThis.window;
}

// ---------- 12. 桌面版：原始响应被截 → 必须告诉模型（正文没到 20KB 也不能瞒） ----------
globalThis.window = {
    EditorPreload: {
        fetchOnline: async () => ({
            ok: true, status: 200, text: '<html><body><p>就这一段</p></body></html>', truncated: true
        })
    }
};
try {
    const out = await fetchOnline('https://example.com/huge');
    check('桌面版原始截断写进结果里', out.truncated === true && /cut off/i.test(out.content), out.content);
} finally {
    delete globalThis.window;
}

// ---------- 13. 工具描述跟着环境走（桌面版不许再自称受 CORS 限制） ----------
globalThis.window = {EditorPreload: {fetchOnline: async () => ({ok: true, status: 200, text: '', truncated: false})}};
try {
    const desktopTool = createTools({port: {}, skills: []}).find(t => t.name === 'xce_read_online');
    check('桌面版的工具描述写成「应用自己取、没有跨域」',
        /desktop app/.test(desktopTool.description) &&
        /cross-origin rules do not apply/.test(desktopTool.description) &&
        !/Most websites block a browser page/.test(desktopTool.description), desktopTool.description.slice(0, 120));
    check('桌面版描述仍保留 20KB / 5 秒这些硬上限',
        /20KB/.test(desktopTool.description) && /5 second/.test(desktopTool.description));
} finally {
    delete globalThis.window;
}

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
