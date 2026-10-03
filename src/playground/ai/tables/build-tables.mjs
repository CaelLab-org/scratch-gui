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
    const shadows = [...m[2].matchAll(/<shadow\s+type="([^"]+)"/g)].map(x => x[1]);
    if (shadows.length) map[m[1]] = shadows;
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

// 这三张表在核心积木和扩展积木两边都要写，所以先声明
const spec = {};
const menuValues = {};
const idToOpcode = {};

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
      blocks[opcode] = {sbId: sbByNormText[norm(block.text)] || null, args, menus: menuOf};

      const sbId = blocks[opcode].sbId;
      if (sbId && !(sbId in idToOpcode)) idToOpcode[sbId] = opcode;
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

// 菜单显示文本 -> 内部值（英文）
for (const menus of Object.values(psb.allMenus || {})) {
  for (const [internal, def] of Object.entries(menus)) {
    const display = def && def.defaultMessage;
    if (typeof display === 'string' && !display.includes('{') && !(display in menuValues)) {
      menuValues[display] = internal;
    }
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
  shadows: extractShadows(),
  menuShadowByArg,
  menuValues,
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
console.log(`  messagePatches:  ${Object.keys(messagePatches).length}`);
console.log(`  sbBlocks:        ${Object.keys(sbBlocks).length}`);
console.log(`  扩展积木:        ${Object.keys(extensionBlocks).length}（对上 scratchblocks id 的：${Object.values(extensionBlocks).filter(b => b.sbId).length}）`);
console.log(`  扩展明细:        ${extResult.summary.join(' | ')}`);

// 部分扩展（microbit / ev3 之类）会留下定时器，进程不会自己退出
process.exit(0);
