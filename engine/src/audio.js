import fs from "node:fs/promises";
import path from "node:path";

const f = (x) => String(+x.toFixed(4));

// Segments that butt-join at the same source time are one continuous stretch of audio.
export function mergeContiguous(segments) {
  const out = [];
  for (const s of segments) {
    const prev = out.at(-1);
    if (prev && prev.source === s.source && Math.abs(prev.out - s.in) < 1e-6) prev.out = s.out;
    else out.push({ source: s.source, in: s.in, out: s.out });
  }
  return out;
}

// CUT-4: equal-power crossfade at every real cut. Each side is extended by half the fade so the total length is unchanged.
export function audioFilter(ranges, crossfadeMs, inputIndex) {
  const x = crossfadeMs / 1000, half = x / 2;
  const uses = {};
  ranges.forEach((r) => (uses[r.source] = (uses[r.source] || 0) + 1));
  const parts = [], taken = {};
  for (const [source, n] of Object.entries(uses)) {
    if (n > 1) parts.push(`[${inputIndex[source]}:a]asplit=${n}${Array.from({ length: n }, (_, k) => `[s${inputIndex[source]}_${k}]`).join("")}`);
  }
  ranges.forEach((r, i) => {
    const k = (taken[r.source] = (taken[r.source] ?? -1) + 1);
    const input = uses[r.source] > 1 ? `[s${inputIndex[r.source]}_${k}]` : `[${inputIndex[r.source]}:a]`;
    const start = i === 0 ? r.in : Math.max(0, r.in - half), end = i === ranges.length - 1 ? r.out : r.out + half;
    parts.push(`${input}atrim=start=${f(start)}:end=${f(end)},asetpts=PTS-STARTPTS[a${i}]`);
  });
  if (ranges.length === 1) return parts.join(";").replace(/\[a0\]$/, "[aout]");
  let prev = "[a0]";
  for (let i = 1; i < ranges.length; i++) {
    const label = i === ranges.length - 1 ? "[aout]" : `[x${i}]`;
    parts.push(`${prev}[a${i}]acrossfade=d=${f(x)}:c1=qsin:c2=qsin${label}`);
    prev = label;
  }
  return parts.join(";");
}

export async function renderAudio(projectDir, segments, { run, crossfadeMs = 15, out = path.join(projectDir, "acut.wav") }) {
  const meta = JSON.parse(await fs.readFile(path.join(projectDir, "project.json"), "utf8"));
  const ranges = mergeContiguous(segments);
  const sources = [...new Set(ranges.map((r) => r.source))];
  const inputIndex = Object.fromEntries(sources.map((s, i) => [s, i]));
  const proxy = Object.fromEntries(meta.clips.map((c) => [c.id, path.join(projectDir, c.proxy)]));
  await run("ffmpeg", ["-v", "error", "-y", ...sources.flatMap((s) => ["-i", proxy[s]]),
    "-filter_complex", audioFilter(ranges, crossfadeMs, inputIndex), "-map", "[aout]", "-c:a", "pcm_s16le", "-ar", "48000", out]);
  return out;
}

// Loudness: single-pass loudnorm drifts by a couple of LU on short speech, so measure first and apply the measurement.
export function parseLoudnorm(stderr) {
  const json = JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1));
  const { input_i, input_tp, input_lra, input_thresh, target_offset } = json;
  return { input_i, input_tp, input_lra, input_thresh, target_offset };
}

export function loudnormFilter(m, { I = -14, TP = -1, LRA = 11 } = {}) {
  return `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}

export async function normalizeLoudness(input, output, { run }) {
  const pass1 = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"]);
  await run("ffmpeg", ["-v", "error", "-y", "-i", input, "-af", loudnormFilter(parseLoudnorm(pass1.stderr)), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", output]);
  return output;
}
