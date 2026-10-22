import fs from "node:fs/promises";
import path from "node:path";
import { ENGINE_DIR } from "./paths.js";

// Thresholds and word lists for the A-cut rules. Defaults are the spec's values; a member can override any of them.
export async function loadConfig(home) {
  const defaults = JSON.parse(await fs.readFile(path.join(ENGINE_DIR, "defaults", "edit-config.json"), "utf8"));
  let mine = {};
  if (home) {
    try { mine = JSON.parse(await fs.readFile(path.join(home, "edit-config.json"), "utf8")); } catch (err) { if (err.code !== "ENOENT") throw err; }
  }
  return { lists: { ...defaults.lists, ...mine.lists }, thresholds: { ...defaults.thresholds, ...mine.thresholds } };
}
