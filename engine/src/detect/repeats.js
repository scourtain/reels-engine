import { norm, makeDecision } from "./common.js";

const FUNCTION_WORDS = new Set("the a an i to and of in it is that we you so but or for on with this my your are was be if at as they he she".split(" "));

// DIS-3: an identical 1-3 word sequence immediately repeated. The first instance goes; the one that flows on stays.
export function detectRepeats(cl) {
  const out = [];
  for (const line of cl.lines) {
    const t = line.words.map((w) => norm(w.w));
    for (let i = 0; i < t.length; ) {
      let hit = 0;
      for (const n of [3, 2, 1]) {
        if (i + 2 * n > t.length) continue;
        let same = true;
        for (let k = 0; k < n; k++) if (!t[i + k] || t[i + k] !== t[i + n + k]) { same = false; break; }
        if (same) { hit = n; break; }
      }
      if (!hit) { i++; continue; }
      const words = line.words.slice(i, i + hit);
      const phrase = t.slice(i, i + hit).join(" ");
      const safe = t.slice(i, i + hit).every((x) => FUNCTION_WORDS.has(x)); // "very very" may be on purpose; "the the" never is
      out.push(makeDecision(line, words, { stage: 7, category: "repeat", reason: `'${phrase} ${phrase}': first instance removed`, confidence: safe ? 0.97 : 0.7, status: safe ? "accepted" : "proposed", auto: safe, detector: "repeats" }));
      i += hit;
    }
  }
  return out;
}
