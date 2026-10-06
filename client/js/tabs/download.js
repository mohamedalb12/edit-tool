/* تحميل من يوتيوب/إنستجرام/تيك توك/بنترست/X: الجودة + البداية والنهاية + يتحط على التايملين. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var o = { url: '', quality: '1080', start: '', end: '', place: true, info: null };
  EF.tabs.push({
    id: 'download', label: 'تحميل', title: 'تحميل فيديو من لينك',
    render: function (view) {
      var S = EF.services, Y = EF.node('ytdlp');
      var bin = S.ytdlpBin();
      var infoBox = h('div'), prog = UI.progress(), qualWrap = h('div');
      var url = h('input', { class: 'grow ltr', placeholder: 'https://youtube.com/… أو instagram / tiktok / pinterest', value: o.url, oninput: function (e) { o.url = e.target.value; badge(); } });
      var plat = h('span', { class: 'chip' });
      function badge() { var p = Y.platformOf(o.url); plat.textContent = p ? p.label : 'لينك'; plat.style.display = o.url ? '' : 'none'; }

      function drawQual() {
        UI.empty(qualWrap);
        var hs = o.info && o.info.heights && o.info.heights.length ? o.info.heights : null;
        var opts = Y.QUALITIES.filter(function (q) { return !hs || q.id === 'best' || q.id === 'audio' || hs.some(function (x) { return x >= +q.id; }); }).map(function (q) { return { value: q.id, label: q.label }; });
        if (!opts.some(function (x) { return x.value === o.quality; })) o.quality = 'best';
        qualWrap.appendChild(UI.seg(opts, o.quality, function (v) { o.quality = v; }));
      }

      function drawInfo() {
        UI.empty(infoBox);
        var i = o.info; if (!i) return;
        infoBox.appendChild(h('div', { class: 'dl-info' }, i.thumbnail ? h('img', { src: i.thumbnail, alt: '' }) : null,
          h('div', { class: 'grow' }, h('div', { class: 'name' }, h('bdi', null, i.title)), h('div', { class: 'hint' }, (i.platform ? i.platform.label + ' · ' : '') + (i.uploader ? i.uploader + ' · ' : '') + (i.duration ? UI.fmtTime(i.duration) : '') + (i.heights.length ? ' · لحد ' + i.heights[0] + 'p' : '')))));
      }

      var analyze = UI.btn('حلّل اللينك', function () {
        if (!o.url.trim()) return UI.toast('حط اللينك الأول', true);
        UI.safe('بيقرا اللينك', function () { return S.downloadInfo(o.url).then(function (i) { o.info = i; o.start = ''; o.end = ''; drawInfo(); drawQual(); drawRange(); }); }, analyze);
      });
      // range slider over the video's length: drag the start and end handles (or type m:ss)
      var rangeBox = h('div', { class: 'dl-range' });
      function mmss(t) { t = Math.max(0, Math.round(t)); var hh = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return (hh ? hh + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }
      function drawRange() {
        UI.empty(rangeBox);
        var D = o.info && o.info.duration;
        if (!D) { rangeBox.appendChild(h('div', { class: 'hint' }, 'حلّل اللينك الأول عشان يظهرلك شريط الوقت')); return; }
        var a = Y.parseTime(o.start), b = Y.parseTime(o.end);
        if (a === null) a = 0; if (b === null || b > D) b = D;
        var track = h('div', { class: 'rs-track' }), fill = h('div', { class: 'rs-fill' });
        var lo = h('input', { type: 'range', min: 0, max: D, step: 1, value: a, class: 'rs-in lo' });
        var hi = h('input', { type: 'range', min: 0, max: D, step: 1, value: b, class: 'rs-in hi' });
        var ta = h('input', { class: 'ltr rs-time', value: mmss(a) }), tb = h('input', { class: 'ltr rs-time', value: mmss(b) });
        var len = h('span', { class: 'hint' });
        function sync(from) {
          var x = +lo.value, y = +hi.value;
          if (x > y - 1) { if (from === 'lo') x = Math.max(0, y - 1); else y = Math.min(D, x + 1); lo.value = x; hi.value = y; }
          fill.style.left = (x / D * 100) + '%'; fill.style.right = (100 - y / D * 100) + '%';
          ta.value = mmss(x); tb.value = mmss(y);
          o.start = x > 0 ? mmss(x) : ''; o.end = y < D ? mmss(y) : '';
          len.textContent = 'المدة: ' + mmss(y - x) + (x === 0 && y === D ? ' (الفيديو كله)' : '');
        }
        lo.addEventListener('input', function () { sync('lo'); }); hi.addEventListener('input', function () { sync('hi'); });
        ta.addEventListener('change', function () { var v = Y.parseTime(ta.value); if (v !== null) { lo.value = Math.min(v, D); sync('lo'); } });
        tb.addEventListener('change', function () { var v = Y.parseTime(tb.value); if (v !== null) { hi.value = Math.min(v, D); sync('hi'); } });
        // minute ticks
        var ticks = h('div', { class: 'rs-ticks ltr' }), stepM = D > 3600 ? 10 : D > 1200 ? 5 : D > 300 ? 1 : 0.5;
        for (var m = 0; m * 60 <= D; m += stepM) ticks.appendChild(h('span', { style: { left: (m * 60 / D * 100) + '%' } }, mmss(m * 60)));
        function nudge(which, d) { return UI.btn((d > 0 ? '+' : '−') + Math.abs(d) + 's', function () { var el = which === 'lo' ? lo : hi; el.value = Math.max(0, Math.min(D, +el.value + d)); sync(which); }, 'small'); }
        rangeBox.appendChild(h('div', { class: 'rs ltr' }, track, fill, lo, hi));
        rangeBox.appendChild(ticks);
        rangeBox.appendChild(h('div', { class: 'row rs-row' }, h('label', null, 'من'), ta, nudge('lo', -1), nudge('lo', 1), h('span', { class: 'spacer' }), h('label', null, 'لحد'), tb, nudge('hi', -1), nudge('hi', 1)));
        rangeBox.appendChild(h('div', { class: 'row' }, len, h('span', { class: 'spacer' }), UI.btn('الفيديو كله', function () { lo.value = 0; hi.value = D; sync('lo'); }, 'small')));
        sync('lo');
      }
      var go = UI.btn('نزّل', function () {
        if (!o.url.trim()) return UI.toast('حط اللينك الأول', true);
        prog.set(0);
        UI.safe('بيحمّل', function () {
          return S.downloadMedia({ url: o.url, quality: o.quality, start: o.start || undefined, end: o.end || undefined, place: o.place, onProgress: function (p, phase) { prog.set(p); UI.status(phase === 'full' ? 'القص أثناء التحميل مانفعش — بينزّل الفيديو كله ويقصه هنا…' : 'تحميل ' + Math.round(p * 100) + '%', 'busy'); } })
            .then(function (r) { prog.set(1); UI.toast(r.placed ? 'نزل على التايملين ✓' : 'اتحمّل ✓ ' + r.file.split(/[\\/]/).pop()); });
        }, go);
      }, 'primary');

      if (!bin) view.appendChild(UI.card('محتاج yt-dlp', UI.hint('أداة التحميل (yt-dlp) مش موجودة. المثبّت بيثبّتها تلقائي — أو نزّلها وحدد مكانها من الإعدادات.'),
        UI.row(UI.btn('صفحة yt-dlp', function () { EF.openUrl('https://github.com/yt-dlp/yt-dlp#installation'); }, 'small'), UI.btn('الإعدادات', function () { EF.show('settings'); }, 'small'))));
      view.appendChild(UI.card(null, UI.row(url, plat), UI.row(analyze), infoBox,
        UI.field('الجودة', qualWrap),
        UI.field('الجزء', rangeBox),
        UI.row(h('label', null, h('input', { type: 'checkbox', checked: o.place, onchange: function (e) { o.place = e.target.checked; } }), ' حطه على التايملين عند رأس التشغيل')),
        prog, UI.row(go),
        UI.hint('بيتحفظ جنب المشروع في فولدر "EditFast Media/Downloads" بصيغة MP4 (H.264) اللي بريمير بيفتحها على طول. نزّل بس المحتوى اللي عندك حق تستخدمه.')));
      badge(); drawQual(); drawInfo(); drawRange();
    }
  });
})();
