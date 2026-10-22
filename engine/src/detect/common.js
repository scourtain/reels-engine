export const norm = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

export function makeDecision(line, words, { stage, category, reason, confidence, status = "proposed", auto = false, detector }) {
  return {
    id: null, stage, category, source: line.source, line_id: line.id, word_ids: words.map((w) => w.id),
    start_ms: Math.round(words[0].s * 1000), end_ms: Math.round(words.at(-1).e * 1000),
    reason, confidence, status, auto, created_by: "tool", detector, flags: [],
  };
}
