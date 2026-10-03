// 扩展积木（画笔/音乐/翻译…）的转换测试：文本 -> 积木 -> 交给 scratch-vm 校验
// 用法：node src/playground/ai/extensions.test.mjs
/* eslint-disable no-console */
import {createRequire} from 'node:module';
import {textToBlocks} from './serialize.js';

const require = createRequire(import.meta.url);
const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

const SOURCE = `when green flag clicked
pen down
set pen color to [#ff0000]
stamp
set instrument to [1 v]
play note (60) for (0.5) beats
translate [你好] to [English v]

when green flag clicked
erase all
`;

const result = textToBlocks(SOURCE, {});
console.log(`积木数 ${Object.keys(result.blocks).length}，脚本 ${result.topLevelIds.length}`);
if (result.warnings.length) console.log('警告:\n  ' + result.warnings.join('\n  '));

const opcodes = new Set(Object.values(result.blocks).map(b => b.opcode));
const want = ['pen_penDown', 'pen_setPenColorToColor', 'pen_stamp', 'music_setInstrument',
    'music_playNoteForBeats', 'translate_getTranslate', 'pen_clear'];
for (const opcode of want) {
    check(`生成了 ${opcode}`, opcodes.has(opcode));
}

// 菜单槽必须带影子菜单积木，否则 VM 里的下拉是空的
const shadowsByOpcode = {};
for (const block of Object.values(result.blocks)) {
    if (block.shadow) shadowsByOpcode[block.opcode] = block.fields;
}
check('乐器菜单生成了影子积木', !!shadowsByOpcode.music_menu_INSTRUMENT,
    JSON.stringify(shadowsByOpcode.music_menu_INSTRUMENT));
check('语言菜单生成了影子积木', !!shadowsByOpcode.translate_menu_languages,
    JSON.stringify(shadowsByOpcode.translate_menu_languages));

check('没有转换警告', result.warnings.length === 0, JSON.stringify(result.warnings));

// ---------- 交给 scratch-vm 校验（声明扩展，看 sb3 schema 过不过）----------
const target = {
    isStage: false, name: '角色1', variables: {}, lists: {}, broadcasts: {},
    blocks: result.blocks, comments: {}, currentCostume: 0, costumes: [], sounds: [],
    volume: 100, layerOrder: 1, visible: true, x: 0, y: 0, size: 100, direction: 90,
    draggable: false, rotationStyle: 'all around'
};
const project = {
    targets: [
        {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
            comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0,
            tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null},
        target
    ],
    monitors: [],
    extensions: ['pen', 'music', 'translate'],
    meta: {semver: '3.0.0', vm: '3.0.0', agent: 'xce-ai-ext-test'}
};

// 无头 VM 需要一点浏览器环境的替身
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {createElement: () => ({getContext: () => null, style: {}}), body: {appendChild: () => {}}};
}

try {
    const VM = require('scratch-vm');
    const vm = new VM();
    await vm.loadProject(JSON.stringify(project));
    const vmTarget = vm.runtime.targets.find(t => t.getName && t.getName() === '角色1');
    const vmBlocks = Object.values(vmTarget.blocks._blocks);
    check('scratch-vm 接受了含扩展积木的项目', vmBlocks.length > 0, `${vmBlocks.length} 个块`);
    const missingPrimitive = vmBlocks.filter(b => b.opcode.startsWith('pen_') || b.opcode.startsWith('music_') ||
        b.opcode.startsWith('translate_')).length;
    check('扩展积木确实进了 VM', missingPrimitive >= 7, `${missingPrimitive} 个扩展块`);
} catch (e) {
    check('scratch-vm 接受了含扩展积木的项目', false, (e && e.message) || String(e));
}

// ---------- 没加载的扩展必须拒绝写入（不是替用户加载）----------
const {createScratchPort} = await import('./port.js');
const emptyProject = (await import('./test-project.mjs')).emptyProject('角色1');
const vm2 = new (require('scratch-vm'))();
await vm2.loadProject(JSON.stringify(emptyProject));
const port = createScratchPort({vm: vm2, getWorkspace: () => null});

check('新项目没加载任何扩展', port.loadedExtensions().length === 0,
    JSON.stringify(port.loadedExtensions()));

const refused = await port.writeScript('角色1', 'when green flag clicked\npen down\n');
check('用未加载的扩展时拒绝写入',
    refused.blockIds.length === 0 && JSON.stringify(refused.missingExtensions) === JSON.stringify(['pen']),
    JSON.stringify(refused.missingExtensions));
check('拒绝时确实没往项目里写东西',
    port.readTarget('角色1').blockIds.length === 0,
    String(port.readTarget('角色1').blockIds.length));
check('拒绝时也没擅自加载扩展', port.loadedExtensions().length === 0,
    JSON.stringify(port.loadedExtensions()));

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过（含扩展拒绝路径）'}`);
process.exit(failures.length ? 1 : 0);
