---
name: xce_fastdocs_engine
description: XMUER Coding Engine itself — what it is, where it lives, and how it is built and deployed. Load this when the user asks about the editor's own features, its relationship to Scratch or TurboWarp, or how a change gets published.
---

# XMUER Coding Engine (XCE)

This is the editor you are running inside. It is the site at <https://engine.xmuer.online/>.

## What it is

A Scratch-based block programming editor, forked from **TurboWarp**, which is itself a fork of **scratch-gui** —
technically it IS built on Scratch. It is a **CaelLab** project; do not claim it is scratch.org itself.

Its own selling points, as the project describes them: projects are compiled to JavaScript so they run much
faster than in the standard editor, plus dark mode, addons, and this built-in AI assistant.

## Using the tools correctly (common mistake)

`xce_write_script` takes exactly two parameters: `sprite` (an existing sprite's name) and `text`
(the scratchblocks script). There is **no** `script` parameter — passing the code as `script` is a mistake.

## Drawing a costume

`xce_add_sprite` creates a new sprite with one blank costume (that is the normal starting point);
`xce_rename_sprite` renames one. Looks are made and changed with `xce_edit_costume`: action `"new"`
appends a costume you drew, action `"edit"` redraws an existing vector costume (including the blank
one) in place. `xce_add_costume_from_url` imports an image file from the web instead
(webp/png/jpeg/svg), and `xce_delete_costume` removes a costume the user no longer wants. Drawings are SVG documents **you write**, and whether
they show up at all comes down to a few rules (numeric `width`/`height` on the root element, the
subset of SVG the editor renders, where the rotation centre sits) — they are in the detailed doc
`xce_fastdocs_engine/draw-svg`. Read that before you draw, not after something comes out blank.

Then look at your own work with `xce_read_costume` (or `xce_read_stage` for the whole stage). Both
return a picture **only on a vision model**; on a text-only model they hand back a note saying so,
and then you tell the user you cannot see it — never describe a drawing you have not looked at.

## Where things are

- Editor: <https://engine.xmuer.online/> — the landing page is
  `src/playground/render-interface.jsx` and the editor is the same page with `isPlayerOnly === false`.
- You live in `src/playground/ai/` — the panel, the tools, the model layer, the prompt.
- Blocks are rendered by scratch-blocks; the project model and the interpreter are scratch-vm.
- Anything under `src/addons/` is upstream TurboWarp's addon system. `src/addons/pull.js` clones the upstream
  addons repository and rebuilds it, so a hand-written addon there would be wiped.

## Build and deploy

- Build: `npm run build` (webpack 4, `NODE_ENV=production`). Output goes to **`build/`**, not `dist/`.
- The one CI workflow is `.github/workflows/ci.yml`: pushes and pull requests run test + build, and a push to
  the **develop** branch additionally publishes the build output to GitHub Pages.
- The custom domain is set by `static/CNAME` → `engine.xmuer.online`.
- Never use `BUILD_MODE=dist` — that is for library packaging and produces no `index.html`.

## Brand, for anything you write into the page

- Name: XMUER Coding Engine. Primary colour `#2b6fec`, hover `#1d5bd6`; accent orange `#f08c00` used only as a
  small highlight, never as a large fill.
- Page background `#f5f6f8`, cards `#ffffff`, borders `#e4e7ec`.
- Text: `#101828` / `#5a6472` / `#98a2b3`.
- Shadows are neutral `rgba(16, 24, 40, …)`. Coloured shadows are not allowed.
- Gradients stay within one hue family; no cross-hue gradients. Backgrounds are neutral cool white.

## Writing about the editor to users

Explain what a block does in terms of the block's name in the palette, not in terms of the underlying
implementation. If the user asks about something the editor cannot do, say so plainly instead of describing
a workaround that would not work.
