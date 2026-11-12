"""Raw Whisper Large v3 words for every benchmark clip (faster-whisper: same weights as Groq's whisper-large-v3,
word times from the same cross-attention DTW as OpenAI's word_timestamps). Saved once; the plugin's own text/timing
post-processing then runs on these in Node (bench.js), so every change is measured on the same raw output.

usage: python3 asr.py <bench dir> <variant> [first N clips]
variants: prompt = the plugin's current Egyptian prompt (baseline) · none = no prompt · neutral = see PROMPTS
"""
import json, sys, os, time
import soundfile as sf
from faster_whisper import WhisperModel

B, variant = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 10 ** 9
PROMPTS = {
    'prompt': 'ده فيديو باللهجة المصرية. إزيكم يا جماعة، اممم، النهارده يعني هنتكلم عن، آآ، حاجة مهمة أوي.',
    'none': None,
}
if variant.startswith('file:'):
    PROMPTS[variant] = open(variant[5:], encoding='utf-8').read().strip()
refs = json.load(open(os.path.join(B, 'clips', 'refs.json')))[:N]
out_dir = os.path.join(B, 'asr', variant.replace('file:', '').replace('/', '_'))
os.makedirs(out_dir, exist_ok=True)
model = WhisperModel(os.path.join(B, 'models', 'fw-large-v3'), device='cpu', compute_type='int8', cpu_threads=4)
t0 = time.time()
for r in refs:
    f = os.path.join(out_dir, r['id'] + '.json')
    if os.path.exists(f):
        continue
    audio, sr = sf.read(r['file'], dtype='float32')  # 16 kHz mono already
    # long files: the way Whisper APIs run them (30 s windows, each conditioned on the text before it)
    segs, info = model.transcribe(audio, language='ar', beam_size=5, temperature=0, word_timestamps=True,
                                  initial_prompt=PROMPTS[variant], vad_filter=False, condition_on_previous_text=r['dur'] > 31)
    segs = list(segs)
    words = [{'text': w.word.strip(), 'start': round(w.start, 3), 'end': round(w.end, 3), 'p': round(w.probability, 3), 'seg': k}
             for k, s in enumerate(segs) for w in (s.words or []) if w.word.strip()]
    seginfo = [{'start': round(s.start, 2), 'end': round(s.end, 2), 'text': s.text.strip(), 'no_speech_prob': round(s.no_speech_prob, 3),
                'avg_logprob': round(s.avg_logprob, 3), 'compression_ratio': round(s.compression_ratio, 3)} for s in segs]
    json.dump({'id': r['id'], 'words': words, 'segments': seginfo}, open(f, 'w'), ensure_ascii=False)
    print(r['id'], len(words), 'words', '%.0fs' % (time.time() - t0), flush=True)
print('DONE', flush=True)
