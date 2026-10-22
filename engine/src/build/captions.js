export function captionChunks(tl, wordsPerLine) {
  const chunks = [];
  for (const piece of tl) {
    const pieceEnd = piece.start + piece.duration;
    for (let i = 0; i < piece.words.length; i += wordsPerLine) {
      const words = piece.words.slice(i, i + wordsPerLine);
      chunks.push({ start: words[0].start, end: words.at(-1).end, limit: pieceEnd, words });
    }
  }
  chunks.forEach((c, i) => {
    const next = chunks[i + 1];
    c.end = Math.max(next && next.start < c.limit ? next.start : c.limit, c.start + 0.05); delete c.limit;
  });
  return chunks;
}

// How caption text is lifted off the video. shadow: the soft dark glow. outline: a solid dark edge all the way round. none: plain text.
// px turns a pixel length on the 1080-wide frame into a CSS length, so the picker page can scale it down to a small preview.
export const TREATMENTS = ["shadow", "outline", "none"];
export function captionShadow(treatment, px = (n) => `${n}px`) {
  if (treatment === "none") return "none";
  if (treatment !== "outline") return `0 ${px(3)} ${px(14)} rgba(0,0,0,.55),0 0 ${px(2)} rgba(0,0,0,.8)`;
  const ring = Array.from({ length: 16 }, (_, i) => `${(Math.cos((i * Math.PI) / 8) * 0.06).toFixed(3)}em ${(Math.sin((i * Math.PI) / 8) * 0.06).toFixed(3)}em 0 #000`);
  return [...ring, `0 ${px(4)} ${px(10)} rgba(0,0,0,.35)`].join(",");
}
