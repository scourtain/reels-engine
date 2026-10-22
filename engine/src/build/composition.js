import fs from "node:fs/promises";
import path from "node:path";
import { HF, projectPaths, reelsHome } from "../paths.js";
import { timeline } from "../cutlist.js";
import { acutFor } from "../edit.js";
import { captionChunks, captionShadow } from "./captions.js";
import { placeCaption, fitSize } from "./placement.js";
import { zoomPlan } from "./zoom.js";
import { resolveFont, fontFace, findFont, FONTS_DIR } from "../fonts.js";
import { hookMarkup } from "../hook/markup.js";
import { resolveHook } from "../hook/resolve.js";
import { linkFile } from "../platform.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const f3 = (x) => +x.toFixed(3);
const caseOf = (text, mode) => (mode === "upper" ? text.toUpperCase() : text);

// font: { family, weight, range, file, src } from resolveFont, with src = where the page loads the file from. Without it captions fall back to the system sans.
// hookFontSrc: where the hook look's own font file is, for a look that sets its own type.
export function renderHtml({ cl, style, brand, tl, clipsSrc, font = null, hook = null, hookLayer = true, until = null, hookFontSrc = null }) {
  const C = brand.colors, cap = style.captions;
  const textColor = cap.color ?? C.text, hiColor = cap.highlight_color ?? C.accent;
  const full = f3(tl.length ? tl.at(-1).start + tl.at(-1).duration : 0), duration = until == null ? full : Math.min(until, full);
  const boxes = [], els = [], anim = [];
  // How long the hook owns the opening: until it has cleared.
  const hold = hook ? f3(hook.end + hook.clear) : 0;
  const upTo = (start, length) => f3(Math.min(length, duration - start));   // nothing runs past the end

  // video pieces + zoom
  const zooms = zoomPlan(tl, style.zoom, hook?.zoomWait ? hold : 0);
  tl.forEach((p, i) => {
    if (p.start >= duration) return;
    const z = zooms[i], len = upTo(p.start, p.duration);
    els.push(`<video class="seg clip" id="v${i}" src="${esc(clipsSrc[p.source])}" data-start="${p.start}" data-duration="${len}" data-media-start="${p.in}" muted></video>`);
    if (z.motion === "push") anim.push(`tl.fromTo("#v${i}",{scale:1},{scale:${z.scale},duration:${len},ease:"none"},${p.start});`);
    else if (z.scale !== 1) anim.push(z.motion === "snap" ? `tl.fromTo("#v${i}",{scale:${f3(1 + (z.scale - 1) * 0.6)}},{scale:${z.scale},duration:0.12,ease:"power2.out"},${p.start});` : `tl.set("#v${i}",{scale:${z.scale}},${p.start});`);
  });

  // captions
  // The reel's own spot beats the style's. A beside-head spot with no room on this clip comes back as the above-head box.
  const place = placeCaption({ position: cl.caption_position ?? cap.position, faceBox: cl.face_box, size: cap.size, mode: cap.mode });
  const box = { top: place.top, height: place.height, left: place.left, width: place.width };
  captionChunks(tl, place.oneWord ? 1 : cap.words_per_line).forEach((c, i) => {
    if (c.start >= duration) return;
    if (hook?.captionsWait && c.start < hold) return;   // the hook is sitting where captions go: they pick up once it clears
    // beside the head: one word, sized to the strip
    const fit = place.oneWord ? fitSize(c.words[0].w, { width: box.width, size: cap.size, advance: font?.advance, upper: cap.case === "upper" }) : cap.size;
    const sized = fit !== cap.size ? ` style="font-size:${fit}px"` : "";
    const words = c.words.map((w, k) => `<span class="w" id="c${i}w${k}">${esc(caseOf(w.w, cap.case))}</span>`).join(" ");
    els.push(`<div class="cap clip" id="c${i}"${sized} data-start="${f3(c.start)}" data-duration="${upTo(c.start, c.end - c.start)}">${words}</div>`);
    boxes.push({ kind: "caption", spot: place.used, start: c.start, end: c.end, ...box });
    if (cap.highlight === "pop") anim.push(`tl.fromTo("#c${i}",{scale:0.8},{scale:1,duration:0.1,ease:"back.out(3)"},${f3(c.start)});`);
    c.words.forEach((w, k) => {
      if (cap.highlight === "color" || cap.highlight === "pop") anim.push(`tl.set("#c${i}w${k}",{color:"${hiColor}"},${f3(w.start)});tl.set("#c${i}w${k}",{color:"${textColor}"},${f3(Math.min(w.end, c.end))});`);
      if (cap.highlight === "accent-italic" && k === c.words.length - 1) anim.push(`tl.set("#c${i}w${k}",{color:"${hiColor}",fontStyle:"italic"},${f3(w.start)});`);
    });
  });

  // the hook card: drawn after the captions so its elements are last in the page; its z-index decides what it sits over
  let hookCss = "";
  if (hook) {
    boxes.push({ kind: "hook", layer: hook.layer, start: 0, end: hold, ...hook.box });
    if (hookLayer) {
      const m = hookMarkup(hook, { colors: C, font, hookFontSrc });
      hookCss = m.css; els.push(m.html); anim.push(...m.anim);
    }
  }

  const html = `<!doctype html>
<html lang="en" data-resolution="portrait">
<head>
<meta charset="UTF-8" /><meta name="viewport" content="width=1080, height=1920" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
${font ? fontFace(font, font.src) : ""}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#000}
#root{width:100%;height:100%;position:relative;font-family:system-ui,sans-serif}
.seg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 40%}
.cap{position:absolute;z-index:5;left:${box.left}px;width:${box.width}px;top:${box.top}px;height:${box.height}px;display:flex;flex-wrap:wrap;align-content:center;justify-content:center;gap:0 .28em;text-align:center;white-space:${place.oneWord ? "nowrap" : "normal"};
  font-family:${font ? `'${font.family}',` : ""}system-ui,sans-serif;font-size:${cap.size}px;font-weight:${font ? font.weight : cap.weight ?? 700};line-height:1.15;color:${textColor};
  text-shadow:${captionShadow(cap.treatment)}}
${hookCss}
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1080" data-height="1920">
${els.join("\n")}
</div>
<script>
const tl = gsap.timeline({ paused: true });
${anim.join("\n")}
window.__timelines["main"] = tl; tl.seek(0);
</script>
</body></html>`;
  return { html, layout: { width: 1080, height: 1920, duration, boxes, placement: place, hook: hook ? { preset: hook.preset, layer: hook.layer, end: hook.end, clear: hook.clear } : null }, warnings: place.available ? [] : [`${place.reason} The captions sit above the head instead.`] };
}

// Writes a runnable HyperFrames composition into dir. clips: [{ id, file }] with file = the proxy's absolute path.
export async function writeComposition(dir, { cl, style, brand, tl, clips, home, hook = null, hookLayer = true, until = null, plat = process.platform }) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(path.join(dir, "assets"), { recursive: true });
  const clipsSrc = {};
  for (const c of clips) {
    await linkFile(c.file, path.join(dir, "assets", `${c.id}.mp4`), { plat });
    clipsSrc[c.id] = `assets/${c.id}.mp4`;
  }
  // The font file travels with the composition, so captions never wait on the network.
  const font = await resolveFont(style, home);
  font.src = `assets/caption-font${path.extname(font.file).toLowerCase()}`;
  await fs.copyFile(font.file, path.join(dir, font.src));
  // a hook look with its own type brings its bundled font file along the same way
  let hookFontSrc = null;
  if (hook?.font) {
    const f = findFont(hook.font.family);
    hookFontSrc = `assets/hook-font${path.extname(f.file).toLowerCase()}`;
    await fs.copyFile(path.join(FONTS_DIR, f.file), path.join(dir, hookFontSrc));
  }
  const { html, layout, warnings } = renderHtml({ cl, style, brand, tl, clipsSrc, font, hook, hookLayer, until, hookFontSrc });
  await fs.writeFile(path.join(dir, "index.html"), html);
  await fs.writeFile(path.join(dir, "layout.json"), JSON.stringify(layout, null, 2));
  await fs.writeFile(path.join(dir, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: false } }, null, 2));
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "reel", private: true, type: "module", scripts: { render: `npx --yes ${HF} render`, dev: `npx --yes ${HF} preview` } }, null, 2));
  return { layout, warnings };
}

export async function buildComposition(projectDir, { home = reelsHome(), run = null, behind = null } = {}) {
  const { paths, cl, style, brand, meta, segments, cuts } = await acutFor(projectDir, { home });
  const dir = paths.composition;
  const clips = meta.clips.map((c) => ({ id: c.id, file: path.join(projectDir, c.proxy) }));
  const tl = timeline(segments), duration = tl.length ? tl.at(-1).start + tl.at(-1).duration : 0;
  const font = await resolveFont(style, home);
  const { hook, warnings: hookWarnings } = await resolveHook({ cl, style, font, duration, behind: behind ? (plan) => behind(plan, { projectDir, tl, clips, run, home }) : null });
  const { layout, warnings } = await writeComposition(dir, { cl, style, brand, tl, clips, home, hook });
  return { dir, warnings: [...warnings, ...hookWarnings], duration: layout.duration, segments, cuts, hook, parts: { cl, style, brand, tl, clips } };
}
