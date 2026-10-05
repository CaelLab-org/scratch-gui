/**
 * AI 终端面板。
 *
 * 三种形态：
 *   ai    —— 停靠在左侧，**正好盖住积木选择框那一格**（默认）
 *   code  —— 让位给积木选择框，只在角落留一个小把钮切回来
 *   full  —— 全屏铺满（学 ZCode）
 *
 * 面板宽度只有 ~310px（就是积木选择框的宽度），所以这里的每一行都按「不许换行」来写：
 * 头部只留图标按钮，模型/状态走单行省略；工具输出在干活期间摊开、整轮结束后跟着收起。
 *
 * 干活的是 loop / tools / port / providers / markdown —— 渲染层只负责把事件画出来。
 */
/* eslint-disable react/jsx-no-literals, react/jsx-no-bind */
// 原型阶段：界面文案还没接入 react-intl，JSX 里的内联回调也没抽出去；接 i18n 时一并处理。
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';

import AddonHooks from '../../addons/hooks';
import {createScratchPort} from './port.js';
import {createTools} from './tools.js';
import {SKILLS} from './skills.js';
import {
    loadMemories, saveMemory, deleteMemory, memoryIndexText, MEMORY_TYPES, MEMORY_LIMITS
} from './memory.js';
import {
    loadUserSkills, saveUserSkill, deleteUserSkill, skillNameConflict, isValidSkillName,
    userSkillsForModel, USER_SKILL_LIMITS
} from './user-skills.js';
import {collectConfig, downloadConfig, parseConfig, mergeConfig, CONFIG_EXTENSION,
    collectChatFile, downloadChat, parseChat, CHAT_EXTENSION} from './transfer.js';
import {createSession, newUserMessageId, messagesBefore, messagesUpTo} from './session.js';
import {runTurn, maxStepsOf, STEP_LIMITS} from './loop.js';
import {createScriptedModel, demoSteps} from './model.js';
import {
    createCloudModel, fetchProviderModels, PROVIDERS, getProvider, resolveModel,
    contextWindowOf, maxOutputTokensOf, thinkingOf, allProviders
} from './providers.js';
import {
    loadSettings, saveSettings, clearSettings, describeSettings, hasApiKey,
    loadModelCache, saveModelCache, loadProviderKey
} from './settings.js';
import {
    WIRES, loadCustomProviders, saveCustomProviders, newCustomProviderId
} from './custom-providers.js';
import {buildSystemPrompt, WARN_AT} from './prompt.js';
import {isDesktopMode} from './online.js';
import {notify, requestNotifyPermission} from './notify.js';
import {maybeCompact, measure} from './compact.js';
import {buildTurns, formatWorkDuration, undoActionOf, itemsBeforeTurn, itemsUpToTurn} from './turns.js';
import {Markdown} from './markdown.jsx';
import {
    loadConversation, saveConversation, saveFork, newConversationId, loadConversationIndex,
    deleteConversation, setCurrentConversation, DROPPED_NOTE,
    planChatImport, applyChatImport
} from './store.js';
import {saveProjectNow} from '../project-persistence.jsx';
import styles from './ai.css';

// 量不到积木选择框大小时的兜底
const DOCK_FALLBACK = {left: 0, top: 96, width: 316, height: 520};

// 单次最大输出的快捷档位（token）。留空没选 = 默认 32K（见 providers.js 的 maxOutputTokensOf）
const OUTPUT_LIMITS = [
    {label: '16K', value: 16384},
    {label: '32K', value: 32768},
    {label: '64K', value: 65536},
    {label: '128K', value: 131072}
];
const DEFAULT_MAX_OUTPUT = 32768;

// 工具名 -> 界面上给人看的中文
const TOOL_LABELS = {
    xce_list_sprites: '列出角色',
    xce_read_project: '读取积木',
    xce_write_script: '写入积木',
    xce_delete_script: '删除脚本',
    xce_note: '写注释',
    xce_write_agent: '写项目级说明',
    xce_read_agent: '读项目级说明',
    xce_read_notes: '读注释',
    xce_write_project_memory: '写项目记忆',
    xce_read_project_memory: '读项目记忆',
    xce_delete_project_memory: '删项目记忆',
    xce_run_project: '运行项目',
    xce_trigger_event: '拉起事件',
    xce_read_state: '读取状态',
    xce_read_stage: '截取舞台',
    xce_add_sprite: '新增角色',
    xce_rename_sprite: '重命名角色',
    xce_edit_costume: '编辑造型',
    xce_delete_costume: '删除造型',
    xce_add_costume_from_url: '从网页加造型',
    xce_read_costume: '查看造型',
    xce_get_time: '获取时间',
    xce_read_env: '读取运行环境',
    xce_time: '等待',
    xce_ask_user: '向你提问',
    xce_read_skill: '查阅资料',
    xce_read_fast_docs: '读取文档',
    xce_read_online: '打开网页',
    xce_search: '搜索网络'
};

const EMPTY_HINTS = [
    '做个数到 10 的计数器，用变量记',
    '这个角色现在有哪些脚本？讲讲它在干嘛',
    '被点击后画一个正方形，用画笔'
];

// 空状态的问候语按时段变（边界照 ZCode 的：5 / 9 / 12 / 14 / 18 / 23）
const greetingOf = hour =>
    (hour < 5 ? '夜深了' :
        hour < 9 ? '早上好' :
            hour < 12 ? '上午好' :
                hour < 14 ? '中午好' :
                    hour < 18 ? '下午好' :
                        hour < 23 ? '晚上好' : '夜深了');

// 品牌六边形（跟 logo 同形）当空状态的底影：纯 SVG，不依赖图片资源
const HexMark = ({size}) => (
    <svg
        aria-hidden="true"
        className={styles.emptyMark}
        height={size}
        viewBox="0 0 24 24"
        width={size}
    >
        <path
            d="M12 2.6 20.4 7.4v9.2L12 21.4 3.6 16.6V7.4z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.1"
        />
        <path
            d="M12 7.6 16.4 10.1v4.9L12 17.5 7.6 15V10.1z"
            fill="currentColor"
            opacity="0.28"
        />
    </svg>
);

HexMark.propTypes = {
    size: PropTypes.number
};

// 这一轮用的是哪个模型（用户 2026-10-04 要的「每一轮记下自己用的哪个模型」）：
// 记在发起这一轮的那条用户消息上。label 是给人看的，三个 id 是「切回这条会话时把模型换回去」用的。
const modelTagOf = settings => (hasApiKey(settings) ? {
    providerId: settings.providerId,
    modelId: settings.modelId,
    effort: settings.effort || '',
    label: describeSettings(settings)
} : {providerId: '', modelId: '', effort: '', label: '本地演示模型'});

// 通知正文：这一轮最后那段答复压成一行（系统通知放不下多少字）
const notifyPreview = session => {
    const messages = (session && session.messages) || [];
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message.role === 'assistant' && message.content) {
            const line = String(message.content).replace(/[#*`>\s]+/g, ' ')
                .trim();
            return line.length > 80 ? `${line.slice(0, 80)}…` : line;
        }
    }
    return '';
};

// 工具行标题里带的那一个「最有用的参数」（学 ZCode：把关键信息从详情提到标题上）。
// 角色名排第一；url 去掉协议头，312px 一行才放得下。
const ARG_KEYS = ['sprite', 'query', 'name', 'url'];
const argOf = input => {
    if (!input) return null;
    // 等待类工具的那个「参数」就是秒数：行上直接写「等待 5 秒」
    if (typeof input.seconds === 'number') return `${input.seconds} 秒`;
    for (const key of ARG_KEYS) {
        if (input[key]) {
            const value = String(input[key]);
            return key === 'url' ? value.replace(/^https?:\/\//, '') : value;
        }
    }
    return null;
};

// 当前供应商能选的模型：预设在前（人工挑过、带说明），拉回来的在后（可能几十上百条），按 id 去重。
// 调用方传进来的清单为空就现读缓存（输入区的快捷面板没有自己的一份 state）。
const modelsOf = (providerId, baseUrl, cached) => {
    const provider = getProvider(providerId);
    const fetched = cached && cached.length ? cached : loadModelCache(providerId, provider.baseUrl);
    const seen = new Set();
    const out = [];
    for (const model of provider.models.concat(fetched)) {
        if (seen.has(model.id)) continue;
        seen.add(model.id);
        out.push(model);
    }
    return out;
};

// ---------------------------------------------------------------------------
// 图标
//
// 一律内联 SVG：字体里的符号（⛶ ⚙ ⇤ 这类）在 Windows 上能不能渲染全靠运气，
// 而且粗细/基线跟相邻文字对不齐。stroke 走 currentColor，跟文字同色。
// ---------------------------------------------------------------------------

const ICON_PATHS = {
    panel: ['M2 3.5h12v9H2z', 'M6 3.5v9'],
    plus: ['M8 3.5v9', 'M3.5 8h9'],
    sliders: ['M2.5 4.5h11', 'M2.5 8h11', 'M2.5 11.5h11', 'M5.5 4.5v0', 'M10.5 8v0', 'M6.5 11.5v0'],
    expand: ['M6.5 2.5h-4v4', 'M9.5 2.5h4v4', 'M13.5 9.5v4h-4', 'M2.5 9.5v4h4'],
    shrink: ['M2.5 6.5h4v-4', 'M13.5 6.5h-4v-4', 'M13.5 9.5h-4v4', 'M2.5 9.5h4v4'],
    chevron: ['M6 3.5L10.5 8 6 12.5'],
    // 发送（上箭头）/ 停止（实心方块）：照 ZCode 输入区那两个图标，主按钮和运行中的按钮各一个。
    // 方块走 fill —— 细边的方框在这个尺寸上会被看成复选框
    send: ['M8 13V3.5', 'M4.2 7.3L8 3.5l3.8 3.8'],
    stop: [{d: 'M5 5h6v6H5z', fill: true}],
    check: ['M3 8.5l3.5 3.5L13 4.5'],
    refresh: ['M13 6.5A5 5 0 1 0 4.2 11.6', 'M13 2.5v4h-4'],
    // 时钟（历史对话）：圆用两段弧拼，Icon 只画 path，纯直线段拼不出圆
    history: ['M8 2.5A5.5 5.5 0 1 0 8 13.5A5.5 5.5 0 1 0 8 2.5', 'M8 5v3.2l2.3 1.6'],
    // 铅笔（改这条提问）：一笔斜杆 + 笔尖收在左下
    pencil: ['M11.2 2.6l2.2 2.2-7.4 7.4-2.9.7.7-2.9z', 'M10 3.8l2.2 2.2'],
    // 分叉：一条竖线分出去两支（跟 git 分支的读法一致）
    fork: ['M4.5 3v6.5', 'M4.5 6.5h4a2 2 0 0 1 2 2v1.5', 'M4.5 9.5h4a2 2 0 0 0 2-2V6']
};
// sliders 的三个小圆点单独画（圆不能走 path 的折线逻辑）
ICON_PATHS.slidersDots = [[5.5, 4.5], [10.5, 8], [6.5, 11.5]];

const Icon = ({name, size = 16}) => (
    <svg
        aria-hidden="true"
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
        viewBox="0 0 16 16"
        width={size}
    >
        {(ICON_PATHS[name] || []).map((shape, i) => {
            // 一条 path 可以是字符串（只描边），也可以是 {d, fill} —— 少数图标要实心
            const path = typeof shape === 'string' ? {d: shape} : shape;
            return (
                <path
                    d={path.d}
                    fill={path.fill ? 'currentColor' : 'none'}
                    key={i}
                />
            );
        })}
        {name === 'sliders' ? ICON_PATHS.slidersDots.map(([cx, cy], i) => (
            <circle
                cx={cx}
                cy={cy}
                fill="currentColor"
                key={i}
                r="1.3"
                stroke="none"
            />
        )) : null}
    </svg>
);

Icon.propTypes = {
    name: PropTypes.string,
    size: PropTypes.number
};

// ---------------------------------------------------------------------------
// 停靠测量
// ---------------------------------------------------------------------------

// 积木选择框那格的矩形 = 分类栏（.blocklyToolboxDiv）和展开的积木面板（.blocklyFlyout）的并集。
// flyout 收起时它的 rect 会缩成 0，这时候保留上一次的宽度，别把面板缩成一条。
const measurePalette = previous => {
    const wrapper = document.querySelector('[class*="gui_blocks-wrapper"]');
    const toolbox = document.querySelector('.blocklyToolboxDiv');
    if (!wrapper || !toolbox) return null;
    const box = wrapper.getBoundingClientRect();
    const tb = toolbox.getBoundingClientRect();
    const flyout = document.querySelector('.blocklyFlyout');
    const fl = flyout && flyout.getBoundingClientRect();
    const openFlyout = fl && fl.width > 40 && fl.height > 40;
    const right = openFlyout ? Math.max(fl.right, tb.right) :
        (previous ? previous.left + previous.width : tb.right + 254);
    // 选择框一直延伸到积木区底边（添加扩展按钮就在那条边上），取并集的下沿
    const bottom = openFlyout ? Math.max(fl.bottom, box.bottom) : Math.max(tb.bottom, box.bottom);
    // 窗口比编辑器矮的时候（分屏、小笔记本）选择框下沿会跑到屏幕外。这时候以视口下沿为准 ——
    // 宁可让最下面一点积木露出来，也不能把输入框和发送按钮顶到看不见的地方。
    const limit = Math.min(bottom, window.innerHeight);
    // +1 是为了盖住边缘那一个像素的接缝
    return {
        left: Math.round(box.left),
        top: Math.round(tb.top),
        width: Math.round(right - box.left) + 1,
        height: Math.round(Math.max(limit, tb.top + 200) - tb.top) + 1
    };
};

/**
 * 盯住积木选择框的尺寸。
 * 头 2 秒用 16ms 的密集采样 —— Blockly 是异步排版的（inject / cleanUp / 换分类都会改尺寸），
 * 只听 resize 事件会漏掉这些，面板就会在半秒里保持错误尺寸（那半秒积木会从下面露出来）。
 * 之后降到 250ms，仍然自愈，代价可以忽略。
 * @param {boolean} enabled 是否在停靠形态（让位 / 全屏时不用量）
 * @returns {{left: number, top: number, width: number, height: number}} 面板该占的矩形
 */
const usePaletteDock = enabled => {
    const [dock, setDock] = useState(DOCK_FALLBACK);
    useEffect(() => {
        if (!enabled) return void 0;
        let timer = 0;
        let stopped = false;
        let last = null;
        const startedAt = Date.now();
        const tick = () => {
            if (stopped) return;
            const next = measurePalette(last);
            if (next) {
                const key = `${next.left}:${next.top}:${next.width}:${next.height}`;
                if (!last || last.key !== key) {
                    last = {...next, key};
                    setDock(next);
                }
            }
            timer = setTimeout(tick, Date.now() - startedAt < 2000 ? 16 : 250);
        };
        tick();
        window.addEventListener('resize', tick);
        return () => {
            stopped = true;
            clearTimeout(timer);
            window.removeEventListener('resize', tick);
        };
    }, [enabled]);
    return dock;
};

// ---------------------------------------------------------------------------
// 思考过程
// ---------------------------------------------------------------------------

// 思考行了多少秒：想着的时候按当前时间走（收起状态也看得见它在变），结束后定格成总数。
// 取整、最少 1 秒 —— 学 ZCode 桌面版的 `Thought · N seconds`（它也不用分钟格式）。
const thinkSeconds = ({streaming, ms, startedAt, now}) => {
    if (streaming) return startedAt ? Math.max(1, Math.ceil((now - startedAt) / 1000)) : 1;
    return Math.max(1, Math.ceil((ms || 0) / 1000));
};

// 思考正文里最后一个非空行 —— 右边那条「正在想什么」的摘要用（学 ZCode：
// 折叠状态下也在跳，一眼看得出它没卡住）。界面只放得下十几个字，所以取**尾部**：
// 新内容都加在行尾，显示尾部等于一个小滚屏。
const THINK_PEEK_CHARS = 24;
const thinkPeek = text => {
    const lines = String(text || '').split('\n');
    for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index].trim();
        if (line) return line.length > THINK_PEEK_CHARS ? `…${line.slice(-THINK_PEEK_CHARS)}` : line;
    }
    return '';
};

const Thinking = ({text, streaming, ms, startedAt, now}) => {
    // 默认**折叠**（学 ZCode / Codex）：只在标题行报「想了多久」，想看再点开。
    // 别在流式期间自动摊开 —— 那样答案还没出来就先刷一大片灰字，反而挡着正文。
    const [open, setOpen] = useState(false);
    const label = streaming ?
        `思考中 · ${thinkSeconds({streaming, startedAt, now})}s` :
        (ms ? `思考过程 · 共 ${thinkSeconds({ms})}s` : '思考过程');
    const peek = thinkPeek(text);
    // 一步只想了两个字的那种就别占地方了（多步往返时会冒出好几条「思考过程 · 1s」，很吵）
    if (!streaming && String(text).trim().length < 12) return null;
    return (
        <div className={styles.think}>
            <button
                className={styles.thinkHead}
                onClick={() => setOpen(v => !v)}
                type="button"
            >
                <span className={`${styles.thinkChevron} ${open ? styles.thinkChevronOpen : ''}`}>
                    <Icon
                        name="chevron"
                        size={11}
                    />
                </span>
                {/* 想着的时候行首转个小圈 + 秒数在跳：收起来也看得出它还在干 */}
                {streaming ? <span className={styles.spinner} /> : null}
                <span className={`${styles.thinkLabel} ${streaming ? styles.thinkLive : ''}`}>{label}</span>
                {peek ? <span className={styles.thinkPeek}>{peek}</span> : null}
            </button>
            {open ? <div className={styles.thinkBody}>{text}</div> : null}
        </div>
    );
};

Thinking.propTypes = {
    ms: PropTypes.number,
    now: PropTypes.number,
    startedAt: PropTypes.number,
    streaming: PropTypes.bool,
    text: PropTypes.string
};

// ---------------------------------------------------------------------------
// 向用户提问（xce_ask_user）
// ---------------------------------------------------------------------------

// 无人应答的收口时间，分两段（见下面的 ask 超时 effect）：
// 先给一段固定宽限 —— 提问往往就是发给不在跟前的人（通知还在路上），这段时间不计时；
// 宽限内一有动静、或宽限到点，就按「最后一次有人动鼠标/按键起 60 秒」收口。
const ASK_GRACE_MS = 2 * 60 * 1000;
const ASK_IDLE_TIMEOUT_MS = 60 * 1000;

// 提问卡片：题面 + 2-4 个选项 + 一个「自己写」的输入框；交上去的答案直接回到模型那边，这一轮继续跑。
// 形状跟 ZCode 的 ElicitationDialog 对齐：单选画序号、多选画勾选框，自由输入**永远由界面自己补**
// —— 所以工具描述里不许模型再塞一条「其他」选项。
const AskCard = ({item, onAnswer}) => {
    const done = Array.isArray(item.answers) || !!item.cancelled || !!item.timedOut;
    // 每题当前选中的选项标签；自由输入单独一格
    const [picked, setPicked] = useState(() => item.questions.map(() => []));
    const [other, setOther] = useState(() => item.questions.map(() => ''));

    if (done) {
        const noAnswer = item.timedOut ? '（超时未回答）' : '（没回答）';
        return (
            <div className={styles.ask}>
                {item.questions.map((entry, index) => (
                    <div
                        className={styles.askQ}
                        key={index}
                    >
                        {entry.header ? <span className={styles.askHeader}>{entry.header}</span> : null}
                        <div className={styles.askText}>{entry.question}</div>
                        <div className={styles.askAnswer}>
                            {(item.answers && item.answers[index]) || noAnswer}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    const toggle = (index, label, multi) => setPicked(prev => {
        const copy = prev.slice();
        copy[index] = multi ?
            (copy[index].includes(label) ?
                copy[index].filter(entry => entry !== label) : copy[index].concat([label])) :
            (copy[index][0] === label ? [] : [label]);
        return copy;
    });
    const ready = item.questions.every((entry, index) =>
        picked[index].length > 0 || String(other[index] || '').trim());

    return (
        <div className={styles.ask}>
            {item.questions.map((entry, index) => (
                <div
                    className={styles.askQ}
                    key={index}
                >
                    {entry.header ? <span className={styles.askHeader}>{entry.header}</span> : null}
                    <div className={styles.askText}>{entry.question}</div>
                    <div className={styles.askOptions}>
                        {entry.options.map((option, optionIndex) => {
                            const chosen = picked[index].includes(option.label);
                            return (
                                <button
                                    className={`${styles.askOption} ${chosen ? styles.askOptionOn : ''}`}
                                    key={option.label}
                                    onClick={() => toggle(index, option.label, entry.multiSelect)}
                                    type="button"
                                >
                                    <span className={entry.multiSelect ? styles.askBox : styles.askNum}>
                                        {entry.multiSelect ? (chosen ? '✓' : '') : optionIndex + 1}
                                    </span>
                                    <span className={styles.askOptionText}>
                                        <span className={styles.askLabel}>{option.label}</span>
                                        {option.description ?
                                            <span className={styles.askDesc}>{option.description}</span> : null}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <input
                        className={styles.askOther}
                        onChange={event => {
                            const value = event.target.value;
                            setOther(prev => prev.map((text, i) => (i === index ? value : text)));
                        }}
                        placeholder="或者自己写一个答案"
                        value={other[index]}
                    />
                </div>
            ))}
            <button
                className={styles.askSubmit}
                disabled={!ready}
                onClick={() => onAnswer(item.id, item.questions.map((entry, index) => {
                    const typed = String(other[index] || '').trim();
                    const parts = picked[index].slice();
                    if (typed) parts.push(`自己写的：${typed}`);
                    return parts.join('、');
                }))}
                type="button"
            >就这样，继续</button>
        </div>
    );
};

AskCard.propTypes = {
    item: PropTypes.shape({
        id: PropTypes.string,
        questions: PropTypes.array.isRequired,
        answers: PropTypes.array,
        cancelled: PropTypes.bool,
        timedOut: PropTypes.bool
    }).isRequired,
    onAnswer: PropTypes.func.isRequired
};

// ---------------------------------------------------------------------------
// 工具卡
// ---------------------------------------------------------------------------

// 工具卡。
//
// 形状学 ZCode：**不做卡片**（无边框、无底色），就是一行灰字 —— 一行标题（带参数）+ 可展开的细节。
// 几条硬规矩：
//   - **不显示耗时**（用户明确要求去掉）；
//   - 成功不画对勾、不写「完成」，行本身安静下来就是成功（只有失败要留颜色）；
//   - **不自动摊开**：工作中自动展开的只有「已工作」那条标题行本身（WorkGroup 的活），
//     每条工具行保持收起、想看再点；失败例外 —— 错误必须被看见，自动摊开。
// 撤消按钮**放在行上**而不是藏在展开区里 —— 藏起来等于没有。
const ToolCard = ({item, onUndo, onSkip}) => {
    const failed = item.status === 'failed';
    const running = item.status === 'running';
    // 用户自己点开过就一直开着（defaultOpen 不变时下面的 effect 不会去动它）
    const defaultOpen = failed;
    const [open, setOpen] = useState(defaultOpen);
    const [showRequest, setShowRequest] = useState(false);
    useEffect(() => {
        setOpen(defaultOpen);
    }, [defaultOpen]);
    // 旧对话（改名前存的）里工具名没有 xce_ 前缀，补一次映射，别让界面露出裸英文名
    const label = TOOL_LABELS[item.name] || TOOL_LABELS[`xce_${item.name}`] || item.name;
    // 「查看 Agent 的请求」：用户展开后可以点开看这次调用真正发出去的参数。
    // 截断到 2KB —— xce_write_script 的 text 参数可能很长，全量展开会把面板撑爆。
    const requestText = item.input ?
        (() => {
            const json = JSON.stringify(item.input, null, 2);
            return json.length > 2048 ? `${json.slice(0, 2048)}\n…（更长，已截断）` : json;
        })() : null;
    return (
        <div className={`${styles.tool} ${failed ? styles.toolFailed : ''}`}>
            <div className={styles.toolRow}>
                <button
                    className={styles.toolHead}
                    onClick={() => setOpen(v => !v)}
                    type="button"
                >
                    <span className={`${styles.thinkChevron} ${open ? styles.thinkChevronOpen : ''}`}>
                        <Icon
                            name="chevron"
                            size={11}
                        />
                    </span>
                    <span className={styles.toolName}>{label}</span>
                    {/* 老对话里存的是 sprite 字段，新版才有 arg —— 两个都认，别让历史记录里的行秃掉 */}
                    {item.arg || item.sprite ? (
                        <span className={styles.toolArg}>{item.arg || item.sprite}</span>
                    ) : null}
                    {running ? (
                        <span className={`${styles.toolStatus} ${styles.wait}`}>
                            <span className={styles.spinner} />执行中
                        </span>
                    ) : null}
                    {failed ? <span className={`${styles.toolStatus} ${styles.bad}`}>失败</span> : null}
                </button>
                {running && item.skippable ? (
                    <button
                        className={styles.toolSkip}
                        onClick={() => onSkip(item)}
                        title="不等了，让 AI 现在就往下走"
                        type="button"
                    >跳过</button>
                ) : null}
                {item.undo ? (
                    <button
                        className={styles.toolUndo}
                        onClick={() => onUndo(item)}
                        type="button"
                    >撤销</button>
                ) : null}
            </div>
            {open ? (
                <div className={styles.toolBody}>
                    {item.content}
                    {(item.images || []).map((image, i) => (<img
                        alt="舞台截图"
                        className={styles.toolImg}
                        key={i}
                        src={image.url}
                    />))}
                    {item.imagesDropped ? <div className={styles.toolImgNote}>{DROPPED_NOTE}</div> : null}
                    {requestText ? (
                        <button
                            className={styles.reqToggle}
                            onClick={() => setShowRequest(v => !v)}
                            type="button"
                        >{showRequest ? '收起 Agent 的请求' : '查看 Agent 的请求'}</button>
                    ) : null}
                    {showRequest && requestText ? (
                        <div className={styles.toolReq}>{requestText}</div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

ToolCard.propTypes = {
    item: PropTypes.object,
    onUndo: PropTypes.func,
    onSkip: PropTypes.func
};

// ---------------------------------------------------------------------------
// 工作段（「已工作 Nm Ns」）
// ---------------------------------------------------------------------------

// 一轮里干活的痕迹 + 一条可展开的标题行。
//
// 学 ZCode：标题只报一件事 —— 这段活儿花了多久；细节收在下面，想看再点开。
// 跑的时候默认摊开（要看得见在干嘛）且整行走强调色；干完且有了收尾答复就自动收起、
// 回到灰色元信息的样子。没有答复的那种（模型干完就停了）保持摊开，否则整轮会空成一行字。
const WorkGroup = ({label, meta, live, defaultOpen, children}) => {
    const [open, setOpen] = useState(defaultOpen);
    // 收尾答复一到，defaultOpen 由 true 变 false，这里跟着收起来 —— 用户自己点开过也认这个
    useEffect(() => {
        setOpen(defaultOpen);
    }, [defaultOpen]);
    return (
        <div className={styles.work}>
            <button
                className={styles.workHead}
                onClick={() => setOpen(v => !v)}
                type="button"
            >
                <span className={`${styles.workChevron} ${open ? styles.workChevronOpen : ''}`}>
                    <Icon
                        name="chevron"
                        size={11}
                    />
                </span>
                <span className={`${styles.workLabel} ${live ? styles.workLive : ''}`}>{label}</span>
                {/* 这一轮用的模型（学 ZCode 的元信息灰化）：换过模型的会话一眼看得出是哪一轮 */}
                {meta ? <span
                    className={styles.workMeta}
                    title={meta}
                >{meta}</span> : null}
            </button>
            {open ? <div className={styles.workBody}>{children}</div> : null}
        </div>
    );
};

WorkGroup.propTypes = {
    children: PropTypes.node,
    defaultOpen: PropTypes.bool,
    label: PropTypes.string,
    live: PropTypes.bool,
    meta: PropTypes.string
};

// ---------------------------------------------------------------------------
// 本轮变更（+N / −M 积木 · 回退本轮变更）
// ---------------------------------------------------------------------------

// 一轮干完，在答复下面挂一行「这轮动了哪些角色的几块积木」（学 ZCode 的每轮变更卡片：
// 只在真有改动时出现，加用绿、减用红，其余一律灰）。
//
// 「回退本轮变更」删的是积木，误点一下整轮的活儿就没了 —— 所以沿用历史列表那套两段式确认：
// 点一下只是进入待确认（按钮变红），两三秒没人理就自己退回去。
// 用量数字压缩：356 / 12.4k / 1.23M —— 面板窄，别把完整数字摊开（完整数字进悬停浮层）
const fmtTokens = n => {
    if (!isFinite(n) || n <= 0) return '0';
    if (n >= 1000000) return `${(n / 1000000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return `${Math.round(n)}`;
};

// 回合脚注照 ZCode 的口味：`↑ 12.4k (9.8k cached) · ↓ 356 tok · 41 tok/s`。
// 缓存字段没报（小网关常见）就藏起括号那截，别写 0% 误导人；tok/s 是流式全程的体验速度
const formatTurnUsage = usage => {
    if (!usage || !usage.requests) return '';
    let input = `↑ ${fmtTokens(usage.prompt)}`;
    if (usage.cachedKnown) input += ` (${fmtTokens(usage.cached)} cached)`;
    const parts = [input, `↓ ${fmtTokens(usage.completion)} tok`];
    if (usage.durationMs > 0 && usage.completion > 0) {
        parts.push(`${Math.round(usage.completion / (usage.durationMs / 1000))} tok/s`);
    }
    return parts.join(' · ');
};

const TurnChanges = ({changes, onRevert}) => {
    const [armed, setArmed] = useState(false);
    const timerRef = useRef(0);
    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);
    return (
        <div className={styles.changes}>
            <span className={styles.changesTitle}>本轮变更</span>
            {changes.map(change => (
                <span
                    className={styles.change}
                    key={change.sprite}
                >
                    <span className={styles.changeSprite}>{change.sprite}</span>
                    {change.sprites ? <span className={styles.changePlus}>{'新角色'}</span> : null}
                    {change.added ? <span className={styles.changePlus}>{`+${change.added}`}</span> : null}
                    {change.costumes ? <span className={styles.changePlus}>{`+${change.costumes} 造型`}</span> : null}
                    {change.notes > 0 ? <span className={styles.changePlus}>{`+${change.notes} 注释`}</span> : null}
                    {change.notes < 0 ?
                        <span className={styles.changeMinus}>{`\u2212${-change.notes} 注释`}</span> : null}
                    {change.removed ? <span className={styles.changeMinus}>{`\u2212${change.removed}`}</span> : null}
                    {change.added || change.removed ? <span className={styles.changeUnit}>{'积木'}</span> : null}
                </span>
            ))}
            <button
                className={`${styles.changesUndo} ${armed ? styles.changesUndoArmed : ''}`}
                onClick={() => {
                    if (armed) {
                        if (timerRef.current) clearTimeout(timerRef.current);
                        setArmed(false);
                        onRevert();
                        return;
                    }
                    setArmed(true);
                    timerRef.current = setTimeout(() => setArmed(false), 2500);
                }}
                type="button"
            >{armed ? '确认回退？' : '回退本轮变更'}</button>
        </div>
    );
};

TurnChanges.propTypes = {
    changes: PropTypes.array.isRequired,
    onRevert: PropTypes.func.isRequired
};

// ---------------------------------------------------------------------------
// 模型 / 思考强度快捷面板
// ---------------------------------------------------------------------------

// 输入区那行模型名点开的就地面板（学 ZCode 的 composer 工具栏：模型和思考档位就地切换，
// 不用进设置页 —— 那个页面留给密钥 / 限额 / 提示词）。
// 只列**当前供应商**的模型：换供应商要另配密钥和 base_url，那是设置页的事。
// 换模型 / 调思考档位的快捷面板。
//
// 跨供应商（用户 2026-10-04 要的「一个列表里选」）：全部供应商分组列出，
// **当前这家默认展开**、别的收起（310px 放不下所有家的模型）；一搜索就全展开。
// 选到别家的模型 = 连供应商一起换（密钥、baseUrl 都跟着，见 panel 里的 handlePickModel）。
const ModelMenu = ({settings, onClose, onEffort, onPick, onOpenSettings}) => {
    const [query, setQuery] = useState('');
    // 默认只展开当前这家（310px 放不下所有家的模型）；搜到东西时全部展开
    const [opened, setOpened] = useState(() => ({[settings.providerId]: true}));
    const needle = query.trim().toLowerCase();

    const groups = allProviders()
        .map(provider => ({
            provider,
            models: modelsOf(
                provider.id,
                provider.baseUrl,
                provider.id === settings.providerId ? settings.models : null)
        }))
        .filter(group => group.models.length)
        .map(group => ({
            provider: group.provider,
            // 供应商名也算命中：搜「DeepSeek」要把这家的模型都带出来
            shown: needle ? group.models.filter(model =>
                model.id.toLowerCase().includes(needle) ||
                String(model.name || '').toLowerCase()
                    .includes(needle) ||
                group.provider.name.toLowerCase().includes(needle)) : group.models
        }))
        .filter(group => group.shown.length);

    const thinking = thinkingOf(settings.providerId, settings.modelId);
    const level = thinking && (thinking.levels.find(item => item.value === settings.effort) ||
        thinking.levels[thinking.levels.length - 1]);
    return (
        <div className={styles.modelMenu}>
            <div className={styles.modelMenuHead}>
                <span className={styles.modelMenuTitle}>换模型</span>
                <button
                    aria-label="关闭"
                    className={styles.iconBtn}
                    onClick={onClose}
                    type="button"
                >{'\u00d7'}</button>
            </div>
            {hasApiKey(settings) ? null : (
                <div className={styles.modelMenuNote}>
                    还没填密钥，现在用的是本地演示模型（固定脚本）。先去设置里填上密钥，选的模型才会真的生效。
                </div>
            )}
            <input
                className={styles.modelMenuSearch}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Escape') onClose();
                }}
                placeholder="搜模型或供应商…"
                value={query}
            />
            <div className={styles.modelMenuList}>
                {groups.length === 0 ? (
                    <div className={styles.modelsEmpty}>没有匹配的模型。</div>
                ) : null}
                {groups.map(({provider, shown}) => {
                    const isCurrentProvider = provider.id === settings.providerId;
                    const expanded = !!needle || !!opened[provider.id];
                    const holdsCurrent = isCurrentProvider && shown.some(m => m.id === settings.modelId);
                    return (
                        <React.Fragment key={provider.id}>
                            <button
                                className={styles.modelGroup}
                                onClick={() => setOpened(prev => ({
                                    ...prev,
                                    [provider.id]: !prev[provider.id]
                                }))}
                                type="button"
                            >
                                <span
                                    className={`${styles.modelGroupChevron} ${
                                        expanded ? styles.modelGroupChevronOpen : ''}`}
                                >
                                    <Icon
                                        name="chevron"
                                        size={11}
                                    />
                                </span>
                                <span className={styles.modelGroupName}>{provider.name}</span>
                                {/* 收起来时也看得出当前模型在哪家 */}
                                {holdsCurrent ? <span className={styles.tag}>当前</span> : null}
                                <span className={styles.modelGroupCount}>{shown.length}</span>
                            </button>
                            {expanded ? shown.map(model => (
                                <button
                                    className={`${styles.modelRow} ${isCurrentProvider &&
                                        model.id === settings.modelId ? styles.modelRowOn : ''}`}
                                    key={`${provider.id}/${model.id}`}
                                    onClick={() => onPick(provider.id, model)}
                                    type="button"
                                >
                                    <span className={styles.modelTick}>
                                        {isCurrentProvider && model.id === settings.modelId ? <Icon
                                            name="check"
                                            size={12}
                                        /> : null}
                                    </span>
                                    <span className={styles.modelText}>
                                        <span className={styles.modelName}>{model.name || model.id}</span>
                                        <span className={styles.modelId}>{model.id}</span>
                                    </span>
                                    {model.supportsImage ?
                                        <span className={`${styles.tag} ${styles.tagImg}`}>看图</span> : null}
                                    {model.contextWindow ?
                                        <span className={styles.tag}>
                                            {Math.round(model.contextWindow / 1024)}k
                                        </span> : null}
                                </button>
                            )) : null}
                        </React.Fragment>
                    );
                })}
            </div>
            {thinking && level ? (
                <div className={styles.modelMenuEffort}>
                    <span className={styles.fieldLabel}>思考强度</span>
                    <div className={styles.efforts}>
                        {thinking.levels.map(item => (
                            <button
                                className={`${styles.effort} ${item.value === level.value ? styles.effortOn : ''}`}
                                key={item.value}
                                onClick={() => onEffort(item)}
                                type="button"
                            >{item.label}</button>
                        ))}
                    </div>
                </div>
            ) : null}
            <button
                className={styles.modelMenuMore}
                onClick={onOpenSettings}
                type="button"
            >更多设置（密钥 / 上下文限额 / 提示词）</button>
        </div>
    );
};

ModelMenu.propTypes = {
    onClose: PropTypes.func.isRequired,
    onEffort: PropTypes.func.isRequired,
    onPick: PropTypes.func.isRequired,
    onOpenSettings: PropTypes.func.isRequired,
    settings: PropTypes.object.isRequired
};

// ---------------------------------------------------------------------------
// 设置页
// ---------------------------------------------------------------------------

// 供应商换了 / 拉回清单之后，给个合理的默认思考档位（有 high 就 high）
const defaultEffortOf = (providerId, modelId) => {
    const thinking = thinkingOf(providerId, modelId);
    if (!thinking) return '';
    const preferred = thinking.levels.find(level => level.value === 'high');
    return preferred ? preferred.value : thinking.levels[thinking.levels.length - 1].value;
};

// 下拉里的分组顺序（供应商条目的 group 字段；'其它' 不在表里，排最后）
const GROUP_ORDER = ['国内', '国外', '聚合与云', '本地', '我自己加的', '其它'];
// 「添加自定义供应商」这一项的值。供应商 id 都是字母数字加短横线，撞不上
const ADD_PROVIDER = '__add__';

// 记忆类型的中文标签（给人看的，界面上不显示 user / feedback 那种枚举值）
const memoryTypeLabel = value => (MEMORY_TYPES.find(kind => kind.value === value) || {}).label || value;

// ---------------------------------------------------------------------------
// 设置：分区
// ---------------------------------------------------------------------------

// 设置页原来是十几个字段一长条竖着堆在 310px 里，加了记忆 / 技能 / 迁移之后更没法看。
// 学 ZCode 的设置页：**先给一张分类列表，点进去只看一个分区**（返回键回列表）。
const SETTINGS_SECTIONS = [
    {id: 'model', label: '模型与密钥', note: '换成哪家的模型、填密钥、拉模型清单'},
    {id: 'memory', label: '记忆', note: 'AI 记着的关于你的事（它能自己增删改）'},
    {id: 'skills', label: '技能', note: 'AI 需要时会去读的参考文档'},
    {id: 'prompt', label: '提示词与限额', note: '回答风格的偏好、上下文与步数上限'},
    {id: 'backup', label: '备份与迁移', note: '导出 / 导入配置（换电脑用）'}
];

// 分区内页的头部：左「返回」右标题，跟面板头部同一套（只有图标，不写多余的字）
const SectionHead = ({title, onBack, right}) => (
    <div className={styles.settingsHead}>
        <button
            aria-label="返回设置列表"
            className={styles.iconBtn}
            onClick={onBack}
            title="返回设置列表"
            type="button"
        ><Icon name="chevron" /></button>
        <span className={styles.settingsTitle}>{title}</span>
        {right || null}
    </div>
);

SectionHead.propTypes = {
    onBack: PropTypes.func.isRequired,
    right: PropTypes.node,
    title: PropTypes.string.isRequired
};

// ---------------------------------------------------------------------------
// 设置 · 记忆
// ---------------------------------------------------------------------------

// 记忆是**改完立即生效**的（不像模型设置要点保存）：AI 下一轮发车时现读一次索引，
// 所以这里删掉一条、改一条，下一句话就按新的走。
const MemorySection = ({onBack}) => {
    const [list, setList] = useState(() => loadMemories());
    // 正在编辑的一条：{id?, name, description, type, body}；null = 没在编辑
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');
    const [confirmingId, setConfirmingId] = useState(null);
    const timerRef = useRef(0);
    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const startNew = () => {
        setError('');
        setEditing({name: '', description: '', type: MEMORY_TYPES[0].value, body: ''});
    };

    const startEdit = memory => {
        setError('');
        setEditing({...memory});
    };

    const save = () => {
        const result = saveMemory(editing);
        if (!result.memory) {
            setError(result.error === 'name is required' ? '给它起个名字' : String(result.error || '存不进去'));
            return;
        }
        setList(loadMemories());
        setEditing(null);
        setError('');
    };

    const remove = id => {
        deleteMemory(id);
        setList(loadMemories());
        setConfirmingId(null);
    };

    return (
        <div className={styles.settings}>
            <SectionHead
                onBack={onBack}
                title="记忆"
            />
            <div className={styles.settingsBody}>
                <p className={styles.fieldNote}>
                    AI 自己也会记东西（用 xce_save_memory），这里是你那一半：看得到、改得动、删得掉。
                    每条只有「名字 + 一行描述」会进 AI 的提示词，正文它要用的时候才去读。
                    {`最多 ${MEMORY_LIMITS.max} 条。`}
                </p>

                {editing ? (
                    <React.Fragment>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>名字（同样的名字 = 改那一条）</span>
                            <input
                                className={styles.fieldInput}
                                onChange={e => {
                                    // React 16 的事件对象是池化的，值必须先取出来
                                    const value = e.target.value;
                                    setEditing(prev => ({...prev, name: value}));
                                }}
                                placeholder="例如：用户的称呼"
                                value={editing.name}
                            />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>一行描述（决定 AI 会不会想起来读它）</span>
                            <input
                                className={styles.fieldInput}
                                onChange={e => {
                                    const value = e.target.value;
                                    setEditing(prev => ({...prev, description: value}));
                                }}
                                placeholder="例如：该用户叫什么、怎么称呼"
                                value={editing.description}
                            />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>类型</span>
                            <select
                                className={styles.fieldSelect}
                                onChange={e => {
                                    const value = e.target.value;
                                    setEditing(prev => ({...prev, type: value}));
                                }}
                                value={editing.type}
                            >
                                {MEMORY_TYPES.map(kind => (
                                    <option
                                        key={kind.value}
                                        value={kind.value}
                                    >{`${kind.label} —— ${kind.hint}`}</option>
                                ))}
                            </select>
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>正文</span>
                            <textarea
                                className={styles.fieldTextarea}
                                onChange={e => {
                                    const value = e.target.value;
                                    setEditing(prev => ({...prev, body: value}));
                                }}
                                placeholder="要记住的事实本身，写清楚（AI 需要时会读到这里）"
                                rows={5}
                                value={editing.body}
                            />
                        </label>
                        {error ? (
                            <span
                                className={styles.fieldNote}
                                style={{color: 'var(--error)'}}
                            >{error}</span>
                        ) : null}
                        <div className={styles.rowButtons}>
                            <button
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                onClick={save}
                                type="button"
                            >保存这一条</button>
                            <button
                                className={styles.btn}
                                onClick={() => {
                                    setEditing(null);
                                    setError('');
                                }}
                                type="button"
                            >取消</button>
                        </div>
                    </React.Fragment>
                ) : (
                    <React.Fragment>
                        {list.length === 0 ? (
                            <p className={styles.modelsEmpty}>
                                还没有记忆。AI 觉得该记住什么的时候会自己写一条，你也可以在这里加。
                            </p>
                        ) : null}
                        {list.map(memory => (
                            <div
                                className={styles.memoryRow}
                                key={memory.id}
                            >
                                <button
                                    className={styles.memoryMain}
                                    onClick={() => startEdit(memory)}
                                    title="点开改这一条"
                                    type="button"
                                >
                                    <span className={styles.memoryName}>{memory.name}</span>
                                    <span className={styles.memoryDesc}>{memory.description || '（没有描述）'}</span>
                                    <span className={styles.memoryType}>{memoryTypeLabel(memory.type)}</span>
                                </button>
                                <button
                                    className={`${styles.historyDelete} ${
                                        confirmingId === memory.id ? styles.historyDeleteArm : ''}`}
                                    onClick={() => {
                                        if (confirmingId === memory.id) {
                                            if (timerRef.current) clearTimeout(timerRef.current);
                                            remove(memory.id);
                                            return;
                                        }
                                        // 两段式确认，跟历史列表同一个套路
                                        setConfirmingId(memory.id);
                                        timerRef.current = setTimeout(() => setConfirmingId(null), 2000);
                                    }}
                                    type="button"
                                >{confirmingId === memory.id ? '确认' : '删'}</button>
                            </div>
                        ))}
                        <div className={styles.rowButtons}>
                            <button
                                className={styles.btn}
                                disabled={list.length >= MEMORY_LIMITS.max}
                                onClick={startNew}
                                type="button"
                            >＋ 新增一条</button>
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
};

MemorySection.propTypes = {
    onBack: PropTypes.func.isRequired
};

// ---------------------------------------------------------------------------
// 设置 · 技能
// ---------------------------------------------------------------------------

// 内置那几份是构建期打包进来的（docs/skills/<名字>/SKILL.md），改不了；
// 「我的技能」存 localStorage，跟内置的合并成一个清单给模型（见 user-skills.js）。
const SkillsSection = ({onBack}) => {
    const [mine, setMine] = useState(() => loadUserSkills());
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');
    const [confirmingId, setConfirmingId] = useState(null);
    const timerRef = useRef(0);
    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);
    // 内置技能的名字清单：保存时要拦住重名（重了模型分不清该读哪份）
    const builtinNames = SKILLS.map(skill => skill.name);

    const save = () => {
        const conflict = skillNameConflict(editing.name, builtinNames, editing.id);
        if (conflict) {
            setError(conflict);
            return;
        }
        const result = saveUserSkill(editing);
        if (result.error) {
            setError(result.error);
            return;
        }
        setMine(loadUserSkills());
        setEditing(null);
        setError('');
    };

    return (
        <div className={styles.settings}>
            <SectionHead
                onBack={onBack}
                title="技能"
            />
            <div className={styles.settingsBody}>
                <p className={styles.fieldNote}>
                    「技能」是 AI 需要时会自己去读的参考文档（它先看到名字和一行描述，正文按需读）。
                    这里的能自己写，内置的改不了。{`最多 ${USER_SKILL_LIMITS.max} 份。`}
                </p>

                {editing ? (
                    <React.Fragment>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>名字（只能字母、数字、下划线、连字符）</span>
                            <input
                                className={styles.fieldInput}
                                onChange={e => {
                                    const value = e.target.value;
                                    setEditing(prev => ({...prev, name: value}));
                                }}
                                placeholder="例如：my_sprite_notes"
                                value={editing.name}
                            />
                            {editing.name && !isValidSkillName(editing.name) ? (
                                <span
                                    className={styles.fieldNote}
                                    style={{color: 'var(--error)'}}
                                >名字不合规矩（2~40 位，字母数字下划线连字符）</span>
                            ) : null}
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>一行描述（写清什么时候该读它）</span>
                            <input
                                className={styles.fieldInput}
                                onChange={e => {
                                    const value = e.target.value;
                                    setEditing(prev => ({...prev, description: value}));
                                }}
                                placeholder="例如：我做游戏的常用套路和变量命名习惯"
                                value={editing.description || ''}
                            />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>正文</span>
                            <textarea
                                className={styles.fieldTextarea}
                                onChange={e => {
                                    const value = e.target.value;
                                    setEditing(prev => ({...prev, body: value}));
                                }}
                                placeholder={'用中文写就行，例如：\n- 我的分数变量一律叫「得分」\n- 别用「重复执行 10 次」这种写法，用「重复执行直到」'}
                                rows={8}
                                value={editing.body}
                            />
                        </label>
                        {error ? (
                            <span
                                className={styles.fieldNote}
                                style={{color: 'var(--error)'}}
                            >{error}</span>
                        ) : null}
                        <div className={styles.rowButtons}>
                            <button
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                onClick={save}
                                type="button"
                            >保存这一份</button>
                            <button
                                className={styles.btn}
                                onClick={() => {
                                    setEditing(null);
                                    setError('');
                                }}
                                type="button"
                            >取消</button>
                        </div>
                    </React.Fragment>
                ) : (
                    <React.Fragment>
                        <span className={styles.fieldLabel}>{'我的技能'}</span>
                        {mine.length === 0 ? (
                            <p className={styles.modelsEmpty}>
                                还没有。写一份你希望 AI 每次都遵守的规矩，它会在需要时读到。
                            </p>
                        ) : null}
                        {mine.map(skill => (
                            <div
                                className={styles.memoryRow}
                                key={skill.id}
                            >
                                <button
                                    className={styles.memoryMain}
                                    onClick={() => {
                                        setError('');
                                        setEditing({...skill});
                                    }}
                                    title="点开改这一份"
                                    type="button"
                                >
                                    <span className={styles.memoryName}>{skill.name}</span>
                                    <span className={styles.memoryDesc}>{skill.description || '（没有描述）'}</span>
                                </button>
                                <button
                                    className={`${styles.historyDelete} ${
                                        confirmingId === skill.id ? styles.historyDeleteArm : ''}`}
                                    onClick={() => {
                                        if (confirmingId === skill.id) {
                                            if (timerRef.current) clearTimeout(timerRef.current);
                                            deleteUserSkill(skill.id);
                                            setMine(loadUserSkills());
                                            setConfirmingId(null);
                                            return;
                                        }
                                        setConfirmingId(skill.id);
                                        timerRef.current = setTimeout(() => setConfirmingId(null), 2000);
                                    }}
                                    type="button"
                                >{confirmingId === skill.id ? '确认' : '删'}</button>
                            </div>
                        ))}
                        <div className={styles.rowButtons}>
                            <button
                                className={styles.btn}
                                disabled={mine.length >= USER_SKILL_LIMITS.max}
                                onClick={() => {
                                    setError('');
                                    setEditing({name: '', description: '', body: ''});
                                }}
                                type="button"
                            >＋ 新增一份</button>
                        </div>

                        <span className={styles.fieldLabel}>{'内置技能（只读）'}</span>
                        <div className={styles.skillList}>
                            {SKILLS.map(skill => (
                                <div
                                    className={styles.skillRow}
                                    key={skill.name}
                                >
                                    <span className={styles.memoryName}>{skill.name}</span>
                                    <span className={styles.memoryDesc}>{skill.description}</span>
                                </div>
                            ))}
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
};

SkillsSection.propTypes = {
    onBack: PropTypes.func.isRequired
};

// ---------------------------------------------------------------------------
// 设置 · 备份与迁移
// ---------------------------------------------------------------------------

// 导出的是这一串：模型设置 / 密钥 / 自定义供应商 / 提示词 / 记忆 / 技能。
// **不含对话记录**（那是会话库，体量大又不算配置）。导入是**合并**：文件里的值覆盖同名项，
// 本地独有的留着 —— 在一台已经配好的机器上导入老文件不会把它掏空。
// 列表 / 冲突清单共用的短时间（今天给 时:分，往天给 M/D 时:分）
const formatListTime = ts => {
    if (!ts) return '';
    const d = new Date(ts);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.toDateString() === new Date().toDateString()) return hm;
    return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};

// 对话导入的结果收成几行字。result 为 null = 配额爆了没写进去。
const chatSummaryOf = (result, conflict) => {
    if (!result) return ['写入失败：本地存储放不下了（对话太多 / 太大），先删几条旧的再导'];
    const lines = [`新增 ${result.added} 条`];
    if (conflict === 'file' && result.updated) lines.push(`同一条的按文件覆盖本地 ${result.updated} 条`);
    if (conflict === 'local' && result.kept) lines.push(`同一条的保留本地 ${result.kept} 条（文件里那份没进）`);
    if (conflict === 'both' && result.copies) lines.push(`同一条的各留一份，文件那份存成新对话 ${result.copies} 条`);
    return lines;
};

const BackupSection = ({onBack}) => {
    const [includeKeys, setIncludeKeys] = useState(true);
    // 导入结果：{error} 或 {summary}
    const [outcome, setOutcome] = useState(null);
    const fileRef = useRef(null);
    // 对话记录：结果 {error} 或 {summary: string[]}；撞车时挂起等裁决 {conversations, plan}
    const [chatOutcome, setChatOutcome] = useState(null);
    const [chatPending, setChatPending] = useState(null);
    const [chatConflict, setChatConflict] = useState('both');
    const chatFileRef = useRef(null);
    // 文件里的行，逐行读出来（`<input type=file>` 给的是 File，FileReader 才是内容）
    const handleFile = file => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const parsed = parseConfig(reader.result);
            if (parsed.error) {
                setOutcome({error: parsed.error});
                return;
            }
            try {
                setOutcome({summary: mergeConfig(parsed.config)});
            } catch (e) {
                setOutcome({error: `导入时出错：${e.message}`});
            }
        };
        reader.onerror = () => setOutcome({error: '读不了这个文件'});
        reader.readAsText(file);
    };
    // 对话文件读进来后先预检：没撞车直接合并入库；撞车的挂起，等用户裁决再落
    const handleChatFile = file => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setChatPending(null);
            const parsed = parseChat(reader.result);
            if (parsed.error) {
                setChatOutcome({error: parsed.error});
                return;
            }
            const plan = planChatImport(parsed.conversations);
            if (!plan.fresh && !plan.conflicts.length) {
                setChatOutcome({error: '文件里没有带内容的对话'});
                return;
            }
            if (plan.conflicts.length) {
                setChatPending({conversations: parsed.conversations, plan});
                setChatOutcome(null);
                return;
            }
            const result = applyChatImport(parsed.conversations, 'file');
            setChatOutcome(result ?
                {summary: chatSummaryOf(result, null)} :
                {error: chatSummaryOf(null)[0]});
        };
        reader.onerror = () => setChatOutcome({error: '读不了这个文件'});
        reader.readAsText(file);
    };
    const confirmChatImport = () => {
        if (!chatPending) return;
        const result = applyChatImport(chatPending.conversations, chatConflict);
        setChatPending(null);
        setChatOutcome(result ?
            {summary: chatSummaryOf(result, chatConflict)} :
            {error: chatSummaryOf(null)[0]});
    };
    const handleExportAllChats = () => {
        const file = collectChatFile(null);
        if (!file.conversations.length) {
            setChatOutcome({error: '还没有可导出的对话'});
            return;
        }
        downloadChat(file);
        setChatOutcome(null);
    };

    return (
        <div className={styles.settings}>
            <SectionHead
                onBack={onBack}
                title="备份与迁移"
            />
            <div className={styles.settingsBody}>
                <p className={styles.fieldNote}>
                    {`导出成一份 ${CONFIG_EXTENSION} 文件，换电脑 / 换浏览器时导入回来。`}
                    里面是模型设置、密钥、自己加的供应商、提示词、记忆、技能；对话记录不在这里，走下面单独的 `.chat.xce`。
                    导入是**合并**：文件里的值覆盖同名项，你本地独有的原样留着。
                </p>

                <label className={styles.field}>
                    <span className={styles.fieldLabel}>导出</span>
                    <label className={styles.checkRow}>
                        <input
                            checked={includeKeys}
                            onChange={e => setIncludeKeys(e.target.checked)}
                            type="checkbox"
                        />
                        <span>{'带上 API 密钥（不带的话，导入后要重新填一次）'}</span>
                    </label>
                    {includeKeys ? (
                        <span
                            className={styles.fieldNote}
                            style={{color: 'var(--warning)'}}
                        >注意：带上密钥的这份文件就等于你的密钥，别发给别人、别传到网上。</span>
                    ) : null}
                    <div className={styles.rowButtons}>
                        <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            onClick={() => {
                                downloadConfig(collectConfig({includeKeys}));
                                setOutcome(null);
                            }}
                            type="button"
                        >导出配置文件</button>
                    </div>
                </label>

                <div className={styles.field}>
                    <span className={styles.fieldLabel}>导入</span>
                    <div className={styles.rowButtons}>
                        <button
                            className={styles.btn}
                            onClick={() => fileRef.current && fileRef.current.click()}
                            type="button"
                        >选一份 .output.xce 文件</button>
                    </div>
                    <input
                        accept=".xce,.json,application/json"
                        onChange={e => {
                            // React 16 的事件对象是池化的：先把文件取出来，再清掉 input 的值
                            // （不清的话选同一个文件第二次不会触发 change）
                            const file = e.target.files && e.target.files[0];
                            e.target.value = '';
                            handleFile(file);
                        }}
                        ref={fileRef}
                        style={{display: 'none'}}
                        type="file"
                    />
                    {outcome && outcome.error ? (
                        <span
                            className={styles.fieldNote}
                            style={{color: 'var(--error)'}}
                        >{`导入失败：${outcome.error}`}</span>
                    ) : null}
                    {outcome && outcome.summary ? (() => {
                        const {sourceVersion, settings, keys, providers, memories, skills, warnings} = outcome.summary;
                        return (
                            <div className={styles.importSummary}>
                                <span className={styles.importTitle}>{'导入完成（合并）'}</span>
                                {sourceVersion ? <span>{`这份文件由 XCE ${sourceVersion} 导出`}</span> : null}
                                <span>{`设置：${settings.join('、') || '没动'}`}</span>
                                <span>{`密钥：认了 ${keys} 把`}</span>
                                <span>{`自己加的供应商：新增 ${providers.added} / 更新 ${providers.updated}`}</span>
                                <span>{`记忆：新增 ${memories.added} / 更新 ${memories.updated}`}</span>
                                <span>{`技能：新增 ${skills.added} / 更新 ${skills.updated}`}</span>
                                {warnings.map(warning => (
                                    <span
                                        className={styles.importWarn}
                                        key={warning}
                                    >{warning}</span>
                                ))}
                            </div>
                        );
                    })() : null}
                </div>

                <div className={styles.field}>
                    <span className={styles.fieldLabel}>对话记录</span>
                    <p className={styles.fieldNote}>
                        {`对话记录单独走 ${CHAT_EXTENSION} 文件，历史列表里每条对话都能单独导出；这里可以整个导出 / 整个导入。`}
                        导入是**合并**：没见过的对话直接补进来，两边都有的（同一条两边都改过）
                        会先列出来让你裁决，绝不默默覆盖。注意：文件里就是完整聊天记录，别随手外传。
                    </p>
                    <div className={styles.rowButtons}>
                        <button
                            className={styles.btn}
                            onClick={handleExportAllChats}
                            type="button"
                        >导出全部对话记录</button>
                        <button
                            className={styles.btn}
                            onClick={() => chatFileRef.current && chatFileRef.current.click()}
                            type="button"
                        >{`导入对话记录（${CHAT_EXTENSION}）`}</button>
                    </div>
                    <input
                        accept=".xce,.json,application/json"
                        onChange={e => {
                            const file = e.target.files && e.target.files[0];
                            e.target.value = '';
                            handleChatFile(file);
                        }}
                        ref={chatFileRef}
                        style={{display: 'none'}}
                        type="file"
                    />
                    {chatOutcome && chatOutcome.error ? (
                        <span
                            className={styles.fieldNote}
                            style={{color: 'var(--error)'}}
                        >{`导入失败：${chatOutcome.error}`}</span>
                    ) : null}
                    {chatPending ? (
                        <div className={styles.importSummary}>
                            <span className={styles.importTitle}>
                                {`文件里 ${chatPending.plan.fresh} 条是新的；${chatPending.plan.conflicts.length} 条两边都有，裁决怎么放：`}
                            </span>
                            {chatPending.plan.conflicts.map(conflict => {
                                const localLabel = formatListTime(conflict.localAt) || '未知时间';
                                const incomingLabel = formatListTime(conflict.incomingAt) || '未知时间';
                                return (
                                    <span
                                        className={styles.importWarn}
                                        key={conflict.id}
                                    >{`「${conflict.title || '未命名'}」：本地改于 ${localLabel}，文件里改于 ${incomingLabel}`}</span>
                                );
                            })}
                            <label className={styles.checkRow}>
                                <input
                                    checked={chatConflict === 'both'}
                                    name="xceChatConflict"
                                    onChange={() => setChatConflict('both')}
                                    type="radio"
                                />
                                <span>两条都留（文件那份存成新对话，谁都不丢）</span>
                            </label>
                            <label className={styles.checkRow}>
                                <input
                                    checked={chatConflict === 'file'}
                                    name="xceChatConflict"
                                    onChange={() => setChatConflict('file')}
                                    type="radio"
                                />
                                <span>文件里的为准（覆盖本地那条）</span>
                            </label>
                            <label className={styles.checkRow}>
                                <input
                                    checked={chatConflict === 'local'}
                                    name="xceChatConflict"
                                    onChange={() => setChatConflict('local')}
                                    type="radio"
                                />
                                <span>本地的为准（文件那份不进）</span>
                            </label>
                            <div className={styles.rowButtons}>
                                <button
                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                    onClick={confirmChatImport}
                                    type="button"
                                >确认导入</button>
                            </div>
                        </div>
                    ) : null}
                    {chatOutcome && chatOutcome.summary ? (
                        <div className={styles.importSummary}>
                            <span className={styles.importTitle}>{'对话导入完成（合并）'}</span>
                            {chatOutcome.summary.map(line => (
                                <span key={line}>{line}</span>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

BackupSection.propTypes = {
    onBack: PropTypes.func.isRequired
};

// ---------------------------------------------------------------------------
// 设置
// ---------------------------------------------------------------------------

const SettingsView = ({draft, setDraft, onClose, onSave, onClearAll}) => {
    // null = 停在分区列表；否则是 SETTINGS_SECTIONS 里的某个 id
    const [section, setSection] = useState(null);
    const provider = getProvider(draft.providerId);
    // 占位符里显示的「自动」值 = 目录/拉取清单里声明的元数据（不算用户覆盖）
    const draftModel = resolveModel(draft) || {};
    const [models, setModels] = useState(() => loadModelCache(draft.providerId, provider.baseUrl));
    const [fetching, setFetching] = useState(false);
    const [fetchError, setFetchError] = useState('');
    const [query, setQuery] = useState('');
    const customs = draft.customProviders || [];
    // 当前选中的是自定义供应商的话，名称/协议/路径编辑的就是它那条记录
    const editing = customs.find(item => item.id === draft.providerId) || null;

    // 自定义供应商清单**立即落盘**：它跟「当前用哪家、哪个模型」是两件事 ——
    // 加一条、改个名字不该等着按保存（更不该因为点了返回就没了）
    const patchCustom = (id, patch) => {
        const list = customs.map(entry => (entry.id === id ? {...entry, ...patch} : entry));
        saveCustomProviders(list);
        setDraft(prev => ({...prev, customProviders: list}));
    };

    const applyProvider = providerId => {
        const next = getProvider(providerId);
        const cached = loadModelCache(providerId, next.baseUrl);
        const first = cached[0] || next.models[0];
        setModels(cached);
        setFetchError('');
        setDraft(prev => ({
            ...prev,
            providerId,
            baseUrl: next.baseUrl,
            // 每家一把钥匙：切过来就换上这家自己的（密钥表按供应商 id 存，见 settings.js）
            apiKey: loadProviderKey(providerId),
            modelId: first ? first.id : '',
            models: cached,
            effort: first ? defaultEffortOf(providerId, first.id) : ''
        }));
    };

    const handleProvider = event => {
        const providerId = event.target.value;
        if (providerId !== ADD_PROVIDER) {
            applyProvider(providerId);
            return;
        }
        // 新加一条自定义供应商并直接选中它 —— 接着就能填名字、协议、地址
        const entry = {id: newCustomProviderId(), name: '新供应商', wire: 'openai', baseUrl: ''};
        const list = customs.concat([entry]);
        saveCustomProviders(list);
        setModels([]);
        setFetchError('');
        setDraft(prev => ({
            ...prev,
            customProviders: list,
            providerId: entry.id,
            baseUrl: '',
            apiKey: '',
            modelId: '',
            models: [],
            effort: ''
        }));
    };

    const handleDeleteProvider = id => {
        const list = customs.filter(entry => entry.id !== id);
        saveCustomProviders(list);
        if (id !== draft.providerId) {
            setDraft(prev => ({...prev, customProviders: list}));
            return;
        }
        // 删掉的正好是当前这家 → 退回第一家预设，别让设置停在一个已经不存在的供应商上
        const fallback = PROVIDERS[0];
        const cached = loadModelCache(fallback.id, fallback.baseUrl);
        const first = cached[0] || fallback.models[0];
        setModels(cached);
        setDraft(prev => ({
            ...prev,
            customProviders: list,
            providerId: fallback.id,
            baseUrl: fallback.baseUrl,
            apiKey: loadProviderKey(fallback.id),
            modelId: first ? first.id : '',
            models: cached,
            effort: first ? defaultEffortOf(fallback.id, first.id) : ''
        }));
    };

    // 下拉里的分组：预设按 group 归拢，自定义的单独一组，最后一项是「添加」
    const grouped = [];
    for (const preset of PROVIDERS) {
        const group = preset.group || '其它';
        const bucket = grouped.find(item => item.group === group);
        if (bucket) bucket.items.push(preset);
        else grouped.push({group, items: [preset]});
    }
    if (customs.length) grouped.push({group: '我自己加的', items: customs});
    grouped.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
    // 自定义的 Anthropic 端点跟预设的重名不了，但下拉里标一下协议更省事
    const labelOf = item => (item.custom && item.wire === 'anthropic' ?
        `${item.name}（Anthropic）` : item.name);

    // 一份清单：预设在前（人工挑过、带说明），拉回来的在后（可能有几十上百条）
    const all = modelsOf(draft.providerId, draft.baseUrl, models);
    const needle = query.trim().toLowerCase();
    const matches = model => {
        const name = String(model.name || '').toLowerCase();
        return model.id.toLowerCase().includes(needle) || name.includes(needle);
    };
    const shown = needle ? all.filter(matches) : all;
    const thinking = thinkingOf(draft.providerId, draft.modelId) || provider.thinking;

    const handleFetch = async () => {
        setFetching(true);
        setFetchError('');
        try {
            const list = await fetchProviderModels({
                providerId: draft.providerId,
                baseUrl: draft.baseUrl,
                apiKey: draft.apiKey
            });
            if (!list.length) throw new Error('接口没有返回任何模型');
            saveModelCache(draft.providerId, draft.baseUrl, list);
            setModels(list);
            setDraft(prev => (list.some(m => m.id === prev.modelId) ?
                {...prev, models: list} :
                {...prev, modelId: list[0].id, effort: defaultEffortOf(prev.providerId, list[0].id), models: list}));
        } catch (e) {
            setFetchError(e.message || String(e));
        } finally {
            setFetching(false);
        }
    };

    const handleModel = modelId => {
        setDraft(prev => ({...prev, modelId, effort: defaultEffortOf(prev.providerId, modelId)}));
    };

    // 分区列表：设置项太多，一长条堆在 310px 里没法看 —— 先列分类（学 ZCode 的设置页）
    if (!section) {
        return (
            <div className={styles.settings}>
                <div className={styles.settingsHead}>
                    <span className={styles.settingsTitle}>设置</span>
                    <button
                        className={styles.btn}
                        onClick={onClose}
                        type="button"
                    >返回</button>
                </div>
                <div className={styles.settingsBody}>
                    <div className={styles.sectionList}>
                        {SETTINGS_SECTIONS.map(item => (
                            <button
                                className={styles.sectionRow}
                                key={item.id}
                                onClick={() => setSection(item.id)}
                                type="button"
                            >
                                <span className={styles.sectionBody}>
                                    <span className={styles.sectionLabel}>{item.label}</span>
                                    <span className={styles.sectionNote}>{item.note}</span>
                                </span>
                                <Icon name="chevron" />
                            </button>
                        ))}
                    </div>
                    <p className={styles.fieldNote}>
                        记忆、技能、导入导出改完**立即生效**；「模型与密钥」「提示词与限额」改完要点保存。
                    </p>
                </div>
            </div>
        );
    }
    if (section === 'memory') return <MemorySection onBack={() => setSection(null)} />;
    if (section === 'skills') return <SkillsSection onBack={() => setSection(null)} />;
    if (section === 'backup') return <BackupSection onBack={() => setSection(null)} />;

    // 「模型与密钥」和「提示词与限额」共用同一份 draft 与那个保存按钮，所以留在这一层渲染
    const isModel = section === 'model';
    return (
        <div className={styles.settings}>
            <SectionHead
                onBack={() => setSection(null)}
                title={isModel ? '模型与密钥' : '提示词与限额'}
            />
            <div className={styles.settingsBody}>
                {isModel ? (
                    <React.Fragment>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>供应商</span>
                            <select
                                className={styles.fieldSelect}
                                onChange={handleProvider}
                                value={draft.providerId}
                            >
                                {grouped.map(bucket => (
                                    <optgroup
                                        key={bucket.group}
                                        label={bucket.group}
                                    >
                                        {bucket.items.map(item => (
                                            <option
                                                key={item.id}
                                                value={item.id}
                                            >{labelOf(item)}</option>
                                        ))}
                                    </optgroup>
                                ))}
                                <option value={ADD_PROVIDER}>{'＋ 添加自定义供应商…'}</option>
                            </select>
                            <span className={styles.fieldNote}>{provider.note}</span>
                        </label>

                        {editing ? (
                            <label className={styles.field}>
                                <span className={styles.fieldLabel}>名称</span>
                                <input
                                    className={styles.fieldInput}
                                    onChange={e => patchCustom(editing.id, {name: e.target.value})}
                                    placeholder="例如：公司网关"
                                    value={editing.name}
                                />
                            </label>
                        ) : null}

                        {editing ? (
                            <label className={styles.field}>
                                <span className={styles.fieldLabel}>协议</span>
                                <select
                                    className={styles.fieldSelect}
                                    onChange={e => patchCustom(editing.id, {wire: e.target.value})}
                                    value={editing.wire || 'openai'}
                                >
                                    {WIRES.map(wire => (<option
                                        key={wire.value}
                                        value={wire.value}
                                    >{wire.label}</option>))}
                                </select>
                                <span className={styles.fieldNote}>
                                    Anthropic 那条走 /v1/messages（Claude 官方和它的兼容网关），其余家一律 /chat/completions。
                                </span>
                            </label>
                        ) : null}

                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>
                                {editing ? 'base_url' : 'base_url（可改成中转地址）'}
                            </span>
                            <input
                                className={styles.fieldInput}
                                onChange={e => {
                                    const value = e.target.value;
                                    if (editing) patchCustom(editing.id, {baseUrl: value});
                                    setDraft(prev => ({...prev, baseUrl: value}));
                                }}
                                placeholder="https://your-gateway/v1"
                                value={draft.baseUrl || ''}
                            />
                        </label>

                        {editing ? (
                            <label className={styles.field}>
                                <span className={styles.fieldLabel}>接口路径（留空 = 按协议默认）</span>
                                <input
                                    className={styles.fieldInput}
                                    onChange={e => patchCustom(editing.id, {path: e.target.value})}
                                    placeholder={editing.wire === 'anthropic' ? '/messages' : '/chat/completions'}
                                    value={editing.path || ''}
                                />
                            </label>
                        ) : null}

                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>API 密钥</span>
                            <input
                                className={styles.fieldInput}
                                onChange={e => {
                                    const value = e.target.value;
                                    setDraft(prev => ({...prev, apiKey: value}));
                                }}
                                placeholder="sk-..."
                                type="password"
                                value={draft.apiKey}
                            />
                            <span className={styles.fieldNote}>
                                只存在你这台机器的浏览器里（每家供应商各存各的），请求直连供应商，不经过本站服务器。
                            </span>
                        </label>

                        {editing ? (
                            <div className={styles.rowButtons}>
                                <button
                                    className={styles.btn}
                                    onClick={() => handleDeleteProvider(editing.id)}
                                    type="button"
                                >删除这个供应商</button>
                            </div>
                        ) : null}

                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>模型（{all.length} 个可选）</span>
                            <input
                                className={styles.fieldInput}
                                onChange={e => {
                                    const value = e.target.value;
                                    setQuery(value);
                                }}
                                placeholder="按名字筛一下…"
                                value={query}
                            />
                            <div
                                className={styles.modelsList}
                                style={{marginTop: 8}}
                            >
                                {shown.length === 0 ? (
                                    <div className={styles.modelsEmpty}>
                                        {all.length === 0 ?
                                            '这一家还没带预设模型。填好密钥后点下面的「拉取模型列表」，用你自己的 key 去问接口要真实清单。' :
                                            '没有匹配的模型。'}
                                    </div>
                                ) : null}
                                {shown.map(model => (
                                    <button
                                        className={`${styles.modelRow} ${
                                            model.id === draft.modelId ? styles.modelRowOn : ''}`}
                                        key={model.id}
                                        onClick={() => handleModel(model.id)}
                                        type="button"
                                    >
                                        <span className={styles.modelTick}>
                                            {model.id === draft.modelId ? <Icon
                                                name="check"
                                                size={12}
                                            /> : null}
                                        </span>
                                        <span className={styles.modelText}>
                                            <span className={styles.modelName}>{model.name || model.id}</span>
                                            <span className={styles.modelId}>{model.id}</span>
                                        </span>
                                        {model.supportsImage ?
                                            <span className={`${styles.tag} ${styles.tagImg}`}>看图</span> : null}
                                        {model.contextWindow ?
                                            <span
                                                className={styles.tag}
                                            >{Math.round(model.contextWindow / 1024)}k</span> : null}
                                    </button>
                                ))}
                            </div>
                            <div className={styles.rowButtons}>
                                <button
                                    className={styles.btn}
                                    disabled={fetching}
                                    onClick={handleFetch}
                                    type="button"
                                >
                                    <Icon
                                        name="refresh"
                                        size={12}
                                    />{' '}{fetching ? '拉取中…' : '拉取模型列表'}
                                </button>
                                {provider.keyUrl ? (
                                    <a
                                        className={styles.btn}
                                        href={provider.keyUrl}
                                        rel="noreferrer"
                                        style={{textDecoration: 'none', lineHeight: '26px'}}
                                        target="_blank"
                                    >申请密钥</a>
                                ) : null}
                            </div>
                            {fetchError ? (
                                <span
                                    className={styles.fieldNote}
                                    style={{color: 'var(--error)'}}
                                >{fetchError}</span>
                            ) : null}
                        </div>

                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>模型名（也可以直接手填，预设里没有的 id 照样能用）</span>
                            <input
                                className={styles.fieldInput}
                                onChange={e => {
                                    const value = e.target.value;
                                    setDraft(prev => ({...prev, modelId: value}));
                                }}
                                placeholder="模型 id"
                                value={draft.modelId}
                            />
                        </label>

                        {thinking ? (
                            <label className={styles.field}>
                                <span className={styles.fieldLabel}>思考强度</span>
                                <select
                                    className={styles.fieldSelect}
                                    onChange={e => {
                                        const value = e.target.value;
                                        setDraft(prev => ({...prev, effort: value}));
                                    }}
                                    value={draft.effort || thinking.levels[thinking.levels.length - 1].value}
                                >
                                    {thinking.levels.map(level => (
                                        <option
                                            key={level.value}
                                            value={level.value}
                                        >{level.label}</option>
                                    ))}
                                </select>
                            </label>
                        ) : null}
                    </React.Fragment>
                ) : (
                    <React.Fragment>

                        {/* 限额：留空 = 自动（用模型元数据），填了 = 用户说了算。防止上下文爆掉 / 输出失控 */}
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>
                                {`上下文长度（token，留空 = 自动，模型声明 ${draftModel.contextWindow || '未知'}）`}
                            </span>
                            <input
                                className={styles.fieldInput}
                                inputMode="numeric"
                                min="1"
                                onChange={e => {
                                    const value = e.target.value;
                                    setDraft(prev => ({...prev, contextWindow: value === '' ? void 0 : Number(value)}));
                                }}
                                placeholder={`自动（${draftModel.contextWindow || '未知'}）`}
                                type="number"
                                value={draft.contextWindow || ''}
                            />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>
                                {`单次最大输出（token，留空 = 默认 ${DEFAULT_MAX_OUTPUT / 1024}K，` +
                                    `模型声明 ${draftModel.maxOutputTokens || '未知'}）`}
                            </span>
                            <div className={styles.efforts}>
                                {OUTPUT_LIMITS.map(opt => (
                                    <button
                                        className={`${styles.effort} ${
                                            (draft.maxOutputTokens || DEFAULT_MAX_OUTPUT) === opt.value ?
                                                styles.effortOn : ''
                                        }`}
                                        key={opt.value}
                                        onClick={() => setDraft(prev => ({...prev, maxOutputTokens: opt.value}))}
                                        type="button"
                                    >{opt.label}</button>
                                ))}
                            </div>
                            <input
                                className={styles.fieldInput}
                                inputMode="numeric"
                                min="1"
                                onChange={e => {
                                    const value = e.target.value;
                                    setDraft(prev => ({
                                        ...prev,
                                        maxOutputTokens: value === '' ? void 0 : Number(value)
                                    }));
                                }}
                                placeholder={`默认 ${DEFAULT_MAX_OUTPUT / 1024}K`}
                                type="number"
                                value={draft.maxOutputTokens || ''}
                            />
                            <span className={styles.fieldNote}>
                                上限会随请求发给供应商（max_tokens），输出到上限就停，防止一口气输出到失控；
                                实际生效值不会超过模型声明的上限。
                            </span>
                        </label>

                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>{'单轮往返上限（次，5~120，推荐 15~60）'}</span>
                            <input
                                className={styles.fieldInput}
                                inputMode="numeric"
                                max={STEP_LIMITS.max}
                                min={STEP_LIMITS.min}
                                onChange={e => {
                                    // React 16 的事件对象是池化的，值必须先取出来
                                    const value = e.target.value;
                                    setDraft(prev => ({...prev, maxSteps: value === '' ? void 0 : Number(value)}));
                                }}
                                placeholder={`默认（${STEP_LIMITS.default}）`}
                                type="number"
                                value={draft.maxSteps || ''}
                            />
                            <span className={styles.fieldNote}>
                                {`一次提问里我最多能来回几轮（查资料 → 写积木 → 跑 → 查状态算好几轮）。`}
                                {`填小了省 token，但复杂任务可能半路停住；剩 ${WARN_AT} 次时我会收到提醒并收尾。`}
                            </span>
                        </label>

                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>自定义提示词（可选）</span>
                            <textarea
                                className={styles.fieldTextarea}
                                onChange={e => {
                                    // React 16 的事件对象是池化的，值必须先取出来
                                    const value = e.target.value;
                                    setDraft(prev => ({...prev, userPrompt: value}));
                                }}
                                placeholder={'例如：\n回答别超过三句话\n变量名一律用中文\n先说结论再解释'}
                                rows={4}
                                value={draft.userPrompt || ''}
                            />
                            <span className={styles.fieldNote}>
                                会原样拼在系统提示词后面（以 [End of system prompt] 分隔），每轮对话都带上。
                                它只改风格和偏好，改不了助手有哪些工具、能往项目里写什么。
                            </span>
                        </label>

                    </React.Fragment>
                )}
                <div className={styles.rowButtons}>
                    <button
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={onSave}
                        type="button"
                    >保存</button>
                    {/* 清密钥属于「模型与密钥」那一摊，不必在提示词页里也摆一个 */}
                    {isModel ? (
                        <button
                            className={styles.btn}
                            onClick={onClearAll}
                            type="button"
                        >清除密钥</button>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

SettingsView.propTypes = {
    draft: PropTypes.object,
    onClearAll: PropTypes.func,
    onClose: PropTypes.func,
    onSave: PropTypes.func,
    setDraft: PropTypes.func
};

// ---------------------------------------------------------------------------
// 历史对话列表
// ---------------------------------------------------------------------------

const HistoryItem = ({conversation, current, onOpen, onDelete, onExport}) => {
    const [confirming, setConfirming] = useState(false);
    const timerRef = useRef(0);
    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);
    return (
        <div className={`${styles.historyItem} ${current ? styles.historyItemCurrent : ''}`}>
            <button
                className={styles.historyMain}
                onClick={onOpen}
                title={conversation.title}
                type="button"
            >
                <span className={styles.historyItemBody}>
                    <span className={styles.historyItemTitle}>{conversation.title}</span>
                    {/* 分叉来的会话标一行来处：列表里两条标题很像时一眼分得清 */}
                    {conversation.forkOf ? (
                        <span
                            className={styles.historyItemFork}
                            title={conversation.forkOf.title}
                        >{`分叉自 ${conversation.forkOf.title}`}</span>
                    ) : null}
                    {/* 这条会话在哪家模型上聊的（用户要的会话级模型，列表上看得出来） */}
                    {conversation.model && conversation.model.label ? (
                        <span className={styles.historyItemModel}>{conversation.model.label}</span>
                    ) : null}
                </span>
                <span className={styles.historyItemMeta}>
                    {formatListTime(conversation.updatedAt)}
                </span>
            </button>
            <button
                className={styles.historyExport}
                onClick={onExport}
                title="导出这条对话（.chat.xce 文件）"
                type="button"
            >导出</button>
            <button
                className={`${styles.historyDelete} ${confirming ? styles.historyDeleteArm : ''}`}
                onClick={() => {
                    if (confirming) {
                        if (timerRef.current) clearTimeout(timerRef.current);
                        onDelete();
                        return;
                    }
                    // 两段式确认：第一下只是进入待确认，两秒没人理就自己退回去
                    setConfirming(true);
                    timerRef.current = setTimeout(() => setConfirming(false), 2000);
                }}
                type="button"
            >{confirming ? '确认' : '删'}</button>
        </div>
    );
};

HistoryItem.propTypes = {
    conversation: PropTypes.object.isRequired,
    current: PropTypes.bool,
    onOpen: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
    onExport: PropTypes.func.isRequired
};

const HistoryView = ({conversations, currentId, onClose, onDelete, onExport, onNew, onOpen}) => (
    <div className={styles.history}>
        <div className={styles.historyHead}>
            <span className={styles.historyTitle}>历史对话</span>
            <button
                aria-label="关闭历史列表"
                className={styles.iconBtn}
                onClick={onClose}
                type="button"
            >{'\u00d7'}</button>
        </div>
        <button
            className={styles.historyNew}
            onClick={onNew}
            type="button"
        >
            <Icon
                name="plus"
                size={13}
            /> 新对话
        </button>
        <div className={styles.historyList}>
            {conversations.length === 0 ? (
                <p className={styles.historyEmpty}>
                    还没有历史对话。发过消息的对话会自动存到这里。
                </p>
            ) : (
                conversations
                    .slice()
                    .reverse()
                    .map(conversation => (
                        <HistoryItem
                            conversation={conversation}
                            current={conversation.id === currentId}
                            key={conversation.id}
                            onDelete={() => onDelete(conversation.id)}
                            onExport={() => onExport(conversation.id)}
                            onOpen={() => onOpen(conversation.id)}
                        />
                    ))
            )}
        </div>
    </div>
);

HistoryView.propTypes = {
    conversations: PropTypes.array.isRequired,
    currentId: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
    onExport: PropTypes.func.isRequired,
    onNew: PropTypes.func.isRequired,
    onOpen: PropTypes.func.isRequired
};

// ---------------------------------------------------------------------------
// 面板
// ---------------------------------------------------------------------------

const AIPanel = ({vm, activeTabIndex = 0, theme = null}) => {
    const [mode, setMode] = useState('ai');
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('就绪');
    const [statusError, setStatusError] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    // 输入区那行模型名点开的快捷面板（换模型 / 调思考档位，不用进设置页）
    const [showModelMenu, setShowModelMenu] = useState(false);
    // 打开历史列表那一刻的库内快照（列表是静态的，切换/删除后由对应 handler 刷新）
    const [convIndex, setConvIndex] = useState(null);
    const [settings, setSettings] = useState(() => loadSettings());
    // 编辑中的设置副本。自定义供应商清单（存 localStorage）也挂在这儿，保存/返回时一起处理
    const [settingsDraft, setSettingsDraft] = useState(() => ({
        ...loadSettings(),
        customProviders: loadCustomProviders()
    }));
    // 正在就地改的那条用户消息：{id, text}。null = 没在改（学 ZCode：只有最后一条有铅笔）
    const [editing, setEditing] = useState(null);
    const [context, setContext] = useState(null);
    const [showJump, setShowJump] = useState(false);
    // 「工作中 Ns」要每秒跳一格。只在忙的时候开这个表，闲时不许有任何定时器。
    const [now, setNow] = useState(() => Date.now());
    const abortRef = useRef(null);
    // 正在执行的等待类工具 -> 它的「跳过」令牌（函数不能进 items：那些条目要序列化进 localStorage）
    const skipRef = useRef({});
    // 正在等用户回答的那个提问：{id, resolve}。函数同样进不了 items（要落 localStorage）
    const askRef = useRef(null);
    // 同一个提问的 id（state 版，驱动下面的 60 秒无操作超时 effect）
    const [askPendingId, setAskPendingId] = useState(null);
    const transcriptRef = useRef(null);
    const reasoningStartedAt = useRef(0);
    // 转录区是否「黏」在底部。往上翻过就置 false，用户自己发消息或点回底部时置回 true。
    const stickRef = useRef(true);
    const saveTimerRef = useRef(0);
    const latestRef = useRef({session: null, items: []});

    const dock = usePaletteDock(mode !== 'code' && mode !== 'full');

    // 干活的时候每秒走一格表 —— 只为「工作中 Ns」这一个数字服务（学 ZCode 的活跃计时）。
    // 闲下来就把定时器关掉，别让一个聊天面板在后台一直重渲染。
    useEffect(() => {
        if (!busy) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [busy]);

    // 会话不再每轮新建：不然没有上下文、也没法总结。首次挂载时把上次的对话读回来
    // （store 是多会话版：按 currentId 还原；没有就领一个新 id，空会话不入库）。
    const restored = useRef(null);
    if (restored.current === null) {
        const index = loadConversationIndex();
        const existing = index.currentId ? loadConversation(index.currentId) : null;
        restored.current = existing ?
            {id: index.currentId, session: existing.session, items: existing.items} :
            {id: newConversationId(), session: createSession(), items: []};
    }
    const conversationIdRef = useRef(restored.current.id);
    const sessionRef = useRef(restored.current.session);
    const [items, setItemsState] = useState(restored.current.items || []);
    // 会话累计用量（脚注命中率用）。loop 直接写在 sessionRef.current 上，这里存一份快照
    // 供渲染 —— 跟 context 一样在每轮收尾时同步。
    const [usageStats, setUsageStats] = useState(restored.current.session.usageStats || null);

    // 按「用户提交」分轮：干活的痕迹收进「已工作 Nm Ns」，收尾答复留在它下面。
    // **在处理器之前算**：改上一轮 / 分叉都要按轮把 items 切在正确的位置（见下面的 handler）。
    const turns = buildTurns(items, {now, active: busy});

    const portRef = useRef(null);
    if (!portRef.current && vm) {
        portRef.current = createScratchPort({
            vm,
            getWorkspace: () => AddonHooks.blocklyWorkspace
        });
    }

    // 会话级模型：切到一条旧会话时把它当时的模型换回来 —— 供应商、模型、思考档，
    // 连带这家自己的 baseUrl 与那一把密钥（密钥按供应商 id 存，见 settings.js）。
    // 自加的供应商被删掉了就什么都不做，别把设置换成一条不存在的线。
    const applyConversationModel = useCallback(tag => {
        if (!tag || !tag.providerId || !tag.modelId) return;
        const provider = allProviders().find(entry => entry.id === tag.providerId);
        if (!provider) return;
        setSettings(prev => saveSettings({
            ...prev,
            providerId: tag.providerId,
            modelId: tag.modelId,
            effort: tag.effort || '',
            baseUrl: provider.baseUrl,
            apiKey: loadProviderKey(tag.providerId),
            models: loadModelCache(tag.providerId, provider.baseUrl)
        }));
    }, []);

    // 开面板时把上次那条会话记着的模型换回来（只跑一次；之后由切换会话那些动作负责）
    useEffect(() => {
        const tag = restored.current && restored.current.session && restored.current.session.model;
        if (tag) applyConversationModel(tag);
    }, [applyConversationModel]);

    // 只在「用户本来就贴着底部」时才自动跟到底。往上翻看历史时，新输出绝不能把他拽下去
    // （ZCode 就是这么做的：翻上去 ⇒ 停在原地，右下角给个回底部的按钮）。
    useEffect(() => {
        const node = transcriptRef.current;
        if (!node || !stickRef.current) return;
        node.scrollTop = node.scrollHeight;
    }, [items]);

    const handleTranscriptScroll = useCallback(() => {
        const node = transcriptRef.current;
        if (!node) return;
        const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
        stickRef.current = atBottom;
        setShowJump(prev => (prev === !atBottom ? prev : !atBottom));
    }, []);

    const handleJumpToBottom = useCallback(() => {
        const node = transcriptRef.current;
        if (!node) return;
        stickRef.current = true;
        setShowJump(false);
        node.scrollTop = node.scrollHeight;
    }, []);

    // 落盘**防抖**：流式期间 items 每个 token 都变一次，每次都 JSON.stringify 整个会话再写
    // localStorage 会把主线程卡住（打字和流式一起掉帧）。攒 600ms 再写一次就够。
    useEffect(() => {
        latestRef.current = {session: sessionRef.current, items};
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = 0;
            saveConversation(conversationIdRef.current, sessionRef.current, items);
        }, 600);
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = 0;
            }
        };
    }, [items]);

    // 关页面 / 切走时把最后一段补上（防抖窗口里丢掉的那点）
    useEffect(() => () => {
        saveConversation(conversationIdRef.current, latestRef.current.session, latestRef.current.items);
    }, []);

    // 流式增量：思考和正文都往同一条 agent 条目上累加
    const appendChunk = useCallback((kind, delta) => {
        setItemsState(prev => {
            const copy = prev.slice();
            const last = copy[copy.length - 1];
            if (last && last.kind === 'agent' && last.streaming) {
                copy[copy.length - 1] = kind === 'reasoning_delta' ?
                    {
                        ...last,
                        reasoning: (last.reasoning || '') + delta,
                        // 想着呢：记下起点，「思考中 · Ns」的秒数从这里开始走
                        reasoningAt: last.reasoningAt || Date.now()
                    } :
                    {...last, text: last.text + delta};
            } else {
                copy.push(kind === 'reasoning_delta' ?
                    {
                        kind: 'agent',
                        text: '',
                        reasoning: delta,
                        reasoningAt: Date.now(),
                        streaming: true,
                        at: Date.now()
                    } :
                    {kind: 'agent', text: delta, reasoning: '', streaming: true, at: Date.now()});
            }
            return copy;
        });
    }, []);

    const onEvent = useCallback(event => {
        switch (event.type) {
        case 'chunk':
            if (!event.delta) break;
            if (event.kind === 'text_delta') {
                appendChunk('text_delta', event.delta);
            } else if (event.kind === 'reasoning_delta') {
                if (!reasoningStartedAt.current) reasoningStartedAt.current = Date.now();
                appendChunk('reasoning_delta', event.delta);
            }
            break;
        case 'assistant':
            setItemsState(prev => {
                const copy = prev.slice();
                const last = copy[copy.length - 1];
                const reasoningMs = reasoningStartedAt.current ?
                    Date.now() - reasoningStartedAt.current : 0;
                reasoningStartedAt.current = 0;
                // 这一步要不要调工具 —— 「已工作」里收的是干活的那几步（含它们的旁白），
                // 不收最后那段收尾答复
                const hasTools = !!(event.message.toolCalls && event.message.toolCalls.length);
                if (last && last.kind === 'agent' && last.streaming) {
                    copy[copy.length - 1] = {
                        ...last,
                        // 流式已经攒全文了，这里只补上流里没给的部分
                        text: last.text || event.message.content || '',
                        reasoning: last.reasoning || event.message.reasoning || '',
                        reasoningMs,
                        streaming: false,
                        hasTools,
                        // 这一步的用量（{promptTokens, completionTokens, cachedTokens, durationMs}）
                        usage: event.usage || void 0,
                        at: Date.now()
                    };
                } else if (event.message.content || event.message.reasoning) {
                    copy.push({
                        kind: 'agent',
                        text: event.message.content || '',
                        reasoning: event.message.reasoning || '',
                        reasoningMs,
                        streaming: false,
                        hasTools,
                        usage: event.usage || void 0,
                        at: Date.now()
                    });
                }
                return copy;
            });
            break;
        case 'tool-start':
            if (event.skip) skipRef.current[event.call.id] = event.skip;
            // 提问不画工具行：卡片本身就是这条调用（由 handleAsk 建，回答完也留在记录里）
            if (event.call.name === 'xce_ask_user') break;
            setItemsState(prev => prev.concat([{
                kind: 'tool',
                id: event.call.id,
                name: event.call.name,
                input: event.call.input,
                sprite: (event.call.input && event.call.input.sprite) || null,
                arg: argOf(event.call.input),
                skippable: !!event.skip,
                status: 'running',
                content: '',
                at: Date.now()
            }]));
            break;
        case 'tool-end':
            delete skipRef.current[event.call.id];
            if (event.call.name === 'xce_ask_user') {
                // 还挂着没答的提问 = 这一轮被停了：卡片冻结成「没回答」，别再让人点
                setItemsState(prev => prev.map(item => (
                    item.kind === 'ask' && !Array.isArray(item.answers) ? {...item, cancelled: true} : item
                )));
                break;
            }
            setItemsState(prev => prev.map(item => (
                item.kind === 'tool' && item.id === event.call.id ?
                    {
                        ...item,
                        status: event.result.isError ? 'failed' : 'done',
                        content: event.result.content,
                        images: event.result.images || null,
                        undo: event.result.undo || null,
                        at: Date.now()
                    } :
                    item
            )));
            // 带撤销句柄的工具就是改了积木的：立刻落一份项目快照，不等自动保存的防抖，
            // 防止「对话里说加了积木、刷新后项目却退回去」
            if (event.result && event.result.undo) saveProjectNow();
            break;
        default:
            break;
        }
    }, [appendChunk]);

    // 最后一条流式条目收尾（被中断时不会收到 assistant 事件，得手动摘掉 streaming 标记，
    // 否则下一条消息会继续往残缺的那条上追加）
    const finalizeStreaming = useCallback(() => {
        reasoningStartedAt.current = 0;
        setItemsState(prev => prev.map(item => (
            item.kind === 'agent' && item.streaming ? {...item, streaming: false} : item
        )));
    }, []);

    // 提问通道：xce_ask_user 把问题送到这儿画成卡片，这一轮就停在这儿等用户点「就这样，继续」。
    // resolve 之后工具拿到答案、模型接着往下干（见 loop.js 的 createAskToken）。
    const handleAsk = useCallback(questions => new Promise(resolve => {
        askRef.current = {id: `ask-${Date.now()}`, resolve};
        const {id} = askRef.current;
        setItemsState(prev => prev.concat([{kind: 'ask', id, questions, answers: null, at: Date.now()}]));
        setStatus('等你的回答');
        setStatusError(false);
        setAskPendingId(id);
        // 人不在跟前就敲一下：这是「AI 卡住等你」的通知，跟「干完了」分开一个 tag
        notify({
            title: 'XMUER Coding Engine · AI 在等你拿主意',
            body: questions.map(entry => entry.question).join(' / ')
                .slice(0, 80),
            tag: 'xce-ask'
        });
    }), []);

    const handleAnswer = useCallback((id, answers) => {
        const pending = askRef.current;
        askRef.current = null;
        setAskPendingId(null);
        setItemsState(prev => prev.map(item => (
            item.kind === 'ask' && item.id === id ? {...item, answers} : item
        )));
        // 已经中止的那一轮（用户先按了停止）没人等着了，答案只留在记录里
        if (pending && pending.id === id) {
            setStatus('继续中…');
            pending.resolve(answers);
        }
    }, []);

    // 提问的超时：先给 ASK_GRACE_MS 的宽限（通知把人叫回来需要时间），一有动静就提前收窄，
    // 之后按「60 秒无操作」计。超时把卡片冻成「超时未回答」，resolve(null) 让 xce_ask_user
    // 拿到「没人答」自己收尾（跟用户按停止走同一条路）。
    useEffect(() => {
        if (!askPendingId) return;
        let timer = 0;
        let inGrace = true;
        const onIdle = () => {
            const pending = askRef.current;
            if (!pending || pending.id !== askPendingId) return;
            askRef.current = null;
            setItemsState(prev => prev.map(item => (
                item.kind === 'ask' && item.id === askPendingId ? {...item, timedOut: true} : item
            )));
            setStatus('继续中…');
            setAskPendingId(null);
            pending.resolve(null);
        };
        const startIdleCountdown = () => {
            inGrace = false;
            clearTimeout(timer);
            timer = setTimeout(onIdle, ASK_IDLE_TIMEOUT_MS);
        };
        const markActive = () => startIdleCountdown();
        // 宽限：期间一有动静就进入 60 秒无操作；宽限自己到点也一样进入
        timer = setTimeout(() => {
            if (inGrace) startIdleCountdown();
        }, ASK_GRACE_MS);
        window.addEventListener('mousemove', markActive);
        window.addEventListener('pointerdown', markActive);
        window.addEventListener('keydown', markActive);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('mousemove', markActive);
            window.removeEventListener('pointerdown', markActive);
            window.removeEventListener('keydown', markActive);
        };
    }, [askPendingId]);

    // 发一轮。「改上一轮发言」之后的重发也走这里（文本由调用方给），所以它**不读输入框**。
    // 通知权限的状态提示每个页面加载只贴一次，别每次发送都刷屏。
    const notifyNoticeShownRef = useRef(false);
    const sendText = useCallback(async text => {
        const content = String(text === void 0 || text === null ? '' : text)
            .trim();
        if (!content || busy || !portRef.current) return;
        // 就趁这一下（真手势）申请网页通知权限 —— 浏览器只认用户交互里发出的请求。
        // 结果不能扔：没拿到权限时 notify 那头是静默不发（Chrome 的弹窗也只弹这一次），
        // 至少要在面板上说一声「叫不回你」。
        requestNotifyPermission().then(perm => {
            if (notifyNoticeShownRef.current || perm === 'granted' || perm === 'desktop') return;
            notifyNoticeShownRef.current = true;
            const noticeText = perm === 'denied' ?
                '浏览器的通知权限被拒了，AI 干完活没法叫你回来。想开的话点地址栏的锁图标，把「通知」改成允许。' :
                perm === 'default' ?
                    '浏览器没给通知权限（弹窗可能被关掉了），AI 干完活叫不回你；点地址栏的锁图标可以再开。' :
                    perm === 'unsupported' ? '这个浏览器不支持网页通知，AI 干完活没法叫你回来。' : '';
            if (noticeText) {
                setItemsState(prev => prev.concat([{kind: 'notice', text: noticeText}]));
            }
        });
        // 这一轮计时的起点（也是「已工作 Nm Ns」的 t0）
        const startedAt = Date.now();
        // 这一轮用的是哪个模型，跟着这条用户消息一起记下来
        const turnModel = modelTagOf(settings);
        // 提问的 id：条目与会话消息**共用同一个** —— 「改这一轮」要按它把两边切在同一处
        const messageId = newUserMessageId();
        setItemsState(prev => prev.concat([{
            kind: 'user', id: messageId, text: content, at: startedAt, model: turnModel
        }]));
        // 自己发的话必须跟到底部，哪怕刚才在往上翻
        stickRef.current = true;
        setShowJump(false);
        setShowModelMenu(false);
        setBusy(true);
        setStatus('思考中…');
        setStatusError(false);

        const port = portRef.current;
        const session = sessionRef.current;
        session.messages.push({role: 'user', content, id: messageId});
        // 会话级模型：每轮发车时刷一次 —— 中途换过模型的会话，记住的是最后用的那个
        session.model = turnModel;
        const controller = new AbortController();
        abortRef.current = controller;
        // 用户自己写的 skill 跟内置的合并成一个清单（模型那边看不出哪份是内置的，见 user-skills.js）
        const tools = createTools({port, skills: SKILLS.concat(userSkillsForModel())});
        const currentSprite = port.currentSpriteName() || '角色1';
        const useCloud = hasApiKey(settings);
        const modelMeta = resolveModel(settings) || {};
        const contextWindow = contextWindowOf(settings);
        const maxOutput = maxOutputTokensOf(settings);
        // 给模型看的自我说明书（进提示词的 <model> 块）：不硬编码，全部来自设置与目录元数据
        const modelInfo = {
            name: useCloud ? describeSettings(settings) : '本地演示模型（不是真模型）',
            supportsImage: !!modelMeta.supportsImage,
            contextWindow,
            maxOutputTokens: maxOutput
        };

        // 环境快照：不含项目内容（角色清单/代码都由 AI 用工具自己查，用户要求「不要一下子全扔进去」）
        const system = buildSystemPrompt({
            currentSprite,
            extensions: port.loadedExtensions(),
            date: new Date().toISOString()
                .slice(0, 10),
            modelInfo,
            userPrompt: settings.userPrompt,
            // 提示词里只写「桌面客户端 / 网页」两态；机器细节由 xce_read_env 现取（用户定的）
            runtime: isDesktopMode() ? 'desktop' : 'web',
            // 记忆：每轮现读一次索引 —— 用户在设置里刚改过，下一轮就该是新的
            memoryIndex: memoryIndexText(),
            // 项目级 XCEAGENT：那条注释的全文（截断与「被截了」的声明在 prompt.js 那侧做）
            projectAgent: port.readAgentNote().text,
            // 项目级 XCEMEMORY：index 注释全文（正文由 AI 按名用 xce_read_project_memory 现读）
            projectMemoryIndex: port.readMemoryIndex(),
            toolNames: tools.map(tool => tool.name)
        });

        const model = useCloud ?
            createCloudModel({
                ...settings,
                model: modelMeta,
                thinking: thinkingOf(settings.providerId, settings.modelId),
                maxOutputTokens: maxOutput
            }) :
            createScriptedModel(demoSteps(currentSprite));

        // 开跑之前先看上下文够不够，不够就总结（照 ZCode 的阈值与分段）
        if (useCloud) {
            try {
                const outcome = await maybeCompact({
                    session,
                    model,
                    contextWindow,
                    maxOutputTokens: maxOutput,
                    signal: controller.signal,
                    onEvent
                });
                if (outcome.compacted) {
                    setItemsState(prev => prev.concat([{
                        kind: 'notice',
                        text: outcome.micro ?
                            '上下文偏长，已清理较早的工具返回。' :
                            '上下文偏长，已把较早的对话总结成一段摘要。'
                    }]));
                }
                setContext(prev => ({...(prev || {}), ...outcome.measured}));
            } catch (e) {
                // 总结失败不该挡住这一轮
                // eslint-disable-next-line no-console
                console.warn('[ai] 总结失败', e);
            }
        }

        try {
            const outcome = await runTurn({
                session,
                model,
                tools,
                system,
                signal: controller.signal,
                onEvent,
                // 提问通道：模型要问就用 xce_ask_user 把问题送到面板，等用户点完再继续这一轮
                onAsk: handleAsk,
                maxSteps: maxStepsOf(settings)
            });
            // 「跑着跑着突然停了」的几种原因，都得让用户看得懂、知道下一步怎么办
            const REASONS = {
                steps: `这轮跑到了步数上限（${outcome.maxSteps} 次模型往返），我先停在这里。任务没做完的话，发一句「继续」我接着干；也可以去设置里把这个上限调大。`,
                length: '模型这轮的输出到达了单次上限，被接口掐断了。可以在设置里调大「单次最大输出」，或发「继续」让我接着说。',
                empty: '模型没有返回内容（连接可能中途断了）。重发一次试试。',
                repeat: '我在同一段内容上反复打转，已经被自动打断了 —— 这是模型卡住，不是你的项目有问题。被打断的那段没进对话记录。发「继续」我接着往下做；要是还打转，把要求说得再具体一点。'
            };
            const STATUS = {steps: '已到步数上限', length: '输出被掐断', empty: '空响应', repeat: '已打断重复输出'};
            if (outcome.reason && REASONS[outcome.reason]) {
                setItemsState(prev => prev.concat([{kind: 'notice', text: REASONS[outcome.reason]}]));
                setStatus(STATUS[outcome.reason]);
            } else {
                setStatus(useCloud ? `完成（${outcome.steps} 步）` : `本地演示完成（${outcome.steps} 步）`);
            }
            if (useCloud) {
                setContext(measure({
                    messages: session.messages,
                    contextWindow,
                    maxOutputTokens: maxOutput,
                    lastPromptTokens: session.lastPromptTokens
                }));
                setUsageStats(session.usageStats ? {...session.usageStats} : null);
            }
            // 人不在跟前才叫一声（窗口有焦点时 notify 自己会跳过）
            if (!outcome.aborted) {
                notify({
                    title: 'XMUER Coding Engine · AI 回复好了',
                    body: notifyPreview(session),
                    tag: 'xce-turn'
                });
            }
        } catch (error) {
            // 被中断（用户按了停止 / 页面被关掉）跟真出错要分开说：前者回复只是残缺，不是坏了
            const aborted = error && (error.name === 'AbortError' || /abort/i.test(error.message || ''));
            setItemsState(prev => prev.concat([{
                kind: 'notice',
                text: aborted ? '这一轮被中断了，上面的回复不完整。' : `出错了：${error.message}`
            }]));
            setStatus(aborted ? '已中断' : '出错');
            setStatusError(!aborted);
        } finally {
            finalizeStreaming();
            setBusy(false);
            abortRef.current = null;
            // 这一轮已经收口：还挂着的提问谁也不会来答了（卡片由 tool-end 冻成「没回答」）
            askRef.current = null;
            setAskPendingId(null);
        }
    }, [busy, onEvent, finalizeStreaming, handleAsk, settings]);

    const handleSend = useCallback(() => {
        const text = draft.trim();
        if (!text || busy || !portRef.current) return;
        setDraft('');
        sendText(text);
    }, [busy, draft, sendText]);

    const handleStop = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
    }, []);

    const handleKeyDown = useCallback(event => {
        if (event.key === 'Escape') {
            if (mode === 'full') {
                event.preventDefault();
                setMode('ai');
            } else if (busy) {
                event.preventDefault();
                handleStop();
            }
            return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSend();
        }
    }, [mode, busy, handleSend, handleStop]);

    // 等待类工具行上的「跳过」：令牌一响，等在那儿的工具立刻返回，模型拿到「被跳过」的结果继续
    const handleSkip = useCallback(item => {
        const token = skipRef.current[item.id];
        if (token) token.skip();
    }, []);

    const handleUndo = useCallback(async item => {
        const action = undoActionOf(item);
        if (!action || !portRef.current) return;
        await portRef.current.undoAction(action);
        setItemsState(prev => prev.map(entry => (entry === item ? {...entry, undo: null} : entry)));
        saveProjectNow();
        setStatus('已撤销');
    }, []);

    // 回退整轮：把这一轮里每个改过积木的动作**倒着**收回去（先写后删的那种，得先恢复再删，
    // 净效果才对），然后清掉全部句柄 —— 摘要行和卡片上的「撤销」跟着一起消失。
    const handleRevertTurn = useCallback(async turn => {
        const port = portRef.current;
        if (!port) return;
        const turnItems = turn.segments.reduce((all, segment) => all.concat(segment.items), []);
        const actions = turnItems.map(undoActionOf).filter(Boolean);
        if (!actions.length) return;
        for (const action of actions.slice().reverse()) {
            // eslint-disable-next-line no-await-in-loop
            await port.undoAction(action);
        }
        const done = new Set(turnItems);
        const summary = turn.changes.map(change => {
            const parts = [];
            if (change.sprites) parts.push('新增角色');
            if (change.added) parts.push(`+${change.added}`);
            if (change.removed) parts.push(`\u2212${change.removed}`);
            if (change.costumes) parts.push(`+${change.costumes} 造型`);
            const unit = change.added || change.removed ? ' 积木' : '';
            return `${change.sprite} ${parts.join(' ')}${unit}`;
        }).join('，');
        setItemsState(prev => prev
            .map(entry => (done.has(entry) ? {...entry, undo: null} : entry))
            .concat([{kind: 'notice', text: `已回退本轮变更：${summary}。`}]));
        saveProjectNow();
        setStatus('已回退本轮变更');
        // 模型那边还记着「我写过这些积木」（工具返回里写着 Wrote …）。不告诉它已经删了，
        // 下一轮它会当成还在，用户说「继续」就什么都不做了 —— 插一句话把事实对齐。
        sessionRef.current.messages.push({
            role: 'user',
            content: '[The user reverted the changes made in the previous turn: those scripts, sprites and ' +
                'costumes were removed from the project. Treat them as not existing. If the user asks for ' +
                'them again, make them again instead of assuming they are still there.]'
        });
    }, []);

    // ------------------------------------------------------------------
    // 改上一轮发言 / 分叉（都学 ZCode，见 _refstudy/zcode 的 fork-edit-retry）
    // ------------------------------------------------------------------

    // 改：**只有最后一条提问带铅笔**。这不是省事 —— 改中间那条的话，它后面几轮里模型说过的
    // 结论都已经脏了，而 Scratch 这边没有「把项目一起回滚」的机制，改了反而更难收拾。
    // 想改更早的走「分叉」：从那一轮之后另起一条对话，原对话一个字都不动。
    //
    // 跑着的时候两个动作都不给（按钮直接不出现）：这一轮还在往 items 和 session.messages 里写，
    // 中途截断会留下半截的「调用+结果」，下一轮请求直接非法。等它跑完再改，最坏多等几秒。
    const handleEditStart = useCallback(item => {
        if (busy || !item || !item.id) return;
        setEditing({id: item.id, text: item.text});
    }, [busy]);

    const handleEditCancel = useCallback(() => setEditing(null), []);

    const handleEditSubmit = useCallback(() => {
        if (!editing) return;
        const item = items.find(entry => entry.kind === 'user' && entry.id === editing.id);
        const text = String(editing.text || '').trim();
        setEditing(null);
        // 没改内容就当成取消，别白跑一轮（还要多烧一次 token）
        if (!item || !text || text === item.text) return;
        const turn = turns.find(entry => entry.user && entry.user.id === editing.id);
        // 会话那边按 id 截断。老对话被压缩过的话这条可能已经不在数组里了（见 compact.js），
        // 那就别硬改 —— 让用户直接发一句新的，别在这里猜。
        const messages = messagesBefore(sessionRef.current.messages, editing.id);
        if (!turn || !messages) {
            setStatus('这条已经被上下文压缩带走了，改不了；直接发一句新的吧');
            setStatusError(true);
            return;
        }
        sessionRef.current.messages = messages;
        setItemsState(itemsBeforeTurn(items, turn));
        setStatusError(false);
        setStatus('已按新内容重发');
        sendText(text);
    }, [editing, items, sendText, turns]);

    // 分叉：以「这一轮干完」为切点，把这段历史**复制**成一条新对话并切过去。
    // 复制不是搬家 —— 原来那条完整留在历史里，点回去就能看（跟 ZCode 的 fork 一样）。
    const handleFork = useCallback(turn => {
        if (busy || !turn || !turn.user) return;
        const index = turns.indexOf(turn);
        const next = index >= 0 && index + 1 < turns.length ? turns[index + 1].user : null;
        const messages = messagesUpTo(sessionRef.current.messages, next ? next.id : null);
        if (!messages || !messages.length) {
            setStatus('这一轮分不了叉');
            setStatusError(true);
            return;
        }
        const keptItems = itemsUpToTurn(items, turn);
        // 先按防抖窗口里可能还没落的那点尾巴把当前这条补写一把，再去列表里取它的标题
        saveConversation(conversationIdRef.current, sessionRef.current, items);
        const all = loadConversationIndex();
        const parent = all.conversations.find(entry => entry.id === conversationIdRef.current);
        const parentTitle = (parent && parent.title) || '对话';
        const newId = newConversationId();
        const forked = {...createSession(), messages, model: sessionRef.current.model || null};
        saveFork(newId, forked, keptItems, {id: conversationIdRef.current, title: parentTitle});
        conversationIdRef.current = newId;
        sessionRef.current = forked;
        setItemsState(keptItems);
        setEditing(null);
        setContext(null);
        setUsageStats(null);
        stickRef.current = true;
        setShowJump(false);
        setStatus('已分叉出新对话，原来那条还在历史里');
        setStatusError(false);
    }, [busy, items, turns]);

    // 渲染一条转录条目。用户消息不经过这里 —— 它挂在「轮」上，由分组那层画。
    const renderItem = (item, key) => {
        if (item.kind === 'notice') {
            return (<div
                className={styles.notice}
                key={key}
            >{item.text}</div>);
        }
        if (item.kind === 'ask') {
            return (
                <AskCard
                    item={item}
                    key={key}
                    onAnswer={handleAnswer}
                />
            );
        }
        if (item.kind === 'agent') {
            return (
                <div
                    className={styles.agent}
                    key={key}
                >
                    {item.reasoning ? (
                        <Thinking
                            ms={item.reasoningMs}
                            now={now}
                            startedAt={item.reasoningAt}
                            streaming={item.streaming}
                            text={item.reasoning}
                        />
                    ) : null}
                    {item.text ? (
                        <Markdown
                            styles={styles}
                            text={item.text}
                        />
                    ) : null}
                </div>
            );
        }
        return (
            <ToolCard
                item={item}
                key={key}
                onSkip={handleSkip}
                onUndo={handleUndo}
            />
        );
    };

    // 按「用户提交」分轮：干活的痕迹收进「已工作 Nm Ns」，收尾答复留在它下面
    // （turns 在组件顶部就算好了 —— 改上一轮 / 分叉要按它定位切点）

    const handleSaveSettings = useCallback(() => {
        const saved = saveSettings(settingsDraft);
        setSettings({...saved, models: settingsDraft.models || loadModelCache(saved.providerId, saved.baseUrl)});
        setShowSettings(false);
        setStatus(hasApiKey(saved) ? '已保存，使用云端模型' : '已保存（未填密钥，仍是本地演示模型）');
        setStatusError(false);
    }, [settingsDraft]);

    const handleNewConversation = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
        // 防抖窗口里可能还有没落的尾巴，先补一把再走
        saveConversation(conversationIdRef.current, sessionRef.current, latestRef.current.items);
        // 领一个新 id：旧的那条还留在库里（多会话），只是不再往里写
        conversationIdRef.current = newConversationId();
        // 新对话是空的、进不了库，但「当前位置」得落盘，不然刷新弹回上一条
        setCurrentConversation(null);
        sessionRef.current = createSession();
        setItemsState([]);
        setContext(null);
        setUsageStats(null);
        stickRef.current = true;
        setShowJump(false);
        setStatus('新对话');
        setStatusError(false);
    }, []);

    const handleClearSettings = useCallback(() => {
        const cleared = clearSettings();
        // 清的是密钥和当前设置，自己加的供应商清单留着（那不是密钥）
        const withProviders = {...cleared, customProviders: loadCustomProviders()};
        setSettings(cleared);
        setSettingsDraft(withProviders);
        setStatus('已清除');
    }, []);

    // 快捷换模型：立刻落盘（cookie / 桌面版 settings.json），**下一轮**生效 ——
    // 正在跑的那一轮用的是发车时那份设置，不受影响（跟 ZCode 一样）。
    // 可以**跨供应商**选：换家时把它自己的 baseUrl、密钥、模型缓存一起换过来。
    // 档位优先沿用用户当前选的这一档，新模型没有这档才退回它的默认档。
    const handlePickModel = useCallback((providerId, model) => {
        const provider = getProvider(providerId);
        const thinking = thinkingOf(providerId, model.id);
        const keep = providerId === settings.providerId && thinking &&
            thinking.levels.some(item => item.value === settings.effort);
        const effort = thinking ? (keep ? settings.effort : defaultEffortOf(providerId, model.id)) : '';
        const next = saveSettings({
            ...settings,
            providerId,
            modelId: model.id,
            effort,
            baseUrl: provider.baseUrl,
            // 每家一把钥匙：切过去就换上这家自己的
            apiKey: loadProviderKey(providerId),
            models: loadModelCache(providerId, provider.baseUrl)
        });
        setSettings(next);
        // 会话级：换模型立刻记在这条会话上（下一轮发车时还会再刷一次）
        if (sessionRef.current) sessionRef.current.model = modelTagOf(next);
        setShowModelMenu(false);
        setStatus(`已切到 ${provider.name} · ${model.name || model.id}`);
        setStatusError(false);
    }, [settings]);

    const handlePickEffort = useCallback(level => {
        const next = saveSettings({...settings, effort: level.value});
        setSettings(next);
        if (sessionRef.current) sessionRef.current.model = modelTagOf(next);
        setStatus(`思考强度：${level.label}`);
        setStatusError(false);
    }, [settings]);

    const openSettings = useCallback(() => {
        // 每次打开都重新读一遍自定义供应商：清单是立即落盘的，别拿一份可能过期的副本
        setSettingsDraft({...settings, customProviders: loadCustomProviders()});
        setShowSettings(true);
    }, [settings]);

    const openHistory = useCallback(() => {
        // 列表反映库里已保存的状态，先把防抖窗口里那点落下去
        saveConversation(conversationIdRef.current, sessionRef.current, latestRef.current.items);
        setConvIndex(loadConversationIndex());
        setShowSettings(false);
        setShowHistory(true);
    }, []);

    const handleOpenConversation = useCallback(id => {
        if (id === conversationIdRef.current) {
            setShowHistory(false);
            return;
        }
        if (abortRef.current) abortRef.current.abort();
        saveConversation(conversationIdRef.current, sessionRef.current, latestRef.current.items);
        const loaded = loadConversation(id);
        conversationIdRef.current = loaded ? id : newConversationId();
        // 同上：切到哪条就记住哪条（读不到就按新对话算）
        setCurrentConversation(loaded ? id : null);
        sessionRef.current = loaded ? loaded.session : createSession();
        // 会话级模型：这条旧会话记着用哪个模型就换回去
        if (loaded && loaded.session.model) applyConversationModel(loaded.session.model);
        setItemsState(loaded ? loaded.items : []);
        setContext(null);
        setUsageStats(loaded && loaded.session.usageStats ? loaded.session.usageStats : null);
        stickRef.current = true;
        setShowJump(false);
        setShowHistory(false);
        setStatus('已切换对话');
        setStatusError(false);
    }, [applyConversationModel]);

    const handleDeleteConversation = useCallback(id => {
        // 删的是正在看的这条时，deleteConversation 会把 current 落到剩下最新的一条
        const nextId = deleteConversation(id);
        if (id === conversationIdRef.current) {
            if (abortRef.current) abortRef.current.abort();
            const loaded = nextId ? loadConversation(nextId) : null;
            conversationIdRef.current = loaded ? nextId : newConversationId();
            sessionRef.current = loaded ? loaded.session : createSession();
            if (loaded && loaded.session.model) applyConversationModel(loaded.session.model);
            setItemsState(loaded ? loaded.items : []);
            setContext(null);
            stickRef.current = true;
            setShowJump(false);
            setStatus(loaded ? '已切换对话' : '新对话');
        }
        setConvIndex(loadConversationIndex());
    }, [applyConversationModel]);

    // 单条导出：历史列表每条上的「导出」。openHistory 打开列表前先落了一次盘，
    // 这里从库里原样取就行 —— 防抖窗口里那点不会漏。
    const handleExportConversation = useCallback(id => {
        const file = collectChatFile([id]);
        if (!file.conversations.length) {
            setStatus('这条对话没有可导出的内容');
            setStatusError(true);
            return;
        }
        downloadChat(file);
        setStatus('已导出这条对话（.chat.xce）');
        setStatusError(false);
    }, []);

    // 停靠位置是按积木选择框量出来的，而造型 / 声音标签页里那一格根本不存在
    // （量出来是一片 0，面板会跳到左上角压住画布）。所以只要不在「代码」页，整个面板收起来 ——
    // 连收起态那个小把钮一起收（它同样浮在画布上）。切回代码页自己就回来了，会话不丢。
    // 全屏形态例外：那是用户明确要求的铺满，而且它盖住了标签栏，本来就切不了页。
    const onCodeTab = activeTabIndex === 0;
    if (!onCodeTab && mode !== 'full') return null;

    if (mode === 'code') {
        return (
            <button
                className={styles.handle}
                onClick={() => setMode('ai')}
                style={{left: Math.max(0, dock.left + dock.width - 96), top: dock.top + 8}}
                type="button"
            >
                <Icon
                    name="panel"
                    size={13}
                /> AI 对话
            </button>
        );
    }

    const full = mode === 'full';
    const ratio = context ? context.ratio || 0 : 0;
    // 最后一条提问（只有它有铅笔，学 ZCode 的「只改最新一句」）
    let lastUser = null;
    for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].kind === 'user') {
            lastUser = items[i];
            break;
        }
    }
    // 底栏只有 ~310px 宽，「供应商 · 模型」这种全称一定被截断，只留模型名
    const modelLabel = hasApiKey(settings) ?
        ((resolveModel(settings) || {}).name || settings.modelId) : '本地演示模型';
    // 思考档位跟着模型一起显示（进面板前就知道现在是哪一档）
    const effortLevels = thinkingOf(settings.providerId, settings.modelId);
    const effortLabel = effortLevels ?
        ((effortLevels.levels.find(item => item.value === settings.effort) ||
            effortLevels.levels[effortLevels.levels.length - 1]) || {}).label : '';
    // 用量照 ZCode 的写法收成 `12.3K (6%)`，完整数字放 title 里 —— 面板太窄，别把两行数字都摊开
    const usedK = context ? (context.tokens / 1000).toFixed(1).replace(/\.0$/, '') : '';
    const windowK = Math.round(contextWindowOf(settings) / 1000);
    const contextLabel = context ? `${usedK}K (${Math.round(ratio * 100)}%)` : '';
    const contextTitle = context ? `上下文已用 ${usedK}k / ${windowK}k` : '';
    // 会话累计的缓存命中率（悬停浮层用）；没报缓存字段的请求不进分母，一个都没报就别算百分比
    const hitPct = usageStats && usageStats.promptCached > 0 ?
        Math.round(usageStats.cached / usageStats.promptCached * 100) : null;
    const usageInputRow = usageStats && usageStats.requests ? (
        hitPct === null ?
            `输入 ${fmtTokens(usageStats.prompt)} tok（缓存未报）` :
            `输入 ${fmtTokens(usageStats.prompt)} tok（命中 ${fmtTokens(usageStats.cached)} · ${hitPct}%）`
    ) : '';

    return (
        <div className={`${styles.aiRoot} ${theme && theme.isDark && theme.isDark() ? styles.aiDark : ''}`}>
            <div
                className={`${styles.panel} ${full ? styles.panelFull : ''}`}
                style={full ? null : {
                    left: dock.left,
                    top: dock.top,
                    width: dock.width,
                    height: dock.height
                }}
            >
                <div className={styles.header}>
                    <span className={`${styles.dot} ${busy ? styles.dotBusy : ''}`} />
                    <button
                        aria-label="收起面板，显示积木选择框"
                        className={styles.iconBtn}
                        onClick={() => setMode('code')}
                        title="收起面板，显示积木选择框"
                        type="button"
                    ><Icon name="panel" /></button>
                    <button
                        aria-label="新对话"
                        className={styles.iconBtn}
                        onClick={handleNewConversation}
                        title="新对话"
                        type="button"
                    ><Icon name="plus" /></button>
                    <button
                        aria-label="历史对话"
                        className={styles.iconBtn}
                        onClick={() => (showHistory ? setShowHistory(false) : openHistory())}
                        title="历史对话"
                        type="button"
                    ><Icon name="history" /></button>
                    <button
                        aria-label="设置"
                        className={styles.iconBtn}
                        onClick={() => (showSettings ? setShowSettings(false) : openSettings())}
                        title="设置"
                        type="button"
                    ><Icon name="sliders" /></button>
                    <button
                        aria-label={full ? '退出全屏' : '全屏'}
                        className={styles.iconBtn}
                        onClick={() => setMode(full ? 'ai' : 'full')}
                        title={full ? '退出全屏' : '全屏'}
                        type="button"
                    ><Icon name={full ? 'shrink' : 'expand'} /></button>
                </div>

                {showSettings ? (
                    <SettingsView
                        draft={settingsDraft}
                        onClearAll={handleClearSettings}
                        onClose={() => setShowSettings(false)}
                        onSave={handleSaveSettings}
                        setDraft={setSettingsDraft}
                    />
                ) : showHistory ? (
                    <HistoryView
                        conversations={convIndex ? convIndex.conversations : []}
                        currentId={conversationIdRef.current}
                        onClose={() => setShowHistory(false)}
                        onDelete={handleDeleteConversation}
                        onExport={handleExportConversation}
                        onNew={() => {
                            handleNewConversation();
                            setConvIndex(loadConversationIndex());
                            setShowHistory(false);
                        }}
                        onOpen={handleOpenConversation}
                    />
                ) : (
                    <React.Fragment>
                        <div className={styles.transcriptWrap}>
                            <div
                                className={styles.transcript}
                                onScroll={handleTranscriptScroll}
                                ref={transcriptRef}
                            >
                                {items.length === 0 ? (
                                    <div className={styles.empty}>
                                        <HexMark size={44} />
                                        <p
                                            className={`${styles.emptyTitle} ${mode === 'full' ?
                                                styles.emptyTitleWide : ''}`}
                                        >{greetingOf(new Date().getHours())}，想让 AI 做点什么？</p>
                                        <p className={styles.emptySub}>它能读你现在的积木、写新的脚本、跑一遍看结果对不对。</p>
                                        <ul className={styles.emptyHints}>
                                            {EMPTY_HINTS.map(hint => (
                                                <li key={hint}>
                                                    <button
                                                        className={styles.emptyHint}
                                                        onClick={() => setDraft(hint)}
                                                        type="button"
                                                    >{hint}</button>
                                                </li>
                                            ))}
                                        </ul>
                                        {hasApiKey(settings) ? null : (
                                            <p className={styles.emptyWarn}>
                                                还没填 API 密钥，现在用的是本地演示模型（固定脚本，不理解你说的话）。
                                                点右上角的设置图标填上密钥就能换成真模型。
                                            </p>
                                        )}
                                    </div>
                                ) : null}
                                {turns.map(turn => (
                                    <div
                                        className={styles.turn}
                                        key={turn.key}
                                    >
                                        {turn.user ? (
                                            editing && editing.id === turn.user.id ? (
                                                /* 就地改：气泡变成输入框（学 ZCode 的 ChatPromptEditor），
                                                   不占用底部那个输入区 —— 改的是历史，不是新的一轮 */
                                                <div className={styles.userEdit}>
                                                    <textarea
                                                        autoFocus
                                                        className={styles.userEditInput}
                                                        onChange={e => {
                                                            // React 16 的事件对象是池化的，值必须先取出来
                                                            const value = e.target.value;
                                                            setEditing(prev => ({...prev, text: value}));
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Escape') {
                                                                e.preventDefault();
                                                                handleEditCancel();
                                                            } else if (e.key === 'Enter' && !e.shiftKey) {
                                                                e.preventDefault();
                                                                handleEditSubmit();
                                                            }
                                                        }}
                                                        rows={2}
                                                        value={editing.text}
                                                    />
                                                    <div className={styles.userEditActions}>
                                                        <span className={styles.userEditHint}>{'回车重发 · Esc 取消'}</span>
                                                        <button
                                                            className={styles.msgAction}
                                                            onClick={handleEditCancel}
                                                            type="button"
                                                        >取消</button>
                                                        <button
                                                            className={`${styles.msgAction} ${styles.msgActionGo}`}
                                                            onClick={handleEditSubmit}
                                                            type="button"
                                                        >重发</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className={styles.userRow}>
                                                    <div className={styles.user}>{turn.user.text}</div>
                                                    {turn.user.id && !busy ? (
                                                        <div className={styles.userActions}>
                                                            {turn.user === lastUser ? (
                                                                <button
                                                                    aria-label="改这条并重答"
                                                                    className={styles.msgAction}
                                                                    onClick={() => handleEditStart(turn.user)}
                                                                    title="改这条提问并让 AI 重答（已经写进项目的积木不会跟着撤销）"
                                                                    type="button"
                                                                ><Icon name="pencil" /></button>
                                                            ) : null}
                                                            <button
                                                                aria-label="从这一轮分叉"
                                                                className={styles.msgAction}
                                                                onClick={() => handleFork(turn)}
                                                                title="从这一轮分叉出新对话（这条对话一个字都不动，原样留在历史里）"
                                                                type="button"
                                                            ><Icon name="fork" /></button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )
                                        ) : null}
                                        {turn.segments.map((segment, segmentIndex) => {
                                            const key = `${turn.key}-${segmentIndex}`;
                                            const body = segment.items
                                                .map((item, i) => renderItem(item, `${key}-${i}`));
                                            if (segment.type !== 'work') {
                                                return <React.Fragment key={key}>{body}</React.Fragment>;
                                            }
                                            const duration = formatWorkDuration(turn.durationMs);
                                            const label = turn.running ?
                                                `工作中${duration ? ` ${duration}` : '…'}` :
                                                duration ? `已工作 ${duration}` : '已处理';
                                            return (
                                                <WorkGroup
                                                    defaultOpen={turn.running || !turn.hasAnswer}
                                                    key={key}
                                                    label={label}
                                                    live={turn.running}
                                                    meta={turn.user && turn.user.model ?
                                                        turn.user.model.label : ''}
                                                >
                                                    {body}
                                                </WorkGroup>
                                            );
                                        })}
                                        {/* 这轮动了积木才出现；还在跑的时候不显示（数字会一直跳），
                                            干完了才落一条定稿的出来 */}
                                        {turn.changes.length && !turn.running ? (
                                            <TurnChanges
                                                changes={turn.changes}
                                                onRevert={() => handleRevertTurn(turn)}
                                            />
                                        ) : null}
                                        {/* 这轮烧了多少 token（学 ZCode 的回合脚注）。还在跑的不显示，等定稿 */}
                                        {turn.usage && !turn.running ? (
                                            <div className={styles.turnUsage}>
                                                {formatTurnUsage(turn.usage)}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                            {showJump ? (
                                <button
                                    className={styles.jump}
                                    onClick={handleJumpToBottom}
                                    type="button"
                                >↓ 回到底部</button>
                            ) : null}
                        </div>
                        <div className={styles.composer}>
                            {/* 换模型 / 调思考档位的快捷面板（点面板外面就收起） */}
                            {showModelMenu ? (
                                <React.Fragment>
                                    <div
                                        className={styles.menuBackdrop}
                                        onClick={() => setShowModelMenu(false)}
                                    />
                                    <ModelMenu
                                        onClose={() => setShowModelMenu(false)}
                                        onEffort={handlePickEffort}
                                        onPick={handlePickModel}
                                        onOpenSettings={() => {
                                            setShowModelMenu(false);
                                            openSettings();
                                        }}
                                        settings={settings}
                                    />
                                </React.Fragment>
                            ) : null}
                            {/* 输入框是一个描边的圆角盒子（学 ZCode）：聚焦时边框转强调色，
                                模型 / 用量 / 发送都收进盒子里；状态那行挂在盒子**外面**下方，
                                免得它一变化就把输入框顶上去。 */}
                            <div className={styles.inputBox}>
                                <textarea
                                    className={styles.input}
                                    onChange={e => setDraft(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="让 AI 写积木，例如：做个数到 10 的计数器"
                                    value={draft}
                                />
                                <div className={styles.bar}>
                                    <button
                                        className={styles.modelBtn}
                                        onClick={() => setShowModelMenu(v => !v)}
                                        title="换模型 / 思考强度"
                                        type="button"
                                    >
                                        <span className={styles.modelBtnText}>{modelLabel}</span>
                                        {effortLabel ? (
                                            <span className={styles.effortBadge}>{effortLabel}</span>
                                        ) : null}
                                        <Icon
                                            name="chevron"
                                            size={11}
                                        />
                                    </button>
                                    {context ? (
                                        <span className={styles.ctxWrap}>
                                            <span
                                                className={`${styles.ctx} ${ratio > 0.75 ? styles.ctxWarn : ''}`}
                                                title={contextTitle}
                                            >
                                                {contextLabel}
                                            </span>
                                            {/* 悬停展开会话累计（学 ZCode）：次数 / 输入含命中率 / 输出 */}
                                            {usageStats && usageStats.requests ? (
                                                <span className={styles.ctxPop}>
                                                    <span className={styles.ctxPopTitle}>
                                                        {`本会话累计 · ${usageStats.requests} 次请求`}
                                                    </span>
                                                    <span className={styles.ctxPopRow}>
                                                        {usageInputRow}
                                                    </span>
                                                    <span className={styles.ctxPopRow}>
                                                        {`输出 ${fmtTokens(usageStats.completion)} tok`}
                                                    </span>
                                                </span>
                                            ) : null}
                                        </span>
                                    ) : null}
                                    {busy ? (
                                        <button
                                            aria-label="停止"
                                            className={`${styles.send} ${styles.sendStop}`}
                                            onClick={handleStop}
                                            title="停止（Esc）"
                                            type="button"
                                        ><Icon name="stop" /></button>
                                    ) : (
                                        <button
                                            aria-label="发送"
                                            className={styles.send}
                                            disabled={!draft.trim() || !portRef.current}
                                            onClick={handleSend}
                                            title="发送（Enter）"
                                            type="button"
                                        ><Icon name="send" /></button>
                                    )}
                                </div>
                            </div>
                            <div className={`${styles.statusBar} ${statusError ? styles.statusError : ''}`}>
                                {status}
                            </div>
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
};

AIPanel.propTypes = {
    activeTabIndex: PropTypes.number,
    theme: PropTypes.object,
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    // 拿不到就按「代码页」算（宁可多显示，也别因为 store 还没挂上就把面板藏了）
    activeTabIndex: state.scratchGui && state.scratchGui.editorTab ?
        state.scratchGui.editorTab.activeTabIndex : 0,
    // 编辑器主题（`Theme` 实例，见 src/lib/themes/index.js）：深色主题下面板要跟着变深
    theme: state.scratchGui && state.scratchGui.theme ? state.scratchGui.theme.theme : null,
    vm: state.scratchGui && state.scratchGui.vm
});

export default connect(mapStateToProps)(AIPanel);
