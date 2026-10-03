// serialize.js 的无头自测：往返幂等 + 结构指纹比对
// 用法：node src/playground/ai/serialize.test.mjs
/* eslint-disable no-console */
import {textToBlocks, targetBlocksToText} from './serialize.js';

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
console.log(`渲染警告: ${rendered.warnings.length ? '\n  ' + rendered.warnings.join('\n  ') : '（无）'}`);
console.log(`第一轮警告: ${b1.warnings.length ? '\n  ' + b1.warnings.join('\n  ') : '（无）'}`);
console.log(`第二轮警告: ${b2.warnings.length ? '\n  ' + b2.warnings.join('\n  ') : '（无）'}`);

const f1 = fingerprint(b1.blocks);
const f2 = fingerprint(b2.blocks);
if (f1 === f2) {
  console.log(`\n✅ 往返幂等：两轮结构一致（积木数 ${Object.keys(b1.blocks).length}）`);
  process.exit(0);
}
console.log('\n❌ 结构不一致');
const a = f1.split('\n');
const b = f2.split('\n');
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) console.log(`  第${i + 1}行\n    1: ${a[i]}\n    2: ${b[i]}`);
}
process.exit(1);
