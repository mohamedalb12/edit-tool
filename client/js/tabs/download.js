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
        UI.safe('بيقرا اللينك', function () { return S.downloadInfo(o.url).then(function (i) { o.info = i; drawInfo(); drawQual(); }); }, analyze);
      });
      var start = h('input', { class: 'ltr', placeholder: '0:00', value: o.start, style: { width: '80px' }, oninput: function (e) { o.start = e.target.value; } });
      var end = h('input', { class: 'ltr', placeholder: 'للآخر', value: o.end, style: { width: '80px' }, oninput: function (e) { o.end = e.target.value; } });
      var go = UI.btn('نزّل', function () {
        if (!o.url.trim()) return UI.toast('حط اللينك الأول', true);
        prog.set(0);
        UI.safe('بيحمّل', function () {
          return S.downloadMedia({ url: o.url, quality: o.quality, start: o.start || undefined, end: o.end || undefined, place: o.place, onProgress: function (p) { prog.set(p); UI.status('تحميل ' + Math.round(p * 100) + '%', 'busy'); } })
            .then(function (r) { prog.set(1); UI.toast(r.placed ? 'نزل على التايملين ✓' : 'اتحمّل ✓ ' + r.file.split(/[\\/]/).pop()); });
        }, go);
      }, 'primary');

      if (!bin) view.appendChild(UI.card('محتاج yt-dlp', UI.hint('أداة التحميل (yt-dlp) مش موجودة. المثبّت بيثبّتها تلقائي — أو نزّلها وحدد مكانها من الإعدادات.'),
        UI.row(UI.btn('صفحة yt-dlp', function () { EF.openUrl('https://github.com/yt-dlp/yt-dlp#installation'); }, 'small'), UI.btn('الإعدادات', function () { EF.show('settings'); }, 'small'))));
      view.appendChild(UI.card(null, UI.row(url, plat), UI.row(analyze), infoBox,
        UI.field('الجودة', qualWrap),
        UI.row(h('label', null, 'من'), start, h('label', null, 'لحد'), end, h('span', { class: 'hint' }, 'دقيقة:ثانية — فاضي = الفيديو كله')),
        UI.row(h('label', null, h('input', { type: 'checkbox', checked: o.place, onchange: function (e) { o.place = e.target.checked; } }), ' حطه على التايملين عند رأس التشغيل')),
        prog, UI.row(go),
        UI.hint('بيتحفظ جنب المشروع في فولدر "EditFast Media/Downloads" بصيغة MP4 (H.264) اللي بريمير بيفتحها على طول. نزّل بس المحتوى اللي عندك حق تستخدمه.')));
      badge(); drawQual(); drawInfo();
    }
  });
})();
