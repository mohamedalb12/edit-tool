'use strict';
// The tools Claude (Claude Desktop / Claude Code, over MCP) can use on an open panel. Claude does the thinking
// itself, so nothing here needs an OpenRouter key: Premiere reuses the in-panel agent's tools (the ones that don't
// call a model) plus a few editing primitives; After Effects gets the scene language + every tool of the panel.
const fs = require('fs');
const path = require('path');

const obj = (properties = {}, required = []) => ({ type: 'object', properties, required });
const num = d => ({ type: 'number', description: d }), str = d => ({ type: 'string', description: d }), bool = d => ({ type: 'boolean', description: d });
const MEDIA = /\.(mp4|mov|m4v|mxf|avi|mkv|webm|mts|m2ts|wav|mp3|m4a|aac|aif|aiff|flac|ogg|png|jpg|jpeg|psd|ai|svg|gif|tif|tiff|heic|webp)$/i;

/** the media in a folder (2 levels), with duration / size when ffprobe can read them */
async function listMedia(svc, dir, max = 150) {
  if (!dir || !fs.existsSync(dir)) throw new Error('الفولدر مش موجود: ' + dir);
  const out = [], walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (out.length >= max || e.name.startsWith('.')) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 2) walk(f, depth + 1); } else if (MEDIA.test(e.name)) out.push(f);
    }
  };
  walk(dir, 0);
  const ff = require('./ffmpeg'), probe = (svc.tools && (typeof svc.tools === 'function' ? svc.tools() : svc.tools).ffprobe) || null;
  const rows = [];
  for (const f of out) {
    const r = { path: f, size_mb: +(fs.statSync(f).size / 1048576).toFixed(1) };
    if (probe && !/\.(png|jpe?g|psd|ai|svg|gif|tiff?|heic|webp)$/i.test(f)) { try { const p = await ff.probe(probe, f); Object.assign(r, { duration: p.duration && +(+p.duration).toFixed(2), width: p.width, height: p.height, fps: p.fps, audio: p.hasAudio }); } catch (_) {} }
    rows.push(r);
  }
  return { folder: dir, files: rows, truncated: out.length >= max };
}

/* ---------------- Premiere ---------------- */
// in-panel agent tools that need no model (Claude decides; these just do)
const PR_AGENT = ['get_project_state', 'transcribe', 'look_at_frames', 'get_transcript', 'remove_fillers', 'bleep_words', 'remove_silences', 'remove_repeats',
  'make_hook', 'add_captions', 'apply_motion', 'add_title', 'build_scene', 'pro_scene', 'add_template', 'carousel_3d', 'add_icon', 'place_trendy_sfx',
  'generate_sfx', 'generate_music', 'download_video', 'web_media_search', 'web_media_place', 'safe_zones_check', 'relink_missing', 'liquid_glass',
  'add_markers', 'search_broll', 'place_broll', 'library_search', 'place_library_item', 'make_reels', 'make_short', 'clean_audio',
  'duck_music', 'undo_last', 'set_playhead'];

function premiereTools() {
  const agent = require('./agent');
  const defs = agent.TOOLS.filter(t => PR_AGENT.includes(t.function.name)).map(t => ({
    name: 'premiere_' + t.function.name, app: 'premiere',
    description: t.function.description + (t.function.name === 'pro_scene' ? ' — ابعت spec كامل (اقرا premiere_guide)، الـ brief لوحده محتاج مفتاح OpenRouter.' : ''),
    inputSchema: Object.assign({ type: 'object' }, t.function.parameters, { additionalProperties: undefined }),
    run: async (svc, args) => {
      const A = new agent.EditFastAgent({ services: svc });
      const r = await A.callTool(t.function.name, args);
      return { data: r, images: (A.pendingImages || []).map(f => ({ b64: f.b64, mime: 'image/jpeg', label: f.time + 's' })) };
    }
  }));
  return [
    { name: 'premiere_guide', app: 'premiere', description: 'اقرا ده الأول: إزاي تمنتج في بريمير بالأدوات دي (التايملين بالثواني، القص على نسخة، المشاهد والكابشن والستايلات المتاحة).', inputSchema: obj(),
      run: async svc => ({ text: guidePremiere(svc) }) },
    { name: 'premiere_list_media', app: 'premiere', description: 'الملفات اللي في فولدر (فيديو / صوت / صور) بمدتها ومقاسها — عشان تعرف الفوتيج قبل ما تمنتج.', inputSchema: obj({ folder: str('مسار الفولدر على الجهاز') }, ['folder']),
      run: async (svc, a) => ({ data: await listMedia(svc, a.folder) }) },
    { name: 'premiere_place_clip', app: 'premiere', description: 'حط ملف (أو جزء منه) على التايملين: time = فين على التايملين، src_in = من ثانية كام في الملف، duration = قد إيه. track فاضي = أول تراك فاضي.', inputSchema: obj({
        path: str('مسار الملف'), time: num('ثانية على التايملين'), src_in: num('من ثانية كام في الملف (0 = البداية)'), duration: num('المدة بالثواني (فاضي = لآخر الملف)'), kind: { type: 'string', enum: ['video', 'audio'] }, track: num('رقم التراك (0 = V1/A1)، فاضي = تلقائي') }, ['path', 'time']),
      run: async (svc, a) => ({ data: await svc.host('placeFile', { path: a.path, time: a.time, srcIn: a.src_in || 0, duration: a.duration || 0, kind: a.kind || 'video', track: a.track === undefined ? -1 : a.track }) }) },
    { name: 'premiere_new_sequence', app: 'premiere', description: 'سيكوينس جديدة من ملفات ورا بعض (مقاسها من أول ملف) — بداية مونتاج من الصفر.', inputSchema: obj({ name: str('اسم السيكوينس'), files: { type: 'array', items: { type: 'string' }, description: 'المسارات بالترتيب' } }, ['files']),
      run: async (svc, a) => {
        const ff = require('./ffmpeg'), probe = svc.tools && svc.tools.ffprobe; let t = 0; const items = [];
        for (const f of a.files) { items.push({ path: f, time: t }); let d = 5; try { d = +(await ff.probe(probe, f)).duration || 5; } catch (_) {} t += d; }
        return { data: await svc.host('createSequenceFromClips', { name: a.name || 'EditFast Edit', items }) };
      } },
    { name: 'premiere_cut_ranges', app: 'premiere', description: 'اقطع فترات من التايملين وقفّل الفراغ (على نسخة من السيكوينس، والأصل بيفضل سليم).', inputSchema: obj({ ranges: { type: 'array', items: obj({ start: num('من'), end: num('لحد') }, ['start', 'end']) } }, ['ranges']),
      run: async (svc, a) => ({ data: await svc.cutRanges({ ranges: a.ranges }) }) },
    { name: 'premiere_apply_effect', app: 'premiere', description: 'طبّق إفكت أو ترانزيشن من بريمير بالاسم (Cross Dissolve, Lumetri Color, Gaussian Blur…) على الكليب المختار أو اللي عند رأس التشغيل (حرّكه بـ premiere_set_playhead).', inputSchema: obj({ name: str('اسم الإفكت كما في بريمير'), kind: { type: 'string', enum: ['video', 'audio', 'transition'] }, duration: num('مدة الترانزيشن بالثواني') }, ['name']),
      run: async (svc, a) => ({ data: await svc.applyEffect({ name: a.name, kind: a.kind || 'video', duration: a.duration }) }) },
    { name: 'premiere_beat_montage', app: 'premiere', description: 'قطّع اللقطات على البيت بتاع المزيكا.', inputSchema: obj({ every: num('كل كام بيت (2 افتراضي)') }),
      run: async (svc, a) => ({ data: await svc.beatMontage({ every: a.every || 2 }) }) },
    { name: 'premiere_auto_zoom', app: 'premiere', description: 'زووم تلقائي على اللحظات القوية في الصوت (من غير AI).', inputSchema: obj({ density: { type: 'string', enum: ['low', 'medium', 'high'] }, style: { type: 'string', enum: ['jump', 'smooth'] } }),
      run: async (svc, a) => ({ data: await svc.autoZoom({ density: a.density || 'medium', style: a.style || 'jump' }) }) },
    { name: 'premiere_multi_formats', app: 'premiere', description: 'نسخ بمقاسات تانية (16:9 / 4:5 / 9:16) من الـ In/Out أو السيكوينس كلها.', inputSchema: obj({ formats: { type: 'array', items: { type: 'string', enum: ['16:9', '4:5', '9:16', '1:1'] } } }),
      run: async (svc, a) => ({ data: await svc.makeFormats({ formats: a.formats || ['16:9', '4:5', '9:16'] }) }) }
  ].concat(defs);
}
function guidePremiere(svc) {
  const capt = require('./captionStyles'), motion = require('./motionPresets'), packs = require('./stylePacks');
  return [
    'إنت بتمنتج في Adobe Premiere Pro المفتوح دلوقتي عن طريق إضافة EditFast. كل الأوقات بالثواني على تايملين السيكوينس المفتوحة.',
    'ابدأ بـ premiere_get_project_state (السيكوينس والتراكات والكليبات). لو المونتاج من فوتيج خام: premiere_list_media على فولدر الفوتيج، وبعدين premiere_new_sequence أو premiere_place_clip (src_in + duration لكل لقطة).',
    'شوف بعينك: premiere_look_at_frames بيرجّع صور حقيقية من التايملين. اسمع: premiere_transcribe ثم premiere_get_transcript (جمل بتوقيتها) — التفريغ على Groq لو فيه مفتاح، وإلا على الجهاز.',
    'القص (سكتات، حشو، تكرار، فترات) بيتعمل على نسخة من السيكوينس والأصل بيفضل. premiere_undo_last بيرجّع آخر حاجة.',
    'ستايلات الكابشن: ' + capt.STYLES.map(s => s.id).join(', ') + ' · أنيميشن: ' + capt.ANIMS.map(a => a.id).join(', '),
    'قوالب الحركة: ' + Object.keys(motion.PRESETS).join(', '),
    'ستايلات المونتاج: ' + packs.list().map(p => p.id).join(', '),
    'اشتغل خطوة خطوة، وبعد كل حاجة كبيرة بص على النتيجة (frames / state) وصلّح. اتكلم مع المستخدم بالعامية المصرية.',
    '— تعليمات المونتير الداخلي (نفس الأدوات):',
    require('./agent').systemPrompt({ style: svc.settings && svc.settings.style, level: 'strong' })
  ].join('\n');
}

/* ---------------- After Effects ---------------- */
// panel tools Claude can call by name through ae_tool (args as the panel uses them)
const AE_TOOLS = {
  logoAnimate: '{file, style: draw|outline|neon|build|3d|static, where: new|here, color, duration} لوجو (PNG/JPG/SVG) → شيبس متحركة',
  vectorImport: '{file} SVG / صورة → شيب ليرز في الكومب المفتوح',
  morph: '{files:[a.svg,b.svg] | (من غير files = الليرز المختارة), dur, hold, loop} شكل بيتحول لشكل',
  photo3D: '{file, move: push|orbit|rise|float, slices: 2-8, strength} صورة → لقطة ثري دي بكاميرا',
  imageTo3DModel: '{file} صورة → موديل ثري دي .glb (محتاج مفتاح fal)',
  track: '{points:[[x,y] 0-1 على الفريم], mode: attach|pin|stabilize, duration, text} تراكينج للفيديو المختار',
  surfacePlace: '{points: 4 أركان, file | text} حط صورة / كلام على سطح بيتتبّع',
  highlight: '{points: ≥3 أركان المبنى 0-1, mode: manual|ai, preset: blue-rest|bw-rest|gold|color-building|focus, label:{title,price,currency,area}, seconds} إبراز مبنى (عقارات)',
  characterAdd: '{name, action: walk|run|idle|wave|talk|jump, colors, walkAcross} كاراكتر متحرك',
  characterRig: '{ik} ريج لليرز كاراكتر (head, body, arm L…)',
  lipSync: '{audio} بُق الكاراكتر مع الصوت',
  audioReact: '{audio, amount, link: scale|opacity|position} الليرز المختارة بتنبض مع الصوت',
  counterAdd: '{from, to, duration, format: number|currency|percent|compact|time, currency: EGP|USD|SAR…, arabic, prefix, suffix, label, style: plain|ring|bar|card|slot} عدّاد أرقام',
  chartAdd: '{type: bar|column|line|pie|donut|progress|timeline|…, data: "اسم, رقم\\n…", title} رسم بياني',
  liquidAdd: '{preset, color, color2} أشكال سايلة',
  transitionApply: '{kind, duration} ترانزيشن بين الكليبات المختارة (أو عند وقت الكومب)',
  physics: '{mode: drop|fall|explode|float, gravity, bounce, duration} فيزيا للّيرز المختارة',
  roto: '{mode: ai|green|blue, seconds} فصل الشخص (ai محتاج مفتاح fal)',
  multiFormat: '{sizes:["16:9","9:16","1:1","4:5"], fit: blur|fit|fill, render} نسخ بكل المقاسات',
  kinetic: '{audio, style: pop|highlight|stack|typewriter|slide} كلام متحرك مع الصوت (تفريغ Groq / على الجهاز)',
  applyMotion: '{preset, level 1-3} قالب حركة على الليرز المختارة',
  applyEase: '{curve: ease|easeIn|easeOut|easeInOut|expoOut…} منحنى على الكي فريمز',
  stagger: '{frames, order} ورا بعض بفرق فريمات', anchor: '{where: tl|t|tr|l|c|r|bl|b|br}', nullController: '{}',
  addExpression: '{kind: wiggle|loopCycle|loopPingpong|bounce|autoFade|flicker|spin|float|squash|pendulum|typewriter}',
  textAnimate: '{preset: fadeUp|typewriter|blurIn|scalePop|slideIn|tracking|rotateIn|dropIn, by: chars|words|lines, duration}',
  addShape: '{kind: rect|circle|ring|line, color}', lowerThird: '{name, title, color, accent}',
  cameraRig: '{kind: push|orbit|dolly}', parallax: '{depth}', lightRig: '{}', extrude: '{depth}',
  explodeShapes: '{}', alignLayers: '{mode: left|hcenter|right|top|vcenter|bottom|distH|distV, to: comp|selection}', sequenceLayers: '{gap}',
  colorRig: '{}', paletteRead: '{}', paletteApply: '{"#old":"#new"} (الـ map نفسه)',
  templateSave: '{name, editable:{text,colors,motion,transform,media,controls}} احفظ الكومب كقالب MOGRT لبريمير',
  render: '{template: h264|prores|alpha, ame}', fullTest: '{} اختبر كل الأدوات (تقرير)'
};
function aeTools() {
  return [
    { name: 'ae_guide', app: 'ae', description: 'اقرا ده الأول: لغة المشاهد (JSON) اللي بتبني بيها أي موشن جرافيك في الأفتر، قواعد التصميم، المكتبة، والأدوات.', inputSchema: obj(),
      run: async svc => ({ text: guideAE(svc) }) },
    { name: 'ae_status', app: 'ae', description: 'الكومب المفتوح: المقاس والمدة والليرز والمختار.', inputSchema: obj(), run: async svc => ({ data: await svc.compInfo() }) },
    { name: 'ae_build_scene', app: 'ae', description: 'ابني مشهد كامل (ليرز + كي فريمز + إفكتس + إكسبريشنز) من JSON بلغة المشاهد (ae_guide). where: new = كومب جديد، here = جوه الكومب المفتوح.', inputSchema: obj({ scene: { type: 'object', description: '{"comp":{…},"layers":[…]}' }, where: { type: 'string', enum: ['new', 'here'] } }, ['scene']),
      run: async (svc, a) => ({ data: await svc.sceneBuild(a.scene, { where: a.where || 'new' }) }) },
    { name: 'ae_edit_scene', app: 'ae', description: 'عدّل الليرز الموجودة بأساميها: ops = [{op:"set",layer,look:{…}}, {op:"add",layer:{…}}, {op:"replace",layer,spec}, {op:"delete",layer}, {op:"retime",factor}, {op:"comp",duration}].', inputSchema: obj({ ops: { type: 'array', items: { type: 'object' } } }, ['ops']),
      run: async (svc, a) => ({ data: await svc.sceneEdit(a.ops) }) },
    { name: 'ae_scene_state', app: 'ae', description: 'الليرز اللي في الكومب المفتوح بالتفصيل (أساميها، أنواعها، توقيتها) — قبل التعديل.', inputSchema: obj(), run: async svc => ({ data: await svc.host('sceneState', {}) }) },
    { name: 'ae_look', app: 'ae', description: 'صور حقيقية من الكومب المفتوح (من الأفتر نفسه) عشان تشوف شغلك وتصلّحه.', inputSchema: obj({ frames: num('عدد الصور (1-8)') }),
      run: async (svc, a) => { const f = await svc.snapshot(Math.max(1, Math.min(8, a.frames || 4))); return { data: { frames: f.length }, images: f.map(x => ({ b64: x.b64, mime: x.mime || 'image/png', label: x.label })) }; } },
    { name: 'ae_library_scene', app: 'ae', description: 'مشهد جاهز من المكتبة بنصوصك وألوانك (الأسامي والحقول في ae_guide).', inputSchema: obj({ id: str('id المشهد'), params: { type: 'object', description: '{title, subtitle, color, …}' }, where: { type: 'string', enum: ['new', 'here'] } }, ['id']),
      run: async (svc, a) => ({ data: await svc.libraryScene(a.id, a.params || {}, a.where || 'new') }) },
    { name: 'ae_tool', app: 'ae', description: 'أي أداة من أدوات EditFast Motion بالاسم. الأدوات (args):\n' + Object.keys(AE_TOOLS).map(k => '• ' + k + ' ' + AE_TOOLS[k]).join('\n'),
      inputSchema: obj({ name: { type: 'string', enum: Object.keys(AE_TOOLS) }, args: { type: 'object' } }, ['name']),
      run: async (svc, a) => {
        if (!AE_TOOLS[a.name] || typeof svc[a.name] !== 'function') throw new Error('أداة مش معروفة: ' + a.name);
        const args = a.args || {};
        const r = a.name === 'paletteApply' ? await svc.paletteApply(args) : await svc[a.name](args);
        if (a.name === 'fullTest') return { text: r.report };
        return { data: r };
      } },
    { name: 'ae_list_media', app: 'ae', description: 'الملفات اللي في فولدر (فيديو / صوت / صور / لوجوهات) بمدتها ومقاسها.', inputSchema: obj({ folder: str('مسار الفولدر') }, ['folder']),
      run: async (svc, a) => ({ data: await listMedia(svc, a.folder) }) }
  ];
}
function guideAE(svc) {
  return [
    'إنت مصمم موشن ومونتير جوه Adobe After Effects المفتوح دلوقتي عن طريق إضافة EditFast Motion.',
    'الطريقة: ae_status ← ابني بـ ae_build_scene (أو ae_library_scene / ae_tool) ← بص على النتيجة بـ ae_look ← صلّح بـ ae_edit_scene. كرر لحد ما يبقى احترافي.',
    'الملفات (فوتيج، لوجو، صوت) بمساراتها الكاملة على الجهاز — ae_list_media بيوريك اللي في فولدر.',
    'اتكلم مع المستخدم بالعامية المصرية.',
    svc.sceneSystem('auto', 0, [])
  ].join('\n');
}

/* ---------------- shared ---------------- */
let cache = null;
function all() { if (!cache) cache = premiereTools().concat(aeTools()); return cache; }
const forApp = app => all().filter(t => t.app === app);
/** a tool's raw result → MCP content (text JSON + images) */
async function run(tool, svc, args) {
  const r = await tool.run(svc, args || {});
  const content = [];
  if (r.text) content.push({ type: 'text', text: String(r.text) });
  if (r.data !== undefined) { let t = JSON.stringify(r.data, (k, v) => (k === 'b64' ? undefined : v), 1); if (t && t.length > 60000) t = t.slice(0, 60000) + '\n…(اتقص)'; content.push({ type: 'text', text: t === undefined ? 'تمام' : t }); }
  for (const im of r.images || []) { if (im.label) content.push({ type: 'text', text: 'صورة ' + im.label }); content.push({ type: 'image', data: im.b64, mimeType: im.mime || 'image/png' }); }
  if (!content.length) content.push({ type: 'text', text: 'تمام' });
  return { content };
}
/** the list MCP shows Claude (no run functions) */
const describe = () => all().map(t => ({ name: t.name, description: t.description, inputSchema: clean(t.inputSchema) }));
function clean(s) { return JSON.parse(JSON.stringify(s)); }

module.exports = { forApp, run, describe, listMedia, AE_TOOLS, PR_AGENT };
