import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { FONTS, FONTS_DIR, fontFace, findFont } from "./fonts.js";
import { loadBrand, loadStyle, defaultStyle } from "./styles.js";
import { captionShadow } from "./build/captions.js";
import { lookControlsHtml, LOOK_CSS, validateLook } from "./look.js";
import { SPOTS, SPOT_LABELS, isBeside } from "./build/placement.js";


const exists = async (p) => fs.access(p).then(() => true, () => false);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The member's most recently worked-on reel that has every file in `needs`. null when there isn't one yet.
export async function newestProject(home, needs = ["project.json"]) {
  const root = path.join(home, "projects");
  const found = [];
  for (const name of (await exists(root)) ? await fs.readdir(root) : []) {
    const dir = path.join(root, name);
    if (!(await Promise.all(needs.map((f) => exists(path.join(dir, f))))).every(Boolean)) continue;
    found.push({ dir, t: Math.max(...(await Promise.all(needs.map((f) => fs.stat(path.join(dir, f))))).map((s) => s.mtimeMs)) });
  }
  return found.sort((a, b) => b.t - a.t)[0]?.dir ?? null;
}

// The stretch of an A-cut a sample plays: about `seconds` long, cut at a word's end so no word is chopped.
// Starts at the first place with three pieces in view when there is one, so a zoom on every 2nd or 3rd piece shows up.
export function sampleWindow(segments, seconds = 5) {
  const max = seconds + 0.5, len = (s) => s.out - s.in;
  const whole = (i) => { let t = 0, n = 0; for (let k = i; k < segments.length && t + len(segments[k]) <= max; k++) { t += len(segments[k]); n++; } return n; };
  let from = 0;
  for (let i = 0; i < segments.length; i++) if (whole(i) >= 3) { from = i; break; }
  const out = [];
  let t = 0;
  for (const seg of segments.slice(from)) {
    if (t >= seconds) break;
    const room = max - t;
    if (len(seg) <= room) { out.push(seg); t += len(seg); continue; }
    const words = seg.words.filter((w) => w.e - seg.in <= room - 0.1);
    if (words.length) { const end = Math.min(seg.out, words.at(-1).e + 0.1); out.push({ ...seg, words, out: end }); t += end - seg.in; }
    else if (!out.length) { out.push({ ...seg, words: seg.words.slice(0, 1), out: seg.in + room }); t += room; } // one very long first word: show what fits
    break;
  }
  return out;
}

// What the picker starts on: her default style's look, else the starter look with the brand kit's colors.
async function currentLook(home) {
  const brand = await loadBrand(home);
  try {
    const st = await loadStyle(home, (await defaultStyle(home)).name);
    return { font: findFont(st.font.family)?.number ?? 1, color: st.captions.color, highlight: st.captions.highlight_color, mode: st.captions.mode, treatment: st.captions.treatment, position: st.captions.position };
  } catch { return { font: 1, color: brand.colors.text, highlight: brand.colors.accent, mode: "group", treatment: "shadow", position: "above" }; }
}

const em = (n) => `${+(n / 64).toFixed(3)}em`; // a length beside 64 px captions, scaled with the tile's text
// A spot button: a tiny head-and-caption diagram beside its name. The bar is where the caption sits.
const SPOT_BAR = { above: 'x="5" y="5" width="12"', below: 'x="5" y="23" width="12"', low: 'x="5" y="28" width="12"', "beside-left": 'x="1.5" y="14" width="4"' };
const spotOption = (spot, current) => `<label class="opt spot"><input type="radio" name="position" value="${spot}"${spot === current ? " checked" : ""}><svg width="22" height="36" viewBox="0 0 22 36" aria-hidden="true"><rect x=".75" y=".75" width="20.5" height="34.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="11" cy="15" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect ${SPOT_BAR[spot]} height="2.5" rx="1.2" fill="currentColor"/></svg><span>${SPOT_LABELS[spot]}</span></label>`;

// look: { font, color, highlight, mode, treatment, position } to start from.
// One preview at the top plays just the caption (no video behind it), and every option below changes it live.
export function fontsPageHtml({ look }) {
  const colors = look, faces = FONTS.map((f) => fontFace(f, `/font/${f.number}`)).join("\n");
  const current = FONTS[look.font - 1];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Pick your caption look</title>
<style>
${faces}
:root { color-scheme: light dark; --bg:#f5f3ef; --surface:#ffffff; --ink:#1f1e1c; --muted:#6b6862; --line:#e3dfd8; --accent:#2f6f5e; --accent-ink:#ffffff; --radius:12px; --cap:${colors.color}; --focus:${colors.highlight}; }
@media (prefers-color-scheme: dark) { :root { --bg:#1a1917; --surface:#232220; --ink:#ece9e3; --muted:#a19d95; --line:#34322e; --accent:#5fae96; --accent-ink:#0f1f1a; } }
* { box-sizing:border-box; }
html { -webkit-text-size-adjust:100%; }
body { margin:0; min-height:100vh; min-height:100dvh; font:16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background:var(--bg); color:var(--ink); overflow-x:hidden; -webkit-font-smoothing:antialiased; }
header, .colors { max-width:720px; margin:0 auto; padding:28px 16px 4px; }
h1 { margin:0; font-size:clamp(22px, 4.5vw, 28px); line-height:1.15; letter-spacing:-0.015em; font-weight:700; }
header p { margin:6px 0 0; color:var(--muted); font-size:15px; max-width:56ch; }
.colors { padding-top:16px; padding-bottom:150px; }
${LOOK_CSS}
.stage { position:sticky; top:0; z-index:2; background:var(--bg); padding:16px 16px 12px; }
.tile { display:grid; place-items:center; max-width:400px; margin:0 auto; aspect-ratio:5/2; container-type:inline-size; border-radius:var(--radius); background:#4a4f55; overflow:hidden; }
.cap { font-size:9.5cqw; line-height:1.15; white-space:nowrap; color:var(--cap); text-shadow:${captionShadow("shadow", em)}; }
body[data-treatment="outline"] .cap { text-shadow:${captionShadow("outline", em)}; }
body[data-treatment="none"] .cap { text-shadow:none; }
.cap .w.on { color:var(--focus); }
body[data-mode="word"] .cap { font-size:13cqw; }
body[data-mode="word"] .cap .w:not(.on) { display:none; }
.opt.spot { gap:8px; min-height:52px; padding:0 16px 0 12px; }
.opt.spot svg { flex:none; }
.note { max-width:400px; margin:8px auto 0; text-align:center; color:var(--muted); font-size:14px; }
.tell { position:fixed; left:0; right:0; bottom:0; margin:0; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); background:var(--surface); border-top:1px solid var(--line); font-size:15px; display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; justify-content:center; text-align:center; }
.tell p { margin:0; }
.tell code { font:600 14px ui-monospace, SFMono-Regular, Menlo, monospace; background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:2px 6px; white-space:nowrap; }
.tell button { min-height:44px; padding:0 22px; border:0; border-radius:22px; background:var(--accent); color:var(--accent-ink); font-weight:700; cursor:pointer; }
.tell button:disabled { opacity:.6; cursor:default; }
@media (prefers-reduced-motion: reduce) { .cap .w { transition:none; } }
</style>
</head>
<body data-mode="${look.mode}" data-treatment="${look.treatment}">
<header>
  <h1>Pick your caption look</h1>
  <p>Change anything below and watch the caption at the top. When it looks right, hit Use these. Want your own font file instead? Tell Claude in the chat.</p>
</header>
<div class="stage"><div class="tile"><span class="cap" id="preview" style="font-family:'${current.family}',sans-serif;font-weight:${current.weight}"><span class="w">Pick</span> <span class="w">a</span> <span class="w">style</span></span></div><p class="note" id="beside-note" hidden>Beside head shows one word at a time.</p></div>
<section class="colors look">
  ${lookControlsHtml(look, { afterTreatment: `
  <fieldset><legend>Position <small>where the captions sit on the video</small></legend>
    <div class="row">${SPOTS.map((s) => spotOption(s, look.position)).join("")}</div>
  </fieldset>` })}
</section>
<div class="tell">
  <p id="summary"><strong id="font-name">${esc(FONTS[look.font - 1].family)}</strong> · focus <code id="focus-hex">${colors.highlight.toUpperCase()}</code> · captions <code id="cap-hex">${colors.color.toUpperCase()}</code></p>
  <button id="use" type="button">Use these</button>
</div>
<script>
const set = (name, value) => { document.documentElement.style.setProperty("--" + name, value); document.getElementById(name + "-hex").textContent = value.toUpperCase(); };
for (const name of ["focus", "cap"]) {
  const own = document.getElementById(name + "-own");
  document.querySelectorAll('input[name="' + name + '"]').forEach((r) => r.addEventListener("change", () => { set(name, r.value); own.value = r.value; }));
  own.addEventListener("input", () => { document.querySelectorAll('input[name="' + name + '"]').forEach((r) => (r.checked = false)); set(name, own.value); });
}
// Play the caption the way it plays on a reel: the focus color moves word to word (or one word shows at a time).
let step = 0;
const play = () => { document.querySelectorAll("#preview .w").forEach((w, i) => w.classList.toggle("on", i === step)); step = (step + 1) % 3; };
play(); setInterval(play, 550);
const chosen = (name) => document.querySelector('input[name="' + name + '"]:checked');
const font = () => chosen("font");
// Beside the head is always one word at a time. The preview shows that; her Captions show pick is kept for the other spots.
const beside = () => ${JSON.stringify(SPOTS.filter(isBeside))}.includes(chosen("position").value);
const showMode = () => { document.body.dataset.mode = beside() ? "word" : chosen("mode").value; document.getElementById("beside-note").hidden = !beside(); };
document.querySelectorAll('input[name="mode"], input[name="position"]').forEach((r) => r.addEventListener("change", showMode));
showMode();
document.querySelectorAll('input[name="treatment"]').forEach((r) => r.addEventListener("change", () => (document.body.dataset.treatment = r.value)));
document.querySelectorAll('input[name="font"]').forEach((r) => r.addEventListener("change", () => {
  document.getElementById("font-name").textContent = r.dataset.family;
  const p = document.getElementById("preview"); p.style.fontFamily = "'" + r.dataset.family + "',sans-serif"; p.style.fontWeight = r.dataset.weight;
}));
document.getElementById("use").addEventListener("click", async (e) => {
  e.target.disabled = true;
  const body = { font: Number(font().value), mode: chosen("mode").value, treatment: chosen("treatment").value, position: chosen("position").value, highlight_color: document.getElementById("focus-hex").textContent, color: document.getElementById("cap-hex").textContent };
  try {
    const r = await fetch("/api/pick", { method: "POST", body: JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json()).errors.join(" "));
    document.getElementById("summary").textContent = "Sent. Head back to Claude.";
    e.target.hidden = true;
  } catch (err) { e.target.disabled = false; document.getElementById("summary").textContent = "That didn't go through. Tell Claude your font number and colors in the chat instead. (" + err.message + ")"; }
});
</script>
</body>
</html>`;
}

// The picker page, served from this Mac so the fonts load in any browser (a page opened straight from a file can't load them everywhere).
// `picked` resolves with { font, family, mode, treatment, position, color, highlight_color } when she hits Use these.
export async function startFontPicker({ home, port = 0 }) {
  const look = await currentLook(home);
  let resolvePicked;
  const picked = new Promise((r) => (resolvePicked = r));
  const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(fontsPageHtml({ look }));
      }
      const f = req.method === "GET" && /^\/font\/\d$/.test(url.pathname) && FONTS[Number(url.pathname.slice(6)) - 1];
      if (f) { res.writeHead(200, { "content-type": "font/ttf", "cache-control": "max-age=3600" }); return res.end(await fs.readFile(path.join(FONTS_DIR, f.file))); }
      if (req.method === "POST" && url.pathname === "/api/pick") {
        let body = "";
        for await (const chunk of req) body += chunk;
        let p;
        try { p = JSON.parse(body); } catch { return json(res, 400, { errors: ["That didn't come through as valid data. Try again."] }); }
        const errors = validateLook(p), font = FONTS.find((x) => x.number === p?.font);
        if (!SPOTS.includes(p?.position)) errors.push("Pick one of the caption spots.");
        if (errors.length) return json(res, 400, { errors });
        json(res, 200, { ok: true });
        return resolvePicked({ font: font.number, family: font.family, mode: p.mode, treatment: p.treatment, position: p.position, color: p.color.toUpperCase(), highlight_color: p.highlight_color.toUpperCase() });
      }
      res.writeHead(404); res.end();
    } catch (err) { json(res, 500, { errors: [err.message] }); }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, picked, close: () => { server.closeAllConnections?.(); server.close(); } };
}
