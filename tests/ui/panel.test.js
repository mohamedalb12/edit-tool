'use strict';
// Drives the real panel UI in Chromium (Playwright) with fake services, plus a real scene render → ffmpeg encode.
const { TMP, FFMPEG, FFPROBE } = require('../helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (_) { return require('/opt/node22/lib/node_modules/playwright'); }
}
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };

let server, base, browser, page, errors = [];

test.before(async () => {
  server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  page = await browser.newPage({ viewport: { width: 420, height: 820 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // the test page is served over http, so previews of local media (file://) are blocked here; inside Premiere the panel runs from file:// with --allow-file-access
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|Not allowed to load local resource: file:/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript({ path: path.join(__dirname, 'browserHarness.js') });
  await page.goto(base + '/client/index.html');
  await page.waitForSelector('#nav button');
  fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { await browser?.close(); server?.close(); });

const calls = () => page.evaluate(() => window.__calls.map(c => c.name));
const clearCalls = () => page.evaluate(() => { window.__calls.length = 0; });
async function open(id) { await page.click(`#nav button[data-id="${id}"]`); await page.waitForTimeout(150); }
async function clickText(text) { await page.locator('button', { hasText: text }).first().click(); await page.waitForTimeout(250); }
async function shot(name) { await page.waitForTimeout(700); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

test('boots: 20 tools in the sidebar, RTL Arabic, connected to host, no errors', async () => {
  const ids = await page.$$eval('#nav button', bs => bs.map(b => b.dataset.id));
  assert.deepEqual(ids, ['agent', 'auto', 'quickcut', 'autofx', 'sfx', 'audio', 'transcribe', 'multicam', 'reels', 'organize', 'curves', 'library', 'motion', 'titles', 'glass', 'pro', 'thumb', 'search', 'broll', 'settings']);
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
  await page.waitForFunction(() => /متصل/.test(document.getElementById('status').textContent));
  assert.deepEqual(errors, []);
});

test('EditFast AI: taste form, model picker per level, chat runs tools and asks the user', async () => {
  await open('agent');
  assert.ok(await page.isVisible('text=ذوقك'));
  await clickText('احفظ ذوقي');
  assert.equal(await page.isVisible('text=ذوقك (بيتسأل'), false);
  await clickText('قوي جدًا');
  const picker = page.locator('input[list="ef-models"]').first();
  assert.equal(await picker.getAttribute('placeholder'), 'anthropic/claude-sonnet-5.5');
  await picker.fill('anthropic/claude-opus-5.5'); await picker.dispatchEvent('change');
  assert.equal(await page.evaluate(() => EF.services.settings.models.agent_max), 'anthropic/claude-opus-5.5');
  await page.evaluate(() => EF_TEST.setAgentScript([
    { tool_calls: [{ id: 'a', type: 'function', function: { name: 'get_project_state', arguments: '{}' } }, { id: 'b', type: 'function', function: { name: 'ask_user', arguments: '{"question":"الهوك يبقى قد إيه؟","options":["3 ثواني","5 ثواني"]}' } }] },
    { content: 'تمام، عملت الهوك ٣ ثواني ✓' }]));
  await clearCalls();
  await page.fill('textarea', 'ابدأ بهوك قوي');
  await clickText('ابعت');
  await page.waitForSelector('.msg.ask');
  await page.locator('.msg.ask .chip', { hasText: '3 ثواني' }).click();
  await page.waitForSelector('text=عملت الهوك');
  const c = await calls();
  assert.ok(c.includes('projectState') && c.filter(x => x === 'llm.chat').length === 2, c.join());
  assert.ok(c.includes('sequenceSnapshot'), 'agent gets a live picture of the sequence');
  await page.waitForFunction(() => /شايف: Main · 0:02\.0 · 4 كليب · 1 ماركر/.test(document.querySelector('.seebar').textContent));
  assert.ok(await page.$('.seebar.live'));
  assert.equal(await page.evaluate(() => window.__calls.find(c => c.name === 'llm.chat').args.model), 'anthropic/claude-opus-5.5');
  assert.equal(await page.locator('.msg.tool.ok').count(), 2);
  await shot('01-agent');
});

test('القص السريع: analyse → list → cut', async () => {
  await open('quickcut'); await clearCalls();
  await clickText('حلّل السكتات');
  await page.waitForFunction(() => [...document.querySelectorAll('.stat b')].map(b => b.textContent).join('|') === '2|1.8');
  await clickText('قص وقفّل الفراغات');
  const c = await page.evaluate(() => window.__calls);
  const qc = c.find(x => x.name === 'quickCut').args;
  assert.equal(qc.cuts.length, 2); assert.equal(qc.onCopy, true); assert.equal(qc.crossfadeFrames, 2);
  await shot('02-quickcut');
});

test('المؤثرات التلقائية: suggest, untick one, apply', async () => {
  await open('autofx'); await clearCalls();
  await clickText('اقرا الكلام واقترح');
  await page.waitForSelector('text=الاقتراحات (2)');
  await page.locator('#view .list input[type=checkbox]').nth(1).uncheck();
  await clickText('ولّد وطبّق المختار');
  const applied = await page.evaluate(() => window.__calls.find(c => c.name === 'autoEffectsApply').args);
  assert.equal(applied.length, 1); assert.equal(applied[0].prompt, 'whoosh');
  await shot('03-autofx');
});

test('مؤثرات صوتية: Arabic → English translate button, generate, history', async () => {
  await open('sfx'); await clearCalls();
  await page.fill('textarea >> nth=0', 'ووش سريع وبعده خبطة تقيلة');
  await clickText('ترجم للإنجليزي');
  assert.equal(await page.inputValue('textarea >> nth=1'), 'fast whoosh then heavy impact');
  await clickText('ولّد الصوت');
  const g = await page.evaluate(() => window.__calls.find(c => c.name === 'generateSfx').args);
  assert.equal(g.prompt, 'fast whoosh then heavy impact'); assert.equal(g.translate, false);
  assert.ok(await page.isVisible('text=حط عند رأس التشغيل'));
  await shot('04-sfx');
});

test('التفريغ والكابشن: 7 dialects, transcribe, clickable words, captions settings', async () => {
  await open('transcribe'); await clearCalls();
  assert.equal(await page.locator('#view select >> nth=0').locator('option').count(), 7);
  await page.selectOption('#view select >> nth=0', 'gulf');
  await clickText('فرّغ الكلام');
  await page.waitForSelector('.words span >> text=المونتاج');
  await page.click('.words span >> text=المونتاج');
  await page.check('#view input[type=checkbox]');
  await clickText('نزّل SRT عادي');
  const c = await page.evaluate(() => window.__calls);
  assert.equal(c.find(x => x.name === 'transcribe').args.dialect, 'gulf');
  assert.equal(c.find(x => x.name === 'setPlayhead').args, 3);
  assert.equal(c.find(x => x.name === 'addCaptions').args.singleWord, true);
  await shot('05-transcribe');
});

test('المالتي كام: tracks mapping, plan review, edit a shot, apply', async () => {
  await open('multicam'); await clearCalls();
  await page.waitForSelector('text=صوت A2');
  await clickText('حلّل مين بيتكلم');
  await page.waitForSelector('.timeline span');
  await page.locator('#view .list select').first().selectOption('1');
  await clickText('طبّق الخطة');
  const plan = await page.evaluate(() => window.__calls.find(c => c.name === 'multicamApply').args.plan);
  assert.equal(plan[0].trackIndex, 1);
  await shot('06-multicam');
});

test('تنظيم المشروع: shows the plan first, then applies', async () => {
  await open('organize'); await clearCalls();
  await clickText('امسح المشروع');
  await page.waitForSelector('text=📁 فيديو (1)');
  assert.ok(!(await calls()).includes('organizeApply'));
  await clickText('نفّذ الخطة');
  assert.ok((await calls()).includes('organizeApply'));
});

test('محرر المنحنيات: read keyframes, pick easing, apply to property', async () => {
  await open('curves'); await clearCalls();
  await clickText('اقرا الكليب المختار');
  await page.waitForSelector('#view select');
  await page.locator('.chip', { hasText: 'بيعدّي ويرجع' }).click();
  assert.match(await page.textContent('.pill.ltr'), /cubic-bezier\(0\.34, 1\.56/);
  await clickText('طبّق على الخاصية دي');
  const a = await page.evaluate(() => window.__calls.find(c => c.name === 'curvesApply').args);
  assert.equal(a.easing, 'backOut'); assert.equal(a.prop.prop, 'Scale');
  await shot('07-curves');
});

test('المكتبة: categories, search, add folder, double-click to place', async () => {
  await open('library'); await clearCalls();
  await page.waitForSelector('.tile >> text=whoosh fast');
  await clickText('اختار فولدر');
  await page.locator('.tile', { hasText: 'whoosh fast' }).dblclick(); await page.waitForTimeout(200);
  const c = await page.evaluate(() => window.__calls);
  assert.deepEqual(c.find(x => x.name === 'libraryAdd').args, ['/picked/folder']);
  assert.equal(c.find(x => x.name === 'libraryPlace').args.id, 'l1');
  await page.locator('.seg button', { hasText: 'ترانزيشنز' }).click();
  assert.equal(await page.locator('.tile').count(), 0);
});

test('قوالب الحركة: 28 tiles in 3 groups, 3 levels, click applies keyframes', async () => {
  await open('motion'); await clearCalls();
  assert.equal(await page.locator('.tile').count(), 28);
  await page.locator('.seg button', { hasText: 'قوي' }).click();
  await page.locator('.tile', { hasText: 'هزّة' }).hover(); await page.waitForTimeout(200);
  await page.locator('.tile', { hasText: 'بانش إن' }).click(); await page.waitForTimeout(200);
  const a = await page.evaluate(() => window.__calls.find(c => c.name === 'applyMotion').args);
  assert.deepEqual([a.preset, a.level, a.useSelection], ['punch-in', 3, true]);
  await shot('08-motion');
});

test('التايتلات: 25 animated previews, text + click places at playhead', async () => {
  await open('titles'); await clearCalls();
  assert.equal(await page.locator('.tile').count(), 25);
  await page.fill('#view input', 'محمد أيمن');
  await page.locator('.tile', { hasText: 'لوور ثيرد كلاسيك' }).hover(); await page.waitForTimeout(500);
  const painted = await page.evaluate(() => { const c = [...document.querySelectorAll('.tile')].find(t => /لوور ثيرد كلاسيك/.test(t.textContent)).querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 200) n++; return n; });
  assert.ok(painted > 100, 'preview canvas painted: ' + painted);
  await page.locator('.tile', { hasText: 'لوور ثيرد كلاسيك' }).click(); await page.waitForTimeout(200);
  const a = await page.evaluate(() => window.__calls.find(c => c.name === 'addTitle').args);
  assert.deepEqual([a.template, a.text], ['lower-third', 'محمد أيمن']);
  await shot('09-titles');
});

test('ليكود جلاس: 10 styles with live WebGL previews, controls, apply puts it on the video', async () => {
  await open('glass'); await clearCalls();
  assert.equal(await page.locator('.tile[data-preset]').count(), 10);
  await page.waitForTimeout(400);
  const lit = await page.evaluate(() => { const c = document.querySelector('canvas.glass-stage'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n; });
  assert.ok(lit > 2000, 'stage painted: ' + lit);
  await page.locator('.tile[data-preset="lens"]').click();
  await page.locator('.tile[data-preset="subscribe"]').click();
  await page.fill('#view .card input.grow >> nth=0', 'تابعنا');
  await clickText('حط الزجاج على الفيديو');
  const a = await page.evaluate(() => window.__calls.find(c => c.name === 'liquidGlass').args.params);
  assert.equal(a.preset, 'subscribe'); assert.equal(a.label, 'تابعنا'); assert.equal(a.tint, '#ff2d55');
  await shot('13-glass-tab');
});

test('بحث وماركرز: word search jumps, chapters (copy + markers), beat markers', async () => {
  await open('search'); await clearCalls();
  await page.fill('#view input', 'المونتاج'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.waitForSelector('text=النهارده هنتكلم عن المونتاج');
  await clickText('طلّع الفصول (AI)');
  assert.match(await page.inputValue('#view textarea'), /^00:00 المقدمة/);
  await clickText('حطهم ماركرز');
  await clickText('حط ماركرز على الإيقاع');
  const c = await calls();
  for (const n of ['search', 'setPlayhead', 'chapters', 'addMarkers', 'beatMarkers']) assert.ok(c.includes(n), n);
  await shot('10-search');
});

test('B-Roll: search with sources, click places footage', async () => {
  await open('broll'); await clearCalls();
  await page.fill('#view input', 'مدينة بالليل'); await clickText('دوّر');
  await page.waitForSelector('.tile');
  await page.locator('.tile').first().click(); await page.waitForTimeout(200);
  const c = await page.evaluate(() => window.__calls);
  assert.deepEqual(c.find(x => x.name === 'brollSearch').args.sources, ['pexels', 'local']);
  assert.equal(c.find(x => x.name === 'brollPlace').args.id, 'pexels-v-1');
});

test('الإعدادات: keys, per-feature model panel (every AI feature), load OpenRouter list', async () => {
  await open('settings'); await clearCalls();
  const labels = await page.$$eval('#view .hint', hs => hs.map(h => h.textContent));
  for (const f of ['المونتير الذكي — قوي', 'المونتير الذكي — قوي جدًا', 'المؤثرات التلقائية', 'ترجمة وصف المؤثر الصوتي', 'التصحيح الإملائي بعد التفريغ', 'فصول يوتيوب', 'بناء المشاهد المتحركة', 'كلمات بحث الـ B-Roll']) assert.ok(labels.includes(f), f);
  await clickText('حمّل قائمة الموديلات من OpenRouter');
  assert.equal(await page.locator('#ef-models option').count(), 2);
  await clickText('اختبر كل الموديلات');
  assert.equal(await page.locator('.mtest.pass').count(), 1);
  assert.equal(await page.locator('.mtest.fail').count(), 1);
  assert.match(await page.textContent('.mtest.fail'), /404/);
  assert.match(await page.textContent('.mtest.fail'), /مش موجود في قائمة OpenRouter/);
  await page.locator('input[type=password]').first().fill('sk-or-NEW'); await page.locator('input[type=password]').first().dispatchEvent('change');
  assert.equal(await page.evaluate(() => EF.services.settings.keys.openrouter), 'sk-or-NEW');
  await shot('11-settings');
});

test('text motion: titles/card headings/AI replies reveal word by word, splash letters', async () => {
  await open('quickcut');
  assert.ok(await page.locator('#tab-title.wordfx .w').count() >= 2);
  assert.ok(await page.locator('.card h3.wordfx .w').count() >= 1);
  assert.equal(await page.textContent('#tab-title'), 'القص السريع (أوفلاين)');
  await open('agent');
  assert.ok(await page.locator('.msg.ai.wordfx .w').count() >= 3);
});

test('narrow panel (320px): no horizontal overflow on any tab', async () => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const id of ['agent', 'auto', 'quickcut', 'motion', 'titles', 'glass', 'pro', 'reels', 'audio', 'thumb', 'settings', 'curves']) {
    await open(id);
    const over = await page.evaluate(() => document.getElementById('view').scrollWidth - document.getElementById('view').clientWidth);
    assert.ok(over <= 1, id + ' overflows by ' + over);
  }
  await page.setViewportSize({ width: 420, height: 820 });
});

test('no page errors across the whole session', () => { assert.deepEqual(errors, []); });

test('scene engine renders Arabic motion graphics in Chromium → ffmpeg video (transparent + solid)', async () => {
  const sceneEncode = require('../../core/sceneEncode');
  for (const transparent of [false, true]) {
    const out = path.join(TMP, `scene-${transparent}.${transparent ? 'mov' : 'mp4'}`);
    const enc = sceneEncode.startEncoder(FFMPEG, { fps: 30, out, transparent });
    const fname = 'efFrame' + (transparent ? 'T' : 'S');
    await page.exposeFunction(fname, b64 => enc.write(b64));
    const info = await page.evaluate(async ({ transparent, fname }) => {
      const spec = { width: 640, height: 360, fps: 30, duration: 2, background: transparent ? { type: 'transparent' } : { type: 'gradient', colors: ['#0E0E14', '#7C5CFF'] },
        layers: [{ type: 'shape', shape: 'rect', w: 0.6, h: 0.18, y: 0.5, color: 'primary', in: 'wipe' }, { text: 'اسم القناة', color: 'accent', size: 0.12, in: 'pop' }] };
      return EFScene.render(spec, document.createElement('canvas'), b64 => window[fname](b64));
    }, { transparent, fname });
    await enc.end();
    assert.equal(info.frames, 60);
    const probe = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-count_frames', '-show_streams', '-print_format', 'json', out]).toString());
    const v = probe.streams[0];
    assert.equal(+v.nb_read_frames, 60); assert.equal(v.width, 640);
    assert.equal(/yuva/.test(v.pix_fmt), transparent, v.pix_fmt);
    if (!transparent) execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-ss', '1.0', '-i', out, '-frames:v', '1', path.join(SHOTS, '12-scene-render.png')]);
  }
});

test('Liquid Glass real render: footage → WebGL shader → ProRes 4444 alpha layer that bends the picture', async () => {
  const io = require('../../core/glassIO');
  const W = 640, H = 360, fps = 25;
  const vid = path.join(TMP, 'glass-src.mp4');
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=${W}x${H}:d=2:r=${fps}`, '-pix_fmt', 'yuv420p', vid]);
  const out = path.join(TMP, 'glass-out.mov');
  const enc = io.startRawEncoder(FFMPEG, { width: W, height: H, fps, out });
  await page.evaluate(({ W, H }) => { window.__g = EFLiquid.createRenderer(document.createElement('canvas'), W, H); window.__g.setParams({ preset: 'card', label: 'Liquid', duration: 2 }); }, { W, H });
  let lastSrc, lastOut, n = 0;
  await io.decodeFrames(FFMPEG, { mediaPath: vid, start: 0, duration: 1.2, width: W, height: H, fps }, async (f, i) => {
    const b64 = await page.evaluate(({ b64, t }) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
      const px = window.__g.render(u, t); let s = ''; for (let k = 0; k < px.length; k += 32768) s += String.fromCharCode.apply(null, px.subarray(k, k + 32768)); return btoa(s);
    }, { b64: f.toString('base64'), t: i / fps });
    const px = Buffer.from(b64, 'base64'); await enc.write(px); n++;
    if (i === 20) { lastSrc = f; lastOut = px; }
  });
  await enc.end();
  assert.equal(n, 30);
  const v = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-count_frames', '-show_streams', '-print_format', 'json', out]).toString()).streams[0];
  assert.equal(+v.nb_read_frames, 30); assert.match(v.pix_fmt, /yuva444/); assert.equal(v.width, W);
  const at = (b, x, y) => { const i = (y * W + x) * 4; return [b[i], b[i + 1], b[i + 2], b[i + 3]]; };
  assert.equal(at(lastOut, 5, 5)[3], 0, 'outside the glass is transparent');
  assert.equal(at(lastOut, W / 2, Math.round(H * 0.4))[3], 255, 'inside is solid glass');
  // inside the glass the picture is bent/blurred: it differs from the straight source over the card
  let diff = 0, cnt = 0;
  for (let y = Math.round(H * 0.32); y < H * 0.68; y += 3) for (let x = Math.round(W * 0.3); x < W * 0.7; x += 3) { const a = at(lastOut, x, y), b = at(lastSrc, x, y); diff += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); cnt++; }
  assert.ok(diff / cnt > 12, 'refraction/blur changed the picture: ' + (diff / cnt).toFixed(1));
  // showcase still for the docs: glass composited over the frame (straight alpha blend, RGB, no chroma subsampling)
  const comp = Buffer.alloc(W * H * 3);
  for (let i = 0, j = 0; i < lastOut.length; i += 4, j += 3) { const a = lastOut[i + 3] / 255; for (let c = 0; c < 3; c++) comp[j + c] = Math.round(lastOut[i + c] * a + lastSrc[i + c] * (1 - a)); }
  fs.writeFileSync(path.join(TMP, 'comp.rgb'), comp);
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', path.join(TMP, 'comp.rgb'), '-frames:v', '1', path.join(SHOTS, '14-liquid-glass-render.png')]);
});

test('Reels: real offline face detection tracks a moving face, and the vertical output keeps it centred', async () => {
  const io = require('../../core/glassIO');
  const reframe = require('../../core/reframe');
  const face = path.join(__dirname, '..', 'fixtures', 'face.png');
  const src = path.join(TMP, 'moving-face.mp4');
  // 1280×720 dark frame; the astronaut (face near the top of the photo) slides from left to right over 4s
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x15151c:s=1280x720:d=4:r=25', '-loop', '1', '-i', face,
    '-filter_complex', "[1:v]scale=380:380[f];[0:v][f]overlay=x='60+t*200':y=170:shortest=1", '-pix_fmt', 'yuv420p', '-t', '4', src]);
  await page.evaluate(() => EF.faceTracker.load());
  const W = 640, H = 360, fps = 3, samples = [];
  await io.decodeFrames(FFMPEG, { mediaPath: src, duration: 4, width: W, height: H, fps }, async (buf, i) => {
    const faces = await page.evaluate(async ({ b64, W, H }) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
      return EF.faceTracker.detect(u, W, H);
    }, { b64: buf.toString('base64'), W, H });
    samples.push({ t: i / fps, faces });
  });
  const found = samples.filter(s => s.faces.length);
  assert.ok(found.length >= samples.length * 0.8, `face found in ${found.length}/${samples.length} samples`);
  const xs = found.map(s => s.faces.sort((a, b) => b.w * b.h - a.w * a.h)[0].cx);
  assert.ok(xs[xs.length - 1] - xs[0] > 0.35, 'detected face moves right: ' + xs.map(x => x.toFixed(2)).join(','));
  // plan + render the vertical clip, then look for the face in the OUTPUT: it should stay near the middle
  const planRes = reframe.plan(samples, { srcW: 1280, srcH: 720 });
  const out = await reframe.render(FFMPEG, { file: src, duration: 4, srcW: 1280, srcH: 720, planRes, out: path.join(TMP, 'face-reel.mp4') });
  const RW = 360, RH = 640, centred = [];
  await io.decodeFrames(FFMPEG, { mediaPath: out, start: 0.5, duration: 3.4, width: RW, height: RH, fps: 2 }, async (buf) => {
    const f = await page.evaluate(async ({ b64, W, H }) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
      return EF.faceTracker.detect(u, W, H);
    }, { b64: buf.toString('base64'), W: RW, H: RH });
    if (f.length) centred.push(f[0].cx);
  });
  assert.ok(centred.length >= 4, 'face visible in the reel');
  assert.ok(centred.every(x => x > 0.2 && x < 0.8), 'face stays inside the vertical frame: ' + centred.map(x => x.toFixed(2)).join(','));
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-ss', '2', '-i', src, '-ss', '2', '-i', out, '-filter_complex', '[0:v]scale=-2:480[a];[1:v]scale=-2:480[b];[a][b]hstack', '-frames:v', '1', path.join(SHOTS, '18-reels-face-tracking.png')]);
});

test('animated captions: 8 word-synced styles draw correctly (Arabic RTL), active word changes the picture', async () => {
  const shots = await page.evaluate(() => {
    const W = 640, H = 360, cue = { start: 0, end: 2.4, words: [{ text: 'المونتاج', start: 0, end: 0.6 }, { text: 'بقى', start: 0.6, end: 1.0 }, { text: 'أسرع', start: 1.0, end: 1.6 }, { text: 'بكتير', start: 1.6, end: 2.3 }] };
    const res = {};
    for (const s of EFCaptions.STYLES) {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
      const sig = t => { EFCaptions.draw(ctx, cue, t, { style: s.id, position: 'center', size: 0.11 }, W, H); const d = ctx.getImageData(0, 0, W, H).data; let n = 0, sum = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) { n++; sum += d[i - 3] + d[i - 2] * 3 + d[i - 1] * 7; } return { n, sum }; };
      const a = sig(0.3), b = sig(1.3), out = sig(3);
      const bg = document.createElement('canvas'); bg.width = W; bg.height = H; const g = bg.getContext('2d');
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#2b2540'); gr.addColorStop(1, '#5b3b86'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      EFCaptions.draw(ctx, cue, 1.3, { style: s.id, position: 'center', size: 0.11 }, W, H); g.drawImage(c, 0, 0);
      g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '700 22px sans-serif'; g.fillText(s.id, 14, 30);
      res[s.id] = { a, b, out, png: bg.toDataURL('image/png').split(',')[1] };
    }
    return res;
  });
  for (const [id, r] of Object.entries(shots)) {
    assert.ok(r.b.n > 1500, id + ' draws text');
    assert.equal(r.out.n, 0, id + ' clears after the cue');
    assert.notEqual(r.a.sum, r.b.sum, id + ' active word changes the picture');
    fs.writeFileSync(path.join(TMP, `cap-${id}.png`), Buffer.from(r.png, 'base64'));
  }
  const ids = Object.keys(shots);
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', ...ids.flatMap(id => ['-i', path.join(TMP, `cap-${id}.png`)]), '-filter_complex', ids.map((_, i) => `[${i}:v]`).join('') + `xstack=inputs=${ids.length}:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h0|w0_h0+h0|0_h0+h0+h0|w0_h0+h0+h0`, path.join(SHOTS, '19-caption-styles.png')]);
});

test('thumbnail styles render over a real photo (Arabic title, highlight word, readability gradient)', async () => {
  const pngs = await page.evaluate(async () => {
    const img = new Image(); img.src = '/tests/fixtures/face.png'; await img.decode();
    if (document.fonts) await document.fonts.ready;
    const out = [];
    for (const [i, st] of EFThumb.STYLES.entries()) {
      const c = document.createElement('canvas'); c.width = 640; c.height = 360;
      EFThumb.draw(c.getContext('2d'), img, { title: 'السر اللي محدش قالهولك', highlight: 'السر', style: st.id, side: i % 2 ? 'right' : 'left', emoji: i === 0 ? '😱' : '' }, 640, 360);
      out.push(c.toDataURL('image/png').split(',')[1]);
    }
    return out;
  });
  pngs.forEach((b, i) => fs.writeFileSync(path.join(TMP, `th-${i}.png`), Buffer.from(b, 'base64')));
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', ...pngs.flatMap((_, i) => ['-i', path.join(TMP, `th-${i}.png`)]), '-filter_complex', '[0][1][2][3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0', path.join(SHOTS, '20-thumbnails.png')]);
  assert.ok(fs.statSync(path.join(SHOTS, '20-thumbnails.png')).size > 50000);
});

test('مشاهد Pro: AI director designs, elements are editable, gallery adds, preview + render', async () => {
  await open('pro'); await clearCalls();
  assert.ok(await page.isVisible('text=محرك Remotion جاهز'));
  assert.equal(await page.locator('.tile[data-type]').count(), 12);
  await page.fill('#view textarea', 'افتتاحية لقناة مونتاج');
  await clickText('صمّم المشهد بالذكاء الاصطناعي');
  await page.waitForSelector('text=عنوان حركي');
  await page.locator('.tile[data-type="statCounter"]').click();
  await clickText('معاينة');
  await clickText('ارندر وحطه على التايملين');
  const c = await page.evaluate(() => window.__calls);
  assert.equal(c.find(x => x.name === 'designProScene').args.brief, 'افتتاحية لقناة مونتاج');
  const rendered = c.filter(x => x.name === 'renderProScene');
  assert.deepEqual(rendered.map(r => [r.args.preview, r.args.elements]), [[true, 3], [false, 3]]);
  await shot('21-pro-tab');
});

test('مونتاج تلقائي: plan checklist, untick a step, run shows status, history + undo', async () => {
  await open('auto'); await clearCalls();
  assert.equal(await page.locator('.step').count(), 4);
  await page.locator('.step', { hasText: 'هوك' }).locator('input[type=checkbox]').uncheck();
  await clickText('ابدأ المونتاج');
  await page.waitForSelector('.step.ok');
  const run = await page.evaluate(() => window.__calls.find(c => c.name === 'runAutoEdit').args);
  assert.deepEqual(run, ['transcribe', 'silences']);
  assert.equal(await page.locator('.step.skip').count(), 2);
  assert.ok(await page.isVisible('text=مونتاج تلقائي'));
  await clickText('رجّع آخر عملية');
  assert.ok((await calls()).includes('undoLast'));
  await shot('22-auto-edit');
});

test('ريلز وشورتس: reframe to 9:16, AI finds shorts and builds one', async () => {
  await open('reels'); await clearCalls();
  await page.locator('.seg button', { hasText: '4:5 بوست' }).click();
  await clickText('حوّل السيكوينس لريلز');
  await clickText('دوّر على أقوى المقاطع');
  await page.waitForSelector('text=أقوى لحظة');
  await page.locator('.short button', { hasText: 'اعمل الشورت' }).click(); await page.waitForTimeout(200);
  const c = await page.evaluate(() => window.__calls);
  assert.equal(c.find(x => x.name === 'makeReels').args.ratio, '4:5');
  assert.deepEqual(c.find(x => x.name === 'makeShort').args, { title: 'أقوى لحظة', reframe: true, captions: true });
});

test('الصوت: clean voice (strength/loudness) and duck music', async () => {
  await open('audio'); await clearCalls();
  await page.waitForFunction(() => document.querySelectorAll('#view select option').length >= 4);
  await page.locator('.seg button', { hasText: 'قوي' }).click();
  await page.locator('.seg button', { hasText: 'يوتيوب -14' }).click();
  await clickText('نضّف الصوت');
  await clickText('وطّي الموسيقى تحت الكلام');
  const c = await page.evaluate(() => window.__calls);
  assert.deepEqual(c.find(x => x.name === 'cleanAudio').args, { track: 0, strength: 'strong', loudness: -14 });
  assert.deepEqual([c.find(x => x.name === 'duckMusic').args.voiceTrack, c.find(x => x.name === 'duckMusic').args.musicTrack], [0, 1]);
});

test('ثامبنيل: best frames, AI titles, live preview, save PNG', async () => {
  await open('thumb'); await clearCalls();
  await clickText('لاقي أحلى فريمات');
  await page.waitForSelector('.tile.on');
  await clickText('اقترح عناوين (AI)');
  await page.locator('.chip', { hasText: 'السر اللي محدش قالهولك' }).click();
  await page.waitForTimeout(400);
  const lit = await page.evaluate(() => { const c = document.querySelector('canvas.thumb-stage'); const d = c.getContext('2d').getImageData(0, 0, 1280, 720).data; let n = 0; for (let i = 0; i < d.length; i += 64) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] < 120) n++; return n; });
  assert.ok(lit > 50, 'yellow highlight word painted: ' + lit);
  await clickText('احفظ الثامبنيل PNG');
  const c = await page.evaluate(() => window.__calls.find(x => x.name === 'saveThumbnail').args);
  assert.ok(c.bytes > 10000); assert.equal(c.name, 'السر اللي محدش قالهولك');
  await shot('23-thumbnail-tab');
});

test('كابشن متحرك from the transcription tab: style pick, position, render + translate', async () => {
  await open('transcribe'); await clearCalls();
  assert.equal(await page.locator('.cap-grid .tile').count(), 8);
  await page.locator('.cap-grid .tile[data-style="karaoke"]').click();
  await page.locator('.seg button', { hasText: 'فوق' }).click();
  await clickText('نزّل كابشن متحرك');
  await clickText('ترجم الكابشن');
  const c = await page.evaluate(() => window.__calls);
  assert.deepEqual(c.find(x => x.name === 'addAnimatedCaptions').args, { style: 'karaoke', position: 'top' });
  assert.equal(c.find(x => x.name === 'translateCaptions').args.lang, 'English');
});
