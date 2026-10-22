# Style interview

Used by /reels-engine:reel-setup and /reels-engine:reel-style. One question at a time. Plain words. Wait for each answer.

Do not ask for an example reel here. The picker page is how a style gets set. (If they bring an example on their own in /reels-engine:reel-style, that skill handles it.)

Before you start, read `style-file.md` (same folder) for the file shape.

1. **The look, on one page.** Start `ENGINE fonts` with Bash `run_in_background: true`. It prints `PICK_URL` and opens a page with one caption preview at the top and the choices below it: font (each shown in its own letters), a few words or one word at a time, text style (soft shadow, outline, or none), position (where the captions sit), the focus color (the color of the word being said), and the caption color. Every choice changes the preview right away. Tell them: "Your caption page is open. Try the options and watch the caption at the top. When it looks right, hit Use these. If you'd rather use your own font file, drop it here instead." Wait; when the process exits, read its JSON: `family` → `font.family`, `mode` → `captions.mode` (`group` also gets `words_per_line: 3`), `treatment` → `captions.treatment`, `position` → `captions.position`, `color` → `captions.color`, `highlight_color` → `captions.highlight_color`.
   - Tab closed? Give them the PICK_URL again (the page is still waiting, for 30 minutes).
   - They answer in chat instead ("Fredoka, yellow, one word at a time"), or drop a font file: stop the background process and use what they said. Ask for anything still missing, one question at a time. Own font: see "Their own font" in `style-file.md`. Colors with no answer: white text with their brand accent (`colors.accent` in `HOME/brand-kit.json`).
   - `picked: false`: nothing came through. Ask in chat: which font (Poppins, Montserrat, Courier Prime, Fredoka, Pacifico), a few words or one word at a time, soft shadow / outline / none, where the captions sit (above head, below head, low, beside head), and the two colors.
2. **Zoom.** "Zoom on the cuts? Off: none. Minimal: a slight push-in now and then. Medium: a clearer one, more often."
3. **Write the file** to `HOME/styles/<name>.json` (use `draft` until they name it; from setup, write `main` and skip step 5).
4. **Show it.** `ENGINE sample <name>`. It takes about half a minute and opens a few seconds of their newest reel in this style. "Is this right?" Adjust in plain words and re-run until they say yes.
   - No reel yet: `sample` will say so. Tell them: "You'll see it on your first reel, and we can change anything then."
5. **Name it** (not in setup, where it is always `main`). "What should we call this style?" Default `main`. Use a series name when they have one in mind ("tips", "stories"). Rename the file and its `name` to match, and delete the `draft` file and `HOME/samples/draft.mp4` if you made them.
6. **Default.** If this is their first style, or they say it should be the default, set `default_style` in `HOME/brand-kit.json` to its name (keep every other key). Tell them: "Every new reel uses this look unless you pick another."
