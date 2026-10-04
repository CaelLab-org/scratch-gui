# XMUER Coding Engine

基于 [TurboWarp/scratch-gui](https://github.com/TurboWarp/scratch-gui) 的 Scratch 编辑器分支，由[虚舟实验室（CaelLab）](https://www.caellab.com/)开发维护。

## 下载与使用

- **在线版**：直接访问 <https://engine.xmuer.online/>，无需安装。
- **桌面版（Windows）**：到 <https://engine.xmuer.online/desktop/> 下载安装包（支持 Windows 10/11，64 位），离线也能用。
- **更新日志**：<https://engine.xmuer.online/desktop/changelog/>

## 特性

- 在线编辑器 + 桌面客户端，两边的项目互通
- 沿用 TurboWarp 的高性能运行时（插值、60 FPS 等增强）
- 内置 AI 助手，可以帮忙写积木、改脚本，桌面版还能读取公开网页

## 本地开发

```bash
npm install
npm start        # 启动开发服务器
npm run build    # 生产构建，产物在 build/
```

## 部署

推送到 `develop` 分支后，GitHub Actions 会自动构建并把产物部署到 GitHub Pages，生效地址为 <https://engine.xmuer.online/>。

## 许可证

**GPL-3.0-only** — 见 [LICENSE](LICENSE)。

本项目是 [TurboWarp scratch-gui](https://github.com/TurboWarp/scratch-gui)（GPL-3.0）的修改版分支，其上游是 MIT 许可的 Scratch GUI。桌面版在另一个仓库（Electron 壳，打包时引用本仓库的构建产物），不在本仓库内。

## 关于

XMUER Coding Engine 是虚舟实验室（CaelLab）旗下项目之一，官网 <https://www.caellab.com/>。如有问题可联系 <mailto:admin@caellab.com>。
