// skill 的无头自测：解析器 + docs/skills 下的真实文件 + read_skill 工具
// 用法：node src/playground/ai/skills.test.mjs
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {parseSkillFile} from './skills-parse.js';
import {createTools} from './tools.js';
import {buildSystemPrompt} from './prompt.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(here, '../../../docs/skills');

const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

// ---------- 1. 解析器 ----------
const good = parseSkillFile('---\nname: demo\ndescription: 什么时候用它\n---\n\n正文第一行\n正文第二行\n', 'demo/SKILL.md');
check('解析出 name / description / body',
    good && good.name === 'demo' && good.description === '什么时候用它' &&
    good.body === '正文第一行\n正文第二行',
    JSON.stringify(good && good.body));
check('CRLF 也认', (() => {
    const crlf = parseSkillFile('---\r\nname: demo\r\ndescription: d\r\n---\r\n正文\r\n');
    return crlf && crlf.name === 'demo' && crlf.body === '正文';
})());
check('没有 frontmatter 返回 null', parseSkillFile('# 就一段正文\n') === null);
check('有 frontmatter 但没 name 返回 null', parseSkillFile('---\ndescription: d\n---\n正文\n') === null);
check('description 可以省略', (() => {
    const noDesc = parseSkillFile('---\nname: demo\n---\n正文\n');
    return noDesc && noDesc.description === '' && noDesc.body === '正文';
})());

// 正文里的 --- 分割线不能被当成 frontmatter 的结束（只认开头的那一对）
check('正文里的分割线不影响解析',
    (() => {
        const s = parseSkillFile('---\nname: demo\ndescription: d\n---\n上\n\n---\n\n下\n');
        return s && s.body.startsWith('上') && s.body.includes('下');
    })());

// ---------- 2. 仓库里真实的 skill 文件 ----------
const files = fs.existsSync(SKILLS_DIR) ?
    fs.readdirSync(SKILLS_DIR).map(name => path.join(SKILLS_DIR, name, 'SKILL.md'))
        .filter(p => fs.existsSync(p)) :
    [];
check('docs/skills 下有 skill 文件', files.length > 0, `${files.length} 个`);

const skills = files.map(p => parseSkillFile(fs.readFileSync(p, 'utf8'), p));
check('每一个都能解析出 name', skills.every(s => s && s.name), JSON.stringify(skills.map(s => s && s.name)));
check('每一个都有 description', skills.every(s => s && s.description.length > 10),
    JSON.stringify(skills.map(s => s && s.description.slice(0, 20))));
check('name 不重复', new Set(skills.map(s => s.name)).size === skills.length, JSON.stringify(skills.map(s => s.name)));
const mismatched = files
    .map((p, i) => ({dir: path.basename(path.dirname(p)), name: skills[i].name}))
    .filter(pair => pair.dir !== pair.name);
check('名字就是目录名', mismatched.length === 0, JSON.stringify(mismatched));
// 用户点名要的四份资料
check('caellab / xce / xcc / xf 都在',
    ['caellab', 'xce', 'xcc', 'xf'].every(name => skills.some(s => s.name === name)),
    JSON.stringify(skills.map(s => s.name)));

// 正文不带 frontmatter，也不该残留 --- 头
check('正文里没有残留的 frontmatter', skills.every(s => !s.body.startsWith('---')));

// ---------- 3. read_skill 工具 ----------
const fakePort = {};
const tools = createTools({port: fakePort, skills});
const readSkill = tools.find(t => t.name === 'read_skill');
check('工具表里有 read_skill', !!readSkill);

const loaded = await readSkill.handler({name: 'xce'}, {});
check('读得到指定 skill 的正文',
    !loaded.isError && loaded.content.includes('engine.xmuer.online'),
    String(loaded.content).slice(0, 60));

const unknown = await readSkill.handler({name: 'nope'}, {});
check('读不存在的 skill 是失败并列出可选项',
    unknown.isError === true && /可用的有/.test(unknown.content), String(unknown.content).slice(0, 80));

// description 写进工具参数说明里，模型才知道有哪些名字可选
check('工具参数说明里带全部 skill 名',
    skills.every(s => readSkill.inputSchema.properties.name.description.includes(s.name)));

const noSkills = createTools({port: fakePort, skills: []}).find(t => t.name === 'read_skill');
const empty = await noSkills.handler({name: 'xce'}, {});
check('一个 skill 都没有时也不炸', empty.isError === true, String(empty.content));

// ---------- 4. 提示词里的 skill 清单 ----------
const prompt = buildSystemPrompt({
    projectSummary: '',
    currentSprite: '角色1',
    extensions: [],
    date: '2026-10-04',
    userPrompt: '回答短一点',
    skills
});
const markerIndex = prompt.indexOf('[End of system prompt]');
const skillIndex = prompt.indexOf('<available-skills>');
check('skill 清单排在用户提示词之后', markerIndex !== -1 && skillIndex > markerIndex,
    `marker@${markerIndex} skills@${skillIndex}`);
check('清单里每个 skill 都有一行 name + description',
    skills.every(s => prompt.includes(`\`${s.name}\` — ${s.description}`)));
check('清单里**不带正文**（正文要按需取）', !prompt.includes('engine.xmuer.online 的正文'));
check('提示词里点名了 read_skill', prompt.includes('read_skill'));
check('没有 skill 时不出现清单块',
    !buildSystemPrompt({date: '2026-10-04', skills: []}).includes('<available-skills>'));

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
