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

import {fetchOnline, isDesktopMode} from './online.js';
import {searchCaelLab, MAX_RESULTS, TITLE_CAP, DESC_CAP} from './search.js';

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
        // 造型名要给：加造型（xce_add_costume）和看造型（xce_read_costume）都按名字指认它
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
        'Most websites block a browser page from reading them (CORS), and a page behind a login or drawn ' +
        'entirely by JavaScript comes back empty or partial, so a fetch fails more often than it succeeds; ' +
        'the error says why.';
    // 逐段拼成一篇，段间换行；「哪一级环境」那句是变量，拼在数组里而不是串接，免得踩 prefer-template
    const readOnlineDescription = [
        'Fetch one public web page by URL and return it as readable text (not HTML): page title first, then ' +
        'the body text, hidden content stripped.',
        'Hard limits: 5 second timeout, at most 20KB of text, head summary capped at 2KB — if the body was ' +
        'truncated the result says so, and you must pass that on instead of treating the excerpt as the ' +
        'whole page.',
        fetchReach,
        'When a fetch does fail, find another way instead of stopping: try a different URL, then fall back on ' +
        'what you already know and say that is where it came from. Never invent page content for a page you ' +
        'did not fetch; never reconstruct a page from memory.',
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
                return ok(`${header.join('\n')}\n${lines.join('\n') || '(this sprite has no blocks yet)'}`);
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
                'Get the top block id from a previous xce_read_project or xce_write_script result; ' +
                'xce_read_project never prints ids, so ask for the script text first and identify it ' +
                'from the user\'s description.',
            destructive: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name.'},
                    topBlockId: {type: 'string', description: 'Id of the script\'s top block.'}
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
            name: 'xce_add_sprite',
            description:
                'Create a NEW sprite (角色) in the project and select it — the user\'s sprite list grows by one.\n' +
                'Pass `svg` to give it a look you drew yourself: a complete, self-contained SVG document that ' +
                'becomes the sprite\'s first costume (the blank costume the editor would otherwise make is ' +
                'removed). **Read the drawing skill before you draw**: xce_read_skill lists it, ' +
                'xce_read_fast_docs opens it, and it has the rules that make an SVG this editor can show.\n' +
                'The name must not already be taken — check with xce_list_sprites. Without `svg` you get an ' +
                'empty sprite for the user to draw in, which is rarely what was asked for.\n' +
                'After creating it, look at the costume with xce_read_costume (vision models only) before ' +
                'telling the user it is done.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {type: 'string', description: 'Name for the new sprite. Must not already exist.'},
                    svg: {
                        type: 'string',
                        description: 'The sprite\'s first costume: a complete SVG document. The root <svg> ' +
                            'must carry width and height; nothing may be loaded from outside the document.'
                    },
                    x: {type: 'number', description: 'Stage x position. Default 0 (centre).'},
                    y: {type: 'number', description: 'Stage y position. Default 0 (centre).'},
                    size: {type: 'number', description: 'Size in percent. Default 100.'},
                    direction: {type: 'number', description: 'Direction in degrees. Default 90 (facing right).'},
                    visible: {type: 'boolean', description: 'Whether it starts visible. Default true.'}
                },
                required: ['name']
            },
            handler: async ({name, svg, x, y, size, direction, visible}) => {
                const result = await port.addSprite({name, svg, x, y, size, direction, visible});
                if (!result.ok) {
                    if (result.reason === 'duplicate') {
                        return fail(`A sprite named "${name}" already exists. Sprites: ${result.sprites}. ` +
                            'Choose a different name, or add the costume to that sprite with xce_add_costume.');
                    }
                    if (result.reason === 'no-name') return fail('The name parameter is required and cannot be empty.');
                    if (result.reason === 'no-storage') {
                        return fail('The editor is not ready to hold image assets yet — nothing was created.');
                    }
                    return fail(`Could not create a sprite named "${name}".`);
                }
                const lines = [`Created sprite "${result.name}" and selected it.`];
                if (result.costume) {
                    lines.push(`Its costume is your drawing (${result.costume.width}x${result.costume.height}), ` +
                        'and the editor\'s blank costume was removed.');
                    if (result.costume.broken) {
                        lines.push('The editor could not render that SVG, so the sprite shows as a blank shape. ' +
                            'Fix the drawing (see the drawing skill) and add a corrected costume with ' +
                            'xce_add_costume.');
                    }
                } else if (result.costumeFailed) {
                    // 角色确实建出来了，只是图没挂上 —— undo 还是要给，不然用户没法把空角色撤掉
                    return {
                        content: `Created the sprite "${result.name}", but your SVG was not used. ` +
                            `${SVG_SIZE_HINT} Fix that and call xce_add_costume to give the sprite its look.`,
                        isError: true,
                        undo: {kind: 'sprite', sprite: result.name}
                    };
                } else {
                    lines.push('It starts with the editor\'s blank costume, waiting for the user to draw in it.');
                }
                return {content: lines.join('\n'), undo: {kind: 'sprite', sprite: result.name}};
            }
        },

        {
            name: 'xce_add_costume',
            description:
                'Add one more costume to an existing sprite, drawn as an SVG document you write. The costume ' +
                'is appended at the end and becomes the sprite\'s current one, so the sprite\'s look on the ' +
                'stage changes immediately.\n' +
                'Same SVG rules as xce_add_sprite — **read the drawing skill first** (xce_read_skill, then ' +
                'xce_read_fast_docs): the root <svg> needs width and height, and the document must be ' +
                'self-contained.\n' +
                'Use it to give a sprite several looks (walk cycles, open/closed states) that the user can ' +
                'switch between with the 「下一个造型」 block.',
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name (see xce_list_sprites).'},
                    svg: {
                        type: 'string',
                        description: 'The new costume: a complete SVG document, root <svg> with width and height.'
                    },
                    name: {type: 'string', description: 'Name for the costume, e.g. "walking". Default 造型N.'}
                },
                required: ['sprite', 'svg']
            },
            handler: async ({sprite, svg, name}) => {
                const result = await port.addCostume(sprite, {svg, name});
                if (!result.ok) {
                    if (result.reason === 'missing') {
                        return fail(`No sprite named "${sprite}". Existing sprites: ${result.sprites}`);
                    }
                    if (result.reason === 'bad-size') return fail(SVG_SIZE_HINT);
                    if (result.reason === 'no-svg') return fail('The svg parameter is required.');
                    if (result.reason === 'no-storage') {
                        return fail('The editor is not ready to hold image assets yet — no costume was added.');
                    }
                    return fail(`Could not add a costume to "${sprite}".`);
                }
                return {
                    content: `Added costume "${result.costume.name}" (${result.costume.width}x` +
                        `${result.costume.height}) to "${result.sprite}"; it is now the current costume ` +
                        `(index ${result.costume.index}).`,
                    undo: {kind: 'costume', sprite: result.sprite, index: result.costume.index}
                };
            }
        },

        {
            name: 'xce_read_costume',
            description:
                'Look at one costume of one sprite as a picture. Use it right after drawing a costume with ' +
                'xce_add_sprite or xce_add_costume — that is how you check your own drawing came out right ' +
                'before you tell the user it is done.\n' +
                'It shows the costume on its own (not the stage), so it works before the project is even run.\n' +
                'Whether the picture actually reaches you depends on the model: text-only models get a note ' +
                'instead, and must not describe a drawing they have not seen.',
            readOnly: true,
            vision: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name (see xce_list_sprites).'},
                    costume: {
                        type: 'string',
                        description: 'Costume name or index (0-based). Omit to see the current costume.'
                    }
                },
                required: ['sprite']
            },
            handler: async ({sprite, costume}, ctx = {}) => {
                if (!ctx.supportsImage) {
                    return ok(
                        `xce_read_costume returns a picture, but the current model does not read images, so ` +
                        `nothing was captured. Say that once instead of describing the drawing.\n${VISION_SWITCH_HINT}`
                    );
                }
                const known = port.listCostumes(sprite);
                if (!known) return fail(`No sprite named "${sprite}". Sprites: ${listSprites(port)}`);
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
            name: 'xce_read_skill',
            description:
                'List the reference documents ("skills") that exist for this editor and the team and sites ' +
                'around it — one line each. Takes no arguments.\n' +
                'Call this FIRST, before answering anything about the editor itself, CaelLab, or those ' +
                'sites: the documents are deliberately kept out of the prompt, so this is the only way to ' +
                'know what is available, and they beat anything you only half-remember. To actually read ' +
                'one, pass its name to xce_read_fast_docs.',
            readOnly: true,
            inputSchema: {type: 'object', properties: {}},
            handler: () => {
                if (!skills.length) return ok('No reference documents are loaded.');
                const lines = skills.map(skill => `- \`${skill.name}\` — ${skill.description}`);
                return ok(`Available skills (read one in full with xce_read_fast_docs and its name):\n` +
                    `${lines.join('\n')}`);
            }
        },

        {
            name: 'xce_read_fast_docs',
            description:
                'Read one reference document in full, by name (get the names from xce_read_skill).\n' +
                'Each skill is a SHORT overview; when it is not enough, pass "<skill>/<doc>" to read one ' +
                'of its detailed documents (a skill lists the detailed docs it has).\n' +
                'One call per document; do not fetch documents you do not need, and never answer a ' +
                'question the documents cover without reading them first.',
            readOnly: true,
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Document name: a skill ("xce_engine"), or one of its detailed ' +
                            'docs ("xce_engine/write-scripts"). Skills available: ' +
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
                            `There is no skill called "${skillName}" — call xce_read_skill first.`;
                        return fail(`No such detailed doc: ${wanted}. ${own}`);
                    }
                    return ok(doc.body);
                }
                const skill = skills.find(entry => entry.name === wanted);
                if (!skill) {
                    return fail(
                        skills.length ?
                            `There is no skill called "${wanted}". Call xce_read_skill to see what exists; ` +
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
