'use strict';
// 25 قالب تايتل متحرك. كل قالب بينزل عند رأس التشغيل كجرافيك (MOGRT) تعدّل نصه من Essential Graphics،
// والحركة بتتكتب كي فريمز على الكليب. ولو مفيش MOGRT أساسي بيتعمل نسخة متخرّجة بمحرك المشاهد.
(function (root, factory) {
  // Works as a <script> in the panel AND via require() — in Premiere's mixed context both window and module exist.
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.EFTitles = api;
})(typeof window !== 'undefined' ? window : null, function () {
  // pos: [x,y] 0..1 مركز النص. size: نسبة من ارتفاع الكادر. in/out: قوالب حركة.
  const T = [
    { id: 'big-center', name: 'عنوان كبير في النص', pos: [0.5, 0.5], size: 0.11, in: 'pop-in', out: 'pop-out', color: 'text', sceneIn: 'pop' },
    { id: 'lower-third', name: 'لوور ثيرد كلاسيك', pos: [0.28, 0.82], size: 0.055, in: 'slide-in-left', out: 'slide-out-left', color: 'text', box: 'primary', sceneIn: 'slide-right' },
    { id: 'lower-third-accent', name: 'لوور ثيرد بخط ملوّن', pos: [0.28, 0.84], size: 0.05, in: 'fade-in', out: 'fade-out', color: 'text', underline: true, sceneIn: 'fade' },
    { id: 'name-tag', name: 'اسم ومسمى وظيفي', pos: [0.25, 0.8], size: 0.045, in: 'slide-in-up', out: 'fade-out', color: 'text', box: 'primary', lines: 2, sceneIn: 'slide-up' },
    { id: 'top-banner', name: 'شريط فوق', pos: [0.5, 0.1], size: 0.05, in: 'slide-in-down', out: 'slide-out-right', color: 'background', box: 'accent', sceneIn: 'slide-down' },
    { id: 'typewriter', name: 'آلة كاتبة', pos: [0.5, 0.5], size: 0.07, in: 'fade-in', out: 'fade-out', color: 'text', sceneIn: 'typewriter' },
    { id: 'zoom-punch', name: 'زووم بانش', pos: [0.5, 0.5], size: 0.12, in: 'zoom-in-reveal', out: 'zoom-out-exit', color: 'accent', stroke: true, sceneIn: 'zoom' },
    { id: 'elastic-word', name: 'كلمة مطاطية', pos: [0.5, 0.45], size: 0.14, in: 'elastic-in', out: 'pop-out', color: 'accent', sceneIn: 'pop' },
    { id: 'bounce-drop', name: 'وقعة بنطّة', pos: [0.5, 0.4], size: 0.1, in: 'drop-in-bounce', out: 'fade-out', color: 'text', sceneIn: 'bounce' },
    { id: 'spin-badge', name: 'شارة بتلف', pos: [0.8, 0.2], size: 0.06, in: 'spin-in', out: 'spin-out', color: 'background', box: 'accent', sceneIn: 'pop' },
    { id: 'whip-headline', name: 'هيدلاين ويب', pos: [0.5, 0.5], size: 0.09, in: 'whip-in-left', out: 'whip-out-right', color: 'text', sceneIn: 'slide-right' },
    { id: 'subscribe-cta', name: 'اشترك في القناة', pos: [0.5, 0.85], size: 0.055, in: 'pop-in', out: 'pop-out', color: 'text', box: '#E62117', text: 'اشترك في القناة 🔔', sceneIn: 'pop' },
    { id: 'chapter-card', name: 'كارت فصل', pos: [0.5, 0.5], size: 0.09, in: 'fade-in', out: 'fade-out', color: 'text', underline: true, lines: 2, sceneIn: 'fade' },
    { id: 'quote', name: 'اقتباس', pos: [0.5, 0.5], size: 0.065, in: 'fade-in', out: 'fade-out', color: 'text', text: '«اكتب الاقتباس هنا»', sceneIn: 'blur' },
    { id: 'number-stat', name: 'رقم / إحصائية', pos: [0.5, 0.45], size: 0.16, in: 'pop-in', out: 'zoom-out-exit', color: 'accent', lines: 2, text: '+100%\nنمو', sceneIn: 'zoom' },
    { id: 'side-left', name: 'نص على الشمال', pos: [0.22, 0.5], size: 0.07, in: 'slide-in-left', out: 'slide-out-left', color: 'text', sceneIn: 'slide-right' },
    { id: 'side-right', name: 'نص على اليمين', pos: [0.78, 0.5], size: 0.07, in: 'slide-in-right', out: 'slide-out-right', color: 'text', sceneIn: 'slide-left' },
    { id: 'rise-up', name: 'طالع لفوق', pos: [0.5, 0.6], size: 0.08, in: 'slide-in-up', out: 'fade-out', color: 'text', sceneIn: 'slide-up' },
    { id: 'pulse-alert', name: 'تنبيه نابض', pos: [0.5, 0.2], size: 0.06, in: 'pop-in', out: 'fade-out', emphasis: 'heartbeat', color: 'background', box: 'accent', text: '⚠️ مهم', sceneIn: 'pop' },
    { id: 'glitch-title', name: 'تايتل جليتش', pos: [0.5, 0.5], size: 0.1, in: 'fade-in', out: 'fade-out', emphasis: 'glitch-jump', color: 'text', stroke: true, sceneIn: 'fade' },
    { id: 'cinematic', name: 'سينمائي هادي', pos: [0.5, 0.5], size: 0.075, in: 'zoom-out-reveal', out: 'fade-out', color: 'text', sceneIn: 'blur' },
    { id: 'caption-box', name: 'صندوق كلام', pos: [0.5, 0.75], size: 0.06, in: 'pop-in', out: 'pop-out', color: 'background', box: 'text', sceneIn: 'pop' },
    { id: 'location', name: 'مكان / لوكيشن', pos: [0.2, 0.12], size: 0.045, in: 'slide-in-down', out: 'fade-out', color: 'text', text: '📍 القاهرة', sceneIn: 'slide-down' },
    { id: 'end-card', name: 'كارت النهاية', pos: [0.5, 0.5], size: 0.09, in: 'zoom-in-reveal', out: 'fade-out', color: 'text', lines: 2, text: 'شكرًا للمشاهدة\nنشوفكم الفيديو الجاي', sceneIn: 'zoom' },
    { id: 'hook-flash', name: 'هوك فلاش', pos: [0.5, 0.5], size: 0.13, in: 'punch-in', out: 'zoom-out-exit', color: 'accent', stroke: true, sceneIn: 'pop' }
  ];

  function get(id) { const t = T.find(x => x.id === id); if (!t) throw new Error('قالب تايتل مش موجود: ' + id); return t; }

  /** Scene spec used for the rendered fallback (and for previews in the panel). */
  function toScene(id, text, style, { duration = 3, width = 1920, height = 1080 } = {}) {
    const t = get(id);
    const layers = [{
      type: 'text', text: text || t.text || 'اكتب العنوان هنا', x: t.pos[0], y: t.pos[1], size: t.size,
      color: t.color, box: t.box, stroke: t.stroke ? '#000000' : undefined, underline: t.underline,
      in: t.sceneIn || 'fade', out: 'fade', inDur: 0.5, outDur: 0.4, delay: 0
    }];
    return { width, height, fps: 30, duration, background: { type: 'transparent' }, layers, style };
  }

  return { TEMPLATES: T, get, toScene };
});
