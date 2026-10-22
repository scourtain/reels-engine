import fs from "node:fs/promises";
import path from "node:path";
import { matteTool, matteFrames, coverage, TOOL_MISSING } from "./matte.js";

export const HEAD_COVERS = "Your head covers part of this line.";
// Only ever a note on an available verdict; a cutout that cannot run is CUTOUT_FAILED.
export const CANT_CHECK = "Couldn't check whether your head covers the type in this clip.";
export const CUTOUT_FAILED = "Couldn't put you in front of the type on this computer.";
const exists = (p) => fs.access(p).then(() => true, () => false);

// worst: for each line of the hook, the most of it the person covered at any moment looked at (0 to 1).
// The member decides what to do about it, so a covered line is only ever a note: the look is always available.
export function judge(worst, keyLine) {
  const notes = worst.map((w, i) => (w <= 0.5 ? null : i === keyLine ? HEAD_COVERS : `Your head covers part of line ${i + 1}.`)).filter(Boolean);
  return { available: true, reason: null, notes };
}

const nameOf = (t) => `f${String(Math.round(t * 100)).padStart(5, "0")}`;

// Will type behind the head read on this clip? Looks at a frame every three quarters of a second while the hook is up.
// The zoom waits for these looks, so a frame of the working copy is the frame the render shows.
// tl: the timeline. clips: [{ id, file }]. cache: { dir, done } lets the review helper ask again without cutting the same frames out twice.
export async function readability(plan, { projectDir, tl, clips, run, home, cache = null, plat = process.platform }) {
  const times = [];
  for (let t = 0.5; t < plan.end; t += 0.75) times.push(+t.toFixed(2));
  const dir = cache?.dir ?? path.join(projectDir, ".hook-cache", `read-${process.pid}-${Date.now()}`);
  const inDir = path.join(dir, "in"), outDir = path.join(dir, "out");
  const fileOf = Object.fromEntries(clips.map((c) => [c.id, c.file]));
  const need = times.filter((t) => !cache?.done.has(t));
  const cleanup = () => (cache ? Promise.resolve() : fs.rm(dir, { recursive: true, force: true }));
  try {
    // Preparing the tool can fail too (a Reels folder that cannot be written to): the cutout cannot run, so the look is unavailable, not a failed reel.
    let tool;
    try { tool = await matteTool({ run, home, plat }); } catch (err) {
      process.stderr.write(`hook card: ${err.message}\n`);
      return { available: false, reason: CUTOUT_FAILED, notes: [] };
    }
    if (!tool.ok) return { available: false, reason: tool.reason ?? TOOL_MISSING, notes: [] };
    if (need.length) try {
      await fs.rm(inDir, { recursive: true, force: true });
      await fs.mkdir(inDir, { recursive: true });
      for (const t of need) {
        const p = tl.find((x) => t >= x.start && t < x.start + x.duration) ?? tl[0];
        await run("ffmpeg", ["-v", "error", "-y", "-ss", String(+(p.in + (t - p.start)).toFixed(3)), "-i", fileOf[p.source], "-frames:v", "1", "-vf", "scale=540:960", path.join(inDir, `${nameOf(t)}.png`)]);
      }
      await matteFrames(inDir, outDir, { run, bin: tool.bin });
      // Only a moment that got its mask counts as done: a missing one is tried again the next time.
      for (const t of need) if (await exists(path.join(outDir, `${nameOf(t)}.png`))) cache?.done.add(t);
    } catch (err) {
      // Cutting frames or running the cutout tool broke: the render would break the same way, so the look cannot be used.
      process.stderr.write(`hook card: ${err.message}\n`);
      return { available: false, reason: CUTOUT_FAILED, notes: [] };
    }
    // The tool skips a frame it cannot read, so a look can come back without its mask: that moment is left out of the verdict.
    const seen = [];
    for (const t of times) if (await exists(path.join(outDir, `${nameOf(t)}.png`))) seen.push(t);
    if (!seen.length) return { available: true, reason: null, notes: [CANT_CHECK] };
    const worst = [];
    for (const line of plan.lines) {
      let w = 0;
      for (const t of seen) w = Math.max(w, await coverage(path.join(outDir, `${nameOf(t)}.png`), line.box, { run, scale: 0.5 }));
      worst.push(w);
    }
    return { ...judge(worst, plan.keyLine), worst };
  } catch (err) {
    process.stderr.write(`hook card: ${err.message}\n`);
    return { available: true, reason: null, notes: [CANT_CHECK] };
  } finally {
    await cleanup();
  }
}
