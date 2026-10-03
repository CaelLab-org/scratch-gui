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

// ---------- 1.5 语言规矩：回答跟用户走，思考用英文 ----------
check('回答语言跟着用户走（不再写死中文）', /Answer in the language the user writes in/.test(plain));
check('思考一律英文', /Think in English/.test(plain));
check('不再硬性要求中文回答', !/Always reply in Chinese/.test(plain));
check('中文里仍叫「角色」不叫「精灵」', plain.includes('「角色」') && plain.includes('「精灵」'));

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
