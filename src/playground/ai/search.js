/**
 * `xce_search` 的实现：用 CaelLabSearch（caellab.click）的公开搜索接口搜网络。
 *
 * 设计上的几条硬决定：
 *   - **只走 CaelLabSearch**，不接别的搜索服务（用户定的）。接口是公开只读的
 *     `GET /api/search.php?q=<词>`，回 JSON（Meili 的结果 + 站点名 + 安全搜索状态），
 *     每页正好 10 条（站点那边 `site.per_page = 10`）。
 *   - **10 条 / 标题 ≤60 字 / 摘要 ≤2000 字**（用户定的）：结果要能整段进模型上下文，
 *     不能因为一页内容把窗口撑爆。这两个上限是够用就行的护栏，不是精确排版。
 *   - **顶行必须写清「来自 CaelLabSearch」和结果页地址**（用户定的）：模型转述给用户时
 *     才带得上来源，用户也能自己点开看全部结果。搜索结果**不是模型的记忆**，这句话也得说。
 *   - **失败一律说实情**：限流、接口报错、跨域被拒各有各的话，绝不返回空列表假装「没搜到」。
 *     跨域那条是现实约束（同 online.js 的注释）：目标接口如果不回 CORS 头，浏览器就会
 *     拦下响应，代码绕不过 —— 这时候要如实告诉用户，让他自己去 caellab.click 搜。
 */

import {decodeEntities} from './online.js';

export const SEARCH_ENDPOINT = 'https://caellab.click/api/search.php';
export const SEARCH_BASE = 'https://caellab.click';
export const MAX_RESULTS = 10;
export const TITLE_CAP = 60;
export const DESC_CAP = 2000;
export const DEFAULT_TIMEOUT_MS = 10000;

// 接口给的是带 <mark> 高亮的 HTML 片段，给模型看要剥成纯文本
const stripTags = html => decodeEntities(String(html === void 0 || html === null ? '' : html)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim());

// 超长就截断并留个省略号，让模型知道这里被切过
const cap = (text, limit) => {
    const s = String(text === void 0 || text === null ? '' : text).trim();
    return s.length > limit ? `${s.slice(0, limit)}…` : s;
};

/**
 * 把接口返回的 JSON 变成给模型看的文本。
 * @param {object} payload 接口的 JSON
 * @returns {string} 顶行是来源与结果页地址，后面是一行一条的结果
 */
export const formatSearchResult = payload => {
    const query = String((payload && payload.query) || '').trim();
    const url = String((payload && payload.canonical) || '').trim() ||
        `${SEARCH_BASE}${(payload && payload.search_path) || ''}`;
    const lines = [`来自 CaelLabSearch（caellab.click）：${url}`];

    if (payload && payload.safety && payload.safety.blocked) {
        // 整次查询被安全搜索拦掉：跟「没搜到」是两回事，措辞必须分开
        lines.push(
            `这次查询（${query}）被 CaelLabSearch 的安全搜索整体拦下了。这不是没有结果，` +
            `是它的安全词表命中了查询词。换个说法或换个词再试，别自己猜内容。`
        );
        return lines.join('\n');
    }

    const results = (payload && payload.results) || [];
    const total = (payload && payload.total) || 0;
    if (!results.length) {
        lines.push(`CaelLabSearch 里没有搜到「${query}」的结果。别编造内容，可以换个关键词再搜一次。`);
        return lines.join('\n');
    }

    lines.push(
        `查询「${query}」，共约 ${total} 条，这里是前 ${results.length} 条。` +
        `以下内容由 CaelLabSearch 提供，不是你的记忆；转述给用户时要说清来源是 CaelLabSearch。`
    );

    results.slice(0, MAX_RESULTS).forEach((hit, index) => {
        const title = cap(stripTags(hit.title_html || hit.title), TITLE_CAP) || '（无标题）';
        const desc = cap(stripTags(hit.snippet_html), DESC_CAP);
        const site = String(hit.site || '').trim();
        const domain = String(hit.domain || '').trim();
        const where = [site, domain].filter(Boolean).join(' · ');
        const whereLine = where ? `\n   站点：${where}` : '';
        const descLine = desc ? `\n   摘要：${desc}` : '';
        lines.push(
            `\n${index + 1}. ${title}${whereLine}` +
            `\n   链接：${hit.url || ''}${descLine}`
        );
    });
    if (total > results.length) {
        lines.push(`\n（要更多结果可以换更具体的词再搜；也可以把结果页地址给用户自己翻。）`);
    }
    return lines.join('\n');
};

/**
 * 搜一次 CaelLabSearch。
 * @param {string} query 关键词
 * @param {object} opts {signal, timeoutMs, fetchImpl}
 * @returns {Promise<{content: string}>} content 给模型看的文本
 */
export const searchCaelLab = async (query, {signal, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl} = {}) => {
    const q = String(query === void 0 || query === null ? '' : query).trim();
    if (!q) throw new Error('要搜什么？给个关键词。');

    const doFetch = fetchImpl || fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort(), {once: true});
    }

    let response;
    try {
        response = await doFetch(`${SEARCH_ENDPOINT}?q=${encodeURIComponent(q)}`, {signal: controller.signal});
    } catch (fetchError) {
        clearTimeout(timer);
        if (signal && signal.aborted) throw new Error('搜索被用户中断。');
        if (controller.signal.aborted) throw new Error(`搜索超时（${timeoutMs / 1000} 秒没等到 CaelLabSearch 的响应）。`);
        throw new Error(
            `没能连上 CaelLabSearch（${fetchError.message}）。最常见的原因是跨域限制：浏览器不允许这个页面` +
            `读 caellab.click 的响应。请如实告诉用户搜索暂时打不通，让他自己打开 https://caellab.click/ 搜，` +
            `不要凭记忆编内容。`
        );
    }
    clearTimeout(timer);

    // 限流是接口的正常回话（90/分/IP），不是故障 —— 让模型等一下再试，别报成「坏了」
    if (response.status === 429) {
        const after = response.headers && response.headers.get ? response.headers.get('Retry-After') : '';
        throw new Error(
            `CaelLabSearch 现在很忙（触发了限流${after ? `，约 ${after} 秒后恢复` : ''}）。` +
            `过一会儿再搜，或者先回应用户别的部分。`
        );
    }
    if (!response.ok) throw new Error(`CaelLabSearch 返回了 HTTP ${response.status}。`);

    let payload;
    try {
        payload = await response.json();
    } catch (parseError) {
        throw new Error('CaelLabSearch 的响应不是合法的 JSON，这次搜索没成功。');
    }
    if (!payload || payload.ok !== true) {
        throw new Error(`CaelLabSearch 报错：${(payload && payload.error) || '未知错误'}。`);
    }
    return {content: formatSearchResult(payload)};
};
