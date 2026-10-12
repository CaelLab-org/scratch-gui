// serialize.js 的无头自测：往返幂等 + 结构指纹比对
// 用法：node src/playground/ai/serialize.test.mjs
/* eslint-disable no-console */
import {textToBlocks, targetBlocksToText} from './serialize.js';
import meta from './tables/blocks-meta.js';

const {menuValuesByBlock} = meta;

const SOURCE = `when green flag clicked
set [x v] to (0)
repeat (10)
  change [x v] by (1)
end
if <(x) > (5)> then
  say (x)
else
  say [small]
end
add (x) to [log v]
move (10) steps
go to [mouse-pointer v]
play sound [Meow v] until done

when green flag clicked
forever
  wait (1) secs
  say (join [n=] (x))
end
`;

/** 结构指纹：忽略 id/坐标，只留拓扑 + opcode + fields + inputs 形态 */
const fingerprint = blocks => {
    const lines = [];
    const seen = new Set();
    const describe = v => {
        if (!Array.isArray(v)) return `?${JSON.stringify(v)}`;
        const [type, second] = v;
        if (typeof second === 'string' && blocks[second]) {
            const t = blocks[second];
            if (t.shadow) return `menu(${t.opcode}:${JSON.stringify(Object.fromEntries(Object.entries(t.fields).map(([k, x]) => [k, x[0]])))})`;
            return 'block';
        }
        if (Array.isArray(second)) return `lit[${second[0]}:${JSON.stringify(second[1])}]`;
        return `empty(${type})`;
    };
    const walk = (id, depth, slot) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        const b = blocks[id];
        const pad = '  '.repeat(depth);
        const fields = Object.fromEntries(Object.entries(b.fields || {}).map(([k, v]) => [k, v[0]]));
        lines.push(`${pad}${slot}${b.opcode} fields=${JSON.stringify(fields)}`);
        for (const [name, v] of Object.entries(b.inputs || {})) {
            lines.push(`${pad}  .${name} = ${describe(v)}`);
            if (Array.isArray(v) && typeof v[1] === 'string' && blocks[v[1]] && !blocks[v[1]].shadow) {
                walk(v[1], depth + 2, '> ');
            }
            if (name.startsWith('SUBSTACK') && Array.isArray(v) && v[1]) walk(v[1], depth + 1, '# ');
        }
        if (b.next) walk(b.next, depth, '| ');
    };
    const tops = Object.keys(blocks).filter(id => blocks[id].topLevel);
    tops.forEach((t, i) => {
        lines.push(`=== 脚本 ${i} ===`);
        walk(t, 0, '');
    });
    return lines.join('\n');
};

const b1 = textToBlocks(SOURCE, {variables: {}, lists: {}});
const rendered = targetBlocksToText({blocks: b1.blocks});
const text1 = rendered.text;
const b2 = textToBlocks(text1, {variables: {...b1.variables}, lists: {...b1.lists}});

console.log('--- 第一轮渲染出的文本 ---');
console.log(text1);
console.log(`\n变量: ${JSON.stringify(b1.variables)}  列表: ${JSON.stringify(b1.lists)}`);
console.log(`渲染警告: ${rendered.warnings.length ? `\n  ${rendered.warnings.join('\n  ')}` : '（无）'}`);
console.log(`第一轮警告: ${b1.warnings.length ? `\n  ${b1.warnings.join('\n  ')}` : '（无）'}`);
console.log(`第二轮警告: ${b2.warnings.length ? `\n  ${b2.warnings.join('\n  ')}` : '（无）'}`);

const f1 = fingerprint(b1.blocks);
const f2 = fingerprint(b2.blocks);

// ---------- 与扩展积木撞名的核心积木（回归：曾经被翻成 makeymakey 的块）----------
// 有些扩展的积木文本跟核心积木一模一样（Makey Makey 的「当按下按键」= 事件类的同名块），
// 表里按归一化文本对齐时被扩展抢走了 id → 核心块被翻成扩展块，再因为没加载扩展而被拒。
const keyPressed = textToBlocks('when [space v] key pressed\nmove (10) steps', {variables: {}, lists: {}});
const keyOpcodes = Object.values(keyPressed.blocks)
    .map(b => b.opcode);
console.log(`\n按键帽子块: ${keyOpcodes.join(', ')}`);
const keyOk = keyOpcodes.includes('event_whenkeypressed') &&
  !keyOpcodes.some(o => /makeymakey/.test(o));
if (!keyOk) console.log('❌ 按键帽子块被扩展积木抢走了');

// ---------- 下拉框的值必须按块译，不能被同名菜单串味（回归：按键块永远不触发）----------
// 核心的「当按下按键」菜单显示 'right arrow'、值就是 'right arrow'；Makey Makey 的同类菜单
// 显示**同一段文字**、值是 'RIGHT'。曾经只有一张全局的「显示名 -> 值」表，扩展先扫就先占了坑，
// 于是核心块被写成 'RIGHT' —— Scratch 只认小写，那个按键块按多少下都没反应。
const keyValue = textToBlocks('when [right arrow v] key pressed\nmove (10) steps', {variables: {}, lists: {}});
const keyField = Object.values(keyValue.blocks).find(b => b.opcode === 'event_whenkeypressed');
const arrowOk = !!keyField && keyField.fields.KEY_OPTION[0] === 'right arrow';
if (!arrowOk) {
    console.log(`❌ 核心按键块的值不对: ${JSON.stringify(keyField && keyField.fields.KEY_OPTION)}（应为 'right arrow'，小写）`);
}
const spaceField = Object.values(keyPressed.blocks).find(b => b.opcode === 'event_whenkeypressed');
const spaceOk = !!spaceField && spaceField.fields.KEY_OPTION[0] === 'space';
if (!spaceOk) {
    console.log(`❌ 空格键的值不对: ${JSON.stringify(spaceField && spaceField.fields.KEY_OPTION)}（应为 'space'，小写）`);
}
// 同一段显示文字在两个块里各译各的：核心小写、Makey Makey 大写，谁也不用牺牲
const coreKeyMenu = menuValuesByBlock.event_whenkeypressed || {};
const makeyMenu = menuValuesByBlock.makeymakey_menu_KEY || {};
const splitOk = coreKeyMenu['right arrow'] === 'right arrow' && makeyMenu['right arrow'] === 'RIGHT';
if (!splitOk) {
    console.log(`❌ 同名菜单没有按块分开: 核心=${JSON.stringify(coreKeyMenu['right arrow'])} ` +
        `Makey=${JSON.stringify(makeyMenu['right arrow'])}`);
}
// 设备端口菜单同样是「同名不同值」，也得各译各的
const ev3Menu = menuValuesByBlock.ev3_motorTurnClockwise || {};
const microbitMenu = menuValuesByBlock.microbit_menu_touchPins || {};
const deviceOk = ev3Menu.A === '0' && microbitMenu['1'] === '1';
if (!deviceOk) {
    console.log(`❌ 设备端口菜单串味: ev3.A=${JSON.stringify(ev3Menu.A)}（应为 '0'） ` +
        `microbit['1']=${JSON.stringify(microbitMenu['1'])}（应为 '1'）`);
}

// ---------- 菜单里没有的值必须当场报出来，不能悄悄写成一块死积木 ----------
const nonsense = textToBlocks('when green flag clicked\nchange [nonsense v] effect by (1)', {variables: {}, lists: {}});
const nonsenseWarned = nonsense.warnings.some(w => /Invalid dropdown value/.test(w) && /nonsense/.test(w));
console.log(`\n瞎写的效果值 -> 警告: ${nonsenseWarned ? '有' : '没有'}`);
if (!nonsenseWarned) console.log(`❌ 菜单外的值没被指出: ${JSON.stringify(nonsense.warnings)}`);
// 反向：角色名这类「菜单里没有但合法」的值（哨兵菜单）不许误报
const goto = textToBlocks('when green flag clicked\ngo to [Sprite2 v]', {variables: {}, lists: {}});
const gotoFalseAlarm = goto.warnings.some(w => /Invalid dropdown value/.test(w));
if (gotoFalseAlarm) console.log(`❌ 角色名被误报成非法值: ${JSON.stringify(goto.warnings)}`);
const noFalseAlarm = !gotoFalseAlarm;

// 反向之二：字母键也是合法值，不许误报。
// 字母 a-z 硬写在 scratch-blocks 的积木定义里（['a','a'] …），psb 的翻译键里没有；
// 菜单只按 psb 建的话，`when [w v] key pressed` 会被当成非法值。
const letterKey = textToBlocks('when [w v] key pressed\nchange [score v] by (1)', {variables: {}, lists: {}});
const letterField = Object.values(letterKey.blocks).find(b => b.opcode === 'event_whenkeypressed');
const letterOk = !!letterField && letterField.fields.KEY_OPTION[0] === 'w' &&
    !letterKey.warnings.some(w => /Invalid dropdown value/.test(w));
console.log(`字母键 [w v]: 值=${JSON.stringify(letterField && letterField.fields.KEY_OPTION)} 警告=${letterKey.warnings.length}`);
if (!letterOk) console.log(`❌ 字母键不对: ${JSON.stringify(letterKey.warnings)}`);

// 反向之三：上面那段 SOURCE 里就带着 `go to [mouse-pointer v]`、`play sound [Meow v]`，
// 一个警告都不该有 —— 造型名 / 声音名是运行期才填进菜单的，静态菜单套上去必然误报。
const sourceClean = b1.warnings.length === 0 && b2.warnings.length === 0;
if (!sourceClean) console.log(`❌ SOURCE 出现了不该有的警告: ${JSON.stringify([...b1.warnings, ...b2.warnings])}`);

// ---------- 菜单影子必须按槽位对齐（回归：效果字段曾被错配成 math_number 坏块）----------
// looks_changeeffectby 只有 CHANGE 槽带 math_number 影子，EFFECT 是**字段**。
// 曾经按「第一个影子」取，于是 EFFECT 被挂上 math_number，写进项目是坏的，读回来还变成 (GHOST)。
const effector = textToBlocks('when green flag clicked\nchange [ghost v] effect by (-4)', {variables: {}, lists: {}});
const effectBlocks = Object.values(effector.blocks);
const effectOpcodes = effectBlocks.map(b => b.opcode);
const effectBlock = effectBlocks.find(b => b.opcode === 'looks_changeeffectby');
console.log(`透明度效果块: ${effectOpcodes.join(', ')}`);
const shadowOk = !!effectBlock && !!effectBlock.fields.EFFECT &&
  effectBlock.fields.EFFECT[0] === 'GHOST' && !effectBlock.inputs.EFFECT;
if (!shadowOk) console.log('❌ 效果字段没落成字段:', JSON.stringify(effectBlock && {fields: effectBlock.fields, inputs: effectBlock.inputs}));

const echo = targetBlocksToText({blocks: effector.blocks});
console.log(`读回成文本: ${JSON.stringify(echo.text)}`);
const echoOk = /\[ghost v\]/i.test(echo.text) && !echo.text.includes('(GHOST)');
if (!echoOk) console.log('❌ 效果字段读回来没写成下拉形状');

// ---------- 每段脚本前带 `:: script <id> (N blocks)` 标注，写回时标注被剥掉 ----------
// （回归：模型照抄整段——含标注行——写回来是常见动作，剥不掉就解析失败）
const headers = text1.match(/^:: script \S+ \(\d+ blocks?\)$/gm) || [];
if (headers.length !== 2) {
    console.log(`❌ 应有 2 个 :: script 标注行，实际 ${headers.length}: ${JSON.stringify(headers)}`);
}
const headerCountOk = headers.every(h => Number(h.match(/\((\d+) blocks?\)/)[1]) > 0);
if (!headerCountOk) console.log(`❌ 标注行里的块数不对: ${JSON.stringify(headers)}`);
// 第二轮 b2 就是拿带标注的 text1 解析的：f1 === f2 成立即说明标注被剥干净了

if (f1 === f2 && keyOk && arrowOk && spaceOk && splitOk && deviceOk && nonsenseWarned && noFalseAlarm &&
    letterOk && sourceClean && shadowOk && echoOk && headers.length === 2 && headerCountOk) {
    console.log(`\n✅ 往返幂等：两轮结构一致（积木数 ${Object.keys(b1.blocks).length}），按键帽子块、菜单按块译值、菜单值校验也正常`);
    process.exit(0);
}
if (f1 !== f2) console.log('\n❌ 结构不一致');
const a = f1.split('\n');
const b = f2.split('\n');
for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) console.log(`  第${i + 1}行\n    1: ${a[i]}\n    2: ${b[i]}`);
}
process.exit(1);
