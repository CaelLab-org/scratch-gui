// 端到端自测：真 scratch-vm + 真 port + 真循环 + 本地脚本模型
// 用法：node src/playground/ai/harness.test.mjs
/* eslint-disable no-console */
import {createRequire} from 'node:module';
import {createScratchPort} from './port.js';
import {createTools} from './tools.js';
import {createSession, toModelMessages} from './session.js';
import {runTurn, executeTool} from './loop.js';
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

const whole = await readProjectTool.handler({sprite: 'Sprite1'}, {});
check('按角色读代码（此时项目还是空的，表头也要对）',
    whole.content.includes('# Sprite1（第 1–1 行，共 1 行）'), String(whole.content).split('\n')[0]);

const noSprite = await readProjectTool.handler({}, {});
check('不带角色名只给清单不给代码',
    !noSprite.content.includes('@greenFlag') && noSprite.content.includes('sprite 参数'),
    String(noSprite.content).split('\n').pop().slice(0, 50));

const time = await getTimeTool.handler({}, {});
check('时间工具给 UTC + 时区 + 时差提醒',
    /UTC 时间：\d{4}-/.test(time.content) && /时区/.test(time.content) && /时差/.test(time.content),
    String(time.content).split('\n')[0]);

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
const readProjectTool = tools.find(t => t.name === 'xce_read_project');
const whole = await readProjectTool.handler({sprite: 'Sprite1'}, {});
check('按角色读代码带行数表头',
    whole.content.includes('# Sprite1（第 1–') && whole.content.includes('共 '),
    String(whole.content).split('\n')[0]);
const paged = await readProjectTool.handler({sprite: 'Sprite1', lineStart: 2, lineEnd: 3}, {});
check('行分页只返回指定行',
    paged.content.includes('第 2–3 行') && paged.content.length < whole.content.length,
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
  /舞台截图/.test(String(withVision.content)), String(withVision.content));

const withoutVision = await readStage.handler({}, {supportsImage: false});
check('非视觉模型不塞图片',
  withoutVision.images === void 0 && !withoutVision.isError,
  JSON.stringify(withoutVision.images));
check('非视觉模型得到的是能让 AI 转述给用户的话',
  /不支持图片输入/.test(withoutVision.content) && /换一个支持看图的模型/.test(withoutVision.content),
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
  truncated.content.length < 30 * 1024 && truncated.content.includes('[已被截断，由于过长'),
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

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
