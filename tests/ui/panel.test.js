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
  browser = await chromium.launch();
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
async function shot(name) { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

test('boots: 14 tools in the sidebar, RTL Arabic, connected to host, no errors', async () => {
  const ids = await page.$$eval('#nav button', bs => bs.map(b => b.dataset.id));
  assert.deepEqual(ids, ['agent', 'quickcut', 'autofx', 'sfx', 'transcribe', 'multicam', 'organize', 'curves', 'library', 'motion', 'titles', 'search', 'broll', 'settings']);
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
  assert.equal(await page.evaluate(() => window.__calls.find(c => c.name === 'llm.chat').args.model), 'anthropic/claude-opus-5.5');
  assert.equal(await page.locator('.msg.tool.ok').count(), 2);
  await shot('01-agent');
});

test('القص السريع: analyse → list → cut', async () => {
  await open('quickcut'); await clearCalls();
  await clickText('حلّل السكتات');
  await page.waitForSelector('text=1.8 ثانية');
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
  assert.equal(await page.locator('#view select option').count(), 7);
  await page.selectOption('#view select', 'gulf');
  await clickText('فرّغ الكلام');
  await page.waitForSelector('.words span >> text=المونتاج');
  await page.click('.words span >> text=المونتاج');
  await page.check('#view input[type=checkbox]');
  await clickText('نزّل الكابشن على التايملين');
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
  await page.locator('input[type=password]').first().fill('sk-or-NEW'); await page.locator('input[type=password]').first().dispatchEvent('change');
  assert.equal(await page.evaluate(() => EF.services.settings.keys.openrouter), 'sk-or-NEW');
  await shot('11-settings');
});

test('narrow panel (320px): no horizontal overflow on any tab', async () => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const id of ['agent', 'quickcut', 'motion', 'titles', 'settings', 'curves']) {
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
