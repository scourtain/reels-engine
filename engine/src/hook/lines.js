import { wordsOfLine } from "../cutlist.js";

export const cleanText = (text) => String(text ?? "").split(/\r?\n/).map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean).join("\n");
export const wordsOf = (text) => String(text ?? "").split(/\s+/).filter(Boolean);

// How wide a run of text is, in ems. The engine has no font metrics, so letters are sorted into width classes for a bold sans
// and scaled by the font's own average (fonts.js `advance`, which is 0.62 for Poppins). Errs a little wide, so type errs small.
export function emWidth(text, { advance = 0.62, upper = false } = {}) {
  let em = 0;
  for (const ch of upper ? String(text).toUpperCase() : String(text)) {
    em += /[\sijlI.,'’!:;|]/.test(ch) ? 0.3
      : ch.codePointAt(0) > 0x2000 ? 1
      : /[tfr1()\-]/.test(ch) ? 0.42
      : /[mwMW@%]/.test(ch) ? 0.95
      : /[A-Z]/.test(ch) ? 0.74
      : /[0-9]/.test(ch) ? 0.64
      : 0.62;
  }
  return em * (advance / 0.62);
}

const choose = (n, k) => { let c = 1; for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1); return c; };

// Every way to cut `words` into n runs; keeps the one whose widest line is narrowest.
// Long lines cut into many runs have too many ways to try one by one, so those take the same pick by working back from the end.
function balance(words, n, measure) {
  if (choose(words.length - 1, n - 1) > 1000) return balanceMany(words, n, measure);
  let best = null;
  const go = (start, left, acc) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(" ")], worst = Math.max(...lines.map(measure));
      if (!best || worst < best.worst - 1e-9) best = { worst, lines };
      return;
    }
    for (let end = start + 1; end <= words.length - (left - 1); end++) go(end, left - 1, [...acc, words.slice(start, end).join(" ")]);
  };
  go(0, n, []);
  return best.lines;
}

// The same pick as balance: the narrowest widest line, and among equals the one whose early lines end soonest.
function balanceMany(words, n, measure) {
  const W = words.length, segs = new Map(), opts = new Map();
  const seg = (i, j) => { const k = i * 1000 + j; if (!segs.has(k)) segs.set(k, measure(words.slice(i, j).join(" "))); return segs.get(k); };
  const opt = (i, k) => {
    if (k === 1) return seg(i, W);
    const key = i * 100 + k;
    if (!opts.has(key)) {
      let b = Infinity;
      for (let e = i + 1; e <= W - (k - 1); e++) b = Math.min(b, Math.max(seg(i, e), opt(e, k - 1)));
      opts.set(key, b);
    }
    return opts.get(key);
  };
  const lines = [], target = opt(0, n);
  let i = 0;
  for (let k = n; k > 1; k--) {
    let e = i + 1;
    while (Math.max(seg(i, e), opt(e, k - 1)) > target + 1e-9) e++;
    lines.push(words.slice(i, e).join(" "));
    i = e;
  }
  lines.push(words.slice(i).join(" "));
  return lines;
}

// Breaks text into lo..hi lines for a box `width` px wide and says what size the type can be (never over max).
// Her own line breaks are kept when their count fits the look. Otherwise it uses the fewest lines that reach `good`, else the biggest it found.
export function fitLines(text, { lines: [lo, hi], width, max, good, upper = false, advance = 0.62 }) {
  const measure = (l) => emWidth(l, { advance, upper });
  const sizeOf = (ls) => Math.min(max, Math.floor(width / Math.max(...ls.map(measure))));
  const given = cleanText(text).split("\n").filter(Boolean);
  if (given.length > 1 && given.length >= lo && given.length <= hi) return { lines: given, size: sizeOf(given) };
  const words = wordsOf(text);
  if (!words.length) return { lines: [], size: 0 };
  let best = null;
  for (let n = Math.min(lo, words.length); n <= Math.min(hi, words.length); n++) {
    const ls = balance(words, n, measure), size = sizeOf(ls);
    if (size >= good) return { lines: ls, size };
    if (!best || size > best.size) best = { lines: ls, size };
  }
  return best;
}

// Big stack: a big opening line, a big closing line, anything between set small.
export function stackLines(text) {
  const given = cleanText(text).split("\n").filter(Boolean);
  if (given.length >= 2 && given.length <= 4) return given;
  const w = wordsOf(text);
  if (w.length >= 5) return [w.slice(0, 2).join(" "), w.slice(2, -2).join(" "), w.slice(-2).join(" ")];
  if (w.length >= 2) { const half = Math.ceil(w.length / 2); return [w.slice(0, half).join(" "), w.slice(half).join(" ")]; }
  return w;
}

// When each letter appears: a steady pace, a touch longer after a space and on every third letter so it reads as typing, a beat between lines.
export function typeTimes(lines, per) {
  const times = [];
  let t = 0.06, n = 0;
  for (const line of lines) {
    for (const ch of line) {
      times.push(+t.toFixed(3));
      t += per + (ch === " " ? 0.035 : 0) + (n % 3 === 0 ? 0.012 : 0);
      n++;
    }
    t += 0.13;
  }
  return { times, done: times.at(-1) ?? 0 };
}

// How long the hook stays fully up before it clears.
export function holdSeconds(words, typedDone = 0) {
  const base = Math.min(5, Math.max(3, 1.2 + 0.3 * words));
  return +Math.min(5.5, Math.max(base, typedDone ? typedDone + 1.5 : 0)).toFixed(2);
}

// Claude's candidate lines that still stand: one drops out when every line it was drawn from is cut.
export function usableOptions(cl) {
  const alive = new Set((cl.lines || []).filter((l) => l.keep && wordsOfLine(cl, l).length).map((l) => l.id));
  return (cl.hook_options || []).filter((o) => !Array.isArray(o.from) || !o.from.length || o.from.some((id) => alive.has(id)));
}
