#!/usr/bin/env node
// Convert a video or GIF into letter-art frames at several widths, plus a colour grid.
// Requires ffmpeg and ffprobe on PATH.
//
//   node tools/convert.mjs <input> <name> [options]
//   node tools/convert.mjs <input> <name> --reconvert     # reuse settings saved in meta.json
//
// Writes anims/<name>/:
//   meta.json          title, fps, frames, sizes, credit, license, sourceUrl, convert settings
//   <W>.txt            letter frames at width W, separated by "@@FRAME@@" lines
//   <W>.color.txt      same layout; each cell is a 2-hex-digit xterm-256 colour index
//
// Options:
//   --widths A,B,C   widths to generate (default 40,64,100; each 16..120)
//   --fps N          frames per second (default: source rate, max 15)
//   --start S        start offset in seconds (default 0)
//   --duration D     seconds to convert (default: whole clip, capped by --max-frames)
//   --max-frames N   hard cap on frames (default 120)
//   --invert         use for dark subjects on a light background
//   --gamma G        contrast curve; >1 pushes the background to blank (default 1.8)
//   --title "..."    display title (default: name)
//   --credit "..."   who made the source clip
//   --license "..."  source license, e.g. "Public domain" or "CC BY 4.0"
//   --source-url U   where the source clip came from
//   --reconvert      start from the settings stored in an existing meta.json

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Letters only, ordered from least to most ink. Space is the empty background.
export const RAMP = " ilrtjfcvxzsunoaeykhdpqbgwmNWM";
export const SEPARATOR = "@@FRAME@@";
export const DEFAULT_WIDTHS = [40, 64, 100];

const MAX_WIDTH = 120;
const MAX_FPS = 15;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`);
  console.error("usage: node tools/convert.mjs <input.mp4|gif> <name> [--widths 40,64,100] [--fps 12] [--start 0] [--duration 8] [--invert] [--gamma 1.8] [--title ..] [--credit ..] [--license ..] [--source-url ..] [--reconvert]");
  process.exit(msg ? 2 : 0);
}

function parseArgs(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) usage(`${a} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case "-h": case "--help": usage(); break;
      case "--widths": opts.widths = val().split(",").map(Number); break;
      case "--width": opts.widths = [Number(val())]; break;
      case "--fps": opts.fps = Number(val()); break;
      case "--start": opts.start = Number(val()); break;
      case "--duration": opts.duration = Number(val()); break;
      case "--max-frames": opts.maxFrames = Number(val()); break;
      case "--invert": opts.invert = true; break;
      case "--gamma": opts.gamma = Number(val()); break;
      case "--title": opts.title = val(); break;
      case "--credit": opts.credit = val(); break;
      case "--license": opts.license = val(); break;
      case "--source-url": opts.sourceUrl = val(); break;
      case "--reconvert": opts.reconvert = true; break;
      default:
        if (a.startsWith("--")) usage(`unknown option ${a}`);
        pos.push(a);
    }
  }
  if (pos.length !== 2) usage("expected <input> and <name>");
  [opts.input, opts.name] = pos;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(opts.name)) usage("name must be lowercase letters, digits and dashes (it becomes the URL)");
  if (["list", "random", "all", "index", "frames", "data"].includes(opts.name)) usage(`"${opts.name}" is reserved`);

  // Saved settings first, then anything given on the command line wins.
  let saved = {};
  const metaPath = join(root, "anims", opts.name, "meta.json");
  if (opts.reconvert) {
    if (!existsSync(metaPath)) usage(`--reconvert: ${metaPath} not found`);
    const m = JSON.parse(readFileSync(metaPath, "utf8"));
    saved = { ...m.convert, title: m.title, credit: m.credit, license: m.license, sourceUrl: m.sourceUrl };
  }
  const defaults = { widths: DEFAULT_WIDTHS, start: 0, maxFrames: 120, invert: false, gamma: 1.8 };
  const set = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
  const o = { ...defaults, ...saved, ...set };

  o.widths = [...new Set(o.widths)].sort((x, y) => x - y);
  if (!o.widths.length || o.widths.some((w) => !(Number.isInteger(w) && w >= 16 && w <= MAX_WIDTH))) usage(`--widths must be integers 16..${MAX_WIDTH}`);
  if (o.fps !== undefined && !(o.fps >= 1 && o.fps <= MAX_FPS)) usage(`--fps must be 1..${MAX_FPS}`);
  if (!(o.gamma > 0 && o.gamma <= 5)) usage("--gamma must be 0..5");
  if (!(o.maxFrames >= 1 && o.maxFrames <= 200)) usage("--max-frames must be 1..200");
  return o;
}

function probe(input) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate",
    "-of", "json", input,
  ]).toString();
  const s = JSON.parse(out).streams?.[0];
  if (!s) throw new Error(`no video stream in ${input}`);
  const [num, den] = s.r_frame_rate.split("/").map(Number);
  return { width: s.width, height: s.height, fps: den ? num / den : 10 };
}

// xterm-256 palette: 6x6x6 cube (16..231) and 24 greys (232..255).
const CUBE = [0, 95, 135, 175, 215, 255];
export function xtermRgb(i) {
  if (i >= 232) { const v = 8 + (i - 232) * 10; return [v, v, v]; }
  const c = i - 16;
  return [CUBE[Math.floor(c / 36)], CUBE[Math.floor(c / 6) % 6], CUBE[c % 6]];
}
function nearestCube(v) {
  let best = 0;
  for (let i = 1; i < 6; i++) if (Math.abs(CUBE[i] - v) < Math.abs(CUBE[best] - v)) best = i;
  return best;
}
function toXterm(r, g, b) {
  const ci = 16 + 36 * nearestCube(r) + 6 * nearestCube(g) + nearestCube(b);
  const grey = Math.min(23, Math.max(0, Math.round(((r + g + b) / 3 - 8) / 10)));
  const gi = 232 + grey;
  const d = (i) => { const [x, y, z] = xtermRgb(i); return (x - r) ** 2 + (y - g) ** 2 + (z - b) ** 2; };
  return d(gi) < d(ci) ? gi : ci;
}
// Keep the pixel's hue, but make it bright and a bit more saturated: letter density
// already carries brightness, and dark colours vanish on a dark terminal.
function tint(r, g, b) {
  const grey = (r + g + b) / 3;
  const boost = (c) => grey + (c - grey) * 1.6;
  let [x, y, z] = [boost(r), boost(g), boost(b)];
  const m = Math.max(x, y, z, 1);
  const k = 235 / m;
  [x, y, z] = [x * k, y * k, z * k].map((c) => Math.min(255, Math.max(0, c)));
  return toXterm(x, y, z);
}

function extract(o, src, fps, cols) {
  // Terminal cells are roughly twice as tall as wide, so halve the row count.
  const rows = Math.max(2, Math.round((src.height * cols) / src.width / 2));
  const args = ["-nostdin", "-v", "error"];
  if (o.start) args.push("-ss", String(o.start));
  if (o.duration) args.push("-t", String(o.duration));
  args.push(
    "-i", o.input,
    "-vf", `fps=${fps},scale=${cols}:${rows}:flags=area,format=rgb24`,
    "-frames:v", String(o.maxFrames),
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
  );
  const res = spawnSync("ffmpeg", args, { maxBuffer: 1 << 28 });
  if (res.status !== 0) throw new Error(`ffmpeg failed: ${res.stderr}`);
  const size = cols * rows * 3;
  const count = Math.floor(res.stdout.length / size);
  if (count === 0) throw new Error("ffmpeg produced no frames");
  return { buf: res.stdout, rows, count };
}

export function convertWidth(o, src, fps, cols) {
  const { buf, rows, count } = extract(o, src, fps, cols);
  const cells = cols * rows;
  const luma = new Uint8Array(count * cells);
  for (let i = 0; i < luma.length; i++) {
    luma[i] = Math.round(0.299 * buf[i * 3] + 0.587 * buf[i * 3 + 1] + 0.114 * buf[i * 3 + 2]);
  }

  // Auto-contrast: stretch the 2nd..98th percentile of the whole clip to the full ramp.
  const hist = new Uint32Array(256);
  for (const v of luma) hist[v]++;
  const pct = (p) => {
    const target = luma.length * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= target) return v;
    return 255;
  };
  const lo = pct(0.02);
  const hi = Math.max(pct(0.98), lo + 1);

  const letters = [];
  const colors = [];
  for (let f = 0; f < count; f++) {
    const lrows = [];
    const crows = [];
    for (let y = 0; y < rows; y++) {
      let line = "";
      let cline = "";
      for (let x = 0; x < cols; x++) {
        const i = f * cells + y * cols + x;
        let v = Math.min(1, Math.max(0, (luma[i] - lo) / (hi - lo)));
        if (o.invert) v = 1 - v;
        v = v ** o.gamma;
        line += RAMP[Math.round(v * (RAMP.length - 1))];
        cline += tint(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]).toString(16).padStart(2, "0");
      }
      lrows.push(line);
      crows.push(cline);
    }
    letters.push(lrows.join("\n"));
    colors.push(crows.join("\n"));
  }
  return { letters, colors, rows, count };
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const src = probe(o.input);
  const fps = Math.round(o.fps ?? Math.min(Math.max(src.fps, 1), MAX_FPS));

  const dir = join(root, "anims", o.name);
  mkdirSync(dir, { recursive: true });
  // Drop old generated frame files so removed widths don't linger.
  for (const f of readdirSync(dir)) if (/^(\d+(\.color)?\.txt|frames\.txt)$/.test(f)) rmSync(join(dir, f));

  const sizes = [];
  let frames = 0;
  for (const w of o.widths) {
    const { letters, colors, rows, count } = convertWidth(o, src, fps, w);
    writeFileSync(join(dir, `${w}.txt`), letters.join(`\n${SEPARATOR}\n`) + "\n");
    writeFileSync(join(dir, `${w}.color.txt`), colors.join(`\n${SEPARATOR}\n`) + "\n");
    sizes.push({ width: w, height: rows });
    frames = count;
  }

  const meta = {
    title: o.title ?? o.name,
    fps,
    frames,
    sizes,
    credit: o.credit ?? "",
    license: o.license ?? "",
    sourceUrl: o.sourceUrl ?? "",
    convert: {
      widths: o.widths,
      invert: o.invert,
      gamma: o.gamma,
      start: o.start,
      ...(o.duration ? { duration: o.duration } : {}),
      ...(o.fps ? { fps: o.fps } : {}),
      maxFrames: o.maxFrames,
    },
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(`wrote anims/${o.name}: ${frames} frames at ${fps} fps, sizes ${sizes.map((s) => `${s.width}x${s.height}`).join(" ")}`);
  if (!meta.credit || !meta.license) {
    console.log("note: add credit and license before opening a PR (see HOW-TO-ADD.md)");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
