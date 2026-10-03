// 端到端自测：真 scratch-vm + 真 port + 真循环 + 本地脚本模型
// 用法：node src/playground/ai/harness.test.mjs
/* eslint-disable no-console */
import {createRequire} from 'node:module';
import {createScratchPort} from './port.js';
import {createTools} from './tools.js';
import {createSession, toModelMessages} from './session.js';
import {runTurn} from './loop.js';
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
console.log('精灵:', port.listSprites().map(s => s.name).join('、'));
const before = port.readTarget('Sprite1');
check('初始项目没有积木', before.text === '', `text=${JSON.stringify(before.text)}`);

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

// === read_stage：视觉模型给图，非视觉模型给一句能转述的话 ===
// 无头环境没有 renderer，用一个桩顶上（真实浏览器里走 renderer.requestSnapshot）
const readStage = tools.find(t => t.name === 'read_stage');
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const missing = await readStage.handler({}, {supportsImage: true});
check('没有渲染器时 read_stage 明确报失败', missing.isError === true, String(missing.content).slice(0, 60));

vm.runtime.renderer = {requestSnapshot: callback => callback(PNG_1PX)};
const withVision = await readStage.handler({}, {supportsImage: true});
check('视觉模型拿到图片',
  Array.isArray(withVision.images) && withVision.images.length === 1 &&
  withVision.images[0].url.startsWith('data:image/png'),
  JSON.stringify(withVision.images && withVision.images[0].mimeType));
check('图片结果带一句说明（用户在工具卡上看到的字）',
  /舞台截图/.test(String(withVision.content)), String(withVision.content));

const withoutVision = await readStage.handler({}, {supportsImage: false});
check('非视觉模型不塞图片',
  withoutVision.images === void 0 && !withoutVision.isError,
  JSON.stringify(withoutVision.images));
check('非视觉模型得到的是能让 AI 转述给用户的话',
  /不支持图片输入/.test(withoutVision.content) && /换一个支持看图的模型/.test(withoutVision.content),
  String(withoutVision.content).slice(0, 80));

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
