import fs from "node:fs/promises";
import path from "node:path";
import { mergeContiguous, audioFilter } from "../audio.js";
import { videoOut } from "../platform.js";

const f = (x) => String(+x.toFixed(4));

// EXP-1: the A-cut and nothing else, cut from the camera originals at their own resolution and frame rate.
export async function renderPreview(projectDir, segments, { run, crossfadeMs = 15, out, plat = process.platform }) {
  const meta = JSON.parse(await fs.readFile(path.join(projectDir, "project.json"), "utf8"));
  const ranges = mergeContiguous(segments);
  const sources = [...new Set(ranges.map((r) => r.source))];
  const idx = Object.fromEntries(sources.map((s, i) => [s, i]));
  const original = Object.fromEntries(meta.clips.map((c) => [c.id, path.join(projectDir, "source", c.file)]));
  const uses = {}; ranges.forEach((r) => (uses[r.source] = (uses[r.source] || 0) + 1));
  const parts = [], taken = {};
  for (const [s, n] of Object.entries(uses)) if (n > 1) parts.push(`[${idx[s]}:v]split=${n}${Array.from({ length: n }, (_, k) => `[vs${idx[s]}_${k}]`).join("")}`);
  ranges.forEach((r, i) => {
    const k = (taken[r.source] = (taken[r.source] ?? -1) + 1);
    const input = uses[r.source] > 1 ? `[vs${idx[r.source]}_${k}]` : `[${idx[r.source]}:v]`;
    parts.push(`${input}trim=start=${f(r.in)}:end=${f(r.out)},setpts=PTS-STARTPTS[v${i}]`);
  });
  parts.push(`${ranges.map((_, i) => `[v${i}]`).join("")}concat=n=${ranges.length}:v=1:a=0[vout]`);
  const clip = meta.clips.find((c) => c.id === sources[0]);
  const big = (clip.source_width || 1080) * (clip.source_height || 1920) > 1920 * 1080 * 1.5;
  await run("ffmpeg", ["-v", "error", "-y", ...sources.flatMap((s) => ["-i", original[s]]),
    "-filter_complex", `${parts.join(";")};${audioFilter(ranges, crossfadeMs, idx)}`, "-map", "[vout]", "-map", "[aout]",
    ...videoOut(big ? "40M" : "12M", plat), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
  return out;
}
