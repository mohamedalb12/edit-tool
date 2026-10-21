'use strict';
// The After Effects panel (client/ae.html) in Chromium with fake AE services.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

function loadPlaywright() { try { return require('playwright'); } catch (_) { return require('/opt/node22/lib/node_modules/playwright'); } }
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
let server, browser, page, errors = [];

test.before(async () => {
  server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  page = await browser.newPage({ viewport: { width: 420, height: 820 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript({ path: path.join(__dirname, 'aeHarness.js') });
  await page.goto(`http://127.0.0.1:${server.address().port}/client/ae.html`);
  await page.waitForSelector('#nav button');
  fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { await browser?.close(); server?.close(); });
const clear = () => page.evaluate(() => { window.__calls.length = 0; });
const call = name => page.evaluate(n => (window.__calls.find(c => c.name === n) || {}).args, name);
async function open(id) { await page.click(`#nav button[data-id="${id}"]`); await page.waitForTimeout(250); }
async function click(text, scope) { await page.locator((scope || '') + ' button', { hasText: text }).first().click(); await page.waitForTimeout(250); }
const shot = name => page.waitForTimeout(500).then(() => page.screenshot({ path: path.join(SHOTS, name + '.png') }));

test('After Effects panel boots with its own tools, connected to AE', async () => {
  const ids = await page.$$eval('#nav button', bs => bs.map(b => b.dataset.id));
  assert.deepEqual(ids, ['templates', 'director', 'estate', 'studio', 'track', 'character', 'fx', 'info', 'motion', 'text', 'expr', '3d', 'routine', 'ai', 'library', 'settings']);
  await page.waitForFunction(() => /After Effects/.test(document.getElementById('status').textContent));
  assert.match(await page.textContent('.brand .name'), /Motion/);
});

test('save as template: read the comp (choices suggested from it), presets, pick what stays editable, save; list with open / update', async () => {
  await open('templates'); await clear();
  await click('اقرا الكومب');
  assert.equal(await page.inputValue('#view input.grow'), 'Title Card');
  const on = await page.$$eval('.ed-item.on b', bs => bs.map(b => b.textContent));
  assert.deepEqual(on, ['الكلام', 'الألوان', 'الحركة'], 'suggested from what the comp has');
  await page.locator('.chips button', { hasText: 'لون وحركة' }).click();
  assert.deepEqual(await page.$$eval('.ed-item.on b', bs => bs.map(b => b.textContent)), ['الألوان', 'الحركة']);
  await page.locator('.ed-item', { hasText: 'الكلام' }).locator('input').check();
  await page.fill('#view input.grow', 'تايتل برتقالي');
  await click('احفظ كقالب لبريمير');
  const a = await call('templateSave');
  assert.equal(a.name, 'تايتل برتقالي'); assert.deepEqual(a.editable, { colors: true, motion: true, text: true });
  await shot('ae-01-templates');
  await clear();
  await page.locator('.tpl-list .item', { hasText: 'تايتل برتقالي' }).locator('button', { hasText: 'حدّث' }).click(); await page.waitForTimeout(200);
  assert.equal(await call('templateUpdate'), 't1');
});

test('motion: presets with strength, Flow-like curves (incl. typed bezier), stagger, anchor grid, null', async () => {
  await open('motion'); await clear();
  await page.locator('.seg button', { hasText: 'قوي' }).click();
  await page.locator('[data-preset="pop-in"]').click(); await page.waitForTimeout(200);
  assert.deepEqual(await call('applyMotion'), { preset: 'pop-in', level: 3 });
  await page.locator('[data-ease="expoOut"]').click(); await page.waitForTimeout(200);
  assert.deepEqual(await call('applyEase'), { curve: 'expoOut' });
  await clear();
  await page.fill('.card input.ltr', '0.7, 0, 0.3, 1'); await click('طبّق');
  assert.deepEqual(await call('applyEase'), { bezier: [0.7, 0, 0.3, 1] });
  await click('ستاجر'); assert.deepEqual(await call('stagger'), { frames: 3, order: 'down' });
  await page.locator('[data-anchor="br"]').click(); await page.waitForTimeout(200);
  assert.deepEqual(await call('anchor'), { where: 'br' });
  await click('نل كنترولر'); assert.ok(await call('nullController'));
  await shot('ae-02-motion');
});

test('text, expressions, 3D, routine, assistant, library: each button reaches AE with its settings', async () => {
  await open('text'); await clear();
  await page.locator('.seg button', { hasText: 'كلمة كلمة' }).click();
  await page.locator('[data-text="typewriter"]').click(); await page.waitForTimeout(200);
  assert.equal((await call('textAnimate')).by, 'words');
  await page.fill('input[placeholder="الاسم"]', 'أحمد محمد'); await click('اعمل اللوور ثيرد');
  assert.equal((await call('lowerThird')).name, 'أحمد محمد');
  await open('expr'); await clear();
  await page.locator('.item', { hasText: 'Wiggle' }).locator('button').click(); await page.waitForTimeout(200);
  assert.deepEqual(await call('addExpression'), { kind: 'wiggle' });
  await open('3d'); await clear();
  await page.locator('[data-cam="orbit"]').click(); await page.waitForTimeout(200);
  assert.equal((await call('cameraRig')).kind, 'orbit');
  await click('وزّع المختار في العمق'); assert.equal((await call('parallax')).depth, 300);
  await shot('ae-03-3d');
  await open('routine'); await clear();
  await page.locator('.seg button', { hasText: 'شفاف' }).click();
  await click('ريندر الكومب'); assert.equal((await call('render')).template, 'alpha');
  await click('اقرا الألوان'); await page.waitForSelector('#view input[type=color]');
  await page.locator('#view .item input[type=color]').first().evaluate(el => { el.value = '#22c55e'; el.dispatchEvent(new Event('input')); });
  await page.locator('#view .card', { hasText: 'بدّل الألوان' }).locator('button', { hasText: 'طبّق' }).click(); await page.waitForTimeout(200);
  assert.deepEqual(await call('paletteApply'), { '#f97316': '#22c55e' });
  await open('ai'); await clear();
  await page.fill('#view textarea', 'لوور ثيرد باسم أحمد وكاميرا داخلة');
  await click('اعمل الخطة');
  await page.waitForSelector('#view .list .item');
  assert.equal(await page.locator('#view .list .item').count(), 2);
  await click('نفّذ');
  assert.equal((await call('aiRun')).length, 2);
  await open('library'); await clear();
  await page.locator('#view .item', { hasText: 'whoosh' }).locator('button').click(); await page.waitForTimeout(200);
  assert.deepEqual(await call('libraryPlace'), { id: 'l1' });
});

test('director: describe → chat answer; reference attached; library scene with fields; auto edit with clips, music, style, ratio', async () => {
  await open('director'); await clear();
  await page.evaluate(() => { window.EF.test = window.EF.test || {}; window.EF.test.pickFiles = () => ['/refs/look.jpg']; });
  await click('📎 ريفرانس');
  assert.equal(await page.locator('#view .chips .chip', { hasText: 'look.jpg' }).count(), 1);
  await page.locator('.seg button', { hasText: 'كومب جديد' }).click();
  await page.fill('#view textarea', 'إنترو بلوجو بيلف');
  await click('ابعت');
  await page.waitForSelector('#view .msg.ai');
  assert.deepEqual(await call('director'), { message: 'إنترو بلوجو بيلف', refs: ['/refs/look.jpg'], where: 'new', review: true });
  assert.match(await page.locator('#view .msg.ai').first().textContent(), /راجع وصلّح 1/);
  assert.match(await page.locator('#view .msg.ai').first().textContent(), /برتقالي وخط عريض/);
  assert.equal(await page.locator('#view .chips .chip', { hasText: 'look.jpg' }).count(), 0, 'refs cleared after sending');
  await page.locator('[data-scene="kinetic-title"]').click();
  await page.fill('#view input[data-f="title"]', 'أهلا');
  await click('اعمل المشهد');
  assert.deepEqual(await call('libraryScene'), { id: 'kinetic-title', p: { title: 'أهلا' } });
  await page.evaluate(() => { window.EF.test.pickFiles = () => ['/v/a.mp4', '/v/b.mp4']; window.EF.test.pickFile = () => '/m/song.mp3'; });
  await click('اختار الفيديوهات/الصور'); await click('🎵 مزيكا');
  await page.locator('.seg button', { hasText: 'سينمائي' }).click();
  await page.locator('.seg button', { hasText: '9:16' }).click();
  await click('منتج');
  assert.deepEqual(await call('autoEdit'), { files: ['/v/a.mp4', '/v/b.mp4'], music: '/m/song.mp3', style: 'cinematic', ratio: '9:16', brief: '' });
  await page.waitForTimeout(200);
  assert.match(await page.locator('#view').textContent(), /16 قطع على 120 BPM/);
  await shot('ae-04-director');
});

test('studio, tracking, characters, workflow: each tool reaches AE with its choices', async () => {
  await open('studio'); await clear();
  await page.evaluate(() => { window.EF.test.pickFile = () => '/logos/brand.svg'; window.EF.test.pickFiles = () => ['/logos/a.svg', '/logos/b.svg']; });
  await click('اختار اللوجو');
  await page.locator('[data-style="neon"]').click();
  await click('حرّك اللوجو');
  assert.deepEqual(await call('logoAnimate'), { file: '/logos/brand.svg', style: 'neon', colors: 0, detail: 3, duration: 5 });
  await click('حطه شكل ثابت هنا'); assert.equal((await call('vectorImport')).file, '/logos/brand.svg');
  await click('من ملفات…'); await page.locator('#view .card', { hasText: 'مورف' }).locator('input[type=checkbox]').check();
  await click('اعمل المورف');
  assert.deepEqual(await call('morph'), { files: ['/logos/a.svg', '/logos/b.svg'], dur: 1, hold: 0.6, loop: true });
  await page.evaluate(() => { window.EF.test.pickFile = () => '/photos/street.jpg'; });
  await click('اختار الصورة'); await page.locator('.seg button', { hasText: 'بتلف' }).click();
  await click('اعملها ثري دي');
  assert.deepEqual(await call('photo3D'), { file: '/photos/street.jpg', move: 'orbit', slices: 5 });
  await shot('ae-05-studio');

  await open('track'); await clear();
  await click('هات الفريم'); await page.waitForSelector('.track-stage.on');
  const box = await page.locator('.track-stage').boundingBox();
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5);
  assert.equal(await page.locator('.track-dot').count(), 2);
  await page.fill('#view input[placeholder^="كلام يمشي"]', 'سعر 99');
  await click('تراك', '#view .card');
  const t = await call('track');
  assert.equal(t.points.length, 2); assert.ok(Math.abs(t.points[0][0] - 0.25) < 0.02); assert.equal(t.text, 'سعر 99'); assert.equal(t.mode, 'attach');
  await page.fill('#view input[placeholder^="أو قول"]', 'الموبايل');
  await page.locator('.seg button', { hasText: 'Corner Pin' }).click();
  await click('دوّر عليها بالـ AI');
  assert.deepEqual(await call('trackFind'), { what: 'الموبايل', corners: true });
  await shot('ae-06-track');

  await open('character'); await clear();
  await page.locator('[data-act="wave"]').click();
  await click('ضيف الكاراكتر');
  assert.deepEqual(await call('characterAdd'), { name: 'Ali', action: 'wave', walkAcross: false });
  await click('اعمل الريج'); assert.deepEqual(await call('characterRig'), { ik: true });
  await page.evaluate(() => { window.EF.test.pickFile = () => '/audio/voice.wav'; });
  await click('ليب سينك من ملف صوت'); assert.deepEqual(await call('lipSync'), { audio: '/audio/voice.wav' });
  await click('Audio React'); assert.deepEqual(await call('audioReact'), { audio: '/audio/voice.wav', amount: 30, link: 'scale' });
  await shot('ae-07-character');

  await open('routine'); await clear();
  await page.locator('[data-align="hcenter"]').click(); await page.waitForTimeout(200);
  assert.deepEqual(await call('alignLayers'), { mode: 'hcenter', to: 'comp' });
  await page.locator('[data-align="distH"]').click(); await page.waitForTimeout(200);
  assert.equal((await page.evaluate(() => window.__calls.filter(c => c.name === 'alignLayers')[1].args)).to, 'selection');
  await click('فصّل الشيب لليرز'); assert.ok(await page.evaluate(() => window.__calls.some(c => c.name === 'explodeShapes')));
  await click('كنترول واحد لكل الألوان'); assert.ok(await page.evaluate(() => window.__calls.some(c => c.name === 'colorRig')));
  await click('رتّبهم ورا بعض'); assert.deepEqual(await call('sequenceLayers'), { gap: 0 });
});

test('effects, infographics, director extras: transitions, liquid, physics, counter options with a live sample, charts, favourites, kinetic, voice, roto, AI images, sizes', async () => {
  await open('fx'); await clear();
  await page.locator('[data-pv="transition:glitch"]').click();
  await click('حط الترانزيشن'); assert.deepEqual(await call('transitionApply'), { kind: 'glitch', duration: 0.6 });
  await page.locator('[data-pv="liquid:water-fill"]').click();
  await click('ضيف الشكل'); assert.deepEqual(await call('liquidAdd'), { preset: 'water-fill' });
  await page.locator('.seg button', { hasText: 'بتتفرتك' }).click();
  await click('شغّل الفيزيا'); assert.deepEqual(await call('physics'), { mode: 'explode' });
  await page.locator('#view .card', { hasText: 'أشكال سايلة' }).locator('button', { hasText: 'اعمل المعاينات' }).click(); await page.waitForTimeout(250);
  assert.deepEqual(await call('previewMake'), { kind: 'liquid', n: 2 });
  await shot('ae-08-fx');

  await open('info'); await clear();
  await page.fill('#view .card:first-of-type input[type=number] >> nth=1', '2500');
  await page.locator('.seg button', { hasText: 'فلوس' }).click();
  await page.locator('.seg button', { hasText: '1.000' }).click();
  assert.match(await page.locator('.cnt-sample').textContent(), /\$2\.500/);
  await page.locator('[data-pv="counter:ring"]').click();
  await page.locator('#view .card', { hasText: 'عدّاد أرقام' }).locator('input[type=checkbox]').first().check();
  await click('ضيف العدّاد');
  assert.deepEqual(await call('counterAdd'), { from: 0, to: 2500, format: 'currency', currency: 'USD', style: 'ring', separator: '.', arabic: true });
  await page.locator('[data-pv="chart:donut"]').click();
  await click('اعمل الرسم');
  const ch = await call('chartAdd'); assert.equal(ch.type, 'donut'); assert.match(ch.data, /مصر, 120/);
  await shot('ae-09-info');

  await open('director'); await clear();
  await page.fill('#view textarea', 'عنوان'); await click('ابعت'); await page.waitForSelector('.fav-btn');
  await page.locator('.fav-btn').last().click(); await page.waitForTimeout(150);
  assert.deepEqual(await call('favSave'), { prompt: 'عنوان' });
  assert.equal(await page.locator('#view .card', { hasText: 'ستايلي' }).locator('.item').count(), 1);
  await page.evaluate(() => { window.EF.test.pickFile = () => '/audio/ad.wav'; });
  await click('اختار الصوت واعمله'); assert.deepEqual(await call('kinetic'), { audio: '/audio/ad.wav', style: 'pop' });
  await click('اختار التسجيل واعمل الفيديو'); assert.deepEqual(await call('voiceAd'), { audio: '/audio/ad.wav', brief: '', captions: 'highlight' });

  await open('studio'); await clear();
  await page.locator('#view .card', { hasText: 'روتو' }).locator('.seg button', { hasText: 'Green Screen' }).click();
  await click('افصل'); assert.deepEqual(await call('roto'), { mode: 'green', seconds: 10 });
  await page.fill('#view .card:has-text("صورة / فيديو بالـ AI") textarea', 'خلفية برتقالي');
  await page.locator('#view .card', { hasText: 'صورة / فيديو بالـ AI' }).locator('button', { hasText: 'اعمل' }).last().click(); await page.waitForTimeout(200);
  assert.deepEqual(await call('genMedia'), { prompt: 'خلفية برتقالي', kind: 'image', removeBg: false });

  await open('routine'); await clear();
  await page.locator('[data-size="4:5"]').click(); await page.locator('[data-size="1:1"]').click();
  await click('اعمل المقاسات'); assert.deepEqual(await call('multiFormat'), { sizes: ['16:9', '9:16', '4:5'], fit: 'blur' });
});

test('real estate: click the outline on the frame (polygon drawn), presets set colours + opacity, info card, build; AI = one click', async () => {
  await open('estate'); await clear();
  await click('هات الفريم'); await page.waitForSelector('#view .track-stage.on');
  const box = await page.locator('#view .track-stage').boundingBox();
  for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]]) await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  assert.equal(await page.locator('#view .track-dot').count(), 4);
  assert.equal(await page.locator('#view .hl-poly polygon').count(), 1);
  await page.locator('[data-preset="gold"]').click();
  await page.fill('#view input[placeholder="اسم المشروع"]', 'برج النيل');
  await page.fill('#view input[placeholder="السعر"]', '2500000');
  await click('أبرز المبنى');
  const r = await call('highlight');
  assert.equal(r.n, 4); assert.equal(r.mode, 'manual'); assert.equal(r.preset, 'gold');
  assert.deepEqual(r.look.rest, { color: '#0f172a', opacity: 55 }); assert.deepEqual(r.look.building, { color: '#fbbf24', opacity: 35 });
  assert.deepEqual(r.label, { title: 'برج النيل', price: '2500000', currency: 'EGP', area: '', arabic: false });
  await shot('ae-10-estate');
  await page.locator('.seg button', { hasText: 'AI (دوسة واحدة)' }).click();
  assert.equal(await page.locator('#view .track-dot').count(), 1, 'AI keeps one click');
  await click('أبرز المبنى'); assert.equal((await page.evaluate(() => window.__calls.filter(c => c.name === 'highlight')[1].args)).mode, 'ai');
});

test('⌘K favourites: ☆ pins a tool on top (kept per app), recents below', async () => {
  await page.evaluate(() => { localStorage.removeItem('ef-pal-fav-ae'); localStorage.removeItem('ef-pal-recent-ae'); });
  await page.keyboard.press('Control+KeyK');
  await page.fill('.pal-in', 'عدّاد'); await page.waitForTimeout(120);
  const top = await page.locator('.pal-item.on').getAttribute('data-id');
  await page.keyboard.press('Control+KeyD'); await page.waitForTimeout(120);
  await page.fill('.pal-in', ''); await page.waitForTimeout(120);
  assert.match(await page.locator('.pal-sec').first().textContent(), /المفضلة/);
  assert.equal(await page.locator('.pal-item').first().getAttribute('data-id'), top);
  assert.match(await page.locator('.pal-item .pal-star.on').first().textContent(), /★/);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ef-pal-fav-ae'))), [top]);
  await page.keyboard.press('Escape');
});

test('⌘K in After Effects lists AE tools (motion, curves, expressions, cameras)', async () => {
  await clear();
  await page.keyboard.press('Control+KeyK');
  await page.fill('.pal-in', 'wiggle'); await page.waitForTimeout(150);
  assert.match(await page.locator('.pal-item.on').textContent(), /Wiggle/);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  assert.deepEqual(await call('addExpression'), { kind: 'wiggle' });
  await page.keyboard.press('Control+KeyK');
  await page.fill('.pal-in', 'كاميرا بتلف'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  assert.equal((await call('cameraRig')).kind, 'orbit');
});

test('settings: "test every tool" runs the self-test and shows a copyable report', async () => {
  await open('settings');
  await page.locator('button', { hasText: 'اختبر كل الأدوات' }).first().click(); await page.waitForTimeout(250);
  assert.ok(await call('fullTest'));
  assert.match(await page.locator('.ft-report').inputValue(), /Logo PNG 3d/);
  assert.ok(await page.locator('button', { hasText: 'انسخ التقرير' }).isVisible());
  assert.match(await page.locator('.card', { hasText: 'اختبر كل الأدوات' }).first().textContent(), /1 من 2 فيهم مشكلة/);
  assert.ok(await page.locator('.claude-card').isVisible(), 'the Claude card is in the settings');
  assert.match(await page.locator('.claude-card').textContent(), /ثبّت في Claude Desktop/);
});

test('no page errors in the After Effects panel', () => { assert.deepEqual(errors, []); });
