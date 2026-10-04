/**
 * 桌面通知：AI 干完一轮、或者有事要用户拿主意时，把人叫回来。
 *
 * 两条路（用户 2026-10-04 定的「包括网页也要申请通知权限」）：
 *   - **桌面客户端**：window.EditorPreload.notify → 主进程的原生通知（学 ZCode：
 *     有窗口聚焦就不弹、按 tag 去重、点击唤起窗口）；
 *   - **网页版**：Web Notification API，第一次用之前先申请权限。
 *
 * 三条规矩：
 *   1. 窗口有焦点时一律不发 —— 人就在看着，弹出来只是烦；
 *   2. 同一个 tag 短时间内只发一次（一轮里可能多处触发）；
 *   3. 权限只能**在用户手势里**申请（点发送的那一下），页面一加载就申请会被浏览器直接拒掉。
 */

// 同一 tag 的去重窗口。ZCode 主进程用的是 3 秒，跟着来。
const DEDUPE_MS = 3000;
const recent = new Map();

// 桌面版的通知桥：没有它（网页版、无头测试）就返回 null，下面自然走 Web Notification。
const desktopNotify = () => {
    if (typeof window === 'undefined') return null;
    const bridge = window.EditorPreload;
    return bridge && typeof bridge.notify === 'function' ? bridge.notify : null;
};

/**
 * 申请网页通知权限。**必须在用户手势里调**（我们接在「发送」那一下）。
 * @returns {Promise<string>} 'desktop'（桌面版不用申请）/ 'granted' / 'denied' / 'default' / 'unsupported'
 */
export const requestNotifyPermission = async () => {
    if (desktopNotify()) return 'desktop';
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    try {
        return await Notification.requestPermission();
    } catch (e) {
        return 'denied';
    }
};

/**
 * 发一条通知；窗口有焦点时什么都不做。
 * @param {object} opts
 *   title 标题
 *   body  正文（别太长，系统会自己截）
 *   tag   去重用的标识
 * @returns {boolean} 真的发出去了没有
 */
export const notify = ({title, body, tag = 'xce-ai'} = {}) => {
    if (!title) return false;
    if (typeof document !== 'undefined' && typeof document.hasFocus === 'function' && document.hasFocus()) {
        return false;
    }
    const now = Date.now();
    if (now - (recent.get(tag) || 0) < DEDUPE_MS) return false;
    recent.set(tag, now);

    const viaDesktop = desktopNotify();
    if (viaDesktop) {
        try {
            viaDesktop({title, body: body || '', tag});
            return true;
        } catch (e) {
            // 桥坏了就往下走网页那条，别把这一轮搞挂
        }
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    try {
        const shown = new Notification(title, {body: body || '', tag});
        // 点通知回到编辑器（网页版只能把窗口提到前台）
        shown.onclick = () => {
            if (typeof window !== 'undefined' && typeof window.focus === 'function') window.focus();
            shown.close();
        };
        return true;
    } catch (e) {
        return false;
    }
};

// 测试用：把去重表清掉，免得用例之间互相影响
export const resetNotifyDedupe = () => recent.clear();
