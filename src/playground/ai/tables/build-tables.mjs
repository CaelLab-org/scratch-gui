/**
 * 构建 AI 终端用的积木元数据表（blocks-meta.json）。
 *
 * 这里的三张表都是「自动生成」而不是手抄的：
 *   1. idToOpcode —— scratchblocks 的积木 id（MOTION_MOVESTEPS）到 sb3 opcode（motion_movesteps）
 *   2. spec       —— 每个 opcode 的 inputs/fields/substacks 参数名，用桩 Blockly 执行
 *                    scratch-blocks 的积木定义抽出来（权威来源，随上游升级自动更新）
 *   3. shadows    —— 哪些输入槽是菜单、对应哪个影子菜单积木（如 motion_goto -> motion_goto_menu），
 *                    从 default_toolbox.js 的 XML 里抽
 *
 * 用法：node src/playground/ai/tables/build-tables.mjs
 */
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as psb from 'parse-sb3-blocks';
import {blocksById} from 'scratchblocks/syntax/blocks.js';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'blocks-meta.js');

// scratch-blocks 的路径：优先用本仓库安装的
const resolveScratchBlocks = () => {
  const candidates = [
    path.resolve(HERE, '../../../../node_modules/scratch-blocks'),
    path.resolve(process.cwd(), 'node_modules/scratch-blocks')
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'blocks_vertical'))) return c;
  }
  throw new Error('找不到 scratch-blocks，请先 npm install');
};
const SB = resolveScratchBlocks();

// ---------------------------------------------------------------- 1. 桩 Blockly
const anyProxy = () => {
  const fn = function () {};
  return new Proxy(fn, {
    get: (t, k) => {
      if (k === 'then') return undefined;
      if (k === Symbol.toPrimitive) return hint => (hint === 'number' ? 0 : 'x');
      if (k === Symbol.iterator || k === Symbol.toStringTag) return undefined;
      return anyProxy();
    },
    apply: () => anyProxy(),
    construct: () => anyProxy(),
    has: () => true
  });
};

// 假积木：真方法用于记录，其它属性一律可继续链式/可调用
const makeChain = api => {
  const f = function () { return proxy; };
  const proxy = new Proxy(f, {
    get: (t, k) => {
      if (typeof k === 'symbol') return undefined;
      if (k in api) return api[k];
      if (k in t) return typeof t[k] === 'function' ? t[k].bind(t) : t[k];
      return makeChain(api);
    },
    apply: () => proxy,
    construct: () => proxy,
    has: () => true
  });
  return proxy;
};

const makeFakeBlock = rec => {
  const inputApi = () => {
    const self = {
      appendField: (field, name) => {
        if (typeof name === 'string') rec.imperative.push({type: 'field', name});
        return self;
      },
      setCheckboxInFlyout: () => self,
      setAlign: () => self
    };
    return new Proxy(self, {get: (t, k) => (k in t ? t[k] : () => self), has: () => true});
  };
  const api = {
    jsonInit: json => { rec.json = json; },
    appendDummyInput: () => inputApi(),
    appendValueInput: name => {
      rec.imperative.push({type: 'input_value', name});
      return inputApi();
    },
    appendStatementInput: name => {
      rec.imperative.push({type: 'input_statement', name});
      return inputApi();
    },
    appendField: (field, name) => {
      if (typeof name === 'string') rec.imperative.push({type: 'field', name});
      return makeChain(api);
    },
    workspace: anyProxy()
  };
  return makeChain(api);
};

const extractDefs = () => {
  const dirs = ['blocks_vertical', 'blocks_common'];
  const defs = {};
  for (const dir of dirs) {
    const full = path.join(SB, dir);
    if (!fs.existsSync(full)) continue;
    for (const file of fs.readdirSync(full).filter(f => f.endsWith('.js'))) {
      const rel = path.join(dir, file);
      const src = fs.readFileSync(path.join(SB, rel), 'utf8');
      const Blocks = {};
      const realBlockly = {Blocks, BlockSvg: {MIN_BLOCK_Y: 20}, EXTENSION_CATEGORY_NAME: 'extensions'};
      const Blockly = new Proxy(realBlockly, {
        get: (t, k) => (k in t ? t[k] : anyProxy()),
        set: (t, k, v) => { t[k] = v; return true; },
        has: () => true
      });
      try {
        const sandbox = {Blockly, goog: anyProxy(), console: {log: () => {}, warn: () => {}, error: () => {}}};
        vm.createContext(sandbox);
        vm.runInContext(src, sandbox, {filename: rel});
      } catch (e) {
        console.warn(`  载入 ${rel} 失败: ${e.message}`);
        continue;
      }
      for (const [opcode, entry] of Object.entries(Blocks)) {
        const rec = {json: null, imperative: []};
        try {
          if (entry && typeof entry.init === 'function') entry.init.call(makeFakeBlock(rec));
        } catch (e) {
          rec.initError = e.message;
        }
        defs[opcode] = rec;
      }
    }
  }
  return defs;
};

const SLOT_INPUT = new Set(['input_value', 'input_statement']);
const SLOT_FIELD = new Set(['field_variable', 'field_dropdown', 'field_numberdropdown',
  'field_input_removable', 'field_variable_getter', 'field_input', 'field_number', 'field_angle']);
const IGNORE = new Set(['field_image', 'field_vertical_separator', 'field_label',
  'field_label_serializable', 'field_label_serializable_removable']);

const normalizeDef = rec => {
  const args = [];
  if (rec.json) {
    for (let i = 0; i <= 5; i++) {
      const key = `args${i}`;
      if (Array.isArray(rec.json[key])) {
        for (const a of rec.json[key]) args.push({type: a.type, name: a.name});
      }
    }
  }
  for (const a of rec.imperative) args.push(a);

  const inputs = {}, fields = {}, substacks = [], order = [];
  for (const a of args) {
    if (!a.name || IGNORE.has(a.type)) continue;
    if (a.type === 'input_statement') substacks.push(a.name);
    else if (SLOT_INPUT.has(a.type)) { inputs[a.name] = a.type; order.push(a.name); }
    else if (SLOT_FIELD.has(a.type) || /^field_/.test(a.type)) { fields[a.name] = a.type; order.push(a.name); }
    else if (a.type === 'control_if_else' || a.type === 'control_if' || a.type === 'control_for_each') substacks.push(a.name);
  }
  return {inputs, fields, substacks, order};
};

// ---------------------------------------------------------------- 2. 影子菜单表
const extractShadows = () => {
  const p = path.join(SB, 'blocks_vertical', 'default_toolbox.js');
  if (!fs.existsSync(p)) return {};
  const src = fs.readFileSync(p, 'utf8');
  const map = {};
  const blockRe = /<block\s+type="([^"]+)"[^>]*>([\s\S]*?)<\/block>/g;
  let m;
  while ((m = blockRe.exec(src))) {
    // 影子必须**按槽位名**记，不能只按出现顺序：
    // looks_changeeffectby 只有 CHANGE 槽带 math_number 影子，按顺序取第一个就会把这个
    // 数字影子错配给 EFFECT 槽 —— 写进项目里的效果字段变成「挂了个 math_number」的坏块。
    const bySlot = {};
    // 工具箱是**字符串拼出来**的 JS：'<value name="X">' + '<shadow type="Y">'，
    // 中间夹着 `' +\n        '`，所以槽位名和 shadow 之间要容忍一小段任意字符。
    const valueRe = /<value\s+name="([^"]+)"[^>]*>[\s\S]{0,120}?<shadow\s+type="([^"]+)"/g;
    let v;
    while ((v = valueRe.exec(m[2]))) bySlot[v[1]] = v[2];
    if (Object.keys(bySlot).length) map[m[1]] = bySlot;
  }
  return map;
};

// ---------------------------------------------------------------- 2.5 扩展积木
// 扩展（画笔/音乐/microbit/ev3...）的定义不在 scratch-blocks 里，而在 scratch-vm 的
// src/extensions/scratch3_*/index.js。用桩 runtime 实例化它们再调 getInfo() 就能拿到全表。
// 跟 scratchblocks 的积木 id 用「归一化文本」对齐（scratchblocks 侧已经知道这些积木的槽位类型）。
const resolveVmExtensions = () => {
  const candidates = [
    path.resolve(HERE, '../../../../node_modules/scratch-vm/src/extensions'),
    path.resolve(process.cwd(), 'node_modules/scratch-vm/src/extensions'),
    path.resolve(SB, '../scratch-vm/src/extensions')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
};
const VM_EXT_DIR = resolveVmExtensions();

// 这几张表在核心积木和扩展积木两边都要写，所以先声明
const spec = {};
const menuValues = {};
// 菜单值**必须按块分开**：不同的块可以共用同一段显示文字、值却不同。
// 典型：核心的「当按下按键」菜单显示 'right arrow'、值就是 'right arrow'，
// 而 Makey Makey 的同类菜单显示同一段文字、值是 'RIGHT'。
// 早先只有一张全局的「显示名 -> 值」表，先扫的扩展先占坑，于是核心块被译成 'RIGHT' ——
// Scratch 只认小写，那个按键块永远不会触发（用户实际踩到过）。
const menuValuesByBlock = {};
const idToOpcode = {};
// 扩展先扫（要拿菜单值），但 id -> opcode 的映射**必须核心优先**：
// 有些扩展积木的文本跟核心积木一模一样（Makey Makey 的「当按下按键」= 事件类的「当按下按键」），
// 按归一化文本对齐时会撞上。撞了要以核心为准，否则会出现
// `when [space v] key pressed` 被翻成 makeymakey_whenMakeyKeyPressed、项目里却没加载扩展的怪事。
const extIdToOpcode = {};
const idCollisions = [];

const extractExtensions = () => {
  const blocks = {};        // opcode -> {sbId, args, menus}
  const byNormText = {};    // 归一化文本 -> sb3 opcode
  const summary = [];
  if (!VM_EXT_DIR) {
    console.warn('  找不到 scratch-vm 扩展目录，跳过扩展积木');
    return {blocks, byNormText, menuShadowByArg: {}, summary};
  }

  const norm = s => String(s).toLowerCase()
    .replace(/%[0-9]+/g, '_').replace(/\[[^\]]*\]/g, '_')
    .replace(/[^a-z0-9]+/g, ' ').trim();

  // scratchblocks 的积木 id：归一化 spec -> id（只对扩展积木用得上）
  const sbByNormText = {};
  for (const [id, def] of Object.entries(blocksById)) {
    if (def.spec && !(norm(def.spec) in sbByNormText)) sbByNormText[norm(def.spec)] = id;
  }

  // scratch-vm 的 l10n 在没加载语言时会刷警告，这里静音
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};

  const dirs = fs.readdirSync(VM_EXT_DIR).filter(name =>
    fs.existsSync(path.join(VM_EXT_DIR, name, 'index.js')));

  for (const dir of dirs) {
    let info;
    try {
      const mod = require(path.join(VM_EXT_DIR, dir, 'index.js'));
      const Ctor = mod && mod.getInfo ? mod : (mod && mod.default) || mod;
      info = typeof Ctor === 'function' ? new Ctor(anyProxy()).getInfo() : Ctor.getInfo();
    } catch (e) {
      summary.push(`${dir}: 失败 ${e.message}`);
      continue;
    }
    if (!info || !info.blocks) continue;

    const menus = {};
    for (const [menuName, menuDef] of Object.entries(info.menus || {})) {
      // 菜单项的显示文本 -> 内部值（用于把文本里写的显示文本换回 sb3 的值）
      for (const item of (menuDef.items || [])) {
        const display = typeof item === 'string' ? item : item.text;
        const value = typeof item === 'string' ? item : item.value;
        if (typeof display === 'string' && !display.includes('{') && !(display in menuValues)) {
          menuValues[display] = value;
        }
      }
      menus[menuName] = menuDef;
    }

    for (const block of info.blocks) {
      if (!block.opcode || typeof block.text !== 'string') continue;
      if (block.blockType === 'label' || block.blockType === 'button') continue;
      const opcode = `${info.id}_${block.opcode}`;
      const args = Object.keys(block.arguments || {});
      const menuOf = {};
      for (const [argName, argDef] of Object.entries(block.arguments || {})) {
        if (argDef && argDef.menu) menuOf[argName] = `${info.id}_menu_${argDef.menu}`;
      }
      // 扩展块的菜单挂在影子菜单积木上（如 makeymakey_menu_KEY），就登记在那个 opcode 下 ——
      // 转换器拿到的正是影子 opcode，按块取才不会跟核心的同名菜单互相串味
      for (const [argName, shadowOpcode] of Object.entries(menuOf)) {
        const menuName = shadowOpcode.slice(`${info.id}_menu_`.length);
        const items = (menus[menuName] && menus[menuName].items) || [];
        const map = {};
        for (const item of items) {
          const display = typeof item === 'string' ? item : item.text;
          const value = typeof item === 'string' ? item : item.value;
          if (typeof display === 'string' && !display.includes('{')) map[display] = value;
        }
        if (Object.keys(map).length) {
          menuValuesByBlock[shadowOpcode] = {...(menuValuesByBlock[shadowOpcode] || {}), ...map};
        }
      }
      blocks[opcode] = {sbId: sbByNormText[norm(block.text)] || null, args, menus: menuOf};

      const sbId = blocks[opcode].sbId;
      if (sbId && !(sbId in extIdToOpcode)) extIdToOpcode[sbId] = opcode;
      // 扩展块的槽位名就是参数名，顺序即定义顺序；全部是 input（菜单项另有影子块）
      if (!(opcode in spec)) {
        spec[opcode] = {
          inputs: Object.fromEntries(args.map(a => [a, 'input_value'])),
          fields: {},
          substacks: [].concat(block.branchCount ? ['SUBSTACK'] : []),
          order: args
        };
      }
    }
    summary.push(`${info.id}: ${info.blocks.length} 块`);
  }

  console.warn = realWarn;
  console.error = realError;
  return {blocks, byNormText, menuShadowByArg: {}, summary};
};

const extResult = extractExtensions();
const extensionBlocks = extResult.blocks;

// ---------------------------------------------------------------- 3. 组装（核心积木）
const defs = extractDefs();
for (const [opcode, rec] of Object.entries(defs)) spec[opcode] = normalizeDef(rec);

for (const [opcode, def] of Object.entries(psb.allBlocks)) {
  const key = def.translationKey || opcode.toUpperCase();
  if (!(key in idToOpcode)) idToOpcode[key] = opcode;
}

// 核心已经占住的 id，扩展一律让位；让位过哪些块记下来，构建时打出来（下次再撞能看见）
for (const [sbId, opcode] of Object.entries(extIdToOpcode)) {
  if (sbId in idToOpcode) {
    idCollisions.push(`${sbId}：核心 ${idToOpcode[sbId]} 胜，扩展 ${opcode} 让位`);
    continue;
  }
  idToOpcode[sbId] = opcode;
}

// 菜单显示文本 -> 内部值（英文）。
// 全局这张只留作兜底（按块的表没有时才查它），按块的表才是准的 —— 见 menuValuesByBlock 的说明。
for (const [blockOpcode, menus] of Object.entries(psb.allMenus || {})) {
  for (const [internal, def] of Object.entries(menus)) {
    const display = def && def.defaultMessage;
    if (typeof display !== 'string' || display.includes('{')) continue;
    if (!(display in menuValues)) menuValues[display] = internal;
    const byBlock = (menuValuesByBlock[blockOpcode] = menuValuesByBlock[blockOpcode] || {});
    if (!(display in byBlock)) byBlock[display] = internal;
  }
}

const shadows = extractShadows();

// scratch-blocks 的积木定义里也写着菜单项（jsonInit 的 options），而且比 psb 全：
// psb 那侧只收了「有文案」的几项（空格 / 四个方向键 / 任意），字母键 a-z 是硬写在定义里的
// （['a','a'] …），psb 的数据里根本没有。只按 psb 建表，校验时会把
// `when [w v] key pressed` 这种完全合法的写法当成非法值。
// 但定义里的 options 也**不能全信**：造型名、声音名这类菜单在定义里只是一串占位项
// （looks_costume -> costume1/costume2，sound_sounds_menu -> 0/1/2…），真正的内容是编辑器
// 运行期填的。所以下面分两步：**只补已有的菜单，绝不造新的**。
// 模板串（Blockly.Msg.XXX）在桩里是代理对象、不是字符串，只认字面量字符串的项。
const harvestDropdownOptions = rec => {
  const out = {};
  if (!rec.json) return out;
  for (let i = 0; i <= 5; i++) {
    for (const a of (rec.json[`args${i}`] || [])) {
      if (!a || a.type !== 'field_dropdown' || !Array.isArray(a.options)) continue;
      for (const opt of a.options) {
        const display = Array.isArray(opt) ? opt[0] : opt;
        const value = Array.isArray(opt) ? opt[1] : opt;
        if (typeof display !== 'string' || display.includes('{') || typeof value !== 'string') continue;
        out[display] = value;
      }
    }
  }
  return out;
};
const harvestedByOpcode = {};
for (const [opcode, rec] of Object.entries(defs)) {
  const harvested = harvestDropdownOptions(rec);
  if (Object.keys(harvested).length) harvestedByOpcode[opcode] = harvested;
}
// psb / 扩展已经认下的菜单（= 有文案、给人看的静态菜单）才用定义里的选项补齐
for (const [opcode, harvested] of Object.entries(harvestedByOpcode)) {
  if (!menuValuesByBlock[opcode]) continue;
  menuValuesByBlock[opcode] = {...harvested, ...menuValuesByBlock[opcode]};
}

// 菜单影子积木（sensing_keyoptions 之于 sensing_keypressed）跟宿主是**同一张菜单**，
// 两边都得是完整的一张：宿主那份来自 psb，影子那份来自定义，合起来才全。
// 只处理**下拉菜单**影子 —— 值影子（math_number / text / colour_picker）是几十个积木共用的，
// 把合并结果写回去会把所有宿主的菜单都吸进那一个影子，再靠「哨兵跳过」把校验静默关掉。
const isDropdownBlock = opcode => {
  const s = spec[opcode];
  return !!s && Object.values(s.fields || {}).some(t => t === 'field_dropdown' || t === 'field_numberdropdown');
};
const menuSource = opcode => ({...(harvestedByOpcode[opcode] || {}), ...(menuValuesByBlock[opcode] || {})});
for (const [ownerOpcode, bySlot] of Object.entries(shadows)) {
  for (const shadowOpcode of Object.values(bySlot)) {
    if (!isDropdownBlock(shadowOpcode)) continue;
    // 两边都没有已知菜单 = 运行期才填的菜单（造型名 / 声音名），碰不得
    if (!menuValuesByBlock[ownerOpcode] && !menuValuesByBlock[shadowOpcode]) continue;
    const merged = {...menuSource(shadowOpcode), ...menuSource(ownerOpcode)};
    menuValuesByBlock[ownerOpcode] = merged;
    menuValuesByBlock[shadowOpcode] = merged;
  }
}

// 渲染器会崩的条目（noTranslation 且缺 defaultMessage）—— 上游 bug，运行时需要打补丁
const messagePatches = {};
for (const [opcode, def] of Object.entries(psb.allBlocks)) {
  if (!def.defaultMessage) messagePatches[opcode] = Object.keys(spec[opcode] ? spec[opcode].fields : {}).map(f => `{${f}}`).join(' ') || `{${opcode.toUpperCase()}}`;
}

// scratchblocks 侧的槽位定义（parts + 槽类型 + 形状）
// 注意：无参数的积木（帽子块、forever 之类）也要收进来 —— 转换器靠它判断「这个积木认不认识」
const sbBlocks = {};
for (const [id, def] of Object.entries(blocksById)) {
  if (!def.parts || !def.inputs) continue;
  sbBlocks[id] = {
    parts: def.parts,
    slotTypes: def.inputs,
    shape: def.shape,
    slots: def.parts.filter(p => /^%[a-zA-Z0-9]/.test(p)).length
  };
}

// 扩展积木的菜单：槽位名 -> 影子菜单积木 opcode（扩展块的菜单是按参数名定位的，不像核心块能按位置对齐）
const menuShadowByArg = {};
for (const [opcode, def] of Object.entries(extensionBlocks)) {
  if (def.menus && Object.keys(def.menus).length) menuShadowByArg[opcode] = def.menus;
}

const out = {
  _generated: new Date().toISOString().slice(0, 10),
  _source: 'scratch-blocks 积木定义 + scratch-vm 扩展定义 + parse-sb3-blocks 翻译键 + default_toolbox.xml（自动生成，勿手改）',
  idToOpcode,
  spec,
  shadows,
  menuShadowByArg,
  menuValues,
  menuValuesByBlock,
  messagePatches,
  sbBlocks
};

fs.writeFileSync(
  OUT,
  `/* 自动生成，请勿手改：由 build-tables.mjs 从 scratch-blocks 的积木定义、scratch-vm 的扩展定义、parse-sb3-blocks 的翻译键、default_toolbox.xml 抽出 */\nexport default ${JSON.stringify(out, null, 1)};\n`
);
const specCount = Object.keys(spec).length;
console.log(`已写出 ${path.relative(process.cwd(), OUT)}`);
console.log(`  idToOpcode:      ${Object.keys(idToOpcode).length}`);
console.log(`  spec(opcode):    ${specCount}`);
console.log(`  shadows:         ${Object.keys(out.shadows).length}`);
console.log(`  menuShadowByArg: ${Object.keys(menuShadowByArg).length}`);
console.log(`  menuValues:      ${Object.keys(menuValues).length}`);
console.log(`  menuValuesByBlock: ${Object.keys(menuValuesByBlock).length}`);
console.log(`  messagePatches:  ${Object.keys(messagePatches).length}`);
console.log(`  sbBlocks:        ${Object.keys(sbBlocks).length}`);
console.log(`  扩展积木:        ${Object.keys(extensionBlocks).length}（对上 scratchblocks id 的：${Object.values(extensionBlocks).filter(b => b.sbId).length}）`);
console.log(`  扩展明细:        ${extResult.summary.join(' | ')}`);
console.log(`  id 冲突（核心优先）: ${idCollisions.length}${idCollisions.length ? `\n    - ${idCollisions.join('\n    - ')}` : ''}`);

// 部分扩展（microbit / ev3 之类）会留下定时器，进程不会自己退出
process.exit(0);
