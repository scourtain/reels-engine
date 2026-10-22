import fs from "node:fs/promises";
import { HF } from "./paths.js";
import { buildComposition } from "./build/composition.js";
import path from "node:path";
import { renderAudio, normalizeLoudness } from "./audio.js";
import { loadConfig } from "./config.js";
import { projectPaths, reelsHome } from "./paths.js";
import { writeComposition } from "./build/composition.js";
import { loadEdit } from "./edit.js";
import { assemble } from "./acut.js";
import { timeline } from "./cutlist.js";
import { readability } from "./hook/readability.js";
import { personInFront } from "./hook/behind.js";
import { newestProject, sampleWindow } from "./samples.js";

// Video comes from HyperFrames (clips muted). Sound is the A-cut audio with crossfades, normalized, then muxed on.
export async function renderProject(projectDir, opts) {
  // Cut-out frames (from this render or from a review where the hook was tried on) never stay in the project, whatever happens.
  try { return await renderReel(projectDir, opts); }
  finally { await fs.rm(path.join(projectDir, ".hook-cache"), { recursive: true, force: true }); }
}

async function renderReel(projectDir, { run, quality = "standard", home = reelsHome() }) {
  const paths = projectPaths(projectDir);
  const built = await buildComposition(projectDir, { home, run, behind: readability });
  const cfg = await loadConfig(home);
  const audio = await renderAudio(projectDir, built.segments, { run, crossfadeMs: cfg.thresholds.crossfade_ms });
  await run("npx", ["-y", HF, "render", "-q", quality, "-f", "30", "-o", paths.finalRaw], { cwd: paths.composition });
  let warnings = [...built.warnings];
  if (built.hook?.layer === "behind") {
    try { await personInFront(projectDir, built, { run, home, quality }); }
    catch (err) {
      // The reel still renders: without the hook, with a plain note. (final-raw.mp4 is only replaced by a finished merge.)
      process.stderr.write(`hook card: ${err.message}\n`);
      await fs.rm(path.join(projectDir, ".hook-cache"), { recursive: true, force: true });
      warnings = warnings.filter((w) => !/^Your head covers part of line \d+\.$/.test(w));   // notes about a hook that is now off
      warnings.push("Hook card left off: couldn't put you in front of the type.");
      await writeComposition(paths.composition, { ...built.parts, home });
      await run("npx", ["-y", HF, "render", "-q", quality, "-f", "30", "-o", paths.finalRaw], { cwd: paths.composition });
    }
  }
  const normalized = await normalizeLoudness(audio, path.join(projectDir, "acut-normalized.m4a"), { run });
  await run("ffmpeg", ["-v", "error", "-y", "-i", paths.finalRaw, "-i", normalized, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-shortest", "-movflags", "+faststart", paths.final]);
  await fs.rm(paths.finalRaw, { force: true });
  return { final: paths.final, warnings, cuts: built.cuts };
}

// A few seconds of her newest reel in one style, so she sees the font, captions, colors and zoom on real video before a full render.
// The cut is the reel's own; only the look changes. Skips the checks.
export async function renderSample(styleName, { run, quality = "standard", home = reelsHome(), seconds = 5 }) {
  const project = await newestProject(home, ["project.json", "transcript.json", "cut-list.json"]);
  if (!project) throw new Error("Samples play on your own footage. Make one reel first, then try samples.");
  const cl = { ...JSON.parse(await fs.readFile(projectPaths(project).cutlist, "utf8")), style: styleName };
  const edit = await loadEdit(project, { home, cl });
  const segments = sampleWindow(assemble(cl, edit).segments, seconds);
  if (!segments.length) throw new Error(`The newest reel (${path.basename(project)}) has nothing kept in its cut, so there is nothing to sample.`);
  const work = path.join(home, "samples", ".work", styleName);
  const clips = edit.meta.clips.map((c) => ({ id: c.id, file: path.join(project, c.proxy) }));
  await writeComposition(work, { cl, style: edit.style, brand: edit.brand, tl: timeline(segments), clips, home });
  const raw = `${work}.raw.mp4`, out = path.join(home, "samples", `${styleName}.mp4`);
  const audio = await renderAudio(project, segments, { run, crossfadeMs: edit.cfg.thresholds.crossfade_ms, out: `${work}.wav` }); // beside the composition, not in it
  await run("npx", ["-y", HF, "render", "-q", quality, "-f", "30", "-o", raw], { cwd: work });
  const normalized = await normalizeLoudness(audio, `${work}.m4a`, { run });
  await run("ffmpeg", ["-v", "error", "-y", "-i", raw, "-i", normalized, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-shortest", "-movflags", "+faststart", out]);
  await Promise.all([raw, audio, normalized].map((f) => fs.rm(f, { force: true })));
  return { sample: out, composition: work, project, seconds: +segments.reduce((a, s) => a + (s.out - s.in), 0).toFixed(2), pieces: segments.length };
}
