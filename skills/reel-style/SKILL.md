---
name: reel-style
description: List, create, edit, or delete the member's reel styles, set the default, or re-render the last reel in another style. Use for "/reels-engine:reel-style", "show my styles", "make a stories style", "switch the font", "make the captions bigger", "more zoom", "try that reel in my other style".
---

# Reel style

ENGINE = `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/reels.js"`
HOME = `$REELS_HOME` if set, otherwise `~/Movies/Reels` on a Mac and `~/Videos/Reels` on Windows. `ENGINE init-home` prints it.
In commands, always put HOME and PROJECT paths in double quotes, written out in full as the engine prints them (a `~` inside quotes does not work). On Windows they have backslashes and often spaces, which break without the quotes.

A style is the **look** only: font, captions, colors, zoom. It never changes the cut. If a member wants tighter or looser pauses, that is the edit rules, not a style: change `gap_between_ms` (100-250) or `gap_within_target_ms` in `HOME/edit-config.json`, then re-run `finish`.

A member's styles are the files in `HOME/styles/*.json`, one per content series ("tips", "stories"). Their default is `default_style` in `HOME/brand-kit.json`. The engine has one built-in, `starter`, used only until they have their own. Never offer clean, punchy, or editorial: those are gone. (An old home may still hold those three files. They still work; leave them alone unless they ask.)

File shape and every knob: `references/style-file.md`.

## What to do

- **List:** read `HOME/styles/` and describe each style in one plain line (font, one word or word groups, soft shadow / outline / none, where the captions sit, zoom), with the default marked. No styles yet: say they are on the starter look and offer to set up their own.
- **New style:** run `references/style-interview.md`.
- **Good to know:** a member can also change a style's font, captions, text style and colors on the screen that follows Send to Claude in /reels-engine:reel ("Change the look"). That writes to the same style file, so read the file fresh before you edit it.
- **From an example they bring** ("make it look like this reel", with a saved video or screenshots): follow `references/from-example.md`. Never ask for one.
- **Edit in plain words:** change the file, then always show them: `ENGINE sample <name>`, and ask if it's right. Keep going until they say yes.

  | They say | Change |
  |---|---|
  | bigger / smaller captions | `captions.size` +12 / -12 (starts at 64 for word groups, 88 for one word) |
  | one word at a time | `captions.mode: "word"` |
  | a few words at a time | `captions.mode: "group"`, `captions.words_per_line: 3` |
  | more / fewer words per line | `captions.words_per_line` up or down, 2 to 4 |
  | all caps / normal case | `captions.case: "upper"` / `"sentence"` |
  | switch the font, "use Montserrat" | `font.family` to one of the five, `font.file: null`. Not sure which: open the picker (step 1 of `references/style-interview.md`) |
  | use my own font | see "Their own font" in `references/style-file.md` |
  | change the colors, "a different focus color" | `captions.highlight_color` (the focus color: the word being said), `captions.color` (every other word). They gave a hex or a color name: set it. They want to see options: open the picker (step 1 of `references/style-interview.md`) |
  | make the word pop / no highlight | `captions.highlight: "pop"` / `"none"` (`"color"` is the default) |
  | outline the words / go back to the soft shadow / plain text, no shadow | `captions.treatment: "outline"` / `"shadow"` / `"none"` |
  | more / less zoom | next level up or down: `off` → `minimal` → `medium` |
  | move the captions (above my head, below my head, lower, beside my head) | `captions.position`: `above` / `below` / `low` / `beside-left`. This changes the default for every reel in this style. For one reel only, that is /reels-engine:reel ("move the captions on this reel") |

- **Set the default:** set `default_style` in `HOME/brand-kit.json` to the style's name. Keep every other key.
- **Delete:** confirm first ("Delete the stories style? This can't be undone."). Never delete their last style. If it was the default, ask which style is the new default and set it.
- **Re-render the last reel in another style:** set `style` in the newest project's `cut-list.json`, then `ENGINE finish "PROJECT"`.

## Rules
- Samples play a few seconds of their newest reel. No reel yet: `ENGINE sample` says so. Tell them the style is saved and they'll see it on their first reel, and use the picker for the font, caption look and colors.
- A sample takes about half a minute. Say so before you run it.
- There is no full-screen word moment in this version. If they ask, say so.
- The hook card's look, and whether a reel starts with it on, are remembered in the style as `hook: { preset, on }` (see `references/style-file.md`). Members normally choose them on the screen after Send in /reels-engine:reel, so only set them here when a member asks to change their default hook look.
- Style names are short, lowercase, kebab-case, and match the file name.
