---
name: check
description: Run live-bash-dance pre-PR checks (metadata and size validation, build, shellcheck and smoke tests of the bash and PowerShell players) and explain or fix failures.
allowed-tools: Bash(node tools/*), Bash(shellcheck *), Read, Edit
---

# Pre-PR check

Run `node tools/check.mjs`. It validates each `meta.json` and its `sizes`, builds the site, runs shellcheck on the bash
players and smoke-tests them, and smoke-tests the PowerShell player if `pwsh` is installed. CI runs the same script on every PR.

- If it passes, say so in one line and list the animations it built.
- If it fails, explain each problem and fix what can be fixed safely:
  - **Missing `credit`/`license`/`title` in `meta.json`:** ask the user for the real values. Never invent a license.
  - **Non-letter characters, or limits exceeded** (width over 120, more than 200 frames, player over 1024 KB):
    regenerate with `node tools/convert.mjs <clip> <name> --reconvert` plus smaller `--widths`, fewer `--max-frames`
    or a shorter `--duration`. Never hand-edit `<W>.txt` or `<W>.color.txt`.
  - **Missing `sizes`, or a missing `<W>.txt`/`<W>.color.txt`:** re-run `tools/convert.mjs` for that animation.
  - **Stale old-format frames file:** delete it; the per-width files replace it.
  - **shellcheck warnings or a failing bash smoke test:** fix them in `tools/player.template.sh`, not in `site/`.
    Keep the player bash 3.2 compatible: no mapfile, no associative arrays.
  - **Failing pwsh smoke test:** fix `tools/player.template.ps1`. Keep it Windows PowerShell 5.1 compatible.

Then re-run until it passes.
