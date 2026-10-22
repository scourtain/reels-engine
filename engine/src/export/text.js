const stamp = (t) => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
const textOf = (piece) => piece.words.map((w) => w.w).join(" ");

// EXP-3: what is actually said in the A-cut, one line per kept utterance.
export function transcriptTxt(tl) {
  const lines = [];
  for (const p of tl) {
    if (lines.at(-1)?.id === p.lineId) lines.at(-1).text += " " + textOf(p);
    else lines.push({ id: p.lineId, text: textOf(p) });
  }
  return lines.map((l) => l.text + "\n").join("");
}

// A caption handoff: one cue per piece, on the A-cut timeline.
export function transcriptSrt(tl) {
  return tl.map((p, i) => `${i + 1}\n${stamp(p.start)} --> ${stamp(p.start + p.duration)}\n${textOf(p)}\n`).join("\n");
}

// EXP-4
export function report({ cl, clips, seconds, cuts }) {
  const decisions = {};
  for (const d of cl.decisions || []) {
    decisions[d.category] ||= { accepted: 0, rejected: 0, proposed: 0 };
    decisions[d.category][d.status]++;
  }
  const lines_cut = {};
  for (const l of cl.lines) if (!l.keep) { const c = l.cut?.category || "content"; lines_cut[c] = (lines_cut[c] || 0) + 1; }
  return {
    raw_seconds: +clips.reduce((a, c) => a + c.duration, 0).toFixed(2), acut_seconds: +seconds.toFixed(2),
    lines_kept: cl.lines.filter((l) => l.keep).length, lines_cut, decisions,
    cuts: cuts.length, flagged_cuts: cuts.filter((c) => c.flags?.length).length,
  };
}

export function markersCsv({ cuts }) {
  const rows = ["a_cut_ms,type,note", "0,hook,", ...cuts.map((c) => `${c.a_cut_ms},cut,${[c.type, ...(c.flags || [])].join(" ")}`)];
  return rows.join("\n") + "\n";
}
