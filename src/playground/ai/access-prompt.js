/**
 * 「外部接入」里那段可以直接粘给 AI 的话。
 *
 * 为什么给一整段话，而不只给命令：能挂 MCP 的客户端（Claude Code / ZCode / Cursor）
 * 配 MCP 更好用，但还有一堆 agent 只会跑 shell，或者用户懒得去改配置。一段话里两种
 * 接法都写着，对方能用哪种就用哪种，用户只需要粘一次。
 *
 * 语言跟编辑器走：documentElement.lang 由 index.html 的 currentLocale 写进去，
 * 拿不到就退回浏览器语言，再拿不到就英文。用户手动切过的选择存 localStorage，
 * 下次进来不再猜。
 */

/* eslint-disable max-len -- 提示词是给 AI 读的散文，按语义断行，不按 120 列断 */
const STORE_KEY = 'xceAccessPromptLang';

export const PROMPT_LANGS = [
    {id: 'zh', label: '简体'},
    {id: 'zh-TW', label: '繁體'},
    {id: 'en', label: 'English'},
    {id: 'ja', label: '日本語'}
];

const LANGS = PROMPT_LANGS.map(lang => lang.id);

// 编辑器当前是什么语言（不依赖 react-intl：面板本身还没接 i18n，这里只认 html[lang]）
export const detectPromptLang = () => {
    let raw = '';
    try {
        raw = `${document.documentElement.lang || ''}|${navigator.language || ''}`;
    } catch (error) {
        raw = '';
    }
    const lower = raw.toLowerCase();
    if (/zh-(tw|hk|mo|hant)/.test(lower)) return 'zh-TW';
    if (/zh/.test(lower)) return 'zh';
    if (/ja/.test(lower)) return 'ja';
    return 'en';
};

export const savedPromptLang = () => {
    try {
        const saved = window.localStorage.getItem(STORE_KEY);
        return LANGS.indexOf(saved) === -1 ? null : saved;
    } catch (error) {
        return null;
    }
};

export const savePromptLang = lang => {
    try {
        window.localStorage.setItem(STORE_KEY, lang);
    } catch (error) {
        // 存不了就算了，下次重新按编辑器语言猜
    }
};

const COMMAND = 'npx -y @caellab/xce-cli@latest';

const BUILDERS = {
    'zh': ({url, key}) => `你在操作我屏幕上打开的 XMUER Coding Engine（积木式编程编辑器，Scratch 那一类）。这条通道是实时的：你改了什么，我屏幕上立刻能看到。

接口：${url}
密钥：${key}

第一步，看有哪些工具（清单跟着编辑器版本变，别凭记忆猜；第一次会下载，之后走缓存）：
${COMMAND} tools --url ${url} --key ${key}

第二步，调用一个工具：
${COMMAND} call <工具名> '{"参数":"值"}' --url ${url} --key ${key}

如果你能挂 MCP，更省事——工具会直接进你的工具列表，不用每次敲命令：
claude mcp add xce -- ${COMMAND} mcp --url ${url} --key ${key}

几条规矩：
- 写之前先读：先用读取类工具拿到角色名和现有脚本，不要猜角色名。
- 一次改一处，改动小一点，我好跟、好撤销。
- 我可能同时在编辑器里动手。遇到 E_BUSY 或超时，等一会儿再看，不要死循环重试。
- 报 E_NO_EDITOR 说明我没打开项目，提醒我打开就行，重试没用。
- 连不上就先跑 ${COMMAND} doctor --url ${url} --key ${key}，它会说清是哪一段断了。
- 别把密钥原样打印给我，也别写进任何项目文件。`,

    'zh-TW': ({url, key}) => `你在操作我螢幕上開啟的 XMUER Coding Engine（積木式程式設計編輯器，Scratch 那一類）。這條通道是即時的：你改了什麼，我螢幕上立刻看得到。

介面：${url}
金鑰：${key}

第一步，看有哪些工具（清單跟著編輯器版本變，別憑記憶猜；第一次會下載，之後走快取）：
${COMMAND} tools --url ${url} --key ${key}

第二步，呼叫一個工具：
${COMMAND} call <工具名> '{"參數":"值"}' --url ${url} --key ${key}

如果你能掛 MCP，會更省事——工具直接進你的工具清單，不用每次敲指令：
claude mcp add xce -- ${COMMAND} mcp --url ${url} --key ${key}

幾條規矩：
- 寫之前先讀：先用讀取類工具拿到角色名稱和現有腳本，不要猜角色名稱。
- 一次改一處，改動小一點，我好跟、好復原。
- 我可能同時在編輯器裡動手。遇到 E_BUSY 或逾時，等一會兒再看，不要死迴圈重試。
- 出現 E_NO_EDITOR 表示我沒開啟專案，提醒我開啟就好，重試沒用。
- 連不上就先跑 ${COMMAND} doctor --url ${url} --key ${key}，它會說清楚是哪一段斷了。
- 別把金鑰原樣印給我，也別寫進任何專案檔案。`,

    'en': ({url, key}) => `You can operate the XMUER Coding Engine editor open on my screen (a block-based editor, Scratch-like). The channel is live — whatever you change shows up in front of me immediately.

Endpoint: ${url}
API key: ${key}

Step 1, list the tools (the list follows the editor build, so don't guess; the first run downloads, later runs are cached):
${COMMAND} tools --url ${url} --key ${key}

Step 2, call one:
${COMMAND} call <tool> '{"arg":"value"}' --url ${url} --key ${key}

If you can add MCP servers, that's smoother — the tools show up in your own tool list:
claude mcp add xce -- ${COMMAND} mcp --url ${url} --key ${key}

Rules:
- Read before writing: start with a read tool to get the real sprite names and current scripts. Don't invent them.
- One change per call — small edits are easy for me to follow and undo.
- I may be editing in the panel at the same time. On E_BUSY or a timeout, wait and look again instead of retrying in a loop.
- E_NO_EDITOR means I have no project open. Ask me to open one; retrying won't help.
- If it won't connect, run ${COMMAND} doctor --url ${url} --key ${key} — it names the hop that's broken.
- Never print the key back to me in full, and never write it into project files.`,

    'ja': ({url, key}) => `あなたは今、私の画面で開いている XMUER Coding Engine（Scratch 系のブロックプログラミングエディタ）を操作できます。この経路はリアルタイムで、あなたが変えた内容はそのまま私の画面に反映されます。

エンドポイント：${url}
API キー：${key}

まずツール一覧を見てください（一覧はエディタのバージョンで変わります。記憶で推測しないこと。初回はダウンロードが入り、以降はキャッシュされます）：
${COMMAND} tools --url ${url} --key ${key}

呼び出しはこうです：
${COMMAND} call <ツール名> '{"引数":"値"}' --url ${url} --key ${key}

MCP を追加できるなら、そのほうが楽です。ツールがそのまま一覧に並びます：
claude mcp add xce -- ${COMMAND} mcp --url ${url} --key ${key}

ルール：
- 書く前に読む：まず読み取り系ツールでスプライト名と現在のスクリプトを取る。名前を想像で埋めない。
- 一度に一箇所だけ変える。小さな変更のほうが追えて戻せます。
- 私も同時にパネルを触っていることがあります。E_BUSY やタイムアウトなら少し待ってから見直し、ループで再試行しないこと。
- E_NO_EDITOR はプロジェクトが開かれていない合図。開いてもらう。再試行しても無駄です。
- つながらないときは ${COMMAND} doctor --url ${url} --key ${key} を実行すれば、どこで切れているか分かります。
- キーをそのまま表示しないこと。プロジェクトのファイルにも書かないこと。`
};

// 认不出来的语言一律退回英文（不猜、不留空）
export const buildAccessPrompt = ({url, key, lang}) => {
    if (!url || !key) return '';
    const build = BUILDERS[lang] || BUILDERS.en;
    return build({url, key});
};
