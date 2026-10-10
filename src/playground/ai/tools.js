/**
 * 给模型用的工具。
 *
 * 两条规矩：
 *   1. 全部只通过 ScratchPort 访问项目，不直接碰 VM / Blockly —— 同一套工具能跑在浏览器
 *      （真 VM）和无头环境（headless scratch-vm / 假 port）里。
 *   2. **description 和返回内容都用英文写**（和系统提示词一样，指令稳定性更好、也更省 token），
 *      中文只留在界面上 —— 工具卡上的名字、状态这些由 panel.jsx 自己拼，跟这里的 content 无关。
 *
 * 结果形状：{content, isError?, undo?, images?}。images 是 [{url, mimeType}]，
 * 只有当前模型收图片时才会被填上（见 xce_read_stage）。
 */

import {fetchImage, fetchOnline, isDesktopMode} from './online.js';
import {searchCaelLab, MAX_RESULTS, TITLE_CAP, DESC_CAP} from './search.js';
import {MEMORY_LIMITS, MEMORY_TYPES, memoryIndexText, findMemory, saveMemory, deleteMemory} from './memory.js';
import {AGENT_SPRITE_NAME, AGENT_NOTE_MAX_CHARS, MEMORY_INDEX_SPRITE, MEMORY_CONTENT_SPRITE} from './port.js';

const ok = content => ({content});
const fail = content => ({content, isError: true});

// 报错里用的角色名清单：**只给真名，不加任何装饰** —— 之前写成「Stage（舞台）」，
// 模型会连着括号一起当成角色名抄回来，然后一直找不到。
const listSprites = port =>
    port.listSprites().map(s => s.name)
        .join(', ');

// 一行一个角色的清单（ls）。只给名字/脚本数/造型名/变量名，绝不带代码 —— 代码必须按角色单独读
const listSpritesDetailed = port => port.listSpritesDetailed()
    .map(t => {
        const head = `- ${t.name}${t.isStage ? ' (the stage)' : ''}: ${t.scriptCount} ` +
            `script${t.scriptCount === 1 ? '' : 's'}`;
        // 造型名要给：加造型（xce_edit_costume）和看造型（xce_read_costume）都按名字指认它
        const costumes = t.costumes && t.costumes.length ?
            `, costumes: ${t.costumes.map(name =>
                (name === t.currentCostume ? `${name} (current)` : name)).join(', ')}` : '';
        const vars = t.variables.length ? `, variables: ${t.variables.join(', ')}` : '';
        const lists = t.lists.length ? `, lists: ${t.lists.join(', ')}` : '';
        return `${head}${costumes}${vars}${lists}`;
    })
    .join('\n');

// 图片太大的话压一下再发：舞台在高分屏上可能被渲染成 960x720 甚至更大，
// PNG 原图能到几百 KB，白烧 token。只缩尺寸，仍存 PNG（舞台可能是透明底，JPEG 会变黑）。
const MAX_IMAGE_CHARS = 300 * 1024;
const MAX_EDGE = 720;

// 矢量造型的源码直接发给模型的长度上限（用户 2026-10-04 要的：是矢量就给 SVG，太长才退回图片）。
// 必须留在 loop.js 的 MAX_TOOL_CHARS（20KB）以下 —— 超了会被截断，半个 SVG 文档对模型没有用。
const MAX_SVG_CHARS = 16 * 1024;

// ---- xce_ask_user 的入参整形 ----
// 模型给的题先过一遍：最多 4 题、每题 2-4 个选项，题目或选项不合规就丢掉（页面不会为它画卡片）。
// 界面那边一律自己补一个「自己写」的输入框，所以模型不该再塞一条「其他」进去。
export const ASK_LIMITS = {questions: {min: 1, max: 4}, options: {min: 2, max: 4}};

export const normalizeQuestions = raw => {
    const out = [];
    for (const entry of Array.isArray(raw) ? raw : []) {
        if (!entry || typeof entry !== 'object') continue;
        const question = String(entry.question || '').trim();
        if (!question) continue;
        const options = (Array.isArray(entry.options) ? entry.options : [])
            .map(option => (typeof option === 'string' ? {label: option} : option))
            .filter(option => option && String(option.label || '').trim())
            .slice(0, ASK_LIMITS.options.max)
            .map(option => ({
                label: String(option.label).trim(),
                description: String(option.description || '').trim()
            }));
        if (options.length < ASK_LIMITS.options.min) continue;
        out.push({
            question,
            // 题头是给界面当小标签用的，太长会把一行撑开
            header: String(entry.header || '').trim()
                .slice(0, 12),
            multiSelect: !!entry.multiSelect,
            options
        });
        if (out.length >= ASK_LIMITS.questions.max) break;
    }
    return out;
};

// xce_time 的等待上限：等待烧的是用户真实的墙钟时间，不许模型拿它当「等一等就好了」的挡箭牌
const MAX_WAIT_SECONDS = 60;

// 非视觉模型调视觉工具（要图片才能干活的那些）时的统一答复 —— 用户要求过：
// 模型不能傻乎乎地调了视觉、拿不到图还硬编。文案只有这一处，两个视觉工具共用。
const VISION_SWITCH_HINT =
    'Tell the user: to let the AI actually see it, switch to a vision-capable model (the ones marked ' +
    '「看图」 in the model list at the bottom of the panel), then ask again.';

// SVG 缺 width / height 时的说法。这是 AI 画造型最常踩的坑（只写 viewBox 在 Scratch 里 = 0x0）
const SVG_SIZE_HINT =
    'The root <svg> element must carry numeric width and height attributes (a viewBox alone is not ' +
    'enough: the editor would build a 0x0 costume that shows as nothing).';

// 非视觉模型截舞台时的答复（截图已经拿到了，只是不发给模型）
const stageVisionNote = caption =>
    `${caption} The current model does not read images, so the picture is not passed on. ` +
    `Say that once, then judge the result from the numbers in xce_read_state.\n${VISION_SWITCH_HINT}`;

/**
 * 等到点 / 用户点了「跳过」/ 用户按了停止 —— 三个来源谁先来听谁的。
 * skip 令牌与 signal 都由 loop 注入（见 loop.js 的 createSkipToken）。
 * @param {number} seconds 要等的秒数（≤0 直接返回）
 * @param {object} ctx 工具上下文，用到 ctx.skip（跳过令牌）与 ctx.signal（停止信号）
 * @returns {Promise<number>} 实际等了多久（秒）
 */
const waitSeconds = (seconds, ctx = {}) => new Promise(resolve => {
    const startedAt = Date.now();
    const finish = () => resolve((Date.now() - startedAt) / 1000);
    if (!(seconds > 0)) {
        resolve(0);
        return;
    }
    const timer = setTimeout(finish, seconds * 1000);
    const cancel = () => {
        clearTimeout(timer);
        finish();
    };
    if (ctx.skip && ctx.skip.promise) ctx.skip.promise.then(cancel);
    if (ctx.signal) {
        if (ctx.signal.aborted) cancel();
        else ctx.signal.addEventListener('abort', cancel, {once: true});
    }
});

const shrinkImage = dataUrl => new Promise(resolve => {
    if (dataUrl.length <= MAX_IMAGE_CHARS) {
        resolve(dataUrl);
        return;
    }
    const image = new Image();
    image.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
});

// ---- xce_read_env 的取数 ----
// 机器细节刻意**不进系统提示词**（用户 2026-10-04 定的）：提示词里只有「桌面客户端 / 网页」两态，
// 要系统、版本、窗口大小就现取一次。无头环境（单测）没有 window / navigator，每一项都必须能缺。

// UA 里的系统：能识别的就识别，认不出就留空（不猜）
const UA_OS = [
    [/Windows NT 10\.0/i, 'Windows 10 or 11'],
    [/Windows NT 6\.3/i, 'Windows 8.1'],
    [/Windows NT 6\.1/i, 'Windows 7'],
    [/Windows Phone/i, 'Windows Phone'],
    [/Android[ /](\d+(?:\.\d+)*)/i, found => `Android ${found[1]}`],
    [/iPhone OS (\d+)[_.](\d+)/i, found => `iOS ${found[1]}.${found[2]}`],
    [/iPad;.*OS (\d+)[_.](\d+)/i, found => `iPadOS ${found[1]}.${found[2]}`],
    [/Mac OS X (\d+)[_.](\d+)/i, found => `macOS ${found[1]}.${found[2]}`],
    [/CrOS/i, 'ChromeOS'],
    [/Linux/i, 'Linux']
];

export const osFromUserAgent = ua => {
    for (const [pattern, name] of UA_OS) {
        const found = pattern.exec(ua);
        if (found) return typeof name === 'function' ? name(found) : name;
    }
    return '';
};

// 浏览器 / 壳的名字与版本。桌面版的 UA 里一定有 Electron —— 先认它，
// 再认 UAData 的品牌表（Chromium 会在里面掺 "Chromium" / "Not_A Brand"，要挑掉），最后退回 UA 关键字。
export const engineFromUserAgent = ua => {
    const nav = typeof navigator === 'undefined' ? null : navigator;
    const chromium = (/Chrome\/([\d.]+)/i.exec(ua) || [])[1];
    const electron = (/Electron\/([\d.]+)/i.exec(ua) || [])[1];
    if (electron) {
        return `Electron ${electron}${chromium ? ` (Chromium ${chromium})` : ''}`;
    }
    const brands = nav && nav.userAgentData && nav.userAgentData.brands;
    if (Array.isArray(brands)) {
        const real = brands.find(brand => !/^(Chromium|Not.?A.?Brand)$/i.test(brand.brand));
        if (real) return `${real.brand} ${real.version}`;
    }
    const named = /(Firefox|Edg|OPR|Chrome)\/([\d.]+)/i.exec(ua);
    if (named) {
        const label = {Edg: 'Edge', OPR: 'Opera'}[named[1]] || named[1];
        return `${label} ${named[2]}`;
    }
    const safari = /Version\/([\d.]+)[^)]*Safari/i.exec(ua);
    return safari ? `Safari ${safari[1]}` : '';
};

/**
 * @param {object} opts
 *   port    ScratchPort
 *   skills  可用 skill 数组（{name, description, body}）。由调用方注入而不是这里 import ——
 *           装载 skill 用到了 webpack 的 require.context，import 进来无头测试就跑不了。
 * @returns {Array<object>} 工具数组
 */
export const createTools = ({port, skills = []}) => {
    // read_online 的「哪些站读得到」这句跟着环境走：桌面版由应用自己发请求，没有页面的跨域限制，
    // 不这么说模型会在本来能读的站上自己先放弃（用户要的正是这个差别）。
    const fetchReach = isDesktopMode() ?
        'This is the desktop app, so the page is fetched by the application itself rather than from a web ' +
        'page: cross-origin rules do not apply and ordinary public pages come back readable — assume a URL ' +
        'will work and try it. A page behind a login, or one drawn entirely by JavaScript, still comes back ' +
        'empty or partial; the error says which.' :
        'On the web, most sites block a browser page from reading them (CORS), and pages behind a login or ' +
        'drawn entirely by JavaScript come back empty — failed fetches are normal here, not a sign that ' +
        'something was done wrong. The desktop app fetches pages itself and has no such restriction ' +
        '(engine.xmuer.online/desktop/); no need to bring that up unprompted, it becomes relevant only when a ' +
        'page the user actually needs cannot be read.';
    // 逐段拼成一篇，段间换行；「哪一级环境」那句是变量，拼在数组里而不是串接，免得踩 prefer-template
    const readOnlineDescription = [
        'Fetch one public web page by URL and return it as readable text (not HTML): page title first, then ' +
        'the body text, hidden content stripped.',
        'Limits: 5 second timeout, at most 20KB of body text, head summary capped at 2KB. If the result says ' +
        'it was truncated, it is an excerpt — use it as one, not as the whole page.',
        fetchReach,
        'A failed fetch is information, not a dead end: try another URL, or answer from what you already know ' +
        'and say where it came from. Just do not pass remembered content off as something you read on the page.',
        'Use it to back up claims about the outside world (docs, help pages, a site the user mentions).'
    ].join('\n');

    const tools = [
        {
            name: 'xce_list_sprites',
            description:
                'List every sprite in the project — the "ls" of this editor: name, script count, variable and ' +
                'list names, one line each. Names only, never code.\n' +
                'Call this first whenever you need to know what exists; then read one sprite\'s code with ' +
                'xce_read_project. The project contents are NOT given to you up front — always discover them.',
            readOnly: true,
            inputSchema: {type: 'object', properties: {}},
            handler: () => ok(listSpritesDetailed(port) || '(this project has no sprites yet)')
        },

        {
            name: 'xce_read_project',
            description:
                'Read ONE sprite\'s blocks as block text (scratchblocks notation). One sprite per call — ' +
                'this is deliberate, so a big project cannot blow up your context.\n' +
                'Each script is preceded by a line like `:: script a1b2c3d4 (5 blocks)` — that id identifies ' +
                'the script for xce_edit_script, xce_delete_script and the blockId of xce_note. ' +
                'Never copy a `:: script` line into new block text; it is a label, and it is stripped ' +
                'automatically if you do.\n' +
                'Scratch comments on the sprite are listed after the block text, each preceded by its own ' +
                '`:: note <id>` line (read a single one with xce_read_notes). Comments are not blocks — ' +
                'never write them back as block text.\n' +
                'In the returned text, `[name v]` stands for a variable or list dropdown; copy it ' +
                'verbatim when writing back.\n' +
                'Long code is truncated at 20KB; to see a specific part, call again with lineStart/lineEnd ' +
                '(1-based, inclusive — the first call\'s header tells you the total line count). ' +
                'A paged result is still capped at 20KB.',
            readOnly: true,
            paged: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name (get names from xce_list_sprites).'},
                    lineStart: {type: 'number', description: 'First line to show (1-based). Omit to start at 1.'},
                    lineEnd: {type: 'number', description: 'Last line to show (inclusive). Omit to read to the end.'}
                },
                required: ['sprite']
            },
            handler: ({sprite, lineStart, lineEnd}) => {
                if (!sprite) {
                    // 没带角色名：只给清单，绝不一口气倒出全部代码
                    return ok(`${listSpritesDetailed(port)}\n\nTo read a sprite's blocks, call again with the ` +
                        'sprite parameter (one sprite per call).');
                }
                const target = port.readTarget(sprite);
                if (!target) return fail(`No sprite named "${sprite}". Existing sprites: ${listSprites(port)}`);

                const allLines = String(target.text || '').split('\n');
                const total = allLines.length;
                let lines = allLines;
                let shown = `lines 1-${total}`;
                const start = Number(lineStart);
                const end = Number(lineEnd);
                if (start > 0 || end > 0) {
                    const s = Math.max(1, Math.floor(start || 1));
                    const e = Math.min(total, Math.floor(end || total));
                    if (s > e) {
                        return fail(`Bad line range: ${s}-${e}. Lines are 1-based, and lineEnd must be ` +
                            'greater than or equal to lineStart.');
                    }
                    lines = allLines.slice(s - 1, e);
                    shown = `lines ${s}-${e}`;
                }

                const header = [`# ${sprite} (${shown}, ${total} line${total === 1 ? '' : 's'} total)`];
                if (Object.keys(target.variables).length) {
                    header.push(`Variables: ${Object.keys(target.variables).join(', ')}`);
                }
                if (Object.keys(target.lists).length) {
                    header.push(`Lists: ${Object.keys(target.lists).join(', ')}`);
                }
                let body = `${header.join('\n')}\n${lines.join('\n') || '(this sprite has no blocks yet)'}`;
                // 注释区：每条带 `:: note <id>` 标注行（学 `:: script` 的老规矩），列在积木文本后面
                const notes = port.readNotes(sprite) || [];
                if (notes.length) {
                    body += `
# Comments (注释 — real comment bubbles, not blocks)

${notes.map(note => `:: note ${note.id}\n${note.text}`).join('\n\n')}`;
                }
                return ok(body);
            }
        },

        {
            name: 'xce_write_script',
            description:
                'Turn block text into real blocks and append them to a sprite. The blocks land in the ' +
                'workspace as ordinary blocks the user can drag, and the layout is tidied afterwards.\n' +
                'Appends only: existing scripts are never modified or removed.\n' +
                'One complete script per call — split a program across calls and you get disconnected stacks.\n' +
                'The text must start with a hat block. Example:\n' +
                'when green flag clicked\nrepeat (10)\n  move (10) steps\nend',
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name. Must already exist.'},
                    text: {type: 'string', description: 'One or more scratchblocks scripts, separated by blank lines.'}
                },
                required: ['sprite', 'text']
            },
            handler: async ({sprite, text}) => {
                const target = port.readTarget(sprite);
                if (!target) return fail(`No sprite named "${sprite}". Existing sprites: ${listSprites(port)}`);
                const result = await port.writeScript(sprite, text);
                const count = result.blockIds.length;
                const lines = [`Wrote ${count} script${count === 1 ? '' : 's'} into "${sprite}".`];
                if (result.createdVariables.length) lines.push(`New variables: ${result.createdVariables.join(', ')}`);
                if (result.createdLists.length) lines.push(`New lists: ${result.createdLists.join(', ')}`);
                if (result.unrecognized) {
                    // 转换器认不出的写法：跟缺扩展根本不是一回事，别把两种原因混在一起说
                    return fail(
                        `Nothing was written: this text uses block syntax the tool does **not recognize**. ` +
                        `Its warnings were:\n- ` +
                        `${result.warnings.map(w => String(w)).join('\n- ')}\n` +
                        `Rewrite it with the real names from the block palette (common mistakes: inventing a ` +
                        `block name, or mixing in a translated name). Or call xce_read_project first and copy ` +
                        `how the existing scripts are written.`
                    );
                }
                if (result.missingExtensions && result.missingExtensions.length) {
                    return fail(
                        `Nothing was written: these blocks need an extension the project has **not loaded** ` +
                        `(${result.missingExtensions.join(', ')}). You must not load an extension yourself — ` +
                        `that would modify the user's project. Tell the user to do this: click the leftmost ` +
                        `button at the top of the panel (「收起面板」) to hide the AI panel, click 「添加扩展」 ` +
                        `at the bottom-left, pick the extension, click 「AI 对话」 to bring the panel back, and ` +
                        `then ask you to try again. Or use blocks that need no extension.`
                    );
                }
                if (result.warnings.length) lines.push(`Warnings:\n- ${result.warnings.join('\n- ')}`);
                if (!result.blockIds.length) return fail(lines.join('\n'));
                return {
                    content: lines.join('\n'),
                    // 交给 UI 做一键撤销 / 整轮回退：动作类型 + 涉及的角色 + 加了几块积木
                    undo: {kind: 'add', sprite, topBlockIds: result.topBlockIds, added: result.blockCount}
                };
            }
        },

        {
            name: 'xce_delete_script',
            description:
                'Delete one whole script (its top block and everything stacked or nested under it) from a sprite.\n' +
                'The top block id is on the `:: script <id>` line that xce_read_project prints above each ' +
                'script. Read the sprite first and pick the id of the script the user means — never guess an id.',
            destructive: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name.'},
                    topBlockId: {
                        type: 'string',
                        description: 'Id of the script\'s top block (from a `:: script <id>` line in xce_read_project).'
                    }
                },
                required: ['sprite', 'topBlockId']
            },
            handler: async ({sprite, topBlockId}) => {
                // 先抓快照再删：删掉的东西没快照就摆不回来，卡上的「撤销」也就没得撤销
                const snapshot = port.captureScript(sprite, topBlockId);
                if (!snapshot) return fail(`No script ${topBlockId} was found.`);
                await port.deleteScript(sprite, topBlockId);
                return {
                    content: `Deleted script ${topBlockId} from "${sprite}".`,
                    undo: {kind: 'del', sprite, topBlockId, blocks: snapshot.blocks, removed: snapshot.count}
                };
            }
        },

        {
            name: 'xce_edit_script',
            description:
                'Replace one whole script in place: pass the top block id (from a `:: script <id>` line in ' +
                'xce_read_project) and the new scratchblocks text. The old script is deleted and the new one ' +
                'takes its place; everything else on the sprite stays put.\n' +
                'Prefer this over delete-then-write: if the new text does not parse or needs an extension that ' +
                'is not loaded, nothing changes at all — the old script stays untouched.\n' +
                'Same format rules as xce_write_script: ONE complete script starting with a hat block. ' +
                'To change several scripts, call this once per script.',
            destructive: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name.'},
                    topBlockId: {
                        type: 'string',
                        description: 'Id of the script\'s top block (from a `:: script <id>` line in xce_read_project).'
                    },
                    text: {type: 'string', description: 'The replacement script: one complete scratchblocks script.'}
                },
                required: ['sprite', 'topBlockId', 'text']
            },
            handler: async ({sprite, topBlockId, text}) => {
                // 先抓快照：替换失败时旧脚本必须原样还在，撤销也要靠它摆回去
                const snapshot = port.captureScript(sprite, topBlockId);
                if (!snapshot) {
                    return fail(`No script ${topBlockId} was found in "${sprite}". Top block ids come from the ` +
                        '`:: script <id>` lines of xce_read_project — read the sprite again; the project may ' +
                        'have changed since you last looked.');
                }
                // 先写新的再删旧的：新文本解析不过 / 缺扩展时在写入这步就失败返回，
                // 旧脚本一动不动 —— 这正是这个工具比「先删后写」安全的地方
                const result = await port.writeScript(sprite, text);
                if (result.unrecognized) {
                    return fail(
                        `Nothing was changed: the new text uses block syntax the tool does **not recognize**. ` +
                        `Its warnings were:\n- ` +
                        `${result.warnings.map(w => String(w)).join('\n- ')}\n` +
                        `Rewrite it with the real names from the block palette (common mistakes: inventing a ` +
                        `block name, or mixing in a translated name). The old script is exactly as it was.`
                    );
                }
                if (result.missingExtensions && result.missingExtensions.length) {
                    return fail(
                        `Nothing was changed: the new text needs an extension the project has **not loaded** ` +
                        `(${result.missingExtensions.join(', ')}). You must not load an extension yourself — ` +
                        `that would modify the user's project. Tell the user to do this: click the leftmost ` +
                        `button under the block palette (添加扩展), add ${result.missingExtensions.join(', ')}, ` +
                        `then ask you to try again. The old script is exactly as it was.`
                    );
                }
                if (!result.topBlockIds.length) {
                    return fail('Nothing was changed: the new text parsed to no blocks. The old script is ' +
                        'exactly as it was.');
                }
                port.deleteScript(sprite, topBlockId);
                port.tidy();
                return {
                    content: `Replaced script ${topBlockId} in "${sprite}" ` +
                        `(${snapshot.count} block${snapshot.count === 1 ? '' : 's'} -> ` +
                        `${result.blockCount}).`,
                    undo: {
                        kind: 'edit',
                        sprite,
                        blocks: snapshot.blocks, // 旧脚本快照，撤销时摆回去
                        topBlockIds: result.topBlockIds, // 新脚本顶块，撤销时删掉
                        added: result.blockCount,
                        removed: snapshot.count
                    }
                };
            }
        },

        {
            name: 'xce_note',
            description:
                'Write ONE Scratch comment (「注释」) onto a block of a sprite — the real comment bubble the user ' +
                'opens, reads, edits and deletes in the editor, and the same kind they make themselves by ' +
                'right-clicking a block. It exists so you can explain your work where the user will see it later: ' +
                'what a script does, which number to change to make it harder, what still needs doing.\n' +
                'Give `sprite` (an existing name) and `text`. `blockId` is optional: leave it out and the comment ' +
                'lands on that sprite\'s newest script.\n' +
                '**A comment must hang on a block** — that is how Scratch itself works, so a sprite with no blocks ' +
                'cannot take one. If that is what you hit, write or choose a script instead of retrying.\n' +
                'House style, a suggestion rather than a rule: write in XCE\'s voice, mention XCE things ' +
                'when they fit naturally (CaelLabSearch, CaelLabID, the CaelLab sites), stamp the date ' +
                'when it will matter later — and otherwise follow your own creativity. Calling this again ' +
                'on the same block REWRITES that comment rather than adding a second one — so update it ' +
                'when the script changes, instead of leaving stale notes around; a note that should just go ' +
                'away is xce_delete_note\'s job.\n' +
                'Write for the user, in the user\'s language: short, concrete, no jargon, no notes to yourself.',
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name. Must already exist.'},
                    text: {type: 'string', description: 'The comment text, in the language the user writes in.'},
                    blockId: {
                        type: 'string',
                        description: 'Top block id to hang the comment on. Omit for the sprite\'s newest script.'
                    }
                },
                required: ['sprite', 'text']
            },
            handler: ({sprite, text, blockId}) => {
                if (!sprite) return fail('A sprite name is required.');
                if (!text || !String(text).trim()) return fail('The comment text is empty.');
                const target = port.readTarget(sprite);
                if (!target) return fail(`No sprite named "${sprite}". Existing sprites: ${listSprites(port)}`);
                const made = port.createNote(sprite, text, blockId);
                if (!made) {
                    // 两种可能：这个角色一块积木都没有，或者给的 blockId 不存在
                    const why = blockId ?
                        ` (blockId "${blockId}" was not found either)` : '';
                    return fail(
                        `Could not attach a comment in "${sprite}": a Scratch comment has to hang on a block, ` +
                        `and that sprite has no block to attach it to${why}. Write a script into it first ` +
                        `(xce_write_script), then add the note — or put the explanation in your reply ` +
                        `instead. Do not retry the same call.`
                    );
                }
                const where = made.visible ?
                    'The user can see it right away (this is the sprite their workspace is showing).' :
                    `The workspace is showing another sprite, so the user has to click "${sprite}" to see it — ` +
                    'tell them that instead of implying it is on screen already.';
                return {
                    content: `${made.updated ? 'Updated the existing comment' : 'Added a comment'} in ` +
                        `"${sprite}", on its ${made.updated ? 'script' : 'newest script'}. ${where}`,
                    // 撤销 / 回退本轮：把这条注释删掉（积木不动）
                    undo: {kind: 'note', sprite, commentId: made.commentId}
                };
            }
        },

        {
            name: 'xce_read_notes',
            description:
                'Read ONE sprite\'s Scratch comments — the real comment bubbles — each preceded by its own ' +
                '`:: note <id>` line. Pass `noteId` (from that line) to read a single one, e.g. one memory ' +
                `entry inside 「${MEMORY_CONTENT_SPRITE}」; leave it out to read all of them. ` +
                'xce_read_project lists the same comments after the block text.',
            readOnly: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name (see xce_list_sprites).'},
                    noteId: {
                        type: 'string',
                        description: 'Id of one note (from a `:: note <id>` line). Omit to read every comment.'
                    }
                },
                required: ['sprite']
            },
            handler: ({sprite, noteId}) => {
                if (!sprite) return fail('A sprite name is required.');
                const notes = port.readNotes(sprite);
                if (!notes) return fail(`No sprite named "${sprite}". Existing sprites: ${listSprites(port)}`);
                const wanted = noteId ? notes.filter(note => note.id === noteId) : notes;
                if (noteId && !wanted.length) {
                    return fail(`No note "${noteId}" in "${sprite}". Its note ids are on the ` +
                        `\`:: note <id>\` lines — call again without noteId to list every comment.`);
                }
                if (!wanted.length) return ok(`"${sprite}" has no comments.`);
                return ok(wanted.map(note => `:: note ${note.id}\n${note.text}`).join('\n\n'));
            }
        },

        {
            name: 'xce_delete_note',
            description:
                'Delete ONE Scratch comment (注释) from a sprite, by the id on its `:: note <id>` line ' +
                '(from xce_read_notes or the notes section of xce_read_project). The user can also delete ' +
                'comments by hand — prefer this when they ask you to clean one up. ' +
                `Comments inside the reserved sprites 「${AGENT_SPRITE_NAME}」, ` +
                `「${MEMORY_INDEX_SPRITE}」 and 「${MEMORY_CONTENT_SPRITE}」 are the assistant's own memory ` +
                'storage and are refused here; use xce_delete_memory for those.',
            destructive: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name.'},
                    noteId: {type: 'string', description: 'Id of the note (from a `:: note <id>` line).'}
                },
                required: ['sprite', 'noteId']
            },
            handler: ({sprite, noteId}) => {
                if (!sprite) return fail('A sprite name is required.');
                if (!noteId) return fail('A note id is required — it is on the `:: note <id>` line.');
                if (sprite === AGENT_SPRITE_NAME || sprite === MEMORY_INDEX_SPRITE ||
                    sprite === MEMORY_CONTENT_SPRITE) {
                    return fail(`"${sprite}" is a reserved sprite — its comments are the assistant's memory ` +
                        'storage, not the user\'s notes. To remove a memory, call xce_delete_memory instead.');
                }
                // 先抓快照再删：删错了要能原样摆回去
                const snapshot = port.captureNote(sprite, noteId);
                if (!snapshot) {
                    return fail(`No note "${noteId}" in "${sprite}". Note ids are on the ` +
                        '`:: note <id>` lines of xce_read_notes — read them again; the user may have ' +
                        'deleted it by hand already.');
                }
                port.deleteNote(sprite, noteId);
                return {
                    content: `Deleted note ${noteId} from "${sprite}".`,
                    undo: {kind: 'noteDel', sprite, comment: snapshot}
                };
            }
        },

        {
            name: 'xce_write_agent',
            description:
                'Write the project-level agent note: ONE Scratch comment inside the reserved sprite ' +
                `「${AGENT_SPRITE_NAME}」. Its full text is delivered to you in the system prompt of every ` +
                `turn (first ${AGENT_NOTE_MAX_CHARS} characters), so this is how standing instructions for ` +
                'THIS project survive across conversations and reloads — conventions, naming, how this ' +
                'project should behave, anything worth always knowing here.\n' +
                'Calling it again REPLACES the whole comment: pass the complete new text, not a diff. ' +
                `If the 「${AGENT_SPRITE_NAME}」 sprite does not exist yet it is created for you, with one ` +
                'script that does nothing (just an anchor for the comment) — do not put working code there.\n' +
                'Write it in the user\'s language, short and factual; no passwords, keys or other secrets. ' +
                'Long notes are accepted — the prompt carries their first 20,000 characters and ' +
                'xce_read_agent reads the rest — but that first slice rides along every turn, so keep it ' +
                'as tight as the job allows.',
            inputSchema: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'The full note text. Replaces whatever the comment said before.'
                    }
                },
                required: ['text']
            },
            handler: async ({text}) => {
                const made = await port.writeAgentNote(text);
                if (!made.ok) {
                    if (made.reason === 'empty') return fail('The note text is empty.');
                    return fail('Could not write the project-level note.');
                }
                const where = made.visible ?
                    'The user can see it right away (this is the sprite their workspace is showing).' :
                    `The workspace is showing another sprite, so the user has to click ` +
                    `"${AGENT_SPRITE_NAME}" to see it — tell them that instead of implying it is on screen already.`;
                const head = made.spriteCreated ?
                    `Created the sprite "${AGENT_SPRITE_NAME}" with the project-level note ` +
                    `(${made.text.length} characters).` :
                    `Updated the project-level note in "${AGENT_SPRITE_NAME}" ` +
                        `(${made.text.length} characters).`;
                return {
                    content: `${head} ${where} It starts reaching you in the system prompt from the next turn on.`,
                    // 这次顺带建出来的角色，整轮回退时连角色一起撤；老角色就只撤注释
                    undo: made.spriteCreated ?
                        {kind: 'sprite', sprite: AGENT_SPRITE_NAME} :
                        {kind: 'note', sprite: AGENT_SPRITE_NAME, commentId: made.commentId}
                };
            }
        },

        {
            name: 'xce_read_agent',
            description:
                `Read the project-level agent note (the one comment in the 「${AGENT_SPRITE_NAME}」 ` +
                'sprite) in full. The system prompt carries only its first 20,000 characters — when ' +
                'that section says the note was truncated, call this to read the rest: it pages by lines ' +
                '(lineStart/lineEnd, 1-based, inclusive), like xce_read_project.\n' +
                'Also use it when the user says they edited the note by hand and you need the current text. ' +
                'A note long enough to be truncated sends its first 20,000 characters here every turn — ' +
                'when most of it rarely matters, suggesting the user trim it with xce_write_agent is a ' +
                'kindness to the context window.',
            readOnly: true,
            paged: true,
            inputSchema: {
                type: 'object',
                properties: {
                    lineStart: {type: 'number', description: 'First line to show (1-based). Omit to start at 1.'},
                    lineEnd: {type: 'number', description: 'Last line to show (inclusive). Omit to read to the end.'}
                }
            },
            handler: ({lineStart, lineEnd}) => {
                const note = port.readAgentNote();
                if (!note.text) {
                    return fail(`There is no project-level note to read: this project has no ` +
                        `「${AGENT_SPRITE_NAME}」 sprite (or its comment is empty). Write one with ` +
                        'xce_write_agent.');
                }
                const allLines = note.text.split('\n');
                const total = allLines.length;
                let lines = allLines;
                let shown = `lines 1-${total}`;
                const start = Number(lineStart);
                const end = Number(lineEnd);
                if (start > 0 || end > 0) {
                    const s = Math.max(1, Math.floor(start || 1));
                    const e = Math.min(total, Math.floor(end || total));
                    if (s > e) {
                        return fail(`Bad line range: ${s}-${e}. Lines are 1-based, and lineEnd must be ` +
                            'greater than or equal to lineStart.');
                    }
                    lines = allLines.slice(s - 1, e);
                    shown = `lines ${s}-${e}`;
                }
                const header = `# ${AGENT_SPRITE_NAME} note (${shown} of ` +
                    `${total} line${total === 1 ? '' : 's'}, ${note.totalChars} characters total)`;
                return ok(`${header}\n${lines.join('\n')}`);
            }
        },

        {
            name: 'xce_run_project',
            description:
                'Click the green flag and wait. Use it to check that blocks you just wrote actually do what you ' +
                'intended. It does not return results by itself — follow it with xce_read_state ' +
                '(and xce_read_stage if the output is visual).',
            inputSchema: {
                type: 'object',
                properties: {
                    seconds: {type: 'number', description: 'How long to wait at most, in seconds. Default 3.'}
                }
            },
            handler: async ({seconds}) => {
                const outcome = await port.runProject(Math.max(0.2, Math.min(30, seconds || 3)), {});
                if (outcome === 'timeout') return ok('The project is still running (the wait limit was reached).');
                if (outcome === 'stopped') return ok('The project was stopped.');
                return ok('The project finished running.');
            }
        },

        {
            name: 'xce_trigger_event',
            description:
                'Fire an event yourself, as if the user had done it: scripts wake up and run on their own. ' +
                'The project is not modified, and this returns immediately without waiting — check the ' +
                'effect afterwards with xce_read_state (numbers) or xce_read_stage (picture).\n' +
                'Three types:\n' +
                '- "broadcast": send a 广播 by name (pass `name`). Every 「当接收到 [name v]」 script in the ' +
                'project starts. If the broadcast does not exist at all, the result lists the names that do — ' +
                'and note that firing it only helps when some script is listening for it.\n' +
                '- "green-flag": click the green flag without waiting. xce_run_project is usually better: ' +
                'same effect but it also waits for the project to finish, so prefer that one unless you ' +
                'specifically want a fire-and-forget start.\n' +
                '- "sprite-clicked": simulate the user clicking a sprite (pass `sprite`). Every ' +
                '「当角色被点击」 script of that sprite starts. That click event is the only sprite event ' +
                'this can fire — there is no real event for "the mouse touched a sprite"; for anything like ' +
                'that, read the sprite\'s position with xce_read_state and judge from the numbers.\n' +
                'The result states how many scripts woke up. Zero means nothing in the project listens to ' +
                'that event, so nothing will happen — look at the project (xce_read_project) and fire ' +
                'something that exists instead of retrying.',
            inputSchema: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['broadcast', 'green-flag', 'sprite-clicked'],
                        description: 'Which event to fire.'
                    },
                    name: {
                        type: 'string',
                        description: 'Broadcast name — required for type "broadcast".'
                    },
                    sprite: {
                        type: 'string',
                        description: 'Sprite name — required for type "sprite-clicked".'
                    }
                },
                required: ['type']
            },
            handler: async ({type, name, sprite}) => {
                const made = await port.triggerEvent({type, name, sprite});
                if (!made.ok) {
                    if (made.reason === 'no-name') {
                        return fail('A broadcast name is required: pass `name` for type "broadcast".');
                    }
                    if (made.reason === 'unknown-broadcast') {
                        const list = made.broadcasts.length ? made.broadcasts.join(', ') : '(none)';
                        return fail(`No broadcast named "${name}" exists in this project, so nothing can ` +
                            `hear it. Broadcasts that do exist: ${list}.`);
                    }
                    if (made.reason === 'no-sprite') {
                        return fail(`No sprite named "${sprite}". Existing sprites: ${made.sprites}`);
                    }
                    return fail('type must be "broadcast", "green-flag" or "sprite-clicked".');
                }
                if (type === 'green-flag') {
                    return ok('Green flag clicked: the project started. This returned immediately without ' +
                        'waiting — xce_run_project waits, so use it (or xce_read_state / xce_read_stage) to ' +
                        'check what happened.');
                }
                const what = type === 'broadcast' ?
                    `Broadcast "${name}" went out` :
                    `Simulated a click on "${sprite}"`;
                if (!made.triggered) {
                    return ok(`${what}, but no script is listening to that event, so nothing will happen. ` +
                        'Read the project (xce_read_project) to see which events actually have scripts.');
                }
                return ok(`${what}: ${made.triggered} script${made.triggered === 1 ? '' : 's'} started. ` +
                    'They run on their own — check the effect with xce_read_state or xce_read_stage.');
            }
        },

        {
            name: 'xce_read_state',
            description:
                'Read numbers only: each sprite\'s x/y/direction/size/visibility/costume, plus the current value ' +
                'of every variable and list. This is text, not a picture — use xce_read_stage when you need to see ' +
                'the actual stage.',
            readOnly: true,
            inputSchema: {type: 'object', properties: {}},
            handler: () => {
                const state = port.readState();
                const lines = [];
                for (const sprite of state.sprites) {
                    lines.push(
                        `${sprite.name}: x=${sprite.x} y=${sprite.y} direction=${sprite.direction} ` +
                        `size=${sprite.size}% visible=${sprite.visible ? 'yes' : 'no'} costume=${sprite.costume}`
                    );
                }
                const vars = Object.entries(state.variables);
                if (vars.length) {
                    lines.push(`Variables: ${vars.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`);
                }
                const lists = Object.entries(state.lists);
                if (lists.length) {
                    lines.push(`Lists: ${lists.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`);
                }
                return ok(lines.join('\n') || '(nothing to read)');
            }
        },

        {
            name: 'xce_read_stage',
            description:
                'Take a screenshot of the stage right now and return it as an image you can look at.\n' +
                'Use it after xce_run_project when the result is something the user can see (drawing, movement, ' +
                'a game over screen) rather than a number.\n' +
                'Whether you actually receive the picture depends on the model: text-only models get a note ' +
                'instead, in which case tell the user to switch to a vision model rather than guessing.',
            readOnly: true,
            vision: true,
            inputSchema: {type: 'object', properties: {}},
            handler: async (input, ctx = {}) => {
                const dataUrl = await port.snapshotStage();
                if (!dataUrl) {
                    // 网页版标签页在后台时浏览器会挂起渲染（rAF 不跑，requestSnapshot 等不到帧），
                    // 桌面壳关了后台节流（backgroundThrottling: false）没有这回事 —— 所以这句只给网页版。
                    const tabHidden = !isDesktopMode() &&
                        typeof document !== 'undefined' && document.hidden;
                    if (tabHidden) {
                        return fail('Screenshot failed: the renderer produced no frame before the timeout, ' +
                            'and the tab is currently in the background — the browser suspends rendering while ' +
                            'the user is away, so this is most likely the cause. You can put a question to the ' +
                            'user with xce_ask_user: it sends a notification that brings them back, and then a ' +
                            'retry should work. If this keeps happening, it is fine to mention once, plainly, ' +
                            'that the desktop app keeps rendering in the background (engine.xmuer.online/desktop/).');
                    }
                    return fail('Screenshot failed: the renderer produced no frame before the timeout. The ' +
                        'project may not have rendered a single frame yet — call xce_run_project first, then retry.');
                }
                const size = port.stageSize();
                const caption = `Stage screenshot (${size.width}x${size.height}, current frame).`;
                if (!ctx.supportsImage) {
                    // 非视觉模型：不塞图片，改成一句能转述给用户的话
                    return ok(stageVisionNote(caption));
                }
                return {
                    content: caption,
                    images: [{
                        url: await shrinkImage(dataUrl),
                        mimeType: 'image/png'
                    }]
                };
            }
        },

        {
            name: 'xce_rename_sprite',
            description:
                'Rename a sprite (角色). The user\'s sprite list updates immediately, and every script ' +
                'keeps working — blocks reference the sprite itself, not its name.\n' +
                'Check xce_list_sprites first: the new name must not be taken (spelling differences in ' +
                'letter case count as taken), and the reserved sprites 「XCEAGENT」, ' +
                '「XCEMEMORY_index」 and 「XCEMEMORY_content」 can neither be renamed nor have their names ' +
                'reused — they are the editor\'s own machinery.\n' +
                'A suggestion, not a rule: if the project note (XCEAGENT) or a project memory mentions the ' +
                'old name, updating it with xce_write_agent / xce_write_project_memory keeps them accurate.',
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Current name of the sprite (see xce_list_sprites).'},
                    newName: {
                        type: 'string',
                        description: 'The new name. Must not be taken, and must not be one of the ' +
                            'reserved names.'
                    }
                },
                required: ['sprite', 'newName']
            },
            handler: ({sprite, newName}) => {
                const made = port.renameSprite(sprite, newName);
                if (!made.ok) {
                    if (made.reason === 'no-sprite') {
                        return fail(`No sprite named "${sprite}". Existing sprites: ${made.sprites}`);
                    }
                    if (made.reason === 'no-name') {
                        return fail('The newName parameter is required and cannot be empty.');
                    }
                    if (made.reason === 'duplicate') {
                        return fail(`A sprite named "${newName}" already exists. Sprites: ${made.sprites}. ` +
                            'Choose a different name.');
                    }
                    if (made.reason === 'reserved') {
                        return fail('That name is reserved: 「XCEAGENT」, 「XCEMEMORY_index」 and ' +
                            '「XCEMEMORY_content」 are the editor\'s own sprites — they cannot be renamed ' +
                            'and their names cannot be reused.');
                    }
                    if (made.reason === 'stage') return fail('The stage cannot be renamed.');
                    return fail('Could not rename the sprite.');
                }
                return {
                    content: `Renamed "${made.from}" to "${made.to}". The sprite list already shows the ` +
                        'new name, and all scripts still work.',
                    undo: {kind: 'rename', from: made.from, to: made.to}
                };
            }
        },

        {
            name: 'xce_add_sprite',
            description:
                'Create a NEW sprite (角色) in the project and select it — the user\'s sprite list grows by one.\n' +
                'It starts with ONE blank costume (0x0, invisible on the stage — that is normal, not a bug). ' +
                'Drawing is a separate step: call `xce_edit_costume` afterwards with action "new" to add a ' +
                'costume you drew, or action "edit" to redraw the blank one in place. For a picture from the ' +
                'web, use `xce_add_costume_from_url`.\n' +
                'The name must not already be taken — check with xce_list_sprites.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {type: 'string', description: 'Name for the new sprite. Must not already exist.'},
                    x: {type: 'number', description: 'Stage x position. Default 0 (centre).'},
                    y: {type: 'number', description: 'Stage y position. Default 0 (centre).'},
                    size: {type: 'number', description: 'Size in percent. Default 100.'},
                    direction: {type: 'number', description: 'Direction in degrees. Default 90 (facing right).'},
                    visible: {type: 'boolean', description: 'Whether it starts visible. Default true.'}
                },
                required: ['name']
            },
            handler: async ({name, x, y, size, direction, visible}) => {
                const result = await port.addSprite({name, x, y, size, direction, visible});
                if (!result.ok) {
                    if (result.reason === 'duplicate') {
                        return fail(`A sprite named "${name}" already exists. Sprites: ${result.sprites}. ` +
                            'Choose a different name.');
                    }
                    if (result.reason === 'no-name') return fail('The name parameter is required and cannot be empty.');
                    return fail(`Could not create a sprite named "${name}".`);
                }
                return {
                    content: `Created sprite "${result.name}" and selected it. It has one blank costume ` +
                        '(0x0, so nothing shows on the stage yet) — draw it with xce_edit_costume: ' +
                        'action "new" for a costume you drew, or action "edit" to redraw the blank one in place.',
                    undo: {kind: 'sprite', sprite: result.name}
                };
            }
        },

        {
            name: 'xce_edit_costume',
            description:
                'Draw or redraw ONE costume of an existing sprite as an SVG document you write. Two actions:\n' +
                '- action "new" (or "create"): append a NEW costume at the end; it becomes the sprite\'s ' +
                'current one, so the sprite\'s look on the stage changes immediately. Use this for extra ' +
                'looks (walk cycles, open/closed states) the user can switch with 「下一个造型」.\n' +
                '- action "edit": REPLACE the content of one existing costume (pass `costume`, name or ' +
                'index; default the current one). Vector costumes and the blank one can be edited this way; ' +
                'bitmap costumes have no SVG source, so the result tells you to use action "new" instead. ' +
                'The old look is kept for undo.\n' +
                '**Read the drawing fastdoc first** (xce_read_skill, then xce_read_fast_docs): the root ' +
                '<svg> needs width and height, and the document must be self-contained. After drawing, ' +
                'check the costume with xce_read_costume before telling the user it is done.',
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name (see xce_list_sprites).'},
                    action: {
                        type: 'string',
                        enum: ['new', 'create', 'edit'],
                        description: '"new" (or "create") appends a new costume; "edit" replaces the ' +
                            'content of an existing vector costume.'
                    },
                    svg: {
                        type: 'string',
                        description: 'The costume content: a complete SVG document, root <svg> with ' +
                            'width and height.'
                    },
                    costume: {
                        type: 'string',
                        description: 'For action "edit": which costume to replace (name or index). ' +
                            'Default the current one.'
                    },
                    name: {type: 'string', description: 'Name for the costume, e.g. "walking". Default 造型N.'}
                },
                required: ['sprite', 'action', 'svg']
            },
            handler: async ({sprite, action, svg, costume, name}) => {
                const mode = action === 'create' ? 'new' : action;
                if (mode !== 'new' && mode !== 'edit') {
                    return fail('action must be "new" (append a new costume) or "edit" (replace the ' +
                        'content of an existing vector costume).');
                }
                if (!svg || !String(svg).trim()) {
                    return fail('The svg parameter is required — the costume content is a complete SVG ' +
                        'document.');
                }
                if (mode === 'new') {
                    const result = await port.addCostume(sprite, {svg, name});
                    if (!result.ok) {
                        if (result.reason === 'missing') {
                            return fail(`No sprite named "${sprite}". Existing sprites: ${result.sprites}`);
                        }
                        if (result.reason === 'bad-size') return fail(SVG_SIZE_HINT);
                        if (result.reason === 'no-storage') {
                            return fail('The editor is not ready to hold image assets yet — no costume was added.');
                        }
                        return fail(`Could not add a costume to "${sprite}".`);
                    }
                    return {
                        content: `Added costume "${result.costume.name}" (${result.costume.width}x` +
                            `${result.costume.height}) to "${result.sprite}"; it is now the current costume ` +
                            `(index ${result.costume.index}). Check it with xce_read_costume.`,
                        undo: {kind: 'costume', sprite: result.sprite, index: result.costume.index}
                    };
                }
                // edit：先抓旧 SVG 快照（撤销要摆回去），再替换
                const before = await port.readCostumeSvg(sprite, costume);
                if (!before) {
                    return fail(`No such costume in "${sprite}" (asked for ` +
                        `${costume === void 0 || costume === '' ? 'the current costume' : `"${costume}"`}). ` +
                        'See what exists with xce_read_costume.');
                }
                if (before.bitmap) {
                    return fail(`Costume "${before.name}" of "${sprite}" is a bitmap image, so it has no SVG ` +
                        'source to edit. Use action "new" to add a costume on top of it instead.');
                }
                if (!before.svg) {
                    return fail(`Costume "${before.name}" of "${sprite}" is vector, but its SVG source could ` +
                        'not be read out of the project file — replacing it could not be undone, so nothing ' +
                        'was changed. Use action "new" instead.');
                }
                const result = await port.replaceCostume(sprite, costume, svg, name);
                if (!result.ok) {
                    if (result.reason === 'missing') {
                        return fail(`No sprite named "${sprite}". Existing sprites: ${result.sprites}`);
                    }
                    if (result.reason === 'no-costume') {
                        return fail(`No such costume in "${sprite}". See what exists with xce_read_costume.`);
                    }
                    if (result.reason === 'bitmap') {
                        return fail(`Costume "${result.name}" of "${sprite}" is a bitmap image, so it has no ` +
                            'SVG source to edit. Use action "new" to add a costume on top of it instead.');
                    }
                    if (result.reason === 'bad-size') return fail(SVG_SIZE_HINT);
                    return fail(`Could not edit the costume of "${sprite}".`);
                }
                return {
                    content: `Replaced the content of costume "${result.oldName}" (now "${result.name}") in ` +
                        `"${sprite}" (index ${result.index}). The old look is kept for undo. Check it with ` +
                        'xce_read_costume.',
                    undo: {
                        kind: 'costumeContent',
                        sprite,
                        index: result.index,
                        oldSvg: before.svg,
                        oldName: before.name
                    }
                };
            }
        },

        {
            name: 'xce_delete_costume',
            description:
                'Delete ONE costume from a sprite, by name or index (default the current one). A sprite ' +
                'needs at least one costume, so the last one standing cannot be deleted — the result says ' +
                'so. The deleted costume is kept for undo. Prefer this over leaving a bad drawing around ' +
                'when the user says a look is not wanted any more.',
            destructive: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name (see xce_list_sprites).'},
                    costume: {
                        type: 'string',
                        description: 'Which costume to delete: name or index. Default the current one.'
                    }
                },
                required: ['sprite']
            },
            handler: ({sprite, costume}) => {
                if (!sprite) return fail('A sprite name is required.');
                const snapshot = port.captureCostume(sprite, costume);
                if (!snapshot) {
                    return fail(`No such costume in "${sprite}" (asked for ` +
                        `${costume === void 0 || costume === '' ? 'the current costume' : `"${costume}"`}). ` +
                        'See what exists with xce_read_costume.');
                }
                if (!port.removeCostume(sprite, snapshot.index)) {
                    return fail(`Costume "${snapshot.costume.name}" of "${sprite}" is the sprite's only one — ` +
                        'a sprite needs at least one costume, so it cannot be deleted. Add a replacement ' +
                        'with xce_edit_costume (action "new") first if the user wants it gone.');
                }
                return {
                    content: `Deleted costume "${snapshot.costume.name}" (index ${snapshot.index}) from ` +
                        `"${sprite}". It is kept for undo.`,
                    undo: {
                        kind: 'costumeRestore',
                        sprite,
                        costume: snapshot.costume,
                        index: snapshot.index,
                        current: snapshot.current
                    }
                };
            }
        },

        {
            name: 'xce_add_costume_from_url',
            description:
                'Download one image from a URL and add it as a NEW costume of an existing sprite — the ' +
                'costume is appended at the end and becomes the current one. It never replaces or overwrites ' +
                'an existing look; to redraw one, use xce_edit_costume with action "edit".\n' +
                'Supported formats: webp, png, jpeg and svg. A webp is converted to a PNG bitmap on the way ' +
                'in (Scratch cannot read webp); png and jpeg land as bitmap costumes; svg lands as a vector ' +
                'costume (its root <svg> must carry width and height — without them the result says so). ' +
                'gif, bmp and other formats are not supported. The image is capped at 10MB.\n' +
                'Give `sprite` and `url`; `name` names the costume (default 造型N). Check the result with ' +
                'xce_read_costume — a downloaded picture can be anything.',
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name (see xce_list_sprites).'},
                    url: {type: 'string', description: 'Full http(s) URL of the image file itself.'},
                    name: {type: 'string', description: 'Name for the costume. Default 造型N.'}
                },
                required: ['sprite', 'url']
            },
            handler: async ({sprite, url, name}, ctx = {}) => {
                if (!sprite) return fail('A sprite name is required.');
                if (!url || !String(url).trim()) return fail('The url parameter is required.');
                let image;
                try {
                    image = await fetchImage(url, {signal: ctx.signal});
                } catch (e) {
                    return fail((e && e.message) || String(e));
                }
                if (image.kind === 'svg') {
                    const result = await port.addCostume(sprite, {svg: image.svg, name});
                    if (!result.ok) {
                        if (result.reason === 'missing') {
                            return fail(`No sprite named "${sprite}". Existing sprites: ${result.sprites}`);
                        }
                        if (result.reason === 'bad-size') {
                            return fail(`${SVG_SIZE_HINT} The downloaded SVG has this problem — find another ` +
                                'image or draw one yourself.');
                        }
                        return fail(`Could not add a costume to "${sprite}".`);
                    }
                    return {
                        content: `Downloaded the SVG from the URL and added it as costume ` +
                            `"${result.costume.name}" (${result.costume.width}x${result.costume.height}) of ` +
                            `"${result.sprite}" (index ${result.costume.index}); it is now the current costume. ` +
                            'Check it with xce_read_costume.',
                        undo: {kind: 'costume', sprite: result.sprite, index: result.costume.index}
                    };
                }
                // 位图：webp 已由本工具的调用方转 PNG（canvas 归一在 port.addBitmapCostume 里）
                const result = await port.addBitmapCostume(sprite, {dataUrl: image.dataUrl, name});
                if (!result.ok) {
                    if (result.reason === 'missing') {
                        return fail(`No sprite named "${sprite}". Existing sprites: ${result.sprites}`);
                    }
                    if (result.reason === 'no-canvas') {
                        return fail('This environment cannot decode bitmap images (no canvas) — the download ' +
                            'worked, but nothing was added.');
                    }
                    if (result.reason === 'no-storage') {
                        return fail('The editor is not ready to hold image assets yet — nothing was added.');
                    }
                    return fail('The image was downloaded but could not be turned into a costume.');
                }
                return {
                    content: `Downloaded the image from the URL and added it as bitmap costume ` +
                        `"${result.name}" (${result.width}x${result.height}) of "${result.sprite}" ` +
                        `(index ${result.index}); it is now the current costume. Check it with xce_read_costume.`,
                    undo: {kind: 'costume', sprite: result.sprite, index: result.index}
                };
            }
        },

        {
            name: 'xce_read_costume',
            description:
                'Look at one costume of one sprite. Two forms, chosen by the format parameter:\n' +
                '- A **vector** costume (one drawn as SVG) comes back as the **SVG source text** — that is the ' +
                `default, unless it is longer than ${MAX_SVG_CHARS / 1024}KB, in which case the picture is ` +
                'sent instead. Source text is cheaper than a picture and lets you copy and repair the ' +
                'drawing; the picture is what you want when judging how it actually looks.\n' +
                '- A **bitmap** costume (a PNG or JPG imported from somewhere) has no source, so you get the ' +
                'picture.\n' +
                'Use it right after drawing a costume with xce_edit_costume, or after importing one with ' +
                'xce_add_costume_from_url, to check the look before you tell the user it is done. It shows the ' +
                'costume on its own (not the stage), so it works before the project is even run.\n' +
                'Whether a picture actually reaches you depends on the model: on a text-only model the picture ' +
                'is not passed on and the result says so — never describe a drawing you have not seen. Vector ' +
                'source, on the other hand, reaches every model.',
            readOnly: true,
            vision: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name (see xce_list_sprites).'},
                    costume: {
                        type: 'string',
                        description: 'Costume name or index (0-based). Omit to see the current costume.'
                    },
                    format: {
                        type: 'string',
                        enum: ['auto', 'svg', 'image'],
                        description: 'What you want back. "auto" (the default) sends SVG source for a vector ' +
                            'costume and a picture otherwise. "svg" insists on source — a bitmap costume then ' +
                            'comes back as an error saying there is none. "image" always sends the picture.'
                    }
                },
                required: ['sprite']
            },
            handler: async ({sprite, costume, format}, ctx = {}) => {
                const known = port.listCostumes(sprite);
                if (!known) return fail(`No sprite named "${sprite}". Sprites: ${listSprites(port)}`);
                const mode = format === 'svg' || format === 'image' ? format : 'auto';

                // 矢量造型优先给源码（比图片省 token，而且能照着改）；太长才退回图片。
                if (mode !== 'image') {
                    const source = await port.readCostumeSvg(sprite, costume);
                    if (source && source.bitmap && mode === 'svg') {
                        return fail(`Costume "${source.name}" of "${sprite}" is a bitmap image` +
                            `${source.size ? ` (${source.size.join('x')})` : ''}, not a vector drawing, so ` +
                            'there is no SVG source to read. Call again with format "image" to look at it.');
                    }
                    if (source && !source.bitmap) {
                        const head = `Costume "${source.name}" of "${sprite}" is a vector drawing` +
                            `${source.width && source.height ? `, ${source.width}x${source.height}` : ''}.`;
                        if (!source.svg) {
                            return fail(`${head} Its SVG source could not be read out of the project file, so ` +
                                'there is nothing to show. Call again with format "image" to look at it instead.');
                        }
                        if (source.svg.length <= MAX_SVG_CHARS) {
                            return ok(`${head} Its SVG source follows.\n${source.svg}`);
                        }
                        if (mode === 'svg') {
                            return ok(`${head} Its SVG source is ${Math.ceil(source.svg.length / 1024)}KB, over ` +
                                `the ${MAX_SVG_CHARS / 1024}KB limit for source text, so it was not sent. Call ` +
                                'again with format "image" to see the picture instead.');
                        }
                        // auto 且过长：往下走图片那条
                    }
                }

                if (!ctx.supportsImage) {
                    return ok(
                        `xce_read_costume returns a picture, but the current model does not read images, so ` +
                        `nothing was captured. Say that once instead of describing the drawing.\n${VISION_SWITCH_HINT}`
                    );
                }
                const shot = await port.snapshotCostume(sprite, costume);
                if (!shot) {
                    const names = known.map(entry => `${entry.index}: ${entry.name}`).join(', ');
                    return fail(`No costume could be captured for "${sprite}" (asked for ` +
                        `${costume === void 0 || costume === '' ? 'the current costume' : `"${costume}"`}). ` +
                        `Its costumes — ${names || 'none'} — and a costume that failed to load cannot be drawn.`);
                }
                return {
                    content: `Costume "${shot.name}" of "${sprite}" (${shot.width}x${shot.height}, ` +
                        'on a transparent background).',
                    images: [{url: await shrinkImage(shot.dataUrl), mimeType: 'image/png'}]
                };
            }
        },

        {
            name: 'xce_save_memory',
            description:
                `Save ONE lasting fact so a later conversation still knows it. Your memory index is in your ` +
                `prompt every turn, so this is how you remember across days.\n` +
                `Save when the user tells you something durable: what to call them, how they like their work ` +
                `explained, a correction you must not repeat, what their project is really for. Do NOT save ` +
                `what is only true right now (what a variable holds, what you were just doing), and never save ` +
                `a password, key or other secret.\n` +
                `\`name\` is the handle — a few words, e.g. "what to call the user". **The same name overwrites ` +
                `that memory**, so reuse the name when a fact changes instead of inventing a near-duplicate; ` +
                `check the index in your prompt first.\n` +
                `\`description\` is what you will actually see next time: one line saying what this memory ` +
                `holds, worded so you can tell whether to read it.\n` +
                `\`body\` is the fact itself, in the user's language, complete enough to be useful on its own ` +
                `(it is the only part not shown to you automatically — read it back with xce_read_memory).\n` +
                `\`type\` is one of: user (who they are, what they prefer), feedback (how you should work), ` +
                `project (what they are building), reference (where something lives).\n` +
                `The editor keeps at most ${MEMORY_LIMITS.max} memories: when it is full you get an error ` +
                `— overwrite an existing one or delete one instead of piling up duplicates.`,
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Short handle for this fact (same name = update that memory).'
                    },
                    description: {
                        type: 'string',
                        description: 'One line saying what this memory holds — this is all you see later.'
                    },
                    type: {
                        type: 'string',
                        enum: MEMORY_TYPES.map(kind => kind.value),
                        description: 'Which kind of fact this is.'
                    },
                    body: {
                        type: 'string',
                        description: 'The fact itself, in the user\'s language. Stamping a date ' +
                            '(e.g. 2026-10-05) is a good habit — later reads can tell how fresh it is — ' +
                            'but a suggestion, not a rule.'
                    }
                },
                required: ['name', 'description', 'type', 'body']
            },
            handler: ({name, description, type, body}) => {
                const result = saveMemory({name, description, type, body});
                if (!result.memory) {
                    if (result.error && result.error.includes('memories')) {
                        return fail(
                            `Your memory store is full (${MEMORY_LIMITS.max}). Read the index in your prompt, ` +
                            'then overwrite one with xce_save_memory under its own name, or drop one with ' +
                            'xce_delete_memory — do not save a near-duplicate.'
                        );
                    }
                    return fail('A memory needs a name.');
                }
                const verb = result.created ? 'Saved a new memory' : 'Updated the memory';
                const clipped = result.clipped && result.clipped.length ?
                    ` (${result.clipped.join(' and ')} was longer than the limit and got shortened)` : '';
                return ok(`${verb} named "${result.memory.name}" (type: ${result.memory.type})${clipped}. ` +
                    'It shows up in your memory index from the next turn on.');
            }
        },

        {
            name: 'xce_read_memory',
            description:
                'Read one saved memory in full, by name. Your prompt carries the memory index — names and ' +
                'one-line descriptions only — so call this when one of them matters for the work in front of ' +
                'you and the description is not enough. Nothing here is needed to use the editor: skip it ' +
                'when the description already tells you what you need.',
            readOnly: true,
            inputSchema: {
                type: 'object',
                properties: {
                    name: {type: 'string', description: 'Name of the memory, as it appears in the index.'}
                },
                required: ['name']
            },
            handler: ({name}) => {
                const memory = findMemory(name);
                if (!memory) {
                    const known = memoryIndexText();
                    const hint = known ? ` What you have:\n${known}` : ' You have no memories saved yet.';
                    return fail(`No memory named "${name}".${hint}`);
                }
                return ok(`# ${memory.name} (${memory.type})\n${memory.description}\n\n${memory.body}`);
            }
        },

        {
            name: 'xce_delete_memory',
            description:
                'Delete one saved memory by name. Do it when the user says the memory is wrong or no longer ' +
                'true, or when two memories say the same thing. If the fact CHANGED rather than stopped being ' +
                'true, overwrite it with xce_save_memory under the same name instead of deleting and re-adding.',
            destructive: true,
            inputSchema: {
                type: 'object',
                properties: {
                    name: {type: 'string', description: 'Name of the memory to delete.'}
                },
                required: ['name']
            },
            handler: ({name}) => {
                const memory = findMemory(name);
                if (!memory) {
                    const known = memoryIndexText();
                    const hint = known ? ` What you have:\n${known}` : ' You have no memories saved yet.';
                    return fail(`No memory named "${name}"; nothing was deleted.${hint}`);
                }
                deleteMemory(memory.id);
                return ok(`Deleted the memory "${memory.name}". It is gone from the next turn's index on.`);
            }
        },

        {
            name: 'xce_write_project_memory',
            description:
                'Save ONE project-level memory — a named fact that belongs to THIS project, not to you ' +
                'personally: how its login works, its naming conventions, what its controls do, what is ' +
                'still TODO. Unlike your personal memory (xce_save_memory) it rides inside the project ' +
                `file itself, so anyone opening this project's AI gets it.\n` +
                `Mechanics, handled for you: the fact becomes one comment in 「${MEMORY_CONTENT_SPRITE}」 ` +
                '(full text), and a one-line summary "- name — description" lands in the ' +
                `「${MEMORY_INDEX_SPRITE}」 comment whose index reaches you in the system prompt every ` +
                'turn. The reserved sprites are created automatically on the first save.\n' +
                '**The same name overwrites that memory** — check the index in your prompt first and reuse ' +
                'names instead of piling up near-duplicates. Write the body in the user\'s language, ' +
                'complete enough to stand on its own; never store secrets.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Short handle for this fact (same name = update that memory).'
                    },
                    description: {
                        type: 'string',
                        description: 'One-line summary for the index — worded so you can later tell ' +
                            'whether to read the full text.'
                    },
                    body: {
                        type: 'string',
                        description: 'The fact itself, in the user\'s language. Stamping a date ' +
                            '(e.g. 2026-10-05) is a good habit — later reads can tell how fresh it is — ' +
                            'but a suggestion, not a rule.'
                    }
                },
                required: ['name', 'description', 'body']
            },
            handler: async ({name, description, body}) => {
                const made = await port.writeProjectMemory({name, description, body});
                if (!made.ok) {
                    if (made.reason === 'no-name') return fail('A memory needs a name.');
                    if (made.reason === 'empty') {
                        return fail('The memory body is empty — write the actual fact, not just the summary.');
                    }
                    return fail('Could not write the project memory.');
                }
                const head = made.created ? 'Saved a new project memory' : 'Updated the project memory';
                const spritesNote = made.createdSprites.length ?
                    ` (this also created the reserved sprite${made.createdSprites.length === 1 ? '' : 's'} ` +
                    `${made.createdSprites.map(spriteName => `「${spriteName}」`).join(' and ')})` : '';
                return {
                    content: `${head} "${name}"${spritesNote}. Its summary is in the index comment that ` +
                        'reaches you every turn; read the full text back with xce_read_project_memory.',
                    undo: {
                        kind: 'memory',
                        phase: 'write',
                        name,
                        commentId: made.commentId,
                        createdSprites: made.createdSprites,
                        prevContent: made.prevContent,
                        prevIndex: made.prevIndex
                    }
                };
            }
        },

        {
            name: 'xce_read_project_memory',
            description:
                'Read one project-level memory in full, by name — the index in your prompt only carries ' +
                'names and one-line summaries. Skip it when the summary already tells you what you need.',
            readOnly: true,
            inputSchema: {
                type: 'object',
                properties: {
                    name: {type: 'string', description: 'Name of the memory, as it appears in the index.'}
                },
                required: ['name']
            },
            handler: ({name}) => {
                const made = port.readProjectMemory(name);
                if (!made.ok) {
                    const index = port.readMemoryIndex();
                    const hint = index ? ` What this project remembers:\n${index}` :
                        ' This project has no memories yet.';
                    return fail(`No project memory named "${name}".${hint}`);
                }
                return ok(`# ${name}\n${made.text}`);
            }
        },

        {
            name: 'xce_delete_project_memory',
            description:
                'Delete one project-level memory by name — when the user says it is wrong or no longer ' +
                'true, or two entries say the same thing. If the fact CHANGED rather than stopped being ' +
                'true, overwrite it with xce_write_project_memory under the same name instead.',
            destructive: true,
            inputSchema: {
                type: 'object',
                properties: {
                    name: {type: 'string', description: 'Name of the memory to delete.'}
                },
                required: ['name']
            },
            handler: ({name}) => {
                const made = port.deleteProjectMemory(name);
                if (!made.ok) {
                    const index = port.readMemoryIndex();
                    const hint = index ? ` What this project remembers:\n${index}` :
                        ' This project has no memories yet.';
                    return fail(`No project memory named "${name}"; nothing was deleted.${hint}`);
                }
                return {
                    content: `Deleted the project memory "${name}". Its line is gone from the index ` +
                        'from the next turn on.',
                    undo: {
                        kind: 'memory',
                        phase: 'delete',
                        name,
                        entry: made.entry,
                        prevIndex: made.prevIndex
                    }
                };
            }
        },

        {
            name: 'xce_read_skill',
            description:
                'List the RAG reference documents (fastdocs) that exist for this editor, the team behind ' +
                'it and its sister sites — one line each. Takes no arguments.\n' +
                'Terminology, so it does not get muddled: these documents are NOT "skills". A skill is ' +
                'something you can do — writing blocks, drawing sprites, firing events — and this lookup ' +
                'itself is one of your skills. What you read here is reference material, and the names ' +
                'all start with xce_fastdocs_ for exactly that reason.\n' +
                'Call this FIRST, before answering anything about the editor itself, CaelLab, or those ' +
                'sites: the documents are deliberately kept out of the prompt, so this is the only way to ' +
                'know what is available, and they beat anything you only half-remember. To actually read ' +
                'one, pass its name to xce_read_fast_docs.',
            readOnly: true,
            inputSchema: {type: 'object', properties: {}},
            handler: () => {
                if (!skills.length) return ok('No reference documents are loaded.');
                const lines = skills.map(skill => `- \`${skill.name}\` — ${skill.description}`);
                return ok('Available fastdocs (read one in full with xce_read_fast_docs and its name):\n' +
                    `${lines.join('\n')}`);
            }
        },

        {
            name: 'xce_read_fast_docs',
            description:
                'Read one reference document (fastdoc) in full, by name — get the names from ' +
                'xce_read_skill. What you read here is RAG reference material, not a skill: it exists so ' +
                'you can look facts up before answering.\n' +
                'Each fastdoc is a SHORT overview; when it is not enough, pass "<fastdoc>/<doc>" to read ' +
                'one of its detailed documents (a fastdoc lists the detailed docs it has).\n' +
                'One call per document; do not fetch documents you do not need, and never answer a ' +
                'question the documents cover without reading them first.',
            readOnly: true,
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Document name: a fastdoc ("xce_fastdocs_engine"), or one of its ' +
                            'detailed docs ("xce_fastdocs_engine/write-scripts"). Fastdocs available: ' +
                            `${skills.map(skill => skill.name).join(', ') || '(none loaded)'}`
                    }
                },
                required: ['name']
            },
            handler: ({name}) => {
                const wanted = String(name || '').trim();
                const slashAt = wanted.indexOf('/');
                if (slashAt !== -1) {
                    // 读某篇详细文档
                    const skillName = wanted.slice(0, slashAt);
                    const docName = wanted.slice(slashAt + 1);
                    const skill = skills.find(entry => entry.name === skillName);
                    const doc = skill && (skill.docs || []).find(entry => entry.name === docName);
                    if (!doc) {
                        const own = skill ?
                            `"${skillName}" has these detailed docs: ` +
                            `${(skill.docs || []).map(entry => entry.name).join(', ') || '(none)'}` :
                            `There is no fastdoc called "${skillName}" — call xce_read_skill first.`;
                        return fail(`No such detailed doc: ${wanted}. ${own}`);
                    }
                    return ok(doc.body);
                }
                const skill = skills.find(entry => entry.name === wanted);
                if (!skill) {
                    return fail(
                        skills.length ?
                            `There is no fastdoc called "${wanted}". Call xce_read_skill to see what exists; ` +
                            `available: ${skills.map(entry => entry.name).join(', ')}` :
                            'No reference documents are loaded.'
                    );
                }
                // 简略版 + 它有哪些详细文档（详细文档必须主动来读，不喂提示词）
                const docs = skill.docs || [];
                const docLines = docs.map(entry => `- ${skill.name}/${entry.name}`).join('\n');
                const docList = docs.length ?
                    `\n\nDetailed docs (read one with xce_read_fast_docs, named "${skill.name}/<doc>"):\n${docLines}` :
                    '';
                return ok(`${skill.body}${docList}`);
            }
        },

        {
            name: 'xce_get_time',
            description:
                'Get the current time. Returns UTC (ISO 8601) plus the user device\'s local timezone and ' +
                'local time. Your internal sense of "now" drifts during a long conversation — call this ' +
                'again whenever a fresh timestamp matters, and mind the time difference when you speak ' +
                'about the user\'s local time.',
            readOnly: true,
            inputSchema: {type: 'object', properties: {}},
            handler: () => {
                const now = new Date();
                let zone = '';
                try {
                    const offsetMin = -now.getTimezoneOffset();
                    const sign = offsetMin >= 0 ? '+' : '-';
                    const abs = Math.abs(offsetMin);
                    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
                    const mm = String(abs % 60).padStart(2, '0');
                    const options = Intl.DateTimeFormat().resolvedOptions();
                    zone = `${options.timeZone || 'unknown'} (UTC${sign}${hh}:${mm}), local time: ` +
                        `${now.toLocaleString(options.locale, {hour12: false})}`;
                } catch (e) {
                    // 拿不到时区就只给 UTC
                }
                const lines = [`Current UTC time: ${now.toISOString()}`];
                if (zone) lines.push(`User device timezone: ${zone}`);
                lines.push('[Note] You and the user may be in different timezones: when you tell the user a ' +
                    'time, use the local time above (or convert first) — never pass UTC off as the user\'s time.');
                return ok(lines.join('\n'));
            }
        },

        {
            name: 'xce_read_env',
            description:
                'Where this editor is running, and the machine around it: which build (the desktop client or ' +
                'the web page), operating system, app or browser version, window size, whether the user is on ' +
                'a touch screen, and the interface language.\n' +
                'The system prompt only says which of the two builds this is. Call this when the difference ' +
                'actually matters for what you are about to say or write — for example before you tell the ' +
                'user how to open a file, or when a layout has to work in a small window.\n' +
                'It says nothing about the project; use xce_list_sprites for that.',
            readOnly: true,
            inputSchema: {type: 'object', properties: {}},
            handler: () => {
                const nav = typeof navigator === 'undefined' ? null : navigator;
                const win = typeof window === 'undefined' ? null : window;
                const ua = (nav && nav.userAgent) || '';
                const desktop = isDesktopMode();
                const lines = [`Runtime: ${desktop ?
                    'XCE Desktop — the installed desktop client (an Electron app in its own window), not a ' +
                        'browser page. Reading a web page with xce_read_online is done by the app itself, so ' +
                        'cross-origin rules do not apply.' :
                    'the web version of XCE, running inside a browser page. Reading a web page with ' +
                        'xce_read_online is done from the page, so most sites block it (CORS).'}`];
                const os = osFromUserAgent(ua);
                if (os) lines.push(`Operating system: ${os}`);
                const engine = engineFromUserAgent(ua);
                if (engine) lines.push(`Browser or app engine: ${engine}`);
                if (win && win.innerWidth) {
                    lines.push(`Window: ${win.innerWidth}x${win.innerHeight} CSS pixels` +
                        `, device pixel ratio ${win.devicePixelRatio || 1}`);
                }
                if (typeof screen !== 'undefined' && screen.width) {
                    lines.push(`Screen: ${screen.width}x${screen.height} CSS pixels`);
                }
                if (win && typeof win.matchMedia === 'function') {
                    const coarse = win.matchMedia('(pointer: coarse)').matches;
                    lines.push(`Touch input: ${coarse ?
                        'yes — a finger is the main pointer, so this is probably a phone or a tablet' :
                        'no — a mouse or a trackpad'}`);
                }
                if (nav && nav.language) lines.push(`Interface language: ${nav.language}`);
                lines.push('[Note] This is a snapshot taken now; the window size can change later. When the ' +
                    'runtime is the desktop client, do not tell the user to do things in a browser — they are ' +
                    'already in the app.');
                return ok(lines.join('\n'));
            }
        },

        {
            name: 'xce_time',
            description:
                'Wait a number of seconds, then continue — for the cases where something really does need ' +
                'wall-clock time to pass (a project still running, an animation that has to finish) instead ' +
                'of hammering xce_read_state in a tight loop.\n' +
                'Keep it short: this spends the user\'s real time. Prefer 10 seconds or less, and never ' +
                `exceed ${MAX_WAIT_SECONDS} seconds — the wait is clamped to that ceiling. Do not chain long ` +
                'waits to "wait out" a problem; if 10 seconds would not settle it, the approach is wrong.\n' +
                'While you wait, the user sees a 跳过 (skip) button and may end the wait at any moment. The ' +
                'result states how long actually elapsed and whether it was cut short — read it before ' +
                'acting as if the whole wait happened.',
            skippable: true,
            inputSchema: {
                type: 'object',
                properties: {
                    seconds: {
                        type: 'number',
                        description: `Seconds to wait (must be > 0; capped at ${MAX_WAIT_SECONDS}). ` +
                            'Keep it at 10 or below unless the task truly needs more.'
                    }
                },
                required: ['seconds']
            },
            handler: async ({seconds}, ctx = {}) => {
                const wanted = Number(seconds);
                if (!Number.isFinite(wanted) || wanted <= 0) {
                    return fail('seconds must be a number greater than 0 (unit: seconds). If you want to keep ' +
                        'going, do not call this tool.');
                }
                const total = Math.min(wanted, MAX_WAIT_SECONDS);
                const elapsed = (await waitSeconds(total, ctx)).toFixed(1);
                const clamped = wanted > MAX_WAIT_SECONDS ?
                    ` (you asked for ${wanted}s, above the ${MAX_WAIT_SECONDS}s ceiling, so the ceiling was ` +
                    'used.)' : '';
                if (ctx.signal && ctx.signal.aborted) {
                    return ok(`The wait was interrupted (the user pressed stop): it actually lasted ` +
                        `${elapsed}s.${clamped}`);
                }
                if (ctx.skip && ctx.skip.skipped) {
                    return ok(
                        `The user skipped this wait: only ${elapsed}s actually passed (of ${total}s). ` +
                        `Do not treat that time as having elapsed. If you still need time, say why and wait ` +
                        `again briefly; if something can run while you watch it (xce_run_project), do not sit ` +
                        `idle.${clamped}`
                    );
                }
                return ok(`Waited about ${total}s.${clamped}`);
            }
        },

        {
            name: 'xce_ask_user',
            description:
                'Put a question to the user and wait for their answer; the answer comes back as this tool\'s ' +
                'result, so the turn carries on by itself.\n' +
                'Use it when you genuinely need a decision before you can continue and the answer is a ' +
                'choice — which of two designs, a name for something, whether to remove work. Do not use it ' +
                'to make conversation, and do not ask for permission to do what you were already asked to ' +
                'do: keep going unless you are actually stuck.\n' +
                'The editor enforces these: 1 to 4 questions per call, each with 2 to 4 options; a "write my ' +
                'own answer" box is added by the editor, so never add an option for that. Put the option you ' +
                'recommend FIRST and end its label with the user\'s word for "recommended" (in Chinese: ' +
                '（推荐）) — the editor adds no marker of its own.\n' +
                'Write the question, the header and every label in the user\'s language, in words a 10-15 ' +
                'year old reads easily.\n' +
                'If the user stops the turn or dismisses the question instead of answering, the result says ' +
                'so: finish what you can, say plainly what is still unknown, and do not ask it again. The ' +
                'question also closes by itself when no reply comes for a couple of minutes, so an ask is ' +
                'not a way to pause for a long time.',
            inputSchema: {
                type: 'object',
                properties: {
                    questions: {
                        type: 'array',
                        description: `One to ${ASK_LIMITS.questions.max} questions.`,
                        items: {
                            type: 'object',
                            properties: {
                                question: {
                                    type: 'string',
                                    description: 'The question itself, one sentence, in the user\'s language.'
                                },
                                header: {
                                    type: 'string',
                                    description: 'Very short label (max 12 characters) shown as a chip above ' +
                                        'the question.'
                                },
                                multiSelect: {
                                    type: 'boolean',
                                    description: 'Let the user pick more than one option. Default false.'
                                },
                                options: {
                                    type: 'array',
                                    description: `The ${ASK_LIMITS.options.min} to ${ASK_LIMITS.options.max} ` +
                                        'answers to choose between, the recommended one first.',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            label: {
                                                type: 'string',
                                                description: 'The answer itself (1-5 words).'
                                            },
                                            description: {
                                                type: 'string',
                                                description: 'One sentence on what this choice means.'
                                            }
                                        },
                                        required: ['label']
                                    }
                                }
                            },
                            required: ['question', 'options']
                        }
                    }
                },
                required: ['questions']
            },
            validate: input => {
                if (normalizeQuestions(input && input.questions).length) return null;
                return 'questions must be an array of 1-4 items, and every item needs a "question" string ' +
                    'plus an "options" array of 2-4 objects shaped {label, description}. Nothing usable was ' +
                    'passed, so the user was not asked anything.';
            },
            handler: async ({questions}, ctx = {}) => {
                const list = normalizeQuestions(questions);
                if (typeof ctx.ask !== 'function') {
                    return fail('This environment cannot put a question to the user. Ask in your reply ' +
                        'instead: write the question out and say which option you recommend.');
                }
                const answers = await ctx.ask(list);
                if (!answers) {
                    return ok('The user did not answer — the turn was stopped, the question was dismissed, ' +
                        'or a couple of minutes went by with no reply. Do not ask it again: finish what you can, ' +
                        'and say plainly what is still unknown.');
                }
                const lines = list.map((entry, index) => {
                    const answer = String(answers[index] || '').trim() || '(no answer)';
                    return `${index + 1}. ${entry.question}\n   The user chose: ${answer}`;
                });
                return ok(`The user answered:\n${lines.join('\n')}`);
            }
        },

        {
            name: 'xce_read_online',
            description: readOnlineDescription,
            readOnly: true,
            inputSchema: {
                type: 'object',
                properties: {
                    url: {type: 'string', description: 'Full http(s) URL of the page to read.'}
                },
                required: ['url']
            },
            handler: ({url}, ctx = {}) => fetchOnline(url, {signal: ctx.signal})
        },

        {
            name: 'xce_search',
            description:
                'Search with CaelLabSearch, CaelLab\'s own search engine at caellab.click. Returns up to ' +
                `${MAX_RESULTS} results, one line each: title (cut at ${TITLE_CAP} characters), site, URL and a ` +
                `snippet (cut at ${DESC_CAP} characters). The index covers the CaelLab sites and pages it has ` +
                'crawled from the wider web.\n' +
                'Use it whenever the answer depends on the outside world — a library, a TurboWarp feature, a ' +
                'site the user names. This is the real lookup; what you remember is not a substitute.\n' +
                'Keep the query short and literal — a word or two, spelled the way the user said it. This ' +
                'index matches words, it does not understand a sentence, so padding the query makes it find ' +
                'less, not more: searching for Redis is the query "Redis", not "what is Redis and how do I ' +
                'use it in Scratch", and stacked synonyms or extra adjectives only get in the way. Send the ' +
                'bare term first; narrow it only when the first result gives you something to refine.\n' +
                'If it errors or turns up nothing, do not stop and do not hand the job to the user: retry ' +
                'with different keywords, and read a page whose URL you already know via xce_read_online. ' +
                'Only if that still leaves you empty-handed, answer from your own knowledge and label it as ' +
                'yours — not a fresh search, so it may be out of date. Never write invented text as a search ' +
                'result.\n' +
                'The result begins with the result page URL and states that the results come from ' +
                'CaelLabSearch; keep that attribution when you tell the user where something came from, and ' +
                'give them the URL so they can see the full list.\n' +
                'It returns snippets only, so to read a whole page pass its URL to xce_read_online.',
            readOnly: true,
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search keywords, in the user\'s language — just the few words ' +
                            'that matter, spelled the way the user said them. A bare term stays bare: ' +
                            'searching for Redis means the query "Redis", not a sentence about it.'
                    }
                },
                required: ['query']
            },
            handler: async ({query}, ctx = {}) => {
                try {
                    return await searchCaelLab(query, {signal: ctx.signal});
                } catch (e) {
                    // 抛出去会被 loop 包成「Tool execution failed: …」，这里自己收成干净的英文便于直接给用户看
                    return fail((e && e.message) || String(e));
                }
            }
        }
    ];

    return tools;
};
