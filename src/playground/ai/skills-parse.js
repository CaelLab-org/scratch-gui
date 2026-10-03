/**
 * skill 文件（docs/skills/<name>/SKILL.md）的解析。纯函数，不含 webpack 的东西，
 * 所以能在无头环境里直接测真实文件（跟 markdown-parse.js 一个套路）。
 *
 * 文件形状 —— 跟 ZCode / Claude 的 SKILL.md 约定一致：
 *
 *     ---
 *     name: xce
 *     description: 一行话，说明什么时候该加载它
 *     ---
 *     （正文，给模型读的资料）
 *
 * description 很关键：它和正文不一样，**会被拼进每一轮的系统提示词**，
 * 所以它必须写「什么时候用它」，而不是「这里面有什么」。
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

/**
 * 解析一份 skill 文件
 * @param {string} raw 文件原文
 * @param {string} path 来源路径（报错和调试用）
 * @returns {object|null} {name, description, body, path}；缺 name 或解析不了返回 null
 */
export const parseSkillFile = (raw, path = '') => {
    const text = String(raw === void 0 || raw === null ? '' : raw);
    const match = text.match(FRONTMATTER);
    if (!match) return null;

    const meta = {};
    for (const line of match[1].split('\n')) {
        const at = line.indexOf(':');
        if (at === -1) {
            continue;
        }
        const key = line.slice(0, at)
            .trim();
        if (key) {
            meta[key] = line.slice(at + 1)
                .trim();
        }
    }
    const name = meta.name;
    if (!name) {
        return null;
    }

    return {
        name,
        description: meta.description || '',
        body: text.slice(match[0].length)
            .trim(),
        path
    };
};
