// holdUntil: pieces that start before this many seconds play without zoom (type behind the head needs the head to hold still).
export function zoomPlan(tl, zoom, holdUntil = 0) {
  return tl.map((p, index) => {
    if (p.start < holdUntil) return { index, scale: 1, motion: "cut" };
    if (zoom.motion === "push") return { index, scale: zoom.amount, motion: "push" };
    const period = zoom.every === 1 ? 2 : zoom.every; // every:1 = alternate, so each jump cut changes framing
    return { index, scale: index % period === period - 1 ? zoom.amount : 1, motion: zoom.motion };
  });
}
