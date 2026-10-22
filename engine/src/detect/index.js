import { detectFillers } from "./fillers.js";
import { detectRepeats } from "./repeats.js";
import { harshGuard } from "./guard.js";
import { detectRetakes } from "./retakes.js";

const key = (d) => `${d.category}:${d.line_id}:${d.word_ids.join(",")}`;

// Stages 4 and 7 (v1 slice). Safe to re-run: anything the editor decided is kept, tool proposals are recomputed.
export function runDetectors(cl, { cfg, envs, transcript }) {
  const clipInfo = Object.fromEntries(transcript.clips.map((c) => [c.id, c]));
  // Recompute only what a detector made and nobody has ruled on. The editor's own proposals, prep's dropped-speech items
  // (no detector re-creates them) and every resolved decision stay.
  const kept = (cl.decisions || []).filter((d) => !d.detector || d.category === "dropped-speech" || d.resolved_by === "user");
  const taken = new Set(kept.map(key));
  const fresh = [...detectFillers(cl, cfg), ...detectRepeats(cl, cfg)]
    .map((d) => harshGuard(d, cl, envs[d.source], clipInfo[d.source].threshold_db, cfg))
    .filter((d) => !taken.has(key(d)));
  let next = Math.max(0, ...kept.map((d) => Number(String(d.id).replace(/\D/g, "")) || 0)) + 1;
  for (const d of fresh) d.id = `d_${String(next++).padStart(4, "0")}`;
  const lineIndex = new Map(cl.lines.map((l, i) => [l.id, i]));
  cl.decisions = [...kept, ...fresh].sort((a, b) => a.stage - b.stage || lineIndex.get(a.line_id) - lineIndex.get(b.line_id) || a.start_ms - b.start_ms);
  if (!cl.take_groups?.length) {
    const offsets = Object.fromEntries(transcript.clips.map((c) => [c.id, c.offset_ms || 0]));
    cl.take_groups = detectRetakes(cl, cfg, offsets);
  }
  return cl;
}
