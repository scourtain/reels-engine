#!/usr/bin/env node
import { run } from "../src/run.js";
import { doctor } from "../src/doctor.js";
import { reelsHome, projectPaths } from "../src/paths.js";
import { makeProxies } from "../src/proxy.js";
import { transcribeProject, loadEnvelopes, refineWords } from "../src/transcribe.js";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { transcribeFile, alignTimings, implausibleWords } from "../src/asr.js";
import { runDetectors } from "../src/detect/index.js";
import { loadEdit } from "../src/edit.js";
import { draftCutList, saveCutList, loadCutList, openCutList, unresolved, syncTimings, addDroppedSpeech, droppedSpeechReport } from "../src/cutlist.js";
import { contactSheet, exampleFrames } from "../src/frames.js";
import { initHome, loadBrand, loadStyle, defaultStyle } from "../src/styles.js";
import { startReviewServer } from "../src/review/server.js";
import { buildComposition } from "../src/build/composition.js";
import { readability } from "../src/hook/readability.js";
import { renderProject, renderSample } from "../src/render.js";
import { checkProject } from "../src/check.js";
import { makeClipPack } from "../src/pack.js";
import { exportProject } from "../src/export/index.js";
import { appendFeedback, readFeedback } from "../src/feedback.js";
import { createProject } from "../src/project.js";
import { startFontPicker } from "../src/samples.js";
import { openSpec } from "../src/platform.js";

// Every command that works on a cut list checks it first: repairs are saved and listed, anything else stops the command.
async function checkedCutList(projectDir) {
  const r = await openCutList(projectPaths(projectDir).cutlist);
  r.notes.forEach((n) => console.log(`! repaired ${n}`));
  return r.cl;
}

// Puts a file or the review page in front of the member with whatever their computer normally opens it with.
function openInApp(target) { const o = openSpec(target); return run(o.cmd, o.args, { allowFail: true }); }

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  async doctor() {
    const r = await doctor({ run });
    for (const c of r.checks) console.log(`${c.ok ? "✓" : c.optional ? "–" : "✗"} ${c.name}: ${c.detail}${c.ok ? "" : `  → fix: ${c.fix}`}`);
    process.exit(r.ok ? 0 : 1);
  },
  // reels new <name words> [--clips <file> ...]. With --clips: those files (added to the chat) are copied in. Without: the inbox is used.
  async new(...parts) {
    const at = parts.indexOf("--clips");
    const nameParts = at < 0 ? parts : parts.slice(0, at), clips = at < 0 ? null : parts.slice(at + 1);
    if (clips && !clips.length) throw new Error("--clips needs at least one video file after it.");
    const dir = await createProject({ home: reelsHome(), name: nameParts.join(" ") || "reel", run, clips });
    console.log(dir);
  },
  async "init-home"() { await initHome(reelsHome()); console.log(reelsHome()); },
  async prep(projectDir, styleName) {
    const home = reelsHome();
    const [brand, cfg] = await Promise.all([loadBrand(home), loadConfig(home)]);
    const picked = styleName ? { name: styleName, warning: null } : await defaultStyle(home);
    await loadStyle(home, picked.name); // a wrong style name stops here, before the slow part
    if (picked.warning) console.log(`! ${picked.warning}`);
    const proxies = await makeProxies(projectDir, { run });
    proxies.filter((p) => p.warning).forEach((p) => console.log(`! ${p.warning}`));
    const tx = await transcribeProject(projectDir, { run, home });
    const cl = draftCutList(tx, { targetSeconds: brand.default_target_seconds, style: picked.name, thresholds: cfg.thresholds });
    addDroppedSpeech(cl, tx); // speech the transcription missed and couldn't get back: the member's call, line by line
    runDetectors(cl, { cfg, envs: await loadEnvelopes(projectDir), transcript: tx });
    await saveCutList(projectPaths(projectDir).cutlist, cl);
    await fs.rm(projectPaths(projectDir).draft, { force: true }); // a fresh edit: choices from an older review no longer apply
    const sheets = await contactSheet(projectDir, { run });
    const low = tx.clips.flatMap((c) => c.words).filter((w) => w.conf < cfg.thresholds.low_confidence).length;
    const odd = tx.clips.flatMap((c) => implausibleWords(c.words)).length;
    console.log(JSON.stringify({ lines: cl.lines.length, seconds: +tx.clips.reduce((a, c) => a + c.duration, 0).toFixed(1),
      decisions: cl.decisions.length, proposed: cl.decisions.filter((d) => d.status === "proposed").length, take_groups: cl.take_groups.length, low_confidence_words: low, suspect_timings: odd,
      dropped_speech: droppedSpeechReport(cl, tx), frames: sheets }, null, 2));
  },
  // Re-run the tool detectors after editing the cut list by hand (keeps everything the editor decided).
  async detect(projectDir) {
    const { paths, cl, cfg, envs, transcript } = await loadEdit(projectDir);
    runDetectors(cl, { cfg, envs, transcript });
    await saveCutList(paths.cutlist, cl);
    console.log(JSON.stringify({ decisions: cl.decisions.length, proposed: cl.decisions.filter((d) => d.status === "proposed").length, take_groups: cl.take_groups.length }));
  },
  async review(projectDir) {
    await checkedCutList(projectDir);
    const srv = await startReviewServer({ projectDir, home: reelsHome(), run });
    console.log(`REVIEW_URL ${srv.url}`);
    if (!process.env.REELS_NO_OPEN) await openInApp(srv.url);
    const cl = await srv.sent, saved = srv.saved();
    await srv.close();
    const kept = cl.lines.filter((l) => l.keep);
    console.log(JSON.stringify({ sent: true, next: saved.next, style: cl.style, caption_position: cl.caption_position ?? null, hook_card: cl.hook_card ?? null, style_changed: saved.look_saved, default_spot_saved: saved.default_saved, kept: kept.length, cut: cl.lines.length - kept.length, notes: cl.lines.filter((l) => l.note).map((l) => ({ id: l.id, note: l.note })) }));
    process.exit(0);
  },
  async build(projectDir) {
    await checkedCutList(projectDir);
    const r = await buildComposition(projectDir, { run, behind: readability });
    r.warnings.forEach((w) => console.log(`! ${w}`));
    console.log(JSON.stringify({ composition: r.dir, seconds: r.duration }));
  },
  async render(projectDir, quality) { console.log((await renderProject(projectDir, { run, quality })).final); },
  async check(projectDir) { const r = await checkProject(projectDir, { run }); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); },
  async pack(projectDir) { (await makeClipPack(projectDir, { run })).forEach((f) => console.log(f)); },
  async finish(projectDir, quality) {
    const open = unresolved(await checkedCutList(projectDir)).length; // REV-1: no render until the queue is empty
    if (open) throw new Error(`${open} proposal${open === 1 ? "" : "s"} still unresolved. Resolve them in the review page (or in cut-list.json) first.`);
    const r = await renderProject(projectDir, { run, quality });
    const c = await checkProject(projectDir, { run });
    if (!process.env.REELS_NO_OPEN) await openInApp(r.final); // put the finished reel in front of the member
    console.log(JSON.stringify({ final: r.final, seconds: c.seconds, cuts: r.cuts.length, ok: c.ok, issues: c.issues, warnings: c.warnings, buildWarnings: r.warnings }, null, 2));
    process.exit(c.ok ? 0 : 1);
  },
  // Stage 12 handoff files. Add "preview" to also cut the A-cut MP4 from the original footage (slow on 4K).
  async export(projectDir, flag) { console.log(JSON.stringify(await exportProject(projectDir, { run, preview: flag === "preview" }), null, 2)); },
  // Fix word timings on a project that is already transcribed and reviewed. Keeps every decision.
  // Plain: re-apply the silence correction. With "listen": transcribe again in short chunks and carry the new timings over.
  async retime(projectDir, mode) {
    const paths = projectPaths(projectDir), home = reelsHome();
    const tx = JSON.parse(await fs.readFile(paths.transcript, "utf8"));
    const report = { words: 0, matched: 0, implausible_before: 0, implausible_after: 0 };
    for (const c of tx.clips) {
      report.words += c.words.length; report.implausible_before += implausibleWords(c.words).length;
      if (mode === "listen") {
        const vocabulary = await fs.readFile(path.join(home, "vocabulary.txt"), "utf8").then((t) => t.split(/\r?\n/).filter(Boolean), () => []);
        const fresh = await transcribeFile(path.join(projectDir, c.proxy), { run, vocabulary, home, silences: c.silences, duration: c.duration });
        const aligned = alignTimings(c.words, fresh);
        c.words = aligned.words; report.matched += aligned.matched;
      }
      c.words = refineWords(c.words, c.silences);
      report.implausible_after += implausibleWords(c.words).length;
    }
    await fs.writeFile(paths.transcript, JSON.stringify(tx, null, 2));
    await saveCutList(paths.cutlist, syncTimings(await loadCutList(paths.cutlist), tx));
    console.log(JSON.stringify(report));
  },
  // The look picker: one caption preview, with font, caption mode, text style, position, focus color and caption color. No render, so it opens right away.
  // Waits for her to hit "Use these" (up to 30 minutes), then prints what she picked.
  async fonts() {
    const srv = await startFontPicker({ home: reelsHome() });
    console.log(`PICK_URL ${srv.url}`);
    if (!process.env.REELS_NO_OPEN) await openInApp(srv.url);
    const pick = await Promise.race([srv.picked, new Promise((r) => setTimeout(() => r(null), 30 * 60 * 1000))]);
    srv.close();
    console.log(JSON.stringify(pick ? { picked: true, ...pick } : { picked: false, note: "No pick came through from the page. Ask for the font, caption look and colors in chat." }));
    process.exit(0);
  },
  // About five seconds of her newest reel in one style. Same cut, just the look.
  async sample(styleName, quality) {
    if (!styleName) throw new Error("Which style? Use: reels sample <style>");
    const r = await renderSample(styleName, { run, quality });
    if (!process.env.REELS_NO_OPEN) await openInApp(r.sample);
    console.log(JSON.stringify(r, null, 2));
  },
  // Frame grids from an example reel (a saved video file), for reading its look.
  async frames(video) {
    if (!video) throw new Error("Which video? Use: reels frames <video file>");
    console.log(JSON.stringify(await exampleFrames(path.resolve(video), path.join(reelsHome(), "samples", "examples"), { run }), null, 2));
  },
  // The editor's memory: what past reviews asked for. `feedback` prints it; `note` adds something said in chat.
  async feedback() { console.log(JSON.stringify(await readFeedback(reelsHome()), null, 2)); },
  async note(projectDir, ...text) {
    await appendFeedback(reelsHome(), { date: new Date().toISOString().slice(0, 10), project: path.basename(projectDir), notes: [{ line: "", note: text.join(" ") }], accepted: [], rejected: [], own_cuts: [], source: "chat" });
    console.log("noted");
  },
};

if (!commands[cmd]) {
  console.error(`Usage: reels <${Object.keys(commands).join("|")}> [args]`);
  process.exit(2);
}
commands[cmd](...args).catch((err) => { console.error(err.message); process.exit(1); });
