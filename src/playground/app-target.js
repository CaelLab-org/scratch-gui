import ReactDOM from 'react-dom';
import {setAppElement} from 'react-modal';

const appTarget = document.getElementById('app');

// Remove everything from the target to fix macOS Safari "Save Page As",
while (appTarget.firstChild) {
    appTarget.removeChild(appTarget.firstChild);
}

setAppElement(appTarget);

const render = children => {
    ReactDOM.render(children, appTarget);

    if (window.SplashEnd) {
        window.SplashEnd();
    }
    // 桌面版：告诉主进程「页面真的画好了」，它据此把启动画面淡出、显示主窗口
    // （见桌面仓库 src-main/editor-window.js 的启动时序）。网页版没有这个桥，整段跳过。
    if (window.EditorPreload && typeof window.EditorPreload.pageReady === 'function') {
        window.EditorPreload.pageReady();
    }
};

export default render;
