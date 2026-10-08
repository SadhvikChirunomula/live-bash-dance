# live-bash-dance

Lifelike terminal animations drawn only with letters (A–Z, a–z), converted from real video and served
as static files on GitHub Pages. Users run `curl -sL <site>/<name> | bash` (or `irm <site>/<name>.ps1 | iex` in PowerShell). The URL serves a
script with the frames embedded, and it plays them locally. There is no server: GitHub Pages can't stream, so
don't propose one unless asked.

## Commands

```bash
node tools/convert.mjs <clip> <name> [flags]   # video/GIF -> anims/<name>/  (needs ffmpeg + ffprobe)
node tools/convert.mjs <clip> <name> --reconvert --gamma 2.5   # reuse saved settings, override some
node tools/build.mjs                           # anims/* -> site/
node tools/check.mjs                           # metadata + build + shellcheck + player smoke tests; run before any PR
npm run serve                                  # build, then serve site/ on http://localhost:8000
curl -sL localhost:8000/list                   # what's available (also /random and /all)
curl -sL localhost:8000/<name> | bash -s -- --color --loops 1   # also --fps N, --width N, --seconds N (/all)
```

## Layout

- `anims/<name>/<W>.txt`: generated letter frames at width W, separated by `@@FRAME@@` lines. Committed. Never hand-edit; regenerate.
- `anims/<name>/<W>.color.txt`: same layout, two hex digits per cell, each an xterm-256 colour index.
- `anims/<name>/meta.json`: title, fps, frames, `sizes: [{width, height}]`, credit, license, sourceUrl, `convert` (saved settings for `--reconvert`).
- `tools/convert.mjs`: ffmpeg -> grayscale -> letter ramp `" ilrtjfcvxzsunoaeykhdpqbgwmNWM"`, plus colour. Default `--widths 40,64,100`;
  `--width N` gives one size. Reserved names: list, random, all, index, frames, data.
- `tools/player.template.sh`, `tools/player.template.ps1`: the bash and PowerShell players. `build.mjs` fills the `__PLACEHOLDERS__`.
  They pick the largest size that fits the terminal.
- `tools/build.mjs`: writes `site/<name>[.sh|.ps1]`, `site/random[.sh|.ps1]`, `site/all[.sh|.ps1]`, `site/list`, `site/data/<name>.json`,
  `site/anims.json`, `site/index.html`.
- `web/index.html`: browser gallery with colour and bash/PowerShell toggles; loads `site/data/<name>.json`. Vanilla JS, no dependencies.
- `site/`: build output, gitignored.
- CI: `check.yml` runs `check.mjs` on every PR. `preview.yml` (pull_request_target) comments a middle frame of each changed
  animation on PRs touching `anims/`; it never checks out or runs PR code, so keep it that way. `pages.yml` checks, builds
  and deploys on push to `main`.

## Rules

- **Copyright:** only public domain, CC0, CC BY or the contributor's own footage. Never add music videos, films,
  TV, Rick Astley and the like. `credit` and `license` in `meta.json` are mandatory.
- **Frames:** letters and spaces only, at most 120 columns, at most 200 frames, each player at most 1024 KB.
  `build.mjs` and `check.mjs` reject anything else, which also keeps the heredoc in the player safe. A leftover
  single-file frames file from the old format fails the check; delete it.
- **Player safety:** the bash player must stay bash 3.2 compatible for stock macOS. That means no `mapfile`, no `declare -A`
  and no `${var,,}`. It must not make network calls, write files or use `eval`. It must restore the cursor and screen
  on exit and on Ctrl-C. All work happens inside `main`, called on the last line, so a truncated download does nothing.
  The PowerShell player has the same no-network, no-files rules, restores the cursor in `finally`, and must run on
  Windows PowerShell 5.1.
- **Dependencies:** zero npm dependencies. The tools use Node built-ins only.
- **Source clips:** don't commit them. `.gitignore` excludes `*.mp4`, `*.gif` and similar.
- **Downloads:** put downloaded source clips in a scratch or temp directory, not in the repo.

## Slash commands (`.claude/skills/`)

- `/add-animation <clip-or-url> <name>`: convert, tune, preview and validate a new animation.
- `/preview [name]`: build and serve locally, then print the commands to watch it.
- `/check`: run the pre-PR checks and explain any failures.

Current animations (all Muybridge, public domain): horse, waltz, dancer, buffalo, lion, mule.

Human-facing guide: `HOW-TO-ADD.md`.
