import fs from "node:fs/promises";
import path from "node:path";
import { ENGINE_DIR } from "./paths.js";

export const FONTS_DIR = path.join(ENGINE_DIR, "assets", "fonts");

// The caption fonts that ship with the engine (SIL Open Font License; each folder carries its OFL.txt).
// weight = what captions are set in. range = what the file holds (two are variable fonts). like = the Instagram text style it stands in for.
// advance = average letter width as a fraction of the font size, rounded up a little so a word sized to fit a strip errs small.
export const FONTS = [
  { number: 1, family: "Poppins", file: "poppins/Poppins-Bold.ttf", weight: 700, range: "700", like: "Classic", advance: 0.62 },
  { number: 2, family: "Montserrat", file: "montserrat/Montserrat-Variable.ttf", weight: 900, range: "100 900", like: "Strong", advance: 0.7 },
  { number: 3, family: "Courier Prime", file: "courier-prime/CourierPrime-Bold.ttf", weight: 700, range: "700", like: "Typewriter / Editor", advance: 0.6 },
  { number: 4, family: "Fredoka", file: "fredoka/Fredoka-Variable.ttf", weight: 600, range: "300 700", like: "Bubble", advance: 0.58 },
  { number: 5, family: "Pacifico", file: "pacifico/Pacifico-Regular.ttf", weight: 400, range: "400", like: "Signature / Neon", advance: 0.52 },
];
export const DEFAULT_FONT = "Poppins";
export const FONT_FORMATS = { ".ttf": "truetype", ".otf": "opentype", ".woff2": "woff2" };

export const findFont = (family) => FONTS.find((f) => f.family.toLowerCase() === String(family ?? "").trim().toLowerCase());

// Which file a style's captions use: the member's own file in brand/fonts/, else one of the bundled fonts.
export async function resolveFont(style, home) {
  const want = style?.font || {};
  if (want.file) {
    const name = path.basename(want.file), dir = path.join(home, "brand", "fonts");
    if (!FONT_FORMATS[path.extname(name).toLowerCase()]) throw new Error(`"${name}" is not a font file this can use. Use a .ttf, .otf, or .woff2 file.`);
    const file = path.join(dir, name);
    if (!(await fs.access(file).then(() => true, () => false))) throw new Error(`The font file "${name}" is not in ${dir}. Copy it there, or switch to a built-in font: ${FONTS.map((f) => f.family).join(", ")}.`);
    const family = String(want.family || path.parse(name).name).replace(/['"\\<>;{}]/g, "");
    return { family, weight: style.captions?.weight ?? 400, range: "100 900", file, custom: true, advance: 0.62 };
  }
  const f = findFont(want.family ?? DEFAULT_FONT);
  if (!f) throw new Error(`There is no built-in font called "${want.family}". The built-in fonts are: ${FONTS.map((x) => x.family).join(", ")}.`);
  return { family: f.family, weight: f.weight, range: f.range, file: path.join(FONTS_DIR, f.file), custom: false, advance: f.advance };
}

// font: { family, range, file }. src: the URL the page loads the file from.
export function fontFace(font, src) {
  const format = FONT_FORMATS[path.extname(font.file).toLowerCase()];
  return `@font-face{font-family:'${font.family}';src:url('${src}') format('${format}');font-weight:${font.range};font-style:normal;font-display:block}`;
}
