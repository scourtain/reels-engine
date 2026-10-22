import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const HOP = 160; // 10 ms at 16 kHz

// Loudness (dBFS RMS) for every 10 ms of a clip's audio. This is the speech/silence map (ING-4).
export async function computeEnvelope(file, { run }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reels-env-"));
  const raw = path.join(dir, "a.raw");
  await run("ffmpeg", ["-v", "error", "-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", raw]);
  const buf = await fs.readFile(raw);
  await fs.rm(dir, { recursive: true, force: true });
  const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
  const env = [];
  for (let i = 0; i + HOP <= samples.length; i += HOP) {
    let sum = 0;
    for (let k = i; k < i + HOP; k++) sum += samples[k] * samples[k];
    const rms = Math.sqrt(sum / HOP) / 32768;
    env.push(Math.round(Math.max(-100, 20 * Math.log10(rms || 1e-5)) * 10) / 10);
  }
  return env;
}

export function silenceThreshold(env, cfg) {
  const sorted = [...env].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -100;
  return Math.min(cfg.silence_ceiling_db, Math.max(cfg.silence_floor_db, floor + cfg.silence_margin_db));
}

export function silencesFromEnvelope(env, thresholdDb, minMs = 60) {
  const out = [];
  let start = null;
  for (let i = 0; i <= env.length; i++) {
    const quiet = i < env.length && env[i] < thresholdDb;
    if (quiet && start === null) start = i;
    if (!quiet && start !== null) {
      if ((i - start) * 10 >= minMs) out.push({ start: start / 100, end: i / 100 });
      start = null;
    }
  }
  return out;
}

export function isSilent(env, from, to, thresholdDb) {
  const a = Math.max(0, Math.floor(from * 100)), b = Math.min(env.length, Math.ceil(to * 100));
  if (b <= a) return false;
  for (let i = a; i < b; i++) if (env[i] >= thresholdDb) return false;
  return true;
}

const levelAt = (env, t) => {
  const i = Math.round(t * 100);
  const a = env[Math.max(0, Math.min(env.length - 1, i - 1))], b = env[Math.max(0, Math.min(env.length - 1, i))];
  return Math.max(a, b);
};

// CUT-1 + CUT-5: the quietest frame boundary within the snap window, never outside [lo, hi].
// Anything under `silentBelow` is simply "silent": room tone is never flat, and chasing its quietest ripple would drag cuts around.
export function quietestFrame(env, t, { windowMs, fps, lo = 0, hi = Infinity, silentBelow = -Infinity }) {
  const from = Math.max(lo, t - windowMs / 1000), to = Math.min(hi, t + windowMs / 1000);
  let best = null;
  for (let k = Math.ceil(from * fps - 1e-9); k / fps <= to + 1e-9; k++) {
    const ft = k / fps, level = Math.max(levelAt(env, ft), silentBelow);
    if (!best || level < best.level - 0.05 || (Math.abs(level - best.level) <= 0.05 && Math.abs(ft - t) < Math.abs(best.t - t))) best = { t: ft, level };
  }
  if (best) return best.t;
  const clampT = Math.min(Math.max(t, lo), Number.isFinite(hi) ? hi : t);
  const k = clampT >= t ? Math.ceil(clampT * fps - 1e-9) : Math.floor(clampT * fps + 1e-9);
  return k / fps;
}
