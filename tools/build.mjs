#!/usr/bin/env node
// Build the static site: anims/* -> site/
//   site/<name>, <name>.sh, <name>.ps1     players for one animation (frames embedded)
//   site/random[.sh|.ps1]                  picks one animation at random on each run
//   site/all[.sh|.ps1]                     plays every animation in turn
//   site/list, list.txt                    plain-text catalog
//   site/data/<name>.json                  frames + colours for the web viewer
//   site/anims.json, index.html            web gallery
//
// The public URL is SITE_URL if set, otherwise derived from GITHUB_REPOSITORY
// (owner/repo -> https://owner.github.io/repo/), otherwise http://localhost:8000/.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { xtermRgb } from "./convert.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const animsDir = join(root, "anims");
const out = join(root, "site");
const SEP = "@@FRAME@@";

const repo = process.env.GITHUB_REPOSITORY;
let siteUrl = process.env.SITE_URL
  ?? (repo ? `https://${repo.split("/")[0].toLowerCase()}.github.io/${repo.split("/")[1]}/` : "http://localhost:8000/");
if (!siteUrl.endsWith("/")) siteUrl += "/";
const repoUrl = repo ? `https://github.com/${repo}` : "live-bash-dance";

// One line of printable ASCII.
const oneLine = (s) => String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7e]/g, "?").trim();
const shQuote = (s) => `'${oneLine(s).replace(/'/g, `'\\''`)}'`;
const psQuote = (s) => `'${oneLine(s).replace(/'/g, "''")}'`;

const splitFrames = (text) => text.replace(/\n+$/, "").split(`\n${SEP}\n`).map((f) => f.split("\n"));

// Letters + colour grid -> one frame of text with \033[38;5;Nm escapes (written literally;
// players expand them at runtime). Colour only changes on non-space cells, and only when
// the new colour is visibly different, which keeps the escape count (and file size) down.
const COLOR_STEP = 60;
const colorDist = (a, b) => {
  const [x, y] = [xtermRgb(a), xtermRgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
function ansiFrame(rows, colorRows) {
  let prev = -1;
  return rows.map((row, y) => {
    let line = "";
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== " ") {
        const c = parseInt(colorRows[y].slice(x * 2, x * 2 + 2), 16);
        if (prev < 0 || (c !== prev && colorDist(c, prev) >= COLOR_STEP)) { line += `\\033[38;5;${c}m`; prev = c; }
      }
      line += row[x];
    }
    return line;
  });
}

function loadAnim(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`bad animation name: ${name}`);
  const dir = join(animsDir, name);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const fps = Number(meta.fps);
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error(`${name}: bad fps`);
  if (!Array.isArray(meta.sizes) || !meta.sizes.length) throw new Error(`${name}: meta.json has no sizes (re-run tools/convert.mjs)`);

  const sizes = [...meta.sizes].sort((a, b) => a.width - b.width).map(({ width, height }) => {
    const plain = splitFrames(readFileSync(join(dir, `${width}.txt`), "utf8"));
    const color = splitFrames(readFileSync(join(dir, `${width}.color.txt`), "utf8"));
    if (plain.length !== color.length) throw new Error(`${name}/${width}: letter and colour frame counts differ`);
    plain.forEach((rows, f) => {
      if (rows.length !== height || color[f].length !== height) throw new Error(`${name}/${width}: frame ${f} is not ${height} rows`);
      rows.forEach((r, y) => {
        // Letters and spaces only: keeps the art honest and the embedded heredoc safe.
        if (r.length !== width || /[^A-Za-z ]/.test(r)) throw new Error(`${name}/${width}.txt frame ${f} row ${y}: must be ${width} letters/spaces`);
        if (!new RegExp(`^[0-9a-f]{${width * 2}}$`).test(color[f][y])) throw new Error(`${name}/${width}.color.txt frame ${f} row ${y}: bad colour row`);
      });
    });
    return { width, height, plain, color };
  });

  return {
    name,
    title: oneLine(meta.title || name),
    credit: oneLine([meta.credit, meta.license].filter(Boolean).join(", ") || "no credit given"),
    meta,
    fps,
    sizes,
  };
}

function catalogText(anims) {
  const parts = [];
  anims.forEach((a, i) => {
    parts.push(`@@ANIM ${i}@@`);
    for (const s of a.sizes) {
      parts.push(`@@SIZE ${s.width}x${s.height} plain@@`);
      parts.push(s.plain.map((rows) => rows.join("\n")).join(`\n${SEP}\n`));
      parts.push(`@@SIZE ${s.width}x${s.height} color@@`);
      parts.push(s.plain.map((rows, f) => ansiFrame(rows, s.color[f]).join("\n")).join(`\n${SEP}\n`));
    }
  });
  return parts.join("\n");
}

function render(template, vars) {
  // Catalog last, so frame text is never scanned for placeholders.
  const { __CATALOG__, ...rest } = vars;
  let s = template;
  for (const [k, v] of Object.entries(rest)) s = s.split(k).join(v);
  return s.split("__CATALOG__").join(__CATALOG__);
}

function players(file, mode, heading, anims) {
  const catalog = catalogText(anims);
  const sizes = anims.map((a) => a.sizes.map((s) => `${s.width}x${s.height}`).join(" "));
  const common = {
    __HEADING__: oneLine(heading),
    __REPO__: oneLine(repoUrl),
    __URL__: `${siteUrl}${file}`,
    __MODE__: mode,
    __CATALOG__: catalog,
  };
  const sh = render(shTemplate, {
    ...common,
    __NAMES__: anims.map((a) => a.name).join(" "),
    __TITLES__: anims.map((a) => shQuote(a.title)).join(" "),
    __CREDITS__: anims.map((a) => shQuote(a.credit)).join(" "),
    __FPS__: anims.map((a) => a.fps).join(" "),
    __SIZES__: sizes.map(shQuote).join(" "),
  });
  const ps = render(psTemplate, {
    ...common,
    __NAMES__: anims.map((a) => psQuote(a.name)).join(", "),
    __TITLES__: anims.map((a) => psQuote(a.title)).join(", "),
    __CREDITS__: anims.map((a) => psQuote(a.credit)).join(", "),
    __FPS__: anims.map((a) => a.fps).join(", "),
    __SIZES__: sizes.map(psQuote).join(", "),
  });
  for (const f of [file, `${file}.sh`]) {
    writeFileSync(join(out, f), sh);
    chmodSync(join(out, f), 0o755);
  }
  writeFileSync(join(out, `${file}.ps1`), ps.replace(/\n/g, "\r\n"));
  return sh.length;
}

const shTemplate = readFileSync(join(root, "tools", "player.template.sh"), "utf8");
const psTemplate = readFileSync(join(root, "tools", "player.template.ps1"), "utf8");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "data"), { recursive: true });

const names = existsSync(animsDir)
  ? readdirSync(animsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  : [];
for (const reserved of ["list", "random", "all", "index", "data"]) {
  if (names.includes(reserved)) throw new Error(`"${reserved}" is a reserved name`);
}
const anims = names.map(loadAnim);

const gallery = [];
for (const a of anims) {
  players(a.name, "single", `"${a.title}"`, [a]);
  const big = a.sizes[a.sizes.length - 1];
  writeFileSync(join(out, "data", `${a.name}.json`), JSON.stringify({
    width: big.width,
    height: big.height,
    plain: big.plain.map((rows) => rows.join("\n")),
    color: big.color.map((rows) => rows.join("")),
  }));
  gallery.push({
    name: a.name,
    title: a.title,
    fps: a.fps,
    frames: a.meta.frames,
    sizes: a.sizes.map(({ width, height }) => ({ width, height })),
    credit: a.meta.credit ?? "",
    license: a.meta.license ?? "",
    sourceUrl: a.meta.sourceUrl ?? "",
  });
}
if (anims.length) {
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`random: ${kb(players("random", "random", "a random animation", anims))}, all: ${kb(players("all", "all", "every animation", anims))}`);
}

writeFileSync(join(out, "anims.json"), JSON.stringify(gallery, null, 2) + "\n");

// Plain-text catalog: `curl -sL <site>/list`
const pad = Math.max(6, ...anims.map((a) => a.name.length));
const list = [
  `live-bash-dance: ${anims.length} animation(s)`,
  "",
  ...anims.map((a) => `  ${a.name.padEnd(pad)}  ${a.title}  (${a.meta.frames} frames, ${a.sizes.map((s) => s.width).join("/")} cols)`),
  `  ${"random".padEnd(pad)}  a different one every run`,
  `  ${"all".padEnd(pad)}  every animation in turn`,
  "",
  "play (macOS / Linux / WSL / Git Bash):",
  `  curl -sL ${siteUrl}<name> | bash`,
  `  curl -sL ${siteUrl}<name> | bash -s -- --color --loops 3 --fps 15 --width 64`,
  "",
  "play (Windows PowerShell):",
  `  irm ${siteUrl}<name>.ps1 | iex`,
  `  & ([scriptblock]::Create((irm ${siteUrl}<name>.ps1))) -Color -Loops 3`,
  "",
].join("\n");
for (const file of ["list", "list.txt"]) writeFileSync(join(out, file), list);

copyFileSync(join(root, "web", "index.html"), join(out, "index.html"));
writeFileSync(join(out, ".nojekyll"), "");

console.log(`built ${anims.length} animation(s) into site/ for ${siteUrl}`);
