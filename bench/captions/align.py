"""Reference word times for the benchmark: the CORRECT text (from the dataset) forced-aligned to the audio with an
Arabic CTC model (wav2vec2-large-xlsr-53-arabic, ONNX) — independent of Whisper. CTC Viterbi over the text's
characters, 20 ms frames. Words with nothing alignable (digits, Latin) keep no time and are skipped when scoring.

usage: python3 align.py <bench dir>   →  <bench>/ref/<id>.json  { words: [{text, start, end, score}], ok }
"""
import json, os, sys, re
import numpy as np, soundfile as sf, onnxruntime as ort

B = sys.argv[1]
M = os.path.join(B, 'models', 'w2v-ar')
vocab = json.load(open(os.path.join(M, 'vocab.json'), encoding='utf-8'))
BLANK, SEP = vocab['<pad>'], vocab['|']
sess = ort.InferenceSession(os.path.join(M, 'onnx', 'model_fp16.onnx'), providers=['CPUExecutionProvider'])
DIAC = re.compile('[ً-ْٰـ]')

def norm_word(w):
    w = DIAC.sub('', w).replace('ٱ', 'ا')
    return ''.join(c for c in w if c in vocab and c not in ('|', '-', '<pad>'))

def words_of(text):
    return [w for w in re.split(r'[\s.…،,؟?!:;"«»()\-]+', text) if w.strip()]

def viterbi(lp, labels):
    """CTC forced alignment: lp [T, V] log-probs, labels [N] → state index per frame in the blank-extended sequence"""
    ext = [BLANK]
    for l in labels: ext += [l, BLANK]
    ext = np.array(ext); S, T = len(ext), lp.shape[0]
    skip = np.zeros(S, bool); skip[2:] = (ext[2:] != BLANK) & (ext[2:] != ext[:-2])
    NEG = -1e30
    dp = np.full(S, NEG); dp[0] = lp[0, ext[0]]; dp[1] = lp[0, ext[1]]
    back = np.zeros((T, S), np.int8)
    for t in range(1, T):
        a = dp; b = np.concatenate(([NEG], dp[:-1])); c = np.concatenate(([NEG, NEG], dp[:-2])); c[~skip] = NEG
        stack = np.stack([a, b, c]); k = stack.argmax(0)
        dp = stack[k, np.arange(S)] + lp[t, ext]; back[t] = k
    s = S - 1 if dp[S - 1] >= dp[S - 2] else S - 2
    path = np.zeros(T, int)
    for t in range(T - 1, -1, -1):
        path[t] = s; s -= int(back[t, s])
    return path, ext

os.makedirs(os.path.join(B, 'ref'), exist_ok=True)
refs = json.load(open(os.path.join(B, 'clips', 'refs.json'), encoding='utf-8'))
for r in refs:
    out = os.path.join(B, 'ref', r['id'] + '.json')
    if os.path.exists(out): continue
    a, sr = sf.read(r['file'], dtype='float32')
    x = (a - a.mean()) / (a.std() + 1e-7)
    logits = sess.run(None, {'input_values': x[None, :]})[0][0].astype(np.float64)
    lp = logits - np.logaddexp.reduce(logits, axis=1, keepdims=True)
    fr = len(a) / sr / lp.shape[0]
    ws = words_of(r['text'])
    labels, owner = [], []  # owner: which word each label belongs to (SEP labels: -1)
    for i, w in enumerate(ws):
        n = norm_word(w)
        if not n: continue
        if labels: labels.append(SEP); owner.append(-1)
        for ch in n: labels.append(vocab[ch]); owner.append(i)
    path, ext = viterbi(lp, labels)
    span = {}
    score = {}
    for t, s in enumerate(path):
        if s % 2 == 1:
            i = owner[(s - 1) // 2]
            if i < 0: continue
            a0, b0 = span.get(i, (t, t)); span[i] = (min(a0, t), max(b0, t))
            score.setdefault(i, []).append(lp[t, ext[s]])
    words = []
    for i, w in enumerate(ws):
        if i in span:
            words.append({'text': w, 'start': round(span[i][0] * fr, 3), 'end': round((span[i][1] + 1) * fr, 3), 'score': round(float(np.mean(score[i])), 3)})
        else:
            words.append({'text': w, 'start': None, 'end': None, 'score': None})
    sc = [w['score'] for w in words if w['score'] is not None]
    ok = bool(sc) and float(np.median(sc)) > -2.5
    json.dump({'id': r['id'], 'ok': ok, 'median_score': round(float(np.median(sc)), 3) if sc else None, 'words': words}, open(out, 'w'), ensure_ascii=False)
    print(r['id'], len(words), 'words', 'ok' if ok else 'LOW', round(float(np.median(sc)), 2) if sc else None, flush=True)
print('DONE')
