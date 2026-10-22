import { ZONES } from "../build/placement.js";
import { PRESETS } from "./presets.js";
import { cleanText, wordsOf, emWidth, fitLines, stackLines, typeTimes, holdSeconds } from "./lines.js";

export const SMALL = "Small on a phone at this length. A shorter line reads bigger.";
export const ONE_PART = "This look is made for two parts. With one word it shows as one.";
export const TOO_SHORT_REEL = "This reel is too short for a hook card.";
// Shown where the drag would be, for a look with drag: false (presets.js).
export const FRAMES_FACE = "This look frames your face, so it stays put.";
const CLEAR = 0.35, GAP = 24;
// A hook that ends at `end` s needs the clear time and a second of reel after it.
const tooShortFor = (duration, end) => duration < end + CLEAR + 1;
// The reel can't hold even the shortest hook: one word, not typed. The review screen's "too short" state is this, not one line's verdict.
export const reelTooShort = (duration) => tooShortFor(duration, holdSeconds(1));
// A line too long for a look's own sizes is still drawn: its type shrinks to FLOOR, and no line goes under TINY (spec: every look is always pickable).
const FLOOR = 40, TINY = 30;
// Type behind the person stops here, above Instagram's buttons (check.js holds the same line).
const BEHIND_BOTTOM = 700;
// Parts a look draws smaller than its main type on purpose. Only the main type can make a line "small on a phone".
const MINOR_ROLES = new Set(["mid", "kicker", "lead", "top"]);   // big-stack, behind-head, size-mix, framed-thin

// Where hooks may sit on the 1080x1920 frame. Lower and face follow the caption areas (placement.js ZONES).
// Top is the strip above the head, for type that sits behind the person: it is allowed above ZONES.top and out to x 1020 (see the spec).
const LOWER = { left: ZONES.textLeft, width: ZONES.right - ZONES.textLeft, bottom: ZONES.always - 20 };
const TOP = { left: ZONES.left, width: 1080 - 2 * ZONES.left, top: 84 };
// Over looks set flush left use the full width over looks may use (left edge 96, as the typewriter does).
const WIDE = { left: 96, width: ZONES.right - 96, bottom: LOWER.bottom };
const faceZone = (faceBox) => ({ left: 96, width: ZONES.right - 96, top: Math.max(ZONES.top, (faceBox?.top ?? 340) + 130) });

export const nearBoxes = (a, b, gap) => a.left < b.left + b.width + gap && b.left < a.left + a.width + gap && a.top < b.top + b.height + gap && b.top < a.top + a.height + gap;

// rows: [{ text, size, role, height, upper?, extra? }] top to bottom. Gives each row its own tight box (the width of its ink plus `extra` px of boxes around it),
// centered, left- or right-aligned.
function stack(rows, zone, { top, align = "center", gap = 0, advance }) {
  let y = top;
  const lines = rows.map((r) => {
    const width = Math.min(zone.width, Math.round(emWidth(r.text, { advance, upper: r.upper }) * r.size + (r.extra ?? 0)));
    const left = align === "left" ? zone.left : align === "right" ? zone.left + zone.width - width : Math.round(zone.left + (zone.width - width) / 2);
    const line = { text: r.text, size: r.size, role: r.role, box: { top: Math.round(y), left, width, height: r.height } };
    y += r.height + gap;
    return line;
  });
  return { lines, height: Math.round(y - gap - top) };
}

// Lowercase, the way the quiet looks set it, but a lone "I" stays a capital.
const soft = (t) => t.toLowerCase().replace(/(^|\s)i(?=$|\s|['’])/g, "$1I");
const union = (lines) => {
  const top = Math.min(...lines.map((l) => l.box.top)), left = Math.min(...lines.map((l) => l.box.left));
  return { top, left, width: Math.max(...lines.map((l) => l.box.left + l.box.width)) - left, height: Math.max(...lines.map((l) => l.box.top + l.box.height)) - top };
};
// Two runs of words: her own two lines, else the words cut at `at` (a word count).
function twoParts(text, at) {
  const given = cleanText(text).split("\n").filter(Boolean);
  if (given.length === 2) return given;
  const w = wordsOf(text);
  if (w.length < 2) return null;
  const k = Math.min(w.length - 1, Math.max(1, at(w)));
  return [w.slice(0, k).join(" "), w.slice(k).join(" ")];
}

// Each look: text → rows. advance = the font's average letter width.
// A look that is not one stack places its own lines and returns them as `placed: { lines, box }`.
// fits: false = this try breaks the look's own rules (a small line too small, parts that overlap); planHook then tries again relaxed.
// relaxed: the line did not fit the look as designed, so P allows more lines and smaller type, and the look lets its fixed parts wrap and shrink too.
// onePart: one word on a look made for two parts, drawn as its main part only.
const LOOKS = {
  "caption-match"(text, P, advance) {
    const f = fitLines(text, { lines: P.lines, width: LOWER.width, max: P.max, good: P.good, advance });
    return { zone: "lower", size: f.size, rows: f.lines.map((t) => ({ text: t, size: f.size, role: "line", height: Math.round(f.size * 1.12) })) };
  },
  "label-lines"(text, P, advance) {
    // each sticker has 30 px of padding either side, and tilts, so the type gets less than the zone
    const f = fitLines(text, { lines: P.lines, width: LOWER.width - 84, max: P.max, good: P.good, advance });
    return { zone: "lower", size: f.size, gap: 14, rows: f.lines.map((t) => ({ text: t, size: f.size, role: "line", height: Math.round(f.size * 1.1) + 34 })) };
  },
  "big-stack"(text, P, advance, faceBox, relaxed) {
    const ls = stackLines(text);
    const bigOf = (ts) => Math.min(P.max, Math.floor(LOWER.width / Math.max(...ts.map((t) => emWidth(t, { advance, upper: true })))));
    if (ls.length < 2) {
      const big = bigOf(ls);
      return { zone: "lower", size: big, onePart: true, rows: [{ text: ls[0], size: big, role: "big", height: big, upper: true }] };
    }
    const ends = [ls[0], ls.at(-1)];
    let mids = ls.slice(1, -1);
    const big = bigOf(ends);
    // the small lines are widely spaced, so they measure wider than their letters
    let mid = mids.length ? Math.min(Math.round(big * 0.41), Math.floor(LOWER.width / (1.2 * Math.max(...mids.map((t) => emWidth(t, { advance, upper: true })))))) : 0;
    if (relaxed && mids.length) {
      // the small part wraps onto as many lines as it needs
      const most = Math.max(TINY, Math.round(big * 0.41)), opts = { lines: [1, 6], width: Math.floor(LOWER.width / 1.2), max: most, good: most, upper: true, advance };
      let f = fitLines(mids.join("\n"), opts);
      if (f.size < TINY) f = fitLines(mids.join(" "), opts);
      ({ lines: mids, size: mid } = f);
    }
    const row = (t, role) => role === "mid" ? { text: t, size: mid, role, height: mid + 30, upper: true } : { text: t, size: big, role, height: big, upper: true };
    const rows = [row(ends[0], "big"), ...mids.map((t) => row(t, "mid")), row(ends[1], "accent")];
    return { zone: "lower", size: big, rows, fits: !mids.length || mid >= TINY };
  },
  typewriter(text, P, advance, faceBox) {
    const z = faceZone(faceBox);
    const f = fitLines(text, { lines: P.lines, width: z.width, max: P.max, good: P.good, advance });
    return { zone: "face", size: f.size, align: "left", rows: f.lines.map((t, i) => ({ text: t, size: f.size, role: i === f.lines.length - 1 && f.lines.length > 1 ? "accent" : "line", height: Math.round(f.size * 1.1) })) };
  },
  "behind-head"(text, P, advance, faceBox, relaxed) {
    // The first line is the giant one. Everything after it joins into the small line that sits above it.
    const given = cleanText(text).split("\n").filter(Boolean);
    let best = null;
    const tryLines = (ls) => {
      if (ls.length < 2) return;
      const size = Math.min(P.max, Math.floor(TOP.width / emWidth(ls[0], { advance })));
      if (!best || size > best.size) best = { size, giant: ls[0], kicker: ls.slice(1).join(" ") };
    };
    if (given.length >= 2) tryLines(given);
    else for (let n = 2; n <= (relaxed ? 8 : 3); n++) tryLines(fitLines(text, { lines: [n, n], width: TOP.width, max: P.max, good: Infinity, advance }).lines);
    const giant = (t, size) => ({ text: t, size, role: "giant", height: size });
    if (!best) {
      const size = Math.min(P.max, Math.floor(TOP.width / emWidth(text, { advance })));
      return { zone: "top", size, onePart: true, key: 0, rows: [giant(text, size)] };
    }
    if (relaxed) {
      // the small line wraps above the giant one
      const most = Math.min(68, P.max), f = fitLines(best.kicker, { lines: [1, 4], width: TOP.width, max: most, good: most, advance });
      const rows = f.lines.map((t) => ({ text: t, size: f.size, role: "kicker", height: Math.round(f.size * 1.2) }));
      return { zone: "top", size: best.size, fits: f.size >= TINY, key: rows.length, rows: [...rows, giant(best.giant, best.size)] };
    }
    const k = Math.min(68, Math.floor(TOP.width / emWidth(best.kicker, { advance })));
    return { zone: "top", size: best.size, fits: k >= 40, key: 1,
      rows: [{ text: best.kicker, size: k, role: "kicker", height: Math.round(k * 1.2) }, giant(best.giant, best.size)] };
  },
  "big-type-behind"(text, P, advance) {
    const f = fitLines(text, { lines: P.lines, width: TOP.width, max: P.max, good: P.good, advance });
    return { zone: "top", size: f.size, rows: f.lines.map((t) => ({ text: t, size: f.size, role: "line", height: Math.round(f.size * 1.02) })) };
  },
};

Object.assign(LOOKS, {
  "poster-stack"(text, P, advance) {
    // one word to a line, up to five; her own breaks only when they still make a poster
    const opts = { lines: [Math.min(wordsOf(text).length, 5), P.lines[1]], width: WIDE.width, max: P.max, good: P.good, upper: true, advance };
    let f = fitLines(text, opts);
    if (f.size < P.min) f = fitLines(wordsOf(text).join(" "), opts);
    return { zone: "wide", size: f.size, align: "left", rows: f.lines.map((t) => ({ text: t, size: f.size, role: "line", height: Math.round(f.size * 0.92), upper: true })) };
  },
  "split-face"(text, P, advance, faceBox, relaxed) {
    const parts = twoParts(text, (w) => Math.round(w.length * 0.4));
    // each group gets most of the width, not all of it, so the two read as opposite corners
    const groupWidth = Math.round(WIDE.width * 0.78), most = relaxed ? 6 : 3;
    if (!parts) {
      const f = fitLines(soft(text), { lines: [1, most], width: groupWidth, max: P.max, good: P.good, advance });
      const a = stack(f.lines.map((t) => ({ text: t, size: f.size, role: "a", height: Math.round(f.size * 1.02) })), WIDE, { top: ZONES.top, align: "left", advance });
      return { size: f.size, onePart: true, placed: { lines: a.lines, box: union(a.lines) } };
    }
    // a group never leaves one short word alone on a line ("3 questions / to"): fewer lines, else the cut moves a word
    const orphan = (ls) => ls.length > 1 && ls.some((l) => !l.includes(" ") && l.length <= 3);
    const fitGroup = (t) => {
      let best = null;
      for (let n = 1; n <= most; n++) {
        const f = fitLines(soft(t), { lines: [n, n], width: groupWidth, max: P.max, good: P.good, advance });
        if (!f.lines.length || orphan(f.lines)) continue;
        if (f.size >= P.good) return f;
        if (!best || f.size > best.size) best = f;
      }
      return best;
    };
    const w = wordsOf(text), given = cleanText(text).split("\n").filter(Boolean).length === 2;
    const k = parts[0].split(" ").length, cuts = given ? [parts] : [k, k - 1, k + 1].filter((c) => c >= 1 && c < w.length).map((c) => [w.slice(0, c).join(" "), w.slice(c).join(" ")]);
    let groups = null;
    for (const c of cuts) {
      const f = c.map(fitGroup);
      if (f.every(Boolean) && Math.min(...f.map((x) => x.size)) >= P.min) { groups = f; break; }
    }
    groups ??= parts.map((t) => fitLines(soft(t), { lines: [1, most], width: groupWidth, max: P.max, good: P.good, advance }));
    const size = Math.min(...groups.map((f) => f.size));
    const rows = (f, role) => f.lines.map((t) => ({ text: t, size, role, height: Math.round(size * 1.02) }));
    const a = stack(rows(groups[0], "a"), WIDE, { top: ZONES.top, align: "left", advance });
    const bRows = rows(groups[1], "b"), bHeight = bRows.reduce((h, r) => h + r.height, 0);
    const b = stack(bRows, WIDE, { top: WIDE.bottom - bHeight, align: "right", advance });
    const lines = [...a.lines, ...b.lines];
    // the two groups must not run into each other
    return { size, fits: a.height + bHeight <= WIDE.bottom - ZONES.top, placed: { lines, box: union(lines) } };
  },
  "highlight-words"(text, P, advance, faceBox, relaxed) {
    // every word is its own box: 22 px padding each side, 12 px between boxes
    const z = faceZone(faceBox), boxes = (t) => wordsOf(t).length * 44 + (wordsOf(t).length - 1) * 12;
    // the type shrinks until the widest line, boxes and all, fits the zone
    const sizeOf = (f) => Math.min(f.size, ...f.lines.map((t) => Math.floor((z.width - boxes(t)) / emWidth(t, { advance }))));
    let f = fitLines(text, { lines: P.lines, width: z.width - 4 * 56, max: P.max, good: P.good, advance });
    if (relaxed) {
      // a long line counts its boxes when it picks how many lines to use: the fewest that reach good, else the biggest
      let best = null;
      for (let n = P.lines[0]; n <= P.lines[1]; n++) {
        const g = fitLines(text, { lines: [n, n], width: z.width - 4 * 56, max: P.max, good: Infinity, advance }), s = sizeOf(g);
        if (!best || s > best.s) best = { f: g, s };
        if (s >= P.good) { best = { f: g, s }; break; }
      }
      f = best.f;
    }
    const size = sizeOf(f);
    return { zone: "face", size, gap: 12, rows: f.lines.map((t) => ({ text: t, size, role: "line", height: Math.round(size * 1.1) + 20, extra: boxes(t) })) };
  },
  "size-mix"(text, P, advance, faceBox, relaxed) {
    const given = cleanText(text).split("\n").filter(Boolean), w = wordsOf(text);
    const bigRows = (f) => f.lines.map((t) => ({ text: t, size: f.size, role: "big", height: Math.round(f.size * 0.98) }));
    const most = relaxed ? 6 : 2;
    let lead, big;
    if (given.length >= 2) { lead = given[0]; big = given.slice(1).join(" "); }
    else {
      if (w.length < 2) {
        const f = fitLines(text, { lines: [1, most], width: WIDE.width, max: P.max, good: P.good, advance });
        return { zone: "wide", size: f.size, align: "left", onePart: true, rows: bigRows(f) };
      }
      const k = w.length >= 4 && w[0].length <= 3 ? 2 : 1;
      lead = w.slice(0, k).join(" "); big = w.slice(k).join(" ");
    }
    const f = fitLines(big, { lines: [1, most], width: WIDE.width, max: P.max, good: P.good, advance });
    // the small line never goes over the big type when that has shrunk
    const small = Math.min(Math.max(relaxed ? Math.min(48, f.size) : 48, Math.round(f.size * 0.42)), Math.floor(WIDE.width / emWidth(lead, { advance })));
    return { zone: "wide", size: f.size, align: "left", fits: small >= (relaxed ? TINY : 40),
      rows: [{ text: lead, size: small, role: "lead", height: Math.round(small * 1.15) }, ...bigRows(f)] };
  },
  "framed-thin"(text, P, advance, faceBox, relaxed) {
    const parts = twoParts(text, (w) => w.length - (w.length > 2 ? 2 : 1));
    // the bracketed line sits at the bottom. Relaxed, it wraps (brackets around the whole of it) only when one line would go under 90 px
    const lowPart = (t) => {
      const low = `[${soft(t)}]`;
      const f = relaxed ? fitLines(low, { lines: [1, 3], width: WIDE.width, max: P.max, good: Math.min(P.max, 90), advance })
        : { lines: [low], size: Math.min(P.max, Math.floor(WIDE.width / emWidth(low, { advance }))) };
      const rows = f.lines.map((x) => ({ text: x, size: f.size, role: "low", height: Math.round(f.size * 1.1) })), height = rows.reduce((h, r) => h + r.height, 0);
      return { size: f.size, height, lines: stack(rows, WIDE, { top: WIDE.bottom - height, advance }).lines };
    };
    if (!parts) {
      const b = lowPart(text);
      return { size: b.size, onePart: true, placed: { lines: b.lines, box: union(b.lines) } };
    }
    const top = fitLines(soft(parts[0]), { lines: [1, relaxed ? 6 : 2], width: WIDE.width, max: Math.min(120, P.max), good: Math.min(100, P.max), advance });
    const b = lowPart(parts[1]);
    const t = stack(top.lines.map((x) => ({ text: x, size: top.size, role: "top", height: Math.round(top.size * 1.12) })), WIDE, { top: ZONES.top, advance });
    const lines = [...t.lines, ...b.lines];
    return { size: b.size, fits: top.size >= (relaxed ? TINY : 70) && t.height + b.height <= WIDE.bottom - ZONES.top, placed: { lines, box: union(lines) } };
  },
});

// card: cut-list.hook_card. faceBox: cut-list.face_box. font: the resolved caption font. captionBox: where captions sit on this reel. duration: the reel, in seconds.
export function planHook({ card, faceBox = null, font = null, captionBox = null, duration = Infinity }) {
  if (card?.enabled !== true) return { on: false };
  const preset = card.preset, P = Object.hasOwn(PRESETS, preset) ? PRESETS[preset] : null, text = cleanText(card.text), words = wordsOf(text);
  const no = (reason) => ({ on: true, available: false, reason, preset, warnings: [] });
  if (!P) return no("That hook look does not exist.");
  if (!words.length) return no("The hook line is empty.");
  // a look with its own font measures in that font; caption-match measures in the member's caption font
  const advance = P.font?.advance ?? font?.advance ?? 0.62;
  // the vertical limits the render check holds a hook to (check.js); the card may sit, and be dragged, anywhere inside them
  const limits = P.layer === "behind" ? { top: TOP.top, bottom: BEHIND_BOTTOM } : { top: ZONES.top, bottom: ZONES.always };
  const zoneOf = (look) => look.zone === "lower" ? LOWER : look.zone === "wide" ? WIDE : look.zone === "top" ? TOP : faceZone(faceBox);
  const attempt = (t, p, relaxed) => {
    const look = LOOKS[preset](t, p, advance, faceBox, relaxed);
    if (look.placed) return { look, ...look.placed };
    const zone = zoneOf(look), gap = look.gap ?? 0;
    const total = look.rows.reduce((a, r) => a + r.height, 0) + gap * (look.rows.length - 1);
    const top = zone.bottom != null ? zone.bottom - total : zone.top;
    const s = stack(look.rows, zone, { top, align: look.align, gap, advance });
    return { look, lines: s.lines, box: { top, left: zone.left, width: zone.width, height: s.height } };
  };
  // the look's own rules, the smallest size it allows, and the vertical limits the render check holds it to
  const fine = ({ look, lines, box }, p) => {
    const bottom = box.top + box.height;
    const inside = box.top >= limits.top && bottom <= limits.bottom;
    return look.fits !== false && look.size >= p.min && (look.onePart || lines.length >= p.lines[0]) && inside && lines.every((l) => l.size >= TINY);
  };

  let tried = attempt(text, P, false), relaxed = false;
  if (!fine(tried, P)) {
    // Relaxed: more lines and smaller type, shrinking until it fits. Her own line breaks go when nothing fits with them.
    relaxed = true;
    const flat = words.join(" ");
    search: for (const t of flat === text ? [text] : [text, flat]) {
      for (let max = P.max; ; max = Math.max(FLOOR, Math.floor(max * 0.92))) {
        const R = { ...P, lines: [1, 8], min: FLOOR, max, good: Math.min(P.good, max) };
        tried = attempt(t, R, true);
        if (fine(tried, R)) break search;
        if (max === FLOOR) break;
      }
    }
  }
  const { look } = tried;
  const warnings = [];
  if (relaxed && tried.lines.some((l) => !MINOR_ROLES.has(l.role) && l.size < P.min)) warnings.push(SMALL);
  if (look.onePart) warnings.push(ONE_PART);

  // the poster types fast, the way the reference does; the others at the first looks' pace
  const type = P.typed ? typeTimes(tried.lines.map((l) => l.text), preset === "poster-stack" ? 0.03 : look.zone === "top" ? 0.036 : 0.042) : null;
  const end = holdSeconds(words.length, type?.done ?? 0);
  if (tooShortFor(duration, end)) return no(TOO_SHORT_REEL);

  // Dragging: px the card can move from its planned spot, then her offset_y clamped to that and applied to the whole card.
  const drag = P.drag === false ? null : { up: Math.max(0, tried.box.top - limits.top), down: Math.max(0, limits.bottom - (tried.box.top + tried.box.height)) };
  const want = Number.isInteger(card.offset_y) ? card.offset_y : 0;
  const offsetY = drag ? Math.min(drag.down, Math.max(-drag.up, want)) || 0 : 0;
  const moved = (b) => ({ ...b, top: b.top + offsetY });
  const box = moved(tried.box), lines = tried.lines.map((l) => ({ ...l, box: moved(l.box) }));

  return { on: true, available: true, reason: null, warnings, preset, layer: P.layer, typed: P.typed, text, lines, box, drag, offsetY, keyLine: look.key ?? 0, type, end, clear: CLEAR, font: P.font ?? null,
    captionsWait: !!captionBox && nearBoxes(box, captionBox, GAP), zoomWait: P.layer === "behind", dim: preset === "typewriter" };
}
