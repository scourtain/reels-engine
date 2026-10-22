import { isSilent } from "../envelope.js";

// DIS-7: only auto-apply a removal when there is clear silence on both sides of it.
export function harshGuard(decision, cl, env, thresholdDb, cfg) {
  const line = cl.lines.find((l) => l.id === decision.line_id);
  const words = line.words.filter((w) => decision.word_ids.includes(w.id));
  const s = words[0].s, e = words.at(-1).e, c = cfg.thresholds.harsh_clearance_ms / 1000;
  const left = s - c <= 0 || isSilent(env, s - c, s, thresholdDb);
  const right = e + c >= env.length / 100 || isSilent(env, e, e + c, thresholdDb);
  if (left && right) return decision;
  return { ...decision, status: decision.status === "accepted" && decision.auto ? "proposed" : decision.status, auto: false, flags: [...new Set([...(decision.flags || []), "harsh"])], reviewed: false };
}
