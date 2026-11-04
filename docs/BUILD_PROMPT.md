# EditFast: full build prompt

> **Before you send this to another model:** paste it in full. It describes all of EditFast: both panels (Premiere Pro and After Effects), every tool, how Claude connects, clients, and the hard lessons from bugs found on real After Effects and Premiere. Those lessons matter most; without them the tools look like they work in testing and break in the real program. The prompt is in English on purpose, because models execute precise technical specs better in English. It asks for the panel UI in Egyptian Arabic.

---

## 0. Your role and how to work

You are a senior engineer building **EditFast**, an Adobe CEP extension suite for a professional Egyptian video editor (macOS Apple Silicon, Premiere Pro 26.x, After Effects 26.x; Windows must also work). It is two panels from one codebase:

- **EditFast** for Premiere Pro (bundle `com.editfast.panel`)
- **EditFast Motion** for After Effects (bundle `com.editfast.motion`, installed into its own extension folder next to the first; the Premiere panel copies and refreshes it on boot)

Working rules:
1. Build in phases (section 12). At the end of each phase, run the tests and keep them green before moving on.
2. **Never claim something works on real Premiere / AE unless it was run there.** Build strict simulators (section 10) and an in-app self-test button (section 7.15) so the user can verify on their machine and send you the report.
3. All UI text is **Egyptian Arabic, RTL**, short and friendly. Error messages always say what to do next ("افتح كومب الأول", "حط مفتاح Groq من الإعدادات").
4. No paid or AI call happens without the user asking for that feature. Every AI feature degrades gracefully when its key is missing, and the message names the key.
5. Keys live only on the user's machine (`~/.editfast/settings.json`). They never go in logs, commits, or the packaged zip. Never bundle licensed templates or assets.

---

## 1. Architecture

```
CEP panel (HTML/JS, Node enabled: --enable-nodejs --mixed-context)
 ├─ client/            UI (vanilla JS, no framework), tabs, palette, styles
 ├─ core/              Node modules: services, algorithms, AI clients, ffmpeg, scene language… (pure + testable)
 ├─ host/host.jsx      ExtendScript (ES3) for Premiere — called via CSInterface.evalScript
 ├─ host/ae.jsx        ExtendScript (ES3) for After Effects
 ├─ remotion/          optional "Pro scenes" renderer (React/Remotion) for Premiere overlays
 ├─ mcp/server.js      stdio MCP server for Claude Desktop (no dependencies)
 └─ tests/             unit, host (strict simulators), ui (Playwright), remotion
```

- **Services layer** (`core/services.js` for Premiere, `core/aeServices.js` for AE): every panel action and every AI agent tool goes through it. `services.host(name, args)` calls one ExtendScript function: `ef_call(name, json)` / `efm_call(name, json)` → `{ok, data | error, line}`.
- **Host scripts are ES3 and pure ASCII.** Write all Arabic as `\uXXXX` escapes (see 9.1). Load them with `$.evalFile`, and report a load failure clearly in the status pill.
- **Node in the panel:** use Node's `https`, not browser `fetch`, which CORS blocks inside Premiere. Panels launched from the Dock get a bare PATH, so add Homebrew paths (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`) when looking for ffmpeg, ffprobe, node, yt-dlp, and claude.
- **Offline first:** silence detection, beats, shot detection, transcription fallback (whisper.cpp), tracking, tracing, physics, and audio cleanup all run on the machine with ffmpeg and plain JS.
- **Settings:** `~/.editfast/settings.json` (deep-merged with defaults), plus a cache dir, logs per day, and a copyable "problem report".
- **Auto update:** `updates/latest.json` (version, url, sha256, notes) in the repo. The panel checks it, downloads, verifies the sha256, unzips, and asks for a restart.
- **Packaging:** `scripts/package.js` builds `dist/EditFast-<version>.zip` with a dependency-free zip writer, plus `dist/EditFast.mcpb`. It also ships install scripts for Mac and Windows: enable `PlayerDebugMode` for CSXS 10–12 and copy to the extensions folder.

### UI shell
- A sidebar of tools on the right (RTL), each tool grouping related screens as sub-tabs (chips).
- A glassy dark theme with orange gradient accents, a status pill ("متصل بـ Premiere Pro"), toasts, and a spend counter.
- **⌘K / Ctrl+K command palette** across all tools, with favourites (☆, Ctrl+D) and recents, kept per app.
- Every long action shows live steps ("بيقرا الفريمات… 12/40") and can be cancelled where possible.
- Destructive edits happen **on a copy of the sequence**, and every operation is undoable (an "undo last" that restores).

---

## 2. AI providers and keys (Settings screen)

| Key | Used for | Without it |
|---|---|---|
| OpenRouter (`sk-or-…`) | in-panel agent, director, captions spellfix, B-roll keywords, hooks, chapters, thumbnails, translation, client revisions… | features say "حط مفتاح OpenRouter"; offline fallbacks where they exist |
| Groq (`gsk_…`) | transcription (Whisper large v3 / turbo), word timestamps | falls back to whisper.cpp on the machine |
| ElevenLabs (`sk_…`, not the "Key ID") | AI sound effects, AI music | the offline SFX pack still works |
| fal.ai | AI roto (birefnet), SAM2 masks, depth, image→3D (trellis), flux images, kling video | green-screen keying, estimated depth, manual masks |
| Pexels / Pixabay / Google CSE | B-roll and web media search | Openverse + Wikimedia (free) |

- **A model picker for every AI feature,** or one default model, loaded from OpenRouter's model list. Show price per million tokens, 🛠 for tools, 👁 for vision, and a "test" dot per feature.
- **Cost:** an estimate before running, and a spend counter for today and this month.
- **Key sanity checks:** OpenRouter keys start `sk-or-`. ElevenLabs keys start `sk_`; warn when the user pastes the Key ID instead. Groq keys start `gsk_`.

---

## 3. Premiere Pro panel: every tool

The sidebar groups are: المونتير · Claude · كابشن · القص · الصوت · ريلز · الحركة · جرافيك · مكتبتي · ميديا · التعديلات · الملفات · الإعدادات.

### 3.1 المونتير (AI editor)
- **Chat agent ("EditFast AI")** using OpenRouter tool-calling. Every message carries a live snapshot of the sequence (`<sequence_now>`: tracks, clips, playhead, selection, whether a transcript exists).
  - The agent asks the editor's taste once (`save_style`) and remembers it.
  - Two strengths: strong (24 steps) and max (48 steps plus a self-review pass).
  - The conversation uses prompt caching.
- Agent tools (the same functions as the panel):
  - **State and context:** get_project_state, transcribe (dialects: egyptian, gulf, levantine, iraqi, maghrebi, msa, english), get_transcript, look_at_frames (real frames → vision), set_playhead, undo_last.
  - **Cutting:** remove_fillers, bleep_words (beep / mute / markers), remove_silences, remove_repeats, make_hook.
  - **Captions and text:** add_captions (animated styles), translate_captions, add_title, add_icon.
  - **Motion and scenes:** apply_motion, build_scene, pro_scene (Remotion), edit_scene, style_edit (whole-video style packs), add_template, carousel_3d, liquid_glass.
  - **Media and sound:** place_trendy_sfx, generate_sfx, generate_music, download_video, web_media_search / place, search_broll / place_broll, library_search / place_library_item, auto_effects.
  - **Sound and formats:** clean_audio, duck_music, make_reels, find_shorts / make_short.
  - **Checks and delivery:** safe_zones_check, relink_missing, add_markers, youtube_pack, thumbnail_ideas, chapters, client_revisions.
- **One-click auto edit:**
  1. A plan with toggles: transcribe → remove repeats → silences → hook → clean audio → zoom → B-roll → SFX → captions.
  2. Approve the plan, then watch it run step by step.
  3. Undo restores the whole edit.
- **Auto effects:** the model reads the transcript, suggests SFX and motion per moment, and you review before applying.

### 3.2 كابشن (transcription and captions)
- **Transcription:**
  - Groq (preferred) or whisper.cpp, with word timestamps. Long audio is split into ≤10-min mono 16 kHz FLAC chunks to stay under Groq's 25 MB limit. Retry with backoff on 429.
  - The cache key includes the engine.
  - An optional Arabic spellfix pass: offline rules, plus AI when a key is set.
- **Caption sync:** detect speech onsets so each card starts exactly with the voice (whisper lags by varying amounts). Show clickable words.
- **Animated captions,** rendered on canvas → ProRes 4444 with alpha → placed on a track.
  - 13 styles: karaoke, pop, box, bold, neon, gradient, minimal, typewriter, hormozi, beast, highlighter, outline, lyric.
  - 17 word animations: none, drop, rise, slideStart, slideEnd, zoomIn, pop, bounce, blur, fade, flip, spin, stretch, swing, letters, glitch, wave.
  - Eases, exits, timing (sync / cascade / line), position, size, colours, uppercase, max words / duration per card.
  - Presets: hormozi-pop, box-pop, beast-bounce, clean-highlight, karaoke-tiktok, podcast-minimal, neon-zoom, doc-typewriter, lyric-blur, bold-drop.
  - Proper Arabic shaping and RTL.
- **Other caption output:** Premiere's native caption track (SRT import) as an option, SRT export, and caption translation to a new track with the same timing.
- **Search and markers:** search the transcript (ignoring diacritics and hamza forms), chapters (AI, or offline from silences), markers.

### 3.3 القص (cutting)
- **Quick cut (offline):**
  - ffmpeg `silencedetect` with sensitivity, padding, minimum silence, crossfade frames, and audio tracks to keep.
  - Preview each cut, untick the ones to keep, then razor + ripple on a **copy** of the sequence.
- **Fillers, repeats, and retakes:**
  - Fillers: اممم، آآآ، uh… plus user words like "يعني".
  - Repeats: stutters and retakes, keeping the last take. AI retake detection as an option.
- **Multicam:**
  - Analyse each camera's audio to find who's speaking, then build a switching plan to review.
  - Go wide on crosstalk, plus a periodic wide shot. Set min/max shot length.
- **Beat montage:** offline beat detection (onset + autocorrelation), markers, and cutting clips to the beat.

### 3.4 الصوت (audio)
- **Offline voice cleanup:** denoise, rumble, de-ess, compress, loudness to −16 LUFS, with mild / medium / strong presets.
- **Auto ducking:** volume keyframes on the music under speech, set in dB with attack and release.
- **Audio-energy auto zoom** (no AI): zoom cuts on strong moments, jump or smooth, set scale and gap.

### 3.5 ريلز (reels and shorts)
- **9:16 reframe with face tracking.** Face detection runs in the panel. The crop follows the face smoothly, with a dead zone, a speed limit, and jumps on shot changes.
- **Find shorts** (AI picks 20–60 s segments) → make a short: a new sequence, reframed, captioned.
- **Multi-format export:** In/Out → 16:9, 4:5, and 9:16 sequences, with captions as an option.
- **Safe zones** for Reels, TikTok, and Shorts: overlay the platform UI, check that faces and captions stay clear, and add markers on problems.

### 3.6 الحركة (motion)
- **28 motion presets** that write real keyframes on Transform, at 3 strength levels:
  - Entrances: zoom-in-reveal, zoom-out-reveal, slide-in-left/right/up/down, pop-in, spin-in, whip-in-left, fade-in, drop-in-bounce, elastic-in.
  - Exits: zoom-out-exit, slide-out-left/right, fade-out, pop-out, spin-out, whip-out-right.
  - Emphasis and camera: punch-in, shake, handheld, pulse, heartbeat, ken-burns-left/right, slow-push, glitch-jump.
- **Curves editor:** cubic-bezier presets (ease, easeIn/Out/InOut, expoOut/InOut, backOut/In, elastic, bounce) or a typed bezier, baked onto existing keyframes.
- **Copy/paste attributes:** effects and keyframes between clips, scaled to the target clip's length.

### 3.7 جرافيك (graphics)
- **Template library:** animated texts, liquid glass, UI mockups (notification, search bar…), ready scenes, 3D, collage. Each is a Remotion scene with fields, rendered and placed at the playhead. Favourites.
- **قوالبي من أفتر:** MOGRTs made in the AE panel, with their editable fields (text, colour, slider, checkbox) shown as a form; place with values.
- **Animated titles:** 25 templates placed as MOGRTs with editable text.
- **Animated icon library:** social, editing, cars, real estate, places, business. Each icon has an animation (draw…), colour, badge, label, and background.
- **3D carousel:** ring, coverflow, helix, or stack, made from the video's shots or files.
- **Liquid Glass:** refracting, blurring glass over the video, with specular edges, tint, presets, and an entrance animation. Read the frames → render ProRes 4444 with alpha.
- **Thumbnail maker:** pick the best frames (sharpness, light, shot variety), AI title ideas, and a YouTube-style title render.
- **Pro scenes (Remotion, advanced):**
  - An AI scene director writes a JSON spec from a brief; the component catalog covers text, data, brand, collage, three, backgrounds, and UI.
  - 24 style packs: collage, 3d, neon, minimal, cinematic, popart, glass, social, hormozi, beast, vhs, noir, kinetic, anime, vaporwave, magazine, explainer, tech, luxury, vlog, news, gaming, blueprint, grunge.
  - The scene registry lets the user reopen, edit, and re-render a placed scene, which comes in as layers (a nested sequence).
  - A one-time install of the render engine.

### 3.8 مكتبتي (my library)
- Drop folders in and the library classifies them by itself (SFX, transitions, overlays, music) with thumbnails, tags, favourites, and search. Place an item at the playhead. Rescan, or remove entries without deleting the files.

### 3.9 ميديا (media)
- **Download from a link with yt-dlp:** YouTube, Instagram, TikTok, Pinterest, X.
  - Pick quality and a range (start/end slider).
  - YouTube needs a JS runtime, so detect deno or node and explain if neither is there.
  - Browser cookies for private videos.
  - One-click yt-dlp install and update.
- **B-roll:** Pexels, Pixabay, or a local folder. Download to the cache and place on the timeline.
- **Web search:** Openverse, Wikimedia, Google (with a key), Pexels. Import a result and place it.
- **SFX:**
  - An offline trendy SFX pack generated on the machine: whoosh, riser, impact, pop, glitch… no licence issues.
  - ElevenLabs AI SFX with Arabic → English prompt translation.
  - AI music.

### 3.10 التعديلات (client revisions)
- Paste the client's message → AI splits it into tasks (with timecodes when mentioned) → tick them as done → write a reply message for the client.

### 3.11 الملفات (files)
- **EditFast Link:** find Media Offline items, search the user's folders, relink the confident matches, and list the rest for review.
- **Organize project (offline):** classify everything, show a move plan into bins, and apply it only after approval.

### 3.12 الإعدادات (settings and diagnostics)
- Keys, tool paths (ffmpeg, whisper, model download with progress), transcription engine and model, and the per-feature model picker.
- **Self-test on real Premiere:** generate test media, then run probes (import, place still, razor, transform, captions…). Show a ✓/✗ table plus a copyable report and log tail.

---

## 4. After Effects panel ("EditFast Motion"): every tool

The tabs are: قوالبي · المونتير · Claude · عقارات · لوجو و3D · تراكينج · كاراكتر · مؤثرات · إنفوجرافيك · الحركة · الكلام · إكسبريشن · ثري دي · الروتين · المساعد · مكتبتي · الإعدادات.

### 4.1 قوالبي (MOGRT for Premiere)
- **Scan the active comp:** texts, colours, animated properties, footage, controls.
- **Choose what stays editable:** text, colours (one control per colour), motion (Speed and Strength sliders driving every keyframed property), transform (a rig null: position, scale, opacity), media replacement, and your own Expression Controls.
- **Build a duplicate comp and export it:** the user's comp is never touched. The duplicate goes in the "EditFast Templates" folder with an "EF Controls" guide null, gets exported with `exportAsMotionGraphicsTemplate`, and saves a thumbnail.
- **Shared template index** for the Premiere panel. Templates can be updated (re-exported) or opened again in AE.
- Requires a saved project and "Allow Scripts to Write Files and Access Network"; say so clearly when either is missing.

### 4.2 المونتير (AI director), the core of AE
The user describes a scene in Egyptian Arabic, or attaches a reference (images, video, or a URL fetched with yt-dlp → up to 12 frames + pacing). The AI writes a **scene JSON** in the scene language (section 5), Node validates it, and the host builds **real layers, keyframes, effects, and expressions** that the user can edit.
- **Actions:**
  - **build:** a new comp, or into the open one.
  - **edit:** existing layers by name, with ops `set`, `add`, `replace`, `delete`, `retime(factor)`, and `comp`.
  - **library:** a ready scene with parameters.
- **Self-review loop:** snapshot frames of what was built → the vision model compares them with the request → fix. It remembers the chat.
- **16 library scenes:** kinetic-title, logo-reveal, social-intro, quote-card, number-counter, subscribe, callout, split-reveal, glitch-title, camera-cards, line-logo, particles-title, blob-morph, mask-reveal, burst-loader, promo-3.
- **Style learning:** favourites of scenes the user liked feed later prompts.
- **Plugin awareness:** list the installed effects so the AI can use them by match name.
- **Previews:** build off-screen, save PNG frames, then delete. Animated preview tiles in the library.
- **Also in this tab:**
  - Auto edit from clips + music + style + ratio.
  - **Kinetic typography** from audio (each word appears as it's spoken; styles pop, highlight, stack, typewriter, slide).
  - **"Your voice → video":** script from the recording → timed scenes + captions.
  - **Text→image / video** (fal flux / kling) with optional background removal.

### 4.3 عقارات (real-estate highlight)
Highlight a building or plot in a moving shot.
- **Manual (no key):**
  1. Click the building's corners on a frame.
  2. Each corner is tracked (template matching).
  3. Each frame gets a homography fit by DLT least squares + RANSAC over 4-point subsets, so a corner that slides off or gets covered doesn't drag the outline.
  4. Light temporal smoothing → an animated mask on a copy of the footage.
- **AI (fal SAM2):** one click on the building.
  1. The click is tracked.
  2. Every frame gets a point prompt + the previous frame's mask box.
  3. Read SAM2's output robustly: an alpha mask, black/white of either polarity (the clicked side wins), or a coloured overlay diffed against the original.
  4. Build a matte video → a luma track matte.
- **Looks** (5 presets: blue-rest, bw-rest, gold, color-building, focus):
  - Tint the rest (any colour), or black & white, dim, or blur, while the building stays natural.
  - Or tint the building itself.
  - A glowing outline drawn on with trim paths.
- **Every look value is a slider or colour on "EF Highlight N Controls":** rest colour and opacity, building colour and opacity, dim, blur, feather, outline colour, width, and glow.
- **Info card** that follows the building: a pin null + pulsing dot + stem + card with title, price (formatted currency EGP/SAR/AED…), and area in m².

### 4.4 لوجو و3D (studio)
- **Trace image → vector (like Illustrator Image Trace):**
  1. Decode with ffmpeg.
  2. k-means colour grouping.
  3. Segment, marching-edge contours, smooth, simplify, fit beziers.
  4. Even-odd fill so holes survive.
  - Read SVG files directly (paths, shapes, transforms, gradients → solid fallbacks).
- **Logo animator,** 6 styles: draw (stroke draws with trim paths then the fill comes in), outline, neon (flicker + double glow), build (parts fly in staggered), 3d (extruded + bevel + camera + lights), static (vector import).
- **Morph:** shape A → B (→ C…), from files or the selected layers. Equalise path and point counts, rotate the point order to align, morph the colours too, loop as an option.
- **Photo → 3D:**
  1. Get a depth map: fal depth, or an estimate (with the subject box found by a vision model).
  2. Cut 2–8 depth slices with feathered alpha.
  3. Make 3D layers scaled so the frame looks unchanged from the camera.
  4. Animate the camera: push, orbit, rise, or float.
- **Image → real 3D model** (fal trellis → .glb) in an Advanced 3D comp with a camera and lights.

### 4.5 تراكينج (tracking)
- **Click points on the current frame:**
  - 1 point → position.
  - 2 points → position + scale + rotation (similarity).
  - 4 points → Corner Pin (replace a screen).
- **Modes:** attach (a null, then parent the selected layers or a new text), pin, or stabilize.
- **"AI find object":** a vision model returns points for "الوش" or "الموبايل".
- **AE's own 3D Camera Tracker** via the menu command, and **Place on surface** (4 corners → Corner Pin on a precomp of an image or text).
- **Report** where the track was lost.

### 4.6 كاراكتر (character)
- **Flat rubber-hose character generator,** rigged with sliders. Actions: walk, run, idle, wave, talk, jump. Colours, height, walk across.
- **Auto-rig the user's own layers:**
  - Named roles in EN or AR (head, body, arm L lower…).
  - Joint anchors placed without moving the layer, then parents.
  - A controller with sliders, plus optional 2-bone IK nulls.
- **Lip sync:** voice loudness per frame → a "Mouth" slider, with the mouth closed in silence.

### 4.7 مؤثرات (effects)
- **15 transitions** on every cut between the selected clips (or at the comp time): zoomIn, zoomOut, whipLeft, whipRight, whipUp, spin, glitch, rgb, flash, blur, circle, diagonal, bars, liquid, ink.
- **21 liquid shapes:** blob-calm, blob-energetic, blob-duo, blob-outline, morph-ring, liquid-circle, wave-line, wavy-stripes, water-fill, liquid-progress, drop-splash, drip, bubbles, gooey-dots, lava-lamp, ink-spread, ripple-rings, splash-burst, liquid-button, blob-cluster, blob-reveal.
- **Physics:** a 2D simulation in Node with gravity, bounce, friction, walls, collisions, and rolling for round layers. Modes: drop, fall, explode, float. Keys are baked onto the layers.
- **AI roto:** fal birefnet per frame → a matte video → luma matte under a copy. Or **green/blue screen** with Keylight + Simple Choker.
- **Multi-size render:** 16:9, 9:16, 1:1, 4:5 comps (fill, fit, or fit over a blurred fill), rendered or sent to Media Encoder.
- **Audio react:** loudness → an "EF Audio" Level slider; the selected layers pulse in scale, opacity, or position.

### 4.8 إنفوجرافيك (infographics)
- **Number counter:** a "Count" slider keyed from → to, and the text formatted live by an expression.
  - Formats: number, currency (USD, EUR, GBP, JPY, INR, BTC, EGP, SAR, AED, KWD, QAR, MAD), percent, compact (K/M), time.
  - Arabic digits, prefix and suffix, decimals, separators.
  - Styles: plain, ring, bar, card, slot. Live sample in the UI.
- **Charts from a pasted table:** column, bar, line, area, pie, donut, progress, timeline. Bars grow from the base, values count up, donut slices add up to 100%.

### 4.9 الحركة · الكلام · إكسبريشن · ثري دي · الروتين · المساعد · مكتبتي
- **الحركة:** the 28 motion presets on the selected layers, curves on the selected keys, stagger (frames, order), anchor grid (9 points), null controller.
- **الكلام والأشكال:**
  - Text animators: fadeUp, typewriter, blurIn, scalePop, slideIn, tracking, rotateIn, dropIn; by chars, words, or lines.
  - Shapes: rect, circle, ring, line. Lower third.
  - Explode shape layers (each group becomes a layer), align and distribute, sequence layers, one colour controller for every colour.
- **إكسبريشن بضغطة,** each with its own sliders: wiggle, loopCycle, loopPingpong, bounce (inertial), autoFade, flicker, spin, float, squash, pendulum, typewriter.
- **ثري دي:** camera rigs (push, orbit, dolly), parallax by depth, light rig (key + fill + ambient, shadows), real extrusion for text and shapes.
- **الروتين:** render (H.264, ProRes, alpha) or send to Media Encoder, clean-up (remove unused, organize folders), read the palette and swap colours.
- **المساعد:** a motion assistant chat that plans and runs these tools.
- **مكتبتي:** the shared library.

### 4.10 Scene types that `buildScene` must support
- **Layer types:** text, shape, solid, adjustment, null, footage (image, video, audio, .glb), camera, light, precomp (nested scene), particles (presets incl. dust, sparks, confetti, bokeh, snow, stars, embers), character, plexus, counter, chart, liquid.
- **Shapes:**
  - Parametric rect, ellipse, star, or raw bezier paths (from SVG path data or points).
  - Fill / stroke, gradients, even-odd.
  - Trim paths (including "individually"), repeater, line cap.
- **Masks** (add, subtract, intersect…, feather, expansion) and **track mattes** (alpha, luma, inverted). Parenting, blend modes, motion blur, 3D, extrusion and bevel.
- **Effects** by friendly name (31: blur, glow, shadow, fill, gradient, tint, tritone, directionalBlur, radialBlur, displace, waveWarp, noise, fractalNoise, lightSweep, lightRays, lensFlare, linearWipe, radialWipe, venetianBlinds, echo, posterizeTime, exposure, brightness, vibrance, slider, checkbox, angle, colorControl, pointControl, cornerPin, motionTile). Also raw plugin effects by match name, with an optional `label` so expressions can reference them.
- **Keys:**
  - `[[t, value, ease], …]` with eases linear, easeIn/Out/InOut, expoOut, backOut, quintOut, hold…
  - Key targets: transform props, `text`, `shape:*`, `shape:path.N`, `geometry:*`, `mask:N.*`, `camera:*`, `light:*`, `fx:<name>.<param>`, `fxl:<label>|<param>`.

---

## 5. The scene language (shared by the AI director, the library, and Claude)

```json
{"comp":{"create":true,"name":"…","width":1920,"height":1080,"fps":30,"duration":6,"bg":"#0b0806","renderer":"3d?"},
 "layers":[ /* first = top */
   {"type":"text","name":"Title","text":"أهلاً","size":120,"font":"…","color":"#fff","start":0,"end":6,
    "transform":{"position":["50%","45%"],"scale":100,"opacity":100},
    "keys":{"scale":[[0,0,"backOut"],[0.6,100]],"opacity":[[0,0],[0.3,100]]},
    "textAnimators":[{"preset":"fadeUp","by":"chars","duration":1}],
    "effects":[{"name":"glow","params":{"radius":40}}],
    "expressions":{"rotation":"wiggle(1,2)"}, "parent":"Ctrl", "matte":{"layer":"M","type":"alpha"}, "extrude":{"depth":40,"bevel":4}}]}
```

- **Node `normalize()`:**
  - Validates everything, clamps values, and resolves percentages.
  - Expands composite types (character, plexus, counter, chart, liquid) into real layers.
  - Rejects unsafe expressions (no `system`, `$.`, file access).
  - Rewrites `x--1` as `x- -1`.
  - Never silently truncates an expression; it warns.
  - Returns `{spec, warnings}`.
- **The host builds the spec** and returns `{layers, skipped}`. `skipped` lists every property, effect, or param that couldn't be set, so problems are never silent.
- **A design guide in the prompt:** strong curves (expoOut, backOut, quintOut), never linear except for continuous motion, hierarchy, safe margins, at most 2–3 brand colours, motion blur, staggered entrances. Professional, Behance-level.

---

## 6. Claude integration (MCP), clients, and the in-panel chat

### 6.1 The bridge inside each panel
- A local HTTP server on **127.0.0.1 only**, with a fixed preferred port (47321 for Premiere, 47322 for AE) and a fallback to a free one.
- It writes `~/.editfast/bridge-<app>.json` = `{port, token, pid, version}` with mode 0600, and the token changes every time the panel opens.
- Every request needs `Authorization: Bearer <token>`. It serves only its own app's tools, runs calls **one at a time** (queue), can be **paused**, and reports start, done, error, and seen events to the panel.
- Endpoints:
  - `POST /call {tool, args}` for the stdio server.
  - `POST /mcp`: **MCP streamable HTTP with JSON responses** (initialize, tools/list, tools/call, ping, notifications → 202) for Claude Code launched by the panel.

### 6.2 Tools exposed to Claude (Claude does the thinking, so none of these may need an OpenRouter key)
- **Premiere:**
  - `premiere_guide` (how to edit here + caption, motion, and style lists + the in-panel agent's instructions).
  - `premiere_list_media(folder)` (files with duration and size via ffprobe).
  - `premiere_place_clip(path, time, src_in, duration, kind, track)`: needs **srcIn support** in the host's placeFile (set the item's in/out before overwriteClip, then clear them).
  - `premiere_new_sequence(files)`, `premiere_cut_ranges(ranges)` (on a copy), `premiere_apply_effect(name, kind, duration)`, `premiere_beat_montage`, `premiere_auto_zoom`, `premiere_multi_formats`.
  - Plus every in-panel agent tool that needs no model, prefixed `premiere_`.
- **After Effects:** `ae_guide` (the full scene language + design guide), `ae_status`, `ae_build_scene(scene, where)`, `ae_edit_scene(ops)`, `ae_scene_state`, `ae_look(frames)`, `ae_library_scene(id, params, where)`, `ae_list_media`, and **`ae_tool(name, args)`** with a whitelist of every AE panel tool and its args documented in the description.
- **Clients (both apps):** `*_client_profile`, `*_client_remember(note)`, `*_client_update_style(fields)`. They act on the client picked in the panel, and refuse clearly if none is picked.
- **Images:** `ae_look` and `premiere_look_at_frames` return real frames as MCP image content, so Claude sees its own work and fixes it.

### 6.3 Ways to talk to Claude
- **A. Chat inside the panel (main path, no API key):**
  - The panel spawns **Claude Code** with the user's subscription. Run it in an empty working dir: `claude -p "<msg>" --output-format stream-json --verbose --mcp-config '<json: {"mcpServers":{"editfast":{"type":"http","url":"http://127.0.0.1:PORT/mcp","headers":{"Authorization":"Bearer TOKEN"}}}}>' --strict-mcp-config --tools "" --allowedTools mcp__editfast --append-system-prompt "<role + Egyptian Arabic + client line>" [--resume <session>]`.
  - Parse the stream-json events: init → session_id; assistant text and tool_use; user tool_result; result. Show the steps in Arabic (labels taken from the tools' own descriptions).
  - Remove `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the child's environment so a stray API key never overrides the subscription.
  - **Setup in the tab:** find `claude` (CLAUDE_BIN, PATH, `~/.local/bin`, `~/.claude/local`, `/opt/homebrew/bin`, `/usr/local/bin`, npm/bun/volta dirs, Windows `%APPDATA%\npm`). Get status from `claude --version` and `claude auth status` (JSON, exit 0 when logged in). Buttons open a visible terminal running the install (`curl -fsSL https://claude.ai/install.sh | bash`, or on Windows `irm https://claude.ai/install.ps1 | iex`) or the login.
  - **Login inside Adobe apps fails to refresh** ("OAuth session expired and could not be refreshed"), because the Keychain refresh doesn't work from the Adobe host process. **Fix:** a "make a token" button runs `claude setup-token` (a one-year token, `sk-ant-oat01-…`).
    - The user pastes it into a **textarea**: the terminal wraps the token over 2–3 lines, so rebuild it from a wrapped paste or from the whole terminal output.
    - Store it only in the local settings, and pass it as `CLAUDE_CODE_OAUTH_TOKEN`.
    - A "save and check" button runs one real one-line request.
    - Recognise auth errors anywhere in the stream (assistant text, result, stderr), show the Arabic message plus the token card, and never print the raw English error as if Claude said it.
  - **Chat UX:** Enter sends, Shift+Enter is a new line (respect IME composition). Stop, New chat, example prompts that fill the box, and a live "Claude is thinking". Each tool step is a pill ⏳ → ✓ / ✗ with the error. Pause ⏸ blocks every tool call. There's a "last time Claude used a tool here" status.
- **B. Claude Desktop:** a `.mcpb` bundle (manifest_version 0.3, server type node, entry `server.js`, args `${__dirname}/server.js`, the tool list, an icon). `server.js` is a dependency-free stdio JSON-RPC server that forwards to the panel bridges, has an `editfast_status` tool, and returns a clear Arabic message when a panel isn't open. Build the file and open it from the panel ("ثبّت في Claude Desktop"), and detect whether it's installed.
- **C. Claude Code in a terminal:** show a copyable `claude mcp add editfast -- node "<ext>/mcp/server.js"`.

### 6.4 Clients (العملاء)
- **Storage:** `~/.editfast/clients/<id>.json` = `{id, name, notes, logo, style:{captions, pace, music, colors, fonts, motion, format, sfx}, memory:[{at,text}], sessions:{premiere:{session, messages, seen}, ae:{…}}}`.
- **UI in the Claude tab:**
  - A client picker, "+ عميل" (an inline name field; CEP has no `prompt`/`confirm`), and a "ملفه" editor with every style field, logo picker, notes, and the memory list with ✕ to delete a note.
  - Deleting asks for a second press instead of `confirm`.
- **Each client has its own resumable Claude conversation per app.** Messages are saved and restored when switching. Without a client, use a "general" conversation.
- **The client's profile text goes with the message** whenever it changed since Claude last read it (hash). The system prompt names the client and tells Claude to read the profile first, follow it, and **save every correction or preference** with `client_remember`.

---

## 7. Self-test inside After Effects (the most important verification tool)

The "اختبر كل الأدوات" button, the first card in AE settings, works like this:

1. **Generate test media** in `~/.editfast/selftest` with no AI: a logo PNG (triangle + ring on transparent), two SVGs, a textured street photo with a building and a window grid, a 3 s panning video with audio, a green-screen clip, and a voice WAV.
2. **Host `testBegin`** remembers every project item that already exists, reports the version, renderers, chosen 3D renderer, write permission, and whether the Track Camera menu exists, and returns the expression kinds.
3. **For each of ~171 tool cases,** host `testPrep` makes a fresh scratch comp with its setup (texts, shapes with N groups, footage, solid, keyframes) and selects it.
   - **While testing, `EFM.comp()` returns the scratch comp,** because CEP focus can make `activeItem` the wrong comp. This override expires after 10 minutes so an interrupted test can't hijack later tools.
   - **Select properties after the layers.** Deselecting a layer deselects its properties.
   - Then run the service. Covered: every motion preset sample, eases, every expression, every text preset, shapes, cameras, extrude, every library scene, every logo style, morph, photo 3D moves, all tracking modes, every highlight preset, every character action, lip sync, auto rig, explode, align, sequence, colour rig, palette, audio react, every physics mode, multi-size, green screen, template scan, every counter style × format, every chart, liquid, transition, and kinetic style.
4. **Host `testCheck`** walks every new comp and property. For each expression it evaluates `valueAtTime` and reads AE's own `expressionError` / `expressionEnabled`.
5. **Host `testEnd`** removes only what the test made (comps, then items, then empty folders) and reopens the user's comp.
6. **Report:** "النتيجة: X / Y شغالين", the failures with errors and expression errors, per-group ✓/✗, and notes for skipped bits. It is saved to a file and copyable. Skip on purpose (and say why) anything that saves the project or costs money.

---

## 8. Hard-won lessons: real AE and Premiere behaviour (do these from day one)

1. **AE rebuilds an indexed group whenever you add or remove a property** (effects, masks, shape contents, text animators). Every reference you held to its children becomes "Object is invalid". After every `addProperty` / `remove`, re-fetch by index or name from the layer. For a property you need later, store a *location* (`propertyIndex` path from the layer, plus the layer) and resolve it again. Example: a text animator must be re-fetched after adding the selector and again after each property inside it.
2. **`setTemporalEaseAtKey` takes one KeyframeEase per dimension only for TwoD / ThreeD values.** Spatial position, colour, and shape path take exactly one.
3. **Renderer match names:** in shipping AE, **`ADBE Advanced 3d` is Classic 3D** (no extrusion). The real Advanced 3D is **`ADBE Calder`**, and Cinema 4D is `ADBE Ernst`. A 2024 beta renamed them to `ADBE Classic 3d` / `ADBE Advanced 3d` / `ADBE Cinema 4d`. Pick Calder → (Advanced 3d only if Classic 3d also exists) → Ernst → Cinema 4d, and never Classic 3D for extrusion or .glb.
4. **`loopOut` is not available on Shape Path properties in AE 26** ("loopOut is not a function"). Write the cycle out: `var n=numKeys;var a=n>1?key(1).time:0,d=n>1?key(n).time-a:0;d>0&&time>a+d?valueAtTime(a+(time-a)%d):value`, and the same for ping-pong.
5. **The Slider Control is limited to ±1,000,000.** For bigger numbers, put value / 10ⁿ on the slider and multiply back in the expression (counters, charts).
6. **Never generate `value-` + a negative number** (`value--1*x` is a syntax error). Wrap signed terms in parentheses, and run the normaliser's `--` fix anyway.
7. **Effect param names differ from what you'd write:** "Use Composition’s Shutter Angle" uses a curly apostrophe, and the Transform effect's "Scale" is really "Scale Height". Match names after normalising apostrophes and whitespace, with an alias table, and prefer match names (`ADBE Geometry2-00xx`) where you know them.
8. **Light "Casts Shadows" is `ADBE Casts Shadows`**, not `ADBE Light Casts Shadows`.
9. **Host scripts must be pure ASCII.** `$.evalFile` reads a BOM-less file in the Mac's system encoding, so raw Arabic in string literals comes out garbled in error messages. Write all Arabic as `\uXXXX`, and add a test that fails on any non-ASCII line.
10. **Text→shapes, Track Camera, and similar features are menu commands:** use `app.findMenuCommandId` with a known-ID fallback, and select the right layer first.
11. **`activeItem` can be null or the wrong comp** when the panel has focus. Always resolve "the comp" carefully, and give a clear message ("افتح كومبوزيشن الأول").
12. **Premiere:** set the in/out on the project item before `overwriteClip`, then clear it. Snap times to frames. Pick a free track by range. Ripple deletes only on a copy of the sequence. QE DOM only where needed.
13. **CEP has no `window.prompt` / `confirm`:** use inline UI. Unhandled `audio.play()` promise rejections crash quietly, so catch them.
14. **Adobe apps start with a short PATH.** Search the usual install dirs for every CLI.
15. **AE "Allow Scripts to Write Files and Access Network"** must be on for MOGRT export, render, and snapshots. Check `Pref_SCRIPTING_FILE_NETWORK_SECURITY` and explain it.
16. **Offline media for tests is generated with ffmpeg lavfi** (tones with silences, testsrc, colour plus drawbox).
17. **Check the host scripts against the real APIs:** type-check `ae.jsx` / `host.jsx` with TypeScript `checkJs` against **Types-for-Adobe** (github.com/docsforadobe/Types-for-Adobe, MIT; AE 26 + Premiere 24 typings vendored in the repo). Keep an explicit allowlist of the typings' known false positives, each with its reason. A call to a method that doesn't exist (e.g. `renderQueue.renderAll()`) must fail a test.
18. **When the typings and reality disagree, follow Adobe's official samples** (github.com/Adobe-CEP/Samples, PProPanel). Examples: `markers.createMarker(time)` takes one argument, `marker.setColorByIndex(index)` takes **one** argument (0–7), and `seq.createCaptionTrack(item, start)` works without a format (the format is the number `Sequence.CAPTION_FORMAT_SUBTITLE`, never a string).
19. **Effects dictionary from the user's AE:** an effect param addressed by an index matchName (`ADBE Glo2-0003`) is a guess, and a wrong guess silently sets the wrong param.
   - The host applies every effect the tools use to a throwaway solid and lists each param (matchName, name, group path, including params inside groups such as Fractal Noise > Transform > Scale), then removes everything.
   - Node checks every param the tools set: missing → failure; the name doesn't contain the expected word (e.g. "Radius") → "maybe the wrong param"; plugin not installed → listed.
   - This runs as part of the self-test, and the dictionary is saved to `~/.editfast/ae-effects.json`.
   - Never trust a match-name list from the web; match names can change between AE versions.
20. **Type-check the generated expressions too:** every expression the tools write is checked against the AE expression API with **expression-globals-typescript** (github.com/motiondeveloper/expression-globals-typescript, MIT; vendored). Every member of `Layer`, `Property`, and `PathProperty` is in scope unqualified, plus `thisComp`, `thisLayer`, and `thisProperty`. Unknown functions, misspelled members, and wrong argument counts fail. Known typing gaps (a property used as its value, `random()`'s union return, 2D/3D vectors) are allowlisted with reasons. Example caught: the typewriter used `text.sourceText.substr` instead of `String(value).substr`.
21. **Shot detection = PySceneDetect's AdaptiveDetector** (github.com/Breakthrough/PySceneDetect, BSD-3), ported to Node:
   - Score = the mean HSV delta to the previous frame (OpenCV HSV scale), compared with the mean of 2 frames either side. A cut needs ratio ≥ 3 and score ≥ 15, with a minimum shot length of 0.6 s.
   - Frames stream from ffmpeg at 160 px and 15 fps.
   - Unlike PySceneDetect, the first frame is not a cut, so a cut early in a mid-clip range isn't dropped.
   - A fixed `ffmpeg scene>0.32` both invents cuts in fast pans and misses cuts between dark shots; keep it only as a fallback.
22. **Silence cutting = auto-editor's smoothing** (github.com/WyattBlue/auto-editor, public domain) **+ a threshold measured from the recording:**
   - Stream the peak dBFS per 20 ms.
   - Threshold = the noise floor (15th percentile) + 25–61 % (by sensitivity) of the gap to the speech level (85th percentile). If speech and noise are less than 8 dB apart, there are no pauses to cut.
   - minclip 0.12 s (a click or breath doesn't split a pause); mincut = the minimum pause length.
   - A fixed dB threshold cuts into quiet speech, finds nothing in a noisy room, and leaves clicks splitting pauses.
23. **Studio voice (Auphonic-style), chosen per recording, measured with SI-SDR on real speech (JFK sample):**
   - Profile the pauses (quietest 30 %): mains hum = Goertzel power at 50 / 60 Hz × 3 harmonics more than 10 dB over ±8 Hz; "low" rumble = more than 75 % of noise energy under 400 Hz.
   - Hum → a notch at 4 harmonics + a light FFT pass (+12 dB). Rumble → RNNoise via ffmpeg `arnndn` with the Xiph `std.rnnn` model, shipped in assets (+5 dB). Otherwise → `afftdn`, because RNNoise hurt steady hiss and keyboard clicks.
   - Never notch without hum (−2 dB on a clean voice).
   - Then de-ess → `speechnorm` leveler → gentle compression → two-pass loudnorm (−14 / −16 / −23 LUFS, TP −1.5).
   - Report LUFS, true peak, and noise floor before and after.
   - In ffmpeg filter args, escape model paths (`C\:/…`).
24. **Voice / music separation = Demucs on fal.ai** (`fal-ai/demucs`, about $0.0007/s):
   - Upload ≤ 5-min 192 k MP3 chunks as data URIs. The answer holds stem urls (`{url}` or string) for vocals, drums, bass, and other.
   - Music = the non-vocal stems re-mixed. Check the key before anything else.
25. **Face track:** face-api TinyFaceDetector in the panel (already used for reels) samples faces at 10 fps.
   - Follow one face: start from the biggest one or the clicked one. Each frame, take the nearest face within reach, where reach grows with the time since it was last seen, and **reject a different size (±20 %)**. A passer-by is near for a moment but never the same size.
   - Fill gaps linearly, then a moving average (±2).
   - The result is a null with position and scale keys (scale = face width / first width); the selected layers get parented to it.
26. **AE extras:** relight (adjustment layer with Exposure + a soft-light coloured solid, both masked by a `createPath` ellipse sized from a slider, parented to a null that follows "EF Face"); slow motion (`timeRemapEnabled`, two keys spreading the same source over `span × 100 / speed`, `FrameBlendingType.PIXEL_MOTION`, motion blur); beat cut (`markerProperty.setValueAtTime(t, new MarkerValue(…))`, layers laid one per N beats).

---

## 9. Code conventions
1. ExtendScript is ES3: no `let`/`const`/arrow functions, JSON polyfill, try/catch around optional features, and push every skip into `EFM.warn`, returned as `skipped`.
2. Core Node modules are pure and unit-testable. Side effects go through services. No heavy dependencies; build your own zip, multipart, PNG encoder (`encodePng(w, h, rgba)`), and SVG path parser.
3. Keep comments short: what and why. UI strings in Egyptian Arabic.
4. Every AI call goes through one OpenRouter client with model-per-feature, cost recording, JSON extraction, and retries.

---

## 10. Tests (the strict simulators are what make it work on the real apps)

- **`tests/host/mockAE.js`:** a strict After Effects simulator run in `vm` with the real `ae.jsx`.
  - Layers, property groups, and props with match names. `propertyIndex`, `propertyDepth`, `propertyGroup`, and layer/comp/item APIs, including masks, mattes, `setTrackMatte`, shape groups, text documents, effects, renderers, `findMenuCommandId` / `executeCommand`, import, `duplicate`, render queue, MOGRT export (EGP reads exposed props by location), `saveFrameToPng`.
  - **A Proxy guard that throws "Object is invalid"** on any reference held across `addProperty` / `remove` in the same layer (the pessimistic model).
  - The `setTemporalEaseAtKey` dimension rule, and the slider ±1e6 range.
  - **Expressions:** parse every expression with acorn and switch off bad ones with `expressionError`, as AE does; `loopOut` on a Path → error.
  - **Selection:** `layer.selected` ↔ `comp.selectedLayers`, `prop.selected` ↔ `comp.selectedProperties`, and deselecting a layer clears its props.
- **`tests/host/mockPremiere.js`:** sequences, tracks, track items with in/out, `overwriteClip` honouring the item's in/out, razor and ripple, markers, import, bins, captions, keyframes.
- **Required test suites:**
  - Every scene, liquid, transition, chart, counter style × format, character, particle, text preset, logo style, photo-3D move, and kinetic style builds with **zero skipped**.
  - Every generated expression parses, and every `layer("…")` / `effect("…")` it references exists (dangling-reference check, verified with a negative test).
  - Homography, RANSAC, tracker, trace, morph, physics, transcription (Groq multipart + chunking + 429 retry, mocked fetch), captions, silences, beats, and multicam on real ffmpeg-generated audio and video.
  - The self-test runs end to end on the simulator: 171/171, nothing skipped, the project restored exactly, the user's comp active again.
  - **MCP:** spawn the real stdio server process → bridge → services → simulator (handshake, tool list, no-panel message, AE build + look with images + edit + ae_tool, Premiere list media + place clip from an in-point + cut on a copy + undo). Bridge auth (no token or wrong token → 401, cross-app tool → 404, token file mode 0600). The .mcpb contents.
  - **Panel chat:** a stand-in `claude` script that honours the real flags, reads `--mcp-config`, talks MCP over HTTP to the real bridge, streams stream-json, and simulates an expired login, a setup-token, and `--resume`.
  - Client storage, client tools, and per-client sessions.
  - Token extraction from wrapped and whole-output pastes. **Never use a real token in tests.**
- **UI (Playwright + Chromium):** both panels boot with every tool, every button reaches its service with the right args (recorded stubs), Enter sends, the client flow works, setup and token cards appear, there are **no page errors**, and screenshots are saved to `docs/screenshots`.
- **Regression rule:** when a report from the real app shows a failure, first make the simulator reproduce it exactly (revert the fix, see the same failure), then fix.

---

## 11. Acceptance criteria
- Every tool above exists, is reachable from the UI and ⌘K, and gives clear Arabic messages.
- `npm test` (unit + host) and `npm run test:ui` are fully green. The simulator self-test is 171/171 with nothing skipped.
- On the user's real AE, the self-test report is 100%. When it isn't, the report names each failing tool and its exact error.
- Claude works from **inside the panels** with the user's subscription (no API key) and from Claude Desktop. Each client's style and memory carry across sessions.
- No key or token in the repo, logs, or packages. Host scripts are ASCII. Packaged zip and .mcpb are produced, with install scripts and auto-update.

---

## 12. Build phases
1. Shell: manifests (two bundles), panels, bridge to host (ASCII jsx), services, settings, logs, ⌘K, packaging, auto-update, **strict simulators**, and the test harnesses.
2. Premiere core: transcription (Groq + whisper), captions (styles + native), quick cut, fillers and repeats, audio, motion presets, curves.
3. Premiere AI: agent with tools + vision, auto edit, auto effects, reels and shorts, multicam, beats, B-roll, web, download, SFX, music, thumbnails, revisions, relink, organize, library, templates, titles, icons, carousel, glass, Pro scenes.
4. AE core: scene language + normalize + buildScene/editScene (everything in 4.10), the director with review and references, library scenes, previews.
5. AE studio: trace, SVG, logo animator, morph, photo 3D, image → 3D, tracking, character + rig + lip sync, kit (counter, charts, liquid, transitions), physics, roto and key, multi-size, real estate.
6. MOGRT templates for Premiere.
7. Self-test in AE (section 7), plus the expression and dangling-reference tests.
8. Claude: bridge (HTTP + MCP), tools, stdio server, .mcpb, the panel chat with Claude Code (token login), and clients.
9. Polish: Arabic copy, screenshots, README per version, release.
