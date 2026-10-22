# Editing rules (the A-cut)

The source footage is never changed. The A-cut is the kept lines, in order, minus accepted removals. Every removal is a reversible record.

## The twelve stages, in order
1. **Ingest and transcribe** (engine): verbatim words with timings and confidence, speech/silence map.
2. **Proof transcript** (you): fix misheard words. Text only, never timing.
3. **Segment** (engine): utterances split at sentence punctuation or pauses of 700 ms or more.
4. **Retakes** (engine groups, you pick): repeated attempts within 60 s that are 60%+ similar or share their first 4 words.
5. **Structure** (you): hook first, tag point / payoff / CTA, mark punch lines.
6. **Content cuts** (you propose): signposting, restatements, tangents, hedges.
7. **Disfluencies** (engine + you): fillers, repeated words, false starts, self-corrections.
8. **Gaps** (engine): pauses normalized by type.
9. **Cut points** (engine): snapped to the quietest frame in silence, word tails protected, 15 ms crossfade.
10. **Visual jumps** (later version).
11. **Review and lock** (member): every proposal resolved.
12. **Render and export** (engine).

Stages 1-3 are automatic. Stages 4-10 produce proposals. Structure runs before micro edits so no time goes into cleaning a line that gets cut.

## What may auto-accept
Only two things, and only with at least 30 ms of clean silence on both sides:
- always-fillers: um, uh, er, erm, ah, hmm
- an immediately repeated function word or phrase ("the the", "I I", "to to")

Everything else is a proposal: repeated content words ("very very" may be on purpose), contextual fillers, hedges, false starts, self-corrections, content cuts. A removal without clean silence around it is flagged "harsh" and waits for the member's ear.

## Word lists
| List | Entries | What happens |
|---|---|---|
| Always-fillers | um, uh, er, erm, ah, hmm | auto-accept |
| Contextual fillers | like, so, you know, I mean, basically, actually, literally, right, okay, kind of, sort of | you propose, only when the sentence stays grammatical without it |
| Protected | "so" at the start of a sentence | never propose |
| Restart cues | let me start over, start again, one more time, let me redo that, scratch that, wait, okay again, take two | evidence of a retake; cut the cue itself |
| Self-correction markers | no, I mean, sorry, actually, or rather | "X, no, Y" → remove X and the marker |
| Signposting | today I want to talk about, in this video, let me explain, here's the thing, before we get started, let's dive in, without further ado | propose |
| Hedges | I think, I feel like, kind of, sort of, just, maybe, probably, a little bit, honestly | propose, word-level |
| CTA phrases | comment, link in bio, DM me, follow for, save this | marks the CTA line |

**"Like" test:** filler when the sentence still reads right without it ("it was, like, huge"). Content when it compares or states a preference ("looks like", "I like").

## Picking a take (no assumption that the last one wins)
| Factor | Weight | Ask |
|---|---|---|
| Completeness | 0.35 | Does it say the whole thought and land the sentence? |
| Disfluency | 0.20 | Fewest fillers, repeats, fragments |
| Economy | 0.15 | Fewest words for the same meaning |
| Energy | 0.15 | Liveliest delivery |
| Continuity | 0.10 | Matches the lines around it |
| Visual | 0.05 | No blink or jump at the edges |

## Hooks
Up to 3 candidates: lines that state the claim or outcome, contain a number or contrast, or address the viewer directly. Warn yourself when a moved line opens on "this / that / it / so" with nothing before it to point at.

## Pauses (engine, for reference)
| Pause | Target |
|---|---|
| Between sentences | 150 ms (tunable in `edit-config.json`, kept within 100-250 ms) |
| Within a sentence | over 300 ms is shortened to 120 ms |
| Before a punch line (`punch: true`) | 400 ms |
| Floor | never under 60 ms |
Pauses are never lengthened. A pause listed in `protected_pauses` is left exactly as recorded.

## Cut points (engine, for reference)
30 ms of lead before the next word, 40 ms of tail after the last (80 ms after vowel and fricative endings), snapped to the quietest frame within 50 ms inside silence, 15 ms equal-power crossfade at every cut.

The look (style) never changes the cut. Get the raw edit right first; captions and zooms come after.

## On-screen rules
- Instagram always covers the top 250 px, the bottom 384 px (below y 1536) and a strip of buttons on the right (x past 920). Captions never go there. The band from y 1250 to 1536 is clear on most phones: captions may sit there when the member picks Below head.
- Captions sit in one of four spots measured from `face_box`: above head, below head, low, or beside the head on its left.
- No "thanks for watching" outro. Flag when the last line could loop into the hook.

## Zoom
A style's zoom is `off`, `minimal` (a slight push-in on every 3rd piece), or `medium` (a clearer one on every 2nd piece). Zoom is a hard cut in framing at an edit point, never a move during a line.

Tune any threshold or list in `<Reels folder>/edit-config.json` (same keys as the engine's `defaults/edit-config.json`).
