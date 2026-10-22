import { norm } from "./common.js";

const tokens = (text) => text.split(/\s+/).map(norm).filter(Boolean);

// Normalized token similarity: longest common subsequence, scaled by the two lengths.
export function similarity(a, b) {
  const x = tokens(a), y = tokens(b);
  if (!x.length || !y.length) return 0;
  const dp = Array.from({ length: x.length + 1 }, () => Array(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return (2 * dp[x.length][y.length]) / (x.length + y.length);
}

// RTK-1, RTK-3, RTK-7 (v1: no scoring). Groups repeated attempts, keeps the fullest, cuts the rest as "retake".
export function detectRetakes(cl, cfg, offsets = {}) {
  const T = cfg.thresholds;
  const at = (l) => (offsets[l.source] || 0) / 1000 + l.in;
  const lines = cl.lines;
  const parent = lines.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (Math.abs(at(lines[j]) - at(lines[i])) > T.retake_window_s) continue;
      const a = tokens(lines[i].text), b = tokens(lines[j].text);
      const sameOpening = a.length >= T.retake_first_words && b.length >= T.retake_first_words && a.slice(0, T.retake_first_words).join(" ") === b.slice(0, T.retake_first_words).join(" ");
      const similar = Math.min(a.length, b.length) >= 3 && similarity(lines[i].text, lines[j].text) >= T.retake_similarity;
      if (sameOpening || similar) parent[find(j)] = find(i);
    }
  }
  const buckets = new Map();
  lines.forEach((l, i) => { const r = find(i); if (!buckets.has(r)) buckets.set(r, []); buckets.get(r).push(l); });
  const groups = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const id = `g${groups.length + 1}`;
    // No scoring in v1: the take with the most words is the starting pick; the editor confirms or changes it.
    const selected = members.reduce((best, l) => (tokens(l.text).length >= tokens(best.text).length ? l : best));
    for (const l of members) {
      if (l === selected) { l.keep = true; l.cut = null; }
      else { l.keep = false; l.cut = { category: "retake", auto: true, reason: `retake of ${selected.id} (take group ${id})` }; }
    }
    groups.push({ id, line_ids: members.map((l) => l.id), selected: selected.id });
  }
  return groups;
}
