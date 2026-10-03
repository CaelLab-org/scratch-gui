// repeat.js 的无头自测：打转要认出来，正常文本一个字都不许误伤
// 用法：node src/playground/ai/repeat.test.mjs
/* eslint-disable no-console */
import {findRepeat, createRepeatDetector} from './repeat.js';

let failed = 0;
const check = (name, ok, extra = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${extra ? `  ${extra}` : ''}`);
    if (!ok) failed++;
};

// ---------------------------------------------------------------- 该认出来的
// 短块疯狂重复（思考里最典型的：一句话来回吐）
const shortLoop = '先看看项目。'.repeat(1) + '嗯'.repeat(300);
const shortHit = findRepeat(shortLoop);
check('单个字符刷屏认出来', !!shortHit && shortHit.block * shortHit.repeats >= 240,
    JSON.stringify(shortHit));

const phraseLoop = '我需要先确认一下。'.repeat(30);
const phraseHit = findRepeat(phraseLoop);
check('短句来回吐认出来', !!phraseHit && phraseHit.repeats >= 30,
    JSON.stringify(phraseHit));

// 段落级：整段（八十字符以上）原样重来 3 遍就算 —— 大块不必等它重复很多遍
const para = '这段是模型在解释一件已经说过的事，长度在八十个字符以上，用来模拟整段复读；' +
    '它会连续出现三遍，哪怕每遍之间毫无区别、标点也一模一样，人一眼就能看出这是卡住了。';
const paraHit = findRepeat(para.repeat(3));
check('整段复读 3 遍认出来', !!paraHit && paraHit.repeats >= 3,
    `块长 ${para.length} → ${JSON.stringify(paraHit)}`);

// 周期不是 minBlock 正好整除：abcabcabc…（块长只能取 6/9/12…）
const abc = 'abc'.repeat(120);
const abcHit = findRepeat(abc);
check('周期 3 的循环也认（取它的倍数块）', !!abcHit, JSON.stringify(abcHit));

// ---------------------------------------------------------------- 不许误伤
// 一段正常的中文说明（含重复出现的词，但不是原样连续重复）
const normal = `我先看了一下你的项目：角色1 里有一段绿旗脚本，它把 x 从 0 数到 10。
现在的问题是它没有把结果记下来，所以 next 步骤要做的是加一个列表。
我打算这样改：新建一个叫 log 的列表，每次数完就 add 一次。
改完之后跑一遍，再看看 log 里是不是 [10]。`;
check('正常的一段说明不误伤', findRepeat(normal) === null, JSON.stringify(findRepeat(normal)));

// markdown 表格：行与行相似但逐字不同
const table = [
    '| 工具 | 作用 |',
    '| --- | --- |',
    '| xce_read_project | 读一段积木 |',
    '| xce_write_script | 写入积木 |',
    '| xce_delete_script | 删除脚本 |',
    '| xce_run_project | 运行项目 |',
    '| xce_read_state | 读状态 |',
    '| xce_read_stage | 截图 |'
].join('\n');
check('表格不误伤', findRepeat(table) === null);

// 代码：结构一样、数字不一样（这是正常展开，不是打转）
const code = Array.from({length: 20}, (v, i) =>
    `when I receive [msg${i} v]\n  change [count v] by (${i + 1})`).join('\n\n');
check('结构相同但内容不同的代码不误伤', findRepeat(code) === null, `${code.length} 字符`);

// 排版里的空行/缩进不算打转
check('连着的空行不算打转', findRepeat('写完了。\n' + '\n'.repeat(400)) === null);
check('缩进空格不算打转', findRepeat('开始\n' + '    '.repeat(200)) === null);

// 复述两次（人也会这么说话）不该触发
check('同一句话出现两次不触发', findRepeat('这个要小心。别搞错了。这个要小心。') === null);

// ---------------------------------------------------------------- 流式喂入
const HIT = '我需要再确认一下。';
const detector = createRepeatDetector();
let chunks = 0;
let caught = null;
// 前面先来一段正常的（超过 minStreamChars），再开始打转，逐字符喂
for (const ch of '先读一下项目，看看有哪些角色。'.repeat(3)) {
    const found = detector.push(ch);
    chunks++;
    if (found) { caught = found; break; }
}
check('正常内容阶段不触发', caught === null, `喂了 ${chunks} 个字符`);

for (const ch of HIT.repeat(80)) {
    if (caught) break;
    const found = detector.push(ch);
    chunks++;
    if (found) caught = found;
}
check('流式喂入也能抓到时', !!caught, JSON.stringify(caught));
check('记下了重复从第几个字符开始的（切历史用）',
    !!caught && typeof caught.at === 'number' && caught.at > 0 && caught.at < chunks,
    caught && `at=${caught.at} 已喂=${chunks}`);

// 命中之后不再变（界面只提示一次，别每片都当新发现）
const after = detector.push(HIT);
check('命中后不再重复上报', after === null && detector.hit, JSON.stringify(detector.hit));

// 太短的流根本不查：一句话里的重复是正常修辞
const tiny = createRepeatDetector();
let tinyHit = null;
for (const ch of '好的好的好的好的') tinyHit = tiny.push(ch) || tinyHit;
check('短于 minStreamChars 的流不查', tinyHit === null, `${tinyHit}`);

if (failed) {
    console.log(`\n❌ ${failed} 项没过`);
    process.exit(1);
}
console.log('\n✅ repeat 打转检测全部通过');
