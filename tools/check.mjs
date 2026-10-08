#!/usr/bin/env node
// Pre-PR checks: every animation has complete metadata and sane limits, the site builds
// (build.mjs validates every frame), the bash players pass shellcheck, and the bash and
// PowerShell players each print a first frame. shellcheck and pwsh are skipped if missing.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const animsDir = join(root, "anims");
const site = join(root, "site");
const problems = [];
const LIMIT_KB = 1024;

const names = readdirSync(animsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
for (const name of names) {
  const dir = join(animsDir, name);
  if (!existsSync(join(dir, "meta.json"))) { problems.push(`${name}: missing meta.json`); continue; }
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  for (const key of ["title", "credit", "license"]) {
    if (!String(meta[key] ?? "").trim()) problems.push(`${name}: meta.json needs "${key}"`);
  }
  if (!Array.isArray(meta.sizes) || !meta.sizes.length) { problems.push(`${name}: meta.json has no sizes (re-run tools/convert.mjs)`); continue; }
  for (const { width } of meta.sizes) {
    if (width > 120) problems.push(`${name}: width ${width} > 120`);
    for (const f of [`${width}.txt`, `${width}.color.txt`]) {
      if (!existsSync(join(dir, f))) problems.push(`${name}: missing ${f}`);
    }
  }
  if (meta.frames > 200) problems.push(`${name}: ${meta.frames} frames > 200`);
  if (existsSync(join(dir, "frames.txt"))) problems.push(`${name}: stale frames.txt (old format); delete it`);
}

const build = spawnSync(process.execPath, [join(root, "tools", "build.mjs")], { encoding: "utf8" });
if (build.status !== 0) problems.push(`build failed:\n${build.stderr}`);
else process.stdout.write(build.stdout);

if (build.status === 0) {
  for (const name of names) {
    const kb = readFileSync(join(site, name)).length / 1024;
    if (kb > LIMIT_KB) problems.push(`${name}: player is ${Math.round(kb)} KB (> ${LIMIT_KB} KB); use fewer frames or widths`);
  }

  const scripts = readdirSync(site).filter((f) => f.endsWith(".sh")).map((f) => join(site, f));
  const sc = spawnSync("shellcheck", ["-S", "warning", ...scripts], { encoding: "utf8" });
  if (sc.error) console.log("shellcheck not installed; skipping");
  else if (sc.status !== 0) problems.push(`shellcheck:\n${sc.stdout}`);

  // Smoke tests: output is not a terminal, so each player prints one frame and exits.
  for (const file of [...names, "random", "all"]) {
    const sh = spawnSync("bash", [join(site, file)], { encoding: "utf8", input: "" });
    if (sh.status !== 0 || !/[A-Za-z]/.test(sh.stdout)) problems.push(`bash ${file}: exit ${sh.status}, ${sh.stdout.length} bytes\n${sh.stderr}`);
  }
  const ps = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(site, `${names[0]}.ps1`), "-Color"], { encoding: "utf8" });
  if (ps.error) console.log("pwsh not installed; skipping PowerShell smoke test");
  else if (ps.status !== 0 || !/\x1b\[38;5;\d+m[A-Za-z]/.test(ps.stdout)) problems.push(`pwsh ${names[0]}.ps1: exit ${ps.status}\n${ps.stderr}`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("all checks passed");
