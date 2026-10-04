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
import {createSession} from './session.js';
import {runTurn, maxStepsOf, STEP_LIMITS} from './loop.js';
import {createScriptedModel, demoSteps} from './model.js';
import {
    createCloudModel, fetchProviderModels, PROVIDERS, getProvider, resolveModel,
    contextWindowOf, maxOutputTokensOf, thinkingOf
} from './providers.js';
import {
    loadSettings, saveSettings, clearSettings, describeSettings, hasApiKey,
    loadModelCache, saveModelCache
} from './settings.js';
import {buildSystemPrompt, WARN_AT} from './prompt.js';
import {maybeCompact, measure} from './compact.js';
import {buildTurns, formatWorkDuration, undoActionOf} from './turns.js';
import {Markdown} from './markdown.jsx';
import {
    loadConversation, saveConversation, newConversationId, loadConversationIndex,
    deleteConversation, setCurrentConversation, DROPPED_NOTE
} from './store.js';
import {saveProjectNow} from '../project-persistence.jsx';
import styles from './ai.css';

// 量不到积木选择框大小时的兜底
const DOCK_FALLBACK = {left: 0, top: 96, width: 316, height: 520};

// 工具名 -> 界面上给人看的中文
const TOOL_LABELS = {
    xce_list_sprites: '列出角色',
    xce_read_project: '读取积木',
    xce_write_script: '写入积木',
    xce_delete_script: '删除脚本',
    xce_run_project: '运行项目',
    xce_read_state: '读取状态',
    xce_read_stage: '截取舞台',
    xce_get_time: '获取时间',
    xce_time: '等待',
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
    history: ['M8 2.5A5.5 5.5 0 1 0 8 13.5A5.5 5.5 0 1 0 8 2.5', 'M8 5v3.2l2.3 1.6']
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

const Thinking = ({text, streaming, ms, startedAt, now}) => {
    // 默认**折叠**（学 ZCode / Codex）：只在标题行报「想了多久」，想看再点开。
    // 别在流式期间自动摊开 —— 那样答案还没出来就先刷一大片灰字，反而挡着正文。
    const [open, setOpen] = useState(false);
    const label = streaming ?
        `思考中 · ${thinkSeconds({streaming, startedAt, now})}s` :
        (ms ? `思考过程 · 共 ${thinkSeconds({ms})}s` : '思考过程');
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
// 工具卡
// ---------------------------------------------------------------------------

// 工具卡。
//
// 形状学 ZCode：**不做卡片**（无边框、无底色），就是一行灰字 —— 一行标题（带参数）+ 可展开的细节。
// 几条硬规矩：
//   - **不显示耗时**（用户明确要求去掉）；
//   - 成功不画对勾、不写「完成」，行本身安静下来就是成功（只有失败要留颜色）；
//   - **干活期间一律摊开**（live：这一轮还在跑）—— AI 写积木的过程要看得见，
//     整轮结束了才跟着「已工作」那条一起收起来（学 ZCode 的 autoOpen / autoCollapseOnComplete）；
//   - 失败自动摊开（错误必须被看见）；跑的时候行首转一个小圈。
// 撤消按钮**放在行上**而不是藏在展开区里 —— 藏起来等于没有。
const ToolCard = ({item, live, onUndo, onSkip}) => {
    const failed = item.status === 'failed';
    const running = item.status === 'running';
    // 用户自己点开过就一直开着（defaultOpen 不变时下面的 effect 不会去动它）
    const defaultOpen = failed || live;
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
    live: PropTypes.bool,
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
const WorkGroup = ({label, live, defaultOpen, children}) => {
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
            </button>
            {open ? <div className={styles.workBody}>{children}</div> : null}
        </div>
    );
};

WorkGroup.propTypes = {
    children: PropTypes.node,
    defaultOpen: PropTypes.bool,
    label: PropTypes.string,
    live: PropTypes.bool
};

// ---------------------------------------------------------------------------
// 本轮变更（+N / −M 积木 · 回退本轮变更）
// ---------------------------------------------------------------------------

// 一轮干完，在答复下面挂一行「这轮动了哪些角色的几块积木」（学 ZCode 的每轮变更卡片：
// 只在真有改动时出现，加用绿、减用红，其余一律灰）。
//
// 「回退本轮变更」删的是积木，误点一下整轮的活儿就没了 —— 所以沿用历史列表那套两段式确认：
// 点一下只是进入待确认（按钮变红），两三秒没人理就自己退回去。
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
                    {change.added ? <span className={styles.changePlus}>{`+${change.added}`}</span> : null}
                    {change.removed ? <span className={styles.changeMinus}>{`\u2212${change.removed}`}</span> : null}
                    <span className={styles.changeUnit}>积木</span>
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
const ModelMenu = ({settings, onClose, onEffort, onModel, onOpenSettings}) => {
    const provider = getProvider(settings.providerId);
    const [query, setQuery] = useState('');
    const all = modelsOf(settings.providerId, settings.baseUrl, settings.models);
    const needle = query.trim().toLowerCase();
    const shown = needle ? all.filter(model => {
        const name = String(model.name || '').toLowerCase();
        return model.id.toLowerCase().includes(needle) || name.includes(needle);
    }) : all;
    const thinking = thinkingOf(settings.providerId, settings.modelId);
    const level = thinking && (thinking.levels.find(item => item.value === settings.effort) ||
        thinking.levels[thinking.levels.length - 1]);
    return (
        <div className={styles.modelMenu}>
            <div className={styles.modelMenuHead}>
                <span className={styles.modelMenuTitle}>{`模型 · ${provider.name}`}</span>
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
            {all.length > 6 ? (
                <input
                    className={styles.modelMenuSearch}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Escape') onClose();
                    }}
                    placeholder="按名字筛一下…"
                    value={query}
                />
            ) : null}
            <div className={styles.modelMenuList}>
                {shown.length === 0 ? (
                    <div className={styles.modelsEmpty}>没有匹配的模型。</div>
                ) : null}
                {shown.map(model => (
                    <button
                        className={`${styles.modelRow} ${
                            model.id === settings.modelId ? styles.modelRowOn : ''}`}
                        key={model.id}
                        onClick={() => onModel(model)}
                        type="button"
                    >
                        <span className={styles.modelTick}>
                            {model.id === settings.modelId ? <Icon
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
                            <span className={styles.tag}>{Math.round(model.contextWindow / 1024)}k</span> : null}
                    </button>
                ))}
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
    onModel: PropTypes.func.isRequired,
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

const SettingsView = ({draft, setDraft, onClose, onSave, onClearAll}) => {
    const provider = getProvider(draft.providerId);
    // 占位符里显示的「自动」值 = 目录/拉取清单里声明的元数据（不算用户覆盖）
    const draftModel = resolveModel(draft) || {};
    const [models, setModels] = useState(() => loadModelCache(draft.providerId, provider.baseUrl));
    const [fetching, setFetching] = useState(false);
    const [fetchError, setFetchError] = useState('');
    const [query, setQuery] = useState('');

    // 一份清单：预设在前（人工挑过、带说明），拉回来的在后（可能有几十上百条）
    const all = modelsOf(draft.providerId, draft.baseUrl, models);
    const needle = query.trim().toLowerCase();
    const matches = model => {
        const name = String(model.name || '').toLowerCase();
        return model.id.toLowerCase().includes(needle) || name.includes(needle);
    };
    const shown = needle ? all.filter(matches) : all;
    const thinking = thinkingOf(draft.providerId, draft.modelId) || provider.thinking;

    const handleProvider = event => {
        const providerId = event.target.value;
        const next = getProvider(providerId);
        const cached = loadModelCache(providerId, next.baseUrl);
        const first = cached[0] || next.models[0];
        setModels(cached);
        setFetchError('');
        setDraft(prev => ({
            ...prev,
            providerId,
            baseUrl: next.baseUrl,
            modelId: first ? first.id : '',
            effort: first ? defaultEffortOf(providerId, first.id) : ''
        }));
    };

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
                <label className={styles.field}>
                    <span className={styles.fieldLabel}>供应商</span>
                    <select
                        className={styles.fieldSelect}
                        onChange={handleProvider}
                        value={draft.providerId}
                    >
                        {PROVIDERS.map(p => (<option
                            key={p.id}
                            value={p.id}
                        >{p.name}</option>))}
                    </select>
                    <span className={styles.fieldNote}>{provider.note}</span>
                </label>

                {draft.providerId === 'custom' || draft.providerId === 'ollama' ? (
                    <label className={styles.field}>
                        <span className={styles.fieldLabel}>base_url</span>
                        <input
                            className={styles.fieldInput}
                            onChange={e => {
                                const value = e.target.value;
                                setDraft(prev => ({...prev, baseUrl: value}));
                            }}
                            placeholder="https://your-gateway/v1"
                            value={draft.baseUrl}
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
                        只存在你浏览器的 cookie 里，请求直连供应商，不经过本站服务器。
                    </span>
                </label>

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
                        {`单次最大输出（token，留空 = 自动，模型声明 ${draftModel.maxOutputTokens || '未知'}）`}
                    </span>
                    <input
                        className={styles.fieldInput}
                        inputMode="numeric"
                        min="1"
                        onChange={e => {
                            const value = e.target.value;
                            setDraft(prev => ({...prev, maxOutputTokens: value === '' ? void 0 : Number(value)}));
                        }}
                        placeholder={`自动（${draftModel.maxOutputTokens || '未知'}）`}
                        type="number"
                        value={draft.maxOutputTokens || ''}
                    />
                    <span className={styles.fieldNote}>
                        上限会随请求发给供应商（max_tokens），输出到上限就停，防止一口气输出到失控。
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
                        {`一次提问里我最多能来回几轮（查资料 → 写积木 → 跑 → 查状态算好几轮）。填小了省 token，但复杂任务可能半路停住；剩 ${WARN_AT} 次时我会收到提醒并收尾。`}
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

                <div className={styles.rowButtons}>
                    <button
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={onSave}
                        type="button"
                    >保存</button>
                    <button
                        className={styles.btn}
                        onClick={onClearAll}
                        type="button"
                    >清除密钥</button>
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

const formatListTime = ts => {
    if (!ts) return '';
    const d = new Date(ts);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.toDateString() === new Date().toDateString()) return hm;
    return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};

const HistoryItem = ({conversation, current, onOpen, onDelete}) => {
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
                <span className={styles.historyItemTitle}>{conversation.title}</span>
                <span className={styles.historyItemMeta}>
                    {formatListTime(conversation.updatedAt)}
                </span>
            </button>
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
    onDelete: PropTypes.func.isRequired
};

const HistoryView = ({conversations, currentId, onClose, onDelete, onNew, onOpen}) => (
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
    onNew: PropTypes.func.isRequired,
    onOpen: PropTypes.func.isRequired
};

// ---------------------------------------------------------------------------
// 面板
// ---------------------------------------------------------------------------

const AIPanel = ({vm, activeTabIndex = 0}) => {
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
    const [settingsDraft, setSettingsDraft] = useState(() => loadSettings());
    const [context, setContext] = useState(null);
    const [showJump, setShowJump] = useState(false);
    // 「工作中 Ns」要每秒跳一格。只在忙的时候开这个表，闲时不许有任何定时器。
    const [now, setNow] = useState(() => Date.now());
    const abortRef = useRef(null);
    // 正在执行的等待类工具 -> 它的「跳过」令牌（函数不能进 items：那些条目要序列化进 localStorage）
    const skipRef = useRef({});
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

    const portRef = useRef(null);
    if (!portRef.current && vm) {
        portRef.current = createScratchPort({
            vm,
            getWorkspace: () => AddonHooks.blocklyWorkspace
        });
    }

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
                        at: Date.now()
                    });
                }
                return copy;
            });
            break;
        case 'tool-start':
            if (event.skip) skipRef.current[event.call.id] = event.skip;
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

    const handleSend = useCallback(async () => {
        const text = draft.trim();
        if (!text || busy || !portRef.current) return;
        setDraft('');
        // 这一轮计时的起点（也是「已工作 Nm Ns」的 t0）
        const startedAt = Date.now();
        setItemsState(prev => prev.concat([{kind: 'user', text, at: startedAt}]));
        // 自己发的话必须跟到底部，哪怕刚才在往上翻
        stickRef.current = true;
        setShowJump(false);
        setShowModelMenu(false);
        setBusy(true);
        setStatus('思考中…');
        setStatusError(false);

        const port = portRef.current;
        const session = sessionRef.current;
        session.messages.push({role: 'user', content: text});
        const controller = new AbortController();
        abortRef.current = controller;
        const tools = createTools({port, skills: SKILLS});
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
        }
    }, [busy, draft, onEvent, finalizeStreaming, settings]);

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
            if (change.added) parts.push(`+${change.added}`);
            if (change.removed) parts.push(`\u2212${change.removed}`);
            return `${change.sprite} ${parts.join(' ')} 积木`;
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
            content: '[The user reverted the changes made in the previous turn: those scripts were ' +
                'removed from the project. Treat them as not existing. If the user asks for them ' +
                'again, write them again instead of assuming they are still there.]'
        });
    }, []);

    // 渲染一条转录条目。用户消息不经过这里 —— 它挂在「轮」上，由分组那层画。
    // live = 这条属于还在跑的那一轮：工具行据此在干活期间摊开（见 ToolCard）。
    const renderItem = (item, key, live) => {
        if (item.kind === 'notice') {
            return (<div
                className={styles.notice}
                key={key}
            >{item.text}</div>);
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
                live={live}
                onSkip={handleSkip}
                onUndo={handleUndo}
            />
        );
    };

    // 按「用户提交」分轮：干活的痕迹收进「已工作 Nm Ns」，收尾答复留在它下面
    const turns = buildTurns(items, {now, active: busy});

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
        stickRef.current = true;
        setShowJump(false);
        setStatus('新对话');
        setStatusError(false);
    }, []);

    const handleClearSettings = useCallback(() => {
        const cleared = clearSettings();
        setSettings(cleared);
        setSettingsDraft(cleared);
        setStatus('已清除');
    }, []);

    // 快捷换模型：立刻落盘（cookie / 桌面版 settings.json），**下一轮**生效 ——
    // 正在跑的那一轮用的是发车时那份设置，不受影响（跟 ZCode 一样）。
    // 档位优先沿用用户当前选的这一档，新模型没有这档才退回它的默认档。
    const handlePickModel = useCallback(model => {
        const thinking = thinkingOf(settings.providerId, model.id);
        const keep = thinking && thinking.levels.some(item => item.value === settings.effort);
        const effort = keep ? settings.effort : defaultEffortOf(settings.providerId, model.id);
        setSettings(saveSettings({...settings, modelId: model.id, effort}));
        setShowModelMenu(false);
        setStatus(`已切到 ${model.name || model.id}`);
        setStatusError(false);
    }, [settings]);

    const handlePickEffort = useCallback(level => {
        setSettings(saveSettings({...settings, effort: level.value}));
        setStatus(`思考强度：${level.label}`);
        setStatusError(false);
    }, [settings]);

    const openSettings = useCallback(() => {
        setSettingsDraft({...settings});
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
        setItemsState(loaded ? loaded.items : []);
        setContext(null);
        stickRef.current = true;
        setShowJump(false);
        setShowHistory(false);
        setStatus('已切换对话');
        setStatusError(false);
    }, []);

    const handleDeleteConversation = useCallback(id => {
        // 删的是正在看的这条时，deleteConversation 会把 current 落到剩下最新的一条
        const nextId = deleteConversation(id);
        if (id === conversationIdRef.current) {
            if (abortRef.current) abortRef.current.abort();
            const loaded = nextId ? loadConversation(nextId) : null;
            conversationIdRef.current = loaded ? nextId : newConversationId();
            sessionRef.current = loaded ? loaded.session : createSession();
            setItemsState(loaded ? loaded.items : []);
            setContext(null);
            stickRef.current = true;
            setShowJump(false);
            setStatus(loaded ? '已切换对话' : '新对话');
        }
        setConvIndex(loadConversationIndex());
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

    return (
        <div className={styles.aiRoot}>
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
                                        <p className={styles.emptyTitle}>让 AI 直接改这个项目</p>
                                        <p>它能读你现在的积木、写新的脚本、跑一遍看结果对不对。</p>
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
                                    <React.Fragment key={turn.key}>
                                        {turn.user ? (
                                            <div className={styles.user}>{turn.user.text}</div>
                                        ) : null}
                                        {turn.segments.map((segment, segmentIndex) => {
                                            const key = `${turn.key}-${segmentIndex}`;
                                            const body = segment.items
                                                .map((item, i) => renderItem(item, `${key}-${i}`, turn.running));
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
                                    </React.Fragment>
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
                                        onModel={handlePickModel}
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
                                        <span
                                            className={`${styles.ctx} ${ratio > 0.75 ? styles.ctxWarn : ''}`}
                                            title={contextTitle}
                                        >
                                            {contextLabel}
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
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    // 拿不到就按「代码页」算（宁可多显示，也别因为 store 还没挂上就把面板藏了）
    activeTabIndex: state.scratchGui && state.scratchGui.editorTab ?
        state.scratchGui.editorTab.activeTabIndex : 0,
    vm: state.scratchGui && state.scratchGui.vm
});

export default connect(mapStateToProps)(AIPanel);
