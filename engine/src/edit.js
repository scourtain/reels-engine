import fs from "node:fs/promises";
import path from "node:path";
import { projectPaths, reelsHome } from "./paths.js";
import { loadCutList } from "./cutlist.js";
import { loadConfig } from "./config.js";
import { loadStyle, loadBrand } from "./styles.js";
import { loadEnvelopes } from "./transcribe.js";
import { assemble } from "./acut.js";

// Everything the A-cut needs, read once from a project folder.
export async function loadEdit(projectDir, { home = reelsHome(), cl = null } = {}) {
  const paths = projectPaths(projectDir);
  const cutlist = cl || (await loadCutList(paths.cutlist));
  const [meta, transcript, envs, cfg, style, brand] = await Promise.all([
    fs.readFile(path.join(projectDir, "project.json"), "utf8").then(JSON.parse),
    fs.readFile(paths.transcript, "utf8").then(JSON.parse),
    loadEnvelopes(projectDir),
    loadConfig(home),
    loadStyle(home, cutlist.style),
    loadBrand(home),
  ]);
  return { paths, meta, cl: cutlist, transcript, envs, cfg, style, brand };
}

export async function acutFor(projectDir, opts = {}) {
  const edit = await loadEdit(projectDir, opts);
  return { ...edit, ...assemble(edit.cl, edit) };
}
