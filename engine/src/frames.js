import fs from "node:fs/promises";
import path from "node:path";
import { projectPaths } from "./paths.js";
import { probe } from "./proxy.js";
import { slugify } from "./project.js";

export async function contactSheet(projectDir, { run }) {
  const meta = JSON.parse(await fs.readFile(path.join(projectDir, "project.json"), "utf8"));
  const dir = projectPaths(projectDir).frames;
  await fs.mkdir(dir, { recursive: true });
  const out = [];
  for (const clip of meta.clips) {
    const rate = 8 / Math.max(clip.duration, 0.5);
    const file = path.join(dir, `${clip.id}.jpg`);
    await run("ffmpeg", ["-v", "error", "-y", "-i", path.join(projectDir, clip.proxy),
      "-vf", `fps=${rate},scale=270:480,tile=4x2`, "-frames:v", "1", "-q:v", "4", file]);
    out.push(file);
  }
  return out;
}

// Two grids from someone else's reel, for reading its look: 8 frames across the whole video (framing, colors, zoom between cuts),
// and 8 frames a quarter second apart from the middle (do the captions change word by word?).
export async function exampleFrames(video, outDir, { run }) {
  if (!(await fs.access(video).then(() => true, () => false))) throw new Error(`There is no file at ${video}.`);
  const { duration } = await probe(video, { run }).catch(() => ({}));
  if (!(duration > 0)) throw new Error(`Could not read ${path.basename(video)} as a video.`);
  await fs.mkdir(outDir, { recursive: true });
  const name = slugify(path.parse(video).name);
  const tile = "scale=404:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=404:720:(ow-iw)/2:(oh-ih)/2,tile=4x2";
  const spread = path.join(outDir, `${name}-spread.jpg`), burst = path.join(outDir, `${name}-burst.jpg`);
  await run("ffmpeg", ["-v", "error", "-y", "-i", video, "-vf", `fps=${8 / Math.max(duration, 0.5)},${tile}`, "-frames:v", "1", "-q:v", "3", spread]);
  const from = Math.max(0, duration / 2 - 1);
  await run("ffmpeg", ["-v", "error", "-y", "-ss", String(+from.toFixed(3)), "-i", video, "-t", "2", "-vf", `fps=4,${tile}`, "-frames:v", "1", "-q:v", "3", burst]);
  return { spread, burst, seconds: +duration.toFixed(2) };
}
