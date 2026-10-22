import fs from "node:fs/promises";
import path from "node:path";
import { videoIn, videoOut } from "./platform.js";

export async function probe(file, { run }) {
  const r = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", file]);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === "video") || {};
  const [n, d] = String(v.r_frame_rate || "0/1").split("/").map(Number);
  return { width: v.width, height: v.height, fps: Math.round(n / (d || 1)), duration: Number(j.format.duration), hasAudio: j.streams.some((s) => s.codec_type === "audio") };
}

export function proxyFilter(w = 1080, h = 1920) {
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,format=yuv420p`;
}

export async function makeProxies(projectDir, { run, plat = process.platform }) {
  const meta = JSON.parse(await fs.readFile(path.join(projectDir, "project.json"), "utf8"));
  await fs.mkdir(path.join(projectDir, "proxies"), { recursive: true });
  const out = [];
  let offset = 0;
  for (const clip of meta.clips) {
    const src = path.join(projectDir, "source", clip.file);
    const info = await probe(src, { run });
    if (!info.hasAudio) throw new Error(`${clip.file} has no audio track. Talking-head clips need sound.`);
    const rel = `proxies/${clip.id}.mp4`;
    const have = await fs.access(path.join(projectDir, rel)).then(() => true, () => false);
    if (!have) await run("ffmpeg", ["-v", "error", "-y", ...videoIn(plat), "-i", src,
      "-map", "0:v:0", "-map", "0:a:0", "-vf", proxyFilter(),
      ...videoOut("8M", plat), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "1",
      path.join(projectDir, rel)]);
    const p = await probe(path.join(projectDir, rel), { run });
    const entry = { ...clip, proxy: rel, duration: p.duration, offset_ms: Math.round(offset * 1000), source_fps: info.fps, source_width: info.width, source_height: info.height };
    offset += p.duration;
    if (info.width > info.height) entry.warning = `${clip.file} is landscape, so it was center-cropped to vertical.`;
    else if (info.width === info.height) entry.warning = `${clip.file} is square, so it was center-cropped to vertical.`;
    out.push(entry);
  }
  meta.clips = out;
  await fs.writeFile(path.join(projectDir, "project.json"), JSON.stringify(meta, null, 2));
  return out;
}
