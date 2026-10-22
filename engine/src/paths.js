import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homeFolders } from "./platform.js";

export const HF = "hyperframes@0.8.143";
// fileURLToPath, not URL.pathname: a folder name with a space ("reels-engine 2") must stay a real path, not "reels-engine%202".
export const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function reelsHome() {
  return process.env.REELS_HOME || path.join(os.homedir(), ...homeFolders());
}

export function projectPaths(projectDir) {
  const p = (...x) => path.join(projectDir, ...x);
  return {
    source: p("source"),
    proxies: p("proxies"),
    transcript: p("transcript.json"),
    cutlist: p("cut-list.json"),
    draft: p("review-draft.json"),
    placementDraft: p("placement-draft.json"),
    frames: p("frames"),
    composition: p("composition"),
    layout: p("composition", "layout.json"),
    finalRaw: p("final-raw.mp4"),
    final: p("final.mp4"),
    checkReport: p("check-report.json"),
    segments: p("segments"),
    postCaption: p("post-caption.txt"),
  };
}
