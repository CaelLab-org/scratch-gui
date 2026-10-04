// 系统提示词的无头自测：身份注入 + 用户自定义提示词的拼接
// 用法：node src/playground/ai/prompt.test.mjs
/* eslint-disable no-console */
import {buildSystemPrompt, buildStepBudget} from './prompt.js';

const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

const base = {
    projectSummary: '  - 角色1：2 段脚本',
    currentSprite: '角色1',
    extensions: ['pen'],
    date: '2026-10-04'
};

// ---------- 1. 身份注入 ----------
const plain = buildSystemPrompt(base);
check('认领 XMUER Coding Engine', plain.includes('XMUER Coding Engine'));
check('写明基于 Scratch（TurboWarp fork）', /based on Scratch/.test(plain) && /TurboWarp/.test(plain));
check('环境快照在提示词里', plain.includes('<current-sprite>角色1</current-sprite>') && plain.includes('<date>2026-10-04</date>'));
check('工具面说死（六个工具都点到）',
    ['xce_read_project', 'xce_write_script', 'xce_delete_script', 'xce_run_project', 'xce_read_state', 'xce_read_stage']
        .every(name => plain.includes(name)));

// ---------- 1.2 运行环境：只有「桌面客户端 / 网页」两态，机器细节不进提示词 ----------
check('环境快照里带运行时那一行',
    /<runtime[^>]*>/.test(plain) && plain.includes('</runtime>'),
    (plain.match(/<runtime[^>]*>([^<]*)/) || [])[1]);
check('没说 runtime 时当网页版（老调用点不变）',
    /The web version of XCE, running inside a browser page/.test(plain));
const desktop = buildSystemPrompt({...base, runtime: 'desktop'});
check('桌面版写的是客户端、并且点名不是浏览器页',
    /XCE Desktop/.test(desktop) && /not a browser page/.test(desktop) &&
        !/running inside a browser page/.test(desktop));
check('两种取值都指向 xce_read_env 拿机器信息',
    plain.includes('xce_read_env') && desktop.includes('xce_read_env') &&
        /Machine info|operating system, app or browser version/.test(plain));

// ---------- 1.5 语言规矩：回答跟用户走，思考用英文 ----------
check('回答语言跟着用户走（不再写死中文）', /Answer in the language the user writes in/.test(plain));
check('思考一律英文', /Think in English/.test(plain));
check('不再硬性要求中文回答', !/Always reply in Chinese/.test(plain));
check('中文里仍叫「角色」不叫「精灵」', plain.includes('「角色」') && plain.includes('「精灵」'));

// ---------- 1.55 XCE 风格段：建议而非规矩，允许 AI 自由发挥 ----------
check('XCE 风格段存在且点名生态（CaelLabSearch 等）',
    plain.includes('XCE style') && plain.includes('CaelLabSearch') && plain.includes('虚舟实验室'));
check('风格段写明是建议、用户意愿优先',
    plain.includes('a suggestion, not a rule') && /user's wishes come first/.test(plain));

// ---------- 1.6 链接写法（裸链接会一路吞掉后面的中文，提示词里必须点明） ----------
check('要求写成 markdown 链接形式',
    /Write links in the markdown form/.test(plain) && plain.includes('[what the page is](https://example.com/a)'));
check('说明裸链接会把后面的字一起吞进链接', /keeps swallowing whatever follows it/.test(plain));

// 没写自定义提示词就不许出现分隔标记
check('没有自定义提示词时不留空分隔块', !plain.includes('[End of system prompt]'));

// ---------- 2. 用户自定义提示词的拼法 ----------
const custom = buildSystemPrompt({...base, userPrompt: '回答别超过三句话'});
const marker = '[End of system prompt]';
check('用户提示词前有分隔标记', custom.includes(marker));
check('分隔标记在系统提示词之后',
    custom.indexOf(marker) > custom.indexOf('</environment>'),
    `marker@${custom.indexOf(marker)} env@${custom.indexOf('</environment>')}`);
check('用户提示词原文保留', custom.includes('回答别超过三句话'));

// 分隔后的那段必须逐字是约定的那句（模型普遍认得这种写法）
const tail = custom.slice(custom.indexOf(marker));
check('分隔后的引导语逐字正确',
    tail.startsWith(`${marker}\n---\nThe following are the rules and prompts set by the user for the Agent:\n回答别超过三句话`),
    JSON.stringify(tail.slice(0, 120)));
check('末尾声明用户规矩改不了工具与写入约束',
    /cannot change which tools you have/.test(tail) && /constraints on what you may write/.test(tail));

// ---------- 3. 空白输入要当成没写 ----------
check('全是空白等于没写', !buildSystemPrompt({...base, userPrompt: '   \n  '}).includes(marker));
check('undefined 不炸', !buildSystemPrompt({...base, userPrompt: void 0}).includes(marker));
check('多行提示词原样保留',
    buildSystemPrompt({...base, userPrompt: '第一行\n第二行'}).includes('第一行\n第二行'));

// ---------- 3.5 项目级 XCEAGENT：没有就给创建说明，有就带全文，拼在用户规矩下面 ----------
check('没有 XCEAGENT 时给出创建说明（模型得知道有这条路）',
    plain.includes('no 「XCEAGENT」 sprite yet') && plain.includes('xce_write_agent'));
const withAgent = buildSystemPrompt({...base, userPrompt: '用户规矩在此', projectAgent: '本项目角色都用动物命名'});
check('有 XCEAGENT 时携带全文', withAgent.includes('本项目角色都用动物命名'));
check('项目级说明拼在用户规矩下面',
    withAgent.indexOf('用户规矩在此') < withAgent.indexOf('本项目角色都用动物命名'));
check('项目级说明用数据块包着',
    withAgent.includes('<project-agent-note>') && withAgent.includes('</project-agent-note>'));
check('说明里点明整条重写而不是围着改', withAgent.includes('rewrite the whole comment'));
check('全是空白等于没有（回到创建说明）',
    !buildSystemPrompt({...base, projectAgent: '  \n '}).includes('<project-agent-note>'));
check('undefined 不炸', !buildSystemPrompt({...base, projectAgent: void 0}).includes('<project-agent-note>'));

// 超长要明说截断：只带前 20K、报总长、指向 xce_read_agent（也提了建议用户精简）—— 用户定的老规矩
const longNote = '甲'.repeat(25000);
const longAgent = buildSystemPrompt({...base, projectAgent: longNote});
check('超长说明声明截断并报总长',
    longAgent.includes('longer than the prompt carries') && longAgent.includes('25000'));
check('截断说明指向 xce_read_agent，也提了精简',
    longAgent.includes('xce_read_agent') && longAgent.includes('xce_write_agent'));
const noteBlock = longAgent.slice(
    longAgent.indexOf('<project-agent-note>'), longAgent.indexOf('</project-agent-note>'));
check('提示词里只带前 20K',
    noteBlock.includes('甲'.repeat(20000)) && !noteBlock.includes('甲'.repeat(20001)));
check('未截断时不喊截断',
    !buildSystemPrompt({...base, projectAgent: '短说明'}).includes('longer than the prompt carries'));

// ---------- 3.6 项目级 XCEMEMORY：index 进上下文（老规矩截断），正文按名现读 ----------
check('没有项目记忆时给创建说明',
    plain.includes('no project-level memory yet') && plain.includes('xce_write_project_memory'));
const withIdx = buildSystemPrompt({...base, projectMemoryIndex: '- 登录方式 — 走 CaelLabID'});
check('有索引时带全文并用数据块包着',
    withIdx.includes('- 登录方式 — 走 CaelLabID') &&
  withIdx.includes('<project-memory-index') && withIdx.includes('</project-memory-index>'));
check('项目记忆段在 XCEAGENT 段后面',
    withIdx.indexOf('Project agent note (XCEAGENT)') < withIdx.indexOf('Project memory (XCEMEMORY)'));
check('索引说明指向按名读正文', withIdx.includes('xce_read_project_memory'));
check('索引空白等于没有（回到创建说明）',
    !buildSystemPrompt({...base, projectMemoryIndex: ' \n '}).includes('<project-memory-index>'));
const longIdx = buildSystemPrompt({...base, projectMemoryIndex: '乙'.repeat(25000)});
check('索引超长明说截断、报总长、指向 xce_read_notes',
    longIdx.includes('longer than the prompt carries') && longIdx.includes('25000') &&
  longIdx.includes('xce_read_notes'));
const idxBlock = longIdx.slice(
    longIdx.indexOf('<project-memory-index'), longIdx.indexOf('</project-memory-index>'));
check('索引只带前 20K',
    idxBlock.includes('乙'.repeat(20000)) && !idxBlock.includes('乙'.repeat(20001)));

// ---------- 4. 往返预算提醒：平时不说，剩 3 次起才说 ----------
check('轮次宽裕时一个字都不发', buildStepBudget({step: 1, maxSteps: 30}) === '' &&
    buildStepBudget({step: 27, maxSteps: 30}) === '' &&
    buildStepBudget({step: 1, maxSteps: 5}) === '');
const warn3 = buildStepBudget({step: 28, maxSteps: 30});
check('剩 3 次开始提醒，并写清还剩几次',
    /including this one: 3/.test(warn3) && /allows 30 round-trips/.test(warn3),
    warn3.split('\n')[1]);
check('提醒是给模型的数据块，也说明不进历史',
    warn3.startsWith('<turn-budget') && /not kept in history/.test(warn3));
check('只剩 1 次时把话说死',
    /This is the last round-trip/.test(buildStepBudget({step: 30, maxSteps: 30})) &&
    !/This is the last round-trip/.test(buildStepBudget({step: 29, maxSteps: 30})));
check('上限越小提醒来得越早（跟着用户设置走）',
    buildStepBudget({step: 3, maxSteps: 5}) !== '' && buildStepBudget({step: 6, maxSteps: 10}) === '' &&
    buildStepBudget({step: 8, maxSteps: 10}) !== '');
check('边界不炸', buildStepBudget({}) === '' && buildStepBudget() === '');

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
