/**
 * markdown 的**解析**部分（纯函数，不含 JSX，所以能在无头环境里测）。
 * 渲染在 markdown.jsx 里。
 *
 * 只做模型实际会用的那几样：标题、行内代码/粗斜体、代码块、列表、引用、分割线、表格、链接。
 * 语法符（`**`、`#`、反引号）在渲染层被藏掉，这里只负责识别结构。
 */

export const FENCE = /^```/;
export const HEADING = /^(#{1,6})\s+(.*)$/;
export const HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
export const QUOTE = /^\s*>\s?/;
export const UL = /^\s*[-*+]\s+/;
export const OL = /^\s*\d+[.)]\s+/;
export const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
export const TABLE_SEP = /^\s*\|[\s:|-]+\|\s*$/;

export const startsBlock = line =>
    FENCE.test(line.trim()) || HEADING.test(line) || HR.test(line) ||
    QUOTE.test(line) || UL.test(line) || OL.test(line) || TABLE_ROW.test(line);

/**
 * 读一个列表。**允许列表项之间夹空行**。
 *
 * 严格按 CommonMark，空行会把列表切断；但模型写「20 条小技巧」这类回答时几乎总是
 * 「1. xxx」「空行」「2. xxx」，照严格规则每一条都会变成一个独立的 <ol>，
 * 渲染出来满屏都是「1.」（实测踩到）。所以：空行后面如果还是同一种列表项，就并进同一个列表。
 * @param {Array<string>} lines 全部行
 * @param {number} from 起始行号
 * @param {RegExp} pattern UL 或 OL
 * @returns {{items: Array<string>, next: number}} 列表项与下一行的行号
 */
const readList = (lines, from, pattern) => {
    const items = [];
    let i = from;
    for (;;) {
        if (pattern.test(lines[i])) {
            items.push(lines[i].replace(pattern, ''));
            i++;
            continue;
        }
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j > i && j < lines.length && pattern.test(lines[j])) {
            i = j;
            continue;
        }
        break;
    }
    return {items, next: i};
};

export const splitTableRow = line =>
    line.trim().replace(/^\||\|$/g, '')
        .split('|')
        .map(cell => cell.trim());

// 行内元素：行内代码 / 粗体 / 斜体 / 链接 / 裸链接
//
// 裸链接的终止符除了空白和 ASCII 右括号，**还得算上中文标点**：中文行文不加空格，
// 只按 markdown 那套「吃到下一个空格」的话，`https://x/a），后面这一整句话` 会整段变成
// 链接 —— 用户复制出来得到一串 %E5（2026-10-04 实测踩到）。排除的几段：
// 弯引号 “”‘’、CJK 标点（\u3000-\u303f）、全角符号（\uff00-\uffef，含 ）（，。：；？！）。
// URL 里正常出现的字符（含裸中文、%XX）都不在这几段里，所以不受影响。
// eslint-disable-next-line max-len -- 正则拆行反而更难核对
export const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s)\u2018\u2019\u201c\u201d\u3000-\u303f\uff00-\uffef]+)/g;

/**
 * 把 markdown 切成块级结构
 * @param {string} text 原始 markdown
 * @returns {Array<object>} 块数组（type 区分 p / heading / code / quote / ul / ol / table / hr）
 */
export const parseBlocks = text => {
    const lines = String(text).replace(/\r\n?/g, '\n')
        .split('\n');
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        if (FENCE.test(line.trim())) {
            const lang = line.trim().slice(3)
                .trim();
            i++;
            const body = [];
            while (i < lines.length && !FENCE.test(lines[i].trim())) {
                body.push(lines[i]);
                i++;
            }
            i++; // 跳过结束的 ```
            blocks.push({type: 'code', lang, text: body.join('\n')});
            continue;
        }

        const heading = line.match(HEADING);
        if (heading) {
            blocks.push({type: 'heading', level: heading[1].length, text: heading[2]});
            i++;
            continue;
        }

        if (HR.test(line)) {
            blocks.push({type: 'hr'});
            i++;
            continue;
        }

        if (QUOTE.test(line)) {
            const body = [];
            while (i < lines.length && QUOTE.test(lines[i])) {
                body.push(lines[i].replace(QUOTE, ''));
                i++;
            }
            blocks.push({type: 'quote', text: body.join('\n')});
            continue;
        }

        if (UL.test(line)) {
            const {items, next} = readList(lines, i, UL);
            i = next;
            blocks.push({type: 'ul', items});
            continue;
        }

        if (OL.test(line)) {
            const {items, next} = readList(lines, i, OL);
            const first = line.match(/^\s*(\d+)/);
            i = next;
            blocks.push({type: 'ol', items, start: first ? Number(first[1]) : 1});
            continue;
        }

        if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
            const head = splitTableRow(line);
            const rows = [];
            i += 2;
            while (i < lines.length && TABLE_ROW.test(lines[i])) {
                rows.push(splitTableRow(lines[i]));
                i++;
            }
            blocks.push({type: 'table', head, rows});
            continue;
        }

        if (!line.trim()) {
            i++;
            continue;
        }

        // 兜底段落：**必须先吃掉当前这一行**再往后接。
        // 否则像 `| a | b |`（看起来是表格但没有分隔行）这种行会让 startsBlock 为真、
        // 却没有任何分支消费它，i 不前进 —— 直接死循环把页面卡死。
        const body = [lines[i]];
        i++;
        while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
            body.push(lines[i]);
            i++;
        }
        blocks.push({type: 'p', text: body.join('\n')});
    }
    return blocks;
};

/**
 * 把行内文本切成「纯文本片段 / 需渲染的片段」，供渲染层转成节点。
 * 返回 [{type:'text'|'code'|'strong'|'em'|'link', text, href?}]，避免渲染层再写一遍正则。
 * @param {string} text 一行文本
 * @returns {Array<object>} 片段数组
 */
export const parseInline = text => {
    const parts = [];
    let last = 0;
    let match;
    INLINE.lastIndex = 0;
    const push = part => {
        if (part.text) parts.push(part);
    };
    while ((match = INLINE.exec(String(text)))) {
        if (match.index > last) push({type: 'text', text: String(text).slice(last, match.index)});
        const token = match[0];
        if (token.startsWith('`')) {
            push({type: 'code', text: token.slice(1, -1)});
        } else if (token.startsWith('**') || token.startsWith('__')) {
            push({type: 'strong', text: token.slice(2, -2)});
        } else if (token.startsWith('*')) {
            push({type: 'em', text: token.slice(1, -1)});
        } else if (token.startsWith('[')) {
            push({
                type: 'link',
                text: token.slice(1, token.indexOf(']')),
                href: token.slice(token.indexOf('](') + 2, -1)
            });
        } else {
            push({type: 'link', text: token, href: token});
        }
        last = match.index + token.length;
    }
    if (last < String(text).length) push({type: 'text', text: String(text).slice(last)});
    return parts;
};
