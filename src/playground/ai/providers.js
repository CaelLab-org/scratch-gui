/**
 * 模型接入层。设计照 dsh / ZCode 的模型层，三条规矩：
 *   1. 供应商差异是**数据**（base_url / 模型清单 / 思考字段形态），不是代码分支；
 *   2. 请求体用**纯函数**构造，逻辑不散在调用处；
 *   3. 流式里工具调用的 arguments 是**分片**到达的 —— 只字符串累加，收尾时才 JSON.parse。
 *
 * 对外只有两个东西：
 *   PROVIDERS / fetchProviderModels  —— 模型目录（人工预设 + 从接口实时拉）
 *   createCloudModel(config)         —— 与本地脚本模型同形状的 {name, complete}
 *
 * 两条线格式：默认 OpenAI 兼容（`/chat/completions`），供应商声明 `wire: 'anthropic'`
 * 的走 Anthropic Messages API（`/v1/messages`，见 anthropic.js）。差异是**数据**，不是调用处的分支。
 *
 * 两个实盘验证过的坑（2026-10-04 用真实 key 打过接口）：
 *   - DeepSeek 开思考时有工具调用，**assistant 消息必须把 reasoning_content 原样回传**，
 *     否则下一步直接 400「The reasoning_content in the thinking mode must be passed back to the API」。
 *   - 图片可以放在 `role: "tool"` 的消息里（content 用 [{type:'text'},{type:'image_url'}] 数组），
 *     模型确实看得到（实测让它读 1x1 像素，它答对了颜色）。
 */

import {authHeaders, describeHttpError, isLocalBaseUrl, sseDataLines, toolParameters} from './wire.js';
import {createAnthropicModel} from './anthropic.js';
import {customProviders} from './custom-providers.js';

// ---------------------------------------------------------------------------
// 模型目录
// ---------------------------------------------------------------------------

// 通用的思考档位。wire 就是最终塞进请求体的值，所以各家写法不同也能塞进同一份数据里。
const thinkingLevels = (field, levels) => ({
    field,
    levels: levels.map(([value, label, wire]) => ({value, label, wire: wire === void 0 ? value : wire}))
});

const LEVELS_4 = [
    ['none', '不思考（最快）', void 0],
    ['low', '低', void 0],
    ['high', '高（默认）', void 0],
    ['max', '最高', void 0]
];
const LEVELS_3 = [
    ['low', '低', void 0],
    ['high', '高（默认）', void 0],
    ['max', '最高', void 0]
];
const LEVELS_ONOFF = [
    ['off', '不思考', {type: 'disabled'}],
    ['on', '思考（默认）', {type: 'enabled'}]
];

// Anthropic 的思考档位（这条是协议定死的字段名，所以自定义的 Anthropic 端点也能直接用）。
// 官方新写法：开 = adaptive（不吃会过期的 budget_tokens），「最高」再叠一个 effort。
// 老模型或兼容网关只认 {type:'enabled', budget_tokens} 的话，把那档的 wire 改成那个形状也能用
// （anthropic.js 会把预算夹到 max_tokens 以下，不会因为预算超了直接 400）。
const ANTHROPIC_THINKING = thinkingLevels('thinking', [
    ['off', '不思考', {type: 'disabled'}],
    ['high', '思考（默认）', {type: 'adaptive'}],
    ['max', '最高', {type: 'adaptive', effort: 'high'}]
]);

// ⚠️ 预设的模型 id 会随供应商上下架而过期。界面上有「从接口拉取」按钮，
// 用用户自己的 key 打 GET {baseUrl}/models 拿真实清单 —— 预设只是开箱即用的默认值。
//
// 一条供应商的字段（照 ZCode 的 provider 数据表：差异是数据，加一家 ≈ 加一行）：
//   id / name / group      标识、显示名、下拉里的分组（国内 / 国外 / 聚合与云 / 本地）
//   wire                   'openai'（默认，/chat/completions）| 'anthropic'（/v1/messages）
//   path                   端点路径，默认按 wire 取；非标准的兼容端点（MiniMax）才要写
//   baseUrl / keyUrl / note 地址、申请密钥的链接、给用户看的一句说明（含跨域实测结论）
//   thinking               {field, levels[{value,label,wire}]}；wire 是最终塞进请求体的值
//   models                 预设清单，带 supportsImage / contextWindow / maxOutputTokens
//
// 用户自己添加的供应商在 custom-providers.js（存在浏览器本地），下拉里和这些并列显示。
export const PROVIDERS = [
    {
        id: 'deepseek',
        name: 'DeepSeek',
        group: '国内',
        baseUrl: 'https://api.deepseek.com',
        keyUrl: 'https://platform.deepseek.com/api_keys',
        note: '国内可直连，浏览器跨域实测放行',
        thinking: thinkingLevels('reasoning_effort', LEVELS_3),
        models: [
            {
                id: 'deepseek-flash',
                name: 'DeepSeek-V4.1-Flash',
                supportsImage: true,
                contextWindow: 1048576,
                note: '快，支持看图'
            },
            {
                id: 'deepseek-v4-pro',
                name: 'DeepSeek-V4-Pro',
                contextWindow: 1048576,
                note: '更强，不看图'
            }
        ]
    },
    {
        id: 'glm',
        name: '智谱 GLM',
        group: '国内',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
        note: '有免费档（glm-4.5-flash / glm-4.6v-flash）',
        thinking: thinkingLevels('thinking', LEVELS_ONOFF),
        models: [
            {id: 'glm-4.6', name: 'GLM-4.6', contextWindow: 200000, note: '旗舰'},
            {id: 'glm-4.5-air', name: 'GLM-4.5-Air', contextWindow: 128000, note: '轻量'},
            {id: 'glm-4.5-flash', name: 'GLM-4.5-Flash', contextWindow: 128000, note: '免费'},
            {
                id: 'glm-4.6v-flash',
                name: 'GLM-4.6V-Flash',
                supportsImage: true,
                contextWindow: 128000,
                note: '免费，支持看图'
            }
        ]
    },
    {
        id: 'kimi',
        name: 'Moonshot Kimi',
        group: '国内',
        baseUrl: 'https://api.moonshot.cn/v1',
        keyUrl: 'https://platform.moonshot.cn/console/api-keys',
        note: '旧 moonshot-v1-* 系列已下线',
        thinking: thinkingLevels('reasoning_effort', LEVELS_3),
        models: [
            {
                id: 'kimi-k3',
                name: 'Kimi K3',
                supportsImage: true,
                contextWindow: 1048576,
                note: '旗舰，原生看图'
            },
            {id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', contextWindow: 262144, note: '写代码'},
            {
                id: 'kimi-k2.6',
                name: 'Kimi K2.6',
                supportsImage: true,
                contextWindow: 262144,
                thinking: thinkingLevels('thinking', LEVELS_ONOFF)
            }
        ]
    },
    {
        id: 'dashscope',
        name: '阿里云百炼（通义千问）',
        group: '国内',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        keyUrl: 'https://bailian.console.aliyun.com/',
        note: '跨域放行 *；将来地址可能要求带 WorkspaceId',
        thinking: {
            field: 'enable_thinking',
            levels: [
                {value: 'off', label: '不思考', wire: false},
                {value: 'on', label: '思考（默认）', wire: true}
            ]
        },
        models: [
            {
                id: 'qwen3.8-max',
                name: 'Qwen3.8-Max',
                supportsImage: true,
                contextWindow: 1048576,
                note: '旗舰'
            },
            {id: 'qwen3.7-plus', name: 'Qwen3.7-Plus', contextWindow: 262144},
            {id: 'qwen3.7-flash', name: 'Qwen3.7-Flash', contextWindow: 262144, note: '快而便宜'},
            {
                id: 'qwen3-vl-plus',
                name: 'Qwen3-VL-Plus',
                supportsImage: true,
                contextWindow: 262144,
                note: '看图专用'
            }
        ]
    },
    {
        id: 'siliconflow',
        name: '硅基流动 SiliconFlow',
        group: '国内',
        baseUrl: 'https://api.siliconflow.cn/v1',
        keyUrl: 'https://cloud.siliconflow.cn/account/ak',
        note: '跨域最宽松；模型 id 带厂商前缀，建议用「拉取」拿真实清单',
        thinking: thinkingLevels('reasoning_effort', LEVELS_3),
        models: []
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        group: '聚合与云',
        baseUrl: 'https://openrouter.ai/api/v1',
        keyUrl: 'https://openrouter.ai/keys',
        note: '一个 key 通吃各家（模型 id 带厂商前缀）',
        thinking: thinkingLevels('reasoning_effort', LEVELS_4),
        models: [
            {
                id: 'deepseek/deepseek-v4.1-flash',
                name: 'DeepSeek V4.1 Flash',
                supportsImage: true,
                contextWindow: 1048576
            },
            {id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', supportsImage: true},
            {id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol', supportsImage: true},
            {
                id: 'google/gemini-3.8-flash',
                name: 'Gemini 3.8 Flash',
                supportsImage: true,
                contextWindow: 1048576
            }
        ]
    },
    {
        id: 'ark',
        name: '火山方舟（豆包）',
        group: '国内',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        keyUrl: 'https://console.volcengine.com/ark',
        note: '路径是 /api/v3，不是 /v1',
        thinking: thinkingLevels('thinking', LEVELS_ONOFF),
        models: [
            {
                id: 'doubao-seed-2.1-pro',
                name: '豆包 Seed 2.1 Pro',
                supportsImage: true,
                contextWindow: 262144
            },
            {
                id: 'doubao-seed-2.0-lite',
                name: '豆包 Seed 2.0 Lite',
                supportsImage: true,
                contextWindow: 262144
            }
        ]
    },
    {
        id: 'openai',
        name: 'OpenAI',
        group: '国外',
        baseUrl: 'https://api.openai.com/v1',
        keyUrl: 'https://platform.openai.com/api-keys',
        note: '跨域仅第三方实测，且 chat/completions 基本看不到思考内容',
        thinking: thinkingLevels('reasoning_effort', LEVELS_4),
        models: [
            {id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', supportsImage: true},
            {id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', supportsImage: true, note: '快而便宜'},
            {id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', supportsImage: true}
        ]
    },
    {
        id: 'groq',
        name: 'Groq',
        group: '聚合与云',
        baseUrl: 'https://api.groq.com/openai/v1',
        keyUrl: 'https://console.groq.com/keys',
        note: '跨域仅第三方实测；快，适合小模型',
        thinking: thinkingLevels('reasoning_effort', LEVELS_4),
        models: [
            {id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B'},
            {id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B'},
            {id: 'qwen/qwen3-32b', name: 'Qwen3 32B'},
            {
                id: 'meta-llama/llama-4-scout-17b-16e-instruct',
                name: 'Llama 4 Scout',
                supportsImage: true
            }
        ]
    },
    {
        id: 'ollama',
        name: '本地 Ollama',
        group: '本地',
        baseUrl: 'http://localhost:11434/v1',
        keyUrl: '',
        note: '只在本机跑编辑器时可用：线上 HTTPS 页面调 http://localhost 会被浏览器按混合内容拦掉',
        includeUsage: false,
        models: []
    },
    {
        id: 'anthropic',
        name: 'Anthropic Claude',
        group: '国外',
        wire: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        keyUrl: 'https://console.anthropic.com/settings/keys',
        note: '原生 Messages 协议（不是 chat/completions）；浏览器直连要带专用头，我们已经带了',
        thinking: ANTHROPIC_THINKING,
        models: [
            {
                id: 'claude-sonnet-4-5',
                name: 'Claude Sonnet 4.5',
                supportsImage: true,
                contextWindow: 200000
            },
            {
                id: 'claude-opus-4-1',
                name: 'Claude Opus 4.1',
                supportsImage: true,
                contextWindow: 200000
            },
            {
                id: 'claude-haiku-4-5',
                name: 'Claude Haiku 4.5',
                supportsImage: true,
                contextWindow: 200000,
                note: '快而便宜'
            }
        ]
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        group: '国外',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        keyUrl: 'https://aistudio.google.com/apikey',
        note: '走它的 OpenAI 兼容端点；跨域放行，但 key 不加限制会被 403',
        thinking: thinkingLevels('reasoning_effort', LEVELS_3),
        models: [
            {
                id: 'gemini-2.5-pro',
                name: 'Gemini 2.5 Pro',
                supportsImage: true,
                contextWindow: 1048576
            },
            {
                id: 'gemini-2.5-flash',
                name: 'Gemini 2.5 Flash',
                supportsImage: true,
                contextWindow: 1048576
            },
            {
                id: 'gemini-2.5-flash-lite',
                name: 'Gemini 2.5 Flash Lite',
                supportsImage: true,
                contextWindow: 1048576,
                note: '便宜'
            }
        ]
    },
    {
        id: 'xai',
        name: 'xAI Grok',
        group: '国外',
        baseUrl: 'https://api.x.ai/v1',
        keyUrl: 'https://console.x.ai/',
        note: '跨域没有官方说明，网页版可能被拦（桌面版不受影响）',
        thinking: thinkingLevels('reasoning_effort', LEVELS_3),
        models: [
            {id: 'grok-4', name: 'Grok 4', supportsImage: true},
            {id: 'grok-4-fast-reasoning', name: 'Grok 4 Fast Reasoning', contextWindow: 2000000},
            {id: 'grok-3-mini', name: 'Grok 3 Mini', note: '便宜'}
        ]
    },
    {
        id: 'mistral',
        name: 'Mistral',
        group: '国外',
        baseUrl: 'https://api.mistral.ai/v1',
        keyUrl: 'https://console.mistral.ai/api-keys',
        note: '预检多半不放行，网页版基本要自建代理',
        models: [
            {id: 'mistral-large-latest', name: 'Mistral Large'},
            {id: 'mistral-small-latest', name: 'Mistral Small'},
            {id: 'pixtral-12b-latest', name: 'Pixtral 12B', supportsImage: true}
        ]
    },
    {
        id: 'qianfan',
        name: '百度千帆（文心）',
        group: '国内',
        baseUrl: 'https://qianfan.baidubce.com/v2',
        keyUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list',
        note: 'v2 是 OpenAI 兼容；浏览器跨域被拦，网页版用不了（桌面版可以）',
        models: [
            {id: 'ernie-4.5-turbo-128k', name: 'ERNIE 4.5 Turbo 128K'},
            {id: 'ernie-4.0-turbo-8k', name: 'ERNIE 4.0 Turbo 8K'}
        ]
    },
    {
        id: 'hunyuan',
        name: '腾讯混元',
        group: '国内',
        baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
        keyUrl: 'https://console.cloud.tencent.com/hunyuan/api-key',
        note: '密钥要 TokenHub 的 API Key（不是 SecretId/SecretKey）；跨域被拦，网页版用不了',
        models: [
            {id: 'hunyuan-turbos-latest', name: '混元 TurboS'},
            {id: 'hunyuan-t1-latest', name: '混元 T1（推理）'},
            {id: 'hunyuan-vision', name: '混元 Vision', supportsImage: true}
        ]
    },
    {
        id: 'minimax',
        name: 'MiniMax',
        group: '国内',
        baseUrl: 'https://api.minimaxi.com/v1',
        keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
        // 它的对话路径不是 /chat/completions，所以单独声明（这就是 path 这个字段存在的理由）
        path: '/text/chatcompletion_v2',
        note: '国内（api.minimaxi.com）与国际（api.minimax.io）的 key 不通用；对话路径非标准',
        models: [
            {id: 'MiniMax-M2', name: 'MiniMax M2'},
            {id: 'MiniMax-M1', name: 'MiniMax M1'},
            {id: 'MiniMax-Text-01', name: 'MiniMax Text 01', note: '便宜'}
        ]
    },
    {
        id: 'spark',
        name: '讯飞星火 Spark',
        group: '国内',
        baseUrl: 'https://spark-api-open.xf-yun.com/v1',
        keyUrl: 'https://console.xfyun.cn/services/bm4',
        note: '密钥填控制台「HTTP 服务接口认证信息」里的 APIPassword，不是 apiKey/apiSecret',
        models: [
            {id: '4.0Ultra', name: '星火 4.0 Ultra'},
            {id: 'generalv3.5', name: '星火 Max'},
            {id: 'lite', name: '星火 Lite', note: '免费档'}
        ]
    },
    {
        id: 'stepfun',
        name: '阶跃星辰 StepFun',
        group: '国内',
        baseUrl: 'https://api.stepfun.com/v1',
        keyUrl: 'https://platform.stepfun.com/interface-key',
        note: '国内（api.stepfun.com）与国际（api.stepfun.ai）的 key 不通用',
        models: [
            {id: 'step-3.5-flash', name: 'Step 3.5 Flash'},
            {id: 'step-2-16k', name: 'Step 2 16K'},
            {id: 'step-1v-8k', name: 'Step 1V 8K', supportsImage: true}
        ]
    },
    {
        id: 'together',
        name: 'Together AI',
        group: '聚合与云',
        baseUrl: 'https://api.together.xyz/v1',
        keyUrl: 'https://api.together.xyz/settings/api-keys',
        note: '预检不放行，网页版要自建代理；模型 id 带厂商前缀，大小写敏感',
        models: [
            {id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo'},
            {id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B'}
        ]
    },
    {
        id: 'fireworks',
        name: 'Fireworks AI',
        group: '聚合与云',
        baseUrl: 'https://api.fireworks.ai/inference/v1',
        keyUrl: 'https://fireworks.ai/account/api-keys',
        note: '跨域实测放行；模型 id 形如 accounts/fireworks/models/…',
        models: [
            {id: 'accounts/fireworks/models/qwen3-235b-a22b', name: 'Qwen3 235B'},
            {id: 'accounts/fireworks/models/llama-v3p1-8b-instruct', name: 'Llama 3.1 8B'}
        ]
    },
    {
        id: 'cerebras',
        name: 'Cerebras',
        group: '聚合与云',
        baseUrl: 'https://api.cerebras.ai/v1',
        keyUrl: 'https://cloud.cerebras.ai/',
        note: '跨域放行；出名的快，适合小模型',
        models: [
            {id: 'gpt-oss-120b', name: 'GPT-OSS 120B'},
            {id: 'llama3.1-8b', name: 'Llama 3.1 8B'}
        ]
    },
    {
        id: 'deepinfra',
        name: 'DeepInfra',
        group: '聚合与云',
        baseUrl: 'https://api.deepinfra.com/v1/openai',
        keyUrl: 'https://deepinfra.com/dash/api_keys',
        note: '模型 id 带厂商前缀',
        models: [
            {id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo'},
            {id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1'}
        ]
    }
];

/**
 * 全部可选供应商：预设 + 用户自己添加的（后者在前还是在后无所谓，界面上按 group 显示）
 * @returns {Array<object>} 供应商清单
 */
export const allProviders = () => PROVIDERS.concat(customProviders());

export const getProvider = id => allProviders().find(p => p.id === id) || PROVIDERS[0];

/**
 * 这家走哪条线格式
 * @param {object} provider 供应商条目
 * @returns {string} 'openai' | 'anthropic'
 */
export const wireOf = provider => (provider && provider.wire === 'anthropic' ? 'anthropic' : 'openai');

// 端点路径：默认按线格式取，供应商用 path 覆盖（MiniMax 那种非标准路径）
export const pathOf = provider => (provider && provider.path) ||
    (wireOf(provider) === 'anthropic' ? '/messages' : '/chat/completions');

/**
 * 这家要不要密钥。本地跑的端点（Ollama / vLLM / LM Studio）不要。
 * @param {object} provider 供应商条目
 * @param {string} baseUrl 实际用到的地址（可能是用户覆盖的）
 * @returns {boolean} 需要密钥
 */
export const keyRequired = (provider, baseUrl) =>
    !(provider.id === 'ollama' || isLocalBaseUrl(baseUrl || provider.baseUrl));

/**
 * 找出当前设置对应的「目录里的模型条目」。
 * 预设里没有的 id（比如刚从接口拉到的）返回一个只有 id 的壳，UI 照样能用。
 * @param {object} settings {providerId, modelId, models}  models 是拉取缓存
 * @returns {object|null} 模型条目
 */
export const resolveModel = settings => {
    if (!settings || !settings.modelId) return null;
    const provider = getProvider(settings.providerId);
    const fetched = (settings.models || []).find(m => m.id === settings.modelId);
    if (fetched) return fetched;
    return provider.models.find(m => m.id === settings.modelId) || {id: settings.modelId, name: settings.modelId};
};

/**
 * 当前生效的上下文窗口。优先级：用户在设置里填的 > 模型元数据声明的 > 兜底值。
 * @param {object} settings 当前设置
 * @param {number} fallback 目录里没写时的兜底窗口
 * @returns {number} 上下文窗口（token）
 */
export const contextWindowOf = (settings, fallback = 262144) => {
    const userSet = settings && Number(settings.contextWindow);
    if (userSet > 0) return userSet;
    return (resolveModel(settings) || {}).contextWindow || fallback;
};

/**
 * 当前生效的单次最大输出。优先级同上（模型元数据的 max_output_tokens > 8192 兜底）。
 * 用来在请求里带 max_tokens，防止模型一口气输出到失控（烧钱也烧上下文）。
 * @param {object} settings 当前设置
 * @param {number} fallback 元数据也没写时的兜底
 * @returns {number} 最大输出（token）
 */
export const maxOutputTokensOf = (settings, fallback = 8192) => {
    const userSet = settings && Number(settings.maxOutputTokens);
    if (userSet > 0) return userSet;
    return (resolveModel(settings) || {}).maxOutputTokens || fallback;
};

/**
 * 当前模型可否调思考档位（模型级 thinking: null 表示这家没有这个模型就砍掉）
 * @param {string} providerId 供应商 id
 * @param {string} modelId 模型 id
 * @returns {object|null} {field, levels} 或 null
 */
export const thinkingOf = (providerId, modelId) => {
    const provider = getProvider(providerId);
    const model = provider.models.find(m => m.id === modelId);
    if (model && model.thinking === null) return null;
    if (model && model.thinking) return model.thinking;
    if (provider.thinking) return provider.thinking;
    // 自定义的 Anthropic 端点：档位是协议定死的，直接用（OpenAI 兼容的不给 ——
    // 各家思考字段名不一样，猜一个塞过去会被严格校验的网关整条拒掉）
    return wireOf(provider) === 'anthropic' ? ANTHROPIC_THINKING : null;
};

// ---------------------------------------------------------------------------
// 从接口拉真实模型清单
// ---------------------------------------------------------------------------

// 各家 /models 的返回形状不一，这里按字段名挨个认。
// DeepSeek 给得最全：name / context_window / input_modalities / effort.supported_levels。
const normalizeModel = raw => {
    const id = raw.id || raw.model || raw.name;
    if (!id) return null;
    const modalities =
        raw.input_modalities || (raw.architecture && raw.architecture.input_modalities) || [];
    const hasImage = modalities.includes('image') ||
        /vl|vision|-v\b|v-flash/i.test(String(id)) ||
        !!(raw.modalities && raw.modalities.includes('image'));
    const effortInfo = raw.effort || {};
    const levels = effortInfo.supported_levels;
    const model = {
        id,
        // Anthropic 的 /models 用 display_name 当显示名
        name: raw.display_name || raw.name || id,
        supportsImage: hasImage,
        note: '（从接口拉到）'
    };
    if (typeof raw.context_window === 'number') model.contextWindow = raw.context_window;
    else if (typeof raw.context_length === 'number') model.contextWindow = raw.context_length;
    if (typeof raw.max_output_tokens === 'number') model.maxOutputTokens = raw.max_output_tokens;
    if (Array.isArray(levels) && levels.length) model.supportedLevels = levels;
    if (effortInfo.default_level) model.defaultLevel = effortInfo.default_level;
    return model;
};

/**
 * GET {baseUrl}/models，用用户自己的 key。失败就把错误抛出去，由界面显示。
 * @param {object} opts {providerId, baseUrl, apiKey, signal}
 * @returns {Promise<Array<object>>} 归一化后的模型清单
 */
export const fetchProviderModels = async ({providerId, baseUrl, apiKey, signal}) => {
    const provider = getProvider(providerId);
    const url = `${(baseUrl || provider.baseUrl || '').replace(/\/+$/, '')}/models`;
    if (!url || url === '/models') throw new Error('还没填 base_url');
    // 鉴权头按线格式给：Anthropic 要 x-api-key + 版本头，别的家是 Bearer
    const headers = authHeaders(wireOf(provider), apiKey);
    const response = await fetch(url, {headers, signal});
    if (!response.ok) throw new Error(await describeHttpError(response));
    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : (payload.data || payload.models || []);
    return list
        .map(normalizeModel)
        .filter(Boolean)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
};

// ---------------------------------------------------------------------------
// 请求体构造（纯函数）
// ---------------------------------------------------------------------------

// 内部消息 -> OpenAI 兼容的线上消息。工具的入参在这里才序列化成字符串。
//
// reasoning_content 的取舍：接口要求带 tool_calls 的 assistant 消息必须回传思考内容，
// 否则 400。但把**每一轮**的思考都带上会越滚越大（用户明确要求思考别堆进历史）。
// 折中（实测 200）：只回传**最后一条**带工具调用的 assistant 消息的思考，更早的剥掉 ——
// 接口接受，老的思考本来就是死重。
export const toWireMessages = messages => {
    let lastReasoningIndex = -1;
    messages.forEach((message, index) => {
        if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length && message.reasoning) {
            lastReasoningIndex = index;
        }
    });
    return messages.map((message, index) => {
        if (message.role === 'tool') {
            const images = message.images || [];
            if (!images.length) {
                return {
                    role: 'tool',
                    tool_call_id: message.toolCallId,
                    content: String(message.content === void 0 ? '' : message.content)
                };
            }
            // 图片走 content 数组：实测 DeepSeek 认得这种写法
            return {
                role: 'tool',
                tool_call_id: message.toolCallId,
                content: [
                    {type: 'text', text: String(message.content || '')},
                    ...images.map(image => ({
                        type: 'image_url',
                        image_url: {url: image.url}
                    }))
                ]
            };
        }
        if (message.role === 'assistant') {
            const wire = {role: 'assistant', content: message.content || null};
            if (message.toolCalls && message.toolCalls.length) {
                wire.tool_calls = message.toolCalls.map(call => ({
                    id: call.id,
                    type: 'function',
                    function: {name: call.name, arguments: JSON.stringify(call.input || {})}
                }));
                if (index === lastReasoningIndex && message.reasoning) {
                    wire.reasoning_content = message.reasoning;
                }
            }
            return wire;
        }
        return {role: message.role, content: message.content};
    });
};

export const toWireTools = tools => tools.map(tool => ({
    type: 'function',
    function: {
        name: tool.name,
        description: tool.description,
        // parameters 不能缺：严格校验的 OpenAI 兼容网关缺这个字段就整条请求 400
        parameters: toolParameters(tool)
    }
}));

/**
 * @param {object} opts {model, messages, tools, temperature, effort, thinking, maxTokens, includeUsage}
 * @returns {object} 请求体
 */
export const buildRequestBody = ({
    model, messages, tools, temperature, effort, thinking, maxTokens, includeUsage = true
}) => {
    const body = {
        model,
        stream: true,
        messages: toWireMessages(messages),
        ...(includeUsage ? {stream_options: {include_usage: true}} : {}),
        ...(tools && tools.length ? {tools: toWireTools(tools)} : {}),
        ...(typeof temperature === 'number' ? {temperature} : {}),
        // 单次输出上限：防失控（也防把上下文一次性吃光）。元数据或用户设置里有就带
        ...(maxTokens > 0 ? {max_tokens: maxTokens} : {})
    };
    // 思考档位：字段名与取值形态都由供应商声明，这里只负责拼进去
    if (thinking && effort) {
        const level = thinking.levels.find(item => item.value === effort);
        if (level) body[thinking.field] = level.wire;
    }
    return body;
};

// ---------------------------------------------------------------------------
// 云端模型
// ---------------------------------------------------------------------------

// 思考内容各家放在不同字段：DeepSeek/GLM/Kimi/Ark 是 reasoning_content，
// OpenRouter 是 reasoning 或 reasoning_details（数组）。
const reasoningOf = delta => {
    if (typeof delta.reasoning_content === 'string') return delta.reasoning_content;
    if (typeof delta.reasoning === 'string') return delta.reasoning;
    if (Array.isArray(delta.reasoning_details)) {
        return delta.reasoning_details
            .map(part => (part && (part.text || part.summary)) || '')
            .join('');
    }
    return '';
};

/**
 * onChunk 的返回值约定：`{stop: true}` 表示「这一路别再读了」——循环发现模型打转时这么叫停。
 * 不返回东西（undefined）就是照常继续，本地脚本模型可以完全不理会这个约定。
 *
 * @param {*} verdict onChunk 的返回值
 * @returns {boolean} 是否要当场掐断
 */
const isStop = verdict => verdict === true || !!(verdict && verdict.stop);

/**
 * OpenAI 兼容那条线（`POST {baseUrl}/chat/completions`）。
 * @param {object} config {providerId, modelId, apiKey, baseUrl, effort, model}
 * @param {object} options {idleTimeoutMs} 读超时
 * @param {object} provider 供应商条目（目录里的那份）
 * @returns {{name, cloud, supportsImage, contextWindow, complete}} 与本地脚本模型同形状
 */
const createOpenAICompatibleModel = (config, {idleTimeoutMs = 120000}, provider) => {
    const baseUrl = (config.baseUrl || provider.baseUrl || '').replace(/\/+$/, '');
    const modelId = config.modelId;
    const apiKey = config.apiKey;
    const meta = config.model || provider.models.find(m => m.id === modelId) || {id: modelId};
    const thinking = config.thinking === void 0 ? thinkingOf(config.providerId, modelId) : config.thinking;

    return {
        name: `${provider.name} · ${meta.name || modelId}`,
        contextWindow: meta.contextWindow,
        supportsImage: !!meta.supportsImage,
        cloud: true,

        async complete (messages, tools, {signal, onChunk = () => {}} = {}) {
            if (!baseUrl) throw new Error('没填 base_url');
            if (!apiKey && keyRequired(provider, baseUrl)) throw new Error('没填 API 密钥');

            const requestBody = buildRequestBody({
                model: modelId,
                messages,
                tools,
                effort: config.effort,
                thinking,
                maxTokens: config.maxOutputTokens,
                includeUsage: provider.includeUsage !== false
            });
            const response = await fetch(`${baseUrl}${pathOf(provider)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders('openai', apiKey)
                },
                body: JSON.stringify(requestBody),
                signal
            });
            if (!response.ok) throw new Error(await describeHttpError(response));
            if (!response.body) throw new Error('接口没有返回流式响应体');

            let text = '';
            let reasoning = '';
            // index -> {id, name, args}，args 只累加字符串
            const partial = new Map();
            let finishReason = null;
            let usage = null;
            let timedOut = false;
            // onChunk 可以返回 {stop: true} 把这一路流**当场掐断**（循环发现模型在打转时就这么干）。
            // 掐断不只是停止读：下面还会 cancel 响应体，服务端才会停止生成、不再往上计费。
            let stopped = false;

            let watchdog = null;
            const pulse = () => {
                if (watchdog) clearTimeout(watchdog);
                watchdog = setTimeout(() => {
                    timedOut = true;
                }, idleTimeoutMs);
            };

            try {
                pulse();
                read:
                for await (const payload of sseDataLines(response.body)) {
                    pulse();
                    if (payload === '[DONE]') break;
                    if (!payload) continue;
                    let chunk;
                    try {
                        chunk = JSON.parse(payload);
                    } catch (e) {
                        continue; // 半截或者心跳，跳过
                    }
                    if (chunk.usage) usage = chunk.usage;
                    const choice = chunk.choices && chunk.choices[0];
                    if (!choice) continue;
                    if (choice.finish_reason) finishReason = choice.finish_reason;
                    const delta = choice.delta || {};

                    const thought = reasoningOf(delta);
                    if (thought) {
                        reasoning += thought;
                        if (isStop(onChunk({kind: 'reasoning_delta', delta: thought}))) {
                            stopped = true;
                            break read;
                        }
                    }
                    if (delta.content) {
                        text += delta.content;
                        if (isStop(onChunk({kind: 'text_delta', delta: delta.content}))) {
                            stopped = true;
                            break read;
                        }
                    }
                    for (const call of delta.tool_calls || []) {
                        const index = typeof call.index === 'number' ? call.index : 0;
                        if (!partial.has(index)) partial.set(index, {id: call.id, name: '', args: ''});
                        const slot = partial.get(index);
                        if (call.id) slot.id = call.id;
                        if (call.function && call.function.name) slot.name = call.function.name;
                        // 关键：分片只累加，绝不在这里 parse
                        if (call.function && call.function.arguments) slot.args += call.function.arguments;
                    }
                }
            } finally {
                if (watchdog) clearTimeout(watchdog);
            }
            // 掐断要把连接也放掉，否则服务端还在那头继续生成
            if (stopped) {
                try {
                    await response.body.cancel();
                } catch (e) {
                    // 已经流完了就没什么可取消的
                }
            }
            if (timedOut) throw new Error('模型太久没有响应（读超时）');

            // 收尾才把参数串 parse 成对象；截断或非法的一律丢掉，别拿去执行
            const toolCalls = [];
            for (const slot of partial.values()) {
                if (!slot.name) continue;
                // 被掐断 / 被 max_tokens 截断时参数串必然是半截的，别 parse 更别执行
                if (finishReason === 'length' || stopped) continue;
                let input = {};
                if (slot.args) {
                    try {
                        input = JSON.parse(slot.args);
                    } catch (e) {
                        throw new Error(`模型给出的工具参数不是合法 JSON：${slot.args.slice(0, 200)}`);
                    }
                }
                toolCalls.push({id: slot.id || `call_${toolCalls.length}`, name: slot.name, input});
            }

            return {text, reasoning, toolCalls, finishReason, usage, stopped};
        }
    };
};

// ---------------------------------------------------------------------------
// 对外入口：按协议挑一条线
// ---------------------------------------------------------------------------

/**
 * 造一个云端模型（与本地脚本模型同形状：{name, cloud, supportsImage, contextWindow, complete}）。
 * 协议分派就这一处：Anthropic 那条线在 anthropic.js 里，循环和工具都不知道这回事。
 * @param {object} config {providerId, modelId, apiKey, baseUrl, effort, model}
 * @param {object} options {idleTimeoutMs} 读超时（两次事件之间），不是整请求超时
 * @returns {object} 模型
 */
export const createCloudModel = (config, options = {}) => {
    const provider = getProvider(config.providerId);
    if (wireOf(provider) === 'anthropic') {
        return createAnthropicModel(config, {
            ...options,
            providerName: provider.name,
            // 非标准路径（自定义供应商那栏填的，或 MiniMax 那种预设）走它
            path: provider.path || void 0
        });
    }
    return createOpenAICompatibleModel(config, options, provider);
};
