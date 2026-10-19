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
  assert.deepEqual(ids, ['templates', 'director', 'motion', 'text', 'expr', '3d', 'routine', 'ai', 'library', 'settings']);
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
  assert.deepEqual(await call('director'), { message: 'إنترو بلوجو بيلف', refs: ['/refs/look.jpg'], where: 'new' });
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

test('no page errors in the After Effects panel', () => { assert.deepEqual(errors, []); });
