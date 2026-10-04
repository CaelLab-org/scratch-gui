// memory.js / user-skills.js 的无头自测（两个都是「本地表 + 上限」的小模块，放一个文件里测）
// 用法：node src/playground/ai/memory.test.mjs
/* eslint-disable no-console, no-undef */
import {
    MEMORY_TYPES, MEMORY_LIMITS, loadMemories, findMemory, saveMemory, deleteMemory,
    memoryIndexText, clearMemories
} from './memory.js';
import {
    USER_SKILL_LIMITS, loadUserSkills, userSkillsForModel, saveUserSkill, deleteUserSkill,
    skillNameConflict, isValidSkillName, clearUserSkills
} from './user-skills.js';

let failed = 0;
const check = (name, ok, extra = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${extra ? `  ${extra}` : ''}`);
    if (!ok) failed++;
};

// ---------------------------------------------------------------- 记忆：基本存取
clearMemories();
check('空库读出来是空数组', loadMemories().length === 0);

const first = saveMemory({
    name: '用户的称呼',
    description: '该用户叫什么、怎么称呼',
    type: 'user',
    body: '用户叫云云，13 岁，初一。直接叫云云就行。'
});
check('新存一条', first.created === true && first.memory.name === '用户的称呼');
check('读得回来', loadMemories().length === 1 && loadMemories()[0].body.includes('云云'));
check('按名字找得到（带空格也不计较）', !!findMemory('  用户的称呼 '));
check('名字找不到就 null', findMemory('不存在的东西') === null);

// ---------------------------------------------------------------- 同名 = 覆盖，不是再来一条
const again = saveMemory({
    name: '用户的称呼',
    description: '该用户叫什么、怎么称呼',
    type: 'user',
    body: '用户叫云云，13 岁，初一，喜欢直接给结论。'
});
check('同名是更新而不是新增', again.created === false && loadMemories().length === 1);
check('正文换成新的', loadMemories()[0].body.includes('喜欢直接给结论'));
check('创建时间保留、更新时间前进',
    loadMemories()[0].createdAt === first.memory.createdAt &&
    loadMemories()[0].updatedAt >= first.memory.updatedAt);

// ---------------------------------------------------------------- 类型与截断
const typed = saveMemory({name: '别乱改变量名', description: '被纠正过的做法', type: 'feedback', body: '不要重命名用户的变量。'});
check('类型存下来', typed.memory.type === 'feedback');
check('乱填的类型退回 project',
    saveMemory({name: '类型乱填', description: 'd', type: '胡说', body: 'b'}).memory.type === 'project');
const longBody = saveMemory({name: '超长正文', description: 'd', type: 'project', body: 'x'.repeat(5000)});
check('正文超限被截断并回报',
    longBody.memory.body.length === MEMORY_LIMITS.bodyMax && longBody.clipped.includes('body'),
    `${longBody.memory.body.length}`);
const longDesc = saveMemory({
    name: '超长描述',
    description: 'y'.repeat(400),
    type: 'project',
    body: 'b'
});
check('描述超限被截断', longDesc.memory.description.length === MEMORY_LIMITS.descriptionMax &&
    longDesc.clipped.includes('description'));
check('没名字存不进去', saveMemory({description: 'd', body: 'b'}).memory === null);

// ---------------------------------------------------------------- 索引（进提示词的那份）
const index = memoryIndexText();
check('索引一行一条、带类型', index.split('\n').length === loadMemories().length &&
    /- 用户的称呼 — 该用户叫什么、怎么称呼 \(user\)/.test(index), index.split('\n')[0]);
check('索引里没有正文', !index.includes('喜欢直接给结论'));

// 索引超长要截断并说明（否则模型以为就这么几条）
clearMemories();
for (let i = 0; i < 55; i++) {
    saveMemory({
        name: `事实${i}`,
        description: 'z'.repeat(150),
        type: 'project',
        body: '正文'.repeat(50)
    });
}
const bigIndex = memoryIndexText();
check('索引超长时截断并注明', bigIndex.length > MEMORY_LIMITS.indexMax &&
    bigIndex.includes('index truncated'), `${bigIndex.length} 字`);
check('截断后前面那部分还在', bigIndex.startsWith('- 事实0'));

// ---------------------------------------------------------------- 条数上限：满了报错，不悄悄丢旧的
clearMemories();
for (let i = 0; i < MEMORY_LIMITS.max; i++) {
    saveMemory({name: `第${i}条`, description: 'd', type: 'project', body: 'b'});
}
const overflow = saveMemory({name: '再来一条', description: 'd', type: 'project', body: 'b'});
check('满了不让存（返回错误）', overflow.memory === null && /memories/.test(overflow.error || ''));
check('满了也不是把旧的挤掉', loadMemories().length === MEMORY_LIMITS.max);
check('满了还能覆盖已有的',
    saveMemory({name: '第0条', description: '改过', type: 'project', body: 'b'}).memory !== null &&
    loadMemories().length === MEMORY_LIMITS.max);

// ---------------------------------------------------------------- 删除
const target = findMemory('第0条');
check('删得掉', deleteMemory(target.id) === true && loadMemories().length === MEMORY_LIMITS.max - 1);
check('删不存在的返回 false', deleteMemory('没这个 id') === false);
clearMemories();
check('清空后索引为空串', memoryIndexText() === '');

// ---------------------------------------------------------------- 用户 skill
clearUserSkills();
check('名字规则：字母数字下划线连字符', isValidSkillName('my_skill-1') === true &&
    isValidSkillName('我的技能') === false && isValidSkillName('a') === false);

const skill = saveUserSkill({
    name: 'my_notes',
    description: '我自己整理的积木用法',
    body: '# 我的笔记\n\nrepeat 里的数字要大一点。'
});
check('新存一份 skill', !!skill.skill && skill.error === null && loadUserSkills().length === 1);
check('非法名字被拒', saveUserSkill({name: '我的', body: 'x'}).error !== null);
check('空正文被拒', saveUserSkill({name: 'ok_name', body: '   '}).error !== null);
check('存下来的形状能直接给模型用',
    userSkillsForModel()[0].name === 'my_notes' &&
    userSkillsForModel()[0].user === true &&
    Array.isArray(userSkillsForModel()[0].docs));

// 改名 / 改正文：给 id 就是改那一条
const renamed = saveUserSkill({id: skill.skill.id, name: 'my_notes', description: '改过的描述', body: '新正文'});
check('给 id 改的是同一条', renamed.skill.id === skill.skill.id && loadUserSkills().length === 1 &&
    loadUserSkills()[0].body === '新正文');

// 跟内置重名 / 跟自己重名都要拦
check('跟内置重名被拦', !!skillNameConflict('xce_engine', ['xce_engine', 'xce_xcc']));
check('跟自己重名被拦（改别的条目时）',
    !!skillNameConflict('my_notes', ['xce_engine'], 'other-id'));
check('改自己时不算重名', skillNameConflict('my_notes', ['xce_engine'], skill.skill.id) === null);
check('不重名放行', skillNameConflict('brand_new', ['xce_engine']) === null);

check('删得掉 skill', deleteUserSkill(skill.skill.id) === true && loadUserSkills().length === 0);
check('删不存在的返回 false', deleteUserSkill('nope') === false);
check('skill 条数上限是正数', USER_SKILL_LIMITS.max > 0);
check('记忆类型是那四种', MEMORY_TYPES.map(item => item.value).join(',') === 'user,feedback,project,reference');

if (failed) {
    console.log(`\n❌ ${failed} 项没过`);
    process.exit(1);
}
console.log('\n✅ 记忆与用户技能全部通过');
