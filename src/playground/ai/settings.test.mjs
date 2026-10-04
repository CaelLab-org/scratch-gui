// settings.js 的无头自测：老「自定义」设置迁移 + 每家一把钥匙 + 本地端点免密钥
// 用法：node src/playground/ai/settings.test.mjs
// 这个模块在浏览器里读 document.cookie / localStorage，所以先把这两个桩搭起来再动态 import
/* eslint-disable no-console */
const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

// ---- cookie 桩：够用的一个 jar ----
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

const {loadSettings, saveSettings, clearSettings, hasApiKey, loadProviderKey} =
    await import('./settings.js');
const {getProvider, allProviders, PROVIDERS, wireOf, keyRequired} =
    await import('./providers.js');
const {saveCustomProviders, loadCustomProviders, newCustomProviderId} = await import('./custom-providers.js');

// ---------- 1. 目录 ----------
check('预设里有 Anthropic 且声明了 anthropic 线格式',
    wireOf(getProvider('anthropic')) === 'anthropic', getProvider('anthropic').baseUrl);
check('预设都带分组（下拉要按组分）',
    PROVIDERS.every(p => !!p.group), `${PROVIDERS.length} 家`);
check('没有密钥的本地端点不算缺密钥',
    !keyRequired(getProvider('ollama'), '') && hasApiKey({providerId: 'ollama', baseUrl: '', apiKey: ''}));
check('云供应商没密钥就算缺',
    hasApiKey({providerId: 'deepseek', baseUrl: 'https://api.deepseek.com', apiKey: ''}) === false);

// ---------- 2. 各家一把钥匙 ----------
saveSettings({providerId: 'deepseek', baseUrl: 'https://api.deepseek.com', modelId: 'm', apiKey: 'sk-deep'});
saveSettings({providerId: 'glm', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', modelId: 'm', apiKey: 'sk-glm'});
check('换一家不会把上一家的钥匙冲掉',
    loadProviderKey('deepseek') === 'sk-deep' && loadProviderKey('glm') === 'sk-glm',
    `${loadProviderKey('deepseek')}/${loadProviderKey('glm')}`);
check('读设置时带上当前这家自己的钥匙', loadSettings().apiKey === 'sk-glm', loadSettings().apiKey);
saveSettings({providerId: 'glm', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', modelId: 'm', apiKey: ''});
check('清空某家的钥匙只清它自己',
    loadProviderKey('glm') === '' && loadProviderKey('deepseek') === 'sk-deep');

// ---------- 3. 自定义供应商 ----------
const entry = {id: newCustomProviderId(), name: '我的网关', wire: 'anthropic', baseUrl: 'https://gw.example/v1'};
saveCustomProviders([entry]);
check('自定义供应商进得了目录（预设 + 自定义）',
    allProviders().some(p => p.id === entry.id) && getProvider(entry.id).name === '我的网关' &&
    wireOf(getProvider(entry.id)) === 'anthropic');
check('自定义条目标了 custom，界面据此判断', getProvider(entry.id).custom === true);
check('自定义的 Anthropic 端点也有思考档位（协议定死的字段，可以大胆给）',
    !!getProvider('anthropic').thinking && getProvider(entry.id).wire === 'anthropic');

// ---------- 4. 老设置的迁移 ----------
cookieJar = '';
store.clear();
saveCustomProviders([]);
document.cookie = `xce_ai_model=${encodeURIComponent(JSON.stringify({
    providerId: 'custom',
    baseUrl: 'https://legacy-gw.example/v1',
    modelId: 'agnes-3.0-flash',
    apiKey: 'sk-legacy',
    effort: ''
}))}`;
const migrated = loadSettings();
check('老「自定义」被搬成列表里的一条并选中',
    migrated.providerId !== 'custom' &&
    loadCustomProviders().some(p => p.id === migrated.providerId), migrated.providerId);
check('老设置的地址、密钥、模型名一个都没丢',
    migrated.baseUrl === 'https://legacy-gw.example/v1' &&
    migrated.apiKey === 'sk-legacy' &&
    migrated.modelId === 'agnes-3.0-flash',
    JSON.stringify({baseUrl: migrated.baseUrl, key: migrated.apiKey, model: migrated.modelId}));
check('再读一次不会又加一条（迁移是幂等的）',
    loadCustomProviders().filter(p => p.id === migrated.providerId).length === 1);

// ---------- 5. 清除 ----------
clearSettings();
check('清除密钥后各家的钥匙都没了',
    loadProviderKey('deepseek') === '' && loadProviderKey('glm') === '');
check('清除后自定义供应商清单还在（那不是密钥）',
    loadCustomProviders().some(p => p.id === migrated.providerId));

console.log(failures.length ? `\n❌ ${failures.length} 项失败：${failures.join('; ')}` : '\n✅ 全部通过');
process.exit(failures.length ? 1 : 0);
