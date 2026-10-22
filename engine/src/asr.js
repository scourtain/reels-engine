import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MODEL = "ggml-small.en.bin";
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL}`;
const exists = (p) => fs.access(p).then(() => true, () => false);
const r3 = (x) => Math.round(x * 1000) / 1000;

// Whisper drops fillers unless the prompt shows it that this speaker has them.
export function buildPrompt(vocabulary = []) {
  const vocab = vocabulary.length ? ` ${vocabulary.join(", ")}.` : "";
  return `Um, uh, so, like, I mean, you know, the the thing is, er, hmm, okay so.${vocab}`;
}

const CONTROL = /<\|[^|]*\|>/g; // whisper's own markers (<|endoftext|> and friends), never speech

// A word that had a control token in it is marked ctrl: the decoder lost its place there, so speech after it may be missing.
export function parseWhisperJson(json) {
  const words = [];
  let cur = null;
  for (const seg of json.transcription || []) {
    for (const t of seg.tokens || []) {
      if (!t.text || t.text.startsWith("[_")) continue;
      const end = t.t_dtw >= 0 ? t.t_dtw / 100 : t.offsets.to / 1000;
      const text = t.text.replace(CONTROL, ""), ctrl = text !== t.text;
      const punct = /^[.,!?;:'")\]…-]+$/.test(text.trim());
      if (t.text.startsWith(" ") || !cur) {
        if (cur) words.push(cur);
        cur = { w: text.trim(), s: words.length ? words.at(-1).e : t.offsets.from / 1000, e: end, conf: t.p, ctrl };
      } else {
        cur.w += text;
        cur.ctrl ||= ctrl;
        if (!punct && text.trim()) { cur.e = end; cur.conf = Math.min(cur.conf, t.p); } // a bare control token doesn't move timing
      }
    }
  }
  if (cur) words.push(cur);
  let prevEnd = 0, carry = false;
  const out = [];
  for (const w of words) {
    if (!w.w) { carry ||= w.ctrl; continue; } // a word that was only a token goes; its mark moves to the word after it
    const s = Math.max(w.s, prevEnd);
    const e = w.e > s + 0.02 ? w.e : s + 0.05;
    prevEnd = e;
    out.push({ w: w.w, s: r3(s), e: r3(e), conf: r3(w.conf), ...(w.ctrl || carry ? { ctrl: true } : {}) });
    carry = false;
  }
  return out;
}

export async function findModel(home) {
  const places = [home && path.join(home, "models", MODEL), path.join(os.homedir(), ".cache", "hyperframes", "whisper", "models", MODEL)].filter(Boolean);
  for (const p of places) if (await exists(p)) return p;
  return null;
}

export async function ensureModel(home, { run }) {
  const found = await findModel(home);
  if (found) return found;
  const dest = path.join(home, "models", MODEL);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await run("curl", ["-L", "--fail", "-o", dest, MODEL_URL]);
  return dest;
}

// Whisper's word timings drift when it works through a long stretch (words get squeezed at its 30 s window edges).
// So audio goes in as short chunks that break in the middle of real pauses. With no real pause in reach, the longest
// breath in reach will do (the latest of those nearly as long as the longest, so chunks stay long): a hard cut at maxLen
// lands mid-word, and whisper drops the speech either side of it.
export function chunkPlan(duration, silences = [], { maxLen = 20, minSilence = 0.25, minLen = 5 } = {}) {
  const mid = (x) => (x.start + x.end) / 2;
  const plan = [];
  let t = 0;
  while (duration - t > maxLen) {
    const inReach = silences.filter((x) => mid(x) > t + minLen && mid(x) <= t + maxLen);
    const real = inReach.filter((x) => x.end - x.start >= minSilence);
    const longest = Math.max(0, ...inReach.map((x) => x.end - x.start));
    const breath = inReach.filter((x) => x.end - x.start >= 0.8 * longest).at(-1);
    const cut = r3(real.length ? mid(real.at(-1)) : breath ? mid(breath) : t + maxLen);
    plan.push({ start: t, end: cut });
    t = cut;
  }
  plan.push({ start: t, end: duration });
  return plan;
}

// A real word cannot be shorter than about 20 ms per letter. When one is, its timing is wrong.
export function implausibleWords(words) {
  return words.filter((w) => { const letters = w.w.replace(/[^a-z0-9]/gi, "").length; return letters >= 4 && w.e - w.s < 0.02 * letters; });
}

const letters = (w) => w.w.replace(/[^a-z0-9]/gi, "").length;
const UNSURE = 0.2;

// The mirror of implausibleWords: whisper sometimes loses a stretch of speech and stretches a word or two over the gap.
// Suspect: an unsure word (under 0.5) far longer than its letters allow, a run of 2+ very unsure words covering more than 1.5 s,
// and a word that had a control token in it when very unsure words follow it. Overlapping or touching suspects merge into one span.
// A sure word that runs long is just said slowly (real footage has plenty).
export function stretchedWords(words) {
  const runs = [];
  words.forEach((w, i) => { if (w.conf < 0.5 && w.e - w.s > Math.max(1.2, 0.25 * letters(w))) runs.push([i, i]); });
  for (let i = 0; i < words.length; ) {
    let j = i;
    while (j < words.length && words[j].conf < UNSURE) j++;
    if (j - i >= 2 && words[j - 1].e - words[i].s > 1.5) runs.push([i, j - 1]);
    i = j > i ? j : i + 1;
  }
  words.forEach((w, i) => {
    if (!w.ctrl) return;
    let j = i;
    while (words[j + 1] && words[j + 1].conf < UNSURE) j++;
    if (j > i) runs.push([i, j]);
  });
  runs.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of runs) { const last = merged.at(-1); if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
  return merged.map(([i, j]) => ({ start: words[i].s, end: words[j].e, word_ids: words.slice(i, j + 1).map((w) => w.id) }));
}

// A suspect span is dropped speech when the audio says talking the whole way through: no silence over 0.3 s inside it.
export function droppedSpeechSpans(clip) {
  const silences = clip.silences || [];
  return stretchedWords(clip.words).filter((sp) => !silences.some((x) => Math.min(x.end, sp.end) - Math.max(x.start, sp.start) > 0.3));
}

// span: transcribe just { start, end } of the file (used to re-run whisper on a stretch it dropped). Times come back on the file's clock.
export async function transcribeFile(file, { run, vocabulary = [], home = null, silences = null, duration = null, span = null }) {
  const model = await findModel(home);
  if (!model) throw new Error("The speech model isn't installed yet. Run /reels-engine:reel-setup.");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reels-asr-"));
  const chunks = span ? [span] : silences && duration ? chunkPlan(duration, silences) : [{ start: 0, end: null }];
  const words = [];
  for (const [i, c] of chunks.entries()) {
    const wav = path.join(dir, `a${i}.wav`);
    const span = c.end === null ? [] : ["-ss", String(c.start), "-to", String(c.end)];
    await run("ffmpeg", ["-v", "error", "-y", "-i", file, ...span, "-vn", "-ar", "16000", "-ac", "1", wav]);
    await run("whisper-cli", ["-m", model, "-f", wav, "-ojf", "-of", path.join(dir, `out${i}`), "-np", "--dtw", "small.en", "-nfa", "--prompt", buildPrompt(vocabulary)]);
    const part = parseWhisperJson(JSON.parse(await fs.readFile(path.join(dir, `out${i}.json`), "utf8")));
    const limit = c.end === null ? Infinity : c.end - c.start;
    for (const w of part) if (w.s < limit) words.push({ ...w, s: r3(w.s + c.start), e: r3(Math.min(w.e, limit) + c.start) });
  }
  await fs.rm(dir, { recursive: true, force: true });
  return words;
}

const token = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

// Take timings from a fresh transcription pass and put them on the words we already have (matched in order by
// what was said). Everything else about the existing words stays: ids, corrected text, confidence.
export function alignTimings(oldWords, newWords) {
  const a = oldWords.map((w) => token(w.w)), b = newWords.map((w) => token(w.w));
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const words = oldWords.map((w) => ({ ...w }));
  let i = 0, j = 0, matched = 0;
  while (i < a.length && j < b.length) {
    if (a[i] && a[i] === b[j]) { words[i].s = newWords[j].s; words[i].e = newWords[j].e; matched++; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { words, matched };
}
