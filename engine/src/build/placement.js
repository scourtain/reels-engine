// Where captions sit on the 1080x1920 frame. The render, the placement screen and the check all use this, so they cannot disagree.
// Instagram always covers the top (y < top), the bottom (y >= always) and a strip of buttons on the right (x > right).
// The band from `sometimes` to `always` is clear on most phones (a long post caption grows into it): a member may put captions there.
// left is the edge margin. Centered captions use textLeft..right so they center on the frame.
export const ZONES = { top: 250, sometimes: 1250, always: 1536, left: 60, right: 920, textLeft: 160 };
export const SPOTS = ["above", "below", "low", "beside-left"];
export const SPOT_LABELS = { above: "Above head", below: "Below head", low: "Low", "beside-left": "Beside head" };
const GAP = 40, SIDE_GAP = 24, MIN_STRIP = 200, MIN_SIZE = 40;
const NO_ROOM = "Not enough room beside your head in this clip.";

// Old styles say "lower" or "center". Anything that isn't one of the spots means above head.
export const spotOf = (position) => (SPOTS.includes(position) ? position : "above");
export const isBeside = (spot) => spot === "beside-left";

// faceBox: { top, bottom, left?, right? } or null. size: caption px. mode: "word" | "group".
// Returns the box for `spot`, or, when a beside-head spot has no room, the above-head box with available: false.
export function placeCaption({ position, faceBox, size, mode }) {
  const spot = spotOf(position), beside = isBeside(spot);
  const height = Math.round(size * 1.25 * (beside || mode === "word" ? 1 : 2));
  const clamp = (want) => Math.round(Math.max(ZONES.top, Math.min(want, ZONES.always - height)));
  if (beside) {
    const sides = faceBox && faceBox.left != null && faceBox.right != null;
    const want = sides ? (faceBox.top + faceBox.bottom) / 2 - height / 2 : 0, top = clamp(want);
    // The strip to the left of the head. (The right side is left alone: Instagram's buttons live there.)
    const left = ZONES.left, width = sides ? faceBox.left - SIDE_GAP - ZONES.left : 0;
    if (width < MIN_STRIP) return { ...placeCaption({ position: "above", faceBox, size, mode }), spot, available: false, reason: NO_ROOM };
    return { spot, used: spot, available: true, reason: null, nudged: top !== Math.round(want), oneWord: true, top, height, left, width: Math.round(width) };
  }
  const want = spot === "above" ? (faceBox ? faceBox.top - GAP - height : 420)
    : spot === "below" ? (faceBox ? faceBox.bottom + GAP : ZONES.sometimes)
    : ZONES.sometimes - height;
  const top = clamp(want);
  return { spot, used: spot, available: true, reason: null, nudged: top !== Math.round(want), oneWord: false, top, height, left: ZONES.textLeft, width: ZONES.right - ZONES.textLeft };
}

// The size a word is set in beside the head: the style's size when it fits the strip, smaller when it doesn't, never under 40 px.
// advance: average letter width as a fraction of the font size. Capitals run wider.
export function fitSize(text, { width, size, advance = 0.62, upper = false }) {
  const letters = String(text).length;
  if (!letters) return size;
  return Math.min(size, Math.max(MIN_SIZE, Math.floor(width / (letters * advance * (upper ? 1.12 : 1)))));
}
