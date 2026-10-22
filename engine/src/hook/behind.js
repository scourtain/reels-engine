import fs from "node:fs/promises";
import path from "node:path";
import { HF, projectPaths } from "../paths.js";
import { writeComposition } from "../build/composition.js";
import { matteTool, matteFrames } from "./matte.js";

// How much of the opening is rendered a second time: the hook's time on screen and a breath, ending on a frame.
export const plateUntil = (hook) => Math.ceil((hook.end + hook.clear + 0.2) * 30) / 30;

// ffmpeg: for the first `until` seconds, wherever the mask says "person", take the picture from the plate (the same opening with no hook type).
// Everything after `until` is the reel as rendered. The mask is spread to all three colour planes so the merge stays in YUV:
// no trip through RGB, so there is no colour step where the two halves join.
export function mergeArgs({ full, plate, masks, until, out, size = "1080:1920" }) {
  const u = until.toFixed(4);
  const graph = [
    `[0:v]split[a0][a1]`,
    `[a0]trim=end=${u},setpts=PTS-STARTPTS,format=yuv444p[head]`,
    `[a1]trim=start=${u},setpts=PTS-STARTPTS,format=yuv420p[rest]`,
    `[1:v]format=yuv444p[plate]`,
    `[2:v]scale=${size},format=gray,split=3[m0][m1][m2]`,
    `[m0][m1][m2]mergeplanes=0x001020:yuv444p[mask]`,
    `[head][plate][mask]maskedmerge,format=yuv420p[front]`,
    `[front][rest]concat=n=2:v=1:a=0[v]`,
  ].join(";");
  return ["-v", "error", "-y", "-i", full, "-i", plate, "-framerate", "30", "-i", masks, "-filter_complex", graph, "-map", "[v]", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30", out];
}

// Puts the person in front of hook type that sits behind the head. built: what buildComposition returned (its hook and its parts).
// Renders the opening again without the type, cuts the person out of every frame of it, and lays that back over the full render.
export async function personInFront(projectDir, built, { run, home, quality = "standard" }) {
  const paths = projectPaths(projectDir), hook = built.hook, until = plateUntil(hook);
  const work = path.join(projectDir, ".hook-cache", "plate");
  await fs.rm(work, { recursive: true, force: true });
  const comp = path.join(work, "composition"), plate = path.join(work, "plate.mp4"), frames = path.join(work, "frames"), masks = path.join(work, "masks");
  await writeComposition(comp, { ...built.parts, home, hook, hookLayer: false, until });
  await run("npx", ["-y", HF, "render", "-q", quality, "-f", "30", "-o", plate], { cwd: comp });
  await fs.mkdir(frames, { recursive: true });
  // half-size frames are plenty for the mask and keep this quick
  await run("ffmpeg", ["-v", "error", "-y", "-i", plate, "-vf", "scale=540:960", path.join(frames, "%05d.png")]);
  const tool = await matteTool({ run, home });   // the build already proved it is there
  await matteFrames(frames, masks, { run, bin: tool.bin });
  // The cutout tool skips a frame it cannot read. A gap would cut the mask sequence short, so say so rather than lay back half a person.
  const [nFrames, nMasks] = await Promise.all([fs.readdir(frames), fs.readdir(masks)].map((p) => p.then((l) => l.filter((n) => n.endsWith(".png")).length)));
  if (nMasks !== nFrames) throw new Error(`the cutout tool made ${nMasks} of ${nFrames} frames`);
  const merged = path.join(work, "merged.mp4");
  await run("ffmpeg", mergeArgs({ full: paths.finalRaw, plate, masks: path.join(masks, "%05d.png"), until, out: merged }));
  await fs.rename(merged, paths.finalRaw);
  await fs.rm(path.join(projectDir, ".hook-cache"), { recursive: true, force: true });
}
