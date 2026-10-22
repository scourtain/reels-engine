---
name: reel-setup
description: One-time setup for the reels engine, and repair when /reels-engine:reel says a tool is missing. Installs tools, creates the Reels folder, and sets up the member's first reel style through a short interview. Use for "/reels-engine:reel-setup", "set up reels", "reels engine isn't working", or "change my handle or reel length".
---

# Reel setup

ENGINE = `node "${CLAUDE_PLUGIN_ROOT}/engine/bin/reels.js"`
HOME = `$REELS_HOME` if set, otherwise `~/Movies/Reels` on a Mac and `~/Videos/Reels` on Windows. `ENGINE init-home` prints it.
In commands, always put HOME and PROJECT paths in double quotes, written out in full as the engine prints them (a `~` inside quotes does not work). On Windows they have backslashes and often spaces, which break without the quotes.

**On Windows** (check with `uname -s`: it starts with `MINGW` or `MSYS` in Claude Code's shell on Windows), skip steps 1 and 2 below and do this instead:

- **Node and ffmpeg:** check `node --version` (22 or newer) and `ffmpeg -version`. Install what is missing with `winget install --id OpenJS.NodeJS.LTS -e` and `winget install --id Gyan.FFmpeg -e`. Windows may show a "Do you want to allow this app to make changes" window: the member clicks Yes. If a tool still is not found right after installing, the engine also looks in winget's own folder; if `ENGINE doctor` still shows it red, ask the member to close and reopen Claude, then check again.
- **Whisper (the transcriber):** find the Windows download with `curl -s https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest` and take the asset named exactly `whisper-bin-x64.zip`. If no asset has that name, stop and tell the member: "Windows setup needs an update for the newest Whisper download. Sam has been told." Otherwise `mkdir -p "HOME/tools/whisper"`, `curl -L --fail -o "HOME/tools/whisper.zip" <that asset's browser_download_url>`, `/c/Windows/System32/tar.exe -xf "HOME/tools/whisper.zip" -C "HOME/tools/whisper"` (Windows' own tar reads zip files; the tar that comes with Git Bash does not), then delete the zip. Check that `whisper-cli.exe` landed: `ls "HOME/tools/whisper" "HOME/tools/whisper/Release"`. If it is in neither folder, stop and tell the member the same message: "Windows setup needs an update for the newest Whisper download. Sam has been told." `ENGINE doctor` should now show `whisper-cli` green.
- Then continue from step 3 below. In `ENGINE doctor`, the optional `– person cutout` line says "only on a Mac for now": tell the member once, "The two hook looks that put type behind your head are Mac-only for now. The other four work." Do not offer any fix for it.

1. **Homebrew** (the tool installer): check `which brew`, then `/opt/homebrew/bin/brew` and `/usr/local/bin/brew`. If none exists, the member installs it with a normal Mac installer, no Terminal: send them to https://github.com/Homebrew/brew/releases/latest, have them download the file that ends in `.pkg`, double-click it, and click through (it asks for their Mac password in the usual Mac window; you never type or ask for it). Wait for them to say it's done, then check again. If `brew` is still not found by name, call it by its full path (`/opt/homebrew/bin/brew`) for the next step.
2. **Tools:** `brew install node ffmpeg whisper-cpp` (skip what's already there). Then `ENGINE doctor`. Fix anything red using its `fix` hint.
   - A line starting with `–` is optional. `– person cutout` means two hook card looks (type behind your head) are switched off on this Mac; everything else works. Offer the fix once: "Want the two behind-the-head hook looks? Run `xcode-select --install` in Terminal, click Install, then say 'check again'." Do not block setup on it.
3. **Renderer browser + speech model (one-time downloads, about 700MB):** run `npx -y hyperframes@0.8.143 browser ensure`. Then make sure the speech model is there: check for `~/.cache/hyperframes/whisper/models/ggml-small.en.bin` or `HOME/models/ggml-small.en.bin`. If neither exists, download it:
   `mkdir -p "HOME/models" && curl -L --fail -o "HOME/models/ggml-small.en.bin" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin`
4. **Workspace:** `ENGINE init-home`. It prints the Reels folder and never overwrites existing files.
5. **The basics**, one question at a time, saved to `HOME/brand-kit.json` (keep every other key that is already in the file):
   - Instagram handle → `handle`
   - Default reel length in seconds (default 40) → `default_target_seconds`
6. **Vocabulary:** ask for names, tools and brand words they say often (their business name, products, apps). Write them one per line to `HOME/vocabulary.txt` so transcription spells them right.
7. **Their style.** Run the style interview in `../reel-style/references/style-interview.md`: it opens the caption picker page, and what they pick there becomes their default style. Do not ask for an example reel or a link. Skip the interview's naming step: the style is always `main` (write it straight to `HOME/styles/main.json`, no `draft`). Do not offer a second style; they can add one later with /reels-engine:reel-style.
8. Finish with: "You're set. Drag 1-4 clips into the chat and say \"new reel\" (or type /reels-engine:reel)."

Re-running is safe: skip what's done. Only ask the basics again if they want to change them, and send style changes to /reels-engine:reel-style.
