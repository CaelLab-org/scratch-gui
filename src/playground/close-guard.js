/**
 * 桌面版关窗确认。
 *
 * 由来：scratch-gui 的存档守卫（src/lib/project-saver-hoc.jsx）在项目有未保存改动时用它自己的
 * beforeunload 驳回卸载 —— 浏览器会弹「离开此网站？」让你选，**Electron 默认静默驳回**：
 * 点右上角的叉没有任何反应、也没有任何提示，窗口就是关不掉（用户 2026-10-04 报的就是这个）。
 *
 * 现在改成本地流程：主进程（desktop/src-main/editor-window.js）在收到那次驳回时，把这次关闭
 * 拦下并发 `xce:close-request` 过来 → 这里弹自家对话框 → 用户点了「退出」才回一句
 * `xce:close-confirm`，主进程收到才真关。项目没有未保存改动时主进程根本不会发这个事件，
 * 所以不会平白多一次确认。
 *
 * 网页版没有这条通道（window.EditorPreload 不存在），整段跳过。
 */
import {confirmDialog} from './dialog.js';

const bridge = window.EditorPreload;

if (bridge && bridge.onCloseRequest) {
    bridge.onCloseRequest(() => {
        confirmDialog({
            title: '退出 XMUER Coding Engine？',
            message: '项目里还有没保存成文件的改动。确定要退出吗？',
            confirmText: '退出',
            cancelText: '取消',
            danger: true
        }).then(confirmed => {
            if (confirmed) bridge.closeConfirmed();
        });
    });
}
