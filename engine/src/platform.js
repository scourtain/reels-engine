import fs from "node:fs/promises";
import path from "node:path";

// Everything that differs between a Mac and a Windows PC lives here. On a Mac every function returns exactly what 0.4.0 used.
export const MAC_ONLY = "Only on a Mac for now.";
export const isMac = (plat = process.platform) => plat === "darwin";
export const isWindows = (plat = process.platform) => plat === "win32";

// The Reels folder when REELS_HOME is not set: ~/Movies/Reels on a Mac, ~/Videos/Reels on Windows.
export const homeFolders = (plat = process.platform) => (isWindows(plat) ? ["Videos", "Reels"] : ["Movies", "Reels"]);

// Folders a fresh install puts tools in, which the app that launched us may not have on its path yet.
export function extraToolDirs({ plat = process.platform, home, env = process.env } = {}) {
  if (!isWindows(plat)) return ["/opt/homebrew/bin", "/usr/local/bin"];
  const w = path.win32;
  return [
    env.LOCALAPPDATA && w.join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links"),
    home && w.join(home, "tools", "whisper"),
    home && w.join(home, "tools", "whisper", "Release"),
  ].filter(Boolean);
}

export function toolPath(current = "", { plat = process.platform, home, env = process.env } = {}) {
  const sep = isWindows(plat) ? ";" : ":";
  return [...new Set([...current.split(sep).filter(Boolean), ...extraToolDirs({ plat, home, env })])].join(sep);
}

// The environment for a tool the engine starts. Windows usually spells the variable "Path"; setting "PATH" beside it would give the tool two.
export function toolEnv(extra = {}, { plat = process.platform, home, env = process.env } = {}) {
  const key = isWindows(plat) ? (Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "Path") : "PATH";
  return { ...env, [key]: toolPath(env[key] || "", { plat, home, env }), ...extra };
}

// On Windows `npx` is a .cmd script, which Node will not start without a shell. Run npm's own npx script with this Node instead.
export function launchSpec(cmd, args, { plat = process.platform, execPath = process.execPath } = {}) {
  if (!isWindows(plat) || cmd !== "npx") return { cmd, args };
  const w = path.win32;
  return { cmd: execPath, args: [w.join(w.dirname(execPath), "node_modules", "npm", "bin", "npx-cli.js"), ...args] };
}

// Opens a file or a web page with whatever the computer normally uses for it.
export function openSpec(target, plat = process.platform) {
  if (isMac(plat)) return { cmd: "open", args: [target] };
  if (isWindows(plat)) return { cmd: "explorer.exe", args: [target] };
  return { cmd: "xdg-open", args: [target] };
}

// A Mac uses Apple's hardware video encoder. Everything else uses the standard one at the same bitrate.
export const videoIn = (plat = process.platform) => (isMac(plat) ? ["-hwaccel", "videotoolbox"] : []);
export const videoOut = (bitrate, plat = process.platform) => (isMac(plat)
  ? ["-c:v", "h264_videotoolbox", "-b:v", bitrate]
  : ["-c:v", "libx264", "-preset", "veryfast", "-b:v", bitrate, "-pix_fmt", "yuv420p"]);

// Puts a clip into a composition's assets folder. A Mac makes the same relative symlink 0.4.0 made.
// Windows refuses symlinks without admin rights, so off a Mac it makes a hard link, or a plain copy when that is refused too.
const COPY_INSTEAD = new Set(["EPERM", "EXDEV", "ENOTSUP", "EACCES"]);
export async function linkFile(target, linkPath, { plat = process.platform, fsImpl = fs } = {}) {
  if (isMac(plat)) return fsImpl.symlink(path.relative(path.dirname(linkPath), target), linkPath);
  try { await fsImpl.link(target, linkPath); }
  catch (e) { if (!COPY_INSTEAD.has(e.code)) throw e; await fsImpl.copyFile(target, linkPath); }
}
