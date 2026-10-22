import fs from "node:fs/promises";
import path from "node:path";
import { projectPaths, reelsHome } from "./paths.js";
import { transcribeFile, droppedSpeechSpans, chunkPlan } from "./asr.js";
import { loadConfig } from "./config.js";
import { computeEnvelope, silenceThreshold, silencesFromEnvelope } from "./envelope.js";

const PAUSE_INSIDE_WORD = 0.15; // shorter dips are stop consonants ("t", "p"), not pauses
const r3 = (x) => +x.toFixed(3);

// Whisper is good at when a word ends and vague about when it starts, so word edges drift into pauses
// and a long pause can end up "inside" the next word. Pull every word back to where its sound is.
export function refineWords(words, silences) {
  const out = [];
  for (const word of words) {
    let ns = word.s, ne = word.e;
    for (const sil of silences) {
      if (sil.start <= ns && sil.end > ns && sil.end < ne) ns = sil.end;      // silence covers the head
      if (sil.start > ns && sil.start < ne && sil.end >= ne) ne = sil.start;  // silence covers the tail
    }
    const inside = silences.filter((sil) => sil.start > ns && sil.end < ne && sil.end - sil.start >= PAUSE_INSIDE_WORD);
    if (inside.length) {
      const prev = out.at(-1);
      // sound before the pause is the previous word's tail, as long as the two were touching
      if (prev && Math.abs(prev.e - ns) < 0.02 && inside[0].start - ns <= 0.5) prev.e = r3(inside[0].start);
      ns = inside.at(-1).end;
    }
    out.push(ne - ns >= 0.05 ? { ...word, s: r3(ns), e: r3(ne) } : { ...word });
  }
  return out;
}

const mid = (w) => (w.s + w.e) / 2;
const mean = (ws) => ws.reduce((a, w) => a + w.conf, 0) / ws.length;
const token = (w) => w.w.toLowerCase().replace(/[^a-z0-9']/g, "");

// A fresh pass stands in for the words of span = { start, end } when it heard more words there, and more surely. Only the
// span's own words go; what the pass heard between the words either side of it comes in, minus a repeat of either neighbour
// at the edge. New words get ids from nextId(). A pass that hears the same words, each surely, confirms them: nothing changes.
export function spliceWords(words, fresh, span, nextId) {
  const inSpan = (w) => mid(w) >= span.start && mid(w) <= span.end;
  const first = words.findIndex(inSpan), last = words.findLastIndex(inSpan);
  if (first < 0) return { words, recovered: false, added: [] };
  const before = words.slice(0, first), after = words.slice(last + 1), replaced = words.slice(first, last + 1);
  const lo = before.at(-1)?.e ?? -Infinity, hi = after[0]?.s ?? Infinity;
  const prev = before.at(-1), next = after[0];
  const echo = (w) => (prev && token(w) === token(prev) && w.s - prev.e <= 0.3) || (next && token(w) === token(next) && next.s - w.e <= 0.3);
  const heard = fresh.filter((w) => w.w?.trim() && mid(w) > lo && mid(w) < hi && !echo(w)).map((w) => ({ w: w.w.trim(), s: r3(Math.max(w.s, lo)), e: r3(Math.min(w.e, hi)), conf: w.conf ?? 1 })).filter((w) => w.e > w.s);
  const same = heard.length === replaced.length && heard.every((w, i) => token(w) === token(replaced[i]) && w.conf >= 0.5);
  if (same) return { words, recovered: true, confirmed: true, added: [] };
  if (!(heard.length > replaced.length && mean(heard) > mean(replaced))) return { words, recovered: false, added: [] };
  const added = heard.map((w) => ({ id: nextId(), ...w }));
  return { words: [...before, ...added, ...after], recovered: true, added: added.map((w) => w.id) };
}

// Dropped speech: run whisper again on each span (with 0.5 s either side) and keep the new words when they are better.
// Each span is noted with the transcription chunks its window touched, to see whether it sat on a chunk edge.
export async function recoverDroppedSpeech(clip, { file, transcribeFn, opts, clipIndex, chunks = [] }) {
  const prefix = `c${clipIndex + 1}w`;
  let k = Math.max(-1, ...clip.words.map((w) => (w.id.startsWith(prefix) ? Number(w.id.slice(prefix.length)) : -1)).filter((x) => x >= 0)) + 1;
  const nextId = () => `${prefix}${k++}`;
  let words = clip.words;
  const dropped_speech = [];
  for (const sp of droppedSpeechSpans(clip)) {
    const win = { start: r3(Math.max(0, sp.start - 0.5)), end: r3(Math.min(clip.duration ?? Infinity, sp.end + 0.5)) };
    const chunk = chunks.filter((c) => c.start < win.end && (c.end ?? Infinity) > win.start);
    let fresh = null;
    try { fresh = refineWords(await transcribeFn(file, { ...opts, span: win }), clip.silences || []); }
    catch { fresh = null; } // a failed re-run leaves the words as they were; the span goes to the member
    const r = fresh ? spliceWords(words, fresh, sp, nextId) : { words, recovered: false, added: [] };
    words = r.words;
    dropped_speech.push({ start: sp.start, end: sp.end, word_ids: r.added.length ? r.added : sp.word_ids, recovered: r.recovered, chunk });
  }
  return { words, dropped_speech };
}

async function readVocabulary(home) {
  try { return (await fs.readFile(path.join(home, "vocabulary.txt"), "utf8")).split(/\r?\n/).map((x) => x.trim()).filter(Boolean); }
  catch (err) { if (err.code === "ENOENT") return []; throw err; }
}

export async function loadEnvelopes(projectDir) {
  const meta = JSON.parse(await fs.readFile(path.join(projectDir, "project.json"), "utf8"));
  const envs = {};
  for (const c of meta.clips) envs[c.id] = JSON.parse(await fs.readFile(path.join(projectDir, "envelopes", `${c.id}.json`), "utf8"));
  return envs;
}

export async function transcribeProject(projectDir, { run, home = reelsHome(), transcribeFn = transcribeFile }) {
  const meta = JSON.parse(await fs.readFile(path.join(projectDir, "project.json"), "utf8"));
  const cfg = await loadConfig(home);
  const vocabulary = await readVocabulary(home);
  await fs.mkdir(path.join(projectDir, "envelopes"), { recursive: true });
  const clips = [];
  for (const [i, clip] of meta.clips.entries()) {
    const file = path.join(projectDir, clip.proxy);
    // energy map first: it tells transcription where the real pauses are
    const env = await computeEnvelope(file, { run });
    await fs.writeFile(path.join(projectDir, "envelopes", `${clip.id}.json`), JSON.stringify(env));
    const threshold_db = silenceThreshold(env, cfg.thresholds);
    const silences = silencesFromEnvelope(env, threshold_db, cfg.thresholds.silence_min_ms);
    const raw = await transcribeFn(file, { run, vocabulary, home, silences, duration: clip.duration });
    const words = raw.filter((x) => x.w && x.w.trim()).map((x, k) => ({ id: `c${i + 1}w${k}`, w: x.w.trim(), s: x.s, e: x.e, conf: x.conf ?? 1, ...(x.ctrl ? { ctrl: true } : {}) }));
    if (words.length === 0) throw new Error(`No speech found in ${clip.id} (${clip.file}). Check the clip has someone talking.`);
    const rec = await recoverDroppedSpeech({ duration: clip.duration, words: refineWords(words, silences), silences }, { file, transcribeFn, opts: { run, vocabulary, home }, clipIndex: i, chunks: chunkPlan(clip.duration, silences) });
    clips.push({ id: clip.id, proxy: clip.proxy, duration: clip.duration, offset_ms: clip.offset_ms ?? 0, threshold_db, words: rec.words, silences, dropped_speech: rec.dropped_speech });
  }
  const transcript = { version: 2, clips };
  await fs.writeFile(projectPaths(projectDir).transcript, JSON.stringify(transcript, null, 2));
  return transcript;
}
