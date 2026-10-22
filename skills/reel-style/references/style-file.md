# Style file

`HOME/styles/<name>.json`. The file name and `name` match.

```json
{
  "name": "tips",
  "version": 2,
  "font": { "family": "Poppins", "file": null },
  "captions": {
    "mode": "group",
    "words_per_line": 3,
    "case": "sentence",
    "highlight": "color",
    "treatment": "shadow",
    "position": "above",
    "color": "#FFFFFF",
    "highlight_color": "#F2C14E"
  },
  "zoom": "off"
}
```

| Field | Values | Notes |
|---|---|---|
| `font.family` | Poppins, Montserrat, Courier Prime, Fredoka, Pacifico | Or their own font's name when `font.file` is set |
| `font.file` | `null`, or a file name in `HOME/brand/fonts/` | Only for their own font |
| `captions.mode` | `word` (one word at a time) or `group` (a few words, the current one highlighted) | |
| `captions.words_per_line` | 2, 3, or 4 | Only for `group`. Leave it out for `word` |
| `captions.case` | `upper` or `sentence` | |
| `captions.highlight` | `color`, `pop`, or `none` | How the word being said stands out |
| `captions.treatment` | `shadow`, `outline`, or `none` | What lifts the words off the video: a soft dark glow, a solid dark edge round each letter, or nothing (plain text) |
| `captions.position` | `above`, `below`, `low`, `beside-left` | Where captions sit. Above head is the default. Beside head shows one word at a time and needs open space next to the face; on a clip without room it falls back to above head |
| `captions.color` | hex | The caption text |
| `captions.highlight_color` | hex | The focus color: the word being said |
| `zoom` | `off`, `minimal`, or `medium` | minimal: a slight push-in on every 3rd cut. medium: a clearer one on every 2nd cut |

Optional, only when they ask: `captions.size` (px on a 1080-wide frame; default 64 for groups, 88 for one word).

Leave a color out and it comes from `colors.text` / `colors.accent` in `HOME/brand-kit.json`.

The engine checks the file every time it loads it. If `ENGINE sample <name>` reports the style is invalid, fix what it names.

## hook

`"hook": { "preset": "label-lines", "on": true }`. The hook card look this member last used and whether their next reel opens with the hook switched on. The review page writes it; leave it alone unless they ask to change their default hook look. Looks: `caption-match`, `label-lines`, `big-stack`, `typewriter`, `behind-head`, `big-type-behind`, `poster-stack`, `split-face`, `highlight-words`, `size-mix`, `framed-thin`. The card's drag position (`hook_card.offset_y` in the cut list) is not remembered here. Fonts: each look uses its own (Poppins Bold for most, Montserrat Light for `framed-thin`); only `caption-match` uses the member's caption font (`font` above, their own uploaded font included). An old `hook_card` key in a style file is ignored.

## The five fonts

| # | Font | Like Instagram's | Feel |
|---|---|---|---|
| 1 | Poppins | Classic | Clean, friendly. The default |
| 2 | Montserrat | Strong | Heavy, bold |
| 3 | Courier Prime | Typewriter / Editor | Retro, typed |
| 4 | Fredoka | Bubble | Rounded, playful |
| 5 | Pacifico | Signature / Neon | Script, bold enough to read in motion |

These are free stand-ins. Instagram's own fonts can't be used outside Instagram, so never say a font "is" the Instagram one.

Pacifico is a script font: it reads best with word groups and at a larger size. If they pick it, suggest `captions.size` 76 or more and show a sample.

## Their own font

The member gives a `.ttf`, `.otf`, or `.woff2` file.
1. Copy it to `HOME/brand/fonts/` (keep the file name).
2. Set `"font": { "family": "<the font's name>", "file": "<file name>" }`.
3. `ENGINE sample <name>` and check the captions are in their font.
