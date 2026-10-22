import { FONTS } from "./fonts.js";
import { TREATMENTS } from "./build/captions.js";

// The look choices a member makes on a page: font, a few words or one, text style, focus color, caption color.
// The caption picker and the placement screen both build their option rows from here, so the two cannot drift.
const HEX = /^#[0-9a-f]{6}$/i;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Focus colors that read well over video. The member's own highlight color is added in front.
export const FOCUS = ["#FFD60A", "#F2C14E", "#FF8A3D", "#FF5A5F", "#FF6FB5", "#B388FF", "#4DA3FF", "#2DD4BF", "#7BE495", "#FFFFFF"];
export const TEXT = ["#FFFFFF", "#FFF8E7", "#111111"];
const inkOn = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#1f1e1c" : "#ffffff"; };
export const option = (name, value, label, current) => `<label class="opt"><input type="radio" name="${name}" value="${value}"${value === current ? " checked" : ""}>${label}</label>`;
const swatches = (name, colors, current) => colors.map((c, i) => `<label class="sw" style="--c:${c};color:${inkOn(c)}" title="${c}"><input type="radio" name="${name}" value="${c}"${c.toLowerCase() === current.toLowerCase() ? " checked" : ""}><span>${String.fromCharCode(65 + i)}</span></label>`).join("");

// look: { font, color, highlight, mode, treatment }. font is a bundled font's number, or "own" for the member's own file.
// own: the CSS family her own font is loaded under on this page; adds a "Your font" chip. afterTreatment: extra fieldsets for that page only.
export function lookControlsHtml(look, { own = null, afterTreatment = "" } = {}) {
  const focus = [...new Set([look.highlight.toUpperCase(), ...FOCUS])], text = [...new Set([look.color.toUpperCase(), ...TEXT])];
  const fontChips = FONTS.map((f) => `<label class="opt font" style="font-family:'${f.family}',sans-serif;font-weight:${f.weight}" title="Like Instagram's ${esc(f.like)}"><input type="radio" name="font" value="${f.number}" data-family="${esc(f.family)}" data-weight="${f.weight}"${f.number === look.font ? " checked" : ""}>${esc(f.family)}</label>`).join("")
    + (own ? `<label class="opt font" style="font-family:'${esc(own)}',sans-serif"><input type="radio" name="font" value="own"${look.font === "own" ? " checked" : ""}>Your font</label>` : "");
  return `<fieldset><legend>Font</legend>
    <div class="row">${fontChips}</div>
  </fieldset>
  <fieldset><legend>Captions show</legend>
    <div class="row">${option("mode", "group", "A few words at a time", look.mode)}${option("mode", "word", "One word at a time", look.mode)}</div>
  </fieldset>
  <fieldset><legend>Text style <small>what lifts the words off the video</small></legend>
    <div class="row">${option("treatment", "shadow", "Soft shadow", look.treatment)}${option("treatment", "outline", "Outline", look.treatment)}${option("treatment", "none", "None", look.treatment)}</div>
  </fieldset>${afterTreatment}
  <fieldset><legend>Focus color <small>the word being said</small></legend>
    <div class="row">${swatches("focus", focus, look.highlight)}<label class="own"><input type="color" id="focus-own" value="${look.highlight}">My own</label></div>
  </fieldset>
  <fieldset><legend>Caption color <small>every other word</small></legend>
    <div class="row">${swatches("cap", text, look.color)}<label class="own"><input type="color" id="cap-own" value="${look.color}">My own</label></div>
  </fieldset>`;
}

// Styles for those rows, scoped to a .look wrapper so they hold up on a page with its own input and label rules.
export const LOOK_CSS = `.look { display:grid; gap:14px; }
.look fieldset { border:0; margin:0; padding:0; min-width:0; }
.look legend { padding:0; font-weight:700; }
.look legend small { font-weight:400; color:var(--muted); font-size:14px; margin-left:6px; }
.look label { margin:0; font-weight:400; color:inherit; }
.look .row { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; align-items:center; }
.look .sw { position:relative; width:44px; height:44px; border-radius:50%; background:var(--c); border:1px solid var(--line); display:grid; place-items:center; cursor:pointer; font-size:13px; font-weight:700; }
.look .sw input, .look .opt input { position:absolute; inset:0; width:auto; height:auto; min-height:0; padding:0; border:0; opacity:0; margin:0; cursor:pointer; }
.look .sw:has(input:checked) { outline:3px solid var(--accent); outline-offset:2px; }
.look .sw:has(input:focus-visible), .look .opt:has(input:focus-visible) { outline:3px solid var(--ink); outline-offset:2px; }
.look .own { display:inline-flex; align-items:center; gap:8px; min-height:44px; padding:0 12px 0 6px; border:1px solid var(--line); border-radius:22px; background:var(--surface); font-size:14px; cursor:pointer; }
.look .own input { width:32px; height:32px; min-height:0; padding:0; border:0; background:none; box-shadow:none; cursor:pointer; }
.look .opt { display:inline-flex; align-items:center; min-height:44px; padding:0 16px; border:1px solid var(--line); border-radius:22px; background:var(--surface); font-size:15px; cursor:pointer; position:relative; }
.look .opt.font { font-size:19px; padding:0 18px; min-height:48px; }
.look .opt:has(input:checked) { background:var(--accent); color:var(--accent-ink); border-color:var(--accent); }`;

// A pick as a page sends it: { font, mode, treatment, color, highlight_color }. own: whether "own" (her own font file) is allowed here.
export function validateLook(p, { own = false } = {}) {
  const errors = [];
  if (!(FONTS.some((f) => f.number === p?.font) || (own && p?.font === "own"))) errors.push("Pick one of the fonts.");
  if (!["word", "group"].includes(p?.mode)) errors.push("Pick one word at a time or a few words.");
  if (!TREATMENTS.includes(p?.treatment)) errors.push("Pick soft shadow, outline, or none.");
  for (const k of ["color", "highlight_color"]) if (!HEX.test(p?.[k] ?? "")) errors.push(`${k} must be a hex color like #FFFFFF.`);
  return errors;
}

// Writes a (valid) pick into a style file's contents. Everything the pick doesn't cover is kept as it was.
export function applyLook(raw, look) {
  const cap = { ...raw.captions, mode: look.mode, treatment: look.treatment, color: look.color.toUpperCase(), highlight_color: look.highlight_color.toUpperCase() };
  if (look.mode === "group" && !(cap.words_per_line >= 2 && cap.words_per_line <= 4)) cap.words_per_line = 3;
  const font = look.font === "own" ? raw.font : { family: FONTS.find((f) => f.number === look.font).family, file: null };
  return { ...raw, font, captions: cap };
}
