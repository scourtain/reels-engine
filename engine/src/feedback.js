import fs from "node:fs/promises";
import path from "node:path";

const logFile = (home) => path.join(home, "feedback", "review-log.jsonl");

// What a review teaches the editor: the member's notes, which proposals they took or refused, and the cuts they made themselves.
export function feedbackEntry(before, after, { project, date = new Date().toISOString().slice(0, 10) } = {}) {
  const lineOf = new Map(after.lines.map((l) => [l.id, l]));
  const textOf = (d) => { const l = lineOf.get(d.line_id); return l ? l.words.filter((w) => d.word_ids.includes(w.id)).map((w) => w.w).join(" ") : ""; };
  const was = new Map((before?.decisions || []).map((d) => [d.id, d]));
  const ruledOn = (status) => (after.decisions || []).filter((d) => d.created_by !== "user" && d.status === status && was.get(d.id)?.status === "proposed")
    .map((d) => ({ category: d.category, reason: d.reason, text: textOf(d) }));
  const beforeKeep = new Map((before?.lines || []).map((l) => [l.id, l.keep]));
  return {
    date, project,
    notes: after.lines.filter((l) => l.note?.trim()).map((l) => ({ line: l.text, note: l.note.trim() })),
    accepted: ruledOn("accepted"),
    rejected: ruledOn("rejected"),
    own_cuts: [
      ...(after.decisions || []).filter((d) => d.created_by === "user" && d.status === "accepted" && !was.has(d.id)).map((d) => ({ text: textOf(d), in_line: lineOf.get(d.line_id)?.text })),
      ...after.lines.filter((l) => !l.keep && beforeKeep.get(l.id) === true).map((l) => ({ text: l.text, in_line: l.text })),
    ],
    restored_lines: after.lines.filter((l) => l.keep && beforeKeep.get(l.id) === false).map((l) => l.text),
    reordered: before ? before.lines.map((l) => l.id).join() !== after.lines.map((l) => l.id).join() : false,
    style_change: before && before.style !== after.style ? { from: before.style, to: after.style } : null,
  };
}

export async function appendFeedback(home, entry) {
  await fs.mkdir(path.dirname(logFile(home)), { recursive: true });
  await fs.appendFile(logFile(home), JSON.stringify(entry) + "\n");
}

export async function readFeedback(home, last = 30) {
  try { return (await fs.readFile(logFile(home), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)).slice(-last); }
  catch (err) { if (err.code === "ENOENT") return []; throw err; }
}
