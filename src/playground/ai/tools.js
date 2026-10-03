/**
 * 给模型用的工具。
 *
 * 两条规矩：
 *   1. 全部只通过 ScratchPort 访问项目，不直接碰 VM / Blockly —— 同一套工具能跑在浏览器
 *      （真 VM）和无头环境（headless scratch-vm / 假 port）里。
 *   2. **description 用英文写**（和系统提示词一样，指令稳定性更好、也更省 token），
 *      但返回给模型看的 content 用中文 —— 那些字还要原样显示在界面的工具卡上给用户看。
 *
 * 结果形状：{content, isError?, undo?, images?}。images 是 [{url, mimeType}]，
 * 只有当前模型收图片时才会被填上（见 xce_read_stage）。
 */

import {fetchOnline} from './online.js';

const ok = content => ({content});
const fail = content => ({content, isError: true});

const listSprites = port =>
    port.listSprites().map(s => `${s.name}${s.isStage ? '（舞台）' : ''}`)
        .join('、');

// 图片太大的话压一下再发：舞台在高分屏上可能被渲染成 960x720 甚至更大，
// PNG 原图能到几百 KB，白烧 token。只缩尺寸，仍存 PNG（舞台可能是透明底，JPEG 会变黑）。
const MAX_IMAGE_CHARS = 300 * 1024;
const MAX_EDGE = 720;

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
    const tools = [
        {
            name: 'xce_read_project',
            description:
                'Read the blocks of the open Scratch project as block text (scratchblocks notation).\n' +
                'Returns one section per sprite, each headed by the sprite name and its variables/lists.\n' +
                'Call this before writing whenever you are unsure what already exists.\n' +
                'In the returned text, `[name v]` stands for a variable or list dropdown; copy it ' +
                'verbatim when writing back.',
            readOnly: true,
            inputSchema: {
                type: 'object',
                properties: {
                    sprite: {type: 'string', description: 'Sprite name. Omit to read every sprite including the stage.'}
                }
            },
            handler: ({sprite}) => {
                const names = sprite ? [sprite] : port.listSprites().map(s => s.name);
                const chunks = [];
                for (const name of names) {
                    const target = port.readTarget(name);
                    if (!target) return fail(`找不到精灵「${name}」。现有：${listSprites(port)}`);
                    const header = [`# ${name}`];
                    if (Object.keys(target.variables).length) {
                        header.push(`变量：${Object.keys(target.variables).join('、')}`);
                    }
                    if (Object.keys(target.lists).length) {
                        header.push(`列表：${Object.keys(target.lists).join('、')}`);
                    }
                    chunks.push(`${header.join('\n')}\n${target.text || '（这个精灵还没有积木）'}`);
                }
                return ok(chunks.join('\n\n---\n\n'));
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
                if (!target) return fail(`找不到精灵「${sprite}」。现有：${listSprites(port)}`);
                const result = await port.writeScript(sprite, text);
                const lines = [`已在「${sprite}」写入 ${result.blockIds.length} 段脚本。`];
                if (result.createdVariables.length) lines.push(`新建变量：${result.createdVariables.join('、')}`);
                if (result.createdLists.length) lines.push(`新建列表：${result.createdLists.join('、')}`);
                if (result.missingExtensions && result.missingExtensions.length) {
                    return fail(
                        `没有写入：这段积木用到了当前项目**没有加载**的扩展（${result.missingExtensions.join('、')}）。` +
                        `我不能替用户加扩展，那会改掉他的项目。请告诉用户这么操作：先点面板顶部最左边那个` +
                        `「收起面板」按钮把 AI 面板收起来，露出左下角的「添加扩展」，选中对应扩展，` +
                        `再点「AI 对话」把面板放回来，然后让你重来一次。也可以换一种不用扩展的写法。`
                    );
                }
                if (result.warnings.length) lines.push(`警告：\n- ${result.warnings.join('\n- ')}`);
                if (!result.blockIds.length) return fail(lines.join('\n'));
                return {
                    content: lines.join('\n'),
                    // 交给 UI 做一键撤销
                    undo: result.topBlockIds
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
                const removed = await port.deleteScript(sprite, topBlockId);
                return removed ? ok(`已删除「${sprite}」里的脚本 ${topBlockId}。`) : fail(`没有找到脚本 ${topBlockId}。`);
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
                if (outcome === 'timeout') return ok('项目仍在运行（已到等待上限）。');
                if (outcome === 'stopped') return ok('项目已停止。');
                return ok('项目跑完了。');
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
                        `${sprite.name}：x=${sprite.x} y=${sprite.y} 方向=${sprite.direction} 大小=${sprite.size}% ` +
                        `显示=${sprite.visible ? '是' : '否'} 造型=${sprite.costume}`
                    );
                }
                const vars = Object.entries(state.variables);
                if (vars.length) lines.push(`变量：${vars.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('，')}`);
                const lists = Object.entries(state.lists);
                if (lists.length) lines.push(`列表：${lists.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('，')}`);
                return ok(lines.join('\n') || '（没有可读的状态）');
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
            inputSchema: {type: 'object', properties: {}},
            handler: async (input, ctx = {}) => {
                const dataUrl = await port.snapshotStage();
                if (!dataUrl) {
                    return fail('截屏失败：渲染器没有在超时前给出画面。项目可能还没渲染过哪怕一帧，先 xce_run_project 再试。');
                }
                const size = port.stageSize();
                const caption = `舞台截图（${size.width}x${size.height}，当前画面）。`;
                if (!ctx.supportsImage) {
                    // 非视觉模型：不塞图片，改成一句能转述给用户的话
                    return ok(
                        `${caption}但当前模型不支持图片输入，这张图没法给你看。\n` +
                        `请转告用户：要让 AI 看舞台画面，得在面板的「设置 → 模型」里换一个支持看图的模型` +
                        `（列表里标了「看图」的那些）。在那之前，你只能靠 xce_read_state 的数字判断。`
                    );
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
            name: 'xce_read_skill',
            description:
                'List the reference documents ("skills") that exist for this editor and the team and sites ' +
                'around it — one line each. Takes no arguments.\n' +
                'Call this FIRST, before answering anything about the editor itself, CaelLab, or those ' +
                'sites: the documents are deliberately kept out of the prompt, so this is the only way to ' +
                'know what is available. Do not answer such questions from memory. To actually read one, ' +
                'pass its name to xce_read_fast_docs.',
            readOnly: true,
            inputSchema: {type: 'object', properties: {}},
            handler: () => {
                if (!skills.length) return ok('当前没有可用的资料。');
                const lines = skills.map(skill => `- \`${skill.name}\` — ${skill.description}`);
                return ok(`可用的一级能力（用 xce_read_fast_docs 加名字读全文）：\n${lines.join('\n')}`);
            }
        },

        {
            name: 'xce_read_fast_docs',
            description:
                'Read one reference document in full, by name (get the names from xce_read_skill).\n' +
                'Returns the whole document text. One call per document; do not fetch documents you do ' +
                'not need, and never answer a question the documents cover without reading them first.',
            readOnly: true,
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Document name. ' +
                            `One of: ${skills.map(skill => skill.name).join(', ') || '(none loaded)'}`
                    }
                },
                required: ['name']
            },
            handler: ({name}) => {
                const wanted = String(name || '').trim();
                const skill = skills.find(entry => entry.name === wanted);
                if (!skill) {
                    return fail(
                        skills.length ?
                            `没有叫「${wanted}」的资料。先调 xce_read_skill 看有什么；` +
                            `可用的有：${skills.map(entry => entry.name).join('、')}` :
                            '当前没有可用的资料。'
                    );
                }
                return ok(skill.body);
            }
        },

        {
            name: 'xce_read_online',
            description:
                'Fetch one public web page by URL and return it as readable text (not HTML): page title ' +
                'first, then the body text, hidden content stripped.\n' +
                'Hard limits: 5 second timeout, at most 20KB of text, head summary capped at 2KB — if the ' +
                'body was truncated the result says so, and you must pass that on instead of treating the ' +
                'excerpt as the whole page.\n' +
                'You cannot click, type, log in, or run the page\'s scripts; pages behind a login or drawn ' +
                'entirely by JavaScript will come back empty or partial.\n' +
                'Most websites do not allow a browser page to read them (CORS), so many fetches fail — ' +
                'when one does, the error says so. Report that honestly ("this site does not allow the AI ' +
                'to read it") and move on; never reconstruct a page from memory.\n' +
                'Use it to back up claims about the outside world (docs, help pages, a site the user mentions). ' +
                'Never fabricate page content for a page you did not fetch.',
            readOnly: true,
            inputSchema: {
                type: 'object',
                properties: {
                    url: {type: 'string', description: 'Full http(s) URL of the page to read.'}
                },
                required: ['url']
            },
            handler: ({url}, ctx = {}) => fetchOnline(url, {signal: ctx.signal})
        }
    ];

    return tools;
};
