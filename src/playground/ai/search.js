/**
 * `xce_search` 的实现：用 CaelLabSearch（caellab.click）的公开搜索接口搜网络。
 *
 * 设计上的几条硬决定：
 *   - **只走 CaelLabSearch**，不接别的搜索服务（用户定的）。接口是公开只读的
 *     `GET /api/search.php?q=<词>`，回 JSON（Meili 的结果 + 站点名 + 安全搜索状态），
 *     每页正好 10 条（站点那边 `site.per_page = 10`）。
 *   - **10 条 / 标题 ≤60 字 / 摘要 ≤2000 字**（用户定的）：结果要能整段进模型上下文，
 *     不能因为一页内容把窗口撑爆。这两个上限是够用就行的护栏，不是精确排版。
 *   - **顶行必须写清「From CaelLabSearch」和结果页地址**（用户定的）：模型转述给用户时
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
    const lines = [`From CaelLabSearch (caellab.click): ${url}`];

    if (payload && payload.safety && payload.safety.blocked) {
        // 整次查询被安全搜索拦掉：跟「没搜到」是两回事，措辞必须分开
        lines.push(
            `This query (${query}) was blocked outright by CaelLabSearch's safe search. That is not the same ` +
            `as "no results": a safety term matched the query. Rephrase it or try different words; do not ` +
            `guess the content yourself.`
        );
        return lines.join('\n');
    }

    const results = (payload && payload.results) || [];
    const total = (payload && payload.total) || 0;
    if (!results.length) {
        lines.push(`CaelLabSearch found no results for "${query}". Do not make anything up; try other keywords.`);
        return lines.join('\n');
    }

    lines.push(
        `Query "${query}": about ${total} results, showing the first ${results.length}. ` +
        `The content below comes from CaelLabSearch, not from your memory — say so when you pass it on.`
    );

    results.slice(0, MAX_RESULTS).forEach((hit, index) => {
        const title = cap(stripTags(hit.title_html || hit.title), TITLE_CAP) || '(untitled)';
        const desc = cap(stripTags(hit.snippet_html), DESC_CAP);
        const site = String(hit.site || '').trim();
        const domain = String(hit.domain || '').trim();
        const where = [site, domain].filter(Boolean).join(' · ');
        const whereLine = where ? `\n   site: ${where}` : '';
        const descLine = desc ? `\n   snippet: ${desc}` : '';
        lines.push(
            `\n${index + 1}. ${title}${whereLine}` +
            `\n   URL: ${hit.url || ''}${descLine}`
        );
    });
    if (total > results.length) {
        lines.push(`\n(For more, search again with a more specific query, or give the user the results-page ` +
            `URL so they can browse it themselves.)`);
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
    if (!q) throw new Error('What should I search for? Give me a keyword.');

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
        if (signal && signal.aborted) throw new Error('The search was interrupted by the user.');
        if (controller.signal.aborted) {
            throw new Error(`Search timed out (no response from CaelLabSearch within ${timeoutMs / 1000}s).`);
        }
        throw new Error(
            `Could not reach CaelLabSearch (${fetchError.message}). The most common cause is CORS: the ` +
            `browser does not allow this page to read caellab.click's response. Tell the user honestly that ` +
            `search is unavailable right now and let them search at https://caellab.click/ themselves; never ` +
            `invent content from memory.`
        );
    }
    clearTimeout(timer);

    // 限流是接口的正常回话（90/分/IP），不是故障 —— 让模型等一下再试，别报成「坏了」
    if (response.status === 429) {
        const after = response.headers && response.headers.get ? response.headers.get('Retry-After') : '';
        throw new Error(
            `CaelLabSearch is busy right now (rate limited${after ? `, recovers in about ${after}s` : ''}). ` +
            `Try again in a moment, or answer another part of the user's message first.`
        );
    }
    if (!response.ok) throw new Error(`CaelLabSearch returned HTTP ${response.status}.`);

    let payload;
    try {
        payload = await response.json();
    } catch (parseError) {
        throw new Error('The response from CaelLabSearch was not valid JSON; the search did not succeed.');
    }
    if (!payload || payload.ok !== true) {
        throw new Error(`CaelLabSearch reported an error: ${(payload && payload.error) || 'unknown error'}.`);
    }
    return {content: formatSearchResult(payload)};
};
