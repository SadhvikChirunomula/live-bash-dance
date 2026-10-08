---
name: add-animation
description: Add a new letter-art terminal animation to live-bash-dance from a video/GIF file or URL — convert, tune the look, preview, fill credit/license, and validate. Use when the user wants to add, create, or import an animation.
argument-hint: <clip-path-or-url> <name>
allowed-tools: Bash(node tools/*), Bash(awk *), Bash(ffprobe *), Bash(ffmpeg *), Bash(curl *), Read, Edit
---

# Add an animation

Arguments: `$ARGUMENTS`, in the form `<clip-path-or-url> <name>`. If either is missing, ask for it.
`<name>` must match `^[a-z0-9][a-z0-9-]*$`, must not already exist under `anims/`, and must not be a reserved name
(`list`, `random`, `all`, `index`, `frames`, `data`).

## 1. Rights first

Ask where the clip comes from, unless the URL already makes it obvious, as with Wikimedia Commons, Pexels or Pixabay.
Only proceed for public domain, CC0, CC BY, a permissive stock license, or the user's own footage.
Refuse music videos, films, TV and other copyrighted material, and suggest a free alternative.
You need values for `--credit`, `--license` and, where possible, `--source-url`.

## 2. Get the clip

A local path is used as-is. For a URL, download it into a new empty temp directory, never into the repo.
For a Wikimedia `File:` page, resolve the real file URL with the API:
`https://commons.wikimedia.org/w/api.php?action=query&titles=File:<name>&prop=imageinfo&iiprop=url&format=json`.
Send a User-Agent header (`-A "live-bash-dance"`).
Check it with `ffprobe -v error -show_entries stream=width,height,r_frame_rate,duration -of csv <clip>`.

## 3. Convert and tune

Start with:
```bash
node tools/convert.mjs <clip> <name> --title "<title>" --credit "<credit>" --license "<license>" --source-url "<url>"
```
This writes `anims/<name>/<W>.txt` and `<W>.color.txt` for the default widths 40, 64 and 100, plus `meta.json`,
which saves the settings.
For long clips, add `--start`/`--duration` to pick a 3–8 s loop with the clearest motion.

Inspect the middle frame of the 64-column size:
```bash
awk -v RS='@@FRAME@@\n' '{f[NR]=$0} END{print f[int((NR+1)/2)]}' anims/<name>/64.txt
```
A good frame shows a clearly recognizable silhouette in heavy letters (`gwmNWM`) and a mostly blank background.
- If the subject reads as blank and the background is heavy, re-run with `--invert`.
- If the background is noisy, raise `--gamma` (2.2, then 2.8).
- If the subject is faint, lower it (1.3).

Tune with `--reconvert`, which reuses the settings saved in `meta.json` (credit, trim and so on); flags you pass override them:
```bash
node tools/convert.mjs <clip> <name> --reconvert --invert --gamma 2.2
```
Try at most about 4 variants, keep the best, and show the user that frame.

## 4. Validate and preview

```bash
node tools/check.mjs
```
Fix anything it reports. Then tell the user to watch it in their own terminal. Playback needs a real TTY, so don't
rely on `!` inside Claude Code for this.
```bash
npm run serve        # if not already running
curl -sL localhost:8000/<name> | bash
curl -sL localhost:8000/<name> | bash -s -- --color   # check the colour version too
```

## 5. Wrap up

Report the name, sizes (cols × rows from `meta.json` `sizes`), frames, fps, credit and license.
Remind the user to commit only `anims/<name>/`, never the source clip.
Don't commit or push unless asked.
