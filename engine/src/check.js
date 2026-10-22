import fs from "node:fs/promises";
import { projectPaths } from "./paths.js";
import { probe } from "./proxy.js";
import { loadCutList } from "./cutlist.js";
import { ZONES } from "./build/placement.js";

export function parseLoudness(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const i = summary.match(/I:\s*(-?[\d.]+)\s*LUFS/);
  const p = summary.match(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/);
  return { integrated: i ? Number(i[1]) : null, truePeak: p ? Number(p[1]) : null };
}

// Text under what Instagram always covers is an issue (placement makes it impossible; this proves it).
// Text in the band it sometimes covers is the member's call: one note for the reel, naming the spot.
export function checkLayout(layout) {
  const issues = [], band = new Set();
  for (const b of layout.boxes) {
    const at = `${b.kind} at ${b.start.toFixed(2)}s`;
    if (b.kind === "hook") {
      // Hooks have their own areas (hook/layout.js). Type behind the head may use the strip above the head; nothing reaches Instagram's buttons.
      const right = b.left + b.width, bottom = b.top + b.height;
      if (b.layer === "behind") {
        if (b.top < 84 || b.left < ZONES.left || right > 1080 - ZONES.left) issues.push(`${at} is past the edge of the frame`);
        if (bottom > 700) issues.push(`${at} reaches down to Instagram's buttons`);
      } else {
        if (b.top < ZONES.top) issues.push(`${at} is in the top area Instagram always covers`);
        if (bottom > ZONES.always) issues.push(`${at} is in the bottom area Instagram always covers`);
        if (b.left < 96) issues.push(`${at} is past the left edge`);
        if (right > ZONES.right) issues.push(`${at} is under Instagram's buttons on the right`);
      }
      continue;
    }
    if (b.top < ZONES.top) issues.push(`${at} is in the top area Instagram always covers`);
    if (b.top + b.height > ZONES.always) issues.push(`${at} is in the bottom area Instagram always covers`);
    else if (b.top + b.height > ZONES.sometimes) band.add(b.spot || "captions");
    if (b.left < ZONES.left) issues.push(`${at} is past the left edge`);
    if (b.left + b.width > ZONES.right) issues.push(`${at} is under Instagram's buttons on the right`);
  }
  const warnings = [...band].map((spot) => `captions sit low (${spot}): a long post caption can cover them on some phones`);
  return { issues, warnings };
}

export async function checkProject(projectDir, { run }) {
  const paths = projectPaths(projectDir);
  const layout = JSON.parse(await fs.readFile(paths.layout, "utf8"));
  const cl = await loadCutList(paths.cutlist);
  const { issues, warnings } = checkLayout(layout);
  const info = await probe(paths.final, { run });
  if (info.width !== 1080 || info.height !== 1920) issues.push(`final is ${info.width}x${info.height}, expected 1080x1920`);
  if (Math.abs(info.duration - layout.duration) > 0.2) issues.push(`final is ${info.duration.toFixed(2)}s but the composition is ${layout.duration}s`);
  if (info.duration > cl.target_seconds * 1.25) warnings.push(`reel is ${Math.round(info.duration)}s, target was ${cl.target_seconds}s`);
  const r = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", paths.final, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const lufs = parseLoudness(r.stderr);
  if (lufs.integrated === null || Math.abs(lufs.integrated + 14) > 1.5) issues.push(`loudness is ${lufs.integrated} LUFS, target -14`);
  if (lufs.truePeak !== null && lufs.truePeak > -0.5) issues.push(`true peak is ${lufs.truePeak} dBFS, should stay under -1`);
  const report = { ok: issues.length === 0, issues, warnings, seconds: +info.duration.toFixed(2), lufs };
  await fs.writeFile(paths.checkReport, JSON.stringify(report, null, 2));
  return report;
}
