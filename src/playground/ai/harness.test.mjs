// 端到端自测：真 scratch-vm + 真 port + 真循环 + 本地脚本模型
// 用法：node src/playground/ai/harness.test.mjs
/* eslint-disable no-console */
import {createRequire} from 'node:module';
import {createScratchPort} from './port.js';
import {createTools} from './tools.js';
import {createSession, toModelMessages} from './session.js';
import {runTurn, executeTool, createSkipToken, STEP_LIMITS, clampMaxSteps, maxStepsOf} from './loop.js';
import {createScriptedModel, demoSteps} from './model.js';
import {emptyProject} from './test-project.mjs';

const require = createRequire(import.meta.url);
const VM_PATH = 'scratch-vm';

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
console.log('角色:', port.listSprites().map(s => s.name).join('、'));
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
    String(noSprite.content).split('\n').pop().slice(0, 50));

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
    x: 0, y: 0, direction: 90, size: 100, visible: true,
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
  fakePort.listSpritesDetailed().map(t => t.name).join('、'));
check('克隆体不进 readState',
  fakePort.readState().sprites.length === 1, `${fakePort.readState().sprites.length} 个角色`);
check('报错清单用的是真名（不带「（舞台）」装饰）',
  fakePort.listSprites().map(s => s.name).join('、') === 'Stage、角色1',
  fakePort.listSprites().map(s => s.name).join('、'));
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
  port.readTarget('Sprite1').text.split('\n').filter(l => l.includes('@greenFlag')).length + ' 段 hat');

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
  port.readTarget('Sprite1').text.split('\n').slice(0, 2).join(' / '));

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
      text: '', finishReason: 'tool_calls',
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
      text: '', finishReason: 'tool_calls',
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
check('剩 4 次时不提醒', noteAt(0) === null, String(lateSeen[0].length) + ' 条消息');
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

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
