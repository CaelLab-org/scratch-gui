// xce_search 的无头自测：CaelLabSearch 结果整形（10 条 / 标题 60 字 / 摘要 2000 字 / 来源注明）
// 与失败路径（限流、HTTP 错、非 JSON、跨域、超时）。用假 fetch，不联网。
// 用法：node src/playground/ai/search.test.mjs
/* eslint-disable no-console */
import {searchCaelLab, formatSearchResult, TITLE_CAP, DESC_CAP, MAX_RESULTS} from './search.js';
import {createTools} from './tools.js';
import {buildSystemPrompt} from './prompt.js';

const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

const originalFetch = globalThis.fetch;
const okResponse = payload => ({ok: true, status: 200, json: async () => payload});

// 真的接口长这样（2026-10-04 抓的 TurboWarp 响应，砍到 2 条）
const SAMPLE = {
    ok: true,
    query: 'TurboWarp',
    page: 1,
    total: 539,
    search_path: '/s/TurboWarp',
    canonical: 'https://caellab.click/s/TurboWarp',
    safety: {level: 2, blocked: false, page_hidden: 0},
    results: [
        {
            url: 'https://docs.turbowarp.org/',
            title: 'Intro | TurboWarp Documentation',
            title_html: 'Intro | <mark>TurboWarp</mark> Documentation',
            snippet_html: '<mark>TurboWarp</mark> is a mod of Scratch with improved performance, dark mode, addons, and more.',
            site: 'TurboWarp 文档',
            domain: 'docs.turbowarp.org'
        },
        {
            url: 'https://extensions.turbowarp.org/',
            title: 'TurboWarp Extension Gallery',
            title_html: 'TurboWarp Extension Gallery',
            snippet_html: 'The official place to find powerful unsandboxed extensions for TurboWarp.',
            site: 'Turbowarp',
            domain: 'extensions.turbowarp.org'
        }
    ]
};

// ---------- 1. 整形：来源写清楚、结果页地址在顶行 ----------
{
    const text = formatSearchResult(SAMPLE);
    check('顶行是「来自 CaelLabSearch」+ 结果页地址',
        text.startsWith('来自 CaelLabSearch（caellab.click）：https://caellab.click/s/TurboWarp'),
        JSON.stringify(text.split('\n')[0]));
    check('写明结果由 CaelLabSearch 提供、不是模型记忆',
        text.includes('由 CaelLabSearch 提供') && text.includes('不是你的记忆'));
    check('标注转述时要说明来源', text.includes('来源是 CaelLabSearch'));
    check('报总数与条数', text.includes('共约 539 条') && text.includes('前 2 条'));
    check('高亮标签被剥掉', !/<mark>/.test(text) && text.includes('Intro | TurboWarp Documentation'));
    check('每条都有序号 / 站点 / 链接 / 摘要',
        text.includes('1. Intro | TurboWarp Documentation') &&
        text.includes('站点：TurboWarp 文档 · docs.turbowarp.org') &&
        text.includes('链接：https://docs.turbowarp.org/') &&
        text.includes('摘要：TurboWarp is a mod of Scratch'));
}

// ---------- 2. 条数与两个上限 ----------
{
    const many = {
        ...SAMPLE,
        total: 99,
        results: Array.from({length: 30}, (unused, i) => ({
            url: `https://example.com/${i}`,
            title: `标${i}`.repeat(200),
            snippet_html: `摘${i}`.repeat(3000),
            site: '示例站',
            domain: 'example.com'
        }))
    };
    const text = formatSearchResult(many);
    check('最多只给 10 条', (text.match(/^\d+\. /gm) || []).length === MAX_RESULTS,
        String((text.match(/^\d+\. /gm) || []).length));
    const titleLine = text.split('\n').find(line => /^1\. /.test(line)).slice(3);
    check(`标题截到 ${TITLE_CAP} 字（+省略号）`, titleLine.length <= TITLE_CAP + 1 && titleLine.endsWith('…'),
        String(titleLine.length));
    const descLine = text.split('\n').find(line => line.trim().startsWith('摘要：')).trim();
    check(`摘要截到 ${DESC_CAP} 字（+省略号）`,
        descLine.length <= DESC_CAP + 4 && descLine.endsWith('…'), String(descLine.length));
    check('结果比总数少时提示可以换词再搜', text.includes('要更多结果可以换更具体的词'));
}

// ---------- 3. 没搜到 / 被安全搜索拦掉，措辞必须分开 ----------
{
    const empty = formatSearchResult({...SAMPLE, total: 0, results: []});
    check('没搜到：说明没结果且不许编', empty.includes('没有搜到「TurboWarp」') && empty.includes('别编造内容'));

    const blocked = formatSearchResult({
        ...SAMPLE,
        total: 0,
        results: [],
        safety: {level: 2, blocked: true}
    });
    check('被拦下不等于没搜到（文案分开）',
        blocked.includes('安全搜索整体拦下') && !blocked.includes('没有搜到'), JSON.stringify(blocked));
}

// ---------- 4. 成功链路：真 fetch 形状 ----------
globalThis.fetch = async () => okResponse(SAMPLE);
try {
    const out = await searchCaelLab('TurboWarp');
    check('searchCaelLab 成功时给 {content}', typeof out.content === 'string' && out.content.includes('CaelLabSearch'));
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 5. 限流 / HTTP 错 / 非 JSON / ok:false ----------
const failuresExpected = async (label, response, pattern) => {
    globalThis.fetch = async () => response;
    try {
        let message = null;
        try {
            await searchCaelLab('词');
        } catch (e) {
            message = e.message;
        }
        check(label, !!message && pattern.test(message), message);
    } finally {
        globalThis.fetch = originalFetch;
    }
};

await failuresExpected('429 说「很忙」并给等待秒数',
    {ok: false, status: 429, headers: {get: () => '60'}},
    /很忙.*60\s*秒/);
await failuresExpected('500 报 HTTP 状态', {ok: false, status: 500}, /HTTP 500/);
await failuresExpected('响应不是 JSON 时明说',
    {ok: true, status: 200, json: async () => {
        throw new Error('Unexpected token <');
    }}, /不是合法的 JSON/);
await failuresExpected('ok:false 带出接口的错误信息',
    okResponse({ok: false, error: 'busy'}), /busy/);

// ---------- 6. 跨域 / 断网：报实情，别假装没搜到 ----------
globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
};
try {
    let message = null;
    try {
        await searchCaelLab('词');
    } catch (e) {
        message = e.message;
    }
    check('连不上时提醒可能是跨域，并让用户自己去 caellab.click',
        !!message && /CaelLabSearch/.test(message) && /跨域/.test(message) && message.includes('https://caellab.click/'),
        message);
    check('绝不返回空结果假装没搜到', !/没有搜到/.test(message));
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 7. 空关键词直接拒 ----------
try {
    let message = null;
    try {
        await searchCaelLab('   ');
    } catch (e) {
        message = e.message;
    }
    check('空关键词报错', !!message && /关键词/.test(message), message);
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 8. 工具接好了：注册 + 错误收成 isError 结果（不抛给循环） ----------
{
    const tools = createTools({port: {}, skills: []});
    const tool = tools.find(t => t.name === 'xce_search');
    check('工具表里有 xce_search', !!tool);
    check('description 提到 CaelLabSearch / caellab.click / 10 条 / 不能点进结果',
        /CaelLabSearch/.test(tool.description) && /caellab.click/.test(tool.description) &&
        /10 results/.test(tool.description) && /cannot open a result/.test(tool.description));
    check('参数只有 query 且必填',
        JSON.stringify(Object.keys(tool.inputSchema.properties)) === '["query"]' &&
        tool.inputSchema.required.includes('query'));

    globalThis.fetch = async () => okResponse(SAMPLE);
    try {
        const result = await tool.handler({query: 'TurboWarp'}, {});
        check('handler 正常路径回 content', !result.isError && result.content.includes('来自 CaelLabSearch'));
    } finally {
        globalThis.fetch = originalFetch;
    }

    globalThis.fetch = async () => {
        throw new TypeError('Failed to fetch');
    };
    try {
        const result = await tool.handler({query: 'TurboWarp'}, {});
        check('handler 失败路径收成 isError（别让循环炸）',
            result.isError === true && /跨域/.test(result.content), String(result.content).slice(0, 50));
    } finally {
        globalThis.fetch = originalFetch;
    }
}

// ---------- 9. 系统提示词把搜索说进工具表 ----------
{
    const toolNames = createTools({port: {}, skills: []}).map(t => t.name);
    const prompt = buildSystemPrompt({
        currentSprite: '角色1',
        extensions: [],
        date: '2026-10-04',
        modelInfo: {name: 'test', supportsImage: false, contextWindow: 1000, maxOutputTokens: 100},
        toolNames
    });
    check('工具表里有 xce_search', prompt.includes('`xce_search`'));
    check('写明搜索是 CaelLabSearch、不是模型记忆', /CaelLabSearch/.test(prompt) && /not your memory/.test(prompt));
    check('不再声称「没有搜索引擎」', !/or use a search engine/.test(prompt));
    // 数量不写死：加一个工具就跟着变，免得每加一次工具都来改这一行
    check(`工具数量跟实际工具数一致（${toolNames.length}）`,
        new RegExp(`\\bexactly ${toolNames.length} tools\\b`).test(prompt),
        (prompt.match(/exactly \d+ tools/) || [])[0]);
}

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
