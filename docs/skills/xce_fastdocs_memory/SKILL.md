---
name: xce_fastdocs_memory
description: How the assistant's long-term memory works in this editor — what belongs in it, how to write a memory that is still useful weeks later, and how memories interact with skills and the user's own settings. Load this when you are about to save, rewrite or delete a memory, or when the user asks what you remember about them.
---

# Memory

You have a long-term memory that survives across conversations. The user can see and edit all of it in
the panel's settings, so treat it as something you write **for** them, not behind their back.

## The two halves

- **The index** — name and one-line description of every memory — is in your prompt on every turn, under
  `<memory>`. It is the only part you get for free.
- **The bodies** are not in your prompt. Read one with `xce_read_memory` when it matters for the work in
  front of you. Do not read them "just in case": that is the cost this design exists to avoid.

## What to save

Save a fact when it will still be true next week and would change what you do:

- **user** — what to call them, their age and level, how much explanation they want, what they dislike.
- **feedback** — a correction you must not repeat ("don't rename my variables"), a rule they gave you.
- **project** — what they are building and why, what is still unfinished, decisions already settled.
- **reference** — where something lives (a site, a document, a tool they use).

Do not save:

- Anything only true right now — what a variable holds, which script you just wrote, the current task.
  That is what the conversation itself is for.
- Anything you would have to guess. A wrong memory is worse than no memory: it will be read back to you
  as fact weeks later.
- Passwords, API keys, or any secret. The memory is stored in the user's browser and shown to them; a
  secret does not belong there.

## Writing one that still works later

- **`name` is the handle**, and the same name overwrites. Check the index in your prompt first: if a
  memory about the same thing exists, reuse its exact name instead of creating a near-duplicate.
- **`description` must answer "should I read this?"** — `"what to call the user"` beats `"user info"`.
  It is the only text you will see next time, so a vague one makes the memory unreachable.
- **`body` carries the fact itself**, complete enough to act on alone, in the user's own language.
  Write what is true, not what you wish were true; if the user said something ambiguous, save the
  ambiguity rather than resolving it yourself.
- When a fact changes, **overwrite the same name**. Delete (`xce_delete_memory`) only when it stopped
  being relevant, or when the user says it is wrong.

## Keeping it small

The store holds at most 60 memories, and every description is re-sent on every turn. When it is full you
get an error: merge or delete instead of adding a nineteenth note about the same user. A memory store
that has drifted into noise is worse than an empty one — when you notice two memories that overlap,
fold them into one and delete the other without asking.

## Memory and skills are different things

A **skill** is reference documentation shipped with the editor (or written by the user) that you read
when a task needs it. A **memory** is a fact about this user and their project. Do not put documentation
into a memory, and do not put facts about the user into a skill.

The user's own settings page also has a custom prompt box. That is theirs to write and it applies to
every turn; you are not expected to edit it, and memory is not a reason to.
