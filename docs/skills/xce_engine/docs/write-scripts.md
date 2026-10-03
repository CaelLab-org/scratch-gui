# Detailed doc: writing scripts with xce_write_script

Read this when a `xce_write_script` call failed, or before your first call if you are unsure about the
parameter shape or the block-text format.

## Parameters — exactly two, with these names

| Parameter | Type | What it is |
| --- | --- | --- |
| `sprite` | string | The **name of an existing sprite**（角色）. Get exact names from `xce_list_sprites`; the current one is in the `<current-sprite>` snapshot field. |
| `text` | string | The script in scratchblocks notation. May contain several scripts separated by blank lines. |

There is **no** `script` parameter and no `code` parameter. Passing the code under any other name
produces `错误：缺少参数 sprite, text` — the fix is to resend with `sprite` and `text`.

A call with `text` but no `sprite` fails the same way. There is no default sprite; if the user did not
name one, use the `<current-sprite>` value or ask.

## The text format (scratchblocks)

```scratchblocks
when green flag clicked
set [count v] to (0)
repeat (10)
  change [count v] by (1)
end
say (join [counted to ] (count))
```

Rules that decide whether parsing succeeds:

- Hat block first: `when green flag clicked`, `when this sprite clicked`, `when I receive [msg v]`, …
- Dropdowns (variables, lists, sprite-chosen options) are `[name v]`; plain text is `[text]`;
  numbers are `(10)`; boolean slots are `<...>`
- C-blocks close with `end`; branches use `else`; indent with **2 spaces**
- Scripts are separated by a **blank line**
- Block names are the English palette names, exactly as above
- Reading the sprite first with `xce_read_project` shows the exact style to imitate, including how
  existing variables are spelled

## What happens on success

The blocks land in the workspace as real blocks (the user can drag them), variables and lists are
created automatically when first used, and the layout is tidied. The result includes the new top block
ids — the UI offers the user an undo for the whole call.

## What is refused, on purpose

- Blocks from an extension the project has not loaded. The error names the extensions; tell the user
  to add them via 添加扩展 (bottom-left), then retry. Never claim you can load extensions yourself.
- Custom blocks (`define ...` and calls to them) and `stop [this script v]`. Offer an alternative instead.
- Editing or removing existing scripts — `xce_write_script` appends only. To change behaviour, the
  user decides whether to delete a script (`xce_delete_script`) and re-add it.
