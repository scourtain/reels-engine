import fs from "node:fs/promises";
import path from "node:path";
import { ENGINE_DIR } from "./paths.js";
import { FONTS, FONT_FORMATS, findFont } from "./fonts.js";
import { TREATMENTS } from "./build/captions.js";
import { SPOTS, spotOf } from "./build/placement.js";
import { PRESET_IDS } from "./hook/presets.js";

const BUILTIN = path.join(ENGINE_DIR, "styles");
export const STARTER = "starter";
const readJson = async (f) => JSON.parse(await fs.readFile(f, "utf8"));
const exists = async (p) => fs.access(p).then(() => true, () => false);

// What a member picks ("off", "minimal", "medium") and the zoom the builder runs. Styles never touch the cut.
export const ZOOM_LEVELS = {
  off: { amount: 1, every: 1, motion: "cut" },
  minimal: { amount: 1.06, every: 3, motion: "cut" },
  medium: { amount: 1.12, every: 2, motion: "cut" },
};
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// The engine ships one style (starter). A member's styles live only in her Reels folder, so there is no copy to go stale.
export async function initHome(home) {
  for (const d of ["inbox", "projects", "brand/fonts", "styles"]) await fs.mkdir(path.join(home, d), { recursive: true });
  const brand = path.join(home, "brand-kit.json");
  if (!(await exists(brand))) await fs.copyFile(path.join(ENGINE_DIR, "defaults", "brand-kit.json"), brand);
}

export async function loadBrand(home) {
  const defaults = await readJson(path.join(ENGINE_DIR, "defaults", "brand-kit.json"));
  const file = path.join(home, "brand-kit.json");
  const mine = (await exists(file)) ? await readJson(file) : {};
  return { ...defaults, ...mine, colors: { ...defaults.colors, ...mine.colors } };
}

// Checks a style file as written: v2 (font, captions.mode, a zoom level) or v1 (zoom as numbers).
export function validateStyle(s) {
  const e = [], cap = s?.captions || {};
  if (cap.mode !== undefined && !["word", "group"].includes(cap.mode)) e.push("captions.mode must be word or group");
  if (cap.mode === "group" ? !(cap.words_per_line >= 2 && cap.words_per_line <= 4) : cap.mode !== "word" && !(cap.words_per_line >= 1)) {
    e.push(cap.mode === "group" ? "captions.words_per_line must be 2, 3, or 4 for word groups" : "captions.words_per_line must be >= 1");
  }
  if (cap.case !== undefined && !["upper", "sentence"].includes(cap.case)) e.push("captions.case must be upper or sentence");
  if (cap.highlight !== undefined && !["color", "pop", "none", "accent-italic"].includes(cap.highlight)) e.push("captions.highlight must be color, pop, or none");
  if (cap.treatment !== undefined && !TREATMENTS.includes(cap.treatment)) e.push("captions.treatment must be shadow, outline, or none");
  if (cap.position !== undefined && ![...SPOTS, "lower", "center"].includes(cap.position)) e.push("captions.position must be above, below, low, or beside-left");
  for (const k of ["color", "highlight_color"]) if (cap[k] !== undefined && !HEX.test(cap[k])) e.push(`captions.${k} must be a hex color like #FFFFFF`);
  if (cap.size !== undefined && !(cap.size >= 24 && cap.size <= 200)) e.push("captions.size must be between 24 and 200");
  if (typeof s?.zoom === "string") {
    if (!ZOOM_LEVELS[s.zoom]) e.push("zoom must be off, minimal, or medium");
  } else {
    if (!(s?.zoom?.amount >= 1 && s.zoom.amount <= 1.5)) e.push("zoom.amount must be between 1 and 1.5");
    if (!(s?.zoom?.every >= 1)) e.push("zoom.every must be >= 1");
    if (!["cut", "snap", "push"].includes(s?.zoom?.motion)) e.push("zoom.motion must be cut, snap, or push");
  }
  if (s?.font !== undefined) {
    if (s.font?.file) { if (!FONT_FORMATS[path.extname(String(s.font.file)).toLowerCase()]) e.push("font.file must be a .ttf, .otf, or .woff2 file in brand/fonts"); }
    else if (!findFont(s.font?.family)) e.push(`font.family must be one of ${FONTS.map((f) => f.family).join(", ")} (or set font.file to your own font)`);
  }
  if (s?.hook !== undefined) {
    if (typeof s.hook !== "object" || s.hook === null) e.push("hook must be { preset, on }");
    else {
      if (s.hook.preset != null && !PRESET_IDS.includes(s.hook.preset)) e.push(`hook.preset must be one of ${PRESET_IDS.join(", ")}`);
      if (s.hook.on !== undefined && typeof s.hook.on !== "boolean") e.push("hook.on must be true or false");
    }
  }
  return e;
}

// Turns what the member chose into the knobs the builder reads. A v1 file comes out the same, with the gaps filled.
export function normalizeStyle(s, brand = {}) {
  const cap = { ...s.captions }, colors = brand.colors || {};
  cap.mode ??= cap.words_per_line === 1 ? "word" : "group";
  cap.words_per_line = cap.mode === "word" ? 1 : cap.words_per_line ?? 3;
  cap.case ??= "sentence";
  cap.highlight ??= "color";
  cap.treatment ??= "shadow";
  cap.position = spotOf(cap.position);
  cap.size ??= cap.mode === "word" ? 88 : 64;
  cap.color ??= colors.text ?? "#FFFFFF";
  cap.highlight_color ??= colors.accent ?? "#E8B44A";
  const font = s.font?.file ? { family: s.font.family ?? null, file: s.font.file } : { family: findFont(s.font?.family)?.family ?? "Poppins", file: null };
  const level = typeof s.zoom === "string" ? s.zoom : null;
  const preset = s.hook?.preset ?? null;
  const hook = { preset, on: !!(preset && s.hook?.on) };
  return { ...s, font, captions: cap, zoom: level ? { ...ZOOM_LEVELS[level] } : s.zoom, zoom_level: level, hook };
}

// Her styles, plus the built-in starter.
export async function listStyles(home) {
  const dir = path.join(home, "styles");
  const mine = (await exists(dir)) ? (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];
  return [...new Set([...mine, STARTER])].sort();
}

// A style file as written: her own, or the built-in starter when she has no file of that name.
export async function rawStyle(home, name) {
  const mine = path.join(home, "styles", `${name}.json`);
  const file = (await exists(mine)) ? mine : name === STARTER ? path.join(BUILTIN, `${STARTER}.json`) : null;
  if (!file) throw new Error(`There is no style called "${name}". Your styles: ${(await listStyles(home)).join(", ")}.`);
  return readJson(file);
}

export async function loadStyle(home, name) {
  const s = await rawStyle(home, name);
  const errs = validateStyle(s);
  if (errs.length) throw new Error(`Style "${name}" is invalid: ${errs.join("; ")}`);
  return normalizeStyle(s, await loadBrand(home));
}

// The style a new reel gets when none is named. A default that points at a deleted style falls back to starter.
export async function defaultStyle(home) {
  const name = (await loadBrand(home)).default_style || STARTER;
  if ((await listStyles(home)).includes(name)) return { name, warning: null };
  return { name: STARTER, warning: `Your default style "${name}" is gone, so this reel uses the starter style. Pick a new default with /reels-engine:reel-style.` };
}
