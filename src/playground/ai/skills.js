/**
 * skill 的装载。
 *
 * 正文用 `require.context` 在**构建期**打成字符串塞进包里，不在运行时 fetch：
 * 线上是 GitHub Pages，多一次网络往返不值当，而且 CDN 缓存会让「改了不生效」这种坑重演。
 * （webpack.config.js 里给 .md 配了 raw-loader，就为了这个。）
 *
 * 单独一个模块是因为 `require.context` 是 webpack 的东西 —— 无头测试里 import 它会炸，
 * 所以 tools.js 不直接 import 它，而是**按参数注入** skill 数组（跟 port 一个套路）。
 * 纯解析逻辑在 skills-parse.js 里，那个是能直接测的。
 */
import {parseSkillFile} from './skills-parse.js';

const context = require.context('../../../docs/skills', true, /\/SKILL\.md$/);

export const SKILLS = context.keys()
    .sort()
    .map(key => {
        const loaded = context(key);
        const raw = loaded && loaded.__esModule ? loaded.default : loaded;
        const skill = parseSkillFile(raw, key);
        if (!skill) {
            // 格式不对就跳过：宁可少一个 skill，也不能让整个面板起不来
            // eslint-disable-next-line no-console
            console.warn(`[ai] skill 格式不对，已跳过：${key}（需要 --- name:/description: --- 头）`);
        }
        return skill;
    })
    .filter(Boolean);

export const skillNames = () => SKILLS.map(skill => skill.name);
