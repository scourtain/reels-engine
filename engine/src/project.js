import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

const VIDEO = /\.(mov|mp4|m4v)$/i;

export function slugify(text) {
  const s = String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return s || "reel";
}

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

// ING-1: when the clip was recorded. The camera's creation_time tag when ffprobe can read it, else the file's modified time.
export async function recordedAt(file, { run } = {}) {
  if (run) {
    const r = await run("ffprobe", ["-v", "error", "-show_entries", "format_tags=creation_time", "-of", "default=nw=1:nk=1", file], { allowFail: true });
    const t = Date.parse((r.stdout || "").trim());
    if (r.code === 0 && Number.isFinite(t)) return t;
  }
  return (await fs.stat(file)).mtimeMs;
}

// Clips come from one of two places: files the member added to the chat (`clips`, copied so their originals stay put),
// or whatever is waiting in the inbox (moved into the reel's folder).
export async function createProject({ home, name, date = new Date().toISOString().slice(0, 10), run, clips = null }) {
  const inbox = path.join(home, "inbox");
  let sources;
  if (clips?.length) {
    sources = [];
    for (const c of clips) {
      const file = path.resolve(c);
      if (!(await exists(file))) throw new Error(`There is no file at ${file}. Add the clip to the chat again.`);
      if (!VIDEO.test(file)) throw new Error(`${path.basename(file)} is not a video this can use. Use .mov, .mp4, or .m4v clips.`);
      sources.push(file);
    }
  } else {
    const names = (await exists(inbox)) ? (await fs.readdir(inbox)).filter((f) => VIDEO.test(f)) : [];
    if (names.length === 0) throw new Error(`No video clips yet. Add 1-4 clips to the chat, or drop them in ${inbox}.`);
    sources = names.map((f) => path.join(inbox, f));
  }
  if (sources.length > 4) throw new Error(`Found ${sources.length} clips. Use 1-4 clips per reel.`);
  const stamped = await Promise.all(sources.map(async (file) => ({ file, t: await recordedAt(file, { run }) })));
  const ordered = stamped.sort((a, b) => a.t - b.t || path.basename(a.file).localeCompare(path.basename(b.file), undefined, { numeric: true })).map((x) => x.file);
  const base = `${date}-${slugify(name)}`;
  let dir = path.join(home, "projects", base);
  for (let n = 2; await exists(dir); n++) dir = path.join(home, "projects", `${base}-${n}`);
  await fs.mkdir(path.join(dir, "source"), { recursive: true });
  const out = [], taken = new Set();
  for (const [i, src] of ordered.entries()) {
    let file = path.basename(src);
    for (let n = 2; taken.has(file.toLowerCase()); n++) file = `${path.parse(src).name}-${n}${path.extname(src)}`; // two clips with the same name from different folders
    taken.add(file.toLowerCase());
    const dest = path.join(dir, "source", file);
    // From the chat: copy (instant and free on a Mac's own disk), never move. From the inbox: move.
    if (clips?.length) await fs.copyFile(src, dest, fsConstants.COPYFILE_FICLONE);
    else await fs.rename(src, dest);
    out.push({ id: `clip-${i + 1}`, file });
  }
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({ name, created: date, clips: out }, null, 2));
  return dir;
}
