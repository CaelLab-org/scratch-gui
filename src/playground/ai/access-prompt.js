/**
 * 「外部接入」里那段可以直接粘给 AI 的说明书正文。
 *
 * 写法：**说明书，不是任务书** —— 不假设用户让它干什么，只把「这是什么东西、怎么连、
 * 有哪些命令、什么不能做」按节列清楚。用户粘完再补自己的需求，agent 两边都读得懂。
 *
 * 为什么同时给命令行和 MCP：能挂 MCP 的客户端（Claude Code / ZCode / Cursor）配 MCP 更省事，
 * 但还有一堆 agent 只会跑 shell。说明书里两条都列，对方能用哪种就用哪种。
 *
 * 语言跟编辑器走：documentElement.lang 由 index.html 的 currentLocale 写进去，
 * 拿不到就退回浏览器语言，再拿不到就英文。用户手动切过的选择存 localStorage。
 */

/* eslint-disable max-len -- 说明书是给 AI 读的散文，按语义断行，不按 120 列断 */
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
    'zh': ({url, key}) => `XMUER Coding Engine · 编辑器接口说明

一、这是什么
我屏幕上开着 XMUER Coding Engine 桌面版，里面有一个正在编辑的项目（积木式编程编辑器，Scratch 那一类）。下面这条接口可以读它、改它。改动是实时的：调用返回的时候，我屏幕上已经是新的样子。

二、连接
  地址
    ${url}
  密钥
    ${key}

三、命令行（推荐；首次运行会下载包，之后走缓存）
  ${COMMAND} call xce_read_instructions '{}' --url ${url} --key ${key}
      → 编辑器自己的说明（项目规矩、工具用法、积木文本格式）。先读这份，再动手。
  ${COMMAND} tools --url ${url} --key ${key}
      → 列出全部工具和它们的参数结构。先跑这个，清单跟着编辑器版本变。
  ${COMMAND} call <工具名> '<JSON 参数>' --url ${url} --key ${key}
      → 调用一个工具，返回 {"ok":true,"content":"..."}。
  ${COMMAND} doctor --url ${url} --key ${key}
      → 连不上时用，它会指出断在哪一段。

四、MCP（客户端支持时更省事：工具直接进你的工具列表）
  claude mcp add xce -- ${COMMAND} mcp --url ${url} --key ${key}

五、约定
  - 先跑 instructions 和 tools，再调用；工具名和参数不要凭记忆猜。
  - MCP 客户端若没把说明交给模型，先调工具 xce_read_instructions。
  - 先读后写：先取角色名和现有脚本，再动手；角色名同样不要猜。
  - 一次只改一处，便于我核对和撤销。
  - 音频等大文件：先 POST 原始字节到 /v1/assets，再把返回的 assetId 交给对应工具；小片段可以直接用 data 或 url。
  - E_BUSY 或超时 = 我正在面板里操作：稍后再看，不要连续重试。
  - E_NO_EDITOR = 我没有打开项目：提醒我打开，重试无效。
  - 密钥只用于这条接口：不要原样回显给我，也不要写进项目文件。`,

    'zh-TW': ({url, key}) => `XMUER Coding Engine · 編輯器介面說明

一、這是什麼
我螢幕上開著 XMUER Coding Engine 桌面版，裡面有一個正在編輯的專案（積木式程式設計編輯器，Scratch 那一類）。下面這條介面可以讀它、改它。改動是即時的：呼叫回來的時候，我螢幕上已經是新樣子。

二、連線
  位址
    ${url}
  金鑰
    ${key}

三、命令列（建議；首次執行會下載套件，之後走快取）
  ${COMMAND} call xce_read_instructions '{}' --url ${url} --key ${key}
      → 編輯器自己的說明（專案規矩、工具用法、積木文字格式）。先讀這份再動手。
  ${COMMAND} tools --url ${url} --key ${key}
      → 列出全部工具與它們的參數結構。先跑這個，清單跟著編輯器版本變。
  ${COMMAND} call <工具名> '<JSON 參數>' --url ${url} --key ${key}
      → 呼叫一個工具，回傳 {"ok":true,"content":"..."}。
  ${COMMAND} doctor --url ${url} --key ${key}
      → 連不上時使用，它會指出斷在哪一段。

四、MCP（用戶端支援時更省事：工具直接進你的工具清單）
  claude mcp add xce -- ${COMMAND} mcp --url ${url} --key ${key}

五、約定
  - 先跑 instructions 和 tools，再呼叫；工具名和參數不要憑記憶猜。
  - MCP 用戶端若沒把說明交給模型，先呼叫工具 xce_read_instructions。
  - 先讀後寫：先取角色名稱和現有腳本，再動手；角色名稱同樣不要猜。
  - 一次只改一處，方便我核對和復原。
  - 音訊等大檔案：先 POST 原始位元組到 /v1/assets，再把回傳的 assetId 交給對應工具；小片段可以直接用 data 或 url。
  - E_BUSY 或逾時 = 我正在面板裡操作：稍後再看，不要連續重試。
  - E_NO_EDITOR = 我沒有開啟專案：提醒我開啟，重試無效。
  - 金鑰只用於這條介面：不要原樣回顯給我，也不要寫進專案檔案。`,

    'en': ({url, key}) => `XMUER Coding Engine · editor API reference

1. What this is
The XMUER Coding Engine desktop app is open on my screen with a project loaded (a block-based editor, Scratch-like). The endpoint below reads and changes that project. Changes are live: by the time a call returns, my screen already shows them.

2. Connection
  Endpoint
    ${url}
  API key
    ${key}

3. Command line (recommended; the first run downloads the package, later runs are cached)
  ${COMMAND} call xce_read_instructions '{}' --url ${url} --key ${key}
      → the editor's own instructions (project rules, tool usage, block text format). Read this first.
  ${COMMAND} tools --url ${url} --key ${key}
      → lists every tool with its argument schema. Run this too; the list follows the editor build.
  ${COMMAND} call <tool> '{"arg":"value"}' --url ${url} --key ${key}
      → calls one tool, returns {"ok":true,"content":"..."}.
  ${COMMAND} doctor --url ${url} --key ${key}
      → when it won't connect, names the hop that's broken.

4. MCP (smoother when your client supports it: the tools appear in your own tool list)
  claude mcp add xce -- ${COMMAND} mcp --url ${url} --key ${key}

5. Ground rules
  - Run instructions and tools first; never guess tool names or arguments from memory.
  - If your MCP client did not pass the instructions to the model, call the xce_read_instructions tool.
  - Read before writing: fetch sprite names and current scripts first. Don't invent names.
  - One change per call — small edits are easy for me to check and undo.
  - Audio and other large files: POST the raw bytes to /v1/assets first, then pass the returned assetId to the tool. Small clips can use data or url directly.
  - E_BUSY or a timeout means I'm working in the panel; look again later, don't retry in a loop.
  - E_NO_EDITOR means no project is open; ask me to open one, retrying won't help.
  - The key is only for this endpoint: never echo it back to me, never write it into project files.`,

    'ja': ({url, key}) => `XMUER Coding Engine · エディタ API リファレンス

1. これは何か
私の画面では XMUER Coding Engine のデスクトップ版が開いていて、編集中のプロジェクトが読み込まれています（Scratch 系のブロックプログラミングエディタ）。下のエンドポイントからそのプロジェクトを読み書きできます。変更はリアルタイムで、呼び出しが返るころには私の画面はもう新しい状態です。

2. 接続情報
  エンドポイント
    ${url}
  API キー
    ${key}

3. コマンドライン（推奨。初回はパッケージをダウンロードし、以降はキャッシュ）
  ${COMMAND} call xce_read_instructions '{}' --url ${url} --key ${key}
      → エディタ自身の説明（プロジェクトの決まり、ツールの使い方、ブロックの記法）。まずこれを読んでください。
  ${COMMAND} tools --url ${url} --key ${key}
      → すべてのツールと引数のスキーマを一覧します。これも実行してください。一覧はエディタのバージョンで変わります。
  ${COMMAND} call <ツール名> '{"引数":"値"}' --url ${url} --key ${key}
      → ツールを 1 つ呼び出します。戻り値は {"ok":true,"content":"..."}。
  ${COMMAND} doctor --url ${url} --key ${key}
      → つながらないときの切り分け。どこで切れているかを示します。

4. MCP（対応クライアントならこちらが楽です。ツールが自分の一覧に並びます）
  claude mcp add xce -- ${COMMAND} mcp --url ${url} --key ${key}

5. 決まりごと
  - まず instructions と tools。ツール名と引数を記憶で推測しないこと。
  - MCP クライアントが説明をモデルに渡していない場合は、ツール xce_read_instructions を呼ぶこと。
  - 書く前に読む：スプライト名と現在のスクリプトを先に取得する。名前を想像で埋めない。
  - 一度に一箇所だけ変える。小さな変更のほうが確認も取り消しも楽です。
  - 音声などの大きなファイルは、先に生バイトを /v1/assets へ POST し、返った assetId をツールに渡す。短いものは data や url でよい。
  - E_BUSY やタイムアウトは私がパネルを操作中という合図。少し待ってから見直し、連続再試行はしないこと。
  - E_NO_EDITOR はプロジェクトが開かれていない合図。開いてもらう。再試行しても無駄です。
  - キーはこのエンドポイント専用：そのまま表示しない。プロジェクトのファイルにも書かないこと。`
};

// 认不出来的语言一律退回英文（不猜、不留空）
export const buildAccessPrompt = ({url, key, lang}) => {
    if (!url || !key) return '';
    const build = BUILDERS[lang] || BUILDERS.en;
    return build({url, key});
};
