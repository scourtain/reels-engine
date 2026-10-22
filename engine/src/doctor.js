import { HF, reelsHome } from "./paths.js";
import { isMac, isWindows } from "./platform.js";
import { matteTool } from "./hook/matte.js";

export async function doctor({ run, home = reelsHome(), plat = process.platform }) {
  const fix = (mac, win) => (isWindows(plat) ? win : mac);
  const checks = [];
  const node = await run("node", ["--version"], { allowFail: true });
  const major = Number((node.stdout.match(/v(\d+)/) || [])[1] || 0);
  checks.push({ name: "node", ok: major >= 22, detail: node.stdout.trim() || "missing", fix: fix("brew install node", "winget install --id OpenJS.NodeJS.LTS -e") });
  for (const tool of ["ffmpeg", "ffprobe"]) {
    const r = await run(tool, ["-version"], { allowFail: true });
    checks.push({ name: tool, ok: r.code === 0, detail: r.code === 0 ? r.stdout.split("\n")[0] : "missing", fix: fix("brew install ffmpeg", "winget install --id Gyan.FFmpeg -e") });
  }
  const wh = await run("whisper-cli", ["--help"], { allowFail: true });
  checks.push({ name: "whisper-cli", ok: wh.code !== 127, detail: wh.code !== 127 ? "installed" : "missing", fix: fix("brew install whisper-cpp", "Run /reels-engine:reel-setup (it puts whisper in your Reels folder)") });
  const hf = await run("npx", ["-y", HF, "--version"], { allowFail: true });
  checks.push({ name: "hyperframes", ok: hf.code === 0, detail: hf.code === 0 ? HF : "not reachable", fix: `npx -y ${HF} browser ensure` });
  // Optional: only the two hook looks that sit behind the head need it. A Mac without it still makes reels.
  const cut = await matteTool({ run, home, plat }).catch(() => ({ ok: false, detail: "couldn't be checked", fix: "" }));
  checks.push({ name: "person cutout", ok: cut.ok, optional: true, detail: cut.ok || !isMac(plat) ? cut.detail : `${cut.detail} (only needed for hook type behind your head)`, fix: cut.fix ?? "" });
  return { ok: checks.every((c) => c.ok || c.optional), checks };
}
