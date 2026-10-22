# cut-list.json (version 2)

```json
{
  "version": 2,
  "brief": { "point": "Automations are easy to build now", "cta": "comment AUTOMATE" },
  "target_seconds": 40,
  "style": "tips",
  "face_box": { "top": 640, "bottom": 1210, "left": 360, "right": 740 },
  "caption_position": null,
  "lines": [
    {
      "id": "L3", "source": "clip-1", "in": 12.40, "out": 16.10,
      "text": "I have, um, zero time to edit reels.",
      "words": [{ "id": "c1w31", "w": "I", "s": 12.40, "e": 12.52, "conf": 0.98 }],
      "keep": true, "cut": null,
      "hook": true, "tags": ["hook"], "punch": false, "note": ""
    }
  ],
  "decisions": [
    {
      "id": "d_0001", "stage": 7, "category": "filler",
      "source": "clip-1", "line_id": "L3", "word_ids": ["c1w33"],
      "start_ms": 12800, "end_ms": 13050,
      "reason": "'um': always-filler", "confidence": 0.97,
      "status": "accepted", "auto": true, "created_by": "tool", "flags": []
    }
  ],
  "take_groups": [{ "id": "g1", "line_ids": ["L1", "L3"], "selected": "L3" }],
  "protected_pauses": [{ "after_word_id": "c1w40" }],
  "locked": false
}
```

## Two ways to remove something
- **A whole line:** `keep: false` plus `cut: { "category": "retake" | "content", "auto": false, "reason": "..." }`. Restore with `keep: true, cut: null`.
- **Words inside a line:** a `decisions[]` entry listing the `word_ids`. `status` is `proposed`, `accepted` or `rejected`. Only `accepted` removes audio. Rejecting restores it exactly.
- **One decision covers words from one line only.** A cut that spans lines is one decision per line, all with the same reason. After trimming a line, drop or shorten any decision that pointed at the words you removed.

Categories: `retake`, `content`, `filler`, `repeat`, `false-start`, `self-correction`, `breath`, `noise`, `gap`, `dropped-speech` (prep's Missing captions items: stage 2, all of the line's words, flag `dropped-speech` so Accept all skips them; accept cuts the line, reject keeps it; on a line that is already cut it blocks nothing).

When **you** add a decision: next free `d_NNNN` id, the right `stage` (6 content, 7 disfluency), `start_ms`/`end_ms` from the first word's `s` and last word's `e` (×1000), `"status": "proposed"`, `"auto": false`, `"created_by": "tool"`, `"flags": []`, a plain-English `reason`, and a `confidence` between 0 and 1.

## Rules
- Array order = playback order. The first kept line is the hook.
- Times are seconds within that clip. Never change `source`, and never change a word's `s`/`e`.
- **Fixing a misheard word:** change `w` and the line's `text`. Nothing else.
- **Trim a line:** move `in` to a word's `s` or `out` to a word's `e`, and drop the words outside from `words` and `text`.
- **Merge two lines** (same `source`, consecutive): keep the first's `id` and `in`, take the second's `out`, join `words` and `text`, delete the second, and fix any `decisions[].line_id`, `take_groups` and `hook_options[].from` that pointed at it.
- **Split a line:** two lines with new unique ids (`L7a`, `L7b`), each with its own `in`/`out` and `words`; move each decision to the half that holds its words, and point any `hook_options[].from` at the half (or both halves) its words came from.
- After changing lines, run `ENGINE detect "PROJECT"` (keeps everything already decided).
- `face_box`: `{top, bottom, left, right}` in pixels on 1080x1920. `left` and `right` are the edges of the face (cheek to cheek, not the hair); they are needed for the beside-head spot.
- `caption_position`: `null` (use the style's spot) or `above`, `below`, `low`, `beside-left`. The member sets it on the placement screen after Send.
- `hook_options`: up to three hook card lines you propose, `[{ "text", "from": [line ids] }]`. Optional.
- `hook_card`: `null` (not decided), `{ "enabled": false }`, or `{ "enabled": true, "text", "preset", "offset_y" }`. `offset_y` is optional: an integer in px on the 1080x1920 frame from the look's planned position, positive is down, absent means 0, never `null`; it is clamped to the look's drag range, and `split-face` and `framed-thin` ignore it. `text` is 90 characters at most. No look is refused for a long line or a head over the type (the render warns); only an empty line, a reel too short for any hook, or a behind look when the cutout tool can't run are refused. A hook renders only when `enabled` is true. This is separate from a line's `hook` flag and `hook` tag, which mark the spoken opening line.
- `punch: true`: the pause before this line targets 400 ms.
- Pause lengths come from `edit-config.json`, never from the style or the cut list.
- Validate with `ENGINE build "PROJECT"`. `ENGINE finish` refuses while any decision is still `proposed`.
