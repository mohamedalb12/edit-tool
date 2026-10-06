'use strict';
// Style packs, templates, trendy SFX synth, yt-dlp downloader, web search, safe zones, relink, icons, prompt caching.
const { TMP, mockResponse } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('style packs: detected from free text, applied by the validator, explained to the director', () => {
  const packs = require('../../core/stylePacks'), pro = require('../../core/proScene');
  assert.equal(packs.detect('مونتجه بستايل كولاج آرت'), 'collage');
  assert.equal(packs.detect('عايزه 3D'), '3d');
  assert.equal(packs.detect('ستايل ثري دي'), '3d');
  assert.equal(packs.detect('cinematic documentary'), 'cinematic');
  assert.equal(packs.detect('عادي'), null);
  assert.equal(packs.list().length, 8);
  const s = pro.normalize({ style: 'collage', elements: [{ type: 'collage', props: { media: ['@1', '@0', '@9', 'C:\\x\\a.png', 'rm -rf'], title: 'رحلة' } }] }, { media: ['/f/0.jpg', '/f/1.jpg'] });
  assert.equal(s.background.type, 'paper');
  assert.equal(s.theme.background, '#F3EADB');
  assert.deepEqual(s.elements[0].props.media, ['/f/1.jpg', '/f/0.jpg', 'C:\\x\\a.png']);
  assert.equal(s.vignette, false); assert.equal(s.style, 'collage');
  // the editor's own colours in the spec still win over the pack
  assert.equal(pro.normalize({ style: '3d', theme: { primary: '#123456' }, elements: [{ type: 'text3D' }] }).theme.primary, '#123456');
  assert.equal(pro.normalize({ style: 'cinematic', elements: [{ type: 'quote' }] }).letterbox, true);
  const sys = pro.DIRECTOR_SYSTEM('3d');
  assert.match(sys, /carousel3D/); assert.match(sys, /ثري دي/); assert.doesNotMatch(sys, /- icon \(/);
  // icon svg is sanitised
  const ic = pro.normalize({ elements: [{ type: 'icon', props: { svg: '<path d="M1 1" onload="x()"/><script>alert(1)</script>' } }] });
  assert.equal(ic.elements[0].props.svg, '<path d="M1 1"/>');
});

test('templates: every template is a valid scene; texts and media fill in', () => {
  const T = require('../../core/templates'), pro = require('../../core/proScene');
  assert.ok(T.TEMPLATES.length >= 30);
  const ids = new Set();
  for (const t of T.TEMPLATES) {
    assert.ok(!ids.has(t.id), 'unique ' + t.id); ids.add(t.id);
    assert.ok(T.CATS.find(c => c.id === t.cat), t.id);
    const n = pro.normalize(t.spec);
    assert.equal(n.elements.length, t.spec.elements.length, t.id);
    if (t.overlay) assert.equal(n.background.type, 'transparent', t.id);
  }
  const t = T.get('t-cube');
  const f = T.fields(t);
  assert.deepEqual(f.map(x => x.key), ['prefix', 'words']); assert.equal(f[1].list, true);
  const spec = T.fill(t, { values: { '0.words': 'واحد، اتنين', '0.prefix': 'إحنا' }, duration: 7 });
  assert.deepEqual(spec.elements[0].props.words, ['واحد', 'اتنين']); assert.equal(spec.duration, 7);
  assert.equal(T.mediaNeed(T.get('c-collage')), 4); assert.equal(T.mediaNeed(T.get('t-rise')), 0);
  const c = T.fill(T.get('c-polaroid'), { media: ['/a.jpg', '/b.jpg'] });
  assert.deepEqual(c.elements[0].props.media, ['/a.jpg']);
  assert.equal(T.get('c-collage').spec.elements[0].props.media.length, 0, 'the catalog itself is never mutated');
});

test('trendy SFX pack: 30 sounds synthesized offline as clean 48k stereo WAVs', () => {
  const P = require('../../core/sfxPack');
  const dir = path.join(TMP, 'sfxpack');
  const files = P.generate(dir);
  assert.equal(files.length, 30);
  for (const f of files) {
    const b = fs.readFileSync(f.file);
    assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.readUInt32LE(24), 48000); assert.equal(b.readUInt16LE(22), 2);
    const n = (b.length - 44) / 4, sec = n / 48000;
    assert.ok(sec > 0.005 && sec < 6, f.id + ' ' + sec);
    let peak = 0; for (let i = 44; i < b.length; i += 2) peak = Math.max(peak, Math.abs(b.readInt16LE(i)));
    assert.ok(peak > 28000 && peak < 29500, f.id + ' peak ' + peak); // normalised to -1 dBFS
  }
  const riser = P.render('riser'), imp = P.render('impact');
  assert.ok(riser.L.length / 48000 > 3, 'riser has a reverb tail');
  // a riser gets louder toward the end; an impact is loudest at the start
  const rms = (a, from, to) => { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / (to - from)); };
  assert.ok(rms(riser.L, 2.4 * 48000, 2.9 * 48000) > rms(riser.L, 0, 0.5 * 48000) * 4);
  assert.ok(rms(imp.L, 0, 0.2 * 48000) > rms(imp.L, 1.5 * 48000, 1.7 * 48000) * 4);
  const t = fs.statSync(files[0].file).mtimeMs;
  P.generate(dir, { ids: [files[0].id] });
  assert.equal(fs.statSync(files[0].file).mtimeMs, t, 'existing sounds are kept');
});

test('downloader (yt-dlp): platforms, times, arguments, progress + output file from a real child process', async () => {
  const Y = require('../../core/ytdlp');
  assert.equal(Y.platformOf('https://youtu.be/abc').id, 'youtube');
  assert.equal(Y.platformOf('https://www.instagram.com/reel/x').id, 'instagram');
  assert.equal(Y.platformOf('https://vm.tiktok.com/x').id, 'tiktok');
  assert.equal(Y.platformOf('https://pin.it/x').id, 'pinterest');
  assert.equal(Y.platformOf('nope'), null);
  assert.equal(Y.parseTime('1:20'), 80); assert.equal(Y.parseTime('01:02:03.5'), 3723.5); assert.equal(Y.parseTime(''), null); assert.equal(Y.parseTime('x:1'), null);
  const a = Y.buildArgs({ url: 'https://youtu.be/abc', quality: '720', start: '0:10', end: '0:40', outDir: '/o', ffmpeg: '/bin/ffmpeg' });
  const at = k => a[a.indexOf(k) + 1];
  assert.equal(at('-f'), 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b');
  assert.equal(at('-S'), 'vcodec:h264,res,acodec:m4a'); assert.equal(at('--merge-output-format'), 'mp4');
  assert.equal(at('--download-sections'), '*10-40'); assert.ok(a.includes('--force-keyframes-at-cuts'));
  assert.equal(at('--ffmpeg-location'), '/bin/ffmpeg'); assert.equal(a[a.length - 1], 'https://youtu.be/abc');
  assert.match(at('-o'), /-10-40\.%\(ext\)s$/);
  const audio = Y.buildArgs({ url: 'u', quality: 'audio', outDir: '/o' });
  assert.ok(audio.includes('-x') && audio.includes('mp3') && !audio.includes('--download-sections'));
  assert.equal(Y.buildArgs({ url: 'u', start: '5', outDir: '/o' })[Y.buildArgs({ url: 'u', start: '5', outDir: '/o' }).indexOf('--download-sections') + 1], '*5-inf');

  // a stand-in yt-dlp that behaves like the real one on stdout
  const fake = path.join(TMP, 'yt-dlp');
  fs.writeFileSync(fake, `#!${process.execPath}
const a = process.argv.slice(2), fs = require('fs');
if (a[0] === '-J') { console.log(JSON.stringify({ id: 'abc', title: 'تجربة', duration: 61, thumbnail: 'https://i/t.jpg', uploader: 'me', formats: [{ vcodec: 'avc1', height: 1080 }, { vcodec: 'vp9', height: 2160 }, { vcodec: 'none' }, { vcodec: 'avc1', height: 720 }] })); process.exit(0); }
const out = a[a.indexOf('-o') + 1].replace('%(title).80B [%(id)s]', 'تجربة [abc]').replace('%(ext)s', 'mp4');
for (const p of [10, 55.5, 100]) console.log('EFPROG ' + p + '% 2MiB/s');
fs.writeFileSync(out, 'video'); console.log('EFFILE ' + out);
`); fs.chmodSync(fake, 0o755);
  const info = await Y.info(fake, 'https://youtu.be/abc');
  assert.deepEqual(info.heights, [2160, 1080, 720]); assert.equal(info.title, 'تجربة'); assert.equal(info.platform.id, 'youtube');
  const prog = [];
  const r = await Y.download(fake, { url: 'https://youtu.be/abc', quality: '1080', outDir: path.join(TMP, 'dl') }, p => prog.push(p));
  assert.ok(fs.existsSync(r.file)); assert.match(r.file, /تجربة \[abc\]\.mp4$/);
  assert.deepEqual(prog, [0.1, 0.555, 1]);
  await assert.rejects(Y.download(null, { url: 'u', outDir: TMP }), /yt-dlp/);
});

test('web search: Openverse + Wikimedia + Google mapped, interleaved, a failing source never hides the others', async () => {
  const W = require('../../core/websearch');
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (/openverse/.test(url)) return mockResponse({ results: [{ title: 'Cairo', url: 'https://o/1.jpg', thumbnail: 'https://o/t1.jpg', width: 1600, height: 900, license: 'by', license_version: '2.0', creator: 'Ali', foreign_landing_url: 'https://o/p1' }, { title: 'Nile', url: 'https://o/2.jpg', width: 900, height: 1600, license: 'cc0' }] });
    if (/wikimedia/.test(url)) return mockResponse({ query: { pages: { 7: { index: 2, title: 'File:Pyramids.jpg', imageinfo: [{ url: 'https://w/p.jpg', thumburl: 'https://w/t.jpg', width: 4000, height: 3000, mime: 'image/jpeg', descriptionurl: 'https://w/d', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Mona</a>' } } }] }, 3: { index: 1, title: 'File:Clip.webm', imageinfo: [{ url: 'https://w/c.webm', mime: 'video/webm', width: 1280, height: 720 }] } } } });
    if (/googleapis/.test(url)) return mockResponse({ error: 'quota' }, { status: 429 });
    throw new Error('unexpected ' + url);
  };
  const r = await W.search({ q: 'القاهرة', sources: ['openverse', 'commons', 'google'], keys: { google: 'k', googleCx: 'cx' }, fetchImpl });
  assert.deepEqual(r.results.map(x => x.source), ['openverse', 'commons', 'openverse', 'commons']);
  assert.equal(r.results[0].license, 'BY 2.0'); assert.equal(r.results[0].credit, 'Ali');
  const commonsVideo = r.results.find(x => x.title === 'Clip.webm');
  assert.equal(commonsVideo.type, 'video');
  assert.equal(r.results.find(x => x.title === 'Pyramids.jpg').credit, 'Mona');
  assert.equal(r.errors.length, 1); assert.equal(r.errors[0].source, 'google');
  assert.ok(seen.some(u => /q=%D8%A7%D9%84%D9%82%D8%A7%D9%87%D8%B1%D8%A9/.test(u)), 'Arabic query is URL-encoded');
  await assert.rejects(W.search({ q: ' ', fetchImpl }), /اكتب/);
  const g = await W.search({ q: 'x', sources: ['google'], keys: {}, fetchImpl });
  assert.match(g.errors[0].error, /مفتاح/);
  assert.match(W.SEARCH_PAGES.pinterest('قطط'), /^https:\/\/www\.pinterest\.com\/search\/pins\/\?q=/);

  // downloads: extension from content-type, HTML refused, cached by URL
  const dl = async (url, opts) => {
    if (/page/.test(url)) { fs.writeFileSync(opts.toFile, '<html>'); return { ok: true, status: 200, headers: { get: () => 'text/html' } }; }
    fs.writeFileSync(opts.toFile, 'img'); return { ok: true, status: 200, headers: { get: () => 'image/webp; q=1' } };
  };
  const f = await W.downloadUrl('https://cdn/x/download?id=5', path.join(TMP, 'web'), { fetchImpl: dl, name: 'برج' });
  assert.match(f, /\.webp$/); assert.equal(fs.readFileSync(f, 'utf8'), 'img');
  assert.equal(await W.downloadUrl('https://cdn/x/download?id=5', path.join(TMP, 'web'), { fetchImpl: async () => { throw new Error('no 2nd download'); }, name: 'برج' }), f);
  await assert.rejects(W.downloadUrl('https://cdn/page', path.join(TMP, 'web'), { fetchImpl: dl }), /مش صورة/);
  // Pinterest pin → og:image / og:video
  const pin = await W.pinterestMedia('https://pin.it/x', { fetchImpl: async () => ({ ok: true, text: async () => '<meta property="og:title" content="Cute"><meta content="https://i.pinimg.com/originals/a.jpg" property="og:image">' }) });
  assert.deepEqual(pin, { url: 'https://i.pinimg.com/originals/a.jpg', type: 'photo', title: 'Cute' });
  const vpin = await W.pinterestMedia('https://pin.it/y', { fetchImpl: async () => ({ ok: true, text: async () => '<meta property="og:video:secure_url" content="https://v.pinimg.com/a.mp4?x=1&amp;y=2"><meta property="og:image" content="https://i/a.jpg">' }) });
  assert.equal(vpin.type, 'video'); assert.equal(vpin.url, 'https://v.pinimg.com/a.mp4?x=1&y=2');
});

test('safe zones: margins per platform, face mapping into the vertical frame, issues + caption position', () => {
  const SZ = require('../../core/safeZones');
  const r = SZ.safeRect('tiktok');
  assert.ok(Math.abs(r.x - 0.055) < 1e-9 && Math.abs(r.y - 0.08) < 1e-9 && Math.abs(r.w - 0.805) < 1e-9 && Math.abs(r.h - 0.72) < 1e-9);
  const all = SZ.margins('all');
  assert.deepEqual(all, { top: 0.12, bottom: 0.27, left: 0.06, right: 0.15 });
  assert.throws(() => SZ.margins('snap'), /مش معروفة/);
  // a centred face is fine, one under the like/comment rail is not
  assert.deepEqual(SZ.violations({ x: 0.4, y: 0.3, w: 0.2, h: 0.12 }, 'reels'), []);
  const v = SZ.violations({ x: 0.82, y: 0.5, w: 0.15, h: 0.1 }, 'reels');
  assert.equal(v[0].side, 'right'); assert.ok(v[0].amount > 0.6);
  // 1080x1920 source shown full-frame: face coords map 1:1
  assert.deepEqual(SZ.faceToFrame({ cx: 0.5, cy: 0.5, w: 0.2, h: 0.1 }, { srcW: 1080, srcH: 1920, seqW: 1080, seqH: 1920 }), { x: 0.4, y: 0.45, w: 0.2, h: 0.1 });
  // 16:9 source filling a 9:16 frame: x is zoomed around the centre
  const m = SZ.faceToFrame({ cx: 0.5, cy: 0.5, w: 0.1, h: 0.1 }, { srcW: 1920, srcH: 1080, seqW: 1080, seqH: 1920 });
  assert.ok(Math.abs(m.w - 0.1 * (1920 * 1920 / 1080) / 1080) < 1e-9 && Math.abs(m.x + m.w / 2 - 0.5) < 1e-9);
  const res = SZ.check({ platform: 'tiktok', faces: [{ time: 1, box: { x: 0.4, y: 0.3, w: 0.2, h: 0.1 } }, { time: 2, box: { x: 0.4, y: 0.85, w: 0.2, h: 0.1 } }, { time: 2.5, box: { x: 0.4, y: 0.86, w: 0.2, h: 0.1 } }, { time: 6, box: { x: 0.4, y: 0.01, w: 0.2, h: 0.06 } }], captionBox: { x: 0.08, y: 0.78, w: 0.84, h: 0.09 } });
  assert.deepEqual(res.issues.map(i => [i.kind, i.time, i.sides[0].side]), [['face', 2, 'bottom'], ['face', 6, 'top'], ['caption', null, 'bottom']]);
  assert.equal(res.score, 25);
  assert.equal(SZ.captionY('tiktok'), 0.73); assert.ok(SZ.captionY('all') < SZ.captionY('tiktok'));
});

test('EditFast Link: finds moved / renamed / re-wrapped media and prefers the same folder name', () => {
  const R = require('../../core/relink');
  const root = path.join(TMP, 'disk');
  const mk = (p) => { const f = path.join(root, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); return f; };
  const a1 = mk('Backup/Shoot A/Interview.MP4'); mk('Other/Interview.mp4');
  const b = mk('Backup/Audio/music.wav');
  const c = mk('Exports/b-roll 01 (1).mov');
  const d = mk('Exports/logo.png');
  mk('node_modules/skip/music.wav'); mk('Backup/notes.txt');
  const idx = R.buildIndex([root, path.join(root, 'nope')]);
  assert.equal(idx.count, 5, 'media only, node_modules skipped');
  const m1 = R.matchOne('/Volumes/Old/Shoot A/interview.mp4', idx);
  assert.equal(m1.path, a1); assert.equal(m1.reason, 'نفس الاسم'); assert.ok(m1.score > 0.95); assert.equal(m1.others, 1);
  assert.equal(R.matchOne('D:\\proj\\music.wav'.replace(/\\/g, '/'), idx).path, b);
  const m3 = R.matchOne('/old/b-roll 01.mp4', idx);
  assert.equal(m3.path, c); assert.equal(m3.reason, 'اسم قريب');
  const m4 = R.matchOne('/old/logo.psd', idx);
  assert.equal(m4.path, d); assert.equal(m4.reason, 'نفس الاسم بامتداد تاني');
  assert.equal(R.matchOne('/old/logo.wav', idx), null, 'a picture never relinks an audio item');
  assert.equal(R.matchOne('/old/missing.mp4', idx), null);
  assert.equal(R.looseStem('Clip_01 copy 2.mov'), 'clip01');
  const dirs = R.suggestDirs([path.join(root, 'Backup', 'gone', 'x.mp4')], path.join(root, 'Exports', 'p.prproj'));
  assert.equal(dirs[0], path.join(root, 'Exports')); assert.equal(dirs[1], path.join(root, 'Backup'));
  const plan = R.plan([{ id: 'n1', name: 'Interview.mp4', path: '/x/Shoot A/Interview.mp4' }, { id: 'n2', name: 'q.mp4', path: '/x/q.mp4' }], idx);
  assert.equal(plan[0].match.path, a1); assert.equal(plan[1].match, null);
});

test('icon library: 400+ icons in organised categories, brand logos keep their colours', () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'vendor', 'icons', 'icons.json'), 'utf8'));
  assert.ok(d.icons.length >= 400);
  for (const c of d.categories) assert.ok(d.icons.filter(i => i.cat === c.id).length >= 10, c.id);
  assert.deepEqual(d.categories.slice(0, 5).map(c => c.id), ['social', 'social-ui', 'editing', 'cars', 'realestate']);
  const yt = d.icons.find(i => i.id === 'b-youtube');
  assert.equal(yt.mode, 'fill'); assert.match(yt.color, /^#[0-9A-F]{6}$/i); assert.match(yt.svg, /^<path d="/);
  const car = d.icons.find(i => i.id === 'l-car');
  assert.equal(car.mode, 'stroke'); assert.equal(car.ar, 'عربية سيارة'); assert.doesNotMatch(car.svg, /<svg|<!--|script/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'client', 'vendor', 'icons', 'LICENSE-lucide.txt')));
});

test('prompt caching: Anthropic models get cache breakpoints on the system prompt and the newest user turn', async () => {
  const { withCache, OpenRouter } = require('../../core/openrouter');
  const long = 'x'.repeat(300);
  const msgs = [{ role: 'system', content: 'sys' }, { role: 'user', content: long }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'short' }, { role: 'tool', tool_call_id: '1', content: '{}' }];
  const out = withCache('anthropic/claude-sonnet-5.5', msgs);
  assert.deepEqual(out[0].content, [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }]);
  assert.equal(out[1].content[0].cache_control.type, 'ephemeral', 'newest long user message');
  assert.equal(out[3].content, 'short'); assert.equal(msgs[0].content, 'sys', 'input untouched');
  assert.equal(withCache('openai/gpt-5', msgs), msgs, 'OpenAI/Gemini cache automatically');
  let body;
  const llm = new OpenRouter({ apiKey: 'k', fetchImpl: async (u, o) => { body = JSON.parse(o.body); return mockResponse({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1000, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 900 }, cost: 0.0012 } }); } });
  const m = await llm.chat({ model: 'anthropic/claude-opus-5.5', messages: msgs });
  assert.equal(body.usage.include, true); assert.ok(Array.isArray(body.messages[0].content));
  assert.equal(m.usage.prompt_tokens_details.cached_tokens, 900);
  const { EditFastAgent } = require('../../core/agent');
  const ag = new EditFastAgent({ llm: { chat: async () => ({ content: 'تمام', usage: { prompt_tokens: 1200, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 1000 }, cost: 0.002 } }) }, model: 'anthropic/claude-sonnet-5.5', services: {}, events: { onUsage: u => { ag.seen = u; } } });
  await ag.send('سؤال'); await ag.send('تاني');
  assert.deepEqual(ag.seen, { prompt: 2400, completion: 60, cached: 2000, cost: 0.004 });
});

test('agent: new tools are offered and routed to the right services', async () => {
  const { EditFastAgent, TOOLS } = require('../../core/agent');
  const names = TOOLS.map(t => t.function.name);
  for (const n of ['style_edit', 'add_template', 'carousel_3d', 'add_icon', 'place_trendy_sfx', 'generate_music', 'download_video', 'web_media_search', 'web_media_place', 'safe_zones_check', 'relink_missing']) assert.ok(names.includes(n), n);
  const seen = [];
  const s = {
    styleEdit: async o => { seen.push(['styleEdit', o]); return { label: 'كولاج آرت', scenes: [{ time: 2, duration: 3, overlay: false, elements: ['collage'], file: '/x' }] }; },
    iconSearch: q => (q === 'عربية' ? [{ id: 'l-car', name: 'car' }] : []),
    addIcon: async o => { seen.push(['addIcon', o]); return { track: 2, start: 1 }; },
    relinkScan: async () => ({ items: [{ id: 'a', name: 'a.mp4', match: { path: '/a.mp4', score: 0.95 } }, { id: 'b', name: 'b.mp4', match: { path: '/b.mp4', score: 0.65 } }, { id: 'c', name: 'c.mp4', match: null }] }),
    relinkApply: async items => { seen.push(['relinkApply', items.map(i => i.id)]); return { done: items.length, failed: [] }; },
    placeSfx: async o => { seen.push(['placeSfx', o]); return { track: 1 }; }
  };
  const ag = new EditFastAgent({ llm: {}, model: 'm', services: s });
  const r1 = await ag.callTool('style_edit', { style: 'collage', count: 2 });
  assert.deepEqual(r1, { style: 'كولاج آرت', scenes: [{ time: 2, duration: 3, overlay: false, elements: ['collage'] }] });
  assert.deepEqual(seen[0], ['styleEdit', { style: 'collage', brief: '', count: 2 }]);
  const r2 = await ag.callTool('add_icon', { query: 'عربية', anim: 'bounce', time: 4 });
  assert.equal(r2.icon, 'car'); assert.equal(seen[1][1].anim, 'bounce'); assert.equal(seen[1][1].time, 4);
  assert.ok((await ag.callTool('add_icon', { query: 'zzz' })).error);
  const r3 = await ag.callTool('relink_missing', {});
  assert.deepEqual(r3, { missing: 3, relinked: 1, needsReview: ['b.mp4', 'c.mp4'], failed: [] });
  await ag.callTool('place_trendy_sfx', { id: 'whoosh', time: 3 });
  assert.deepEqual(seen.pop(), ['placeSfx', { id: 'whoosh', time: 3 }]);
});
