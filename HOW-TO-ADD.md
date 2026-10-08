# How to add an animation

This takes about 5 minutes. You need **Node 18+** and **ffmpeg**:

| OS | install ffmpeg |
|---|---|
| macOS | `brew install ffmpeg` |
| Ubuntu/Debian | `sudo apt install ffmpeg` |
| Windows | `winget install ffmpeg` (or use WSL) |

## 1. Pick a clip

- **Allowed:** public domain, CC0, CC BY (with credit), or footage you shot yourself.
- **Not allowed:** music videos, movies, TV, memes cut from copyrighted video.
- **Good places to look:** [Wikimedia Commons](https://commons.wikimedia.org) (search "Muybridge" for
  classic motion studies), [Pexels](https://www.pexels.com/videos/), [Pixabay](https://pixabay.com/videos/).
- **What looks best:** one subject, a plain background, strong contrast, a 3–8 second loop.

Keep the clip outside the repo, or in it but uncommitted. Video files are gitignored.

## 2. Convert it

```bash
node tools/convert.mjs ~/Downloads/dance.mp4 dance \
  --title "Street Dance" \
  --credit "Jane Doe via Pexels" \
  --license "Pexels License" \
  --source-url "https://www.pexels.com/video/..."
```

The name (`dance`) becomes the URL, so use lowercase letters, digits and dashes. `list`, `random`, `all`, `index`,
`frames` and `data` are reserved.

This writes `anims/dance/` with the frames at three widths (40, 64 and 100 columns), a colour grid for each,
and `meta.json`, which also saves the settings you used.

## 3. Preview and tune

```bash
npm run serve                                   # http://localhost:8000
curl -sL localhost:8000/dance | bash            # in another terminal; Ctrl-C to stop
curl -sL localhost:8000/dance | bash -s -- --color   # check the colour version too
```

If it doesn't look right, re-run with `--reconvert` plus the flag you want to change. It reuses everything else
saved in `meta.json`:

```bash
node tools/convert.mjs ~/Downloads/dance.mp4 dance --reconvert --gamma 2.5
```

| problem | fix |
|---|---|
| subject is a blob, background is busy | add `--invert` (dark subject on a light background) |
| background is full of letters | raise `--gamma` (e.g. `2.5`) |
| subject is too faint | lower `--gamma` (e.g. `1.2`) |
| too wide for your terminal | `--widths 32,56` |
| too long or too big | `--start 2 --duration 5` |
| too fast or too slow | `--fps 8` … `--fps 15` |

## 4. Check and open a PR

```bash
node tools/check.mjs
git add anims/dance
git commit -m "Add dance animation"
```

Open a pull request. A bot comments with a still frame of your animation. Once it's merged, GitHub Actions publishes it, and it shows up in
`curl -sL https://sadhvikchirunomula.github.io/live-bash-dance/list` (or your fork's Pages URL).

## With Claude Code

If you use [Claude Code](https://claude.com/claude-code), run this in the repo:

```
/add-animation ~/Downloads/dance.mp4 dance
```

It converts the clip, tries `--invert` and `--gamma` variants and keeps the best one, asks you for credit and license,
then runs the checks. `/preview` and `/check` are also available.
