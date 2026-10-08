---
name: preview
description: Build the live-bash-dance site and serve it locally on port 8000 so the user can watch animations with curl | bash or in the browser gallery.
argument-hint: "[name]"
allowed-tools: Bash(node tools/*), Bash(python3 -m http.server *), Bash(curl *)
---

# Preview locally

1. Run `node tools/build.mjs`.
2. Check whether something already serves the site: `curl -s -o /dev/null -w '%{http_code}' localhost:8000/list`.
   If that returns 200, reuse the server; the rebuild is picked up automatically.
   Otherwise start `python3 -m http.server -d site 8000` in the background, using run_in_background.
3. Show `curl -sL localhost:8000/list`.
4. Tell the user to run the following in **their own terminal**. Playback needs a real TTY; under `!` it only prints one frame.
   - `curl -sL localhost:8000/<name> | bash`, where `<name>` is `$ARGUMENTS` if given, otherwise the first animation listed.
   - Ctrl-C stops it. Add `-s -- --color --loops 3 --fps 15` to change playback; `--width N` caps the size.
   - `curl -sL localhost:8000/random | bash` plays a random one; `curl -sL localhost:8000/all | bash` plays them all in turn.
   - In PowerShell: `irm http://localhost:8000/<name>.ps1 | iex`.
   - The browser gallery is at http://localhost:8000/, with colour and bash/PowerShell toggles.
