---
name: xce
description: XMUER Coding Engine itself — what it is, where it lives, and how it is built and deployed. Load this when the user asks about the editor's own features, its relationship to Scratch or TurboWarp, or how a change gets published.
---

# XMUER Coding Engine (XCE)

This is the editor you are running inside. It is the site at <https://engine.xmuer.online/>.

## What it is

A Scratch-based block programming editor, forked from **TurboWarp**, which is itself a fork of **scratch-gui**.
It is a **CaelLab** project. It is **not** affiliated with Scratch, the Scratch Team, or the Scratch Foundation —
never claim it is Scratch or an official Scratch product.

Its own selling points, as the project describes them: projects are compiled to JavaScript so they run much
faster than in the standard editor, plus dark mode, addons, and this built-in AI assistant.

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
