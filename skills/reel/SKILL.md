---
name: reel
description: Edit 1-4 talking-head clips into a finished, styled Instagram reel. Use when someone says "new reel", "edit my reel", "/reels-engine:reel", "make a reel from these clips", adds video clips to the chat, or drops clips in their Reels inbox. Also handles follow-ups on the last reel ("tighter cuts", "different style", "move that line").
---

# Reel

You are the editor. The member is the director. The engine runs the mechanical stages; you make the judgment calls, as **proposals** the member accepts or rejects. Nothing you propose is final until they resolve it.

ENGINE = `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/reels.js"`
HOME = `$REELS_HOME` if set, otherwise `~/Movies/Reels` on a Mac and `~/Videos/Reels` on Windows. `ENGINE init-home` prints it.
In commands, always put HOME and PROJECT paths in double quotes, written out in full as the engine prints them (a `~` inside quotes does not work). On Windows they have backslashes and often spaces, which break without the quotes.

The pipeline has twelve stages in a fixed order (see `references/editing-rules.md`). Structure comes before micro edits so nobody polishes a line that gets cut.

## Before you start
1. `ENGINE doctor`. If anything fails: "A tool is missing. Run /reels-engine:reel-setup first." Never half-run.
2. **Ask for the brief** (one message, two short answers): "What's the one point of this reel, and is there a call to action (a keyword to comment, a link, a follow)?" Skip if they already said it.
3. **Get the clips and start the reel.** Two ways in:
   - **Clips added to the chat** (the usual way): they dragged 1-4 video files into this conversation, so you have their file paths. Run `ENGINE new <name> --clips "<path 1>" "<path 2>"`. Quote every path. The files are copied; their originals stay where they are and are never changed.
   - **Clips in the inbox:** no clips in the chat → `ENGINE new <name>` uses whatever is in `HOME/inbox/`.
   Both print PROJECT. No clips anywhere: "Drag 1-4 clips into this chat and say new reel." Clips play in the order they were recorded.
   If macOS asks to let Claude read the Downloads or Desktop folder, tell them to click Allow.

4. **Read the feedback log:** `ENGINE feedback`. It holds what this member asked for in past reviews: their notes, the kinds of proposals they accept and reject, and the cuts they make on their own. Let it shape this edit. If they always reject a kind of suggestion, stop making it. If they keep cutting the same thing themselves, propose it. If they keep asking for tighter pauses, say so and offer to tighten the edit rules (`gap_between_ms` in `HOME/edit-config.json`).
5. **Pick the style** (the look: font, captions, zoom). Look in `HOME/styles/`:
   - No files: say nothing. Run `prep` with no style and the starter look is used.
   - One: use it and say nothing.
   - They named one in the request ("new reel, stories"): use it.
   - More than one and none named: ask once, before `prep`: "Which style, tips or stories?" (their style names, default first). Then never ask again for this reel.
   STYLE = the name they picked, or nothing.

## Stages 1-3: ingest, transcribe, segment (automatic)
`ENGINE prep "PROJECT" [STYLE]`. About a minute per minute of footage. It makes working copies, transcribes verbatim with word timings and confidence, maps speech and silence, splits into utterances, and runs the tool detectors (always-fillers, repeated words, retake groups). Relay any `!` warnings.

Then open `PROJECT/cut-list.json` and `PROJECT/transcript.json`, and look at every image in `PROJECT/frames/`. Set `brief: { point, cta }` in the cut list.

## Stage 2: proof the transcript
- Fix misheard words (names, tools, brand words), especially the low-confidence ones the prep summary counts. **Change `w` text only, never `s`/`e`** (PRF-3). Update the line's `text` to match.
- Prep lists dropped-speech spans by line (`dropped_speech`). The engine re-transcribes each one; any it could not recover arrive on the review queue as Missing captions items. Never leave one unresolved on a kept line, and never type in words you could not hear.
- Words the member will keep using go in `HOME/vocabulary.txt` (one per line) so the next transcription hears them.
- If a sentence was split or joined wrongly, split or merge lines per `references/cut-list.md`. Then run `ENGINE detect "PROJECT"` so detectors see the fixed lines.

## Stage 4: retakes
Prep already grouped repeated attempts (`take_groups`) and picked the fullest take as a starting point. For each group, pick the best take yourself using the scoring factors in the rules (complete thought first, then fewest stumbles, fewest words, energy). **Never assume the last take wins.** To change a pick: set `selected`, set that line `keep: true, cut: null`, and the others `keep: false, cut: { category: "retake", auto: false, reason: "retake of <id> (take group <g>)" }`. Add groups the tool missed the same way.

## Stage 5: structure
- Pick the hook: a line that states the claim or outcome, has a number or contrast, or speaks to the viewer directly. Move it first (array order = playback order). Check it doesn't open on a dangling "this / that / it / so" that points at something now behind it; if it does, trim the opener or pick another.
- Tag lines: `tags` may hold `hook`, `point`, `payoff`, `cta`. Exactly one CTA line when the brief has one.
- Set `punch: true` on the payoff line (and the hook's punchline if it has one) so the pause before it gets room.
- **Always set `face_box`** from the frames, in 1080x1920 pixels, with all four sides: `{ top, bottom, left, right }` (frames are 270x480 tiles; multiply by 4). `top` is the top of the head and `bottom` is the chin. `left` and `right` are the edges of the face itself, cheek to cheek, not the hair: a beside-head caption may sit over hair, never over the face. Captions are placed from this box, so be accurate.
- **Write up to three hook card lines** into `hook_options`: `[{ "text": "...", "from": ["L52"] }]`. A hook card is an optional line of text over the first few seconds; the member decides on the review page whether to use one.
  - Only what they say on camera and what this reel delivers. Never invent a result, a number or a promise.
  - 3 to 9 words. Their words where you can.
  - Three different angles: what the viewer gets, the opinion, the opener.
  - `from` lists the line ids the idea comes from. If those lines get cut, the idea drops off the page.
  - Put a line break (`\n`) where it reads best, about two to four words a line. In the behind-the-head look (`behind-head`) the first line is the one that goes big and the rest join into a small line above it, so lead with the strongest words.

## Stage 6: content cuts (always proposals)
Suggest, don't decide: signposting ("in this video", "here's the thing"), restatements of a kept line, tangents away from the brief, and hedges ("I think", "kind of", "just"). Every suggestion is a decision with `"status": "proposed"`, `"category": "content"`, `"stage": 6`: list the word ids to remove. To suggest cutting a whole line, list all of that line's word ids (the line stays `keep: true`; it drops out only if the member accepts). **One decision covers words from one line only.** A cut that spans lines is one decision per line, all with the same reason. If the reel is over `target_seconds`, name the weakest lines to cut, in order.

## Stage 7: disfluencies
Prep already handled always-fillers and repeated words (auto-accepted only when there is clean silence around them; otherwise flagged). You add what needs judgment, all as `"status": "proposed"`:
- **Contextual fillers** ("like", "so", "you know", "I mean", "basically", "actually", "literally", "right", "okay", "kind of", "sort of"): only when removing it leaves the sentence grammatical. "It was, like, huge" is a filler; "looks like" and "I like" are content. Never propose "so" at the start of a sentence.
- **False starts** (`false-start`): an abandoned fragment before a restart.
- **Self-corrections** (`self-correction`): "X, no, Y" / "X, I mean Y". Remove X and the marker.

Decision shape: see `references/cut-list.md`. One decision per line here too: a trail-off that runs across three lines is three decisions. After adding decisions, run `ENGINE build "PROJECT"` to validate. `build`, `review` and `finish` split a decision that spans lines and drop words a trim removed (each printed as `! repaired ...`), and stop on anything else wrong; fix what they list before going on.

Stages 8-10 (pauses, cut points, crossfades) are computed by the engine from what's kept.

## Summary, then stage 11: review and lock
Give a short summary: raw → A-cut length, the hook, how many proposals are waiting and what kinds, and any whole-line cuts you'd suggest, and your first hook card idea in quotes ("Hook card idea: '...'. You can pick or change it after you send the cut.").

Start `ENGINE review "PROJECT"` with Bash `run_in_background: true`. It prints `REVIEW_URL` and opens the page. Tell the member: "Your review page is open. Work through the queue at the top (A cuts it, R keeps it, P plays it in context), click any word to cut or restore it, drag lines to reorder, then Send to Claude." Send stays locked until every proposal is resolved. The page saves the member's choices into the reel's folder (`review-draft.json`) as they make them. If Send is refused or the review has to restart, fix the cut list and start `review` again: it picks those choices back up, so the member never redoes the queue. After Send, the page walks them through two screens. First the caption screen: they tap a spot (Above head, Below head, Low, or Beside head) and the look of the captions (font, a few words or one, text style, the two colors), shown live on their own frame; a change to the look is saved to the style this reel uses, so their next reels get it too. The button there says "Next: hook card". Second, the hook screen. "No hook card" is the first tile and a one-tap skip ("No hook card, render"). Otherwise they see the lines you wrote, a box for their own line (90 characters at most), and eleven looks, each a short moving picture of that look on a clip. Every look can be picked: the only refusals are an empty line, a reel too short for any hook, and a behind-the-head look when the cutout tool can't run. Warnings show instead of refusals ("Small on a phone at this length. A shorter line reads bigger.", "This look is made for two parts. With one word it shows as one.", "Your head covers part of this line."). They can drag the card up or down on their own frame; that is saved as `hook_card.offset_y` (integer px, absent means 0, positive is down; split-face and framed-thin stay put). The position is not remembered in the style. "Back" returns to the caption screen. If someone asks you to "move it up a bit", use about -60 for `offset_y`. The screen opens on what is already saved on this reel's cut list if there is a choice there; otherwise it follows what their style remembers (on or off, and the look); with nothing remembered it opens off. The review command's output includes `hook_card` (with `offset_y` when they dragged) so you know what they chose; do not ask about it again. Their after-Send choices are kept in `placement-draft.json` and the cut review's in `review-draft.json`, so a reopened tab lands where they were. There is also a link, "I want to chat about more edits first": it saves the same choices but means do not render yet. The process exits after either one; its JSON has `next` (`render` or `chat`), `caption_position`, and `style_changed: true` when they changed the look (mention it in one line: "Your tips style has the new look"). Wait; when the process exits, read its JSON summary.
- `next: "chat"`: do **not** run `finish`. Say "Your cut and caption choices are saved. What would you like to change?" Make the changes they ask for (cut list edits here; look changes through /reels-engine:reel-style). When they are happy, ask whether to render now or open the review page once more, and do that.
- Tab closed? Give them the REVIEW_URL again (the helper is still waiting, and it reopens where they left off: the cut, the caption screen, or the hook screen).
- Feedback typed in chat instead? Stop the background process and apply it to `cut-list.json` yourself, resolving every proposal (accepted or rejected) as they asked. If they also say where captions should go, set `caption_position` in the cut list (`above`, `below`, `low`, `beside-left`); otherwise leave it `null` so the style's spot is used. If they also ask for a hook card, set `hook_card` (see Follow-ups).
- Act on every `note`, then clear it from the cut list (it is already saved in the feedback log, so nothing is lost).
- Anything they tell you in chat about the edit ("too much space there", "I never want that word cut") also goes in the log: `ENGINE note "PROJECT" "<what they said>"`.

## Stage 12: render and export
`ENGINE finish "PROJECT"` (refuses if anything is unresolved). Roughly 2-3x the reel length; a behind-the-head hook look adds a minute or two more.
- `buildWarnings`: relay, fix if it was your mistake, re-run. Hook warnings (small type, one part, head covers) are the member's informed choice from the hook screen: relay them, do not "fix" them.
- `ok:false`: fix what you can and re-run, max 2 times, then report what's still off.
- A warning that captions sit low: mention it once, in one line ("Your captions sit low; a long post caption can cover them on some phones"), and do not re-render unless they ask.
- A `buildWarnings` line starting `Hook card left off:` means the reel rendered without its hook. Say why in one line, using the reason given, and offer another look. Never swap one in yourself.
- A `buildWarnings` line starting `Your head covers part of line` is a heads-up, not a problem: mention it once.
- Render failed: retry once, then give the plain-English reason and the log path.
Pull 3-4 frames (`ffmpeg -ss <t> -i "PROJECT/final.mp4" -frames:v 1 <png>`) at the hook and two captions, and also one at 1.5 s when the reel has a hook, and look: captions in the spot they picked and off the face, nothing cut off, fonts loaded, the hook inside the frame and not clipped, and for the two behind-the-head looks the person in front of the type.

## Deliver
- Write `PROJECT/post-caption.txt`: first line = hook, 2-4 short lines, the CTA from the brief, 3-5 hashtags. Their words.
- `finish` opens `final.mp4` for them. Tell them it is open, where it is saved, and its length, then ask: "Post as-is, tweak something, or want the extras?" Only offer another style if they have more than one.
- Extras on request:
  - **Edits clip pack:** `ENGINE pack "PROJECT"` → `segments/`. "AirDrop the folder to your phone (on Windows: copy the folder to your phone the way you usually move files, for example a cable or your cloud drive), select the clips in order in Edits, tap Captions, add audio."
  - **Editor handoff:** `ENGINE export "PROJECT"` → `exports/` (FCPXML for Final Cut/Resolve/Premiere, A-cut JSON, transcript TXT + SRT, report, markers). Add `preview` for a clean A-cut MP4 cut from the original footage with nothing added.

## Follow-ups on the last reel
Use the newest folder in `HOME/projects/`. Look change: that is /reels-engine:reel-style (switch this reel to another of their styles, or change a style). The review page is for the cut, plus the caption screen and the hook card screen after Send. Content change: edit the cut list, then `finish`. Move the captions ("put them below my head", "beside my head"): set `caption_position` in the cut list, then `finish`. If `finish` lists a `buildWarnings` line saying there was not enough room beside the head, the captions went above the head instead: say so and offer another spot. Never re-run prep unless the clips changed.

Hook card ("add a hook card", "change the hook to ...", "use the sticker one", "no hook"): set `hook_card` in the cut list, then `finish`.
- On: `{ "enabled": true, "text": "<their line, \n for line breaks>", "preset": "<look>", "offset_y": -60 }` (`offset_y` optional; "move it up a bit" is about -60, down is positive; the engine clamps it so the card stays on screen; split-face and framed-thin ignore it). Off: `{ "enabled": false }`.
- Looks: `caption-match` (their caption type, bigger), `label-lines` (stickers), `big-stack` (bold uppercase stack), `typewriter` (types across the face), `behind-head` (one big line behind their head), `big-type-behind` (every line big, behind their head), `poster-stack` (one big cream word to a line, typed in, calm), `split-face` (two lowercase groups at opposite corners around the face), `highlight-words` (each word in its own accent-color box over the face), `size-mix` (a small lead-in over a big line), `framed-thin` (thin type: a top line and a big bracketed bottom line, in Montserrat Light).
- If they did not name a look, use the one in their style (`hook.preset`); if there is none, ask which look, by plain name.
- If they did not give a line, offer the `hook_options` you wrote and let them choose.
- A blank line with the card on is refused, so always give it text. The line is 90 characters at most. No look is refused for a long line or because the head covers it; the render warns instead. Fonts: each look has its own (Poppins Bold; Montserrat Light for framed-thin); `caption-match` uses their caption font.

## Never
- Never auto-accept a content cut, a contextual filler, a false start, or a self-correction. Those are the member's calls.
- Never add music. Never invent spoken words.
- Never edit files in `source/`.
