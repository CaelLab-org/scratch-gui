# Drawing a costume as SVG

How to make a sprite look like something, using `xce_add_sprite` (a new sprite) or
`xce_add_costume` (one more costume on an existing sprite). Both take the costume as an SVG document
**you write yourself**, so this page is the difference between a drawing that shows up and one that
comes out blank.

Afterwards, look at what you drew with `xce_read_costume` before you tell the user it is done.

## What the editor will and will not show

The costume is rendered by Scratch's SVG engine, which handles a **subset** of SVG. Stay inside it:

- **Basic shapes**: `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`, `<path>`.
  `<g>` groups with a `transform` are fine, and so is nesting them.
- **Paints**: `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `opacity`,
  `fill-opacity`, `stroke-opacity`. Plain `linearGradient` / `radialGradient` in `<defs>` work too.
- **Do not use `<text>`.** Text is converted to outlines at import, which depends on the font being
  found, and the result is unreliable or missing. Draw letters from shapes instead.
- **Do not use `<image>`, `<script>`, `<foreignObject>`, `<filter>`, `<mask>`, CSS `@import`, or web
  fonts.** The costume is stored inside the user's project: anything loaded from outside will not
  travel with it. Animations (`<animate>`) never run — a costume is a still picture.
- Keep `<defs>` ids unique within the document and reference them exactly; costumes get merged into
  one rendering context, so do not count on an id meaning anything across documents.

## The two rules that break the most drawings

1. **The root `<svg>` must carry numeric `width` and `height`.** Not `100%`, not `10cm` — plain
   numbers. The editor sizes the costume from those attributes, so anything else gives a 0x0 costume
   that shows as nothing. Also give a matching `viewBox` so your coordinates mean what you think:

   ```svg
   <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
   ```

   The tools refuse a costume without them and tell you, so this one is caught early.

2. **The rotation centre is the centre of the canvas** (width/2, height/2). So put the figure's own
   centre at the canvas centre, not in a corner: a ball drawn in the top-left corner will spin and
   move around a point it does not sit on. Draw symmetric things symmetrically, and leave the same
   margin on every side.

## Size and colour

- **1 canvas unit = 1 stage pixel.** The stage is 480 wide and 360 tall, so a 120x120 costume covers
  a quarter of the stage width. Sprites are usually between 40 and 200 px; smaller than about 20 px
  is hard to see, larger than the stage is hard to use.
- The costume is drawn over the stage on a **transparent background** — the panel preview is on
  white, so a shape that is white or nearly white will look like nothing there. Give figures a
  visible outline or a colour.

## A whole costume, as a model to copy

A blue ball with a highlight, centred, 120x120:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="55" fill="#2b6fec"/>
  <circle cx="42" cy="42" r="14" fill="#ffffff" opacity="0.55"/>
</svg>
```

Note where the centre is (60, 60) and that the shape nearly fills the canvas on every side.

## When it does not work

- **"the root `<svg>` must carry numeric width and height"** — that attribute is missing or is a
  percentage. Add plain numbers and call the tool again.
- **The tool says the editor could not render the SVG** — the document used something outside the
  list above (usually `<text>`, a filter, or an external reference). Simplify it to plain shapes and
  add a corrected costume.
- **"A sprite named … already exists"** — sprite names are unique. Pick another, or add the costume
  to the existing sprite.
- **Nothing visible but no error** — check the canvas centre and that the colour is not white on a
  transparent background; then look at it with `xce_read_costume`.

## Seeing your own drawing

`xce_read_costume` returns the costume as a picture, on its own and before the project is run.
Whether the picture reaches you depends on the model: on a text-only model the tool says it cannot
pass on an image, and then you tell the user that plainly instead of describing a drawing you have
not seen — that is a fact about the model, not a failure of the drawing. The user can switch to a
vision model (marked 「看图」 in the model list) and ask again.
