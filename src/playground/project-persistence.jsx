/**
 * 项目的自动保存与刷新恢复。
 *
 * 刷新后编辑器默认是空项目，之前攒的积木全没了 —— 这里把它接住：
 *   - 保存：vm 每次内容变化（PROJECT_CHANGED，scratch-vm 会从 runtime 转发到 vm 上）
 *     都安排一次防抖快照，2 秒没有新变化才 vm.toJSON() 写进 IndexedDB（见 project-idb.js，
 *     项目几 MB，localStorage 装不下）。AI 面板每次改完积木会调 saveProjectNow()
 *     立刻落一份，防止「对话里说加了积木、刷新后项目却退回去」。
 *   - 恢复：页面打开后第一次满足「编辑器模式 + 默认项目（projectId '0'）+ 加载完成」
 *     时把快照 load 回去，顶部给一条提示。URL 打开的项目（projectId 不是 '0'）不恢复；
 *     首页（播放器模式）不恢复 —— 从首页点「新建」进编辑器会再走一次默认项目加载，
 *     那时窗口还开着，照样能恢复。
 *   - 主动新建（File > New）：恢复窗口用过之后又进「新建类」加载态（FETCHING_NEW_DEFAULT /
 *     LOADING_VM_NEW_DEFAULT / CREATING_NEW）说明用户明确要开新的，旧快照必须扔，
 *     不然下次刷新旧项目又回来了。打开 URL 项目 / 上传文件走的是别的加载态，不动快照。
 *
 * 恢复的是保存点快照：变量当前值在，克隆体、运行中的脚本、画笔痕迹不在
 * （Scratch 自己「保存到电脑」也存不了这些，刷新本来就等于停止运行）。
 */
/* eslint-disable react/jsx-no-bind, react/jsx-no-literals */
// 界面文案还没接 react-intl、回调也没抽出去（会碰 hook 闭包）；跟 panel.jsx 同一批处理。
import React, {useEffect, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {
    requestNewProject, getIsShowingProject, LoadingState
} from '../reducers/project-state.js';
import {saveSnapshot, loadSnapshot, clearSnapshot} from './project-idb.js';
import {collectSvgAssets, cacheSvgAssets} from './ai/port.js';
import styles from './interface.css';

const SAVE_DEBOUNCE = 2000;
// 快照只保留 14 天：一个月前随手开过的项目不该突然冒出来
const RESTORE_MAX_AGE = 14 * 24 * 3600 * 1000;

let activeVm = null;
let saveTimer = 0;
// 上次写进库的内容。恢复完成后 vm 会再发一次 PROJECT_CHANGED，内容没变就别重写一遍
let lastSavedJson = null;

const serializeAndSave = () => {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = 0;
    }
    if (!activeVm) return;
    let json;
    try {
        json = activeVm.toJSON();
    } catch (e) {
        // 序列化失败不该打断编辑，下一轮变化还会再试
        return;
    }
    if (json === lastSavedJson) return;
    lastSavedJson = json;
    // 项目里的 SVG 造型（AI 画的角色造型就是这种）不在 toJSON 里，得快照时另抄一份文本 ——
    // 否则读档时 storage 里没有这份矢量图，造型全成空白（见 project-idb.js）。
    let assets = null;
    try {
        const found = collectSvgAssets(activeVm);
        assets = Object.keys(found).length ? found : null;
    } catch (e) {
        assets = null;
    }
    saveSnapshot(json, Date.now(), assets).catch(() => {
        // project-idb 吞了大部分错误，这里兜个底
    });
};

// 给 AI 面板用：改完积木立刻落一份，不等防抖
export const saveProjectNow = () => serializeAndSave();

const isNewProjectLoading = loadingState => (
    loadingState === LoadingState.FETCHING_NEW_DEFAULT ||
    loadingState === LoadingState.LOADING_VM_NEW_DEFAULT ||
    loadingState === LoadingState.CREATING_NEW
);

const formatTime = ts => {
    const d = new Date(ts);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return hm;
    return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};

const ProjectPersistence = ({vm, projectId, isPlayerOnly, isShowingProject, loadingState, onRequestNewProject}) => {
    const [banner, setBanner] = useState(null);
    const restoredRef = useRef(false);
    const unmountedRef = useRef(false);
    const projectIdRef = useRef(projectId);
    const isNewLoadingRef = useRef(isNewProjectLoading(loadingState));

    useEffect(() => () => {
        unmountedRef.current = true;
    }, []);

    useEffect(() => {
        projectIdRef.current = projectId;
    }, [projectId]);

    // 内容变化 → 防抖快照
    useEffect(() => {
        if (!vm) return;
        activeVm = vm;
        const onChanged = () => {
            // URL 项目的临时改动不写档：快照语义是「默认编辑器工作区」，
            // 远端项目下次刷新还是从远端拉，写进去只会占地方还会张冠李戴
            if (projectIdRef.current !== '0') return;
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(serializeAndSave, SAVE_DEBOUNCE);
        };
        vm.on('PROJECT_CHANGED', onChanged);
        // 关页 / 切后台时把防抖窗口里没落的那份尽力写掉（IndexedDB 是异步的，写不完就算了，
        // 主力还是 2 秒防抖）
        const onHide = () => {
            if (saveTimer) serializeAndSave();
        };
        window.addEventListener('pagehide', onHide);
        return () => {
            vm.off('PROJECT_CHANGED', onChanged);
            window.removeEventListener('pagehide', onHide);
            if (activeVm === vm) activeVm = null;
        };
    }, [vm]);

    // 恢复窗口 + 主动新建时清档
    useEffect(() => {
        const newLoading = isNewProjectLoading(loadingState);
        const wasNewLoading = isNewLoadingRef.current;
        isNewLoadingRef.current = newLoading;

        // 恢复窗口：页面打开后第一次「编辑器 + 默认项目 + 加载完成」
        if (!restoredRef.current && !isPlayerOnly && projectId === '0' && isShowingProject) {
            restoredRef.current = true;
            const seq = ++ProjectPersistence.restoreSeq;
            (async () => {
                const snapshot = await loadSnapshot();
                if (unmountedRef.current || ProjectPersistence.restoreSeq !== seq) return;
                if (!snapshot || !snapshot.json) return;
                if (Date.now() - snapshot.savedAt > RESTORE_MAX_AGE) return;
                // 读档是异步的，这期间用户可能已经打开别的项目了
                if (projectIdRef.current !== '0') return;
                try {
                    lastSavedJson = snapshot.json;
                    // 造型资产要先塞回 storage 再 loadProject：反过来的话 load 时找不到
                    // 那份矢量图，AI 画的造型会全空
                    cacheSvgAssets(vm, snapshot.assets);
                    await vm.loadProject(snapshot.json);
                    if (!unmountedRef.current && ProjectPersistence.restoreSeq === seq) {
                        setBanner({savedAt: snapshot.savedAt});
                    }
                } catch (e) {
                    // 档坏了就扔掉，别让它每次刷新都炸一次
                    lastSavedJson = null;
                    clearSnapshot();
                }
            })();
            return;
        }

        // 主动新建：恢复窗口已经用过、又进了「新建类」加载态 → 旧快照必须扔
        if (restoredRef.current && newLoading && !wasNewLoading && !isPlayerOnly) {
            clearSnapshot();
            lastSavedJson = null;
            setBanner(null);
        }
    }, [loadingState, isShowingProject, isPlayerOnly, projectId, vm]);

    if (!banner) return null;
    const handleDiscard = () => {
        clearSnapshot();
        lastSavedJson = null;
        setBanner(null);
        onRequestNewProject();
    };
    const handleClose = () => setBanner(null);
    return (
        <div className={styles.restoreBar}>
            <span className={styles.restoreBarText}>
                {`已自动恢复上次的项目 · 保存于 ${formatTime(banner.savedAt)}`}
            </span>
            <button
                className={styles.restoreBarBtn}
                onClick={handleDiscard}
                type="button"
            >{'新建空白项目'}</button>
            <button
                aria-label="关闭提示"
                className={styles.restoreBarClose}
                onClick={handleClose}
                type="button"
            >{'\u00d7'}</button>
        </div>
    );
};

// 防止两个实例（理论上只挂一个）同时恢复同一份快照
ProjectPersistence.restoreSeq = 0;

ProjectPersistence.propTypes = {
    vm: PropTypes.object,
    projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    isPlayerOnly: PropTypes.bool,
    isShowingProject: PropTypes.bool,
    loadingState: PropTypes.oneOf(Object.keys(LoadingState)),
    onRequestNewProject: PropTypes.func
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    projectId: state.scratchGui.projectState.projectId,
    isPlayerOnly: state.scratchGui.mode.isPlayerOnly,
    isShowingProject: getIsShowingProject(state.scratchGui.projectState.loadingState),
    loadingState: state.scratchGui.projectState.loadingState
});

const mapDispatchToProps = dispatch => ({
    onRequestNewProject: () => dispatch(requestNewProject(false))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ProjectPersistence);
