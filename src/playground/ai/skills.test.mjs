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
// 一级能力的名称统一带 xce_ 前缀（用户定的），四份资料都得在
check('名称统一带 xce_ 前缀', skills.every(s => s.name.startsWith('xce_')), JSON.stringify(skills.map(s => s.name)));
check('caellab / engine / xcc / xf 都在',
    ['xce_caellab', 'xce_engine', 'xce_xcc', 'xce_xf'].every(name => skills.some(s => s.name === name)),
    JSON.stringify(skills.map(s => s.name)));

// 正文不带 frontmatter，也不该残留 --- 头
check('正文里没有残留的 frontmatter', skills.every(s => !s.body.startsWith('---')));

// ---------- 3. read_skill（列清单）与 read_fast_docs（读正文）----------
const fakePort = {};
const tools = createTools({port: fakePort, skills});
const readSkill = tools.find(t => t.name === 'read_skill');
const readFastDocs = tools.find(t => t.name === 'read_fast_docs');
check('工具表里有 read_skill 和 read_fast_docs', !!readSkill && !!readFastDocs);

const index = await readSkill.handler({}, {});
check('read_skill 不带参数，返回全部一级能力清单',
    !index.isError && skills.every(s => index.content.includes(s.name) && index.content.includes(s.description)),
    String(index.content).slice(0, 80));
check('清单里不带正文（正文要按需取）',
    !skills.some(s => index.content.includes(s.body.slice(0, 40))));
check('清单里指路 read_fast_docs', index.content.includes('read_fast_docs'));

const loaded = await readFastDocs.handler({name: 'xce_engine'}, {});
check('read_fast_docs 读得到指定文档的正文',
    !loaded.isError && loaded.content.includes('engine.xmuer.online'),
    String(loaded.content).slice(0, 60));

const unknown = await readFastDocs.handler({name: 'nope'}, {});
check('读不存在的文档是失败并指回 read_skill',
    unknown.isError === true && /read_skill/.test(unknown.content), String(unknown.content).slice(0, 80));

check('read_fast_docs 的参数说明里带全部文档名',
    skills.every(s => readFastDocs.inputSchema.properties.name.description.includes(s.name)));

const noSkills = createTools({port: fakePort, skills: []});
const emptyIndex = await noSkills.find(t => t.name === 'read_skill').handler({}, {});
check('一个文档都没有时清单也不炸', !emptyIndex.isError, String(emptyIndex.content));
const emptyDoc = await noSkills.find(t => t.name === 'read_fast_docs').handler({name: 'x'}, {});
check('空库时读文档不炸', emptyDoc.isError === true, String(emptyDoc.content));

// ---------- 4. 提示词：清单不进提示词，工具表点名两个工具 ----------
const prompt = buildSystemPrompt({
    projectSummary: '',
    currentSprite: '角色1',
    extensions: [],
    date: '2026-10-04',
    userPrompt: '回答短一点',
    toolNames: tools.map(t => t.name)
});
const markerIndex = prompt.indexOf('[End of system prompt]');
check('skill 清单不进提示词（不要一下子全扔进去）',
    !prompt.includes('<available-skills>') && !skills.some(s => prompt.includes(s.body.slice(0, 40))));
check('提示词点名 read_skill 与 read_fast_docs',
    prompt.includes('read_skill') && prompt.includes('read_fast_docs'));
check('用户提示词的分隔块仍在用户段之后', markerIndex > prompt.indexOf('</environment>'));
// 工具表是常驻文本：无论有没有 skill 都点名这两个工具，但不会出现清单内容
check('工具表常驻点名两个工具',
    buildSystemPrompt({date: '2026-10-04'}).includes('read_skill') &&
    buildSystemPrompt({date: '2026-10-04'}).includes('read_fast_docs'));

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
