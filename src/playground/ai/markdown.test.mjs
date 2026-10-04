// markdown 解析的无头自测（渲染层是直白的，容易错的是解析）
// 用法：node src/playground/ai/markdown.test.mjs
/* eslint-disable no-console */
import {parseBlocks, parseInline} from './markdown-parse.js';

const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

// ---------- 块级 ----------
const sample = `先给结论：**没问题**。

## 怎么写

1. 变量用小写
2. 名字要有意义

- 别用 \`temp\`
- 别用拼音

> 变量名要能读懂。

\`\`\`scratchblocks
when green flag clicked
set [count v] to (0)
\`\`\`

| 场景 | 建议 |
| --- | --- |
| 计数 | count |
| 列表 | items |

---
结束。`;

const blocks = parseBlocks(sample);
const types = blocks.map(b => b.type);
check('块类型识别正确',
    JSON.stringify(types) === JSON.stringify(['p', 'heading', 'ol', 'ul', 'quote', 'code', 'table', 'hr', 'p']),
    JSON.stringify(types));
check('标题级别带出来了', blocks[1].level === 2 && blocks[1].text === '怎么写', JSON.stringify(blocks[1]));
check('有序列表 2 项', blocks[2].items.length === 2 && blocks[2].items[0] === '变量用小写');
check('无序列表 2 项且保留行内代码', blocks[3].items.length === 2 && blocks[3].items[0].includes('`temp`'));
check('引用去掉了 > 号', blocks[4].text === '变量名要能读懂。', JSON.stringify(blocks[4].text));
check('代码块带语言标记且内容完整',
    blocks[5].lang === 'scratchblocks' &&
    blocks[5].text === 'when green flag clicked\nset [count v] to (0)',
    JSON.stringify(blocks[5]));
check('表格表头与数据行',
    JSON.stringify(blocks[6].head) === JSON.stringify(['场景', '建议']) &&
    blocks[6].rows.length === 2 && blocks[6].rows[0][0] === '计数',
    JSON.stringify(blocks[6]));
check('分割线独立成块', blocks[7].type === 'hr');

// 边界：没闭合的代码块不能吞掉后面
const unclosed = parseBlocks('```\nabc\ndef');
check('未闭合的代码块也能收尾', unclosed.length === 1 && unclosed[0].type === 'code' && unclosed[0].text === 'abc\ndef',
    JSON.stringify(unclosed));

// 边界：竖线不是表格（缺分隔行）
const noSep = parseBlocks('| a | b |\n不是分隔行');
check('缺分隔行时不当表格', noSep.every(b => b.type === 'p'), JSON.stringify(noSep.map(b => b.type)));

// 边界：连续的普通行合成一段（不要每行一个 p）
const para = parseBlocks('第一行\n第二行\n\n第三行');
check('连续行合成一段', para.length === 2 && para[0].text === '第一行\n第二行', JSON.stringify(para));

// 边界：模型写编号清单时**每项之间夹空行**，不能变成 20 个独立的 ol（渲染出来满屏「1.」）
const looseOl = parseBlocks('1. 第一条\n\n2. 第二条\n\n3. 第三条');
check('空行隔开的编号项并成一个有序列表',
    looseOl.length === 1 && looseOl[0].type === 'ol' && looseOl[0].items.length === 3,
    JSON.stringify(looseOl.map(b => [b.type, b.items && b.items.length])));
check('有序列表带起始序号', looseOl[0].start === 1, String(looseOl[0].start));

const looseOl3 = parseBlocks('3. 从三开始\n\n4. 第四条');
check('从 3 开始的列表 start=3', looseOl3[0].start === 3, String(looseOl3[0].start));

const looseUl = parseBlocks('- 甲\n\n- 乙\n\n- 丙');
check('空行隔开的无序项也并成一个',
    looseUl.length === 1 && looseUl[0].type === 'ul' && looseUl[0].items.length === 3,
    JSON.stringify(looseUl.map(b => [b.type, b.items && b.items.length])));

// 边界：中间隔了正文/标题就不许并
const twoLists = parseBlocks('1. 甲\n\n中间一句话\n\n1. 乙');
check('中间有正文时不合并',
    twoLists.map(b => b.type).join(',') === 'ol,p,ol', JSON.stringify(twoLists.map(b => b.type)));

// 边界：无序列表后面跟有序列表，不能当成同一种
const mixed = parseBlocks('- 甲\n\n1. 乙');
check('无序与有序不互相吞并',
    mixed.map(b => b.type).join(',') === 'ul,ol', JSON.stringify(mixed.map(b => b.type)));

// ---------- 行内 ----------
const inline = parseInline('用 **粗体**、*斜体*、`代码` 和 [链接](https://x.com) 混排');
check('行内片段类型正确',
    JSON.stringify(inline.map(p => p.type)) ===
    JSON.stringify(['text', 'strong', 'text', 'em', 'text', 'code', 'text', 'link', 'text']),
    JSON.stringify(inline.map(p => p.type)));
check('链接解析出 href', inline.find(p => p.type === 'link').href === 'https://x.com');
check('语法符被剥离：粗体文本不带星号', inline.find(p => p.type === 'strong').text === '粗体');
check('语法符被剥离：行内代码不带反引号', inline.find(p => p.type === 'code').text === '代码');

const bare = parseInline('见 https://example.com/a 这个');
check('裸链接也能识别', bare.some(p => p.type === 'link' && p.href === 'https://example.com/a'));

// 边界：中文不加空格，裸链接不许把后面一整句吞进去（2026-10-04 用户抓到的线上现象：
// 「结果页：https://caellab.click/s/小码王），具体我读了…」整段变蓝，复制的链接是一串 %E5）
const glued = parseInline('结果页：https://caellab.click/s/小码王），具体我读了小码王官网首页。');
const gluedLinks = glued.filter(p => p.type === 'link');
check('裸链接断在中文标点上',
    gluedLinks.length === 1 && gluedLinks[0].href === 'https://caellab.click/s/小码王',
    JSON.stringify(gluedLinks));
check('中文（含裸中文的路径）仍留在链接里',
    gluedLinks[0].href.endsWith('/s/小码王'), gluedLinks[0].href);
check('标点后面的句子是正文，不是链接',
    glued.some(p => p.type === 'text' && p.text.startsWith('），具体我读了')),
    JSON.stringify(glued.map(p => [p.type, p.text])));

// 边界：全角括号夹着的裸链接（模型常写成「（https://x/a）」）
const wrapped = parseInline('（https://example.com/a）后面的字');
check('全角右括号也能收住裸链接',
    wrapped.filter(p => p.type === 'link')[0].href === 'https://example.com/a' &&
    wrapped[wrapped.length - 1].type === 'text',
    JSON.stringify(wrapped.map(p => [p.type, p.text])));

// 边界：markdown 链接形式后面紧跟中文（写成这样就不会被污染）
const mdLink = parseInline('见 [小码王](https://caellab.click/s/x)，然后继续');
check('markdown 链接形式不被后面的中文污染',
    mdLink.find(p => p.type === 'link').href === 'https://caellab.click/s/x' &&
    mdLink.find(p => p.type === 'link').text === '小码王' &&
    mdLink[mdLink.length - 1].text === '，然后继续',
    JSON.stringify(mdLink.map(p => [p.type, p.text])));

// 边界：奇数个星号不该吃掉整行
const odd = parseInline('2 * 3 = 6 这是乘法不是斜体');
check('单个星号不当斜体分隔符', odd.length === 1 && odd[0].type === 'text', JSON.stringify(odd));

// 边界：变量名的 [x v] 不该被当成 markdown 链接
const blockText = parseInline('将 [count v] 设为 (0)');
check('scratchblocks 的 [x v] 不被误判成链接',
    blockText.every(p => p.type === 'text'), JSON.stringify(blockText));

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
