"""Long "videos" for the hallucination / chunking checks: benchmark clips back to back with what real edits have
between the talking — silence, background music (synthetic chords + beat), room noise — at known places, so the
reference text and word times stay exact (each clip's forced alignment shifted by where it was put).

usage: python3 make_long.py <bench dir> <out dir> [videos=3] [clips per video=10]
"""
import json, os, sys
import numpy as np, soundfile as sf

B, O = sys.argv[1], sys.argv[2]
NV = int(sys.argv[3]) if len(sys.argv) > 3 else 3
NC = int(sys.argv[4]) if len(sys.argv) > 4 else 10
SR = 16000
rng = np.random.default_rng(7)
os.makedirs(os.path.join(O, 'clips'), exist_ok=True); os.makedirs(os.path.join(O, 'ref'), exist_ok=True)
for d in ('models',):
    if not os.path.exists(os.path.join(O, d)): os.symlink(os.path.join(B, d), os.path.join(O, d))
refs = [r for r in json.load(open(os.path.join(B, 'clips', 'refs.json'), encoding='utf-8'))
        if json.load(open(os.path.join(B, 'ref', r['id'] + '.json'), encoding='utf-8'))['ok']]

def music(sec, level=0.05):
    t = np.arange(int(sec * SR)) / SR
    chords = [(220, 277, 330), (196, 247, 294), (175, 220, 262), (196, 247, 294)]
    y = np.zeros_like(t)
    for k, ch in enumerate(chords * int(sec // 8 + 1)):
        m = (t >= k * 2) & (t < k * 2 + 2)
        for f in ch: y[m] += np.sin(2 * np.pi * f * t[m]) / 3
    kick = np.sin(2 * np.pi * 60 * t) * np.exp(-20 * (t % 0.5))
    return (level * (0.6 * y + 0.8 * kick)).astype(np.float32)

def gap(kind, sec):
    n = int(sec * SR)
    if kind == 'silence': return np.zeros(n, np.float32)
    if kind == 'noise': return (rng.standard_normal(n) * 0.004).astype(np.float32)
    return music(sec)

out = []
for v in range(NV):
    parts, words, text, gaps, t = [], [], [], [], 0.0
    pick = refs[v * NC:(v + 1) * NC]
    for i, r in enumerate(pick):
        kind = ['silence', 'music', 'noise'][i % 3]
        g = gap(kind, [2.0, 3.5, 6.0, 1.5][i % 4]); parts.append(g); gaps.append({'start': round(t, 3), 'end': round(t + len(g) / SR, 3), 'kind': kind}); t += len(g) / SR
        a, _ = sf.read(r['file'], dtype='float32'); parts.append(a)
        for w in json.load(open(os.path.join(B, 'ref', r['id'] + '.json'), encoding='utf-8'))['words']:
            words.append({**w, 'start': None if w['start'] is None else round(w['start'] + t, 3), 'end': None if w['end'] is None else round(w['end'] + t, 3)})
        text.append(r['text']); t += len(a) / SR
    tail = music(8.0); parts.append(tail); gaps.append({'start': round(t, 3), 'end': round(t + 8.0, 3), 'kind': 'music'}); t += 8.0  # an outro with music only
    vid = 'long%d' % v
    f = os.path.join(O, 'clips', vid + '.wav'); sf.write(f, np.concatenate(parts), SR, subtype='PCM_16')
    json.dump({'id': vid, 'ok': True, 'words': words, 'gaps': gaps}, open(os.path.join(O, 'ref', vid + '.json'), 'w'), ensure_ascii=False)
    out.append({'id': vid, 'file': f, 'sr': SR, 'dur': round(t, 2), 'text': ' '.join(text)})
    print(vid, round(t, 1), 's', len(words), 'words')
json.dump(out, open(os.path.join(O, 'clips', 'refs.json'), 'w'), ensure_ascii=False)
