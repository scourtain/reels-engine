# From an example

Only when the member brings it up themselves in /reels-engine:reel-style: they have a reel whose look they like. Read it and build a draft style. Never ask for one during setup.

## Get frames
- **A video file:** `ENGINE frames "<path to the file>"`. It prints two images. Look at both.
  - `spread`: 8 frames across the whole reel. Shows framing, colors, and whether the picture pushes in and out between cuts.
  - `burst`: 8 frames a quarter second apart from the middle. Shows how the captions change.
- **Screenshots:** look at them directly. Ask for 3 or 4 if they sent one: you need to see the captions change.
- **An Instagram link:** links usually can't be downloaded. Say so plainly and ask for the saved video file (in Instagram: Share → Save, or screen-record it) or a few screenshots.

## Read the look

| Decide | How to tell |
|---|---|
| `captions.mode` | In the burst, one word on screen that changes every frame or two → `word`. Several words that stay while one changes color → `group` |
| `captions.words_per_line` | Count the words on one line (2 to 4) |
| `captions.case` | ALL CAPS → `upper`, else `sentence` |
| `captions.color` | The color of most caption words, as a hex |
| `captions.highlight_color` | The focus color: the color of the one word that differs. No word differs → `highlight: "none"` |
| `captions.treatment` | A solid dark edge all the way round each letter → `outline`. A soft dark glow → `shadow`. Plain text with neither → `none` |
| `captions.highlight` | A different color → `color`. The word also looks bigger or bouncy → `pop` |
| `captions.position` | Captions over the head → `above`. Under the chin → `below`. Over the chest → `low`. Next to the face, one word → `beside-left` (this is always on the left of the head; if the example has it on the right, say it will sit on the left) |
| `zoom` | Same framing in every spread frame → `off`. Framing a little tighter in some → `minimal`. Clearly tighter in about half → `medium` |
| `font.family` | The closest of the five in `style-file.md` |

## Say it honestly
- The font is a closest match, never the same font. Say: "The closest match I have is Montserrat." Never claim it is the exact font.
- If they have the real font file, they can use it: see "Their own font" in `style-file.md`.
- Things this version can't copy: caption boxes or backgrounds, emoji, animated stickers, sound effects, hook cards. If the example leans on one of these, tell them which part won't carry over.

Then write the draft style and show a sample (steps 3 and 4 of `style-interview.md`).
