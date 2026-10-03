/**
 * `xce_read_online` 的实现：给模型抓一个公开网页的可读文本。
 *
 * 设计上的几条硬决定：
 *   - **给文本不给 HTML**。模型要的是内容；标签、脚本、样式全是噪声。
 *     提取用纯正则做（不用 DOMParser）—— 工具要在无头测试里跑，node 没有 DOM。
 *   - **隐藏内容直接去掉**：display:none / visibility:hidden / hidden 属性的元素、
 *     script / style / noscript / template / 注释，一个字符都不给模型。
 *   - **head 摘要最多 2KB**（用户定的规矩）：没有 <title> 就整段不给；
 *     有 title 就先给 title，meta description 塞得下 2KB 才带上。
 *   - **正文最多 20KB**，截断时要**在结果里告诉模型**「后面还有」—— 不然它把截断当全文，
 *     回答「页面什么都没写」（这就是「折叠的要告诉 AI，在调用中」的意思）。
 *   - **超时 5 秒**（用户定的）。
 *   - **只用直连，没有第三方代理**（用户明确要求）。代价要讲清楚：浏览器有 CORS ——
 *     目标站不回 `Access-Control-Allow-Origin` 头，页面里的 JS 就读不到响应，
 *     这是浏览器安全模型，代码绕不过。绝大多数网站（包括 example.com、caellab.com）
 *     都不开这个头，所以大多数页面会抓不到；能抓到的只有 API 这类**特意放行跨域**的端点。
 *     抓不到时把原因如实报给模型，让它转告用户「这个站不让浏览器直接读」，
 *     别猜、别编。要读任意站得有个**自己服务器上的中转端点**（见面板说明），那是部署层面的事。
 */

export const HEAD_CAP = 2048;
export const BODY_CAP = 20 * 1024;
export const DEFAULT_TIMEOUT_MS = 5000;

// 块级标签：出现就换行，让文本有段落结构
/* eslint-disable-next-line max-len -- 标签清单是数据，拆行反而难核对 */
const BLOCK = /<\/?(?:p|div|br|li|ul|ol|tr|table|thead|tbody|h[1-6]|section|article|header|footer|nav|aside|blockquote|pre|figure|figcaption|dl|dd|dt|form|hr|main|td|th)[^>]*>/gi;

const DECODER = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': '\'',
    '&apos;': '\'',
    '&nbsp;': ' ',
    '&#x27;': '\''
};

// 也被 search.js 用（接口回的摘要片段带 HTML 实体）
export const decodeEntities = text => String(text)
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp|#x27);/g, entity => DECODER[entity] || entity);

/**
 * 把 HTML 变成可读文本。
 * @param {string} html 原始 HTML
 * @returns {string} 提取出的文本（有段落换行，无标签、无隐藏内容）
 */
export const htmlToText = html => {
    let s = String(html === void 0 || html === null ? '' : html);

    s = s.replace(/<!--[\s\S]*?-->/g, ' ');
    // 整段干掉的内容：head（head 信息单独走 extractHead）、脚本、样式、模板。
    // 注意捕获组必须有：\1 要反向引用标签名。写成 (?:...) 的话 \1 引用不到组，
    // JS 的 Annex B 兼容行为会让它静默匹配成空 —— script 内容就漏进正文了（测试逮到过）。
    s = s.replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ');

    // 隐藏元素：开标签带 display:none / visibility:hidden / hidden 属性的，
    // 干到同名闭标签为止。嵌套同名标签会截不准，所以反复跑到没有匹配为止。
    const HIDDEN = /<([a-zA-Z]+)\b[^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^>]*>[\s\S]*?<\/\1>/gi;
    for (let i = 0; i < 5; i++) {
        const next = s.replace(HIDDEN, ' ').replace(/<[^>]+\bhidden\b[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ');
        if (next === s) break;
        s = next;
    }

    s = s.replace(BLOCK, '\n');
    // 剩下的是行内标签（<b>、<a> 之类），直接删字 —— 替换成空格会把「链接</a>。」变成「链接 。」
    s = s.replace(/<[^>]+>/g, '');
    s = decodeEntities(s);

    return s.split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

/**
 * 从 HTML 里抠 head 摘要（title + meta description）。
 * @param {string} html 原始 HTML
 * @param {number} cap 上限（字符），默认 2KB
 * @returns {string|null} 摘要文本；没有 <title> 时返回 null（按规矩整段不给）
 */
export const extractHead = (html, cap = HEAD_CAP) => {
    const s = String(html || '');
    const title = (s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [null, ''])[1];
    if (!title) return null;
    const clean = raw => decodeEntities(String(raw).replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim());

    const metaTag = (s.match(/<meta\b[^>]*>/gi) || [])
        .find(tag => /name\s*=\s*["']description["']/i.test(tag));
    const description = metaTag ?
        clean((metaTag.match(/content\s*=\s*["']([\s\S]*?)["']/i) || [null, ''])[1]) : '';

    // title 永远在（有 title 是给不给 head 的唯一开关），description 塞得下才带
    let summary = `Title: ${clean(title)}`;
    if (description) {
        const candidate = `${summary}\nSite description: ${description}`;
        if (candidate.length <= cap) summary = candidate;
    }
    return summary.slice(0, cap);
};

/**
 * 抓一个 URL，返回给模型看的内容。
 * @param {string} url 要抓的地址（http/https）
 * @param {object} opts {timeoutMs, signal}
 * @returns {Promise<{content: string, truncated: boolean}>} content 给模型看的文本（含 head 摘要与截断说明）
 */
export const fetchOnline = async (url, {timeoutMs = DEFAULT_TIMEOUT_MS, signal} = {}) => {
    const target = String(url || '').trim();
    if (!/^https?:\/\/\S+/i.test(target)) {
        throw new Error(`Not a fetchable URL: ${target || '(empty)'}. It must be a full URL starting with http(s).`);
    }

    // 5 秒超时；外层 signal（用户按停止）也并入这个控制器
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort(), {once: true});
    }

    let body;
    try {
        const response = await fetch(target, {signal: controller.signal});
        if (!response.ok) {
            clearTimeout(timer);
            throw new Error(`HTTP ${response.status}`);
        }
        body = await response.text();
        clearTimeout(timer);
    } catch (fetchError) {
        clearTimeout(timer);
        const aborted = controller.signal.aborted && !(signal && signal.aborted);
        if (signal && signal.aborted) throw new Error('The fetch was interrupted by the user.');
        if (aborted) throw new Error(`Fetch timed out (no response within ${timeoutMs / 1000}s).`);
        // TypeError + "Failed to fetch" 就是 CORS 拒读（或断网/拒连）——这是浏览器安全模型，
        // 代码绕不过。把实情报出去，让模型转告用户，绝不编内容。
        throw new Error(
            `Could not fetch this page (${fetchError.message}). The most common cause is CORS: the target ` +
            `site does not declare that other sites may read it, so the browser blocks the response — that ` +
            `is not a malfunction. Tell the user honestly that this site does not let the AI read it and let ` +
            `them open the link themselves; never invent page content from memory.`);
    }

    // 粗判 HTML：有标签就算。纯文本接口（.txt、JSON）原样给
    let head = null;
    if (/<[a-z!]/i.test(body.slice(0, 512))) {
        head = extractHead(body);
        body = htmlToText(body);
    }

    const sections = [];
    if (head) sections.push(head.slice(0, HEAD_CAP));
    const truncated = body.length > BODY_CAP;
    sections.push(body.slice(0, BODY_CAP));
    if (truncated) {
        // 截断必须说出口，不然模型把半篇当全文
        sections.push(`[The body is over ${Math.round(BODY_CAP / 1024)}KB; only the beginning is shown. For the ` +
            `rest, ask the user for a more specific section URL, or tell them to open the original page.]`);
    }
    if (!body.trim() && !head) {
        throw new Error('The page was fetched, but no text could be extracted (it may be drawn entirely by scripts).');
    }

    return {content: sections.join('\n\n').trim(), truncated};
};
