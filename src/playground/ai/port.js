/**
 * ScratchPort 的浏览器实现：把 VM / Blockly 包成引擎无关的读写接口。
 *
 * 读写两个方向的形态转换都是必须的，因为 VM 内部形态和 sb3 的 project.json 形态不同：
 *   内部形态  inputs: {NAME: {name, block: id|null, shadow: id|null}}，fields: {NAME: {name, value, id}}
 *   sb3 形态  inputs: {NAME: [1|2|3, id|[原语码,值], ...]}，fields: {NAME: [value, id?]}
 *
 * 写入走 scratch-vm 自带的 deserializeBlocks（权威实现），
 * 读取自己转（因为自带的 serializeBlocks 对字面量的输出不是规范 sb3 形态，下游渲染器读不了）。
 */
import sb3 from 'scratch-vm/src/serialization/sb3.js';
import {targetBlocksToText, textToBlocks} from './serialize.js';

// sb3 里的「原始影子」编码：数字/颜色/文本等内联成 [码, 值]，而不是一个积木
const PRIMITIVES = {
    math_number: {code: 4, field: 'NUM'},
    math_positive_number: {code: 5, field: 'NUM'},
    math_whole_number: {code: 6, field: 'NUM'},
    math_integer: {code: 7, field: 'NUM'},
    math_angle: {code: 8, field: 'NUM'},
    colour_picker: {code: 9, field: 'COLOUR'},
    text: {code: 10, field: 'TEXT'},
    note: {code: 11, field: 'NOTE'},
    matrix: {code: 12, field: 'MATRIX'}
};

const INTERNAL_TO_SB3 = {};
for (const [opcode, info] of Object.entries(PRIMITIVES)) INTERNAL_TO_SB3[opcode] = info;

// —— AI 画角色用的两个模块级工具（不依赖 vm 实例，能单独测）——

/**
 * 从 SVG 根标签上读画布宽高。scratch-svg-renderer 定尺寸看的就是这两个属性：
 * **只有 viewBox、没有 width / height 的 SVG 会被当成 0x0**，造型放进舞台看不见。
 * @param {string} svg SVG 文档文本
 * @returns {?{width: number, height: number}} 读不到（或不是正数）返回 null
 */
export const svgCanvasSize = svg => {
    const tag = /<svg\b[^>]*>/i.exec(String(svg || ''));
    if (!tag) return null;
    const read = name => {
        // 数字后面必须紧跟引号：`100%` 和 `10cm` 都不是这里要的值（会变成 0x0 造型）
        const found = new RegExp(`${name}\\s*=\\s*["']\\s*([0-9.]+)\\s*["']`, 'i').exec(tag[0]);
        const value = found ? parseFloat(found[1]) : NaN;
        return isFinite(value) && value > 0 ? value : null;
    };
    const width = read('width');
    const height = read('height');
    return width && height ? {width, height} : null;
};

/**
 * 项目里所有「非内置」SVG 造型的文本，按 assetId 索引。
 *
 * 自动保存的快照走 vm.toJSON()，那是纯 JSON —— 造型资产不在里面，刷新后 loadProject
 * 只能去 storage 找。AI 画的造型恰好只在内存 storage 里，所以快照必须**另外带上**这些文本
 * （见 project-persistence.jsx），恢复时先塞回 storage 再 loadProject。
 * @param {object} vm scratch-vm 实例
 * @returns {object} assetId -> SVG 文本
 */
export const collectSvgAssets = vm => {
    const out = {};
    const runtime = vm && vm.runtime;
    const storage = runtime && runtime.storage;
    const targets = (runtime && runtime.targets) || [];
    // 读不到 storage 就不知道哪些是内置资产，宁可不收也不要把内置的那几个抄进去
    const builtin = storage && storage.defaultAssetId && storage.defaultAssetId.ImageVector;
    if (!builtin) return out;
    for (const target of targets) {
        const costumes = target && target.getCostumes ? target.getCostumes() : [];
        for (const costume of costumes) {
            if (!costume || costume.dataFormat !== 'svg' || !costume.asset) continue;
            if (!costume.assetId || costume.assetId === builtin) continue;
            try {
                out[costume.assetId] = costume.asset.decodeText();
            } catch (e) {
                // 读不出文本（资产是坏的）就算了，恢复时那个造型照样空着
            }
        }
    }
    return out;
};

/**
 * 把 collectSvgAssets 收上来的造型文本塞回 storage 的缓存。
 * @param {object} vm scratch-vm 实例
 * @param {object} assets assetId -> SVG 文本
 */
export const cacheSvgAssets = (vm, assets) => {
    const runtime = vm && vm.runtime;
    const storage = runtime && runtime.storage;
    if (!storage || !storage.cache || !assets) return;
    for (const [assetId, svg] of Object.entries(assets)) {
        if (typeof svg !== 'string' || !assetId) continue;
        storage.cache(
            storage.AssetType.ImageVector,
            storage.DataFormat.SVG,
            new TextEncoder().encode(svg),
            assetId
        );
    }
};

// 新建角色先摆一个空白造型（编辑器自己的「绘制」按钮就是这条路：sb2 形状的空角色 +
// 内置空白 SVG）。带图的话随后就把这个空白造型换掉。
const blankSpriteJson = name => ({
    objName: name,
    sounds: [],
    costumes: [{
        costumeName: '造型1',
        baseLayerID: -1,
        baseLayerMD5: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
        bitmapResolution: 1,
        rotationCenterX: 0,
        rotationCenterY: 0
    }],
    currentCostumeIndex: 0,
    scratchX: 0,
    scratchY: 0,
    scale: 1,
    direction: 90,
    rotationStyle: 'normal',
    isDraggable: false,
    visible: true,
    spriteInfo: {}
});

// 造型图截出来给模型看的最大边长（和 xce_read_stage 一个口径）
const COSTUME_SHOT_MAX_EDGE = 720;

// VM 内部形态的一份 blocks 快照 -> sb3 形态（不改动原对象）
export const internalToSb3 = internalBlocks => {
    const out = {};
    const inlined = new Set();

    const refOf = id => {
        if (id === null || id === void 0) return null;
        const block = internalBlocks[id];
        if (!block) return id;
        const primitive = INTERNAL_TO_SB3[block.opcode];
        if (primitive) {
            inlined.add(id);
            const field = block.fields && block.fields[primitive.field];
            return [primitive.code, field ? field.value : ''];
        }
        return id;
    };

    for (const id of Object.keys(internalBlocks)) {
        const block = internalBlocks[id];
        if (!block || INTERNAL_TO_SB3[block.opcode]) continue; // 原始影子单独处理
        const inputs = {};
        for (const [name, input] of Object.entries(block.inputs || {})) {
            const blockRef = input.block === input.shadow ? refOf(input.block) : refOf(input.block);
            if (input.block === input.shadow) {
                inputs[name] = [1, blockRef];
            } else if (input.shadow === null || input.shadow === void 0) {
                inputs[name] = [2, blockRef];
            } else {
                inputs[name] = [3, blockRef, refOf(input.shadow)];
            }
        }
        const fields = {};
        for (const [name, field] of Object.entries(block.fields || {})) {
            fields[name] = field && Object.prototype.hasOwnProperty.call(field, 'id') ?
                [field.value, field.id] :
                [field.value];
        }
        const out2 = {
            opcode: block.opcode,
            next: block.next === void 0 ? null : block.next,
            parent: block.parent === void 0 ? null : block.parent,
            inputs,
            fields,
            shadow: !!block.shadow,
            topLevel: !!block.topLevel
        };
        if (block.topLevel) {
            out2.x = block.x;
            out2.y = block.y;
        }
        out[id] = out2;
    }
    return out;
};

// 数「看得见」的积木：影子块（数字 / 文本这些内联输入）不算 —— 跟 Scratch 自带
// 「积木数量」插件的口径一致，界面上的 +N/−M 才对得上用户自己数的结果。
export const visibleBlockCount = blocks => Object.values(blocks || {})
    .filter(block => block && !block.shadow).length;

// 核心积木的 opcode 前缀。不在这张表里的前缀就是扩展积木，
// 写入前必须先把扩展加载起来，否则那些积木在 VM 里是「未知积木」，用户看到一堆灰块。
const CORE_PREFIXES = new Set([
    'motion', 'looks', 'sound', 'event', 'control', 'sensing',
    'operator', 'data', 'procedures', 'argument'
]);

// —— 项目级 XCEAGENT ——
// 保留角色：里面挂一条注释，正文每轮随系统提示词发给模型（拼在用户规矩下面，
// 见 prompt.js）。角色不存在时 xce_write_agent 会自动建 —— 积木必须是注释的锚点，
// 所以自动建的角色带一段什么都不做的绿旗帽子， purely 当注释的挂点。
export const AGENT_SPRITE_NAME = 'XCEAGENT';
// 注入提示词的长度上限（用户定的：取前 20K），超长部分不进提示词
export const AGENT_NOTE_MAX_CHARS = 20000;

// —— 项目级 XCEMEMORY ——
// 两条保留角色（学 ZCode 的「索引 + 按名读正文」）：index 挂一条注释，每轮进提示词，
// 一行一条 `- 名字 — 摘要`；content **每条记忆一条注释**（声明行后第一行是记忆名，其余是正文）。
// 都由 xce_write_project_memory 自动创建，随项目文件走 —— 这是它们跟全局记忆（memory.js）的区别。
export const MEMORY_INDEX_SPRITE = 'XCEMEMORY_index';
export const MEMORY_CONTENT_SPRITE = 'XCEMEMORY_content';

// 影子积木（数字/文本/颜色这些内联的）前缀也不在 CORE_PREFIXES 里，但它们**不是扩展**：
// math_number 的前缀是 math、colour_picker 是 colour…… 曾把它们当成没加载的扩展，
// 于是「透明度」这类普通积木被拒，错误里写着「扩展（math）」。
const SHADOW_PREFIXES = new Set(['math', 'colour', 'text', 'note', 'matrix']);
// 转换器没认出来的积木（serialize.js 的兜底 opcode），同样不是扩展
const UNKNOWN_OPCODE = 'unknown_block';

/**
 * 建一个绑定到 vm 的 port
 * @param {object} opts  vm: scratch-vm 实例；getWorkspace: 取 Blockly 主工作区（整理布局用，可空）
 * @returns {object} 实现 ScratchPort 的对象
 */
export const createScratchPort = ({vm, getWorkspace}) => {
    const runtime = () => vm.runtime;
    const stage = () => runtime().getTargetForStage();

    // 只有「真正的角色」算数：**克隆体不算**。克隆体是运行期的临时物（跑一次星空能冒出上百个），
    // 它们混进角色列表后，AI 看到的清单里会有几十上百个同名「角色1」，既刷屏又没法操作
    // （它们没有独立的编辑工作区，写进去的东西按设计本来就留不下来）。
    const realTargets = () => runtime().targets.filter(t => !t.isClone);

    // 名字匹配要宽容：清单里为了区分舞台写成「Stage (the stage)」/「Stage（舞台）」，模型会连着括号一起抄回来。
    const normalizeName = raw => String(raw === void 0 || raw === null ? '' : raw)
        .trim()
        .replace(/[（(]\s*(?:舞台|the stage|stage)\s*[)）]$/i, '')
        .trim();
    const findTarget = rawName => {
        const name = normalizeName(rawName);
        return realTargets().find(t => t.getName && t.getName() === name) || null;
    };

    const splitVars = target => {
        const variables = {};
        const lists = {};
        for (const variable of Object.values(target.variables)) {
            if (!variable) continue;
            if (variable.type === 'list') lists[variable.name] = variable.id;
            else if (variable.type === 'broadcast_msg') continue;
            else variables[variable.name] = variable.id;
        }
        return {variables, lists};
    };

    // 项目里（含舞台）全部同名变量/列表的 id，保证转换器复用它而不是新建
    const allVariableIds = () => {
        const {variables, lists} = splitVars(stage());
        return {variables: {...variables}, lists: {...lists}};
    };

    // 项目里已经加载的扩展 id。只读，不改任何东西。
    const loadedExtensionIds = () => {
        try {
            const manager = vm.extensionManager;
            if (manager && manager._loadedExtensions &&
                typeof manager._loadedExtensions.keys === 'function') {
                return [...manager._loadedExtensions.keys()];
            }
        } catch (e) {
            // 读不到就当没有
        }
        return [];
    };

    const refreshWorkspace = () => {
        if (vm.emitWorkspaceUpdate) vm.emitWorkspaceUpdate();
    };

    // 这个角色是不是用户当前正在看的那个 —— 工作区只画当前角色的东西，
    // 给别的角色写注释，用户要切过去才看得见（拿它跟模型说清楚，别假装画面上已经出现了）
    const isEditing = target => !!(vm.editingTarget && target && vm.editingTarget.id === target.id);

    // 报错里用的角色名清单
    const spriteNames = () => realTargets()
        .map(t => t.getName())
        .join(', ');

    // —— AI 画角色 ——

    // SVG 文本 -> storage 里的矢量资产，并落进 builtin 缓存：造型编辑器改图、
    // vm.saveProjectSb3() 导出、快照恢复都是从 storage.load 找回来的，只挂在 costume.asset
    // 上会在这些地方扑空（assetId 生成了，资产却没人找得到）。
    const svgAssetOf = svg => {
        const storage = runtime().storage;
        const data = new TextEncoder().encode(svg);
        const asset = storage.createAsset(
            storage.AssetType.ImageVector,
            storage.DataFormat.SVG,
            data,
            null,
            true // 生成 md5 当 assetId
        );
        if (storage.cache) {
            storage.cache(storage.AssetType.ImageVector, storage.DataFormat.SVG, data, asset.assetId);
        }
        return asset;
    };

    // 造型对象。md5 / md5ext 必须自己填：loadCostume 在「自带 asset」这条路上不会补，
    // 而序列化（vm.toJSON、导出 sb3）读的正是它 —— 漏了，别处再打开这个项目就找不到造型。
    const costumeFromSvg = (svg, name) => {
        const size = svgCanvasSize(svg);
        if (!size) return null;
        const asset = svgAssetOf(svg);
        const md5ext = `${asset.assetId}.svg`;
        return {
            costume: {
                name,
                asset,
                assetId: asset.assetId,
                dataFormat: 'svg',
                md5: md5ext,
                md5ext,
                rotationCenterX: size.width / 2,
                rotationCenterY: size.height / 2,
                bitmapResolution: 1
            },
            size
        };
    };

    const attachSvgCostume = async (target, svg, name) => {
        const made = costumeFromSvg(svg, name);
        if (!made) return null;
        await vm.addCostume(`${made.costume.assetId}.svg`, made.costume, target.id);
        return {
            name: made.costume.name,
            width: made.size.width,
            height: made.size.height,
            index: target.getCostumes().length - 1,
            broken: !!made.costume.broken
        };
    };

    // 造型名跟编辑器一致用「造型N」：用户会在造型标签页里看到它

    // —— 造型的编辑 / 删除 / 从图片建（xce_edit_costume / xce_delete_costume / xce_add_costume_from_url）——

    const defaultCostumeName = target => `造型${target.getCostumes().length + 1}`;

    // 造型截图的挑法：不传 = 当前造型；数字当下标，字符串当名字（不分大小写）
    const pickCostume = (costumes, current, which) => {
        if (which === void 0 || which === null || which === '') return current;
        if (typeof which === 'number') return Math.floor(which);
        const wanted = String(which).trim()
            .toLowerCase();
        return costumes.findIndex(entry => String(entry.name).toLowerCase() === wanted);
    };

    // 这几个都靠 pickCostume 认造型，所以定义放在它后面（见下面的定义位置）。

    /**
     * 位图造型：把 dataURL（统一转成 PNG）变成 storage 资产 + costume 对象。
     * 下载来的 webp/jpeg 都先经 canvas 归一成 PNG（Scratch 不认 webp；jpeg 统一转 PNG 省一个分支）。
     * 要 Image / canvas，浏览器（含桌面渲染进程）才有；无头环境返回 no-canvas。
     * @param {string} dataUrl 图片的 data URL
     * @param {string} name 造型名
     * @returns {Promise<object>} {ok, costume?, width?, height?} / {ok: false, reason}
     */
    const bitmapCostumeFromDataUrl = dataUrl => new Promise(resolve => {
        if (typeof Image === 'undefined' || typeof document === 'undefined' ||
            !document.createElement) {
            resolve({ok: false, reason: 'no-canvas'});
            return;
        }
        const image = new Image();
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth || image.width;
                canvas.height = image.naturalHeight || image.height;
                canvas.getContext('2d').drawImage(image, 0, 0);
                const png = canvas.toDataURL('image/png');
                const storage = runtime().storage;
                if (!storage || !storage.createAsset) {
                    resolve({ok: false, reason: 'no-storage'});
                    return;
                }
                const bytes = Uint8Array.from(atob(png.split(',')[1]), char => char.charCodeAt(0));
                const asset = storage.createAsset(
                    storage.AssetType.ImageBitmap, storage.DataFormat.PNG, bytes, null, true);
                if (storage.cache) {
                    storage.cache(storage.AssetType.ImageBitmap, storage.DataFormat.PNG, bytes, asset.assetId);
                }
                const md5ext = `${asset.assetId}.png`;
                resolve({
                    ok: true,
                    width: canvas.width,
                    height: canvas.height,
                    costume: {
                        name: '',
                        asset,
                        assetId: asset.assetId,
                        dataFormat: 'png',
                        md5: md5ext,
                        md5ext,
                        bitmapResolution: 1,
                        rotationCenterX: canvas.width / 2,
                        rotationCenterY: canvas.height / 2,
                        size: [canvas.width, canvas.height]
                    }
                });
            } catch (e) {
                resolve({ok: false, reason: 'decode-failed'});
            }
        };
        image.onerror = () => resolve({ok: false, reason: 'decode-failed'});
        image.src = dataUrl;
    });

    /**
     * 替换一个已有**矢量**造型的内容（xce_edit_costume 的 edit）。
     * **就地换**，不删不加 —— 删了再加的话，Scratch 的 addCostumeAt 会把重名的新造型改成
     * 「xxx2」（名字被工具改掉了），而且只剩一个造型时 VM 根本不肯删（单空白造型是常态）。
     * 做法照 vm.updateSvg 那套（画图编辑器也是这么改造型的），但直接对造型对象操作，
     * 不经过 editingTarget，免得把用户正看的工作区切走。
     * @param {string} spriteName 角色名
     * @param {string|number} which 造型名/下标（默认当前）
     * @param {string} svg 新内容
     * @param {string} [newName] 新造型名（缺省沿用旧的）
     * @returns {object} {ok, index?, name?, oldName?} / {ok: false, reason}
     */
    const replaceCostumeContent = (spriteName, which, svg, newName) => {
        const target = findTarget(spriteName);
        if (!target) return {ok: false, reason: 'missing', sprites: spriteNames()};
        const costumes = target.getCostumes();
        const index = pickCostume(costumes, target.currentCostume, which);
        const old = costumes[index];
        if (!old) return {ok: false, reason: 'no-costume'};
        if (old.dataFormat !== 'svg') return {ok: false, reason: 'bitmap', name: old.name};
        const size = svgCanvasSize(svg);
        if (!size) return {ok: false, reason: 'bad-size'};
        const oldName = old.name;
        const asset = svgAssetOf(svg);
        old.asset = asset;
        old.assetId = asset.assetId;
        old.dataFormat = 'svg';
        old.md5 = `${asset.assetId}.svg`;
        old.md5ext = old.md5;
        old.rotationCenterX = size.width / 2;
        old.rotationCenterY = size.height / 2;
        old.size = [size.width, size.height];
        delete old.broken;
        try {
            const renderer = runtime().renderer;
            if (renderer && renderer.updateSVGSkin && old.skinId !== void 0 && old.skinId !== null) {
                renderer.updateSVGSkin(old.skinId, svg, [old.rotationCenterX, old.rotationCenterY]);
                if (renderer.getSkinSize) old.size = renderer.getSkinSize(old.skinId);
            }
        } catch (e) {
            // 皮肤换不动（无头环境）不影响数据面 —— 项目里已经是新内容了
        }
        const wanted = String(newName || '').trim();
        if (wanted && wanted !== oldName) target.renameCostume(index, wanted);
        if (target.blocks && target.blocks.resetCache) target.blocks.resetCache();
        if (vm.emitTargetsUpdate) vm.emitTargetsUpdate();
        if (runtime().requestRedraw) runtime().requestRedraw();
        return {ok: true, index, name: old.name, oldName};
    };

    /**
     * 删除造型前抓快照（撤销用）：留下 costume 对象引用、原下标和当时选中的是哪一枚。
     * @param {string} spriteName 角色名
     * @param {string|number} [which] 造型名/下标（默认当前）
     * @returns {object|null} {index, costume, current}；没这个角色/造型返回 null
     */
    const captureCostume = (spriteName, which) => {
        const target = findTarget(spriteName);
        if (!target) return null;
        const costumes = target.getCostumes();
        const index = pickCostume(costumes, target.currentCostume, which);
        return costumes[index] ?
            {index, costume: costumes[index], current: target.currentCostume} : null;
    };

    /**
     * 把快照的造型摆回原位（撤销删除）：先 append（loadCostume 会重建 skin），
     * 再把同一对象挪回原下标，最后把「当前造型」也指回去。
     * @param {string} spriteName 角色名
     * @param {object} entry captureCostume 留下的快照
     * @returns {Promise<boolean>} 摆回来了没有
     */
    const restoreCostume = async (spriteName, entry) => {
        const target = findTarget(spriteName);
        if (!target || !entry || !entry.costume) return false;
        await vm.addCostume(entry.costume.md5ext, entry.costume, target.id);
        const end = target.getCostumes().length - 1;
        const wanted = Math.min(Math.max(Number(entry.index) || 0, 0), end);
        if (wanted !== end) {
            target.addCostume(entry.costume, wanted); // 同一引用插到原位
            target.deleteCostume(target.getCostumes().length - 1); // 摘掉末尾那个
        }
        if (Number.isInteger(entry.current)) target.setCostume(entry.current);
        if (vm.emitTargetsUpdate) vm.emitTargetsUpdate();
        return true;
    };

    // 造型画到 canvas 上再导 PNG。SVG 没写 width/height 时浏览器给 0，
    // 退到造型自身尺寸、再退到旋转中心推出来的尺寸，最后才是舞台尺寸。
    const renderCostumeToPng = (image, costume) => {
        const known = costume.size || [];
        const width = Math.round(image.width || known[0] || (costume.rotationCenterX * 2) || 480);
        const height = Math.round(image.height || known[1] || (costume.rotationCenterY * 2) || 360);
        if (!(width > 0) || !(height > 0)) return null;
        const scale = Math.min(1, COSTUME_SHOT_MAX_EDGE / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return {dataUrl: canvas.toDataURL('image/png'), width, height, name: costume.name};
    };

    // 这两个写成闭包而不是 port 上的方法：undoAction 也要调它们，
    // 在对象字面量里引用 port 自己会踩 no-use-before-define。
    const removeSpriteByName = spriteName => {
        const target = findTarget(spriteName);
        if (!target) return false;
        vm.deleteSprite(target.id);
        if (vm.emitTargetsUpdate) vm.emitTargetsUpdate();
        return true;
    };

    const removeCostumeAt = (spriteName, index) => {
        const target = findTarget(spriteName);
        if (!target) return false;
        const costumes = target.getCostumes();
        // 角色的最后一个造型删不得（删光了角色就没法渲染）
        if (costumes.length <= 1 || !(index >= 0 && index < costumes.length)) return false;
        target.deleteCostume(index);
        if (vm.emitTargetsUpdate) vm.emitTargetsUpdate();
        return true;
    };

    // 保留角色名：XCEAGENT 和 XCEMEMORY 两条是 AI 的功能部件，不许被改名，也不许被占用
    const RESERVED_SPRITE_NAMES = () => [AGENT_SPRITE_NAME, MEMORY_INDEX_SPRITE, MEMORY_CONTENT_SPRITE];

    /**
     * 重命名角色（xce_rename_sprite）。走 vm.renameSprite，跟用户在角色面板改名是同一条路；
     * 名字冲突、空名、保留名在这里先拦。改名不影响脚本（积木引用的是角色本体，不是名字）。
     * @param {string} oldName 现名
     * @param {string} newName 新名
     * @returns {object} {ok, from?, to?} / {ok: false, reason, sprites?}
     */
    const renameSprite = (oldName, newName) => {
        const target = findTarget(oldName);
        if (!target) return {ok: false, reason: 'no-sprite', sprites: spriteNames()};
        if (target.isStage) return {ok: false, reason: 'stage'};
        const wanted = String(newName === void 0 || newName === null ? '' : newName).trim();
        if (!wanted) return {ok: false, reason: 'no-name'};
        if (RESERVED_SPRITE_NAMES().includes(target.getName()) ||
            RESERVED_SPRITE_NAMES().some(reserved => reserved.toLowerCase() === wanted.toLowerCase())) {
            return {ok: false, reason: 'reserved'};
        }
        const taken = realTargets().find(other =>
            other !== target && other.getName().toLowerCase() === wanted.toLowerCase());
        if (taken) return {ok: false, reason: 'duplicate', sprites: spriteNames()};
        const from = target.getName();
        vm.renameSprite(target.id, wanted);
        if (vm.emitTargetsUpdate) vm.emitTargetsUpdate();
        return {ok: true, from, to: wanted};
    };

    // —— Scratch 原生注释（xce_note）——

    // 老版本由这边强制加在注释正文开头、标明「AI 写入」的声明行。后来去掉了（用户 2026-10-05 定的：
    // 来源让 AI 自己写清楚，别硬套格式），这里留着它只做一件事：读回来时兼容老项目里还带这行的注释。
    const NOTE_HEADER = '[由 XMUER Coding Engine 的 AI 助手写入]';

    // 这个角色最新的一段脚本（顶块 id）——省略锚点时挂到它上面
    const latestTopBlockId = target => {
        const scripts = target.blocks && target.blocks.getScripts ? target.blocks.getScripts() : [];
        return scripts.length ? scripts[scripts.length - 1] : null;
    };

    /**
     * 往某块积木上写一条 Scratch 原生注释（编辑器里那个真的注释气泡，用户能改能删）。
     *
     * 两个硬事实：
     *   1. **注释必须挂在积木上** —— VM 的 `blocks.toXML(comments)` 只输出挂在积木上的注释，
     *      没有锚点的注释在编辑器里根本不显示（scratch-blocks 的 domToWorkspace 虽然能读顶层
     *      `<comment>`，但 VM 压根不会把它吐进工作区 XML）。所以「没有积木的角色」写不了注释，
     *      这是 Scratch 本身的限制，不是这里偷懒。
     *   2. 同一个顶块已经有注释就**改文本**，不再叠一张 —— 工具会被连着调好几次，
     *      叠出来是一堆注释块，用户得自己一张张删。
     * @param {string} spriteName 角色名
     * @param {string} text 正文（声明前缀由这里补）
     * @param {string} [blockId] 锚点顶块 id；省略 = 这个角色最新的一段脚本
     * @returns {object|null} {commentId, blockId, text, updated, visible}；写不进去返回 null
     */
    const createNote = (spriteName, text, blockId) => {
        const target = findTarget(spriteName);
        if (!target) return null;
        const body = String(text === void 0 || text === null ? '' : text)
            .trim();
        if (!body) return null;
        const anchor = blockId || latestTopBlockId(target);
        const block = anchor ? target.blocks.getBlock(anchor) : null;
        if (!block) return null;
        const full = body;
        const existingId = block.comment;
        if (existingId && target.comments[existingId]) {
            target.comments[existingId].text = full;
            refreshWorkspace();
            return {commentId: existingId, blockId: anchor, text: full, updated: true, visible: isEditing(target)};
        }
        const id = `note-${Date.now().toString(36)}-${Math.random().toString(36)
            .slice(2, 7)}`;
        // 位置：**优先按 Blockly 里那块积木的实际位置量**（摆在它右边一点点）。
        // 不用 VM 里的 block.x/y 当准：那两个字段只在积木被拖过之后才由工作区同步回来，
        // 刚写进去的脚本那儿常常是旧的或者干脆没有 —— 拿它算会把注释摆到屏幕外面，
        // 用户看着像「注释没写进去」。量不到（无头环境没有工作区）才退回估算。
        let x = (typeof block.x === 'number' ? block.x : 40) + 320;
        let y = typeof block.y === 'number' ? block.y : 40;
        try {
            const workspace = getWorkspace && getWorkspace();
            const node = workspace && workspace.getBlockById ? workspace.getBlockById(anchor) : null;
            if (node && node.getRelativeToSurfaceXY) {
                const at = node.getRelativeToSurfaceXY();
                const size = node.getHeightWidth ? node.getHeightWidth() : null;
                x = at.x + (size ? size.width : 0) + 24;
                y = at.y;
            }
        } catch (e) {
            // 量失败就用估算的位置，功能不受影响
        }
        target.createComment(id, anchor, full, Math.round(x), Math.round(y), 200, 130, false);
        // 走的是 VM 的直接接口，没经过 blockListener 那条路 —— 注释会影响编译缓存
        // （stage 上那条「配置注释」就是），顺手清一下，别让运行结果读到旧的
        if (target.blocks.resetCache) target.blocks.resetCache();
        refreshWorkspace();
        return {commentId: id, blockId: anchor, text: full, updated: false, visible: isEditing(target)};
    };

    /**
     * 删掉一条注释（撤销 xce_note 用）。要连挂它的积木一起解绑，
     * 否则那块积木还记着一个不存在的 commentId。
     * @param {string} spriteName 角色名
     * @param {string} commentId 注释 id（xce_note 的 undo 句柄里那个）
     * @returns {boolean} 删掉了没有
     */
    const deleteNote = (spriteName, commentId) => {
        const target = findTarget(spriteName);
        if (!target || !commentId || !target.comments[commentId]) return false;
        const comment = target.comments[commentId];
        const block = comment.blockId ? target.blocks.getBlock(comment.blockId) : null;
        if (block) delete block.comment;
        delete target.comments[commentId];
        if (target.blocks.resetCache) target.blocks.resetCache();
        refreshWorkspace();
        return true;
    };

    // 删注释前抓快照：注释跟脚本一样是用户能看见的东西，删错了得能摆回去。
    // createComment 的参数形态就是注释的全部状态（见 createNote 里怎么建的）。
    const captureNote = (spriteName, commentId) => {
        const target = findTarget(spriteName);
        if (!target || !commentId || !target.comments[commentId]) return null;
        const comment = target.comments[commentId];
        return {
            id: commentId,
            blockId: comment.blockId || null,
            text: String(comment.text || ''),
            x: comment.x,
            y: comment.y,
            width: comment.width,
            height: comment.height
        };
    };

    // 把 captureNote 的快照原样摆回去（xce_delete_note 的撤销）。createComment 会把
    // blockId 重新挂回对应积木的 block.comment 上（跟 createNote 同一条路）。
    const restoreNote = (spriteName, snapshot) => {
        const target = findTarget(spriteName);
        if (!target || !snapshot || !snapshot.id || target.comments[snapshot.id]) return false;
        target.createComment(
            snapshot.id,
            snapshot.blockId || null,
            snapshot.text,
            snapshot.x, snapshot.y, snapshot.width, snapshot.height,
            false
        );
        if (target.blocks.resetCache) target.blocks.resetCache();
        refreshWorkspace();
        return true;
    };

    // 按名字新建一个保留角色（空造型，选中它），返回 target；建不出来返回 null
    const createReservedSprite = async spriteName => {
        // 按 id 差集认新角色（跟 addSprite 同一个套路，比按名字靠得住）
        const before = new Set(realTargets().map(t => t.id));
        await vm.addSprite(JSON.stringify(blankSpriteJson(spriteName)));
        const target = realTargets().find(t => !before.has(t.id));
        if (!target) return null;
        vm.setEditingTarget(target.id);
        if (vm.emitTargetsUpdate) vm.emitTargetsUpdate();
        return target;
    };

    // 放一段什么都不做的绿旗帽子，纯粹给注释当挂点（Scratch 的注释必须挂在积木上）。
    // 一块积木只能挂一条注释，所以 content 上每条记忆都要自己的帽子。返回顶块 id。
    const addHatAnchor = target => {
        const hat = sb3.deserializeBlocks({
            [`hat_${Math.random().toString(36)
                .slice(2, 8)}`]: {
                opcode: 'event_whenflagclicked',
                next: null,
                parent: null,
                inputs: {},
                fields: {},
                shadow: false,
                topLevel: true,
                x: 40,
                y: 40
            }
        });
        const id = Object.keys(hat)[0];
        target.blocks.createBlock(hat[id]);
        return id;
    };

    // 保留角色上「那条」注释（agent / index 都只有一条；用户手加的算第一条）
    const soleComment = target => {
        const entries = Object.entries((target && target.comments) || {});
        return entries.length ? {id: entries[0][0], ...entries[0][1]} : null;
    };

    // 直接改一条注释的文本（撤销时恢复旧文用；createNote 走不到「指定注释 id」这条路）
    const setCommentText = (spriteName, commentId, text) => {
        const target = findTarget(spriteName);
        if (!target || !target.comments[commentId]) return false;
        target.comments[commentId].text = text;
        if (target.blocks.resetCache) target.blocks.resetCache();
        refreshWorkspace();
        return true;
    };

    // XCEMEMORY_content 上的一条记忆 = 一条注释：声明行后第一行是记忆名，其余是正文
    const memoryEntries = target => Object.entries((target && target.comments) || {})
        .map(([id, comment]) => {
            const lines = String((comment && comment.text) || '').split('\n');
            const bodyLines = lines.filter(line => line.trim() !== NOTE_HEADER);
            return {
                id,
                blockId: (comment && comment.blockId) || null,
                name: (bodyLines[0] || '').trim(),
                text: bodyLines.slice(1)
                    .join('\n')
                    .trim(),
                fullText: String((comment && comment.text) || '')
            };
        })
        .filter(entry => entry.name);

    // index 注释的一行 `- 名字 — 摘要` -> 名字（摘要里也可能出现 —，只认第一个）
    const indexLineName = line => {
        const found = /^-\s+(.*?)\s+—/.exec(line);
        return found ? found[1].trim() : '';
    };

    /**
     * 写项目级 XCEAGENT 的那条注释（不存在就建角色，注释已挂在该挂点上就改文本）。
     * 长度不设上限：超长的截断由提示词那侧声明（前 20K），模型可以用 xce_read_agent 读全文。
     * @param {string} rawText 注释正文（原样写入，不再强加声明行）
     * @returns {Promise<object>} {ok, reason?, spriteCreated?, commentId?, updated?, visible?}
     */
    const writeAgentNote = async rawText => {
        const text = String(rawText === void 0 || rawText === null ? '' : rawText)
            .trim();
        if (!text) return {ok: false, reason: 'empty'};
        let target = findTarget(AGENT_SPRITE_NAME);
        let spriteCreated = false;
        if (!target) {
            target = await createReservedSprite(AGENT_SPRITE_NAME);
            if (!target) return {ok: false, reason: 'failed'};
            spriteCreated = true;
        }
        if (!(target.blocks.getScripts ? target.blocks.getScripts() : []).length) {
            addHatAnchor(target);
        }
        const made = createNote(AGENT_SPRITE_NAME, text);
        if (!made) return {ok: false, reason: 'failed', spriteCreated};
        return {ok: true, spriteCreated, ...made};
    };

    /**
     * 写一条项目记忆：content 上同名覆盖（原注释改文本）或新帽子 + 新注释，
     * index 上同名替换 / 追加一行摘要。两个保留角色不存在就自动建。
     * @param {object} input {name, description, body}
     * @returns {Promise<object>} {ok, reason?, created?, commentId?, createdSprites?, prevContent?, prevIndex?}
     *   prevContent / prevIndex 是覆盖前的全文快照（含声明行），撤销用；没有就是 null
     */
    const writeProjectMemory = async ({name, description, body}) => {
        const key = String(name || '').trim();
        if (!key) return {ok: false, reason: 'no-name'};
        const text = String(body === void 0 || body === null ? '' : body).trim();
        if (!text) return {ok: false, reason: 'empty'};

        const createdSprites = [];
        for (const spriteName of [MEMORY_INDEX_SPRITE, MEMORY_CONTENT_SPRITE]) {
            if (!findTarget(spriteName)) {
                if (!(await createReservedSprite(spriteName))) return {ok: false, reason: 'failed'};
                createdSprites.push(spriteName);
            }
        }
        const contentTarget = findTarget(MEMORY_CONTENT_SPRITE);
        const indexTarget = findTarget(MEMORY_INDEX_SPRITE);

        // 覆盖前的旧状态（撤销要摆回去的东西）
        const prevEntry = memoryEntries(contentTarget).find(entry => entry.name === key) || null;
        const prevIndexComment = soleComment(indexTarget);
        const prevIndex = prevIndexComment ? prevIndexComment.text : null;

        let commentId;
        if (prevEntry) {
            const made = createNote(MEMORY_CONTENT_SPRITE, `${key}\n${text}`, prevEntry.blockId);
            if (!made) return {ok: false, reason: 'failed'};
            commentId = made.commentId;
        } else {
            const hatId = addHatAnchor(contentTarget);
            const made = createNote(MEMORY_CONTENT_SPRITE, `${key}\n${text}`, hatId);
            if (!made) return {ok: false, reason: 'failed'};
            commentId = made.commentId;
        }

        const lines = prevIndex ?
            prevIndex.split('\n')
                .filter(line => line.trim() !== NOTE_HEADER)
                .map(line => line.trim())
                .filter(Boolean) : [];
        const summary = String(description === void 0 || description === null ? '' : description)
            .trim() || '(no summary)';
        const line = `- ${key} — ${summary}`;
        const at = lines.findIndex(existing => indexLineName(existing) === key);
        if (at === -1) lines.push(line);
        else lines[at] = line;
        if (prevIndexComment) {
            createNote(MEMORY_INDEX_SPRITE, lines.join('\n'), prevIndexComment.blockId);
        } else {
            const hatId = addHatAnchor(indexTarget);
            createNote(MEMORY_INDEX_SPRITE, lines.join('\n'), hatId);
        }
        refreshWorkspace();
        return {
            ok: true,
            created: !prevEntry,
            commentId,
            createdSprites,
            prevContent: prevEntry ? {commentId: prevEntry.id, text: prevEntry.fullText} : null,
            prevIndex
        };
    };

    /**
     * 按名字读一条项目记忆的正文（不带名字行）。
     * @param {string} rawName 记忆名
     * @returns {object} {ok, text?} / {ok: false, reason: 'no-memory'}
     */
    const readProjectMemory = rawName => {
        const key = String(rawName || '').trim();
        const entry = memoryEntries(findTarget(MEMORY_CONTENT_SPRITE))
            .find(item => item.name === key);
        if (!entry) return {ok: false, reason: 'no-memory'};
        return {ok: true, text: entry.text};
    };

    // 给系统提示词用的轻量项目概况：只数脚本段数，不渲染积木文本
    const describeProject = () => realTargets().map(t => ({
        name: t.getName(),
        isStage: !!t.isStage,
        scriptCount: t.blocks && t.blocks.getScripts ? t.blocks.getScripts().length : 0
    }));

    // 整理布局：Scratch 原生右键的「整理积木」就是它
    const tidy = () => {
        try {
            const workspace = getWorkspace && getWorkspace();
            if (workspace && workspace.cleanUp) workspace.cleanUp();
        } catch (e) {
            // 排版失败不影响功能
            // eslint-disable-next-line no-console
            console.warn('[ai] 整理布局失败', e);
        }
    };

    // 抓一份脚本快照（顶块 + 子块 + 子栈 + 输入）：删脚本是破坏性操作，
    // 不留一份原样的就再也摆不回来。形态跟 readTarget 用同一个转换器，所以能原样喂回
    // deserializeBlocks（原语输入在内联形态里，不需要单独重建影子块）。
    const captureScript = (spriteName, topBlockId) => {
        const target = findTarget(spriteName);
        if (!target || !target.blocks.getBlock(topBlockId)) return null;
        const all = internalToSb3(target.blocks._blocks);
        const wanted = new Set();
        const walk = id => {
            if (!id || wanted.has(id) || !all[id]) return;
            wanted.add(id);
            const block = all[id];
            walk(block.next);
            for (const input of Object.values(block.inputs || {})) {
                // [1|2|3, block, shadow?]，原语已经被内联成 [code, value] 了
                if (!Array.isArray(input)) continue;
                walk(input[1]);
                walk(input[2]);
            }
        };
        walk(topBlockId);
        const blocks = {};
        for (const id of wanted) blocks[id] = all[id];
        return {blocks, count: visibleBlockCount(blocks)};
    };

    const deleteScript = (spriteName, topBlockId) => {
        const target = findTarget(spriteName);
        if (!target || !target.blocks.getBlock(topBlockId)) return false;
        target.blocks.deleteBlock(topBlockId); // 自带级联：子块、输入、子栈一起删
        refreshWorkspace();
        return true;
    };

    /**
     * 删一条项目记忆：content 的注释（挂点上没别的注释就连帽子）+ index 那行，一起走。
     * 放在 deleteScript 之后定义 —— 它要摘掉挂点帽子。
     * @param {string} rawName 记忆名
     * @returns {object} {ok, entry: {id, text 全文快照}, prevIndex} / {ok: false, reason: 'no-memory'}
     */
    const deleteProjectMemory = rawName => {
        const key = String(rawName || '').trim();
        const contentTarget = findTarget(MEMORY_CONTENT_SPRITE);
        const entry = contentTarget && memoryEntries(contentTarget)
            .find(item => item.name === key);
        if (!entry) return {ok: false, reason: 'no-memory'};
        const indexTarget = findTarget(MEMORY_INDEX_SPRITE);
        const indexComment = soleComment(indexTarget);
        const prevIndex = indexComment ? indexComment.text : null;

        deleteNote(MEMORY_CONTENT_SPRITE, entry.id);
        const block = entry.blockId ? contentTarget.blocks.getBlock(entry.blockId) : null;
        if (block && !block.comment) deleteScript(MEMORY_CONTENT_SPRITE, entry.blockId);

        if (indexComment) {
            const lines = prevIndex.split('\n')
                .filter(line => line.trim() !== NOTE_HEADER)
                .map(line => line.trim())
                .filter(Boolean)
                .filter(line => indexLineName(line) !== key);
            if (lines.length) {
                createNote(MEMORY_INDEX_SPRITE, lines.join('\n'), indexComment.blockId);
            } else {
                deleteNote(MEMORY_INDEX_SPRITE, indexComment.id);
            }
        }
        return {ok: true, entry: {id: entry.id, text: entry.fullText}, prevIndex};
    };

    const restoreScript = (spriteName, blocks) => {
        const target = findTarget(spriteName);
        if (!target || !blocks || !Object.keys(blocks).length) return false;
        const vmBlocks = sb3.deserializeBlocks(JSON.parse(JSON.stringify(blocks)));
        for (const id of Object.keys(vmBlocks)) {
            if (target.blocks.getBlock(id)) continue; // 这个 id 已经被占用了就别硬塞
            target.blocks.createBlock(vmBlocks[id]);
        }
        refreshWorkspace();
        return true;
    };

    const port = {
        listSprites: () =>
            realTargets().map(t => ({name: t.getName(), isStage: t.isStage, id: t.id})),

        // ls 用的轻量清单：名字/脚本数/造型名/变量名/列表名，绝不渲染积木文本
        listSpritesDetailed: () => realTargets().map(t => {
            const {variables, lists} = splitVars(t);
            return {
                name: t.getName(),
                isStage: !!t.isStage,
                scriptCount: t.blocks && t.blocks.getScripts ? t.blocks.getScripts().length : 0,
                costumes: (t.getCostumes ? t.getCostumes() : []).map(costume => costume.name),
                currentCostume: t.getCostumes && t.getCostumes()[t.currentCostume] ?
                    t.getCostumes()[t.currentCostume].name : null,
                variables: Object.keys(variables),
                lists: Object.keys(lists)
            };
        }),

        describeProject,

        loadedExtensions: loadedExtensionIds,

        readTarget: name => {
            const target = findTarget(name);
            if (!target) return null;
            const {variables, lists} = splitVars(target);
            const sb3Blocks = internalToSb3(target.blocks._blocks);
            const {text, warnings} = targetBlocksToText({blocks: sb3Blocks});
            if (warnings.length) {
                // eslint-disable-next-line no-console
                console.warn('[ai] 读取积木有警告', warnings);
            }
            return {name, text, variables, lists, blockIds: Object.keys(sb3Blocks)};
        },

        writeScript: async (spriteName, text) => {
            const target = findTarget(spriteName);
            if (!target) throw new Error(`No sprite named "${spriteName}"`);
            const {variables, lists} = splitVars(target);
            const stageIds = allVariableIds();

            const converted = textToBlocks(text, {
                variables: {...stageIds.variables, ...variables},
                lists: {...stageIds.lists, ...lists}
            });

            // 项目里还没有的变量/列表：建到舞台上（= 对所有角色可见），跟编辑器默认行为一致
            const createdVariables = [];
            const createdLists = [];
            for (const [name, id] of Object.entries(converted.variables)) {
                if (stageIds.variables[name] || target.lookupVariableById(id)) continue;
                stage().createVariable(id, name, '');
                createdVariables.push(name);
            }
            for (const [name, id] of Object.entries(converted.lists)) {
                if (stageIds.lists[name] || target.lookupVariableById(id)) continue;
                stage().createVariable(id, name, 'list');
                createdLists.push(name);
            }

            // 扩展积木：**不擅自加载扩展**（那是改用户的项目）。
            // 用到了没加载的扩展就直接拒绝写入，把该加载哪个扩展告诉调用方，
            // 由 AI 转告用户去左下角添加。
            const needed = new Set();
            const unknown = [];
            for (const block of Object.values(converted.blocks)) {
                const opcode = String(block.opcode);
                if (opcode === UNKNOWN_OPCODE) {
                    // 转换器没认出来：这是「工具不认识这段写法」，不是扩展问题，单独说清楚
                    unknown.push(opcode);
                    continue;
                }
                const prefix = opcode.split('_')[0];
                if (SHADOW_PREFIXES.has(prefix) || CORE_PREFIXES.has(prefix)) continue;
                needed.add(prefix);
            }
            // 有认不出的积木就整体拒绝：写进去只会变成灰块，还会把用户的脚本弄乱
            if (unknown.length) {
                return {
                    blockIds: [],
                    topBlockIds: [],
                    createdVariables: [],
                    createdLists: [],
                    missingExtensions: [],
                    unrecognized: true,
                    warnings: converted.warnings
                };
            }
            const loaded = loadedExtensionIds();
            const missingExtensions = [...needed].filter(id => !loaded.includes(id));
            if (missingExtensions.length) {
                return {
                    blockIds: [],
                    topBlockIds: [],
                    createdVariables: [],
                    createdLists: [],
                    missingExtensions,
                    warnings: converted.warnings
                };
            }

            // sb3 形态 -> VM 内部形态（权威转换器），再逐个塞进 blocks 容器
            const vmBlocks = sb3.deserializeBlocks(JSON.parse(JSON.stringify(converted.blocks)));
            for (const id of Object.keys(vmBlocks)) {
                target.blocks.createBlock(vmBlocks[id]);
            }
            refreshWorkspace();
            // 让 Blockly 量完尺寸再排版，否则 cleanUp 算出来的高度是错的
            await new Promise(resolve => setTimeout(resolve, 0));
            tidy();

            return {
                blockIds: converted.topLevelIds,
                topBlockIds: converted.topLevelIds,
                blockCount: visibleBlockCount(vmBlocks),
                createdVariables,
                createdLists,
                warnings: converted.warnings
            };
        },

        // 删除前先抓快照：调用方拿它做「撤销这次删除」（见 tools.js 的 delete_script）
        captureScript,

        deleteScript,

        restoreScript,

        // 「整理积木」（cleanUp）：xce_edit_script 删旧写新之后调一次，别留个大洞
        tidy,

        // Scratch 原生注释（xce_note / 撤销）
        createNote,

        deleteNote,

        // 删注释的快照与恢复（xce_delete_note 的撤销）
        captureNote,

        restoreNote,

        // 项目级 XCEAGENT（写那条注释 / 读出来给系统提示词用）
        writeAgentNote,

        // 全文读出来（**不截断**）：提示词那侧自己取前 20K 并声明截断，xce_read_agent 靠它分页
        readAgentNote: () => {
            const target = findTarget(AGENT_SPRITE_NAME);
            if (!target) return {text: '', totalChars: 0, totalLines: 0};
            // 全部注释都算上（工具只维护一条，用户手加的也尊重），声明行不进提示词
            const texts = Object.values(target.comments || {})
                .map(comment => {
                    const text = comment && comment.text ? String(comment.text) : '';
                    return text.split('\n')
                        .filter(line => line.trim() !== NOTE_HEADER)
                        .join('\n')
                        .trim();
                })
                .filter(Boolean);
            const text = texts.join('\n\n');
            return {text, totalChars: text.length, totalLines: text ? text.split('\n').length : 0};
        },

        // 某个角色的全部注释（id + 原文 + 挂点），xce_read_notes / read_project 的注释区用。没有这个角色返回 null
        readNotes: spriteName => {
            const target = findTarget(spriteName);
            if (!target) return null;
            return Object.entries(target.comments || {})
                .map(([id, comment]) => ({
                    id,
                    text: String((comment && comment.text) || ''),
                    blockId: (comment && comment.blockId) || null
                }));
        },

        // 项目级 XCEMEMORY：写/读/删一条记忆 + 读 index 注释全文（给系统提示词用）
        writeProjectMemory,

        readProjectMemory,

        deleteProjectMemory,

        readMemoryIndex: () => {
            const comment = soleComment(findTarget(MEMORY_INDEX_SPRITE));
            if (!comment) return '';
            return comment.text.split('\n')
                .filter(line => line.trim() !== NOTE_HEADER)
                .join('\n')
                .trim();
        },

        // 按工具留下的 undo 句柄把那一次改动收回去（写入 = 删掉刚加的顶块；删除 = 把快照摆回去；
        // 新建角色 = 把角色删掉；加造型 = 把造型删掉；写注释 = 把注释删掉）。
        // 单张卡的「撤销」和整轮的「回退本轮变更」都走这里。
        undoAction: action => {
            if (!action) return false;
            if (action.kind === 'del') return restoreScript(action.sprite, action.blocks);
            if (action.kind === 'edit') {
                // 撤销替换 = 删掉新写的脚本，再把旧快照原样摆回去（新 id 是随机的，不会撞旧 id）
                let ok = false;
                for (const topBlockId of action.topBlockIds || []) {
                    ok = deleteScript(action.sprite, topBlockId) || ok;
                }
                return restoreScript(action.sprite, action.blocks) || ok;
            }
            if (action.kind === 'sprite') return removeSpriteByName(action.sprite);
            if (action.kind === 'costume') return removeCostumeAt(action.sprite, action.index);
            if (action.kind === 'note') return deleteNote(action.sprite, action.commentId);
            if (action.kind === 'rename') return renameSprite(action.to, action.from);
            if (action.kind === 'costumeContent') {
                // 撤销「编辑造型内容」= 用旧 SVG 原样替换回去（旧 SVG 没快照到就撤不了）
                if (!action.oldSvg) return false;
                return !!replaceCostumeContent(action.sprite, action.index, action.oldSvg,
                    action.oldName).ok;
            }
            if (action.kind === 'costumeRestore') {
                return restoreCostume(action.sprite, {
                    costume: action.costume,
                    index: action.index,
                    current: action.current
                });
            }
            // 撤销「删注释」= 把快照原样摆回去
            if (action.kind === 'noteDel') return restoreNote(action.sprite, action.comment);
            if (action.kind === 'memory' && action.phase === 'write') {
                let ok = true;
                // 这次顺带建出来的保留角色整只摘掉（里面只有这一次写的东西）
                for (const spriteName of action.createdSprites || []) {
                    ok = removeSpriteByName(spriteName) && ok;
                }
                const contentLeft = findTarget(MEMORY_CONTENT_SPRITE);
                if (contentLeft) {
                    if (action.prevContent) {
                        // 覆盖过的：把旧全文原样摆回去
                        ok = setCommentText(MEMORY_CONTENT_SPRITE, action.prevContent.commentId,
                            action.prevContent.text) && ok;
                    } else if (action.commentId && contentLeft.comments[action.commentId]) {
                        // 新建的注释：摘掉，挂点上没别的注释就连帽子
                        const comment = contentLeft.comments[action.commentId];
                        const block = comment.blockId ? contentLeft.blocks.getBlock(comment.blockId) : null;
                        ok = deleteNote(MEMORY_CONTENT_SPRITE, action.commentId) && ok;
                        if (block && !block.comment) ok = deleteScript(MEMORY_CONTENT_SPRITE, comment.blockId) && ok;
                    }
                }
                const indexLeft = findTarget(MEMORY_INDEX_SPRITE);
                if (indexLeft) {
                    const ic = soleComment(indexLeft);
                    if (action.prevIndex !== null && action.prevIndex !== void 0) {
                        if (ic) ok = setCommentText(MEMORY_INDEX_SPRITE, ic.id, action.prevIndex) && ok;
                    } else if (ic) {
                        ok = deleteNote(MEMORY_INDEX_SPRITE, ic.id) && ok;
                    }
                }
                return ok;
            }
            if (action.kind === 'memory' && action.phase === 'delete') {
                // 摆回被删的记忆（新帽子 + 全文快照），index 全文也恢复
                const contentTarget = findTarget(MEMORY_CONTENT_SPRITE);
                if (!contentTarget) return false;
                const hatId = addHatAnchor(contentTarget);
                const made = createNote(MEMORY_CONTENT_SPRITE, action.entry.text, hatId);
                if (!made) return false;
                let ok = true;
                const indexTarget = findTarget(MEMORY_INDEX_SPRITE);
                const ic = indexTarget && soleComment(indexTarget);
                if (action.prevIndex) {
                    if (ic) ok = setCommentText(MEMORY_INDEX_SPRITE, ic.id, action.prevIndex) && ok;
                    else {
                        const hatId2 = addHatAnchor(indexTarget);
                        ok = !!createNote(MEMORY_INDEX_SPRITE, action.prevIndex, hatId2) && ok;
                    }
                }
                return ok;
            }
            let ok = false;
            for (const topBlockId of action.topBlockIds || []) {
                ok = deleteScript(action.sprite, topBlockId) || ok;
            }
            return ok;
        },

        // 拉起事件：模拟「用户点了一下 / 项目发了个广播」，不改项目本身。
        // 广播名认两处：broadcast_msg 变量 + 各角色里「当接收到」帽子的字段值
        // （write_script 写进来的广播 hat 不一定建了对应变量，按字段值才能都认出来）。
        triggerEvent: ({type, name, sprite} = {}) => {
            if (type === 'green-flag') {
                vm.greenFlag();
                return {ok: true};
            }
            if (type === 'broadcast') {
                const broadcastName = String(name || '').trim();
                if (!broadcastName) return {ok: false, reason: 'no-name'};
                const known = new Set();
                for (const target of realTargets()) {
                    for (const variable of Object.values(target.variables || {})) {
                        if (variable && variable.type === 'broadcast_msg') known.add(variable.name);
                    }
                    const blocks = (target.blocks && target.blocks._blocks) || {};
                    for (const block of Object.values(blocks)) {
                        if (block && block.opcode === 'event_whenbroadcastreceived') {
                            const field = block.fields && block.fields.BROADCAST_OPTION;
                            if (field && field.value) known.add(field.value);
                        }
                    }
                }
                if (!known.has(broadcastName)) {
                    return {ok: false, reason: 'unknown-broadcast', broadcasts: [...known].sort()};
                }
                const threads = runtime().startHats('event_whenbroadcastreceived',
                    {BROADCAST_OPTION: broadcastName});
                return {ok: true, triggered: threads.length};
            }
            if (type === 'sprite-clicked') {
                const target = findTarget(sprite);
                if (!target) return {ok: false, reason: 'no-sprite', sprites: spriteNames()};
                const threads = runtime().startHats('event_whenthisspriteclicked', null, target);
                return {ok: true, triggered: threads.length};
            }
            return {ok: false, reason: 'bad-type'};
        },

        // 绿旗运行，最多等 timeoutSec 秒；返回 'done' | 'timeout' | 'stopped'
        runProject: (timeoutSec, {signal} = {}) =>
            new Promise(resolve => {
                let settled = false;
                // 先声明再赋值：greenFlag() 有可能同步就触发停止，那时 finish 里不能碰还没赋值的变量
                let timer = null;
                let onStop = null;
                const finish = outcome => {
                    if (settled) return;
                    settled = true;
                    if (timer !== null) clearTimeout(timer);
                    if (onStop) runtime().off('PROJECT_RUN_STOP', onStop);
                    resolve(outcome);
                };
                onStop = () => finish('stopped');
                timer = setTimeout(() => finish('timeout'), timeoutSec * 1000);
                runtime().on('PROJECT_RUN_STOP', onStop);
                if (signal) signal.addEventListener('abort', () => finish('stopped'), {once: true});
                vm.greenFlag();
            }),

        stopProject: () => {
            vm.stopAll();
            return Promise.resolve();
        },

        readState: () => {
            const sprites = [];
            const variables = {};
            const lists = {};
            // 克隆体不列：跑一次星空能留下上百个，读状态会变成一屏同名条目（用户实际踩到过）
            for (const target of realTargets()) {
                if (target.isStage) {
                    for (const variable of Object.values(target.variables)) {
                        if (!variable) continue;
                        if (variable.type === 'list') lists[variable.name] = variable.value;
                        else if (variable.type !== 'broadcast_msg') variables[variable.name] = variable.value;
                    }
                    continue;
                }
                const costumes = target.getCostumes ? target.getCostumes() : [];
                const costume = costumes[target.currentCostume] || {};
                sprites.push({
                    name: target.getName(),
                    x: Math.round(target.x * 100) / 100,
                    y: Math.round(target.y * 100) / 100,
                    direction: Math.round(target.direction),
                    size: Math.round(target.size),
                    visible: target.visible,
                    costume: costume.name || ''
                });
                // 角色私有变量也带上，用「角色.变量」区分
                for (const variable of Object.values(target.variables)) {
                    if (!variable) continue;
                    const key = `${target.getName()}.${variable.name}`;
                    if (variable.type === 'list') lists[key] = variable.value;
                    else if (variable.type !== 'broadcast_msg') variables[key] = variable.value;
                }
            }
            return {sprites, variables, lists};
        },

        // 舞台当前画面。走 renderer.requestSnapshot —— 它是 scratch-render 官方的截图出口：
        // 在**画完这一帧之后**同步调 canvas.toDataURL()，所以不受 preserveDrawingBuffer 影响
        // （直接读 canvas 在 WebGL 下经常只能拿到空白）。
        snapshotStage: ({timeoutMs = 3000} = {}) => new Promise(resolve => {
            const renderer = runtime().renderer;
            if (!renderer || typeof renderer.requestSnapshot !== 'function') {
                resolve(null);
                return;
            }
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                resolve(null);
            }, timeoutMs);
            renderer.requestSnapshot(dataUrl => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(dataUrl || null);
            });
        }),

        stageSize: () => {
            const rt = runtime();
            return {width: rt.stageWidth || 480, height: rt.stageHeight || 360};
        },

        // —— 角色 / 造型：AI 自己新建角色、画造型 ——

        /**
         * 新建一个角色，带编辑器默认的那张空白造型（0x0）。画内容由 xce_edit_costume 负责
         * （action "edit" 就地画掉这张空白造型，或 "new" 追加新的）。
         * @param {object} input {name, x?, y?, size?, direction?, visible?}
         * @returns {Promise<object>} {ok, reason?, name?} —— 失败时 reason 说明原因
         */
        addSprite: async ({name, x, y, size, direction, visible} = {}) => {
            const wanted = String(name || '').trim();
            if (!wanted) return {ok: false, reason: 'no-name'};
            if (findTarget(wanted)) return {ok: false, reason: 'duplicate', sprites: spriteNames()};

            // 新角色 = 「加进来那一个」：按 id 差集认，比按名字靠得住
            const before = new Set(realTargets().map(t => t.id));
            await vm.addSprite(JSON.stringify(blankSpriteJson(wanted)));
            const target = realTargets().find(t => !before.has(t.id));
            if (!target) return {ok: false, reason: 'failed'};

            if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
                target.setXY(Number(x), Number(y));
            }
            if (Number.isFinite(Number(direction))) target.setDirection(Number(direction));
            if (size !== void 0 && size !== null && size !== '' && Number.isFinite(Number(size))) {
                target.setSize(Number(size));
            }
            if (typeof visible === 'boolean') target.setVisible(visible);

            // 跟编辑器的「绘制」按钮一样，新建完就选中它
            vm.setEditingTarget(target.id);
            if (vm.emitTargetsUpdate) vm.emitTargetsUpdate();
            return {ok: true, name: target.getName()};
        },

        /**
         * 给已有角色加一个 SVG 造型（加在最后，并成为当前造型）。
         * @param {string} spriteName 角色名
         * @param {object} input {svg, name?}
         * @returns {Promise<object>} {ok, reason?, sprite?, costume?}
         */
        addCostume: async (spriteName, {svg, name} = {}) => {
            const target = findTarget(spriteName);
            if (!target) return {ok: false, reason: 'missing', sprites: spriteNames()};
            if (!svg) return {ok: false, reason: 'no-svg'};
            if (!(runtime().storage && runtime().storage.createAsset)) {
                return {ok: false, reason: 'no-storage'};
            }
            const wanted = String(name || '').trim() || defaultCostumeName(target);
            const costume = await attachSvgCostume(target, svg, wanted);
            if (!costume) return {ok: false, reason: 'bad-size'};
            if (vm.emitTargetsUpdate) vm.emitTargetsUpdate();
            return {ok: true, sprite: target.getName(), costume, current: target.currentCostume};
        },

        // 删角色（撤销「新建角色」用）
        removeSprite: removeSpriteByName,

        // 删造型（撤销「加造型」用）。角色的最后一个造型删不得，返回 false 让调用方知道了。
        removeCostume: removeCostumeAt,

        // 替换已有矢量造型的内容（xce_edit_costume 的 edit / 其撤销）
        replaceCostume: replaceCostumeContent,

        // 位图造型（xce_add_costume_from_url 的落点）：dataURL → PNG 资产 → 追加为最后一个造型
        addBitmapCostume: async (spriteName, {dataUrl, name} = {}) => {
            const target = findTarget(spriteName);
            if (!target) return {ok: false, reason: 'missing', sprites: spriteNames()};
            const made = await bitmapCostumeFromDataUrl(dataUrl);
            if (!made.ok) return made;
            made.costume.name = String(name || '').trim() || defaultCostumeName(target);
            await vm.addCostume(made.costume.md5ext, made.costume, target.id);
            return {
                ok: true,
                sprite: target.getName(),
                index: target.getCostumes().length - 1,
                name: made.costume.name,
                width: made.width,
                height: made.height
            };
        },

        // 删除造型的快照 / 恢复（xce_delete_costume 及其撤销）
        captureCostume,

        restoreCostume,

        // 重命名角色（xce_rename_sprite / 撤销）
        renameSprite,

        listCostumes: spriteName => {
            const target = findTarget(spriteName);
            if (!target) return null;
            return target.getCostumes().map((costume, index) => ({
                name: costume.name,
                index,
                format: costume.dataFormat,
                size: costume.size ? costume.size.map(n => Math.round(n)) : null,
                current: index === target.currentCostume
            }));
        },

        /**
         * 一个造型的画面（给 AI 看自己画得对不对）。跟 snapshotStage 一样是浏览器专有：
         * 无头环境没有 Image / canvas，返回 null 由调用方报失败。
         * @param {string} spriteName 角色名
         * @param {string|number} [which] 造型名或下标；不传 = 当前造型
         * @returns {Promise<object>} {dataUrl, width, height, name}；抓不到（没有 canvas、没这个造型）返回 null
         */
        snapshotCostume: (spriteName, which) => new Promise(resolve => {
            const target = findTarget(spriteName);
            if (!target || typeof document === 'undefined') {
                resolve(null);
                return;
            }
            const costumes = target.getCostumes();
            const costume = costumes[pickCostume(costumes, target.currentCostume, which)];
            if (!costume) {
                resolve(null);
                return;
            }
            const storage = runtime().storage;
            // 自带 asset 直接用；否则回 storage 取（内置造型、别人存的项目都走这条）
            const pending = costume.asset ? Promise.resolve(costume.asset) :
                (storage && costume.assetId ?
                    storage.load(
                        costume.dataFormat === 'svg' ?
                            storage.AssetType.ImageVector : storage.AssetType.ImageBitmap,
                        costume.assetId,
                        costume.dataFormat
                    ) : Promise.resolve(null));
            pending.then(asset => {
                if (!asset || typeof asset.encodeDataURI !== 'function') {
                    resolve(null);
                    return;
                }
                const image = new Image();
                image.onload = () => resolve(renderCostumeToPng(image, costume));
                image.onerror = () => resolve(null);
                image.src = asset.encodeDataURI();
            }).catch(() => resolve(null));
        }),

        // 当前编辑的角色名（UI 用它做默认值）
        currentSpriteName: () => {
            const target = vm.editingTarget;
            return target ? target.getName() : null;
        },

        /**
         * 一个**矢量**造型的 SVG 源码文本（用户 2026-10-04 要的：造型是矢量图就直接给源码，
         * 比栅格化成图片省 token，模型还能照着改）。
         *
         * 位图造型没有源码 —— 明确回 `bitmap: true`，由工具侧告诉模型「这条拿不到 SVG」，
         * 而不是让它以为造型是空的。
         * @param {string} spriteName 角色名
         * @param {string|number} [which] 造型名或下标；不传 = 当前造型
         * @returns {Promise<?object>} 没这个角色/造型返回 null；否则
         *   {bitmap: false, name, index, size, width, height, svg}（svg 读不出来时为空串）
         *   或 {bitmap: true, name, index, size}
         */
        readCostumeSvg: async (spriteName, which) => {
            const target = findTarget(spriteName);
            if (!target) return null;
            const costumes = target.getCostumes();
            const index = pickCostume(costumes, target.currentCostume, which);
            const costume = costumes[index];
            if (!costume) return null;
            const size = costume.size ? costume.size.map(n => Math.round(n)) : null;
            if (costume.dataFormat !== 'svg') {
                return {bitmap: true, name: costume.name, index, size};
            }
            const storage = runtime().storage;
            // 自带 asset 直接用；否则回 storage 取（内置造型、用户存过的项目都走这条）
            const asset = costume.asset ? costume.asset :
                (storage && costume.assetId && storage.load ?
                    await storage.load(storage.AssetType.ImageVector, costume.assetId, costume.dataFormat) :
                    null);
            let svg = '';
            try {
                if (asset && typeof asset.decodeText === 'function') svg = asset.decodeText();
                // 兜底：拿到的 asset 只有字节
                else if (asset && asset.data) svg = new TextDecoder().decode(asset.data);
            } catch (e) {
                // 资产是坏的：按「读不出源码」处理，调用方会说清楚
            }
            const canvas = svgCanvasSize(svg);
            return {
                bitmap: false,
                name: costume.name,
                index,
                size,
                width: canvas ? canvas.width : null,
                height: canvas ? canvas.height : null,
                svg: String(svg || '')
            };
        }
    };

    return port;
};
