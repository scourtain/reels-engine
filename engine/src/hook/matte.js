import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ENGINE_DIR } from "../paths.js";
import { isMac, MAC_ONLY } from "../platform.js";

export const MATTE_SRC = path.join(ENGINE_DIR, "tools", "matte.swift");
export const TOOL_MISSING = "Needs Apple's command line tools. Run /reels-engine:reel-setup.";
const exists = (p) => fs.access(p).then(() => true, () => false);

// The cutout tool, ready to run. It is built once per Mac from the Swift source (a new engine version with a changed source builds again).
// Not having a compiler is a normal answer, not an error: the looks that need the tool are simply unavailable.
export async function matteTool({ run, home, src = MATTE_SRC, plat = process.platform }) {
  if (!isMac(plat)) return { ok: false, bin: null, detail: "only on a Mac for now", fix: "", reason: MAC_ONLY };
  const hash = crypto.createHash("sha1").update(await fs.readFile(src)).digest("hex").slice(0, 10);
  const bin = path.join(home, ".cache", `matte-${hash}`);
  if (await exists(bin)) return { ok: true, bin, detail: "ready" };
  await fs.mkdir(path.dirname(bin), { recursive: true });
  const r = await run("swiftc", ["-O", src, "-o", bin], { allowFail: true });
  if (r.code === 0 && (await exists(bin))) return { ok: true, bin, detail: "ready (built just now)" };
  const detail = r.code === 127 ? "Apple's command line tools are not installed" : `could not be built: ${String(r.stderr).trim().split("\n").at(-1) || "unknown error"}`;
  return { ok: false, bin: null, detail, fix: "xcode-select --install" };
}

// One mask PNG per frame PNG, same names. White = person.
export async function matteFrames(framesDir, outDir, { run, bin }) {
  await run(bin, [framesDir, outDir]);
}

// How much of `box` (1080x1920 pixels) is person in this mask, 0 to 1. scale: the mask's size against the full frame.
export async function coverage(maskFile, box, { run, scale = 1 }) {
  const W = Math.round(1080 * scale), H = Math.round(1920 * scale);
  const x = Math.min(W - 2, Math.max(0, Math.round(box.left * scale))), y = Math.min(H - 2, Math.max(0, Math.round(box.top * scale)));
  const w = Math.max(2, Math.min(W - x, Math.round(box.width * scale))), h = Math.max(2, Math.min(H - y, Math.round(box.height * scale)));
  const out = `${maskFile}.${x}-${y}-${w}-${h}.gray`;
  // one grey byte: the box's average. Written to a file because run() reads stdout as text.
  await run("ffmpeg", ["-v", "error", "-y", "-i", maskFile, "-vf", `crop=${w}:${h}:${x}:${y},scale=1:1:flags=area,format=gray`, "-f", "rawvideo", out]);
  const buf = await fs.readFile(out);
  await fs.rm(out, { force: true });
  return buf[0] / 255;
}
