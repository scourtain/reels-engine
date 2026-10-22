# Reels Engine

Turn 1-4 talking-head clips into a finished Instagram reel. Claude does the rough cut, you review it on a simple page (accept or reject each suggested cut, click any word to cut or restore it), and it renders the reel with captions.

## You need
- A Mac (macOS 13 or newer), built and tested on Apple-chip Macs.
- Windows 10 or 11: early support, not yet tested on a PC, so tell Sam how it goes. The two hook looks that put type behind your head are Mac-only. Claude Code on Windows also needs Git for Windows (it brings Git Bash).
- A paid Claude plan, with Claude Code (the **Code** tab in the Claude desktop app works)
- About 1GB free for the tools and the speech model it downloads once

## Install
Everything happens in the Claude desktop app.

1. Start a session in the **Code** tab and paste this:

   > Install the Reels Engine plugin from the GitHub marketplace scourtain/reels-engine.

   Say yes when Claude asks to run the install.
2. **Start a new session in the Code tab** and type `/reels-engine:reel-setup`. It installs what's missing, then helps you set up your caption style: font, colors, and zoom.

Installed an earlier version from a zip? Remove that one first (Customize → Plugins), then do the two steps above. Your Reels folder and your styles stay as they are.

## Make a reel
1. Drag 1-4 clips into the chat
2. Say **"new reel"** (or type `/reels-engine:reel`)
3. Review on the page that opens:
   - work through the suggested cuts at the top (**Cut it** or **Keep it**, and you can hear each one first)
   - click any word to cut or restore it
   - drag lines to reorder
   - leave a note on any line
4. Hit **Send to Claude**.
5. Pick where the captions sit on this reel (above your head, below it, low, or beside your head), then hit **Looks good, render**. Want a different font or colors, or one word at a time? Open **Change the look** on the same screen and watch it on your own video. It updates your style, so your next reels match. Not right yet? Tap **I want to chat about more edits first** and tell Claude what to change before anything renders. You get `final.mp4`, ready to post.

**Hook card (optional).** On the same screen, switch on Hook card to put a line of text over the first few seconds. Pick one of Claude's suggestions or write your own, then pick a look. You see it play on your own video before anything renders. Two of the looks put the words behind your head; those need Apple's command line tools, which setup will offer to install, and they add a minute or two to the render.

Your notes and choices are remembered, so the next rough cut is closer to how you edit.

## The three commands
| Command | What it does |
|---|---|
| `/reels-engine:reel-setup` | One-time setup, or repair if a tool goes missing |
| `/reels-engine:reel` | Edit a new reel, or change the last one |
| `/reels-engine:reel-style` | Change your style, or add another one for a different series |

You can also just say what you want in plain words: "new reel", "make the captions bigger", "make a stories style".

## Your style
Setup ends with a few questions about your look: a font (five to pick from, or your own font file), one word at a time or a few words together, a soft shadow, an outline or plain text, where the captions sit, your caption color and focus color (the word being said), and how much zoom. You pick all of it on one page that shows each choice on your own video. You see it on a few seconds of your own video before you save it. Every reel after that comes out in your style.

Have more than one series? Make a style for each ("tips", "stories"). When you start a reel, Claude asks which one.

Later on, if there's a reel whose look you love, run `/reels-engine:reel-style`, drop in the saved video or a few screenshots, and ask Claude to match it. The font will be the closest match from the five.

## Extras
- **Finish in Instagram Edits:** ask for the clip pack. You get numbered clips with no captions or music. AirDrop them to your phone, select them in order in Edits, tap Captions, add audio.
- **Editor handoff:** ask for the export. You get an FCPXML timeline pointing at your original footage, plus the transcript and a clean cut with nothing added.

## Updating
In the Code tab, say **"update the Reels Engine plugin"**, then start a new session. Your Reels folder, styles, and settings are never touched by an update.

## Good to know
- Everything runs on your own computer (your Mac, or your PC on Windows). Your footage is never uploaded by this tool.
- Usage tracking in the tools underneath is switched off.
- Your original clips are never changed or moved. Adding a clip to the chat doesn't upload or shrink it: the reel is made from the full-quality file on your computer.
- Clips from your phone: AirDrop them to your Mac first. Dragging straight out of the Mac Photos app can hand over a lower-quality copy. On Windows, plug the phone in with a cable and use **Import** in the Windows Photos app, or copy the videos across in File Explorer. Don't send them through a messaging app (those shrink video).
- Prefer a folder? Drop clips in `~/Movies/Reels/inbox/` and say "new reel". On Windows the folder is `Videos\Reels\inbox\` in your user folder.

## Installing with Terminal instead
If the upload isn't available in your Claude app: unzip the download, move the `reels-engine` folder to Documents, then run `claude plugin marketplace add ~/Documents/reels-engine` and `claude plugin install reels-engine@reels-engine` in Terminal, and start a new session. On Windows, run the same two commands in Git Bash (`~/Documents` works there too).

## Credits
Caption fonts are free Google Fonts under the SIL Open Font License; each license file is in `engine/assets/fonts/`. Rendering by [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache 2.0). Transcription by [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT).
