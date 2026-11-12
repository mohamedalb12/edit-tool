'use strict';
/*
 * Caption benchmark: the plugin's own text + timing pipeline on raw Whisper Large v3 output (asr.py), scored against
 * the correct text (the dataset) and its forced-aligned word times (align.py).
 *
 *   node bench/captions/bench.js <bench dir> [variant=prompt] [pipeline=current] [--clips N] [--json out.json]
 *
 * Text:   WER / CER (Arabic-normalised: hamza, ة/ه, ى/ي, diacritics), inserted words (said nothing), runs of ≥3 inserts.
 * Words:  |start| / |end| error vs the reference, on words that match exactly (clips whose alignment is confident).
 * Cards:  start / end vs the voice of their first / last word, time shown over pauses > 0.5 s, cards under 0.7 s.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const arabicFix = require(path.join(ROOT, 'core', 'arabicFix'));
const captions = require(path.join(ROOT, 'core', 'captions'));
const pipelines = require('./pipelines');

const args = process.argv.slice(2);
const B = args[0];
const variant = args[1] && !args[1].startsWith('--') ? args[1] : 'prompt';
const pipeName = args[2] && !args[2].startsWith('--') ? args[2] : 'current';
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const maxClips = +(opt('clips') || 1e9);

const norm = w => arabicFix.normalizeForSearch(w).replace(/\s+/g, '');
const tokens = text => String(text).split(/[\s.…،,؟?!:;"«»()\-]+/).map(norm).filter(Boolean);

/** Levenshtein alignment of two token lists → ops [{op:'eq'|'sub'|'ins'|'del', h, r}] (h/r = indices) */
function alignSeq(hyp, ref) {
  const n = hyp.length, m = ref.length, D = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) D[i][0] = i;
  for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (hyp[i - 1] === ref[j - 1] ? 0 : 1));
  const ops = []; let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (hyp[i - 1] === ref[j - 1] ? 0 : 1)) { ops.push({ op: hyp[i - 1] === ref[j - 1] ? 'eq' : 'sub', h: i - 1, r: j - 1 }); i--; j--; }
    else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { ops.push({ op: 'ins', h: i - 1 }); i--; }
    else { ops.push({ op: 'del', r: j - 1 }); j--; }
  }
  return ops.reverse();
}
function editDist(a, b) { return alignSeq(a, b).filter(o => o.op !== 'eq').length; }

const med = a => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

async function main() {
  const refs = JSON.parse(fs.readFileSync(path.join(B, 'clips', 'refs.json'), 'utf8')).slice(+(opt('from') || 0), maxClips);
  const P = pipelines[pipeName];
  if (!P) throw new Error('unknown pipeline ' + pipeName + ' (' + Object.keys(pipelines).join(', ') + ')');
  const T = { words: 0, err: 0, chars: 0, cerr: 0, ins: 0, insRuns: 0, refWords: 0 };
  const dS = [], dE = [], dSP = [], cueS = [], cueSP = [], cueE = [], short = [], perClip = [];
  let cueTime = 0, cueOverPause = 0, cueInside = 0, cues = 0, timedClips = 0, gapWords = 0, gapSec = 0; const gapByKind = {};
  for (const r of refs) {
    const asrFile = path.join(B, 'asr', variant, r.id + '.json');
    if (!fs.existsSync(asrFile)) continue;
    const rawAll = JSON.parse(fs.readFileSync(asrFile, 'utf8')), raw = rawAll.words;
    const words = await P.words(raw, { file: r.file, duration: r.dur, raw: rawAll });
    // text
    const hypT = words.map(w => norm(w.text)), refT = tokens(r.text);
    const ops = alignSeq(hypT.filter(Boolean), refT);
    const hypIdx = hypT.map((t, i) => (t ? i : -1)).filter(i => i >= 0); // ops' h → words index
    const err = ops.filter(o => o.op !== 'eq').length;
    T.refWords += refT.length; T.err += err; T.words += words.length;
    const ce = editDist(hypT.join(' ').split(''), refT.join(' ').split(''));
    T.chars += refT.join(' ').length; T.cerr += ce;
    let run = 0; const ins = ops.filter(o => o.op === 'ins').length; T.ins += ins;
    for (const o of ops) { if (o.op === 'ins') { run++; if (run === 3) T.insRuns++; } else run = 0; }
    // word timing vs the forced-aligned reference
    const refFile = path.join(B, 'ref', r.id + '.json');
    const ref = fs.existsSync(refFile) ? JSON.parse(fs.readFileSync(refFile, 'utf8')) : null;
    const clip = { id: r.id, wer: +(err / Math.max(1, refT.length)).toFixed(3), ins };
    // long files: words inside a known gap (silence / music / noise, 0.25 s in from each edge) were never said
    if (ref && ref.gaps) {
      for (const g of ref.gaps) {
        gapSec += g.end - g.start;
        const inGap = words.filter(w => { const m = (w.start + w.end) / 2; return m > g.start + 0.25 && m < g.end - 0.25; });
        gapWords += inGap.length; gapByKind[g.kind] = (gapByKind[g.kind] || 0) + inGap.length;
        if (inGap.length) (clip.gapWords = clip.gapWords || []).push(g.kind + '@' + g.start.toFixed(0) + ': ' + inGap.map(w => w.text).join(' '));
      }
    }
    if (ref && ref.ok) {
      timedClips++;
      // reference tokens line up 1:1 with tokens(r.text) (same splitter)
      const rw = ref.words.filter(w => norm(w.text));
      const map = new Map(); // words index → ref word
      for (const o of ops) if (o.op === 'eq' && rw[o.r] && rw[o.r].start !== null) map.set(hypIdx[o.h], rw[o.r]);
      // words right after a pause (≥ 0.3 s of no speech in the reference): there the start is unambiguous
      const afterPause = new Set(rw.filter((w, k) => w.start !== null && (k === 0 || (rw[k - 1].end !== null && w.start - rw[k - 1].end >= 0.3))));
      for (const [i, rv] of map) { dS.push(words[i].start - rv.start); dE.push(words[i].end - rv.end); if (afterPause.has(rv)) dSP.push(words[i].start - rv.start); }
      // cards
      const cs = P.cues(words);
      const speech = rw.filter(w => w.start !== null).map(w => [w.start, w.end]);
      for (const c of cs) {
        cues++; const len = c.end - c.start; cueTime += len; if (len < 0.7) short.push(len);
        const idx = c.idx.filter(i => map.has(i));
        if (idx.length && idx[0] === c.idx[0]) { cueS.push(c.start - map.get(idx[0]).start); if (afterPause.has(map.get(idx[0]))) cueSP.push(c.start - map.get(idx[0]).start); }
        if (idx.length && idx[idx.length - 1] === c.idx[c.idx.length - 1]) cueE.push(c.end - map.get(idx[idx.length - 1]).end);
        // a pause > 0.4 s between two of this card's own words: the card shows a word that hasn't been said yet
        const mine = c.idx.filter(i => map.has(i)).map(i => map.get(i));
        for (let k = 0; k + 1 < mine.length; k++) { const g = mine[k + 1].start - mine[k].end; if (g > 0.4) cueInside += g; }
        // time this card is up over a pause > 0.5 s in the reference speech
        for (let k = 0; k + 1 < speech.length; k++) {
          const a = speech[k][1], b = speech[k + 1][0];
          if (b - a > 0.5) cueOverPause += Math.max(0, Math.min(c.end, b) - Math.max(c.start, a));
        }
      }
      clip.dStart = +med(dS.slice(-map.size).map(Math.abs)).toFixed(3);
    }
    perClip.push(clip);
  }
  const abs = a => a.map(Math.abs);
  const within = (a, t) => +(100 * a.filter(x => Math.abs(x) <= t).length / Math.max(1, a.length)).toFixed(1);
  const R = {
    variant, pipeline: pipeName, clips: perClip.length, timedClips,
    hallucination: gapSec ? { wordsInGaps: gapWords, perGapMinute: +(gapWords / (gapSec / 60)).toFixed(1), byKind: gapByKind } : undefined,
    text: { WER: +(100 * T.err / T.refWords).toFixed(1), CER: +(100 * T.cerr / T.chars).toFixed(1), insertedPer100: +(100 * T.ins / T.refWords).toFixed(1), insertRuns3: T.insRuns },
    afterPause: { words: dSP.length, startMedAbs: +med(abs(dSP)).toFixed(3), startP90Abs: +pct(abs(dSP), 0.9).toFixed(3), startBias: +med(dSP).toFixed(3), within150ms: within(dSP, 0.15), cards: cueSP.length, cardEarly200: +(100 * cueSP.filter(x => x < -0.2).length / Math.max(1, cueSP.length)).toFixed(1), cardLate200: +(100 * cueSP.filter(x => x > 0.2).length / Math.max(1, cueSP.length)).toFixed(1) },
    words: { n: dS.length, startMedAbs: +med(abs(dS)).toFixed(3), startP90Abs: +pct(abs(dS), 0.9).toFixed(3), startBias: +med(dS).toFixed(3), endMedAbs: +med(abs(dE)).toFixed(3), endBias: +med(dE).toFixed(3), startWithin100ms: within(dS, 0.1), startWithin200ms: within(dS, 0.2) },
    cards: { n: cues, startMedAbs: +med(abs(cueS)).toFixed(3), startP90Abs: +pct(abs(cueS), 0.9).toFixed(3), startBias: +med(cueS).toFixed(3), early200ms: +(100 * cueS.filter(x => x < -0.2).length / Math.max(1, cueS.length)).toFixed(1), late200ms: +(100 * cueS.filter(x => x > 0.2).length / Math.max(1, cueS.length)).toFixed(1), endMedAbs: +med(abs(cueE)).toFixed(3), endBias: +med(cueE).toFixed(3), overPausePct: +(100 * cueOverPause / Math.max(1e-9, cueTime)).toFixed(1), insidePausePct: +(100 * cueInside / Math.max(1e-9, cueTime)).toFixed(1), avgLen: +(cueTime / Math.max(1, cues)).toFixed(2), under700ms: short.length }
  };
  if (pipelines.dropped && pipelines.dropped.length) R.guardDropped = pipelines.dropped.map(d => path.basename(d.file, '.wav') + '@' + d.start.toFixed(1) + ' ' + d.text + ' (' + d.reason + ')');
  console.log(JSON.stringify(R, null, 1));
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify({ ...R, perClip }, null, 1));
}
module.exports = { alignSeq, tokens, norm };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
