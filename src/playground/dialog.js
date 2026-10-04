/**
 * 应用内对话框：走 Promise 的确认框（以后要加提示框 / 输入框也接这一套）。
 *
 * 为什么自己画：浏览器原生的 confirm 在桌面版（Electron）**根本没有对应的 UI**，主进程的
 * dialog.showMessageBox 又会挡住主进程、观感跟编辑器也是两回事。这里画的这一套跟着界面走，
 * 样式在 dialog.css（浅色、中性阴影、120ms 入场）。
 *
 * 用法：
 *   confirmDialog({title, message, confirmText, cancelText, danger}).then(ok => { ... });
 *
 * 几个刻意的选择：
 *   - 元素只建一次，之后靠 opacity 开关（不用 display: none）→ 弹出来是当帧的事，不等重排；
 *   - 触发入场只用一次 `void offsetWidth` 强制重排，**不用连等两帧 requestAnimationFrame**
 *     （rAF 在后台或被节流时不回调，元素会卡在 opacity: 0 上）；
 *   - 默认焦点落在「取消」上：回车不该顺手把用户没保存的东西丢掉；
 *   - 已经有一个弹窗在显示时，再叫一次直接回 false —— 不叠第二个。
 */
import styles from './dialog.css';

let overlay = null;
let boxEl = null;
let titleEl = null;
let messageEl = null;
let cancelBtn = null;
let confirmBtn = null;
// 当前这次弹窗的 resolve。非空 = 有一个正在显示
let pending = null;
// 显示期间挂着的 Esc 处理：关掉时照这个引用摘掉。这个键是捕获阶段接的，
// 编辑器自己也有 Esc 处理（收起面板之类），别让它先吃掉这一次按键
let keyHandler = null;
// 弹窗出现前焦点在哪：关掉要还回去，否则焦点掉到 body 上、键盘操作断链
let lastFocused = null;

/**
 * 收尾：摘监听、收起弹窗、把焦点还回去，然后结算 Promise。
 * @param {boolean} result 交给调用方的结果
 */
const settle = result => {
    if (!pending) return;
    const resolve = pending;
    pending = null;
    if (keyHandler) {
        document.removeEventListener('keydown', keyHandler, true);
        keyHandler = null;
    }
    overlay.classList.remove(styles.open);
    // 关掉后整棵子树设为 inert：不然那个隐形的「取消」还留着焦点，之后按回车会点到它
    overlay.inert = true;
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
    resolve(result);
};

const build = () => {
    overlay = document.createElement('div');
    overlay.className = styles.overlay;

    boxEl = document.createElement('div');
    boxEl.className = styles.box;
    boxEl.setAttribute('role', 'dialog');
    boxEl.setAttribute('aria-modal', 'true');

    titleEl = document.createElement('h2');
    titleEl.className = styles.title;

    messageEl = document.createElement('p');
    messageEl.className = styles.message;

    const actions = document.createElement('div');
    actions.className = styles.actions;

    cancelBtn = document.createElement('button');
    cancelBtn.className = `${styles.btn} ${styles.ghost}`;
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => settle(false));

    confirmBtn = document.createElement('button');
    confirmBtn.className = styles.btn;
    confirmBtn.type = 'button';
    confirmBtn.addEventListener('click', () => settle(true));

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    boxEl.appendChild(titleEl);
    boxEl.appendChild(messageEl);
    boxEl.appendChild(actions);
    overlay.appendChild(boxEl);

    // 点遮罩 = 取消（系统对话框的惯例）。用 mousedown 而不是 click：
    // 在框里按下、拖到外面松手，这一次不该算「点了外面」
    overlay.addEventListener('mousedown', e => {
        if (e.target === overlay) settle(false);
    });

    document.body.appendChild(overlay);
    // 没弹出来的时候整棵子树 inert：焦点进不去、读屏也念不到
    overlay.inert = true;
};

/**
 * 弹一个确认框。
 * @param {object} options 对话框内容与按钮文案
 * @param {string} options.title 标题，一句话说清要做什么
 * @param {string} [options.message] 正文，换行用 \n（样式里是 pre-line）
 * @param {string} [options.confirmText] 主按钮文案，默认「确定」
 * @param {string} [options.cancelText] 次按钮文案，默认「取消」
 * @param {boolean} [options.danger] 主按钮用警示色（退出且不保存、删除这类）
 * @returns {Promise<boolean>} 主按钮 true；取消 / Esc / 点遮罩 false
 */
export const confirmDialog = options => {
    const opts = options || {};
    if (pending) return Promise.resolve(false);
    if (!overlay) build();

    titleEl.textContent = opts.title || '确认操作';
    messageEl.textContent = opts.message || '';
    messageEl.hidden = !opts.message;
    boxEl.setAttribute('aria-label', titleEl.textContent);

    cancelBtn.textContent = opts.cancelText || '取消';
    confirmBtn.textContent = opts.confirmText || '确定';
    confirmBtn.className = `${styles.btn} ${opts.danger ? styles.danger : styles.primary}`;

    lastFocused = document.activeElement;
    keyHandler = e => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            settle(false);
        }
    };
    document.addEventListener('keydown', keyHandler, true);

    // 元素一直在 DOM 里，这里补一次强制重排，保证入场过渡真的跑起来
    void overlay.offsetWidth;
    overlay.inert = false;
    overlay.classList.add(styles.open);
    cancelBtn.focus();

    return new Promise(resolve => {
        pending = resolve;
    });
};
