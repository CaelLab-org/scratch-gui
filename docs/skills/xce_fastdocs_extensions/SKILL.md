---
name: xce_fastdocs_extensions
description: The extension catalogue — which extensions this editor offers, what each one is called in the 添加扩展 panel, which of them accept blocks from xce_write_script, and what to do when a write is refused because an extension is not loaded. Read this when a script needs an extension (pen, music, translate, video sensing, hardware), when a write came back refused for one, or when the user asks what extensions there are.
---

# Extensions

## You never load one yourself

No tool loads an extension, and there is no way around that — loading one changes the user's project.
The user does it by hand, so give them the exact clicks:

1. 「收起面板」 — the collapse button at the top-left of the AI panel. The panel goes away.
2. 「添加扩展」 — the button at the bottom-left of the editor, with the palette visible again.
3. They pick the entry by its **label** (below), then 「AI 对话」 reopens the panel and they ask you to retry.

The refusal names the extension by **id** (`translate`, `wedo2`, `videoSensing`). The panel shows
**labels**, and a user hunting a grid of icons will never find "videoSensing" — do the translation
yourself: 「在「添加扩展」里选『视频侦测』」.

## Which entry is which

| id | label in 添加扩展 | blocks you can write |
| --- | --- | --- |
| `music` | 音乐 | yes |
| `pen` | 画笔 | yes |
| `videoSensing` | 视频侦测 | yes |
| `text2speech` | 文字朗读 | yes |
| `translate` | 翻译 | yes |
| `makeymakey` | Makey Makey | only with the device |
| `microbit` | micro:bit | only with the device |
| `ev3` | LEGO MINDSTORMS EV3 | only with the device |
| `boost` | LEGO BOOST | only with the device |
| `wedo2` | LEGO Education WeDo 2.0 | only with the device |
| `gdxfor` | Go Direct Force & Acceleration | only with the device |
| `procedures_enable_return` | Custom Reporters | — |
| `faceSensing` | Face Sensing | no |
| `tw` | XMUER Coding Engine Blocks | no |
| `custom_extension` | Custom Extension | no |
| `gallery` | XMUER Coding Engine Extension Gallery | no |

Read the table's second column as the thing to say out loud, not the id. Only the five Scratch extensions
have Chinese labels; the hardware, Custom Reporters, Blocks, Custom Extension and Gallery entries are
untranslated in this build, so their buttons read English even in a Chinese UI.

`procedures_enable_return` adds no category of its own — turning it on only lets a custom block return a
value, and the block then appears under 自制积木. `custom_extension` and `gallery` load something the
editor does not ship: by URL or local file, and from the TurboWarp gallery of hundreds of extensions.

## Two different refusals

- **`unrecognized`** — the wording is not in the block set at all. Fix the text; the tool names what it
  could not parse. Every `tw` block, Face Sensing, and anything from the Gallery or a custom URL lands
  here: no block definitions exist for them, so they cannot be written no matter what the project has
  loaded. Say so plainly instead of trying wording variants.
- **`missingExtensions`** — the wording is fine, the project simply has not loaded the extension. That is
  the case the clicks above fix. Retry after the user adds it, and do not claim it is loaded before then.

If the user's project already contains a script that uses an unwritable extension, `xce_read_project`
shows how it is spelled — that is for reading and quoting back, not a promise that writing the same text
will succeed.

## The blocks themselves

`xce_fastdocs_extensions/catalogue` lists every extension block you can actually write, with the input and
dropdown forms the parser accepts. Read it before writing pen, music, video sensing, speech or translate
blocks rather than trusting memory: a dropdown written the wrong way quietly turns into a variable
reference instead of the menu item, and the script lands wrong without an error.
