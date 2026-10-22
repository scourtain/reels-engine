import { wordsOfLine } from "./cutlist.js";
import { quietestFrame } from "./envelope.js";

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// CUT-2 (v1): judged from spelling. Vowel and fricative endings ring on, so they get a longer tail.
export const softEnding = (word) => /(?:[aeiouy]|s|z|f|v|x|sh|th|ch)$/i.test(word.replace(/[^a-z]/gi, ""));

// How much silence to keep after the outgoing word (a) and before the incoming word (b).
// post/pre are protected minimums; the rest of the target is shared; nothing exceeds the silence that exists.
export function joinRolls({ target, post, pre, availA, availB, floor = 0 }) {
  let a = Math.min(post, availA), b = Math.min(pre, availB);
  const want = Math.max(target, floor);
  if (a + b > want) { const k = want / (a + b); a *= k; b *= k; }
  let rest = want - (a + b);
  for (let pass = 0; pass < 2 && rest > 1e-9; pass++) {
    const addA = Math.min(rest / 2, availA - a); a += addA; rest -= addA;
    const addB = Math.min(rest, availB - b); b += addB; rest -= addB;
  }
  return { a, b };
}

// Stages 8 and 9: derive the A-cut from kept lines minus accepted decisions.
// Returns segments in the shape the timeline, builder and clip pack already use.
// The cut never depends on the look: pause targets come from the edit config only.
export function assemble(cl, { transcript, envs, cfg, fps = 30 }) {
  const T = cfg.thresholds, frame = 1 / fps;
  const where = new Map();
  const clipOf = Object.fromEntries(transcript.clips.map((c) => [c.id, c]));
  for (const c of transcript.clips) c.words.forEach((w, idx) => where.set(w.id, { clip: c, idx }));
  const prevEnd = (w) => { const { clip, idx } = where.get(w.id); return idx > 0 ? clip.words[idx - 1].e : 0; };
  const nextStart = (w) => { const { clip, idx } = where.get(w.id); return idx < clip.words.length - 1 ? clip.words[idx + 1].s : (clip.duration ?? w.e + 1); };
  const protectedAfter = new Set((cl.protected_pauses || []).map((p) => p.after_word_id));
  const snap = (source, t, lo, hi, windowMs = T.snap_window_ms) => quietestFrame(envs[source], t, { windowMs, fps, lo, hi, silentBelow: clipOf[source]?.threshold_db ?? -Infinity }); // k/fps exactly, never rounded off the grid

  const seq = [];
  for (const line of cl.lines.filter((l) => l.keep)) for (const w of wordsOfLine(cl, line)) seq.push({ w, line });
  if (!seq.length) return { segments: [], cuts: [], seconds: 0 };

  const targetFor = (type) => (type === "within" ? T.gap_within_target_ms
    : type === "punchline" ? T.gap_punchline_ms
    : clamp(T.gap_between_ms, T.gap_between_min_ms, T.gap_between_max_ms)) / 1000;

  const segments = [], cuts = [];
  let seconds = 0;
  let open = null;
  const start = (item, inPoint) => { open = { lineId: item.line.id, source: item.line.source, in: inPoint, out: null, words: [item.w] }; };
  const close = (outPoint) => {
    open.out = outPoint > open.in ? outPoint : (Math.round(open.in * fps) + 1) / fps;
    seconds += open.out - open.in;
    segments.push(open); open = null;
  };

  const first = seq[0];
  const lead = Math.min(T.pre_roll_ms / 1000, Math.max(0, first.w.s - prevEnd(first.w)));
  start(first, snap(first.line.source, first.w.s - lead, Math.max(0, prevEnd(first.w)), first.w.s));

  for (let i = 1; i < seq.length; i++) {
    const A = seq[i - 1], B = seq[i];
    const sameLine = A.line === B.line;
    const pa = where.get(A.w.id), pb = where.get(B.w.id);
    const adjacent = pa.clip === pb.clip && pb.idx === pa.idx + 1;
    const type = sameLine ? "within" : B.line.punch ? "punchline" : "between";
    const natural = adjacent ? Math.max(0, B.w.s - A.w.e) : null;
    const target = targetFor(type);

    let cut = true;
    if (adjacent) {
      if (protectedAfter.has(A.w.id)) cut = false;
      else if (type === "within") cut = natural * 1000 > T.gap_within_trigger_ms;
      else cut = natural > target + frame; // GAP-2: never lengthen, and don't cut to save less than a frame
    }

    if (cut) {
      const post = (softEnding(A.w.w) ? T.post_roll_soft_ms : T.post_roll_ms) / 1000, pre = T.pre_roll_ms / 1000;
      const availA = adjacent ? natural : Math.max(0, nextStart(A.w) - A.w.e);
      const availB = adjacent ? natural : Math.max(0, B.w.s - prevEnd(B.w));
      let { a, b } = joinRolls({ target, post, pre, availA, availB, floor: T.gap_floor_ms / 1000 });
      if (adjacent && a + b > natural) b = Math.max(0, natural - a);
      // the rolls are protected: snapping may move a cut around inside the silence, never into the word's tail or lead-in
      // (when the silence is too short to hold a frame boundary outside the roll, the whole silence is fair game)
      const frameIn = (lo, hi) => Math.ceil(lo * fps - 1e-9) / fps <= hi + 1e-9;
      const outLo = frameIn(A.w.e + Math.min(post, availA), A.w.e + availA) ? A.w.e + Math.min(post, availA) : A.w.e;
      const inHi = frameIn(B.w.s - availB, B.w.s - Math.min(pre, availB)) ? B.w.s - Math.min(pre, availB) : B.w.s;
      let outPoint = snap(A.line.source, A.w.e + a, outLo, A.w.e + availA);
      let inPoint = snap(B.line.source, B.w.s - b, B.w.s - availB, inHi);
      if (adjacent && inPoint <= outPoint) { inPoint = outPoint; cut = false; } // nothing left to remove after snapping
      close(outPoint);
      if (cut) {
        const flags = [];
        if (outPoint < A.w.e - 0.005 || inPoint > B.w.s + 0.005) flags.push("harsh");
        cuts.push({ id: `cut_${String(cuts.length + 1).padStart(3, "0")}`, type, a_cut_ms: Math.round(seconds * 1000), out_source: A.line.source, in_source: B.line.source,
          out_source_ms: Math.round(outPoint * 1000), in_source_ms: Math.round(inPoint * 1000), crossfade_ms: T.crossfade_ms, flags });
      }
      start(B, inPoint);
    } else if (!sameLine) {
      // No cut, but a new line: split on a quiet frame inside the natural pause so every line stays its own piece.
      const mid = (A.w.e + B.w.s) / 2;
      const split = snap(A.line.source, mid, A.w.e, B.w.s, Math.max(frame * 1000, (natural * 1000) / 2));
      close(split);
      start(B, split);
    } else {
      open.words.push(B.w);
    }
  }
  const last = seq.at(-1);
  const tail = Math.min(Math.max((softEnding(last.w.w) ? T.post_roll_soft_ms : T.post_roll_ms) / 1000, 0.15), Math.max(0, nextStart(last.w) - last.w.e));
  close(snap(last.line.source, last.w.e + tail, last.w.e, last.w.e + Math.max(tail, frame)));
  return { segments, cuts, seconds: r6(seconds) };
}
