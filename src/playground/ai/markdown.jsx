/**
 * 简易 markdown 渲染器。
 *
 * 只做模型实际会用的那几样：标题、粗斜体、行内代码、代码块、列表、引用、分割线、表格、链接。
 * 全部渲染成 React 节点，**不用 dangerouslySetInnerHTML** —— 模型输出属于不可信内容。
 *
 * 按 ZCode 的做法：**把语法符藏掉**（`**`、`#`、反引号不能出现在画面上），
 * 标题只有 h1/h2 升档，h3 以下与正文同字号、靠字重分级 —— 这是"看起来不像日志"的关键。
 */
import React from 'react';

import {parseBlocks, parseInline} from './markdown-parse.js';


/**
 * 行内渲染。结构由 parseInline 给出，这里只负责变成 React 节点；语法符一律不显示。
 * @param {string} text 一行文本
 * @param {object} styles CSS module
 * @returns {Array|string} React 节点数组
 */
export const renderInline = (text, styles) => {
    const parts = parseInline(text);
    if (parts.length === 1 && parts[0].type === 'text') return text;
    return parts.map((part, index) => {
        const key = `i${index}`;
        switch (part.type) {
        case 'code':
            return (<code
                className={styles.mdCode}
                key={key}
            >{part.text}</code>);
        case 'strong':
            return <strong key={key}>{renderInline(part.text, styles)}</strong>;
        case 'em':
            return <em key={key}>{renderInline(part.text, styles)}</em>;
        case 'link':
            return (
                <a
                    className={styles.mdLink}
                    href={part.href}
                    key={key}
                    rel="noreferrer"
                    target="_blank"
                >{part.text}</a>
            );
        default:
            return part.text;
        }
    });
};

/**
 * 渲染一段 markdown
 * @param {object} props {text, styles}
 * @returns {Array} React 节点数组
 */
export const Markdown = ({text, styles}) => {
    const blocks = parseBlocks(text);
    return blocks.map((block, index) => {
        switch (block.type) {
        case 'code':
            return (
                <pre
                    className={`${styles.mdPre} ${block.lang === 'scratchblocks' ? styles.mdBlocks : ''}`}
                    key={index}
                >{block.text}</pre>
            );
        case 'heading': {
            const level = Math.min(block.level, 6);
            const cls = level === 1 ? styles.mdH1 : level === 2 ? styles.mdH2 : styles.mdH3;
            const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
            return (<Tag
                className={cls}
                key={index}
            >{renderInline(block.text, styles)}</Tag>);
        }
        case 'hr':
            return (<hr
                className={styles.mdHr}
                key={index}
            />);
        case 'quote':
            return (
                <blockquote
                    className={styles.mdQuote}
                    key={index}
                >
                    {renderInline(block.text, styles)}
                </blockquote>
            );
        case 'ul':
            return (
                <ul
                    className={styles.mdList}
                    key={index}
                >
                    {block.items.map((item, n) => <li key={n}>{renderInline(item, styles)}</li>)}
                </ul>
            );
        case 'ol':
            return (
                <ol
                    className={styles.mdList}
                    key={index}
                    start={block.start || 1}
                >
                    {block.items.map((item, n) => <li key={n}>{renderInline(item, styles)}</li>)}
                </ol>
            );
        case 'table':
            return (
                <table
                    className={styles.mdTable}
                    key={index}
                >
                    <thead>
                        <tr>{block.head.map((cell, n) => <th key={n}>{renderInline(cell, styles)}</th>)}</tr>
                    </thead>
                    <tbody>
                        {block.rows.map((row, n) => (
                            <tr key={n}>{row.map((cell, m) => <td key={m}>{renderInline(cell, styles)}</td>)}</tr>
                        ))}
                    </tbody>
                </table>
            );
        default:
            return (<p
                className={styles.mdP}
                key={index}
            >{renderInline(block.text, styles)}</p>);
        }
    });
};
