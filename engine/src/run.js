import { spawn } from "node:child_process";
import { reelsHome } from "./paths.js";
import { toolPath as pathFor, toolEnv, launchSpec } from "./platform.js";

// The folders a fresh install puts tools in go on the path even when the app that launched us doesn't know about them yet.
export const toolPath = (current = process.env.PATH || "") => pathFor(current, { home: reelsHome() });

// Members never opted into usage tracking by the tools underneath, so it is off for everything the engine launches.
export function run(cmd, args, { cwd, allowFail = false } = {}) {
  return new Promise((resolve, reject) => {
    const go = launchSpec(cmd, args);
    const child = spawn(go.cmd, go.args, { cwd, env: toolEnv({ HYPERFRAMES_SKIP_SKILLS: "1", HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" }, { home: reelsHome() }) });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => (allowFail ? resolve({ code: 127, stdout, stderr: String(err) }) : reject(err)));
    child.on("close", (code) => {
      if (code !== 0 && !allowFail) return reject(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${stderr.slice(-2000)}`));
      resolve({ code, stdout, stderr });
    });
  });
}
