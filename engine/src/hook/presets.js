import { cleanText } from "./lines.js";

// The hook looks. layer: over the video, or behind the person. zone: where on the frame (see hook/layout.js).
// lines: fewest and most lines the look can hold. max / min: type size in px on the 1080-wide frame; below min the line is "too long".
// good: a size that is big enough to stop adding lines. typed: letters appear one at a time.
// drag: false = the look fills the free space top to bottom (it frames the face), so the member cannot move it up or down.
// font: { family, weight, advance } the look draws in, a bundled font (advance = average letter width, em). caption-match has none: it uses the member's caption font.
export const PRESETS = {
  "caption-match": { label: "Caption match", layer: "over", zone: "lower", lines: [1, 3], max: 104, min: 64, good: 90, typed: false },
  "label-lines": { label: "Label lines", layer: "over", zone: "lower", lines: [1, 3], max: 82, min: 56, good: 64, typed: false, font: { family: "Poppins", weight: 700, advance: 0.62 } },
  "big-stack": { label: "Big stack", layer: "over", zone: "lower", lines: [2, 4], max: 132, min: 84, good: 84, typed: false, upper: true, font: { family: "Poppins", weight: 700, advance: 0.62 } },
  typewriter: { label: "Typewriter", layer: "over", zone: "face", lines: [1, 4], max: 146, min: 96, good: 130, typed: true, font: { family: "Poppins", weight: 700, advance: 0.62 } },
  "behind-head": { label: "Behind head", layer: "behind", zone: "top", lines: [2, 3], max: 176, min: 120, good: 150, typed: true, font: { family: "Poppins", weight: 700, advance: 0.62 } },
  "big-type-behind": { label: "Big type behind head", layer: "behind", zone: "top", lines: [1, 3], max: 176, min: 120, good: 130, typed: true, font: { family: "Poppins", weight: 700, advance: 0.62 } },
  // 2026-10-20 looks, from Sam's reference reels: docs/superpowers/specs/2026-10-20-reels-hook-looks-v2-design.md
  "poster-stack": { label: "Poster stack", layer: "over", zone: "lower", lines: [1, 5], max: 200, min: 110, good: 150, typed: true, font: { family: "Poppins", weight: 700, advance: 0.62 } },
  "split-face": { label: "Split around face", layer: "over", zone: "split", lines: [2, 6], max: 140, min: 80, good: 90, typed: false, drag: false, font: { family: "Poppins", weight: 700, advance: 0.62 } },
  "highlight-words": { label: "Highlight words", layer: "over", zone: "face", lines: [1, 4], max: 104, min: 64, good: 88, typed: false, font: { family: "Poppins", weight: 700, advance: 0.62 } },
  "size-mix": { label: "Small and big", layer: "over", zone: "lower", lines: [2, 3], max: 190, min: 96, good: 150, typed: false, font: { family: "Poppins", weight: 700, advance: 0.62 } },
  "framed-thin": { label: "Thin frame", layer: "over", zone: "frame", lines: [2, 2], max: 170, min: 90, good: 170, typed: false, drag: false, font: { family: "Montserrat", weight: 300, advance: 0.6 } },
};
export const PRESET_IDS = Object.keys(PRESETS);
// The longest hook line, counted after cleanText (a line break is one character), the same as the page's textarea.
export const MAX_HOOK_CHARS = 90;

// cut-list.hook_card: null (nobody decided), { enabled: false }, or { enabled: true, text, preset, offset_y? }.
// offset_y: whole px on the 1080x1920 frame from the look's own spot, positive is down. Absent means 0. planHook clamps it.
export function validateHookCard(c) {
  if (c == null) return [];
  if (typeof c !== "object" || typeof c.enabled !== "boolean") return ["hook_card must be null, { enabled: false }, or { enabled: true, text, preset }"];
  if (!c.enabled) return [];
  const e = [];
  if (typeof c.text !== "string" || !c.text.trim()) e.push("hook_card.text is missing");
  else if (cleanText(c.text).length > MAX_HOOK_CHARS) e.push(`hook_card.text must be ${MAX_HOOK_CHARS} characters or fewer`);
  if (!PRESET_IDS.includes(c.preset)) e.push(`hook_card.preset must be one of ${PRESET_IDS.join(", ")}`);
  if (c.offset_y !== undefined && !Number.isInteger(c.offset_y)) e.push("hook_card.offset_y must be a whole number of pixels");
  return e;
}
