// The hook looks as HTML, CSS and GSAP lines. The render and the screen's preview both call this, so they cannot drift.
// Look values (shadows, tilts, easings) come from the approved test: docs/superpowers/research/2026-10-13-reels-hook-card-spike/.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const f3 = (x) => +x.toFixed(3);
const TILT = [-2, 1.5, -1];
// The 2026-10-20 looks: a shadow soft enough to stay calm, and for white on light walls a thin dark edge.
const SOFT = "0 4px 30px rgba(0,0,0,.28)", EDGE = "0 4px 30px rgba(0,0,0,.3),0 0 3px rgba(0,0,0,.55)";
const out = (end) => `tl.to("#hook",{opacity:0,y:20,duration:0.3,ease:"power2.in"},${end});`;
// Placed looks: every line at its own spot on the frame (the box is only their outline).
const placed = (plan) => plan.lines.map((l, i) => `<span class="l ${l.role}" id="hl${i}" style="position:absolute;left:${l.box.left - plan.box.left}px;top:${l.box.top - plan.box.top}px;width:${l.box.width}px;font-size:${l.size}px">${esc(l.text)}</span>`).join("");

// One span per letter, ids hk0.. in reading order, for the looks that type.
function letters(lines, cls) {
  let n = 0;
  return lines.map((l, i) => `<span class="l ${cls(l, i)}" style="font-size:${l.size}px">${[...l.text].map((ch) => `<span class="ch" id="hk${n++}">${esc(ch)}</span>`).join("")}</span>`).join("");
}
function typing(plan, cursor) {
  const n = plan.type.times.length, step = f3((plan.clear * 0.9) / n), last = `"#hk"+(HT.length-1)`;
  return [
    `const HT=${JSON.stringify(plan.type.times)};`,
    cursor
      ? `HT.forEach((t,i)=>{tl.set("#hk"+i,{opacity:1,boxShadow:"14px 0 0 ${cursor}"},t);if(i)tl.set("#hk"+(i-1),{boxShadow:"none"},t);});\n[0.35,0.7,1.05,1.4].forEach((d,k)=>tl.set(${last},{boxShadow:k%2?"14px 0 0 ${cursor}":"none"},HT[HT.length-1]+d));`
      : `HT.forEach((t,i)=>tl.set("#hk"+i,{opacity:1},t));`,
    // it backspaces away, last letter first
    `HT.forEach((t,i)=>tl.set("#hk"+(HT.length-1-i),{opacity:0${cursor ? ',boxShadow:"none"' : ""}},${plan.end}+i*${step}));`,
  ];
}

const MAKERS = {
  "caption-match": ({ plan, C }) => ({
    css: `#hook{z-index:6;align-items:center;text-align:center;color:${C.text};font-size:${plan.lines[0].size}px;line-height:1.12;text-shadow:0 4px 18px rgba(0,0,0,.6),0 0 3px rgba(0,0,0,.85)}`,
    inner: plan.lines.map((l) => `<span class="l">${esc(l.text)}</span>`).join(""),
    anim: [`tl.fromTo("#hook .l",{opacity:0,y:36},{opacity:1,y:0,duration:0.28,ease:"power3.out",stagger:0.08},0);`, `tl.to("#hook",{opacity:0,y:40,duration:0.3,ease:"power2.in"},${plan.end});`],
  }),
  "label-lines": ({ plan, C }) => ({
    css: `#hook{z-index:6;align-items:center;gap:14px;color:${C.card_text};font-size:${plan.lines[0].size}px;line-height:1.1}\n#hook .l{padding:16px 30px 18px;border-radius:16px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.3)}\n#hook .l:nth-child(even){background:${C.accent}}`,
    inner: plan.lines.map((l, i) => `<span class="l" id="hl${i}">${esc(l.text)}</span>`).join(""),
    anim: [...plan.lines.map((_, i) => `tl.fromTo("#hl${i}",{opacity:0,scale:0.6,rotation:${TILT[i % 3] * 4.5}},{opacity:1,scale:1,rotation:${TILT[i % 3]},duration:0.3,ease:"back.out(2.2)"},${f3(i * 0.16)});`),
      `tl.to("#hook",{opacity:0,y:40,duration:0.3,ease:"power2.in"},${plan.end});`],
  }),
  "big-stack": ({ plan, C, total }) => ({
    css: `#hook-bg{position:absolute;z-index:5;left:0;width:1080px;top:${plan.box.top - 150}px;height:${1920 - (plan.box.top - 150)}px;background:linear-gradient(to bottom,rgba(0,0,0,0),rgba(0,0,0,.62) 45%,rgba(0,0,0,.72))}\n#hook{z-index:6;align-items:center;color:${C.text};text-transform:uppercase;line-height:1;letter-spacing:-1px;text-shadow:0 6px 24px rgba(0,0,0,.5)}\n#hook .mid{letter-spacing:3px;margin:16px 0 14px}\n#hook .accent{color:${C.accent}}`,
    before: `<div id="hook-bg" class="clip" data-start="0" data-duration="${total}"></div>`,
    inner: plan.lines.map((l) => `<span class="l ${l.role}" style="font-size:${l.size}px">${esc(l.text)}</span>`).join(""),
    anim: [`tl.fromTo("#hook-bg",{opacity:0},{opacity:1,duration:0.3},0);`, `tl.fromTo("#hook .l",{opacity:0,scale:1.5,y:-30},{opacity:1,scale:1,y:0,duration:0.22,ease:"power4.out",stagger:0.14},0);`,
      `tl.to("#hook-bg",{opacity:0,duration:0.3},${plan.end});`, `tl.to("#hook",{opacity:0,y:40,duration:0.3,ease:"power2.in"},${plan.end});`],
  }),
  typewriter: ({ plan, C, total }) => ({
    css: `#hook-bg{position:absolute;z-index:5;inset:0;background:rgba(0,0,0,.3)}\n#hook{z-index:6;justify-content:flex-start;color:${C.text};line-height:1.1;text-shadow:0 5px 22px rgba(0,0,0,.55),0 0 3px rgba(0,0,0,.7)}\n#hook .accent{color:${C.accent}}`,
    before: `<div id="hook-bg" class="clip" data-start="0" data-duration="${total}"></div>`,
    inner: letters(plan.lines, (l) => l.role),
    anim: [`tl.fromTo("#hook-bg",{opacity:0},{opacity:1,duration:0.25},0);`, `tl.to("#hook-bg",{opacity:0,duration:${plan.clear}},${plan.end});`, ...typing(plan, C.accent)],
  }),
  "behind-head": ({ plan, C }) => ({
    css: `#hook{z-index:4;justify-content:flex-start;align-items:center;text-align:center;color:${C.text};text-shadow:0 4px 26px rgba(0,0,0,.35)}\n#hook .kicker{line-height:1.2;color:${C.accent};letter-spacing:1px}\n#hook .giant{line-height:1}`,
    inner: letters(plan.lines, (l) => l.role),
    anim: typing(plan, null),
  }),
  "big-type-behind": ({ plan, C }) => ({
    css: `#hook{z-index:4;justify-content:flex-start;align-items:center;text-align:center;color:${C.text};line-height:1.02;text-shadow:0 4px 26px rgba(0,0,0,.35)}`,
    inner: letters(plan.lines, (l) => l.role),
    anim: typing(plan, null),
  }),
  "poster-stack": ({ plan, C }) => ({
    css: `#hook{z-index:6;justify-content:flex-start;color:${C.card};text-transform:uppercase;line-height:0.92;letter-spacing:-1px;text-shadow:${SOFT}}`,
    inner: letters(plan.lines, () => "line"),
    anim: [`const HT=${JSON.stringify(plan.type.times)};`, `HT.forEach((t,i)=>tl.set("#hk"+i,{opacity:1},t));`, out(plan.end)],
  }),
  "split-face": ({ plan, C }) => {
    const a = plan.lines.map((l, i) => [l, i]).filter(([l]) => l.role === "a").map(([, i]) => `#hl${i}`).join(","), b = plan.lines.map((l, i) => [l, i]).filter(([l]) => l.role === "b").map(([, i]) => `#hl${i}`).join(",");
    return {
      css: `#hook{z-index:6;display:block;color:${C.card};line-height:1.02;text-shadow:${SOFT}}\n#hook .b{text-align:right}`,
      inner: placed(plan),
      // one word draws only the first group, so there may be no second one to bring in
      anim: [`tl.fromTo("${a}",{opacity:0,y:24},{opacity:1,y:0,duration:0.6,ease:"power2.out"},0);`, ...(b ? [`tl.fromTo("${b}",{opacity:0,y:24},{opacity:1,y:0,duration:0.6,ease:"power2.out"},0.35);`] : []),
        `tl.to("#hook",{opacity:0,duration:${plan.clear},ease:"power1.in"},${plan.end});`],
    };
  },
  "highlight-words": ({ plan, C }) => {
    let n = 0;
    const inner = plan.lines.map((l) => `<span class="l">${l.text.split(" ").map((w) => `<span class="w" id="hw${n++}">${esc(w)}</span>`).join("")}</span>`).join("");
    return {
      css: `#hook{z-index:6;align-items:center;gap:12px;color:${C.card_text};font-size:${plan.lines[0].size}px;line-height:1.1}\n#hook .l{display:flex;gap:12px;justify-content:center}\n#hook .w{display:inline-block;padding:10px 22px;border-radius:6px;background:${C.accent}}`,
      inner,
      anim: [`tl.fromTo("#hook .w",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.22,ease:"back.out(1.6)",stagger:0.08},0);`, `tl.to("#hook",{opacity:0,duration:0.3,ease:"power2.in"},${plan.end});`],
    };
  },
  "size-mix": ({ plan, C }) => ({
    css: `#hook{z-index:6;justify-content:flex-start;color:${C.text};text-shadow:${EDGE}}\n#hook .lead{line-height:1.15}\n#hook .big{line-height:0.98;letter-spacing:-1px}`,
    inner: plan.lines.map((l) => `<span class="l ${l.role}" style="font-size:${l.size}px">${esc(l.text)}</span>`).join(""),
    anim: [`tl.fromTo("#hook .lead",{opacity:0,y:12},{opacity:1,y:0,duration:0.3,ease:"power2.out"},0);`,
      `tl.fromTo("#hook .big",{opacity:0,scale:1.15,transformOrigin:"0% 50%"},{opacity:1,scale:1,duration:0.28,ease:"power3.out",stagger:0.1},0.25);`, out(plan.end)],
  }),
  "framed-thin": ({ plan, C }) => ({
    css: `#hook{z-index:6;display:block;color:${C.text};line-height:1.1;text-shadow:${SOFT}}\n#hook .l{text-align:center}`,
    inner: placed(plan),
    anim: [`tl.fromTo("#hook .top",{opacity:0},{opacity:1,duration:0.6,ease:"power1.out"},0);`, `tl.fromTo("#hook .low",{opacity:0},{opacity:1,duration:0.6,ease:"power1.out"},0.3);`,
      `tl.to("#hook",{opacity:0,duration:${plan.clear},ease:"power1.in"},${plan.end});`],
  }),
};

// plan: an available plan from planHook. colors: the brand kit's. font: { family, weight } of the caption font, or null.
// hookFontSrc: where the look's own font file is, for a look that sets its own type (plan.font).
export function hookMarkup(plan, { colors, font = null, hookFontSrc = null }) {
  const b = plan.box, total = f3(plan.end + plan.clear);
  const own = plan.font && hookFontSrc ? { ...plan.font, face: `@font-face{font-family:'${plan.font.family}';src:url('${esc(hookFontSrc)}');font-weight:100 900;font-style:normal;font-display:block}\n` } : null;
  if (own) font = own;
  const fam = `${font ? `'${font.family}',` : ""}system-ui,sans-serif`;
  const m = MAKERS[plan.preset]({ plan, C: colors, total });
  const base = `#hook{position:absolute;left:${b.left}px;width:${b.width}px;top:${b.top}px;height:${b.height}px;display:flex;flex-direction:column;justify-content:center;font-family:${fam};font-weight:${font?.weight ?? 700}}\n#hook .l{display:block;white-space:nowrap}\n#hook .ch{opacity:0;white-space:pre}`;
  return { css: `${own?.face ?? ""}${base}\n${m.css}`, html: `${m.before ?? ""}<div id="hook" class="clip" data-start="0" data-duration="${total}">${m.inner}</div>`, anim: m.anim };
}

// The screen's preview: a clear 1080x1920 page that plays the hook on a loop. For a behind look, the cut-out person is drawn over the type.
// fontSrc / frameSrc / matteSrc are URLs on the review helper. matteSrc null = nothing drawn on top.
export function hookPreviewHtml(plan, { colors, font, fontSrc, hookFontSrc = null, frameSrc, matteSrc = null }) {
  const { css, html, anim } = hookMarkup(plan, { colors, font, hookFontSrc });
  const person = matteSrc ? `<img id="person" alt="" src="${esc(frameSrc)}" style="position:absolute;inset:0;width:1080px;height:1920px;object-fit:cover;z-index:5;-webkit-mask-image:url('${esc(matteSrc)}');mask-image:url('${esc(matteSrc)}');-webkit-mask-size:100% 100%;mask-size:100% 100%;mask-mode:luminance">` : "";
  return `<!doctype html><html><head><meta charset="UTF-8">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face{font-family:'${font.family}';src:url('${esc(fontSrc)}');font-weight:100 900;font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:transparent}
#root{position:relative;width:1080px;height:1920px}
${css}
</style></head><body><div id="root">${html}${person}</div>
<script>
const tl = gsap.timeline({ repeat:-1, repeatDelay:1.2 });
${anim.join("\n")}
tl.set({}, {}, ${f3(plan.end + plan.clear)});
addEventListener("message", (e) => { if (e.data === "replay") tl.restart(); });
</script></body></html>`;
}
