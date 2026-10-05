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
 *   - **桌面版（Electron 壳）绕开 CORS，但不绕过浏览器**：判断有没有 `window.EditorPreload.fetchOnline`
 *     —— 有就是桌面版，请求交给**主进程**发（`net.fetch`，Chromium 的网络栈但没有页面 origin 那层
 *     跨域检查），公开网页因此能真读回来；没有就还是页面里的 `window.fetch`。两条路的**上限完全一样**
 *     （5 秒 / 正文 20KB / head 2KB），桌面那条另有一个 1MB 的原始响应上限，由主进程执行。
 */

export const HEAD_CAP = 2048;
export const BODY_CAP = 20 * 1024;
export const DEFAULT_TIMEOUT_MS = 5000;

/**
 * 桌面版的桥（src-preload/editor.js 暴露）。浏览器与无头测试里没有它。
 * 每次调用现查，不在模块求值时缓存 —— 测试要能临时挂上/摘掉。
 * @returns {object|null} 桥对象；不是桌面版就是 null
 */
const desktopBridge = () => {
    if (typeof window === 'undefined' || !window.EditorPreload) return null;
    return typeof window.EditorPreload.fetchOnline === 'function' ? window.EditorPreload : null;
};

/** @returns {boolean} 当前是不是桌面版（决定措辞：桌面版不受 CORS 限制） */
export const isDesktopMode = () => !!desktopBridge();

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
 * 网页版/无头环境的通道：页面里的 `window.fetch`（受 CORS 管）。
 * @param {string} target 要抓的地址
 * @param {object} opts {timeoutMs, signal}
 * @returns {Promise<{body: string, rawTruncated: boolean}>} 原始响应文本（桌面通道才会截，这里恒为 false）
 */
const readTextInBrowser = async (target, {timeoutMs, signal}) => {
    // 5 秒超时；外层 signal（用户按停止）也并入这个控制器
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort(), {once: true});
    }

    try {
        const response = await fetch(target, {signal: controller.signal});
        if (!response.ok) {
            clearTimeout(timer);
            throw new Error(`HTTP ${response.status}`);
        }
        const body = await response.text();
        clearTimeout(timer);
        return {body, rawTruncated: false};
    } catch (fetchError) {
        clearTimeout(timer);
        const aborted = controller.signal.aborted && !(signal && signal.aborted);
        if (signal && signal.aborted) throw new Error('The fetch was interrupted by the user.');
        if (aborted) throw new Error(`Fetch timed out (no response within ${timeoutMs / 1000}s).`);
        if (/^HTTP \d+$/.test(fetchError.message)) throw fetchError;
        // TypeError + "Failed to fetch" 就是 CORS 拒读（或断网/拒连）——这是浏览器安全模型，
        // 代码绕不过。「读不到」不等于「答不了」：让模型先换路子；页面确实是用户要的时，
        // 可以顺口提一句桌面端没这限制（就事论事，别写成推销）。
        throw new Error(
            `Could not fetch this page (${fetchError.message}). The usual cause is CORS: the site does not ` +
            `declare that other sites may read it, so the browser blocks the response — on the web this ` +
            `happens a lot, and it is not something you or the user did wrong. You can try another URL, or ` +
            `answer from what you already know and say where it came from. If a page like this is genuinely ` +
            `what the user needs, it is fine to mention once, in plain words, that the desktop app fetches ` +
            `pages itself and has no such browser restriction (engine.xmuer.online/engine) — state it as a ` +
            `fact if it is relevant, do not turn it into a sales pitch. Never present remembered content as ` +
            `if it came from the page.`);
    }
};

/**
 * 桌面版的通道：交给主进程的 `net.fetch`（没有页面 origin，也就没有 CORS）。
 * 用户按停止时不等 IPC 回来 —— 主进程那条请求自己会在超时后结束。
 * @param {object} bridge window.EditorPreload（含 fetchOnline）
 * @param {string} target 要抓的地址
 * @param {object} opts {timeoutMs, signal}
 * @returns {Promise<{body: string, rawTruncated: boolean}>} 原始响应文本；被主进程的上限截过则 rawTruncated 为真
 */
const readTextInDesktop = async (bridge, target, {timeoutMs, signal}) => {
    if (signal && signal.aborted) throw new Error('The fetch was interrupted by the user.');

    const interrupted = new Promise((resolve, reject) => {
        if (!signal) return;
        signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true});
    });

    let result;
    try {
        result = await Promise.race([bridge.fetchOnline(target, timeoutMs), interrupted]);
    } catch (error) {
        if (signal && signal.aborted) throw new Error('The fetch was interrupted by the user.');
        throw new Error(
            `Could not fetch this page (${(error && error.message) || error}). The desktop app asks for pages ` +
            `itself, so CORS is not involved; this looks like a network-level failure (offline, DNS, TLS, ` +
            `connection refused or a timeout). Do not stop here — try another URL, or fall back on what you ` +
            `already know and say that is where it came from. Mention in one line that this page could not be ` +
            `read; never invent page content from memory.`);
    }

    if (result && result.binary) {
        throw new Error(`This URL is not a text page (content-type: ${result.binary}), so there is nothing to ` +
            'read here.');
    }
    if (result && result.networkError) {
        throw new Error(
            `Could not fetch this page (${result.networkError}). The desktop app asks for pages itself, so CORS ` +
            `is not involved; this looks like a network-level failure (offline, DNS, TLS, connection refused or ` +
            `a timeout). Do not stop here — try another URL, or fall back on what you already know and say that ` +
            `is where it came from. Never invent page content from memory.`);
    }
    if (!result || !result.ok) {
        throw new Error(`HTTP ${result ? result.status : '?'}`);
    }
    return {body: result.text, rawTruncated: !!result.truncated};
};

/**
 * 抓一个 URL，返回页面原始文本（还没做 HTML 提取）。
 * @param {string} target 要抓的地址（http/https）
 * @param {object} opts {timeoutMs, signal}
 * @returns {Promise<{body: string, rawTruncated: boolean}>} 原始响应文本与「是否被下载上限截过」
 */
const readText = (target, opts) => {
    const bridge = desktopBridge();
    return bridge ? readTextInDesktop(bridge, target, opts) : readTextInBrowser(target, opts);
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

    const {body: raw, rawTruncated} = await readText(target, {timeoutMs, signal});

    // 粗判 HTML：有标签就算。纯文本接口（.txt、JSON）原样给
    let head = null;
    let body = raw;
    if (/<[a-z!]/i.test(raw.slice(0, 512))) {
        head = extractHead(raw);
        body = htmlToText(raw);
    }

    const sections = [];
    if (head) sections.push(head.slice(0, HEAD_CAP));
    const bodyTruncated = body.length > BODY_CAP;
    sections.push(body.slice(0, BODY_CAP));
    if (bodyTruncated) {
        // 截断必须说出口，不然模型把半篇当全文
        sections.push(`[The body is over ${Math.round(BODY_CAP / 1024)}KB; only the beginning is shown. For the ` +
            `rest, ask the user for a more specific section URL, or tell them to open the original page.]`);
    } else if (rawTruncated) {
        // 原始响应就被主进程的上限截了：正文没到 20KB，但内容确实缺了一截，同样要说
        sections.push('[The download itself was cut off (the page is larger than the app fetches whole), so the ' +
            'text above stops early — say so if it matters.]');
    }
    if (!body.trim() && !head) {
        throw new Error('The page was fetched, but no text could be extracted (it may be drawn entirely by scripts).');
    }

    return {content: sections.join('\n\n').trim(), truncated: bodyTruncated || rawTruncated};
};

// ---- 图片下载（xce_add_costume_from_url）----

// 图片字节数上限：造型资产再大也只会拖慢项目，10MB 是宽松的天花板
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const MIME_OF_KIND = {png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp'};

/**
 * 认图片类型：先看魔数（可靠），认不出再借 content-type 兜底。
 * 只认这个功能支持的四种；GIF / BMP / AVIF 之类一律 null（列在报错里让模型自己换格式）。
 * @param {Uint8Array|ArrayBuffer} bytes 响应字节
 * @param {string} [contentType] 服务器声明的 content-type
 * @returns {'png'|'jpeg'|'webp'|'svg'|null} 认出来的类型；认不出返回 null
 */
export const sniffImageType = (bytes, contentType = '') => {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let head = '';
    for (let i = 0; i < Math.min(u8.length, 512); i++) head += String.fromCharCode(u8[i]);
    if (u8.length > 12 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) return 'png';
    if (u8.length > 3 && u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'jpeg';
    if (u8.length > 12 && head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') return 'webp';
    if (/<svg[\s>]/i.test(head)) return 'svg';
    if (/svg/i.test(contentType)) return 'svg';
    if (/png/i.test(contentType)) return 'png';
    if (/jpe?g/i.test(contentType)) return 'jpeg';
    if (/webp/i.test(contentType)) return 'webp';
    return null;
};

const bytesToBase64 = u8 => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
        binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(binary);
};

/**
 * 下载一张图片，给造型功能用。识别后的三种返回：
 *   {kind: 'svg', svg}                      —— 矢量图源码，直接走造型的矢量通道
 *   {kind: 'bitmap', mime, dataUrl}         —— 位图原样给（webp 由调用方经 canvas 转 PNG）
 *   抛错                                     —— 不支持的类型 / 超限 / 下载失败
 * 通道：桌面版有 `EditorPreload.fetchBinary` 就交主进程（net.fetch，无 CORS）；
 * 否则页面里的 fetch（CORS 照旧是主要拦路虎）。没有桌面桥时桌面老版本也会落到浏览器通道。
 * @param {string} url 图片地址（http/https）
 * @param {object} opts {timeoutMs, signal}
 * @returns {Promise<object>} {kind: 'svg', svg} 或 {kind: 'bitmap', mime, dataUrl}
 */
export const fetchImage = async (url, {timeoutMs = 10000, signal} = {}) => {
    const target = String(url || '').trim();
    if (!/^https?:\/\/\S+/i.test(target)) {
        throw new Error(`Not a fetchable URL: ${target || '(empty)'}. It must be a full URL starting with http(s).`);
    }

    let bytes;
    let contentType = '';
    const bridge = desktopBridge();
    if (bridge && typeof bridge.fetchBinary === 'function') {
        const controller = new AbortController();
        if (signal) {
            if (signal.aborted) controller.abort();
            else signal.addEventListener('abort', () => controller.abort(), {once: true});
        }
        const result = await Promise.race([
            bridge.fetchBinary(target, timeoutMs),
            new Promise((resolve, reject) => {
                controller.signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true});
            })
        ]);
        if (signal && signal.aborted) throw new Error('The download was interrupted by the user.');
        if (result && result.networkError) {
            throw new Error(`Could not download this image (${result.networkError}). The desktop app fetches ` +
                'itself, so CORS is not involved — this looks like a network-level failure.');
        }
        if (result && result.notImage) {
            throw new Error(`That URL serves a web page (${result.notImage}), not an image file. Point at the ` +
                'image file itself — pages have no single content type to hand to a costume.');
        }
        if (result && result.tooLarge) {
            throw new Error(`This image is too large (over the ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)}MB ` +
                'ceiling for a costume asset). Find a smaller one.');
        }
        if (!result || !result.ok) throw new Error(`HTTP ${result ? result.status : '?'}`);
        contentType = result.contentType || '';
        bytes = Uint8Array.from(atob(result.base64), char => char.charCodeAt(0));
    } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        if (signal) {
            if (signal.aborted) controller.abort();
            else signal.addEventListener('abort', () => controller.abort(), {once: true});
        }
        try {
            const response = await fetch(target, {signal: controller.signal});
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            contentType = response.headers.get('content-type') || '';
            bytes = new Uint8Array(await response.arrayBuffer());
            clearTimeout(timer);
        } catch (fetchError) {
            clearTimeout(timer);
            if (signal && signal.aborted) throw new Error('The download was interrupted by the user.');
            if (controller.signal.aborted) {
                throw new Error(`Download timed out (no response within ${timeoutMs / 1000}s).`);
            }
            if (/^HTTP \d+$/.test(fetchError.message)) throw fetchError;
            throw new Error(`Could not download this image (${fetchError.message}). The usual cause is CORS: ` +
                'the site does not allow browser pages to read its files. Try a direct image URL from a site ' +
                'that allows it, or ask the user to save the file and import it by hand. On the web this is ' +
                'common and not something anyone did wrong.');
        }
    }

    if (bytes.length > IMAGE_MAX_BYTES) {
        throw new Error(`This image is ${Math.round(bytes.length / 1024 / 1024)}MB — over the ` +
            `${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)}MB ceiling for a costume asset. Find a smaller one.`);
    }
    const kind = sniffImageType(bytes, contentType);
    if (!kind) {
        throw new Error('That URL does not return a usable image. Costumes can be built from webp, png, ' +
            'jpeg or svg files — gif, bmp and everything else are not supported here.');
    }
    if (kind === 'svg') {
        return {kind: 'svg', svg: new TextDecoder().decode(bytes), contentType};
    }
    const mime = MIME_OF_KIND[kind];
    return {kind: 'bitmap', mime, dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`, contentType};
};
