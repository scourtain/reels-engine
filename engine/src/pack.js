import fs from "node:fs/promises";
import path from "node:path";
import { reelsHome } from "./paths.js";
import { acutFor } from "./edit.js";
import { slugify } from "./project.js";
import { videoOut } from "./platform.js";

export function packNames(lines) {
  return lines.map((l, i) => {
    const slug = slugify(l.text.split(/\s+/).slice(0, 4).join(" "));
    return `${String(i + 1).padStart(2, "0")}-${i === 0 ? "hook-" : ""}${slug}.mp4`;
  });
}

export async function makeClipPack(projectDir, { run, home = reelsHome(), plat = process.platform }) {
  const { paths, cl, meta, segments: ps } = await acutFor(projectDir, { home });
  const proxy = Object.fromEntries(meta.clips.map((c) => [c.id, path.join(projectDir, c.proxy)]));
  const kept = cl.lines.filter((l) => l.keep && ps.some((p) => p.lineId === l.id));
  const names = packNames(kept);
  await fs.rm(paths.segments, { recursive: true, force: true });
  await fs.mkdir(paths.segments, { recursive: true });
  const files = [];
  for (const [i, line] of kept.entries()) {
    const mine = ps.filter((p) => p.lineId === line.id);
    const inputs = mine.flatMap((p) => ["-ss", String(p.in), "-to", String(p.out), "-i", proxy[p.source]]);
    const chains = mine.map((p, k) => {
      const d = p.out - p.in;
      return `[${k}:v]setpts=PTS-STARTPTS[v${k}];[${k}:a]asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=${(d - 0.03).toFixed(3)}:d=0.03[a${k}]`;
    });
    const concat = `${mine.map((_, k) => `[v${k}][a${k}]`).join("")}concat=n=${mine.length}:v=1:a=1[v][a]`;
    const out = path.join(paths.segments, names[i]);
    await run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", `${chains.join(";")};${concat}`, "-map", "[v]", "-map", "[a]", ...videoOut("8M", plat), "-c:a", "aac", "-b:a", "192k", out]);
    files.push(out);
  }
  return files;
}
