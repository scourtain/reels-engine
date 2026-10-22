import { norm, makeDecision } from "./common.js";

// DIS-1: always-fillers are removed by default. Contextual fillers ("like", "so") need a language model, so code never proposes them.
export function detectFillers(cl, cfg) {
  const always = new Set(cfg.lists.always_fillers);
  const out = [];
  for (const line of cl.lines) {
    for (const w of line.words) {
      const token = norm(w.w);
      if (always.has(token)) out.push(makeDecision(line, [w], { stage: 7, category: "filler", reason: `'${token}': always-filler`, confidence: 0.97, status: "accepted", auto: true, detector: "fillers" }));
    }
  }
  return out;
}
