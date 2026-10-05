// 端到端自测：真 scratch-vm + 真 port + 真循环 + 本地脚本模型
// 用法：node src/playground/ai/harness.test.mjs
/* eslint-disable no-console */
import {createRequire} from 'node:module';
import {createScratchPort, collectSvgAssets, cacheSvgAssets, svgCanvasSize} from './port.js';
import {createTools, osFromUserAgent, engineFromUserAgent} from './tools.js';
import {createSession, toModelMessages} from './session.js';
import {runTurn, executeTool, createSkipToken, STEP_LIMITS, clampMaxSteps, maxStepsOf} from './loop.js';
import {createScriptedModel, demoSteps} from './model.js';
import {emptyProject} from './test-project.mjs';

const require = createRequire(import.meta.url);
const VM_PATH = 'scratch-vm';

// VM 的帧循环在「挂了 renderer」时会读 `document.hidden` 决定要不要绘制（runtime.js 的 `_step`），
// 而 Node 里没有 document —— 这个套件下面为了测截图会给 VM 挂一个 renderer 桩，
// 从那以后只要帧循环转起来就会 ReferenceError。`hidden: true` = 不绘制，
// 正好是我们要的（无头环境本来也没得画），顺带把 sequencer 留着照常跑。
globalThis.document = {hidden: true};

const vm = new (require(VM_PATH))();
const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

await vm.loadProject(JSON.stringify(emptyProject('Sprite1')));
vm.start(); // 没有帧循环的话 sequencer 不会跑，绿旗点不动

const port = createScratchPort({vm, getWorkspace: () => null});
const tools = createTools({port});
const events = [];

console.log('=== 起点 ===');
console.log('角色:', port.listSprites().map(s => s.name)
    .join('、'));
const before = port.readTarget('Sprite1');
check('初始项目没有积木', before.text === '', `text=${JSON.stringify(before.text)}`);

// === ls / 按角色切割 / 行分页 / 硬截断（真实工具 + 真实 executeTool）===
const listSpritesTool = tools.find(t => t.name === 'xce_list_sprites');
const readProjectTool = tools.find(t => t.name === 'xce_read_project');
const getTimeTool = tools.find(t => t.name === 'xce_get_time');
check('工具表里有 ls / 时间工具', !!listSpritesTool && !!getTimeTool);

const ls = await listSpritesTool.handler({}, {});
check('ls 列出角色且不给代码', ls.content.includes('Sprite1') && !ls.content.includes('@greenFlag'),
    String(ls.content).split('\n')[0]);

const wholeEmpty = await readProjectTool.handler({sprite: 'Sprite1'}, {});
check('按角色读代码（此时项目还是空的，表头也要对）',
    wholeEmpty.content.includes('# Sprite1 (lines 1-1, 1 line total)'), String(wholeEmpty.content).split('\n')[0]);

const noSprite = await readProjectTool.handler({}, {});
check('不带角色名只给清单不给代码',
    !noSprite.content.includes('@greenFlag') && noSprite.content.includes('sprite parameter'),
    String(noSprite.content).split('\n')
        .pop()
        .slice(0, 50));

const time = await getTimeTool.handler({}, {});
check('时间工具给 UTC + 时区 + 时差提醒',
    /Current UTC time: \d{4}-/.test(time.content) && /timezone/.test(time.content) &&
    /different timezones/.test(time.content),
    String(time.content).split('\n')[0]);

// === xce_time：按需等待，用户可以在界面上跳过 ===
const waitTool = tools.find(t => t.name === 'xce_time');
check('工具表里有等待工具，且标了可跳过', !!waitTool && waitTool.skippable === true);

const waited = await waitTool.handler({seconds: 0.2}, {});
check('正常等待报出等了多久', /Waited about/.test(waited.content) && !waited.isError, String(waited.content));

const skipToken = createSkipToken();
const pendingWait = waitTool.handler({seconds: 30}, {skip: skipToken});
skipToken.skip();
const skippedWait = await pendingWait;
check('点跳过立刻返回，并说清只等了多久（不等满 30 秒）',
    /user skipped this wait/.test(skippedWait.content) && /only [\d.]+s actually passed/.test(skippedWait.content),
    String(skippedWait.content).slice(0, 70));

// 上限：请求 9999 秒会被夹到 60；靠跳过立刻收工，测试不会真等一分钟
const clampToken = createSkipToken();
const pendingClamp = waitTool.handler({seconds: 9999}, {skip: clampToken});
clampToken.skip();
const clampedWait = await pendingClamp;
check('超过上限被夹到 60 秒（并在结果里说明）', clampedWait.content.includes('60'), String(clampedWait.content).slice(0, 90));

const badWait = await waitTool.handler({seconds: 0}, {});
check('seconds 不是正数就报错', badWait.isError === true, String(badWait.content).slice(0, 60));

// 中断（用户按停止）也要立刻收工，不能挂在那儿等满
const abortController = new AbortController();
const pendingAbort = waitTool.handler({seconds: 30}, {signal: abortController.signal});
abortController.abort();
const abortedWait = await pendingAbort;
check('用户按停止时等待立刻结束', /interrupted/.test(abortedWait.content), String(abortedWait.content).slice(0, 60));

const session = createSession();
session.messages.push({role: 'user', content: '帮我写一段数到 10 的脚本'});

const controller = new AbortController();
const model = createScriptedModel(demoSteps('Sprite1'));
const outcome = await runTurn({
    session,
    model,
    tools,
    signal: controller.signal,
    onEvent: e => events.push(e)
});

console.log('\n=== 循环结果 ===');
console.log(`步数=${outcome.steps} 中断=${outcome.aborted}`);
console.log(`事件: ${events.map(e => e.type).join(' -> ')}`);

console.log('\n=== 工具调用留档 ===');
for (const record of session.toolCalls) {
    const oneLine = String(record.result.content).split('\n')[0];
    console.log(`- ${record.call.name} (${record.duration}ms) ${record.result.isError ? '[错误] ' : ''}${oneLine}`);
}

// 校验积木真的进了 VM，而且能把文本读回来
const after = port.readTarget('Sprite1');
console.log('\n=== 注入后的积木文本 ===');
console.log(after.text);

check('积木已注入', after.blockIds.length > 0, `${after.blockIds.length} 个块`);
check('能读回文本', after.text.includes('@greenFlag') && after.text.includes('change'), JSON.stringify(after.text.slice(0, 40)));

// 现在有真代码了：验证按角色读 + 行分页
const whole = await readProjectTool.handler({sprite: 'Sprite1'}, {});
check('按角色读代码带行数表头',
    whole.content.includes('# Sprite1 (lines 1-') && whole.content.includes('lines total'),
    String(whole.content).split('\n')[0]);
const paged = await readProjectTool.handler({sprite: 'Sprite1', lineStart: 2, lineEnd: 3}, {});
check('行分页只返回指定行',
    paged.content.includes('lines 2-3') && paged.content.length < whole.content.length,
    String(paged.content).split('\n')[0]);
const badRange = await readProjectTool.handler({sprite: 'Sprite1', lineStart: 5, lineEnd: 2}, {});
check('行范围倒置报错', badRange.isError === true, String(badRange.content).slice(0, 50));
const stageVars = port.readTarget('Stage');
check('变量建在舞台上', 'x' in stageVars.variables && 'log' in stageVars.lists,
    `variables=${JSON.stringify(Object.keys(stageVars.variables))} lists=${JSON.stringify(Object.keys(stageVars.lists))}`);
check('没有工具报错', session.toolCalls.every(r => !r.result.isError));
check('讲了个结尾', outcome.text.includes('完成'));

// 真跑一遍：绿旗后 x 应该是 10，log 应该是 [10]
const state = port.readState();
console.log('\n=== 运行后状态 ===');
console.log(JSON.stringify(state, null, 1));
check('x = 10', state.variables.x === 10, `实际 ${JSON.stringify(state.variables.x)}`);
check('log = [10]', JSON.stringify(state.lists.log) === '[10]', `实际 ${JSON.stringify(state.lists.log)}`);

// === 变更摘要 + 整轮回退的底座（真 VM 上跑一遍：计数 → 抓快照 → 删 → 摆回来）===
// 界面上的「角色 +N 积木 / 回退本轮变更」全压在这几个返回值和 sb3 往返上，必须真跑。
const writeTool = tools.find(t => t.name === 'xce_write_script');
const deleteTool = tools.find(t => t.name === 'xce_delete_script');
const added = await writeTool.handler({sprite: 'Sprite1', text: 'when green flag clicked\nsay [hi]'}, {});
check('写入句柄带块数（帽子 + say = 2 块，字面量不算）',
    added.undo && added.undo.kind === 'add' && added.undo.added === 2 &&
    added.undo.sprite === 'Sprite1', JSON.stringify(added.undo));
const countBefore = port.readTarget('Sprite1').blockIds.length;
const topId = added.undo.topBlockIds[0];
const removed = await deleteTool.handler({sprite: 'Sprite1', topBlockId: topId}, {});
check('删除句柄带快照和块数',
    removed.undo && removed.undo.kind === 'del' && removed.undo.removed === 2 &&
    Object.keys(removed.undo.blocks).length === 2, JSON.stringify(removed.undo && removed.undo.removed));
check('脚本真的删掉了', port.readTarget('Sprite1').blockIds.length < countBefore,
    `${countBefore} -> ${port.readTarget('Sprite1').blockIds.length}`);
check('回退删除 = 把快照摆回来', port.undoAction(removed.undo) === true &&
    port.readTarget('Sprite1').text.includes('say'), JSON.stringify(port.readTarget('Sprite1').text));
const countRestored = port.readTarget('Sprite1').blockIds.length;
check('摆回来之后块数跟删之前一样', countRestored === countBefore, `${countBefore} vs ${countRestored}`);
check('回退写入 = 删掉刚加的顶块', port.undoAction(added.undo) === true &&
    port.readTarget('Sprite1').blockIds.length === countBefore - 2,
`${countBefore} -> ${port.readTarget('Sprite1').blockIds.length}`);

// === xce_edit_script：按 id 替换一段脚本（读出标注 → 替换 → 失败不动 → 撤销还原）===
const editTool = tools.find(t => t.name === 'xce_edit_script');
const first = await writeTool.handler({sprite: 'Sprite1', text: 'when green flag clicked\nsay [v1]'}, {});
const firstId = first.undo.topBlockIds[0];
const readBack = port.readTarget('Sprite1');
check('读出的文本带 :: script 标注（帽子 + say = 2 块）',
    readBack.text.includes(`:: script ${firstId} (2 blocks)`), readBack.text.split('\n')[0]);
const replaced = await editTool.handler({
    sprite: 'Sprite1',
    topBlockId: firstId,
    text: 'when green flag clicked\nsay [v2]\nmove (5) steps'
}, {});
check('替换成功，句柄带 added/removed',
    !replaced.isError && replaced.undo.kind === 'edit' &&
    replaced.undo.added === 3 && replaced.undo.removed === 2,
    JSON.stringify(replaced.undo && {added: replaced.undo.added, removed: replaced.undo.removed}));
const afterEdit = port.readTarget('Sprite1');
check('旧脚本没了、新的在', !afterEdit.blockIds.includes(firstId) && afterEdit.text.includes('[v2]'),
    JSON.stringify(afterEdit.text.slice(-60)));
const badId = replaced.undo.topBlockIds[0];
const badEdit = await editTool.handler({
    sprite: 'Sprite1',
    topBlockId: badId,
    text: 'when green flag clicked\ndance [forever]'
}, {});
check('新文本解析不过时整条拒绝、旧脚本原样保留',
    badEdit.isError === true && port.readTarget('Sprite1').text.includes('[v2]'),
    String(badEdit.content).slice(0, 80));
check('撤销替换 = 旧脚本摆回来、新脚本删掉', port.undoAction(replaced.undo) === true &&
    port.readTarget('Sprite1').text.includes('[v1]') && !port.readTarget('Sprite1').text.includes('[v2]'),
JSON.stringify(port.readTarget('Sprite1').text.slice(-60)));
const badIdGone = await editTool.handler({sprite: 'Sprite1', topBlockId: 'nope123', text: 'when green flag clicked\nsay [x]'}, {});
check('id 不存在时干净报错', badIdGone.isError === true, String(badIdGone.content).slice(0, 60));

// === 克隆体不能污染角色列表（用假 VM 精确验，真 VM 造克隆体在无头环境不稳）===
// 用户实际踩到：跑一次星空之后，角色清单里冒出上百个同名「角色1」（全是克隆体）。
const fakeTarget = (name, opts = {}) => {
    const {isStage = false, isClone = false, variables = [], lists = [], scriptCount = 0} = opts;
    const vars = {};
    for (const v of variables) vars[v] = {name: v, id: v};
    for (const l of lists) vars[l] = {name: l, id: l, type: 'list'};
    return {
        name,
        getName: () => name,
        isStage,
        isClone,
        variables: vars,
        blocks: {
            _blocks: {},
            getScripts: () => new Array(scriptCount).fill({})
        },
        getCostumes: () => [{name: 'costume1'}],
        currentCostume: 0,
        x: 0,
        y: 0,
        direction: 90,
        size: 100,
        visible: true,
        lookupVariableById: () => null
    };
};
const fakeStage = fakeTarget('Stage', {isStage: true, variables: ['score']});
const fakeSprite = fakeTarget('角色1', {variables: ['hp'], scriptCount: 2});
const fakeClones = [1, 2, 3].map(() => fakeTarget('角色1', {isClone: true, scriptCount: 2}));
const fakeVm = {
    runtime: {
        targets: [fakeStage, fakeSprite, ...fakeClones],
        getTargetForStage: () => fakeStage,
        editingTarget: fakeSprite
    }
};
const fakePort = createScratchPort({vm: fakeVm, getWorkspace: () => null});
check('克隆体不进 ls 清单（3 个克隆体只列 2 个真角色）',
    fakePort.listSpritesDetailed().length === 2,
    fakePort.listSpritesDetailed().map(t => t.name)
        .join('、'));
check('克隆体不进 readState',
    fakePort.readState().sprites.length === 1, `${fakePort.readState().sprites.length} 个角色`);
check('报错清单用的是真名（不带「（舞台）」装饰）',
    fakePort.listSprites().map(s => s.name)
        .join('、') === 'Stage、角色1',
    fakePort.listSprites().map(s => s.name)
        .join('、'));
check('名字匹配容忍「Stage（舞台）」/「Stage (the stage)」这种抄法',
    fakePort.readTarget('Stage（舞台）') !== null && fakePort.readTarget(' Stage ') !== null &&
  fakePort.readTarget('Stage (the stage)') !== null);

// === 连续写入必须各留一段（回归：块 id 每次从 c0 重编，后写的整段覆盖先写的）===
// 用户实际踩到过：连写两段，工具都回「写入成功」，但读回来只剩一段。
const cloneTool = tools.find(t => t.name === 'xce_write_script');
const spriteTarget = () => vm.runtime.targets.find(t => !t.isStage);
const scriptsBefore = spriteTarget().blocks.getScripts().length;
await cloneTool.handler({sprite: 'Sprite1', text: 'when green flag clicked\nmove (1) steps'}, {});
await cloneTool.handler({sprite: 'Sprite1', text: 'when green flag clicked\nmove (2) steps'}, {});
const scriptsAfter = spriteTarget().blocks.getScripts().length;
check('连续两次写入各留一段脚本（块 id 不撞车）',
    scriptsAfter === scriptsBefore + 2, `前 ${scriptsBefore} 段，后 ${scriptsAfter} 段`);
check('两段都在（读回文本里两段都在）',
    (port.readTarget('Sprite1').text.match(/@greenFlag/g) || []).length >= 2,
    `${port.readTarget('Sprite1').text.split('\n').filter(l => l.includes('@greenFlag')).length} 段 hat`);

// === 影子积木不算扩展；按键帽子块必须是核心块 ===
// 回归：`when [space v] key pressed` 曾被翻成 makeymakey 的块，于是「没加载扩展」被拒；
// `change [ghost v] effect by (-4)` 的 math_number 影子曾让错误里写着「缺少扩展 math」。
const ghostScript = 'when [space v] key pressed\nchange [ghost v] effect by (-4)';
const ghostWrite = await cloneTool.handler({sprite: 'Sprite1', text: ghostScript}, {});
check('按键帽子块 + 数字影子积木能正常写入（不被误报缺扩展）',
    !ghostWrite.isError && !/Nothing was written/.test(ghostWrite.content), String(ghostWrite.content).slice(0, 90));
const writtenOpcodes = Object.values(vm.runtime.targets.find(t => !t.isStage).blocks._blocks)
    .map(b => b.opcode);
check('写进去的是核心按键块与核心效果块',
    writtenOpcodes.includes('event_whenkeypressed') && writtenOpcodes.includes('looks_changeeffectby') &&
  !writtenOpcodes.some(o => /makeymakey|^unknown_/.test(o)),
    writtenOpcodes.join(', '));
const effectBlock = Object.values(vm.runtime.targets.find(t => !t.isStage).blocks._blocks)
    .find(b => b.opcode === 'looks_changeeffectby');
check('效果字段是字段（不是挂了个 math_number 的坏块）',
    !!effectBlock && !!effectBlock.fields.EFFECT && !effectBlock.inputs.EFFECT,
    JSON.stringify(effectBlock && {fields: Object.keys(effectBlock.fields), inputs: Object.keys(effectBlock.inputs)}));
check('读回来的效果块是下拉形状（不是 (GHOST)）',
    /\[ghost v\]/i.test(port.readTarget('Sprite1').text) && !port.readTarget('Sprite1').text.includes('(GHOST)'),
    port.readTarget('Sprite1').text.split('\n').slice(0, 2)
        .join(' / '));

// === xce_read_stage：视觉模型给图，非视觉模型给一句能转述的话 ===
// 无头环境没有 renderer，用一个桩顶上（真实浏览器里走 renderer.requestSnapshot）
const readStage = tools.find(t => t.name === 'xce_read_stage');
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const missing = await readStage.handler({}, {supportsImage: true});
check('没有渲染器时 xce_read_stage 明确报失败', missing.isError === true, String(missing.content).slice(0, 60));

vm.runtime.renderer = {requestSnapshot: callback => callback(PNG_1PX)};
const withVision = await readStage.handler({}, {supportsImage: true});
check('视觉模型拿到图片',
    Array.isArray(withVision.images) && withVision.images.length === 1 &&
  withVision.images[0].url.startsWith('data:image/png'),
    JSON.stringify(withVision.images && withVision.images[0].mimeType));
check('图片结果带一句说明（用户在工具卡上看到的字）',
    /Stage screenshot/.test(String(withVision.content)), String(withVision.content));

const withoutVision = await readStage.handler({}, {supportsImage: false});
check('非视觉模型不塞图片',
    withoutVision.images === void 0 && !withoutVision.isError,
    JSON.stringify(withoutVision.images));
check('非视觉模型得到的是能让 AI 转述给用户的话',
    /does not read images/.test(withoutVision.content) && /vision-capable model/.test(withoutVision.content),
    String(withoutVision.content).slice(0, 80));

// === 硬截断走真实 executeTool（loop.js）：超过 20KB 必须被切并在底部注明 ===
const hugeTool = {
    name: 'fake_huge',
    description: 'x',
    inputSchema: {type: 'object'},
    handler: () => '长'.repeat(30 * 1024)
};
const truncated = await executeTool({name: 'fake_huge', input: {}}, [hugeTool], {});
check('超过 20KB 的工具结果被硬截断',
    truncated.content.length < 30 * 1024 && truncated.content.includes('[Truncated: too long'),
    `len=${truncated.content.length}`);
const truncatedPaged = await executeTool(
    {name: 'fake_huge_paged', input: {}},
    [{...hugeTool, name: 'fake_huge_paged', paged: true}],
    {}
);
check('分页工具的截断提示带 lineStart/lineEnd 指引',
    truncatedPaged.content.includes('lineStart / lineEnd'), '');
const small = await executeTool(
    {name: 'fake_small', input: {}},
    [{...hugeTool, name: 'fake_small', handler: () => '短结果'}],
    {}
);
check('没超限的结果原样通过', small.content === '短结果', small.content);

// === 「跑着跑着突然停了」的几种原因，runTurn 都要带 reason 出来 ===
const alwaysTool = {
    complete: async () => ({text: '', toolCalls: [{id: 'x', name: 'xce_list_sprites', input: {}}], finishReason: 'tool_calls'})
};
const stepped = await runTurn({session: createSession(), model: alwaysTool, tools, maxSteps: 2});
check('到步数上限带 reason=steps', stepped.reason === 'steps',
    `reason=${stepped.reason} steps=${stepped.steps}`);
const capped = {complete: async () => ({text: '', toolCalls: [], finishReason: 'length'})};
const len = await runTurn({session: createSession(), model: capped, tools});
check('输出被 max_tokens 掐断带 reason=length', len.reason === 'length', `reason=${len.reason}`);
const silent = {complete: async () => ({text: '', toolCalls: [], finishReason: null})};
const emptyReply = await runTurn({session: createSession(), model: silent, tools});
check('空响应带 reason=empty', emptyReply.reason === 'empty', `reason=${emptyReply.reason}`);

// 缺参数的错误要给模型自我纠正的信息（第一次调用常见参数名编错，比如 text 写成 script）
const badParams = await executeTool(
    {name: 'xce_write_script', input: {script: 'when green flag clicked'}},
    tools,
    {}
);
check('缺参数时报出正确的参数名单',
    badParams.isError === true && badParams.content.includes('sprite, text') &&
  badParams.content.includes('parameters of xce_write_script are: sprite, text'),
    String(badParams.content).slice(0, 120));

// === 「跳过等待」的整条链路：loop 在 tool-start 上发令牌 → 界面调用它 → 工具立刻返回 ===
const waitSession = createSession();
let sawSkip = null;
await runTurn({
    session: waitSession,
    model: {
        complete: async () => ({
            text: '',
            finishReason: 'tool_calls',
            toolCalls: [{id: 'wait1', name: 'xce_time', input: {seconds: 5}}]
        })
    },
    tools,
    maxSteps: 1,
    onEvent: e => {
        if (e.type === 'tool-start' && e.skip) {
            sawSkip = e.skip;
            e.skip.skip();
        }
    }
});
check('等待工具在 tool-start 上带出跳过令牌（界面据此画按钮）', !!sawSkip);
check('循环里跳过立刻收工，结果如实说被跳过',
    waitSession.toolCalls.length === 1 && /user skipped this wait/.test(waitSession.toolCalls[0].result.content),
    String((waitSession.toolCalls[0] || {}).result && waitSession.toolCalls[0].result.content).slice(0, 60));

let plainSkip = 'unset';
await runTurn({
    session: createSession(),
    model: {
        complete: async () => ({
            text: '',
            finishReason: 'tool_calls',
            toolCalls: [{id: 'ls1', name: 'xce_list_sprites', input: {}}]
        })
    },
    tools,
    maxSteps: 1,
    onEvent: e => {
        if (e.type === 'tool-start') plainSkip = e.skip;
    }
});
check('普通工具不带跳过令牌（没有东西可跳过）', plainSkip === null, String(plainSkip));

// === 单轮往返预算：默认 30（设置里可调 5~120），只在剩 3 次时才提醒模型 ===
// 提醒挂在**消息尾巴**上（单独一条 system），不能动系统提示词 —— 前缀一变，整个会话的
// prompt 缓存就废了，每一轮都按全价重发。
check('上限可调且被夹在 5~120',
    clampMaxSteps(3) === 5 && clampMaxSteps(9999) === 120 && clampMaxSteps('45') === 45 &&
  clampMaxSteps('x') === STEP_LIMITS.default && maxStepsOf({}) === 30 && maxStepsOf({maxSteps: 60}) === 60,
    `${clampMaxSteps(3)}/${clampMaxSteps(9999)}/${maxStepsOf({maxSteps: 60})}`);

const budgetSeen = [];
const budgetSession = createSession();
budgetSession.messages.push({role: 'user', content: '在吗'});
await runTurn({
    session: budgetSession,
    model: {
        complete: async messages => {
            budgetSeen.push(messages);
            return {text: '在', toolCalls: []};
        }
    },
    tools
});
check('轮次还宽裕时一个字都不多念',
    budgetSeen[0].every(m => !/turn-budget/.test(String(m.content))),
    `消息 ${budgetSeen[0].length} 条，尾巴=${budgetSeen[0][budgetSeen[0].length - 1].role}`);

// 快用完了才提醒：maxSteps=4 时，第 1 轮还剩 4 次不说，第 2 轮剩 3 次开始说
const lateSeen = [];
const lateSession = createSession();
lateSession.messages.push({role: 'user', content: '列一下角色'});
await runTurn({
    session: lateSession,
    model: {
        complete: async messages => {
            lateSeen.push(messages);
            return {text: '', finishReason: 'tool_calls', toolCalls: [{id: 'x', name: 'xce_list_sprites', input: {}}]};
        }
    },
    tools,
    maxSteps: 4
});
const noteAt = index => {
    const seen = lateSeen[index] || [];
    const tail = seen[seen.length - 1];
    return tail && tail.role === 'system' && /turn-budget/.test(String(tail.content)) ? String(tail.content) : null;
};
check('剩 4 次时不提醒', noteAt(0) === null, `${String(lateSeen[0].length)} 条消息`);
check('剩 3 次开始提醒，并写清还剩几次', /including this one: 3/.test(noteAt(1) || ''), String(noteAt(1)));
check('只剩 1 次时把话说死（到零就收工）',
    /This is the last round-trip/.test(noteAt(3) || ''), String(noteAt(3)).split('\n')[1]);
check('提醒挂在消息尾巴、且是最后一条；不进会话历史',
    /turn-budget/.test(noteAt(1) || '') && lateSeen[1][lateSeen[1].length - 1].role === 'system' &&
  lateSeen[1][0].role !== 'system');
check('提醒里带上这一轮给的总次数', /allows 4 round-trips/.test(noteAt(1) || ''));

// === 模型在流里打转：当场打断，reason=repeat，打转的那段不进历史 ===
const rambleSession = createSession();
rambleSession.messages.push({role: 'user', content: '帮我看看'});
const rambleEvents = [];
let rambleRounds = 0;
const rambleModel = {
    complete: async (messages, schemas, {onChunk = () => {}} = {}) => {
        let text = '';
        let stopped = false;
        // 先一句正常的话，然后开始复读同一句（模拟思考打转）
        text += '先看一下你的项目。';
        onChunk({kind: 'text_delta', delta: '先看一下你的项目。'});
        for (let i = 0; i < 200 && !stopped; i++) {
            rambleRounds++;
            const piece = '我再确认一下这一点。';
            text += piece;
            const verdict = onChunk({kind: 'text_delta', delta: piece});
            if (verdict && verdict.stop) stopped = true;
        }
        return {text, toolCalls: [], stopped, finishReason: null};
    }
};
const rambled = await runTurn({
    session: rambleSession,
    model: rambleModel,
    tools,
    onEvent: e => rambleEvents.push(e)
});
check('流里打转 → reason=repeat', rambled.reason === 'repeat', `reason=${rambled.reason} steps=${rambled.steps}`);
check('很早就打断了（复读远没吐完）', rambleRounds < 150, `复读了 ${rambleRounds} 遍（上限 200）`);
check('打断时给界面发了 repeat 事件',
    rambleEvents.filter(e => e.type === 'repeat').length === 1 &&
  rambleEvents.find(e => e.type === 'repeat').kind === 'text',
    JSON.stringify(rambleEvents.filter(e => e.type === 'repeat')));
const rambleAnswer = rambleSession.messages.find(m => m.role === 'assistant');
check('只有干净的前缀进历史（打转的那句一个字都没留）',
    !!rambleAnswer && rambleAnswer.content === '先看一下你的项目。',
    JSON.stringify(rambleAnswer && rambleAnswer.content));

// 思考里打转同样要打断，而且不该留一条空消息在历史里
const thinkSession = createSession();
thinkSession.messages.push({role: 'user', content: '想想'});
const thoughtLoop = await runTurn({
    session: thinkSession,
    model: {
        complete: async (messages, schemas, {onChunk = () => {}} = {}) => {
            let reasoning = '';
            let stopped = false;
            for (let i = 0; i < 200 && !stopped; i++) {
                reasoning += '等等，我再想想。';
                const verdict = onChunk({kind: 'reasoning_delta', delta: '等等，我再想想。'});
                if (verdict && verdict.stop) stopped = true;
            }
            return {text: '', reasoning, toolCalls: [], stopped};
        }
    },
    tools
});
check('思考里打转一样打断', thoughtLoop.reason === 'repeat', `reason=${thoughtLoop.reason}`);
check('打转得只剩空的回复不留进历史',
    thinkSession.messages.length === 1 && thinkSession.messages[0].role === 'user',
    thinkSession.messages.map(m => m.role).join('、'));

// === AI 画角色：新建角色 + SVG 造型 + 撤销 + 非视觉模型下的视觉工具 ===
// 无头环境没有 scratch-render，用一个万能桩顶上；画质本身是浏览器里的事，
// 这里验的是「角色建出来了、造型挂对了、undo 收得回去、快照带得走那份矢量图」。
vm.attachStorage(new (require('@turbowarp/scratch-storage'))());
vm.runtime.renderer = new Proxy({}, {
    get: (t, key) => {
        if (key === 'getSkinSize' || key === 'getCurrentSkinSize') return () => [120, 80];
        if (key === 'getSkinRotationCenter') return () => [60, 40];
        if (key === 'getBounds') return () => ({left: 0, right: 0, top: 0, bottom: 0});
        if (key === 'getFencedPositionOfDrawable') return (id, pos) => pos;
        if (key === 'createDrawable' || key === 'createSVGSkin' || key === 'createBitmapSkin') return () => 1;
        return () => undefined;
    }
});

const BALL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">' +
  '<circle cx="60" cy="40" r="30" fill="#2b6fec"/></svg>';

const addSpriteTool = tools.find(t => t.name === 'xce_add_sprite');
const editCostumeTool = tools.find(t => t.name === 'xce_edit_costume');
const deleteCostumeTool = tools.find(t => t.name === 'xce_delete_costume');
const fromUrlTool = tools.find(t => t.name === 'xce_add_costume_from_url');
const readCostumeTool = tools.find(t => t.name === 'xce_read_costume');
check('工具表里有新增角色 / 编辑造型 / 删除造型 / 从网页加造型 / 查看造型',
    !!addSpriteTool && !!editCostumeTool && !!deleteCostumeTool && !!fromUrlTool && !!readCostumeTool);

const beforeSprites = vm.runtime.targets.filter(t => !t.isStage).length;
const created = await addSpriteTool.handler({name: 'Ball', x: 10, y: -20}, {});
const ball = vm.runtime.targets.find(t => t.getName && t.getName() === 'Ball');
check('xce_add_sprite 建出角色并选中它',
    !created.isError && !!ball && vm.editingTarget && vm.editingTarget.getName() === 'Ball',
    String(created.content).split('\n')[0]);
check('角色数 +1', vm.runtime.targets.filter(t => !t.isStage).length === beforeSprites + 1);
check('新角色带一个空白造型（0x0），并指路 edit_costume',
    !!ball && ball.getCostumes().length === 1 &&
  /blank costume/.test(created.content) && /xce_edit_costume/.test(created.content),
    ball && ball.getCostumes().map(c => `${c.name}/${c.dataFormat}`)
        .join(', '));
check('位置参数生效', !!ball && ball.x === 10 && ball.y === -20, ball && `${ball.x},${ball.y}`);
check('undo 句柄是「新建角色」',
    created.undo && created.undo.kind === 'sprite' && created.undo.sprite === 'Ball',
    JSON.stringify(created.undo));

const dup = await addSpriteTool.handler({name: 'Ball'}, {});
check('重名被拒并给出改法',
    dup.isError === true && /already exists/.test(dup.content), String(dup.content).slice(0, 70));

// action: 'edit' 把那张空白造型就地画掉（用户要的标准流程：先建角色、再调编辑造型）
const blankIndex = ball.getCostumes().length - 1;
const drawnBlank = await editCostumeTool.handler(
    {sprite: 'Ball', action: 'edit', svg: BALL_SVG}, {});
check('edit + 空白造型：就地替换内容，造型数不变',
    !drawnBlank.isError && ball.getCostumes().length === 1 &&
  ball.getCostumes()[0].dataFormat === 'svg' && ball.getCostumes()[0].asset.decodeText().includes('circle'),
    String(drawnBlank.content).slice(0, 90));
check('旋转中心取画布中心（120x80 -> 60,40）',
    !!ball && ball.getCostumes()[0].rotationCenterX === 60 && ball.getCostumes()[0].rotationCenterY === 40,
    ball && `${ball.getCostumes()[0].rotationCenterX},${ball.getCostumes()[0].rotationCenterY}`);
check('edit 的 undo 句柄带旧 SVG 全文',
    drawnBlank.undo && drawnBlank.undo.kind === 'costumeContent' && !!drawnBlank.undo.oldSvg,
    JSON.stringify(drawnBlank.undo && drawnBlank.undo.kind));
check('原先的空白造型名沿用（造型N 不跳号）',
    ball.getCostumes()[blankIndex].name.startsWith('造型'),
    ball.getCostumes()[blankIndex].name);

// SVG 缺 width/height：明确报错并点出那条规则，且不改动项目
const noSize = await editCostumeTool.handler({
    sprite: 'Ball',
    action: 'new',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
}, {});
check('SVG 缺 width/height 被拒并点明规则',
    noSize.isError === true && /width and height/.test(noSize.content) &&
  ball.getCostumes().length === 1,
    String(noSize.content).slice(0, 90));

// action: 'new'（create 同义）追加一个造型并切成当前
const addedCostume = await editCostumeTool.handler(
    {sprite: 'Ball', action: 'new', svg: BALL_SVG, name: 'big'}, {});
check('action "new" 追加造型并切成当前造型',
    !addedCostume.isError && /"big"/.test(addedCostume.content) &&
  ball.getCostumes().length === 2 && ball.getCostumes()[ball.currentCostume].name === 'big',
    String(addedCostume.content));
check('加造型的 undo 句柄带下标',
    addedCostume.undo && addedCostume.undo.kind === 'costume' && addedCostume.undo.index === 1,
    JSON.stringify(addedCostume.undo));
const createdAlias = await editCostumeTool.handler(
    {sprite: 'Ball', action: 'create', svg: BALL_SVG, name: 'alias'}, {});
check('action "create" 等同于 "new"',
    !createdAlias.isError && ball.getCostumes().length === 3 &&
  ball.getCostumes()[2].name === 'alias');
port.undoAction(createdAlias.undo);
check('撤销 create 换回两枚造型', ball.getCostumes().length === 2);

const badAction = await editCostumeTool.handler({sprite: 'Ball', action: 'delete', svg: BALL_SVG}, {});
check('未知 action 被拒并列出两种',
    badAction.isError === true && /"new"/.test(badAction.content) && /"edit"/.test(badAction.content));

// edit 的撤销：换回旧内容
const editAgain = await editCostumeTool.handler(
    {sprite: 'Ball', action: 'edit', costume: 'big', svg: BALL_SVG.replace('circle', 'rect')}, {});
check('edit 已有矢量造型成功', !editAgain.isError && /"big"/.test(editAgain.content),
    String(editAgain.content).slice(0, 80));
port.undoAction(editAgain.undo);
check('撤销 edit 把旧内容摆回去（又有 circle 了）',
    ball.getCostumes()[1].asset.decodeText().includes('circle'));

// 删除造型：留一枚就不许再删；删掉的那枚能撤销回来
const onlyGuard = ball.getCostumes().length;
const deleted = await deleteCostumeTool.handler({sprite: 'Ball', costume: 'big'}, {});
check('删除指定造型', !deleted.isError && ball.getCostumes().length === onlyGuard - 1,
    String(deleted.content).slice(0, 80));
check('删除的 undo 是 costumeRestore 且带造型对象',
    deleted.undo && deleted.undo.kind === 'costumeRestore' && !!deleted.undo.costume);
await port.undoAction(deleted.undo);
check('撤销删除把造型摆回原下标（含名字）',
    ball.getCostumes().length === onlyGuard && ball.getCostumes()[1].name === 'big');

// （「最后一枚造型删不得」放在读造型那一段之后 —— 它会把 big 永久删掉，先让读取类测试跑完）

// 从 URL 加造型：无头环境没有 canvas，位图落在 no-canvas 分支；SVG 走矢量通道。
// 网络部分用假 fetch 顶掉（真下载不在单测里做）。
const realFetch = globalThis.fetch;
globalThis.fetch = async url => {
    if (String(url).includes('bad')) return {ok: false, status: 404};
    if (String(url).includes('page')) {
        return {
            ok: true,
            status: 200,
            headers: {get: () => 'text/html; charset=utf-8'},
            arrayBuffer: async () => new TextEncoder().encode('<html><body>hi</body></html>').buffer
        };
    }
    if (String(url).includes('vector')) {
        const svg = BALL_SVG;
        return {
            ok: true,
            status: 200,
            headers: {get: () => 'image/svg+xml'},
            arrayBuffer: async () => new TextEncoder().encode(svg).buffer
        };
    }
    // 一个最小的 PNG（1x1 透明），魔数齐所以会被认成 png
    const png = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137]);
    return {ok: true, status: 200, headers: {get: () => 'image/png'}, arrayBuffer: async () => png.buffer};
};
const urlVector = await fromUrlTool.handler({sprite: 'Ball', url: 'https://x.test/vector.svg', name: 'web'}, {});
check('从 URL 加 SVG 走矢量通道',
    !urlVector.isError && ball.getCostumes().some(c => c.name === 'web'),
    String(urlVector.content).slice(0, 90));
port.undoAction(urlVector.undo);
const urlBitmap = await fromUrlTool.handler({sprite: 'Ball', url: 'https://x.test/pic.png'}, {});
check('无 canvas 环境里位图明确报 no-canvas（不静默）',
    urlBitmap.isError === true && /canvas/.test(urlBitmap.content),
    String(urlBitmap.content).slice(0, 90));
const urlPage = await fromUrlTool.handler({sprite: 'Ball', url: 'https://x.test/page'}, {});
check('URL 是网页不是图片时说明白',
    urlPage.isError === true && /usable image/.test(urlPage.content),
    String(urlPage.content).slice(0, 90));
const urlFail = await fromUrlTool.handler({sprite: 'Ball', url: 'https://x.test/bad.png'}, {});
check('下载失败原样报 HTTP', urlFail.isError === true && /HTTP 404/.test(urlFail.content));
globalThis.fetch = realFetch;

// 位图造型不能 edit（没有源码）；用假 port 直接验分支
const editWith = readCostumeSvg => createTools({port: {...port, readCostumeSvg}})
    .find(t => t.name === 'xce_edit_costume');
const bitmapEdit = await editWith(async () => ({bitmap: true, name: 'photo', index: 0, size: [40, 40]}))
    .handler({sprite: 'Ball', action: 'edit', svg: BALL_SVG}, {});
check('位图造型 edit 被拒并指路 action new',
    bitmapEdit.isError === true && /bitmap image/.test(bitmapEdit.content) &&
  /action "new"/.test(bitmapEdit.content),
    String(bitmapEdit.content).slice(0, 90));
const missingEdit = await editWith(async () => null)
    .handler({sprite: 'Ball', action: 'edit', svg: BALL_SVG}, {});
check('edit 指了不存在的造型时报清楚', missingEdit.isError === true && /No such costume/.test(missingEdit.content));

// 矢量造型：默认直接给 SVG 源码（不栅格化）。用户 2026-10-04 要的 —— 是矢量图就给源码，
// 太长才退回图片；顺带让非视觉模型也能读到造型。
const asSource = await readCostumeTool.handler({sprite: 'Ball'}, {supportsImage: true});
check('矢量造型默认返回 SVG 源码，不是图片',
    !asSource.isError && asSource.images === void 0 && /circle/.test(asSource.content) &&
  /vector drawing/.test(asSource.content) && /120x80/.test(asSource.content),
    String(asSource.content).slice(0, 90));

const blindSource = await readCostumeTool.handler({sprite: 'Ball'}, {supportsImage: false});
check('非视觉模型照样拿得到矢量造型的源码（不再被图片门槛挡住）',
    !blindSource.isError && blindSource.images === void 0 && /circle/.test(blindSource.content),
    String(blindSource.content).slice(0, 70));

const byName = await readCostumeTool.handler({sprite: 'Ball', costume: 'big'}, {});
check('按名字取造型的源码', !byName.isError && /"big"/.test(byName.content) && /circle/.test(byName.content),
    String(byName.content).slice(0, 70));

// 造型渲染在无头环境里做不出来（没有 Image / canvas）：显式要图片时必须明确失败，不能悄悄给张空图
const noCanvas = await readCostumeTool.handler({sprite: 'Ball', format: 'image'}, {supportsImage: true});
check('无画布环境里 xce_read_costume 明确报失败',
    noCanvas.isError === true && /could be captured/.test(noCanvas.content),
    String(noCanvas.content).slice(0, 80));

const blindCostume = await readCostumeTool.handler({sprite: 'Ball', format: 'image'}, {supportsImage: false});
check('非视觉模型不塞图，给一句能转述的话',
    blindCostume.images === void 0 && !blindCostume.isError &&
  /does not read images/.test(blindCostume.content) && /vision-capable model/.test(blindCostume.content),
    String(blindCostume.content).slice(0, 90));

// 位图造型本来就没有源码；超过长度上限的矢量造型也要退回图片。两条都用假 port 直接验分支。
const costumeToolWith = readCostumeSvg => createTools({
    port: {...port,
        listCostumes: () => [{name: 'photo', index: 0, format: 'png', size: [40, 40], current: true}],
        readCostumeSvg}
}).find(t => t.name === 'xce_read_costume');

const bitmapTool = costumeToolWith(async () => ({bitmap: true, name: 'photo', index: 0, size: [40, 40]}));
const wantSvg = await bitmapTool.handler({sprite: 'Shot', format: 'svg'}, {supportsImage: false});
check('位图造型要 SVG 时明确说没有源码，并指路 image',
    wantSvg.isError === true && /bitmap image/.test(wantSvg.content) && /format "image"/.test(wantSvg.content),
    String(wantSvg.content).slice(0, 80));

const HUGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
  `${'<rect width="1" height="1"/>'.repeat(800)}</svg>`;
const oversizeTool = costumeToolWith(async () => ({
    bitmap: false, name: 'huge', index: 0, size: [10, 10], width: 10, height: 10, svg: HUGE_SVG
}));
check('超长矢量造型：auto 不再发源码（退回图片那条路）',
    /could be captured/.test(String((await oversizeTool.handler({sprite: 'Shot'}, {supportsImage: true})).content)),
    `源码 ${HUGE_SVG.length} 字符`);
const hugeWanted = await oversizeTool.handler({sprite: 'Shot', format: 'svg'}, {supportsImage: false});
check('超长矢量造型：显式要 svg 时说清超限并指路 image',
    !hugeWanted.isError && /over the/.test(hugeWanted.content) && /format "image"/.test(hugeWanted.content),
    String(hugeWanted.content).slice(0, 90));

// 最后一枚造型删不得（放这里：它会把 big 永久删掉）
const lastOne = await deleteCostumeTool.handler({sprite: 'Ball', costume: 'big'}, {});
await deleteCostumeTool.handler({sprite: 'Ball', costume: 0}, {});
const cannotLast = await deleteCostumeTool.handler({sprite: 'Ball'}, {});
check('最后一枚造型删不得，且告诉模型先去加一枚',
    lastOne.isError !== true && cannotLast.isError === true && /only one/.test(cannotLast.content),
    String(cannotLast.content).slice(0, 100));

// 快照要带的 SVG 资产：收集 + 塞回（刷新恢复靠它，见 project-persistence.jsx）。
// 得赶在撤销之前做 —— 撤销会把 Ball 整个删掉，那时项目里就没有 AI 画的造型了。
const collected = collectSvgAssets(vm);
const collectedIds = Object.keys(collected);
check('快照收集到项目里的 SVG 造型（内置的不收）',
    collectedIds.length >= 1 && Object.values(collected).some(text => text.includes('circle')),
    `收了 ${collectedIds.length} 份：${collectedIds.join(', ')}`);

const freshVm = new (require(VM_PATH))();
freshVm.attachStorage(new (require('@turbowarp/scratch-storage'))());
freshVm.runtime.renderer = vm.runtime.renderer;
await freshVm.loadProject(vm.toJSON());
const lostInFresh = freshVm.runtime.targets.find(t => t.getName && t.getName() === 'Ball');
check('不塞回资产的话，读档后造型是 broken 的（这正是要防的）',
    !!lostInFresh && !!lostInFresh.getCostumes()[0].broken,
    lostInFresh && `broken=${!!lostInFresh.getCostumes()[0].broken}`);

const withAssetsVm = new (require(VM_PATH))();
withAssetsVm.attachStorage(new (require('@turbowarp/scratch-storage'))());
withAssetsVm.runtime.renderer = vm.runtime.renderer;
cacheSvgAssets(withAssetsVm, collected);
await withAssetsVm.loadProject(vm.toJSON());
const restored = withAssetsVm.runtime.targets.find(t => t.getName && t.getName() === 'Ball');
check('资产塞回去之后读档，造型不再是 broken（刷新恢复的关键一步）',
    !!restored && !restored.getCostumes()[0].broken,
    restored && `broken=${!!restored.getCostumes()[0].broken}`);

// 撤销：新建角色 -> 删角色（造型那条路前面已经逐个验过：edit/new/delete 各自的 undo）
check('undoAction 收得回新建角色',
    port.undoAction(created.undo) === true &&
  !vm.runtime.targets.find(t => t.getName && t.getName() === 'Ball'));

// ls 要带上造型名（编辑造型 / 查看造型都按名字指认）
const lsWithCostumes = await listSpritesTool.handler({}, {});
check('ls 带上造型名与当前造型',
    /costumes: /.test(lsWithCostumes.content),
    String(lsWithCostumes.content).split('\n')
        .filter(line => line.includes('costumes:'))[0]);

// 纯函数：SVG 尺寸解析（最常踩的那个坑）
check('svgCanvasSize 读得出普通数字', JSON.stringify(svgCanvasSize(BALL_SVG)) === '{"width":120,"height":80}');
check('svgCanvasSize 对百分比 / 缺失 / 非 SVG 都返回 null',
    svgCanvasSize('<svg width="100%" height="80"></svg>') === null &&
  svgCanvasSize('<svg viewBox="0 0 10 10"></svg>') === null &&
  svgCanvasSize('not an svg') === null);

// === xce_read_env：环境走工具，不进提示词（用户 2026-10-04 定的）===
const envTool = tools.find(t => t.name === 'xce_read_env');
check('工具表里有 xce_read_env', !!envTool);
const env = await envTool.handler({}, {});
check('xce_read_env 报出运行时（网页版）',
    !env.isError && /Runtime: /.test(env.content) && /web version of XCE/.test(env.content),
    String(env.content).split('\n')[0]);
check('UA 解析：Windows 10/11 认得出',
    osFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36') === 'Windows 10 or 11');
check('UA 解析：桌面版先认 Electron（不是裸 Chromium）',
    /^Electron 42/.test(engineFromUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Electron/42.4.1')) &&
  engineFromUserAgent('Mozilla/5.0 (X11; Linux x86_64) Firefox/145.0') === 'Firefox 145.0',
    engineFromUserAgent('Mozilla/5.0 (X11; Linux x86_64) Firefox/145.0'));

// === xce_ask_user：提问 -> 界面回答 -> 结果回到模型（学 ZCode 的 pending promise 模式）===
const askTool = tools.find(t => t.name === 'xce_ask_user');
check('工具表里有 xce_ask_user', !!askTool);
const ASK_QUESTIONS = [{
    question: '气球画成哪种？',
    header: '造型',
    options: [{label: '圆的（推荐）'}, {label: '方的', description: '有棱角'}]
}];

const askModel = {
    name: 'ask',
    supportsImage: false,
    // 已经拿到过工具结果就收工（注意别只看最后一条：快到步数上限时尾巴上会挂一条 system 提醒）
    complete: async messages =>
        (messages.some(message => message.role === 'tool') ?
            {text: '好，就按圆的来', toolCalls: []} :
            {text: '', toolCalls: [{id: 'ask1', name: 'xce_ask_user', input: {questions: ASK_QUESTIONS}}]})
};
const askSession = createSession();
const askSeen = [];
const askOutcome = await runTurn({
    session: askSession,
    model: askModel,
    tools,
    maxSteps: 3,
    onAsk: async list => {
        askSeen.push(list);
        return ['圆的（推荐）'];
    }
});
check('runTurn 把 onAsk 接到工具上，答案回到模型这一轮继续跑',
    askSeen.length === 1 && askSeen[0][0].question === '气球画成哪种？' &&
  /The user chose: 圆的（推荐）/.test(askSession.messages.find(m => m.role === 'tool').content) &&
  askOutcome.reason === null && askOutcome.text === '好，就按圆的来',
    `onAsk 收到 ${askSeen.length} 次，reason=${askOutcome.reason}`);

// 用户按停止：挂着的提问必须立刻收口，工具拿到「没回答」，历史里不留半截调用
// （onAsk 里直接中止 = 用户按下停止的那一刻；不需要定时器，免得进程多活一会儿）
const stopController = new AbortController();
const stopSession = createSession();
const stopOutcome = await runTurn({
    session: stopSession,
    model: askModel,
    tools,
    maxSteps: 3,
    signal: stopController.signal,
    onAsk: () => {
        stopController.abort();
        return new Promise(() => {}); // 用户一直不点
    }
});
check('中止时挂起的提问立刻收口（工具拿到「没回答」）',
    stopOutcome.aborted === true &&
  /did not answer/.test(stopSession.messages.find(m => m.role === 'tool').content),
    String(stopSession.messages.find(m => m.role === 'tool').content).slice(0, 70));

const badAsk = await executeTool(
    {name: 'xce_ask_user', input: {questions: [{question: '只有一项', options: [{label: '一个'}]}]}},
    tools, {ask: async () => ['一个']});
check('选项少于两个时被拒，并说明该给什么形状',
    badAsk.isError === true && /2-4/.test(badAsk.content),
    String(badAsk.content).slice(0, 70));

const noChannel = await executeTool({name: 'xce_ask_user', input: {questions: ASK_QUESTIONS}}, tools, {});
check('没有提问通道的环境明说问不了（不静默）',
    noChannel.isError === true && /cannot put a question/.test(noChannel.content));

// === xce_note：Scratch 原生注释（真 VM 上验证：挂在积木上 / 进项目 / 重调是改不是叠 / 能撤销）===
const noteTool = tools.find(t => t.name === 'xce_note');
check('工具表里有写注释工具', !!noteTool);

// 舞台上一块积木都没有 → 注释写不进去（Scratch 的注释必须挂在积木上，这是它的机制）
const stageName = vm.runtime.getTargetForStage().getName();
const emptyNote = await executeTool({name: 'xce_note', input: {sprite: stageName, text: '写不进去的'}}, tools, {});
check('没有积木的角色写不了注释，并让模型别硬重试',
    emptyNote.isError === true && /has to hang on a block/.test(emptyNote.content) &&
  /Do not retry/.test(emptyNote.content), String(emptyNote.content).slice(0, 80));

const noteWrite = tools.find(t => t.name === 'xce_write_script');
await noteWrite.handler({sprite: 'Sprite1', text: 'when green flag clicked\nmove (10) steps'});
const noteSprite = vm.runtime.targets.find(t => t.getName() === 'Sprite1');
// 这一段脚本是给注释当锚点的；后面要断言「撤销注释不动积木」，所以先记下此刻的段数
const scriptsBeforeNote = noteSprite.blocks.getScripts().length;
const noteResult = await executeTool(
    {name: 'xce_note', input: {sprite: 'Sprite1', text: '让角色往前走一点点。把 10 改大就走得更远。'}},
    tools, {});
check('写注释成功且说明了用户看不看得到',
    !noteResult.isError && /Added a comment/.test(noteResult.content) &&
  /workspace is showing another sprite|see it right away/.test(noteResult.content),
    String(noteResult.content).slice(0, 90));

const commentIds = Object.keys(noteSprite.comments);
const comment = noteSprite.comments[commentIds[0]];
check('注释挂在某块积木上（Scratch 的注释必须挂在积木上）',
    commentIds.length === 1 && !!comment.blockId &&
  !!noteSprite.blocks.getBlock(comment.blockId));
check('注释正文原样写入，没有强加的「AI 写入」声明行',
    !comment.text.includes('由 XMUER Coding Engine') && comment.text.includes('把 10 改大'),
    JSON.stringify(comment.text.slice(0, 30)));
check('渲染进工作区 XML（没挂在积木上的注释是不会出现的）',
    String(noteSprite.blocks.toXML(noteSprite.comments)).includes('<comment'));

// 进项目：注释要跟着 vm.toJSON 落到 sb3 里，否则刷新 / 导出就丢了
const projectJson = JSON.parse(vm.toJSON());
const savedComments = projectJson.targets.find(t => t.name === 'Sprite1').comments;
check('注释落在项目 JSON 里', Object.values(savedComments)[0].text.includes('让角色往前走'));

// 同一个顶块再写一次 = 改文本，不是叠第二张（否则用户得自己一张张删）
const again = await executeTool(
    {name: 'xce_note', input: {sprite: 'Sprite1', text: '往前走 10 步，改数字就能改距离。'}},
    tools, {});
check('重写不是叠加', /Updated the existing comment/.test(again.content) &&
  Object.keys(noteSprite.comments).length === 1,
`${Object.keys(noteSprite.comments).length} 张`);
check('新正文进得去', noteSprite.comments[commentIds[0]].text.includes('改数字就能改距离'));

// 撤销：注释删掉，积木一块不动
const noteUndo = again.undo;
check('写注释留下的是 note 句柄', noteUndo && noteUndo.kind === 'note' && noteUndo.sprite === 'Sprite1');
const undone = port.undoAction(noteUndo);
check('撤销后注释没了', undone === true && Object.keys(noteSprite.comments).length === 0);
check('撤销不动积木', noteSprite.blocks.getScripts().length === scriptsBeforeNote,
    `${noteSprite.blocks.getScripts().length} vs ${scriptsBeforeNote}`);

const noSpriteNote = await executeTool({name: 'xce_note', input: {sprite: '没有这个角色', text: 'x'}}, tools, {});
check('角色不存在时报错并给出现有角色', noSpriteNote.isError === true &&
  /No sprite named/.test(noSpriteNote.content));
const blankNote = await executeTool({name: 'xce_note', input: {sprite: 'Sprite1', text: '   '}}, tools, {});
check('空正文被拒', blankNote.isError === true && /empty/.test(blankNote.content));

// === xce_delete_note：删注释（id 来自 :: note 行 / 撤销原样摆回 / 保留角色拒绝）===
const deleteNoteTool = tools.find(t => t.name === 'xce_delete_note');
check('工具表里有删注释工具', !!deleteNoteTool);
const doomed = await executeTool(
    {name: 'xce_note', input: {sprite: 'Sprite1', text: '这条注释马上要被删掉。'}}, tools, {});
const doomedId = doomed.undo.commentId;
check('注释清单带 :: note 行的 id（AI 拿它指认要删哪条）',
    port.readNotes('Sprite1').some(note => note.id === doomedId),
    JSON.stringify(port.readNotes('Sprite1').map(note => note.id)));
const delNote = await executeTool({name: 'xce_delete_note', input: {sprite: 'Sprite1', noteId: doomedId}}, tools, {});
check('删除成功并留下 noteDel 句柄',
    !delNote.isError && delNote.undo.kind === 'noteDel' &&
    Object.keys(noteSprite.comments).length === 0, String(delNote.content));
check('撤销删注释 = 原样摆回（含正文）', port.undoAction(delNote.undo) === true &&
    noteSprite.comments[doomedId] && noteSprite.comments[doomedId].text.includes('马上要被删掉'),
    JSON.stringify(Object.keys(noteSprite.comments)));
check('摆回的注释还挂在原来的积木上', !!noteSprite.comments[doomedId].blockId &&
    !!noteSprite.blocks.getBlock(noteSprite.comments[doomedId].blockId));
const delReserved = await executeTool(
    {name: 'xce_delete_note', input: {sprite: 'XCEAGENT', noteId: 'whatever'}}, tools, {});
check('保留角色（记忆存储）上的注释被拒并指路 xce_delete_memory',
    delReserved.isError === true && /reserved sprite/.test(delReserved.content) &&
    /xce_delete_memory/.test(delReserved.content), String(delReserved.content).slice(0, 70));
const delMissingNote = await executeTool(
    {name: 'xce_delete_note', input: {sprite: 'Sprite1', noteId: 'note-nope'}}, tools, {});
check('id 不存在时干净报错', delMissingNote.isError === true, String(delMissingNote.content).slice(0, 60));

// === xce_write_agent：项目级 XCEAGENT（建角色 + 一条注释，readAgentNote 读出来进提示词）===
check('工具表里有项目级说明工具', tools.some(t => t.name === 'xce_write_agent'));
check('一开始没有 XCEAGENT，读出来是空串', port.readAgentNote().text === '');

const agentBlank = await executeTool({name: 'xce_write_agent', input: {text: '  '}}, tools, {});
check('项目级说明空文本被拒', agentBlank.isError === true);

const agentMade = await executeTool(
    {name: 'xce_write_agent', input: {text: '本项目的角色全部用动物命名。'}}, tools, {});
check('第一次写入顺带建了角色，undo 是整只角色',
    !agentMade.isError && agentMade.undo && agentMade.undo.kind === 'sprite' &&
  agentMade.undo.sprite === 'XCEAGENT', String(agentMade.content).slice(0, 90));
const agentTarget = vm.runtime.targets.find(t => t.getName() === 'XCEAGENT');
check('角色里只有一段脚本（那顶空绿旗帽子）',
    !!agentTarget && agentTarget.blocks.getScripts().length === 1 &&
  !!agentTarget.blocks.getBlock(agentTarget.blocks.getScripts()[0]));
check('readAgentNote 读出正文且不带声明行',
    port.readAgentNote().text.includes('动物命名') &&
  !port.readAgentNote().text.includes('[由 XMUER Coding Engine 的 AI 助手写入]'));

const agentAgain = await executeTool(
    {name: 'xce_write_agent', input: {text: '本项目角色一律用食物命名。'}}, tools, {});
check('重写是更新（undo 回到注释句柄）',
    !agentAgain.isError && agentAgain.undo.kind === 'note' &&
  /Updated/.test(agentAgain.content));
check('更新后注释还是一条、正文是新的',
    Object.keys(agentTarget.comments).length === 1 &&
  port.readAgentNote().text.includes('食物命名') && !port.readAgentNote().text.includes('动物命名'));

// 撤销更新：注释删掉、角色和那顶帽子留着
port.undoAction(agentAgain.undo);
check('撤销更新后注释清空', Object.keys(agentTarget.comments).length === 0 &&
  agentTarget.blocks.getScripts().length === 1);
check('清空后读出来又是空串', port.readAgentNote().text === '');

// 超长不再拒绝：照单全收，截断交给提示词那侧声明（老规矩 —— 明说被截 + 模型能 xce_read_agent 读回来）
const agentLong = await executeTool(
    {name: 'xce_write_agent', input: {text: '长'.repeat(25000)}}, tools, {});
check('超 20K 照样写得进去', !agentLong.isError && agentLong.undo.kind === 'note');
check('readAgentNote 报出全文长度', port.readAgentNote().totalChars === 25000);
port.undoAction(agentLong.undo);
check('撤销后全文长度归零', port.readAgentNote().totalChars === 0);

// === xce_read_agent：按行分页读全文 ===
check('工具表里有读项目级说明工具', tools.some(t => t.name === 'xce_read_agent'));
const readMissing = await executeTool({name: 'xce_read_agent', input: {}}, tools, {});
check('没有说明可读时明说并指向写工具',
    readMissing.isError === true && /xce_write_agent/.test(readMissing.content));
await executeTool(
    {name: 'xce_write_agent', input: {text: Array.from({length: 30}, (_, i) => `第${i + 1}行`).join('\n')}},
    tools, {});
const pageAll = await executeTool({name: 'xce_read_agent', input: {}}, tools, {});
check('整篇读出 30 行并报总字符数',
    !pageAll.isError && /lines 1-30 of 30 lines/.test(pageAll.content) &&
  pageAll.content.includes('第30行'), String(pageAll.content).slice(0, 70));
const pageTail = await executeTool({name: 'xce_read_agent', input: {lineStart: 25}}, tools, {});
check('指定行读下半段',
    !pageTail.isError && /lines 25-30/.test(pageTail.content) &&
  pageTail.content.includes('第25行') && pageTail.content.includes('第30行') &&
  !pageTail.content.includes('第24行'));
const agentBadRange = await executeTool({name: 'xce_read_agent', input: {lineStart: 9, lineEnd: 2}}, tools, {});
check('行范围反了被拒', agentBadRange.isError === true && /Bad line range/.test(agentBadRange.content));

// === 项目级 XCEMEMORY：index 一条注释进提示词；content 一条记忆一条注释（各挂一顶帽子）===
check('项目记忆三工具 + 读注释工具都在',
    ['xce_write_project_memory', 'xce_read_project_memory', 'xce_delete_project_memory', 'xce_read_notes']
        .every(name => tools.some(tool => tool.name === name)));
check('一开始没有项目记忆', port.readMemoryIndex() === '');
const noMem = await executeTool({name: 'xce_read_project_memory', input: {name: '登录方式'}}, tools, {});
check('没有记忆时报错并说明', noMem.isError === true && /no memories yet/.test(noMem.content));

const mem1 = await executeTool({
    name: 'xce_write_project_memory',
    input: {name: '登录方式', description: '登录走 CaelLabID', body: '本项目登录统一走 CaelLabID，不要自造账号体系。'}
}, tools, {});
check('首次写入顺带建了两个保留角色',
    !mem1.isError && mem1.undo.createdSprites &&
  mem1.undo.createdSprites.includes('XCEMEMORY_index') &&
  mem1.undo.createdSprites.includes('XCEMEMORY_content'), String(mem1.content).slice(0, 100));
check('index 里有一行摘要', port.readMemoryIndex() === '- 登录方式 — 登录走 CaelLabID');

await executeTool({
    name: 'xce_write_project_memory',
    input: {name: '变量命名', description: '全部小驼峰', body: '变量名全部用小驼峰。'}
}, tools, {});
const memContent = vm.runtime.targets.find(target => target.getName() === 'XCEMEMORY_content');
check('第二条追加：index 两行、content 两条注释各挂一顶帽子',
    port.readMemoryIndex().split('\n').length === 2 &&
  Object.keys(memContent.comments).length === 2 &&
  memContent.blocks.getScripts().length === 2,
    `index=${port.readMemoryIndex().split('\n').length} comments=${Object.keys(memContent.comments).length}`);

const memAgain = await executeTool({
    name: 'xce_write_project_memory',
    input: {name: '登录方式', description: '登录走 CaelLabID（改）', body: '换成新的正文。'}
}, tools, {});
check('同名覆盖不叠加',
    !memAgain.isError && memAgain.undo.phase === 'write' && !!memAgain.undo.prevContent &&
  Object.keys(memContent.comments).length === 2 &&
  port.readMemoryIndex().includes('（改）'));
const memRead = await executeTool({name: 'xce_read_project_memory', input: {name: '登录方式'}}, tools, {});
check('按名读回的是新正文', !memRead.isError && memRead.content.includes('换成新的正文'));

// xce_read_notes：按 noteId 精确读一条；read_project 也列出注释 id
const noteIds = Object.keys(memContent.comments);
const oneNote = await executeTool(
    {name: 'xce_read_notes', input: {sprite: 'XCEMEMORY_content', noteId: noteIds[0]}}, tools, {});
check('按 noteId 读单条注释',
    !oneNote.isError && oneNote.content.split(':: note').length === 2 &&
  oneNote.content.includes(':: note '));
const allNotes = await executeTool({name: 'xce_read_notes', input: {sprite: 'XCEMEMORY_content'}}, tools, {});
check('不带 noteId 读全部（两条）', !allNotes.isError && allNotes.content.split(':: note').length === 3);
const projRead = await executeTool({name: 'xce_read_project', input: {sprite: 'XCEMEMORY_content'}}, tools, {});
check('read_project 的注释区带 :: note 标注', projRead.content.includes(':: note '));

// 删除：注释 + 挂点帽子 + index 行一起走；撤销能原样摆回
const memDel = await executeTool({name: 'xce_delete_project_memory', input: {name: '登录方式'}}, tools, {});
check('删除成功且 undo 是 memory 句柄', !memDel.isError && memDel.undo.kind === 'memory');
check('删后 index 只剩一行、content 只剩一条注释一顶帽子',
    port.readMemoryIndex().split('\n').length === 1 &&
  Object.keys(memContent.comments).length === 1 &&
  memContent.blocks.getScripts().length === 1);
port.undoAction(memDel.undo);
check('撤销删除后注释和 index 行都回来了',
    Object.keys(memContent.comments).length === 2 &&
  memContent.blocks.getScripts().length === 2 &&
  port.readMemoryIndex().includes('登录方式'));

// 撤销首次写入：两个保留角色整只摘掉
port.undoAction(mem1.undo);
check('撤销首次写入把保留角色一起撤掉',
    !vm.runtime.targets.some(target => target.getName() === 'XCEMEMORY_index') &&
  !vm.runtime.targets.some(target => target.getName() === 'XCEMEMORY_content') &&
  port.readMemoryIndex() === '');
const delMissing = await executeTool(
    {name: 'xce_delete_project_memory', input: {name: '不存在'}}, tools, {});
check('删不存在的记忆被拒', delMissing.isError === true && /No project memory/.test(delMissing.content));

// === xce_trigger_event：拉起事件（广播 / 绿旗 / 角色点击），不改项目 ===
check('工具表里有拉起事件工具', tools.some(tool => tool.name === 'xce_trigger_event'));
const badType = await executeTool({name: 'xce_trigger_event', input: {type: 'noop'}}, tools, {});
check('未知类型被拒并列出三种',
    badType.isError === true &&
  /"broadcast", "green-flag" or "sprite-clicked"/.test(badType.content));
const unknownBc = await executeTool(
    {name: 'xce_trigger_event', input: {type: 'broadcast', name: '不存在的消息'}}, tools, {});
check('不存在的广播被拒', unknownBc.isError === true && /Broadcasts that do exist/.test(unknownBc.content));

// 写两段监听脚本：一个「当接收到」，一个「当角色被点击」，各自改 count
await noteWrite.handler({sprite: 'Sprite1', text: 'when I receive [消息A v]\nchange [count v] by (1)'});
await noteWrite.handler({sprite: 'Sprite1', text: 'when this sprite clicked\nchange [count v] by (10)'});
const firedBc = await executeTool(
    {name: 'xce_trigger_event', input: {type: 'broadcast', name: '消息A'}}, tools, {});
check('广播拉起一段脚本', !firedBc.isError && /1 script started/.test(firedBc.content),
    String(firedBc.content).slice(0, 80));
await new Promise(resolve => setTimeout(resolve, 200));
check('广播脚本真的跑了（count=1）', port.readState().variables.count === 1,
    `count=${port.readState().variables.count}`);
const firedClick = await executeTool(
    {name: 'xce_trigger_event', input: {type: 'sprite-clicked', sprite: 'Sprite1'}}, tools, {});
check('角色点击拉起一段脚本', !firedClick.isError && /1 script started/.test(firedClick.content));
await new Promise(resolve => setTimeout(resolve, 200));
check('点击脚本真的跑了（count=11）', port.readState().variables.count === 11,
    `count=${port.readState().variables.count}`);

// 广播存在但没人听：只建变量不写监听脚本
vm.runtime.getTargetForStage().createVariable('bc_none', '没人听的消息', 'broadcast_msg');
const zeroBc = await executeTool(
    {name: 'xce_trigger_event', input: {type: 'broadcast', name: '没人听的消息'}}, tools, {});
check('广播存在但零监听时明说', !zeroBc.isError && /no script is listening/.test(zeroBc.content));
const noSpriteClick = await executeTool(
    {name: 'xce_trigger_event', input: {type: 'sprite-clicked', sprite: '没有这角色'}}, tools, {});
check('点击不存在的角色被拒', noSpriteClick.isError === true && /No sprite named/.test(noSpriteClick.content));
const firedFlag = await executeTool({name: 'xce_trigger_event', input: {type: 'green-flag'}}, tools, {});
check('绿旗拉起（立即返回不等待）', !firedFlag.isError && /Green flag clicked/.test(firedFlag.content) &&
  /without waiting|immediately/.test(firedFlag.content));

// === xce_rename_sprite：改名（脚本不受影响；保留名拦住；可撤销）===
check('工具表里有重命名角色工具', tools.some(tool => tool.name === 'xce_rename_sprite'));
const renameNope = await executeTool(
    {name: 'xce_rename_sprite', input: {sprite: '没有这角色', newName: 'X'}}, tools, {});
check('改不存在的角色被拒', renameNope.isError === true && /No sprite named/.test(renameNope.content));
const renameReserved = await executeTool(
    {name: 'xce_rename_sprite', input: {sprite: 'XCEAGENT', newName: '别的名字'}}, tools, {});
check('保留角色不许改名', renameReserved.isError === true && /reserved/i.test(renameReserved.content));
const renameTake = await executeTool(
    {name: 'xce_rename_sprite', input: {sprite: 'Sprite1', newName: 'xceagent'}}, tools, {});
check('不许占用保留名（大小写不敏感）', renameTake.isError === true && /reserved/i.test(renameTake.content));
const renamed = await executeTool(
    {name: 'xce_rename_sprite', input: {sprite: 'Sprite1', newName: '小球'}}, tools, {});
check('改名成功且 undo 是 rename 句柄',
    !renamed.isError && renamed.undo.kind === 'rename' &&
  renamed.undo.from === 'Sprite1' && renamed.undo.to === '小球',
    String(renamed.content).slice(0, 80));
check('新名字读得到、旧名字没了、脚本原样',
    !!port.readTarget('小球') && !port.readTarget('Sprite1') &&
  port.readTarget('小球').text.includes('move (10) steps'));
const renameDup = await executeTool(
    {name: 'xce_rename_sprite', input: {sprite: '小球', newName: 'stage'}}, tools, {});
check('新名跟现有角色撞车（大小写不敏感）被拒',
    renameDup.isError === true && /already exists/.test(renameDup.content));
port.undoAction(renamed.undo);
check('撤销改名后名字回来', !!port.readTarget('Sprite1') && !port.readTarget('小球'));

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
