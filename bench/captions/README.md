# Caption benchmark (dev only — not shipped in the plugin)

Measures the plugin's caption text and timing on real Egyptian Arabic speech, so every change is kept only when the
numbers say it helps.

- **Data**: `MohamedEssam/Egyptian-ASR-Test-YouTube` (100 YouTube clips, Egyptian dialect, with their text).
- **Whisper**: `asr.py` — Whisper Large v3 (faster-whisper: same weights as Groq's `whisper-large-v3`, word times by
  the same cross-attention method). Saved once per prompt variant; `bench.js` then runs the plugin's own clean-up
  (`core/transcribe.js cleanUp`, `core/captions.js buildCues`) on it.
- **Reference times**: `align.py` — the correct text forced-aligned to the audio with an Arabic CTC model
  (wav2vec2-xlsr-53-arabic, ONNX). Self-check: 2 s of silence inserted mid-clip → every later word moves 2.00 s (±20 ms).
- **Long videos**: `make_long.py` — clips back to back with silence / music / noise between them; any word inside a
  gap was never said (hallucination count).

```
python3 asr.py <dir> prompt 50          # raw Whisper words
python3 align.py <dir>                  # reference word times
node bench.js <dir> prompt plugin       # the plugin now   (pipelines.js: current = before this work)
```
