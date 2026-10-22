export function parseSilences(stderr, duration = Infinity) {
  const out = [];
  let open = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) open = Math.max(0, Number(s[1]));
    if (e && open !== null) { out.push({ start: open, end: Number(e[1]) }); open = null; }
  }
  if (open !== null && Number.isFinite(duration)) out.push({ start: open, end: duration });
  return out;
}

export async function detectSilences(file, { run, noise = "-35dB", min = 0.25, duration } = {}) {
  const r = await run("ffmpeg", ["-hide_banner", "-i", file, "-af", `silencedetect=noise=${noise}:d=${min}`, "-f", "null", "-"]);
  return parseSilences(r.stderr, duration);
}
