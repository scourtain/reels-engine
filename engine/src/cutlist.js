import fs from "node:fs/promises";
import { SPOTS } from "./build/placement.js";
import { validateHookCard } from "./hook/presets.js";

const r3 = (x) => Math.round(x * 1000) / 1000;

export const CATEGORIES = ["retake", "content", "filler", "repeat", "false-start", "self-correction", "breath", "noise", "gap", "dropped-speech"];
export const STATUSES = ["proposed", "accepted", "rejected"];
const DEFAULT_T = { utterance_break_ms: 700, utterance_max_words: 30 };

// Stage 3 (SEG-1, SEG-2): utterances split at sentence punctuation or pauses at or above the break threshold.
export function draftCutList(transcript, { targetSeconds = 40, style = "starter", thresholds = DEFAULT_T } = {}) {
  const lines = [];
  for (const clip of transcript.clips) {
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      lines.push({ id: `L${lines.length + 1}`, source: clip.id, in: cur[0].s, out: cur.at(-1).e,
        text: cur.map((w) => w.w).join(" "), words: cur, keep: true, cut: null, hook: false, tags: [], punch: false, note: "" });
      cur = [];
    };
    clip.words.forEach((w, i) => {
      const prev = clip.words[i - 1];
      if (prev && (w.s - prev.e) * 1000 >= thresholds.utterance_break_ms) flush();
      cur.push(w);
      if (/[.?!]["')\]]?$/.test(w.w) || cur.length >= thresholds.utterance_max_words) flush();
    });
    flush();
  }
  if (lines[0]) lines[0].hook = true;
  return { version: 2, brief: { point: "", cta: "" }, target_seconds: targetSeconds, style, face_box: null, caption_position: null,
    hook_options: [], hook_card: null,
    lines, decisions: [], take_groups: [], protected_pauses: [], locked: false };
}

export function validateCutList(cl) {
  const errs = [];
  if (!cl || !Array.isArray(cl.lines)) return ["lines must be an array"];
  const ids = new Set();
  const wordsByLine = new Map();
  for (const l of cl.lines) {
    if (!l.id || ids.has(l.id)) errs.push(`line id missing or duplicate: ${l.id}`);
    ids.add(l.id);
    if (typeof l.in !== "number" || typeof l.out !== "number" || !(l.out > l.in)) errs.push(`${l.id}: out must be after in`);
    if (!Array.isArray(l.words) || l.words.length === 0) errs.push(`${l.id}: words missing`);
    if (typeof l.keep !== "boolean") errs.push(`${l.id}: keep must be true or false`);
    wordsByLine.set(l.id, new Set((l.words || []).map((w) => w.id)));
  }
  if (!cl.lines.some((l) => l.keep)) errs.push("need at least one kept line");
  if (cl.face_box && !(cl.face_box.bottom > cl.face_box.top)) errs.push("face_box bottom must be below top");
  if (cl.face_box && cl.face_box.left != null && cl.face_box.right != null && !(cl.face_box.right > cl.face_box.left)) errs.push("face_box right must be right of left");
  if (cl.caption_position != null && !SPOTS.includes(cl.caption_position)) errs.push("caption_position must be above, below, low, or beside-left");
  if (cl.hook_options != null) {
    if (!Array.isArray(cl.hook_options) || cl.hook_options.length > 3) errs.push("hook_options must be a list of up to 3 lines");
    else for (const o of cl.hook_options) {
      if (typeof o?.text !== "string" || !o.text.trim()) errs.push("each hook option needs text");
      if (o?.from != null && !Array.isArray(o.from)) errs.push("hook option from must be a list of line ids");
      else for (const id of o?.from || []) if (!ids.has(id)) errs.push(`hook option points at unknown line ${id}`);
    }
  }
  errs.push(...validateHookCard(cl.hook_card));
  for (const d of cl.decisions || []) {
    if (!STATUSES.includes(d.status)) errs.push(`${d.id}: status must be proposed, accepted or rejected`);
    if (!CATEGORIES.includes(d.category)) errs.push(`${d.id}: unknown category ${d.category}`);
    const have = wordsByLine.get(d.line_id);
    if (!have) errs.push(`${d.id}: unknown line ${d.line_id}`);
    else for (const w of d.word_ids || []) if (!have.has(w)) errs.push(`${d.id}: word ${w} is not in ${d.line_id}`);
    if (!d.word_ids?.length) errs.push(`${d.id}: word_ids missing`);
  }
  for (const g of cl.take_groups || []) {
    for (const id of g.line_ids || []) if (!ids.has(id)) errs.push(`${g.id}: unknown line ${id}`);
    if (!(g.line_ids || []).includes(g.selected)) errs.push(`${g.id}: selected take must be one of its lines`);
  }
  return errs;
}

// Each dropped-speech span (transcript clips' dropped_speech) on the lines it touches, in cut-list order.
function droppedByLine(cl, transcript) {
  const lineOfWord = new Map(cl.lines.flatMap((l) => l.words.map((w) => [w.id, l])));
  const out = [];
  for (const clip of transcript.clips) for (const sp of clip.dropped_speech || []) {
    const lines = [...new Set(sp.word_ids.map((id) => lineOfWord.get(id)).filter(Boolean))];
    for (const line of lines) out.push({ line, sp });
  }
  return out;
}

// Speech the transcription missed and re-transcribing couldn't recover is the member's call: one proposal per line, holding all
// of the line's words, so Accept cuts the line and Reject keeps it with the captions as they are. Claude can't hear it, so it never guesses.
export function addDroppedSpeech(cl, transcript) {
  const seconds = new Map();
  for (const { line, sp } of droppedByLine(cl, transcript)) {
    if (sp.recovered) continue;
    seconds.set(line, (seconds.get(line) || 0) + Math.max(0, Math.min(sp.end, line.out) - Math.max(sp.start, line.in)));
  }
  cl.decisions ||= [];
  let next = Math.max(0, ...cl.decisions.map((d) => Number(String(d.id).replace(/\D/g, "")) || 0)) + 1;
  for (const line of cl.lines) {
    if (!seconds.has(line) || cl.decisions.some((d) => d.category === "dropped-speech" && d.line_id === line.id)) continue;
    const n = Math.max(1, Math.round(seconds.get(line)));
    cl.decisions.push({ id: `d_${String(next++).padStart(4, "0")}`, stage: 2, category: "dropped-speech", source: line.source, line_id: line.id,
      word_ids: line.words.map((w) => w.id), start_ms: Math.round(line.words[0].s * 1000), end_ms: Math.round(line.words.at(-1).e * 1000),
      reason: `Captions may be missing words here (about ${n} s of speech the transcription didn't catch). Play it, then cut the line or keep it.`,
      confidence: 0.9, status: "proposed", auto: false, created_by: "tool", flags: ["dropped-speech"] }); // flagged: never in Accept all
  }
  return cl;
}

// For prep's summary: every dropped-speech span by line, and whether the engine got the words back.
export function droppedSpeechReport(cl, transcript) {
  return droppedByLine(cl, transcript).map(({ line, sp }) => ({ line_id: line.id, start: sp.start, end: sp.end, recovered: sp.recovered, chunk: sp.chunk ?? [] }));
}

// REV-1: what still needs the editor before the A-cut can lock. A Missing captions item on a line that is cut anyway
// doesn't hold anything up (restore the line and it does again). The review page's needsReview mirrors this.
export function unresolved(cl) {
  const cutLines = new Set((cl.lines || []).filter((l) => l.keep === false).map((l) => l.id));
  return (cl.decisions || []).filter((d) => !(d.category === "dropped-speech" && cutLines.has(d.line_id)) &&
    (d.status === "proposed" || (d.status === "accepted" && d.flags?.length && d.reviewed === false)));
}

// A line's words minus anything an accepted decision removed.
export function wordsOfLine(cl, line) {
  const gone = new Set((cl.decisions || []).filter((d) => d.status === "accepted" && d.line_id === line.id).flatMap((d) => d.word_ids));
  return line.words.filter((w) => !gone.has(w.id) && w.s >= line.in - 1e-6 && w.e <= line.out + 1e-6);
}

export function timeline(pieceList) {
  let t = 0;
  return pieceList.map((p) => {
    const duration = r3(p.out - p.in);
    const item = { ...p, start: r3(t), duration, words: p.words.map((w) => ({ w: w.w, start: r3(t + Math.max(0, w.s - p.in)), end: r3(t + Math.min(duration, w.e - p.in)) })) };
    t += duration;
    return item;
  });
}

export async function loadCutList(file) { return JSON.parse(await fs.readFile(file, "utf8")); }

// One decision covers words from one line. A decision that reaches into other lines is split, one per line, with the same
// status and reason (it keeps its id on its own line). Words no longer in any line (a trimmed line) are dropped, and a
// decision left with no words goes. Returns what changed, in plain words; an empty list means nothing did.
export function repairDecisions(cl) {
  const lineOfWord = new Map((cl.lines || []).flatMap((l) => (l.words || []).map((w) => [w.id, l])));
  let next = Math.max(0, ...(cl.decisions || []).map((d) => Number(String(d.id).replace(/\D/g, "")) || 0)) + 1;
  const notes = [], out = [];
  for (const d of cl.decisions || []) {
    if (!Array.isArray(d.word_ids)) { out.push(d); continue; }
    const byLine = new Map();
    for (const id of d.word_ids) { const l = lineOfWord.get(id); if (l) byLine.set(l, [...(byLine.get(l) || []), id]); }
    const dropped = d.word_ids.length - [...byLine.values()].flat().length;
    if (!byLine.size) { notes.push(`${d.id}: removed, none of its words are in the cut list any more`); continue; }
    const parts = [...byLine].sort(([a], [b]) => (b.id === d.line_id) - (a.id === d.line_id));
    if (parts.length === 1 && !dropped && parts[0][0].id === d.line_id) { out.push(d); continue; }
    const ids = parts.map(([line, words], k) => {
      const ws = line.words.filter((w) => words.includes(w.id)), id = k ? `d_${String(next++).padStart(4, "0")}` : d.id;
      out.push({ ...structuredClone(d), id, line_id: line.id, source: line.source, word_ids: words, start_ms: Math.round(ws[0].s * 1000), end_ms: Math.round(ws.at(-1).e * 1000) });
      return `${id} (${line.id})`;
    });
    if (parts.length > 1) notes.push(`${d.id}: covered ${parts.length} lines, split into ${ids.join(", ")}`);
    else if (parts[0][0].id !== d.line_id) notes.push(`${d.id}: moved to ${parts[0][0].id}, the line that holds its words`);
    if (dropped) notes.push(`${d.id}: dropped ${dropped} word${dropped === 1 ? "" : "s"} no longer in the cut list`);
  }
  cl.decisions = out;
  return notes;
}

// Before anyone works on a cut list: repair what can be repaired (saved back, so the file is right), then refuse anything still wrong.
export async function openCutList(file) {
  const cl = await loadCutList(file), notes = repairDecisions(cl), errs = validateCutList(cl);
  if (errs.length) throw new Error(`cut-list.json has problems to fix before the member sees it:\n- ${errs.join("\n- ")}`);
  if (notes.length) await saveCutList(file, cl);
  return { cl, notes };
}

// A review left before Send (a refused Send, a closed tab, a restarted review): carry the member's choices onto the cut list as it is now.
// Lines and take groups match by id. A decision takes the member's answer from the draft decision with its id and words, or else from
// a draft decision of the same category holding all its words (one that was split since). The member's own cuts come along while
// their line still holds their words.
export function mergeDraft(cl, draft) {
  const lines = new Map((draft.lines || []).map((l) => [l.id, l]));
  for (const l of cl.lines) { const d = lines.get(l.id); if (d) Object.assign(l, { keep: d.keep, cut: d.cut ?? null, note: d.note ?? "" }); }
  const groups = new Map((draft.take_groups || []).map((g) => [g.id, g]));
  for (const g of cl.take_groups || []) { const d = groups.get(g.id); if (d && g.line_ids.includes(d.selected)) g.selected = d.selected; }
  const old = (draft.decisions || []).filter((o) => Array.isArray(o.word_ids));
  const same = (a, b) => a.word_ids.length === b.word_ids.length && a.word_ids.every((w, i) => w === b.word_ids[i]);
  cl.decisions ||= [];
  for (const d of cl.decisions) {
    const m = old.find((o) => o.id === d.id && same(o, d)) ?? old.find((o) => o.category === d.category && d.word_ids.every((w) => o.word_ids.includes(w)));
    if (m?.resolved_by !== "user") continue;
    Object.assign(d, { status: m.status, resolved_by: "user" });
    if (m.reviewed != null) d.reviewed = m.reviewed;
  }
  let next = Math.max(0, ...cl.decisions.map((d) => Number(String(d.id).replace(/\D/g, "")) || 0)) + 1;
  for (const o of old.filter((o) => o.created_by === "user")) {
    const line = cl.lines.find((l) => l.id === o.line_id);
    if (!line || !o.word_ids.every((w) => line.words.some((x) => x.id === w)) || cl.decisions.some((d) => same(d, o))) continue;
    cl.decisions.push({ ...o, id: `d_${String(next++).padStart(4, "0")}` });
  }
  return cl;
}

export async function saveCutList(file, cl) {
  const errs = validateCutList(cl);
  if (errs.length) throw new Error(`Cut list is invalid: ${errs.join("; ")}`);
  await fs.writeFile(file, JSON.stringify(cl, null, 2));
}

// When word timings are corrected after the fact, carry them into the cut list. Nothing the editor chose changes.
export function syncTimings(cl, transcript) {
  const t = new Map(transcript.clips.flatMap((c) => c.words).map((w) => [w.id, w]));
  for (const line of cl.lines) {
    for (const w of line.words) { const fresh = t.get(w.id); if (fresh) { w.s = fresh.s; w.e = fresh.e; } }
    line.in = line.words[0].s; line.out = line.words.at(-1).e;
  }
  for (const d of cl.decisions || []) {
    const ws = d.word_ids.map((id) => t.get(id)).filter(Boolean);
    if (ws.length) { d.start_ms = Math.round(Math.min(...ws.map((w) => w.s)) * 1000); d.end_ms = Math.round(Math.max(...ws.map((w) => w.e)) * 1000); }
  }
  return cl;
}
