/* تحميل من يوتيوب/إنستجرام/تيك توك/بنترست/X: الجودة + البداية والنهاية + يتحط على التايملين. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var o = { url: '', quality: '1080', start: '', end: '', place: true, info: null };
  EF.tabs.push({
    id: 'download', label: 'تحميل', title: 'تحميل فيديو من لينك',
    render: function (view) {
      var S = EF.services, Y = EF.node('ytdlp');
      // ——— yt-dlp status: install / update from here, cookies when YouTube asks to sign in ———
      var toolBox = h('div'), toolProg = UI.progress();
      function drawTool() {
        UI.empty(toolBox);
        Promise.resolve().then(function () { return S.ytdlpStatus(); }).then(function (st) {
          UI.empty(toolBox);
          var inst = UI.btn(st.installed ? 'حدّث yt-dlp' : 'ثبّت yt-dlp (40 ميجا)', function () {
            toolProg.set(0);
            UI.safe('بيثبّت yt-dlp', function () { return S.ytdlpInstall({ onProgress: function (p) { toolProg.set(p); } }).then(function (r) { toolProg.set(1); UI.toast('yt-dlp ' + (r.version || '') + ' جاهز ✓'); drawTool(); }); }, inst);
          }, st.installed ? 'small' : 'primary');
          var cookies = UI.select([{ value: '', label: 'من غير' }, { value: 'chrome', label: 'Chrome' }, { value: 'safari', label: 'Safari' }, { value: 'firefox', label: 'Firefox' }, { value: 'edge', label: 'Edge' }, { value: 'brave', label: 'Brave' }], st.cookiesFrom || '', function (v) { S.saveSettings({ ytdlpCookies: v }); UI.toast(v ? 'هياخد تسجيل دخولك من ' + v + ' ✓' : 'من غير كوكيز'); });
          toolBox.appendChild(h('div', { class: 'row dl-tool' },
            h('span', { class: 'chip' + (st.installed ? ' ok' : ' bad') }, st.installed ? 'yt-dlp ' + (st.version || '') + (st.managed ? '' : ' (من الجهاز)') : 'yt-dlp مش متثبّت'),
            st.installed && !st.jsRuntime && /^20(2[6-9]|25\.1[12])/.test(st.version || '') ? h('span', { class: 'chip bad', title: 'يوتيوب محتاج deno أو node: brew install deno' }, 'مفيش deno/node') : null,
            h('span', { class: 'spacer' }), inst));
          toolBox.appendChild(h('div', { class: 'row' }, h('label', { title: 'لو يوتيوب قالك سجّل دخول أو الفيديو خاص' }, 'كوكيز المتصفح'), cookies));
          toolBox.appendChild(toolProg);
        }).catch(function (e) { toolBox.appendChild(h('div', { class: 'hint err' }, e.message)); });
      }
      var bin = true;
      var infoBox = h('div'), prog = UI.progress(), qualWrap = h('div');
      var url = h('textarea', { class: 'grow ltr dl-urls', rows: 2, placeholder: 'https://youtube.com/… أو instagram / tiktok / dropbox / drive\n(تقدر تلصق كذا لينك، كل واحد في سطر)', value: o.url, oninput: function (e) { o.url = e.target.value; badge(); } });
      function links() { return String(o.url || '').split(/[\s]+/).map(function (x) { return x.trim(); }).filter(function (x) { return /^https?:\/\//i.test(x); }); }
      var plat = h('span', { class: 'chip' });
      function badge() { var l = links(); var p = l.length ? Y.platformOf(l[0]) : null; plat.textContent = l.length > 1 ? l.length + ' لينكات' : (p ? p.label : 'لينك'); plat.style.display = l.length ? '' : 'none'; }

      function drawQual() {
        UI.empty(qualWrap);
        var hs = o.info && o.info.heights && o.info.heights.length ? o.info.heights : null;
        var opts = Y.QUALITIES.filter(function (q) { if (o.info && o.info.cloud) return q.id === 'best' || q.id === 'audio'; return !hs || q.id === 'best' || q.id === 'audio' || hs.some(function (x) { return x >= +q.id; }); }).map(function (q) { return { value: q.id, label: q.label }; });
        if (!opts.some(function (x) { return x.value === o.quality; })) o.quality = 'best';
        qualWrap.appendChild(UI.seg(opts, o.quality, function (v) { o.quality = v; }));
      }

      function drawInfo() {
        UI.empty(infoBox);
        var i = o.info; if (!i) return;
        infoBox.appendChild(h('div', { class: 'dl-info' }, i.thumbnail ? h('img', { src: i.thumbnail, alt: '' }) : null,
          h('div', { class: 'grow' }, h('div', { class: 'name' }, h('bdi', null, i.title)), h('div', { class: 'hint' }, (i.platform ? i.platform.label + ' · ' : '') + (i.uploader ? i.uploader + ' · ' : '') + (i.duration ? UI.fmtTime(i.duration) : '') + (i.heights.length ? ' · لحد ' + i.heights[0] + 'p' : '')))));
        if (i.cloud && i.folder) infoBox.appendChild(UI.hint('ده فولدر: هينزل كله (ملف مضغوط)، يتفك، يتضاف لمكتبتي ويتعمله Bin في بريمير. لو عايز ملف واحد بس أو جزء من فيديو: افتح الفولدر في دروبوكس، افتح الملف، وانسخ لينكه هو.'));
        else if (i.cloud && i.duration) infoBox.appendChild(UI.hint('اختار الجزء من الشريط تحت — هينزل الجزء ده بس من غير ما ينزّل الفيديو كله.'));
      }

      var analyze = UI.btn('حلّل اللينك', function () {
        if (!links().length) return UI.toast('حط اللينك الأول', true);
        o.info = null; drawInfo(); // never show the previous link's video while reading a new one
        UI.safe('بيقرا اللينك', function () { return S.downloadInfo(links()[0]).then(function (i) { drawTool(); o.info = i; o.start = ''; o.end = ''; drawInfo(); drawQual(); drawRange(); }); }, analyze);
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
        var ticks = h('div', { class: 'rs-ticks ltr' }), stepM = [0.5, 1, 2, 5, 10, 15, 30, 60].find(function (m) { return D / 60 / m <= 5; }) || 120;
        for (var m = 0; m * 60 <= D; m += stepM) ticks.appendChild(h('span', { style: { left: (m * 60 / D * 100) + '%' } }, mmss(m * 60)));
        function nudge(which, d) { return UI.btn((d > 0 ? '+' : '−') + Math.abs(d) + 's', function () { var el = which === 'lo' ? lo : hi; el.value = Math.max(0, Math.min(D, +el.value + d)); sync(which); }, 'small'); }
        rangeBox.appendChild(h('div', { class: 'rs ltr' }, track, fill, lo, hi));
        rangeBox.appendChild(ticks);
        rangeBox.appendChild(h('div', { class: 'row rs-row' }, h('label', null, 'من'), ta, nudge('lo', -1), nudge('lo', 1), h('span', { class: 'spacer' }), h('label', null, 'لحد'), tb, nudge('hi', -1), nudge('hi', 1)));
        rangeBox.appendChild(h('div', { class: 'row' }, len, h('span', { class: 'spacer' }), UI.btn('الفيديو كله', function () { lo.value = 0; hi.value = D; sync('lo'); }, 'small')));
        sync('lo');
      }
      var go = UI.btn('نزّل', function () {
        var list = links();
        if (!list.length) return UI.toast('حط اللينك الأول', true);
        prog.set(0);
        UI.safe('بيحمّل', function () {
          var done = 0, failed = [], last = null;
          // several links: one after the other; the start/end range only applies to a single link
          return list.reduce(function (p, u, i) {
            return p.then(function () {
              var one = list.length === 1;
              return S.downloadMedia({ url: u, quality: o.quality, start: one ? (o.start || undefined) : undefined, end: one ? (o.end || undefined) : undefined, place: o.place, onProgress: function (x, phase, got) {
                prog.set((i + x) / list.length);
                UI.status((list.length > 1 ? (i + 1) + '/' + list.length + ' · ' : '') + (phase === 'full' ? 'القص أثناء التحميل مانفعش — بينزّل الفيديو كله ويقصه هنا…' : phase === 'simple' ? 'بيجرّب نسخة جاهزة من غير دمج…' : phase === 'update' ? 'بيحدّث yt-dlp لآخر نسخة (أول مرة بس)…' : phase === 'retry' ? 'يوتيوب رفض — بيجرّب بطريقة تانية…' : phase === 'unzip' ? 'بيفك الضغط ويضيف لمكتبتي…' : phase === 'bytes' ? 'تحميل ' + Math.round((got || 0) / 1e6) + ' ميجا…' : 'تحميل ' + Math.round(x * 100) + '%'), 'busy');
              } }).then(function (r) { done++; last = r; }, function (e) { if (list.length === 1) throw e; failed.push(u + ' — ' + e.message); });
            });
          }, Promise.resolve()).then(function () {
            prog.set(1);
            if (failed.length) UI.toast(done + ' اتحمّلوا و' + failed.length + ' فشلوا: ' + failed[0], true);
            else if (last && last.type === 'folder') UI.toast(last.files.length + ' ملف اتحمّلوا واتضافوا لمكتبتي' + (last.imported ? ' وفي Bin "' + last.bin.split('/').pop() + '"' : '') + ' ✓');
            else UI.toast(list.length > 1 ? done + ' فيديو اتحمّلوا ✓' : (o.place ? 'نزل على التايملين ✓' : 'اتحمّل ✓'));
          });
        }, go);
      }, 'primary');

      view.appendChild(UI.card('أداة التحميل', toolBox, UI.hint('الإضافة بتنزّل نسختها من yt-dlp لوحدها (من غير Homebrew). المواقع بتغيّر حاجات كتير، فلو التحميل وقف فجأة دوس "حدّث yt-dlp".')));
      drawTool();
      view.appendChild(UI.card(null, UI.row(url, plat), UI.row(analyze), infoBox,
        UI.field('الجودة', qualWrap),
        UI.field('الجزء', rangeBox),
        UI.row(h('label', null, h('input', { type: 'checkbox', checked: o.place, onchange: function (e) { o.place = e.target.checked; } }), ' حطه على التايملين عند رأس التشغيل')),
        prog, UI.row(go),
        UI.hint('دروبوكس وجوجل درايف: الصق لينك المشاركة (لازم يكون "Anyone with the link"). بيتحفظ جنب المشروع في فولدر "EditFast Media/Downloads" بصيغة MP4 (H.264) اللي بريمير بيفتحها على طول. نزّل بس المحتوى اللي عندك حق تستخدمه.')));
      badge(); drawQual(); drawInfo(); drawRange();
    }
  });
})();
