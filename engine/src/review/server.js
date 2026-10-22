import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectPaths, ENGINE_DIR } from "../paths.js";
import { loadCutList, saveCutList, validateCutList, mergeDraft, unresolved, timeline } from "../cutlist.js";
import { acutFor } from "../edit.js";
import { loadConfig } from "../config.js";
import { listStyles, loadStyle, rawStyle, loadBrand, validateStyle, normalizeStyle } from "../styles.js";
import { resolveFont, findFont, fontFace, FONTS, FONTS_DIR } from "../fonts.js";
import { lookControlsHtml, LOOK_CSS, validateLook, applyLook } from "../look.js";
import { captionChunks, captionShadow } from "../build/captions.js";
import { placeCaption, fitSize, SPOTS, SPOT_LABELS, ZONES } from "../build/placement.js";
import { feedbackEntry, appendFeedback } from "../feedback.js";
import { run as engineRun } from "../run.js";
import { PRESETS, PRESET_IDS, MAX_HOOK_CHARS } from "../hook/presets.js";
import { planHook, reelTooShort } from "../hook/layout.js";
import { usableOptions, cleanText } from "../hook/lines.js";
import { readability, CUTOUT_FAILED } from "../hook/readability.js";
import { matteTool, matteFrames, TOOL_MISSING } from "../hook/matte.js";
import { hookPreviewHtml } from "../hook/markup.js";

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "page.html");
// A short moving picture of each hook look, for the look grid (and a still one for reduced motion).
const LOOK_PICTURES = path.join(ENGINE_DIR, "assets", "hook-looks");
const PICTURE_TYPES = { ".webp": "image/webp", ".gif": "image/gif", ".png": "image/png" };
const TOO_LONG = `Keep the hook line to ${MAX_HOOK_CHARS} characters.`;

export async function startReviewServer({ projectDir, home, port = 0, run = engineRun }) {
  const paths = projectPaths(projectDir);
  const meta = JSON.parse(await fsp.readFile(path.join(projectDir, "project.json"), "utf8"));
  const proxyOf = Object.fromEntries(meta.clips.map((c) => [c.id, path.join(projectDir, c.proxy)]));
  let resolveSent;
  // "cut" until Send goes through, then "placement" until the caption spot is confirmed. Only then does the command finish.
  let stage = "cut", saved = { default_saved: false, look_saved: false, hook_saved: false, next: "render" };
  const sent = new Promise((r) => (resolveSent = r));
  // A review starts at the cut: an after-Send draft left by one that was stopped is for a cut that may have changed since.
  await fsp.rm(paths.placementDraft, { force: true });

  const acutOf = async (cl) => {
    const { segments, cuts, seconds } = await acutFor(projectDir, { home, cl });
    return { seconds, cuts, segments: segments.map((s) => ({ lineId: s.lineId, source: s.source, in: s.in, out: s.out })) };
  };
  // Everything the placement screen needs, measured for this clip with the same math the render uses.
  // look: a pick from the screen's look controls, tried on without saving. The spots are measured for the style as it would be.
  const placementOf = async (look = null) => {
    const cl = await loadCutList(paths.cutlist), raw = await rawStyle(home, cl.style);
    const styled = look ? applyLook(raw, look) : raw, errs = validateStyle(styled);
    if (errs.length) throw new Error(`Style "${cl.style}" is invalid: ${errs.join("; ")}`);
    const style = normalizeStyle(styled, await loadBrand(home)), cap = style.captions, font = await resolveFont(style, home);
    const spots = Object.fromEntries(SPOTS.map((s) => [s, { ...placeCaption({ position: s, faceBox: cl.face_box, size: cap.size, mode: cap.mode }), label: SPOT_LABELS[s] }]));
    const wanted = spots[cl.caption_position ?? cap.position];
    const { segments } = await acutFor(projectDir, { home, cl });
    const first = segments[0], words = timeline(segments)[0].words.slice(0, 4).map((w) => w.w);
    // sizes: what each sample word is set in beside the head, from the same fit the render uses.
    const sizes = words.map((w) => fitSize(w, { width: spots["beside-left"].width, size: cap.size, advance: font.advance, upper: cap.case === "upper" }));
    return { cl, raw, styled, style, font, spots, position: wanted?.available ? wanted.spot : "above", sample: { clip: `/media/${first.source}`, t: +(first.in + Math.min(0.5, (first.out - first.in) / 2)).toFixed(2), words, sizes } };
  };
  const placementJson = (p) => {
    const cap = p.style.captions;
    return { position: p.position, spots: p.spots, zones: ZONES, style: p.cl.style, sample: p.sample,
      look: { font: p.font.custom ? "own" : findFont(p.font.family).number, family: p.font.family, weight: p.font.weight, color: cap.color, highlight_color: cap.highlight_color, shadow: captionShadow(cap.treatment), treatment: cap.treatment, size: cap.size, case: cap.case, mode: cap.mode, words_per_line: cap.words_per_line, highlight: cap.highlight } };
  };
  // Cut-out frames are kept for as long as this review runs: the cut is locked by the time hooks are tried on.
  const hookCache = { dir: path.join(projectDir, ".hook-cache", "review"), done: new Set() };
  await fsp.rm(hookCache.dir, { recursive: true, force: true });
  // The frames and masks are one shared folder: one look at a time uses it. Requests that arrive together take turns.
  let turn = Promise.resolve();
  const readOne = (...args) => { const next = turn.then(() => readability(...args)); turn = next.catch(() => {}); return next; };
  const clipFiles = meta.clips.map((c) => ({ id: c.id, file: path.join(projectDir, c.proxy) }));
  const captionBoxOf = (p, position) => (p.spots[position]?.available ? p.spots[position] : p.spots.above);

  // One look tried on one line: the plan the render would use, and what the screen shows for it.
  // box: where the look puts the card (top and height in frame px) before offset_y, so the page can place its grab layer and add the drag itself.
  // checkBehind: also cut her out and see whether type behind her head reads (slower; skipped until the hook is switched on).
  // Skipped, a behind look still needs the cutout tool to run at all, so a missing tool shows on the looks from the start.
  const tryLook = async (p, id, text, { captionBox, seconds, tl, offsetY = 0, checkBehind = true }) => {
    let plan = planHook({ card: { enabled: true, text, preset: id, offset_y: offsetY }, faceBox: p.cl.face_box, font: p.font, captionBox, duration: seconds });
    let warnings = plan.warnings ?? [];
    if (plan.available && plan.layer === "behind" && checkBehind) {
      const v = await readOne(plan, { projectDir, tl, clips: clipFiles, run, home, cache: hookCache });
      if (v.available) warnings = [...warnings, ...v.notes]; else plan = { ...plan, available: false, reason: v.reason };
    } else if (plan.available && plan.layer === "behind") {
      const why = await toolCantRun();
      if (why) plan = { ...plan, available: false, reason: why };
    }
    return { plan, view: { label: PRESETS[id].label, layer: PRESETS[id].layer, available: plan.available, reason: plan.available ? null : plan.reason, warnings,
      drag: plan.available ? plan.drag : null, box: plan.available ? { top: plan.box.top - plan.offsetY, height: plan.box.height } : null, captions_wait: !!plan.captionsWait, seconds: plan.available ? +(plan.end + plan.clear).toFixed(1) : null } };
  };
  // The cutout tool's reason it can't run here (no compiler, not a Mac, a Reels folder it can't build into), or null when it can.
  const toolCantRun = async () => {
    try { const t = await matteTool({ run, home }); return t.ok ? null : t.reason ?? TOOL_MISSING; } catch { return CUTOUT_FAILED; }
  };
  const reelOf = async (p) => { const { segments, seconds } = await acutFor(projectDir, { home, cl: p.cl }); return { seconds, tl: timeline(segments) }; };
  // Every look tried on one line, for the caption spot the member is looking at, moved by offsetY.
  const hooksFor = async (p, text, position, { checkBehind = true, offsetY = 0 } = {}) => {
    const reel = await reelOf(p), captionBox = captionBoxOf(p, position);
    const out = {};
    for (const id of PRESET_IDS) out[id] = (await tryLook(p, id, text, { ...reel, captionBox, offsetY, checkBehind })).view;
    return out;
  };
  // offset_y from the page: a whole number of px, or nothing (0). Anything else is refused.
  const offsetOf = (v) => (v === undefined || v === null ? 0 : Number.isInteger(v) ? v : NaN);
  // What the Hook card section opens with: the reel's own hook if it has one, else the way her last reel ended.
  const hookJson = async (p) => {
    const options = usableOptions(p.cl).map((o) => cleanText(o.text)), card = p.cl.hook_card, kept = p.style.hook;
    const on = card ? card.enabled === true : kept.on;
    const text = card?.enabled === true ? cleanText(card.text) : options[0] ?? "";
    const preset = card?.enabled === true ? card.preset : kept.preset ?? PRESET_IDS[0];
    const offset_y = card?.enabled === true && Number.isInteger(card.offset_y) ? card.offset_y : 0;
    return { on, text, preset, offset_y, options, order: PRESET_IDS, too_short: reelTooShort((await reelOf(p)).seconds), presets: await hooksFor(p, text, p.position, { checkBehind: on, offsetY: offset_y }) };
  };
  // The frame the screen shows, as a picture, and the person cut out of it. Each is made once.
  let framePromise = null, mattePromise = null;
  const hookFrame = () => (framePromise ??= (async () => {
    const file = path.join(hookCache.dir, "frame", "frame.png");
    const p = await placementOf(), clip = clipFiles.find((c) => `/media/${c.id}` === p.sample.clip);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await run("ffmpeg", ["-v", "error", "-y", "-ss", String(p.sample.t), "-i", clip.file, "-frames:v", "1", file]);
    return file;
  })().catch((e) => { framePromise = null; throw e; }));
  const hookMatte = () => (mattePromise ??= (async () => {
    const tool = await matteTool({ run, home });
    if (!tool.ok) return null;
    const frame = await hookFrame(), out = path.join(hookCache.dir, "frame-mask");
    await matteFrames(path.dirname(frame), out, { run, bin: tool.bin });
    return fs.existsSync(path.join(out, "frame.png")) ? path.join(out, "frame.png") : null;
  })().catch((e) => { mattePromise = null; throw e; }));
  const png = (res, file) => { res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" }); fs.createReadStream(file).pipe(res); };
  const BAD_DATA = ["That didn't come through as valid data. Try again."];
  const ownFont = async () => !!(await rawStyle(home, (await loadCutList(paths.cutlist)).style)).font?.file;

  const readBody = async (req) => { let body = ""; for await (const chunk of req) body += chunk; return JSON.parse(body); };
  const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return fs.createReadStream(PAGE).pipe(res);
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        const styles = await listStyles(home);
        const clips = Object.fromEntries(Object.keys(proxyOf).map((id) => [id, `/media/${id}`]));
        let cutlist = await loadCutList(paths.cutlist), restored = false;
        const errors = validateCutList(cutlist);
        if (errors.length) return json(res, 400, { errors });
        // the member's choices from a review that never got through Send, carried onto the cut list as it is now
        const draft = stage === "cut" ? await fsp.readFile(paths.draft, "utf8").then(JSON.parse, () => null) : null;
        if (draft) {
          const merged = mergeDraft(structuredClone(cutlist), draft);
          if (!validateCutList(merged).length) { cutlist = merged; restored = true; }
        }
        const cfg = await loadConfig(home);
        return json(res, 200, { cutlist, clips, styles, stage, restored, low_confidence: cfg.thresholds.low_confidence, acut: await acutOf(cutlist) });
      }
      // The page saves the member's choices here on every change, so a refused Send or a closed tab never costs the work.
      if (req.method === "POST" && url.pathname === "/api/draft") {
        if (stage !== "cut") return json(res, 409, { errors: ["The cut was already sent."] });
        let body = "";
        for await (const chunk of req) body += chunk;
        let draft;
        try { draft = JSON.parse(body); } catch { return json(res, 400, { errors: ["That didn't come through as valid data. Try again."] }); }
        if (!Array.isArray(draft?.lines)) return json(res, 400, { errors: ["lines must be an array"] });
        await fsp.writeFile(paths.draft, JSON.stringify(draft));
        return json(res, 200, { ok: true });
      }
      // After Send: the member's choices on the caption and hook screens, kept so a closed tab comes back where she was.
      if (req.method === "POST" && url.pathname === "/api/placement-draft") {
        if (stage !== "placement") return json(res, 409, { errors: ["Send the cut first."] });
        let draft;
        try { draft = await readBody(req); } catch { return json(res, 400, { errors: BAD_DATA }); }
        if (!draft || typeof draft !== "object" || Array.isArray(draft)) return json(res, 400, { errors: BAD_DATA });
        await fsp.writeFile(paths.placementDraft, JSON.stringify(draft));
        return json(res, 200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/api/placement") {
        const p = await placementOf(), j = placementJson(p);
        // a draft that doesn't parse, or isn't an object, is as good as none: the page opens on the server's own state
        const draft = await fsp.readFile(paths.placementDraft, "utf8").then(JSON.parse).then((d) => (d && typeof d === "object" && !Array.isArray(d) ? d : null), () => null);
        // The same option rows as the caption picker, starting on this style's look. Her own font file shows as one more chip.
        const controls = lookControlsHtml({ font: j.look.font, color: j.look.color, highlight: j.look.highlight_color, mode: j.look.mode, treatment: j.look.treatment }, { own: p.font.custom ? "ReelCaption" : null });
        return json(res, 200, { ...j, hook: await hookJson(p), draft, controls, controls_css: `${FONTS.map((f) => fontFace(f, `/font/${f.number}`)).join("\n")}\n${LOOK_CSS}` });
      }
      // Try a look on: the spots and the caption as they would be. Nothing is saved.
      if (req.method === "POST" && url.pathname === "/api/look") {
        let look;
        try { look = await readBody(req); } catch { return json(res, 400, { errors: ["That didn't come through as valid data. Try again."] }); }
        const errors = validateLook(look, { own: !!(await rawStyle(home, (await loadCutList(paths.cutlist)).style)).font?.file });
        if (errors.length) return json(res, 400, { errors });
        return json(res, 200, placementJson(await placementOf(look)));
      }
      // Try a hook line on: every look, measured for this clip and this caption spot. Nothing is saved.
      if (req.method === "POST" && url.pathname === "/api/hook") {
        let body;
        try { body = await readBody(req); } catch { return json(res, 400, { errors: BAD_DATA }); }
        if (body?.look) {
          const errors = validateLook(body.look, { own: await ownFont() });
          if (errors.length) return json(res, 400, { errors });
        }
        const text = typeof body?.text === "string" ? cleanText(body.text) : "", offsetY = offsetOf(body?.offset_y);
        if (text.length > MAX_HOOK_CHARS) return json(res, 400, { errors: [TOO_LONG] });
        if (Number.isNaN(offsetY)) return json(res, 400, { errors: BAD_DATA });
        const p = await placementOf(body?.look ?? null);
        // too_short: the reel can't hold any hook. Every look being too short for this line alone means a shorter line will fit.
        return json(res, 200, { too_short: reelTooShort((await reelOf(p)).seconds), presets: await hooksFor(p, text, typeof body?.position === "string" ? body.position : p.position, { offsetY }) });
      }
      // The look, drawn the way the render draws it, on a clear page the screen lays over the frame.
      if (req.method === "GET" && url.pathname === "/hook-preview") {
        const q = url.searchParams;
        let look = null;
        if (q.get("look")) {
          try { look = JSON.parse(q.get("look")); } catch { return json(res, 400, { errors: BAD_DATA }); }
          const errors = validateLook(look, { own: await ownFont() });
          if (errors.length) return json(res, 400, { errors });
        }
        const p = await placementOf(look), position = q.get("position") ?? p.position;
        const offset = Number(q.get("offset_y") ?? 0);
        const plan = planHook({ card: { enabled: true, text: q.get("text") ?? "", preset: q.get("preset"), offset_y: Number.isInteger(offset) ? offset : 0 }, faceBox: p.cl.face_box, font: p.font,
          captionBox: captionBoxOf(p, position), duration: (await acutFor(projectDir, { home, cl: p.cl })).seconds });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        if (!plan.available) return res.end("<!doctype html><html><body style='background:transparent'></body></html>");
        const matteSrc = plan.layer === "behind" && (await hookMatte()) ? "/api/hook/matte" : null;
        return res.end(hookPreviewHtml(plan, { colors: (await loadBrand(home)).colors, font: p.font, fontSrc: p.font.custom ? "/font" : `/font/${findFont(p.font.family).number}`,
          hookFontSrc: plan.font ? `/font/${findFont(plan.font.family).number}` : null, frameSrc: "/api/hook/frame", matteSrc }));
      }
      if (req.method === "GET" && url.pathname === "/api/hook/frame") return png(res, await hookFrame());
      if (req.method === "GET" && url.pathname === "/api/hook/matte") {
        const file = await hookMatte();
        if (!file) { res.writeHead(404); return res.end(); }
        return png(res, file);
      }
      if (req.method === "GET" && url.pathname.startsWith("/look-picture/")) {
        const id = decodeURIComponent(url.pathname.slice("/look-picture/".length));
        const names = !PRESET_IDS.includes(id) ? [] : url.searchParams.get("still") === "1" ? [`${id}-still.webp`, `${id}-still.png`] : [`${id}.webp`, `${id}.gif`];
        for (const name of names) {
          const file = path.join(LOOK_PICTURES, name);
          if (!fs.existsSync(file)) continue;
          res.writeHead(200, { "content-type": PICTURE_TYPES[path.extname(name)], "cache-control": "max-age=3600" });
          return fs.createReadStream(file).pipe(res);
        }
        res.writeHead(404); return res.end();
      }
      const bundled = req.method === "GET" && /^\/font\/\d$/.test(url.pathname) && FONTS[Number(url.pathname.slice(6)) - 1];
      if (bundled) { res.writeHead(200, { "content-type": "font/ttf", "cache-control": "max-age=3600" }); return fs.createReadStream(path.join(FONTS_DIR, bundled.file)).pipe(res); }
      if (req.method === "GET" && url.pathname === "/font") {
        const font = await resolveFont(await loadStyle(home, (await loadCutList(paths.cutlist)).style), home);
        res.writeHead(200, { "content-type": `font/${path.extname(font.file).slice(1).toLowerCase()}`, "cache-control": "no-store" });
        return fs.createReadStream(font.file).pipe(res);
      }
      if (req.method === "POST" && url.pathname === "/api/place") {
        let pick;
        try { pick = await readBody(req); } catch { return json(res, 400, { errors: ["That didn't come through as valid data. Try again."] }); }
        if (stage !== "placement") return json(res, 400, { errors: ["Send the cut first, then pick where the captions sit."] });
        const look = pick?.look ?? null;
        if (look) {
          const errors = validateLook(look, { own: !!(await rawStyle(home, (await loadCutList(paths.cutlist)).style)).font?.file });
          if (errors.length) return json(res, 400, { errors });
        }
        const p = await placementOf(look), spot = Object.hasOwn(p.spots, pick?.position) ? p.spots[pick.position] : null;
        if (!spot) return json(res, 400, { errors: ["Pick one of the caption spots."] });
        if (!spot.available) return json(res, 400, { errors: [spot.reason] });
        const cl = { ...p.cl, caption_position: spot.spot };
        // The hook card, when the screen sent one. Remembered in the style: the look she used, and whether she left it on.
        let hookStyle = null;
        if (pick.hook !== undefined) {
          const h = pick.hook;
          if (!h || typeof h.enabled !== "boolean") return json(res, 400, { errors: ["That hook card didn't come through. Try again."] });
          if (h.enabled) {
            const text = typeof h.text === "string" ? cleanText(h.text) : "", offsetY = offsetOf(h.offset_y);
            if (!text) return json(res, 400, { errors: ["Write a hook line, or switch the hook card off."] });
            if (text.length > MAX_HOOK_CHARS) return json(res, 400, { errors: [TOO_LONG] });
            if (!PRESET_IDS.includes(h.preset)) return json(res, 400, { errors: ["Pick one of the hook looks."] });
            if (Number.isNaN(offsetY)) return json(res, 400, { errors: ["That hook card didn't come through. Try again."] });
            const { plan } = await tryLook(p, h.preset, text, { ...(await reelOf(p)), captionBox: spot, offsetY });
            if (!plan.available) return json(res, 400, { errors: [plan.reason] });
            // the move is kept as the plan clamped it; none at all means where the look puts it. It is for this reel only, never the style.
            cl.hook_card = { enabled: true, text, preset: h.preset, ...(plan.offsetY ? { offset_y: plan.offsetY } : {}) };
          } else cl.hook_card = { enabled: false };
          const was = p.style.hook, now = h.enabled ? { preset: h.preset, on: true } : { preset: was.preset, on: false };
          if (was.preset !== now.preset || was.on !== now.on) hookStyle = now;
        }
        await saveCutList(paths.cutlist, cl);
        await fsp.rm(paths.placementDraft, { force: true });
        const default_saved = !!pick.make_default, look_saved = !!look, hook_saved = !!hookStyle;
        if (default_saved || look_saved || hook_saved) {
          // A changed look, and a new default spot, go into the style: her own file, or her own copy of the built-in starter.
          const mine = path.join(home, "styles", `${cl.style}.json`);
          const next = { ...p.styled, name: cl.style, captions: default_saved ? { ...p.styled.captions, position: spot.spot } : p.styled.captions, ...(hookStyle ? { hook: hookStyle } : {}) };
          await fsp.mkdir(path.dirname(mine), { recursive: true });
          await fsp.writeFile(mine, JSON.stringify(next, null, 2));
        }
        // then: "chat" means the member wants to talk through more edits first. Everything is saved the same; Claude holds the render.
        const next = pick.then === "chat" ? "chat" : "render";
        saved = { default_saved, look_saved, hook_saved, next };
        json(res, 200, { ok: true, default_saved, look_saved, hook_saved, next });
        return resolveSent(cl);
      }
      if (req.method === "GET" && url.pathname.startsWith("/media/")) {
        const file = proxyOf[decodeURIComponent(url.pathname.slice(7))];
        if (!file) { res.writeHead(404); return res.end(); }
        const { size } = await fsp.stat(file);
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
        if (!m) { res.writeHead(200, { "content-type": "video/mp4", "content-length": size, "accept-ranges": "bytes" }); return fs.createReadStream(file).pipe(res); }
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        res.writeHead(206, { "content-type": "video/mp4", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes" });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      if (req.method === "POST" && (url.pathname === "/api/send" || url.pathname === "/api/acut")) {
        let body = "";
        for await (const chunk of req) body += chunk;
        let cl;
        try { cl = JSON.parse(body); } catch { return json(res, 400, { errors: ["That didn't come through as valid data. Try again."] }); }
        const errors = validateCutList(cl);
        if (url.pathname === "/api/acut") {
          // The page asks "what does the cut look like right now?" Nothing is saved.
          if (errors.length && !errors.every((e) => /at least one kept line/.test(e))) return json(res, 400, { errors });
          return json(res, 200, errors.length ? { segments: [], cuts: [], seconds: 0 } : await acutOf(cl));
        }
        if (errors.length) return json(res, 400, { errors });
        const open = unresolved(cl).length; // REV-1
        if (open) return json(res, 400, { errors: [`${open} proposal${open === 1 ? " still needs" : "s still need"} a decision before you can send.`] });
        const before = await loadCutList(paths.cutlist).catch(() => null);
        await saveCutList(paths.cutlist, cl);
        await fsp.rm(paths.draft, { force: true });
        // the hook screen opens on this cut list, not on choices left from an earlier send
        await fsp.rm(paths.placementDraft, { force: true });
        // keep what this review teaches (notes, accepted/rejected proposals, the member's own cuts) for the next edit
        await appendFeedback(home, feedbackEntry(before, cl, { project: path.basename(projectDir) })).catch(() => {});
        // The command keeps waiting: the member still has to say where the captions sit.
        stage = "placement";
        return json(res, 200, { ok: true, next: "placement" });
      }
      res.writeHead(404); res.end();
    } catch (err) { json(res, 500, { errors: [err.message] }); }
  });

  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, sent, saved: () => saved, close: async () => {
    server.closeAllConnections?.(); server.close();
    // Cut-out frames are for this review only; never leave them in the member's project.
    await turn; await Promise.allSettled([framePromise, mattePromise]);
    await fsp.rm(path.join(projectDir, ".hook-cache"), { recursive: true, force: true });
  } };
}
