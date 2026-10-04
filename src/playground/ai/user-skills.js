/**
 * 用户自己写的 skill（参考文档）。
 *
 * 内置那几份 skill 是 `docs/skills/<名字>/SKILL.md`，**构建期**用 require.context 打包进来
 * （见 skills.js），用户改不了。这里是另一条路：用户在设置里自己写一份，存 localStorage，
 * 运行时和内置的合并成一个清单交给模型 —— 模型那边看不出区别，
 * `xce_read_skill` 能列到它、`xce_read_fast_docs` 能读到正文。
 *
 * 名字是模型的句柄（工具参数里就传它），所以限制成 ASCII 标识符：
 * 中文名字模型抄回来容易抄错，而且一眼分不清哪份是内置的。
 *
 * 结构跟内置 skill 对齐（{name, description, body, docs}），合并时直接拼数组即可。
 */

const KEY = 'xce_ai_skills';

export const USER_SKILL_LIMITS = {
    max: 20,
    nameMax: 40,
    descriptionMax: 200,
    bodyMax: 8000
};

// 没有 localStorage（无头测试）就退化成内存表，跟 memory.js 一个套路
const fallback = new Map();
const hasLocalStorage = () => typeof localStorage !== 'undefined';

const readRaw = () => {
    try {
        const raw = hasLocalStorage() ? localStorage.getItem(KEY) : (fallback.has(KEY) ? fallback.get(KEY) : null);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(entry => entry && entry.name && entry.body) : [];
    } catch (e) {
        return [];
    }
};

const writeRaw = list => {
    const raw = JSON.stringify(list);
    if (hasLocalStorage()) {
        try {
            localStorage.setItem(KEY, raw);
        } catch (e) {
            return false;
        }
    } else {
        fallback.set(KEY, raw);
    }
    return true;
};

const cut = (text, max) => String(text === void 0 || text === null ? '' : text)
    .trim()
    .slice(0, max);

/**
 * 名字的规矩：字母 / 数字 / 下划线 / 连字符，2~40 个字符
 * @param {string} name 用户填的名字
 * @returns {boolean} 合不合规矩
 */
export const isValidSkillName = name => /^[a-zA-Z0-9_-]{2,40}$/.test(String(name || '').trim());

/**
 * 新 skill 的 id
 * @returns {string} 例如 `s-m1k3x9-a7f2q`
 */
export const newUserSkillId = () =>
    `s-${Date.now().toString(36)}-${Math.random().toString(36)
        .slice(2, 7)}`;

/**
 * 读出用户写的全部 skill（存的原样，不含 docs —— 用户技能没有详细文档那一层）
 * @returns {Array<object>} 数组，按名字排序
 */
export const loadUserSkills = () => readRaw()
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

/**
 * 变成模型看得懂的形状（跟 skills.js 里 parseSkillFile 的结果对齐）
 * @returns {Array<object>} [{name, description, body, docs: [], user: true}]
 */
export const userSkillsForModel = () => loadUserSkills()
    .map(entry => ({
        name: entry.name,
        description: entry.description || '',
        body: entry.body,
        docs: [],
        user: true
    }));

/**
 * 存一份用户 skill：给了 id 就改那一条，否则按名字新建/覆盖。
 * @param {object} input {id?, name, description, body}
 * @returns {object} {skill, created, error} —— error 有值时什么都没写
 */
export const saveUserSkill = ({id, name, description, body} = {}) => {
    const cleanName = String(name || '').trim();
    const cleanBody = String(body || '').trim();
    if (!isValidSkillName(cleanName)) {
        return {skill: null, created: false, error: '名字只能是字母、数字、下划线或连字符（2~40 位）'};
    }
    if (!cleanBody) return {skill: null, created: false, error: '正文不能为空'};

    const list = readRaw();
    const existing = list.find(entry => entry.id === id) ||
        list.find(entry => String(entry.name)
            .toLowerCase() === cleanName.toLowerCase());
    if (!existing && list.length >= USER_SKILL_LIMITS.max) {
        return {skill: null, created: false, error: `最多 ${USER_SKILL_LIMITS.max} 份`};
    }
    const now = Date.now();
    const skill = {
        id: (existing && existing.id) || newUserSkillId(),
        name: cleanName,
        description: cut(description, USER_SKILL_LIMITS.descriptionMax),
        body: cut(cleanBody, USER_SKILL_LIMITS.bodyMax),
        createdAt: (existing && existing.createdAt) || now,
        updatedAt: now
    };
    const next = existing ?
        list.map(entry => (entry.id === existing.id ? skill : entry)) :
        list.concat([skill]);
    if (!writeRaw(next)) return {skill: null, created: false, error: '存不进去（浏览器存储配额满了）'};
    return {skill, created: !existing, error: null};
};

/**
 * 删掉一份用户 skill（内置的删不了，它们不在这个表里）
 * @param {string} id skill id
 * @returns {boolean} 删掉了没有
 */
export const deleteUserSkill = id => {
    const list = readRaw();
    const next = list.filter(entry => entry.id !== id);
    if (next.length === list.length) return false;
    writeRaw(next);
    return true;
};

/**
 * 用户技能名跟内置的撞了没有 —— 撞了模型就分不清该读哪份，所以保存前拦下来
 * @param {string} name 待保存的名字
 * @param {Array<string>} builtinNames 内置 skill 的名字
 * @param {string} [ownId] 正在编辑的那条自己的 id（改自己的名字不算撞）
 * @returns {string|null} 撞了就返回那句提示，没问题返回 null
 */
export const skillNameConflict = (name, builtinNames, ownId) => {
    const clean = String(name || '').trim()
        .toLowerCase();
    if ((builtinNames || []).some(item => String(item)
        .toLowerCase() === clean)) {
        return '这个名字跟内置技能重了，换一个';
    }
    const own = loadUserSkills().find(entry => entry.id !== ownId &&
        String(entry.name)
            .toLowerCase() === clean);
    return own ? '已经有一份同名技能了' : null;
};

// 测试用：清空
export const clearUserSkills = () => {
    if (hasLocalStorage()) {
        try {
            localStorage.removeItem(KEY);
        } catch (e) {
            // 清不掉也就算了
        }
    }
    fallback.delete(KEY);
};
