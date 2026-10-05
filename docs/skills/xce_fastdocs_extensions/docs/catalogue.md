# Detailed doc: the extension blocks you can write

Read this when a script of yours uses pen, music, video sensing, speech or translate blocks, or when you
are about to guess at a dropdown's wording.

Every line below was run through the same text-to-blocks converter `xce_write_script` uses, so the wording
is known to parse. Forms that look similar but are not here are the ones that do not.

## pen (画笔)

```scratchblocks
erase all
stamp
pen down
pen up
set pen color to [#0000ff]
set pen [color v] to (50)
change pen [color v] by (10)
change pen [hue v] by (10)
set pen size to (1)
change pen size by (1)
```

The colour drop-down takes `color`, `saturation`, `brightness` or `transparency`; `hue` is a separate
menu. Older projects can contain the legacy shade blocks, but those cannot be written.

## music (音乐)

```scratchblocks
play drum (1 v) for (0.25) beats
play note (60) for (0.25) beats
rest for (0.25) beats
set instrument to (1 v)
set tempo to (60)
change tempo by (20)
tempo
```

## videoSensing (视频侦测)

```scratchblocks
when video motion > (10)
video [motion v] on [this sprite v]
turn video [on v]
set video transparency to (50)
```

`video [...] on [...]` takes `motion` or `direction` for the first slot, `this sprite` or `stage` for the
second; `turn video [...]` takes `on`, `off` or `on-flipped`.

## text2speech (文字朗读)

```scratchblocks
speak [hello]
set voice to [alto v]
set language to [English v]
```

`speak` is the waiting form — the script does not continue until the sentence is read out.

## translate (翻译)

```scratchblocks
translate [hello] to [Chinese v]
language
```

## Hardware extensions

`makeymakey`, `microbit`, `ev3`, `boost`, `wedo2` and `gdxfor` are writable in the same way (numbers in
`(…)`, menus in `[…]`), but nothing they do is observable without the device plugged in and paired. Check
with the user that they actually have it before writing a script for it, and ask them for the wording of
any block you are unsure about rather than inventing one.

## Not writable, whatever is loaded

`tw` (XMUER Coding Engine Blocks), Face Sensing, and everything loaded from the Extension Gallery or by
URL. The converter has no block definitions for these, so a script using them is refused in full as
`unrecognized` — tell the user the blocks are outside what you can write, and offer a way that uses the
blocks you can.

## Where this list comes from

The converter's block set is generated at build time into `src/playground/ai/tables/blocks-meta.js`, from
scratch-blocks, the extension classes in `node_modules/scratch-vm/src/extensions/`, and the
parse-sb3-blocks translation keys:

```
node src/playground/ai/tables/build-tables.mjs
```

If one of the forms above ever stops parsing, re-run that and compare the extension ids in the printed
counts against this doc. The panel's own list of entries comes from
`src/lib/libraries/extensions/index.jsx`; the labels are in that file's `name:` fields, and the Chinese
ones in `node_modules/@turbowarp/scratch-l10n/locales/editor-msgs.js` under `zh-cn`.
