// transfer.js 的无头自测：导出形状 / 认格式 / 合并（覆盖同名、保留本地独有）/ 不带密钥那种
// 用法：node src/playground/ai/transfer.test.mjs
// 这一串模块在浏览器里读 document.cookie / localStorage，所以先搭桩再动态 import
/* eslint-disable no-console, no-undef */
const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

// ---- cookie 桩（够用的一个 jar）----
let cookieJar = '';
globalThis.document = {
    get cookie () {
        return cookieJar;
    },
    set cookie (value) {
        const [pair] = String(value).split(';');
        const eq = pair.indexOf('=');
        if (eq === -1) return;
        const name = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1);
        const rest = cookieJar.split('; ')
            .filter(part => part && !part.startsWith(`${name}=`));
        if (val) rest.push(`${name}=${val}`);
        cookieJar = rest.join('; ');
    }
};

// ---- localStorage 桩 ----
const store = new Map();
globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
};

const {collectConfig, configFileName, parseConfig, mergeConfig, CONFIG_EXTENSION} =
    await import('./transfer.js');
const {loadSettings, saveSettings, mergeProviderKeys} = await import('./settings.js');
const {saveCustomProviders, loadCustomProviders} = await import('./custom-providers.js');
const {clearMemories, loadMemories} = await import('./memory.js');
const {clearUserSkills, loadUserSkills, saveUserSkill} = await import('./user-skills.js');
const {collectChatFile, chatFileName, parseChat, CHAT_EXTENSION} = await import('./transfer.js');
const {saveConversation, planChatImport, applyChatImport} = await import('./store.js');

// ---------- 1. 文件名 ----------
const name = configFileName(new Date(2026, 9, 4));
check('文件名带日期与 .output.xce 后缀',
    name === `xce-ai-config-20261004${CONFIG_EXTENSION}`, name);

// ---------- 2. 导出形状 ----------
saveSettings({
    ...loadSettings(),
    providerId: 'deepseek',
    modelId: 'deepseek-chat',
    effort: 'high',
    contextWindow: 128000,
    maxOutputTokens: 8000,
    maxSteps: 20,
    userPrompt: '回答别超过三句话'
});
mergeProviderKeys({deepseek: 'sk-deepseek-1', moonshot: 'sk-moonshot-2'});
saveCustomProviders([{id: 'mine-1', name: '公司网关', wire: 'openai', baseUrl: 'https://gw.example/v1'}]);
clearMemories();
const {saveMemory} = await import('./memory.js');
saveMemory({name: '称呼', description: '怎么称呼用户', type: 'user', body: '叫云云'});
clearUserSkills();
saveUserSkill({name: 'my_guide', description: '我的笔记', body: '# 正文'});

const config = collectConfig();
check('带格式标记与版本', config.format === 'xce-ai-config' && config.version === 1 &&
    config.app === 'XMUER Coding Engine');
check('设置本体在（不含密钥字段）',
    config.settings.providerId === 'deepseek' &&
    config.settings.modelId === loadSettings().modelId &&
    config.settings.apiKey === void 0 && config.settings.userPrompt === '回答别超过三句话',
    JSON.stringify(config.settings));
check('密钥默认带上（两家都在）',
    config.keys.deepseek === 'sk-deepseek-1' && config.keys.moonshot === 'sk-moonshot-2');
check('不带密钥时 keys 是 null（导入端据此不动本地密钥）',
    collectConfig({includeKeys: false}).keys === null);
check('自定义供应商在', config.customProviders.length === 1 &&
    config.customProviders[0].baseUrl === 'https://gw.example/v1');
check('记忆带全字段（正文也要带上，否则导过去就空壳了）',
    config.memories.length === 1 && config.memories[0].body === '叫云云');
check('技能在', config.skills.length === 1 && config.skills[0].name === 'my_guide');
check('不含对话记录', config.conversations === void 0);

// 导出的东西必须是能过 JSON 的（文件就是 JSON）
const text = JSON.stringify(config, null, 2);
check('能序列化成 JSON 文本', typeof JSON.parse(text) === 'object');

// ---------- 3. 认格式：不像自家文件就不认 ----------
check('不是 JSON 直接拒', !!parseConfig('这不是 json').error);
const alien = parseConfig(JSON.stringify({format: 'something-else', version: 1}));
check('format 不对拒掉并说明', !!alien.error && /不是 XCE/.test(alien.error), alien.error);
const future = parseConfig(JSON.stringify({format: 'xce-ai-config', version: 99}));
check('版本比编辑器新就拒掉', !!future.error && /版本/.test(future.error), future.error);
check('自家文件认得出来', !parseConfig(text).error);

// ---------- 4. 合并：文件覆盖同名、本地独有保留 ----------
// 本机现状：另一家的密钥 + 另一个自定义供应商 + 另一条记忆
mergeProviderKeys({aliyun: 'sk-aliyun-9'});
saveCustomProviders(loadCustomProviders()
    .concat([{id: 'mine-2', name: '本地网关', wire: 'openai', baseUrl: 'https://local.example/v1'}]));
saveMemory({name: '本地记忆', description: '只有本机有', type: 'project', body: 'x'});
saveUserSkill({name: 'local_skill', description: '本机技能', body: 'y'});

// 这份待导入的文件里：一条同名（要更新）+ 一条新的（要新增），技能同理
const incoming = {
    ...config,
    memories: [
        {...config.memories[0], description: '改过的描述', body: '叫云云，13 岁'},
        {name: '新记忆', description: '文件里才有的', type: 'project', body: 'n'}
    ],
    skills: [
        {...config.skills[0], description: '改过的', body: '# 新正文'},
        {name: 'new_skill', description: '文件里的技能', body: 'body'}
    ]
};
const summary = mergeConfig(incoming);
check('设置被文件里的值覆盖', loadSettings().modelId === config.settings.modelId &&
    loadSettings().userPrompt === '回答别超过三句话' && loadSettings().contextWindow === 128000,
`modelId=${loadSettings().modelId} ctx=${loadSettings().contextWindow}`);
check('密钥合并：文件里的那条覆盖，本机独有的留着',
    collectConfig().keys.deepseek === 'sk-deepseek-1' &&
    collectConfig().keys.aliyun === 'sk-aliyun-9');
check('自定义供应商合并不是替换（两条都在）',
    loadCustomProviders().length === 2 &&
    loadCustomProviders().some(item => item.id === 'mine-2'));
check('供应商清单认了一家', summary.providers.updated === 1 && summary.providers.added === 0,
    JSON.stringify(summary.providers));
check('记忆按名字合并：没见过的补上、见过的更新',
    loadMemories().length === 3 && summary.memories.added === 1 && summary.memories.updated === 1,
    JSON.stringify(summary.memories));
check('同名记忆是更新不是重复',
    loadMemories().filter(item => item.name === '称呼').length === 1 &&
    loadMemories().find(item => item.name === '称呼').body === '叫云云，13 岁');
check('本地独有的记忆一个字没动', loadMemories().some(item => item.name === '本地记忆'));
check('技能按名字合并（本机那份留着）',
    loadUserSkills().length === 3 && summary.skills.updated === 1 && summary.skills.added === 1 &&
    loadUserSkills().some(item => item.name === 'local_skill'),
    JSON.stringify(summary.skills));
check('摘要说清了合并了什么', summary.settings.includes('模型与限额') &&
    summary.settings.includes('自定义提示词') && summary.warnings.length === 0,
JSON.stringify(summary.settings));

// ---------- 5. 不带密钥的文件：不许动本地那把钥匙 ----------
const noKeys = collectConfig({includeKeys: false});
mergeProviderKeys({deepseek: 'sk-local-after'});
const second = mergeConfig(noKeys);
check('文件里没密钥就不覆盖本地密钥',
    collectConfig().keys.deepseek === 'sk-local-after' && second.keys === 0);
check('并且明确提醒了', second.warnings.some(item => /没带密钥/.test(item)),
    JSON.stringify(second.warnings));

// ---------- 6. 只有清单的老文件（没有 settings）：其余照样合并，但要提醒 ----------
const listOnly = mergeConfig({
    settings: void 0,
    memories: [{name: '只有清单', description: 'd', type: 'project', body: 'b'}]
});
check('缺设置本体也照常合并清单，并提醒',
    listOnly.warnings.some(item => /没有设置本体/.test(item)) &&
    loadMemories().some(item => item.name === '只有清单'));

// ---------- 7. 坏条目不许把整份导入带崩 ----------
const dirty = mergeConfig({
    settings: {},
    memories: [null, {description: '没有名字'}, {name: '好的', description: 'd', type: 'project', body: 'b'}],
    skills: [{name: '中文名字', body: 'x'}, {name: 'fine_one', body: 'ok'}],
    customProviders: [null, {id: 'x'}, {id: 'mine-3', baseUrl: 'https://ok.example/v1'}]
});
check('坏记忆条目跳过、好条目照进',
    loadMemories().some(item => item.name === '好的'));
check('非法技能名进不去、并且写进了警告',
    !loadUserSkills().some(item => item.name === '中文名字') &&
    dirty.warnings.some(item => /技能/.test(item)));
check('没有 baseUrl 的供应商条目跳过',
    loadCustomProviders().some(item => item.id === 'mine-3') &&
    !loadCustomProviders().some(item => item.id === 'x'));

// ---------- 8. 对话记录文件（.chat.xce）：文件名 / 格式 / 往返 ----------
check('对话文件名单条带标题、整库叫 all',
    chatFileName('帮我做个游戏', new Date(2026, 9, 5)) === `xce-chat-帮我做个游戏-20261005${CHAT_EXTENSION}` &&
    chatFileName('', new Date(2026, 9, 5)) === `xce-chat-all-20261005${CHAT_EXTENSION}`);
check('文件名里的标题洗掉了路径分隔符和禁字符',
    chatFileName('a/b\\c:d*e?f"g<h>i|j', new Date(2026, 9, 5))
        .includes('abcdefghij'));

// 造两条对话进库，导出 → 认格式 → 预检 → 合并，走一遍整链
const idX = `x-${Date.now().toString(36)}`;
const idY = `y-${Date.now().toString(36)}`;
saveConversation(idX, {messages: [{role: 'user', content: '第一条'}], toolCalls: []}, []);
saveConversation(idY, {messages: [{role: 'user', content: '第二条'}], toolCalls: []}, []);

const single = collectChatFile([idX]);
check('单条导出只带一条', single.conversations.length === 1 &&
    single.conversations[0].messages[0].content === '第一条');
check('导出文件带格式标记与版本', single.format === 'xce-ai-chat' && single.version === 1);
check('整库导出条数不少于库里两条', collectChatFile(null).conversations.length >= 2);

check('认得出自家的对话文件', parseChat(JSON.stringify(single)).conversations.length === 1);
check('坏 JSON 拒收', !!parseChat('{oops').error);
check('空内容拒收', !!parseChat('').error);
check('拿错文件会提示去哪导',
    parseChat(JSON.stringify(collectConfig())).error.includes('配置文件'));
check('不是自家的格式拒收', !!parseChat(JSON.stringify({format: 'other', version: 1, conversations: []})).error);
check('版本太新拒收', !!parseChat(JSON.stringify({...single, version: 99})).error);
check('没有对话列表拒收', !!parseChat(JSON.stringify({format: 'xce-ai-chat', version: 1})).error);

// 往返：把导出的文件在同一个库上再导回来 —— 两条全撞车（同 id），没有全新的
const roundTrip = parseChat(JSON.stringify(collectChatFile(null)));
const plan = planChatImport(roundTrip.conversations);
check('同库往返：预检全是撞车、没有全新', plan.conflicts.length >= 2 && plan.fresh === 0);
const merged = applyChatImport(roundTrip.conversations, 'local');
check('同库往返 local：一条没动一条没加', merged.added === 0 && merged.kept === plan.conflicts.length);


console.log(failures.length ? `\n${failures.length} 项失败` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
