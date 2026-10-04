/**
 * AI 记忆：模型自己写、自己在下一轮用到的长期事实。
 *
 * 形状照 ZCode 那套（`~/.zcode/.../memory/` 里一个记忆一个 md + 一份 MEMORY.md 索引），
 * 但**浏览器里没有文件系统**，所以整套换成一张 localStorage 表：
 *
 *   一条记忆 = {id, name, description, type, body, createdAt, updatedAt}
 *     name        短名字，模型的「句柄」（保存/删除/读取都按它找），也是索引上的那一行
 *     description 一行话，**会进提示词的索引**，所以要写「这条记的是什么」
 *     type        user / feedback / project / reference（沿用 ZCode 的四类）
 *     body        正文，**不进提示词**，模型要调 xce_read_memory 才看得到
 *
 * 为什么正文不直接进提示词（这是整套设计里最要紧的一条）：记忆会越攒越多，
 * 全塞进系统提示词等于每轮都在烧 token，而且改一个字就让整个会话前缀的 prompt 缓存失效。
 * 所以只有「名字 + 一行描述」的索引常驻，正文按需读 —— 跟 skill 的 SKILL.md / docs 两段式同理。
 *
 * 存储后端：浏览器里是 localStorage；Node（无头测试）里自动退化成一张内存表，
 * 两边走同一条代码路径，所以这模块的测试就是真实行为的测试。
 */

const KEY = 'xce_ai_memories';

/**
 * 记忆的种类。四种沿用 ZCode 的语义，界面上给中文标签。
 * 类型不影响功能，进提示词时标在索引行尾 —— 模型据此知道这条该怎么用。
 */
export const MEMORY_TYPES = [
    {value: 'user', label: '用户偏好', hint: '用户是谁、喜欢什么、明确说不要什么'},
    {value: 'feedback', label: '工作方式', hint: '该怎么干活、哪次被纠正过'},
    {value: 'project', label: '项目', hint: '正在做的东西、目标、还没做完的事'},
    {value: 'reference', label: '参考', hint: '外部地址、工具、资料在哪'}
];

/**
 * 各种上限。超了就在这一层截断（而不是让 localStorage 悄悄炸掉或者把提示词撑爆）：
 * 索引进提示词，所以卡得最紧。
 */
export const MEMORY_LIMITS = {
    max: 60, // 条数：满了让模型先删，不悄悄丢旧的
    nameMax: 40,
    descriptionMax: 160,
    bodyMax: 4000,
    indexMax: 8000 // 索引进提示词的字符上限，超了截断并注明
};

// 存储后端：没有 localStorage 就用内存表（无头测试走这条）
const fallback = new Map();
const hasLocalStorage = () => typeof localStorage !== 'undefined';

const readRaw = () => {
    try {
        const raw = hasLocalStorage() ? localStorage.getItem(KEY) : (fallback.has(KEY) ? fallback.get(KEY) : null);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(entry => entry && entry.name) : [];
    } catch (e) {
        // 坏档当空库：一条记忆存坏了不该把整个面板带崩
        return [];
    }
};

const writeRaw = list => {
    const raw = JSON.stringify(list);
    if (hasLocalStorage()) {
        try {
            localStorage.setItem(KEY, raw);
        } catch (e) {
            // 配额爆了：记忆不是关键路径，这一条写不进去就别影响对话
            return false;
        }
    } else {
        fallback.set(KEY, raw);
    }
    return true;
};

const clip = (text, max) => {
    const str = String(text === void 0 || text === null ? '' : text)
        .trim();
    return str.length > max ? str.slice(0, max) : str;
};

const cut = (text, max) => String(text === void 0 || text === null ? '' : text)
    .trim()
    .slice(0, max);

/**
 * 新记忆的 id（界面上用它做 key，工具按 name 找）
 * @returns {string} 例如 `m-m1k3x9-a7f2q`
 */
export const newMemoryId = () =>
    `m-${Date.now().toString(36)}-${Math.random().toString(36)
        .slice(2, 7)}`;

/**
 * 读出全部记忆，按名字排序（界面上顺序稳定，提示词里的索引也稳定 —— 顺序一变，前缀就变）
 * @returns {Array<object>} 记忆数组（副本）
 */
export const loadMemories = () => readRaw()
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));

/**
 * 按名字找一条（大小写和首尾空格都不计较 —— 模型抄回来的名字常带这些）
 * @param {string} name 记忆名
 * @returns {object|null} 找到的那条，没有返回 null
 */
export const findMemory = name => {
    const needle = String(name === void 0 || name === null ? '' : name)
        .trim()
        .toLowerCase();
    if (!needle) return null;
    return loadMemories().find(entry => String(entry.name)
        .trim()
        .toLowerCase() === needle) || null;
};

/**
 * 保存一条记忆：给了 id 就改那一条，否则**按名字覆盖**（同名 = 更新，不是再存一条）。
 *
 * ZCode 的规矩是「先查再更新，不要建重复的」，这里用同名覆盖把它落成硬约束 ——
 * 模型把「用户的称呼」记两遍这种事就不会发生了。前提是名字要写对，
 * 所以工具描述里明确要求「改之前先想清楚是不是同一件事」。
 *
 * @param {object} input {name, description, type, body, id?}
 * @returns {object} {memory, created, clipped} —— clipped 说明有字段被截断了
 */
export const saveMemory = ({name, description, type, body, id} = {}) => {
    const cleanName = clip(name, MEMORY_LIMITS.nameMax);
    if (!cleanName) return {memory: null, created: false, error: 'name is required'};
    const cleanBody = cut(body, MEMORY_LIMITS.bodyMax);
    const cleanDescription = cut(description, MEMORY_LIMITS.descriptionMax);
    const kinds = MEMORY_TYPES.map(kind => kind.value);
    const cleanType = kinds.includes(type) ? type : 'project';
    const clipped = [
        String(body || '').trim().length > MEMORY_LIMITS.bodyMax ? 'body' : null,
        String(description || '').trim().length > MEMORY_LIMITS.descriptionMax ? 'description' : null
    ].filter(Boolean);

    const list = readRaw();
    const byId = id ? list.find(entry => entry.id === id) : null;
    const byName = list.find(entry => String(entry.name)
        .trim()
        .toLowerCase() === cleanName.toLowerCase());
    const existing = byId || byName;
    if (!existing && list.length >= MEMORY_LIMITS.max) {
        return {
            memory: null,
            created: false,
            error: `already ${MEMORY_LIMITS.max} memories — delete or overwrite one first`
        };
    }
    const now = Date.now();
    const memory = {
        id: (existing && existing.id) || newMemoryId(),
        name: cleanName,
        description: cleanDescription,
        type: cleanType,
        body: cleanBody,
        createdAt: (existing && existing.createdAt) || now,
        updatedAt: now
    };
    const next = existing ?
        list.map(entry => (entry.id === existing.id ? memory : entry)) :
        list.concat([memory]);
    writeRaw(next);
    return {memory, created: !existing, clipped};
};

/**
 * 删掉一条记忆
 * @param {string} id 记忆 id
 * @returns {boolean} 删掉了没有
 */
export const deleteMemory = id => {
    const list = readRaw();
    const next = list.filter(entry => entry.id !== id);
    if (next.length === list.length) return false;
    writeRaw(next);
    return true;
};

/**
 * 会进提示词的那份索引，`- 名字 — 描述 (类型)` 一行一条。
 * 名字和描述都是模型自己写的，所以这里只做形状上的整理，不改内容。
 * @returns {string} 索引文本；一条记忆都没有就是空串
 */
export const memoryIndexText = () => {
    const list = loadMemories();
    if (!list.length) return '';
    const lines = list.map(entry => {
        const tail = entry.type ? ` (${entry.type})` : '';
        const description = entry.description ? ` — ${entry.description}` : '';
        return `- ${entry.name}${description}${tail}`;
    });
    const joined = lines.join('\n');
    if (joined.length <= MEMORY_LIMITS.indexMax) return joined;
    // 截断要说明，否则模型会以为「就这么几条」
    const kept = joined.slice(0, MEMORY_LIMITS.indexMax);
    const note = `… (index truncated at ${MEMORY_LIMITS.indexMax} characters; ` +
        'the rest is read with xce_read_memory by name)';
    return `${kept}\n${note}`;
};

// 测试用：清空（无头环境没有 localStorage 时用它复位内存表）
export const clearMemories = () => {
    if (hasLocalStorage()) {
        try {
            localStorage.removeItem(KEY);
        } catch (e) {
            // 清不掉也就算了
        }
    }
    fallback.delete(KEY);
};
