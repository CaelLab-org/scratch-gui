import './public-path';
import '../lib/tw-polyfill';
import '../lib/normalize.css';
// 桌面版桥（原生文件对话框）。必须在 GUI 模块求值前跑，内部自带"非桌面环境跳过"判断
import './desktop-integration';
