# Contributing

Step-by-step instructions for adding an animation: **[HOW-TO-ADD.md](HOW-TO-ADD.md)**.

Short version:

1. Use only clips you're allowed to share: public domain, CC0, CC BY or your own footage.
2. Run `node tools/convert.mjs <clip> <name> --title .. --credit .. --license .. --source-url ..`
   Tweak with `--reconvert` plus the flags you want to change.
3. Run `node tools/check.mjs`. It must pass (CI runs it on every PR).
4. Commit `anims/<name>/` only, not the source video, and open a PR.

If you change the tools, keep them free of npm dependencies and keep the bash player bash 3.2 compatible and the PowerShell player working on 5.1 (see `CLAUDE.md`).
With Claude Code, the `/add-animation`, `/preview` and `/check` commands are available in this repo.
