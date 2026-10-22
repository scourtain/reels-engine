import fs from "node:fs/promises";
import path from "node:path";
import { reelsHome } from "../paths.js";
import { acutFor } from "../edit.js";
import { timeline } from "../cutlist.js";
import { fcpxml } from "./fcpxml.js";
import { transcriptTxt, transcriptSrt, report, markersCsv } from "./text.js";
import { renderPreview } from "./preview.js";

// Stage 12: everything an editor would hand off, written to <project>/exports/.
export async function exportProject(projectDir, { run, home = reelsHome(), preview = false }) {
  const { cl, meta, cfg, segments, cuts, seconds } = await acutFor(projectDir, { home });
  const dir = path.join(projectDir, "exports");
  await fs.mkdir(dir, { recursive: true });
  const clipOf = Object.fromEntries(meta.clips.map((c) => [c.id, c]));
  const tl = timeline(segments);
  const acut = {
    project: meta.name, style: cl.style, seconds, brief: cl.brief,
    segments: segments.map((s, order) => ({ id: `s_${String(order + 1).padStart(3, "0")}`, order, line_id: s.lineId, source: s.source, file: clipOf[s.source].file,
      source_start_ms: Math.round(s.in * 1000), source_end_ms: Math.round(s.out * 1000), timeline_start_ms: Math.round(s.in * 1000) + (clipOf[s.source].offset_ms || 0) })),
    cuts, decisions: cl.decisions, take_groups: cl.take_groups,
  };
  const files = {
    "acut.json": JSON.stringify(acut, null, 2),
    "acut.fcpxml": fcpxml({ name: meta.name || "Reel", segments, clips: meta.clips, sourceDir: path.join(projectDir, "source") }),
    "transcript.txt": transcriptTxt(tl),
    "transcript.srt": transcriptSrt(tl),
    "report.json": JSON.stringify(report({ cl, clips: meta.clips, seconds, cuts }), null, 2),
    "markers.csv": markersCsv({ cuts }),
  };
  for (const [name, body] of Object.entries(files)) await fs.writeFile(path.join(dir, name), body);
  if (preview) await renderPreview(projectDir, segments, { run, crossfadeMs: cfg.thresholds.crossfade_ms, out: path.join(dir, "acut-preview.mp4") });
  return { dir, seconds, files: [...Object.keys(files), ...(preview ? ["acut-preview.mp4"] : [])] };
}
