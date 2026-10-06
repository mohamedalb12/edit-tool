'use strict';
// Builds client/vendor/icons/icons.json from lucide-static (ISC) + simple-icons (CC0).
// usage: node scripts/build-icons.js <lucide-static package dir> <simple-icons package dir> [fluent-emoji dir with list.txt + *.svg]
const fs = require('fs');
const path = require('path');
const [lucideDir, simpleDir, fluentDir] = process.argv.slice(2);
if (!lucideDir || !simpleDir) { console.error('usage: node scripts/build-icons.js <lucide-static> <simple-icons>'); process.exit(1); }

const CATS = [
  ['social', 'سوشيال ميديا', 'brand', 'youtube instagram tiktok facebook x whatsapp snapchat telegram threads pinterest twitch discord spotify reddit behance netflix messenger kick soundcloud vimeo dribbble tumblr wechat line viber signal bluesky medium patreon substack apple google android appstore googleplay gmail googlemaps zoom paypal shopify airbnb uber github figma davinciresolve'],
  ['social-ui', 'تفاعل وسوشيال', 'lucide', 'heart thumbs-up thumbs-down message-circle message-square share-2 send bookmark bell bell-ring user-plus users eye star sparkles flame zap smile laugh party-popper megaphone at-sign hash link repeat-2 badge-check verified crown trophy gift'],
  ['editing', 'مونتاج وتصوير', 'lucide', 'video camera film clapperboard scissors mic mic-vocal headphones music music-2 play pause circle-play skip-forward fast-forward rewind volume-2 volume-x aperture focus image images crop layers wand-sparkles palette brush sliders-horizontal monitor-play tv projector cctv webcam switch-camera audio-lines audio-waveform captions subtitles timer drone'],
  ['cars', 'عربيات ومواصلات', 'lucide', 'car car-front car-taxi-front bus bus-front truck truck-electric van motorbike bike scooter fuel ev-charger gauge engine car-battery road traffic-cone parking-circle plane plane-takeoff train-front ship sailboat tractor caravan forklift helicopter rocket'],
  ['realestate', 'عقارات وبيوت', 'lucide', 'house house-plus house-heart home building building-2 hotel warehouse school landmark key key-round door-open door-closed bed bed-double bath sofa armchair lamp-ceiling ruler ruler-dimension-line land-plot fence trees tree-palm sun-medium waves-ladder shower-head refrigerator washing-machine air-vent'],
  ['places', 'أماكن وخرائط', 'lucide', 'map-pin map-pinned map-pin-house map navigation navigation-2 compass globe earth locate locate-fixed route signpost milestone mountain mountain-snow tent palmtree castle church mosque ferris-wheel store hospital university plane-landing tickets-plane luggage'],
  ['business', 'بيزنس وفلوس', 'lucide', 'dollar-sign banknote coins wallet credit-card piggy-bank hand-coins receipt chart-line chart-bar chart-pie chart-column-increasing trending-up trending-down briefcase briefcase-business handshake shopping-cart shopping-bag store tag tags percent badge-percent calculator presentation target scale bitcoin gem'],
  ['tech', 'تقنية وتعليم', 'lucide', 'laptop smartphone monitor cpu wifi bluetooth battery-charging plug code terminal database server cloud bot brain lightbulb rocket graduation-cap book book-open notebook pencil pen-tool school library microscope atom flask-conical calculator keyboard mouse'],
  ['food', 'أكل ومشروبات', 'lucide', 'coffee cup-soda pizza sandwich salad soup utensils chef-hat cake cake-slice cookie ice-cream-cone croissant apple cherry carrot beef drumstick fish egg-fried wine beer martini popcorn candy'],
  ['health', 'رياضة وصحة', 'lucide', 'dumbbell biceps-flexed heart-pulse activity footprints volleyball trophy medal timer stethoscope pill syringe hospital apple sport-shoe bike waves'],
  ['status', 'علامات وحالات', 'lucide', 'check check-check circle-check x circle-x triangle-alert circle-alert info circle-help ban lock lock-open shield shield-check eye eye-off bell-off loader-circle refresh-cw download upload external-link copy trash-2 plus minus'],
  ['arrows', 'أسهم وأشكال', 'lucide', 'arrow-right arrow-left arrow-up arrow-down arrow-up-right arrow-down-right move-right chevrons-right chevrons-down corner-down-right redo undo circle square triangle hexagon star diamond heart pentagon octagon sparkle asterisk mouse-pointer-click hand pointer'],
  ['weather', 'طقس وطبيعة', 'lucide', 'sun moon moon-star cloud cloud-rain cloud-snow cloud-lightning cloud-sun snowflake wind tornado rainbow thermometer umbrella droplet flame leaf flower tree-pine sprout mountain waves sunrise sunset'],
  ['people', 'ناس ومشاعر', 'lucide', 'user users user-round person-standing baby smile frown meh laugh angry heart-handshake hand-heart hand-helping thumbs-up hand-metal hand-fist ghost skull glasses crown']
];
const AR = { heart: 'قلب لايك', 'thumbs-up': 'لايك', 'message-circle': 'كومنت تعليق', share: 'شير مشاركة', bell: 'جرس اشتراك', car: 'عربية سيارة', house: 'بيت منزل', home: 'بيت', building: 'عمارة مبنى', 'map-pin': 'لوكيشن مكان', key: 'مفتاح', 'dollar-sign': 'فلوس دولار', video: 'فيديو', camera: 'كاميرا', mic: 'مايك', scissors: 'مقص قص', play: 'تشغيل', star: 'نجمة', fire: 'نار', flame: 'نار', zap: 'برق', check: 'صح', x: 'غلط إكس', phone: 'تليفون', plane: 'طيارة', bus: 'أتوبيس', truck: 'نقل عربية', bike: 'عجلة', motorbike: 'موتوسيكل', fuel: 'بنزين', bed: 'سرير أوضة نوم', bath: 'حمام', sofa: 'كنبة صالون', globe: 'عالم', coffee: 'قهوة', pizza: 'بيتزا', youtube: 'يوتيوب', instagram: 'انستجرام', tiktok: 'تيك توك', facebook: 'فيسبوك', whatsapp: 'واتساب', snapchat: 'سناب', telegram: 'تليجرام', 'brand-x': 'تويتر اكس', trophy: 'كاس فوز', gift: 'هدية', 'shopping-cart': 'سلة شراء', wallet: 'محفظة', 'trending-up': 'صعود نمو' };

const lucideInner = name => {
  const f = path.join(lucideDir, 'icons', name + '.svg');
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
};
const simpleData = (() => { const d = JSON.parse(fs.readFileSync(path.join(simpleDir, 'data', 'simple-icons.json'), 'utf8')); return Array.isArray(d) ? d : d.icons; })();
const brand = slug => {
  const f = path.join(simpleDir, 'icons', slug + '.svg');
  if (!fs.existsSync(f)) return null;
  const svg = fs.readFileSync(f, 'utf8');
  const title = (/<title>([^<]*)<\/title>/.exec(svg) || [])[1] || slug;
  const meta = simpleData.find(x => (x.slug || '') === slug || x.title === title) || {};
  return { inner: svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<title>[\s\S]*?<\/title>/, '').replace(/<\/svg>\s*$/, '').trim(), title, hex: meta.hex ? '#' + meta.hex : '#FFFFFF' };
};

const out = { version: 1, sources: { lucide: 'lucide-static (ISC)', brands: 'simple-icons (CC0) — brand logos are trademarks of their owners' }, categories: [], icons: [] };
const seen = new Set(); const missing = [];
for (const [id, label, kind, names] of CATS) {
  out.categories.push({ id, label });
  for (const n of names.split(/\s+/)) {
    const key = id + ':' + n; if (seen.has(key)) continue; seen.add(key);
    if (kind === 'brand') {
      const b = brand(n); if (!b) { missing.push(n); continue; }
      out.icons.push({ id: 'b-' + n, cat: id, name: b.title, ar: AR['brand-' + n] || AR[n] || '', mode: 'fill', color: b.hex, svg: b.inner });
    } else {
      const s = lucideInner(n); if (!s) { missing.push(n); continue; }
      out.icons.push({ id: 'l-' + n + (out.icons.some(x => x.id === 'l-' + n) ? '-' + id : ''), cat: id, name: n.replace(/-/g, ' '), ar: AR[n] || '', mode: 'stroke', svg: s });
    }
  }
}
// Fluent Emoji (Microsoft, MIT): flat colourful emoji-style icons (like the phone's), full colour
const EMOJI_CATS = { reactions: 'إيموجي — تفاعل', business: 'إيموجي — بيزنس وفلوس', media: 'إيموجي — مونتاج وتصوير', places: 'إيموجي — أماكن وعربيات وبيوت', food: 'إيموجي — أكل', nature: 'إيموجي — طبيعة' };
if (fluentDir && fs.existsSync(path.join(fluentDir, 'list.txt'))) {
  const emo = [];
  for (const line of fs.readFileSync(path.join(fluentDir, 'list.txt'), 'utf8').split('\n').filter(Boolean)) {
    const [cat, name, ar] = line.split('|');
    const slug = name.toLowerCase().replace(/[ -]/g, '_');
    const f = path.join(fluentDir, slug + '.svg');
    if (!fs.existsSync(f)) { missing.push(name); continue; }
    const raw = fs.readFileSync(f, 'utf8');
    const vb = (/viewBox="([^"]+)"/.exec(raw) || [])[1] || '0 0 32 32';
    // gradient ids must be unique once many icons sit on one page
    let inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
    inner = inner.replace(/id="([^"]+)"/g, (m, id) => `id="fe-${slug}-${id}"`).replace(/url\(#([^)]+)\)/g, (m, id) => `url(#fe-${slug}-${id})`).replace(/href="#([^"]+)"/g, (m, id) => `href="#fe-${slug}-${id}"`).replace(/\s+/g, ' ');
    emo.push({ id: 'e-' + slug.replace(/_/g, '-'), cat: 'emoji-' + cat, name, ar, mode: 'color', viewBox: vb, svg: inner });
  }
  const cats = Object.entries(EMOJI_CATS).map(([id, label]) => ({ id: 'emoji-' + id, label }));
  out.categories = [out.categories[0], ...cats, ...out.categories.slice(1)];
  out.icons = [...out.icons.filter(i => i.cat === 'social'), ...emo, ...out.icons.filter(i => i.cat !== 'social')];
  out.sources.emoji = 'Fluent Emoji (Microsoft, MIT)';
  fs.copyFileSync(path.join(fluentDir, 'LICENSE'), path.join(__dirname, '..', 'client', 'vendor', 'icons', 'LICENSE-fluent-emoji.txt'));
}
const dest = path.join(__dirname, '..', 'client', 'vendor', 'icons');
fs.mkdirSync(dest, { recursive: true });
fs.writeFileSync(path.join(dest, 'icons.json'), JSON.stringify(out));
fs.copyFileSync(path.join(lucideDir, 'LICENSE'), path.join(dest, 'LICENSE-lucide.txt'));
fs.copyFileSync(path.join(simpleDir, 'LICENSE.md'), path.join(dest, 'LICENSE-simple-icons.md'));
console.log(out.icons.length, 'icons;', 'missing:', missing.join(' ') || 'none');
