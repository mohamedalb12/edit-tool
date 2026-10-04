/* المالتي كام. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  var COLORS = ['#7c5cff', '#3ecf8e', '#f5b942', '#ff5c6c', '#4cc9f0', '#f72585'];
  EF.tabs.push({
    id: 'multicam', icon: '🎥', label: 'مالتي كام', title: 'المالتي كام',
    render: function (view) {
      var S = EF.services, plan = null, tracks = [], minShot = 2;
      var setup = h('div'), out = h('div');
      var rows = [];
      S.seq().then(function (s) {
        s.audio.filter(function (t) { return t.clips.length; }).forEach(function (t, i) {
          var on = h('input', { type: 'checkbox', checked: true });
          var v = UI.select(s.video.map(function (x) { return { value: x.index, label: 'V' + (x.index + 1) }; }), Math.min(i, s.video.length - 1));
          rows.push({ a: t.index, on: on, v: v });
          setup.appendChild(UI.row(on, h('span', null, 'صوت A' + (t.index + 1) + ' ← كاميرا'), v));
        });
        var wide = UI.select([{ value: -1, label: 'مفيش' }].concat(s.video.map(function (x) { return { value: x.index, label: 'V' + (x.index + 1) }; })), -1);
        setup.appendChild(UI.field('لقطة واسعة', wide)); setup.wide = wide;
      }).catch(function (e) { setup.appendChild(UI.hint(e.message)); });

      function draw() {
        UI.empty(out); if (!plan) return;
        var total = plan.plan.length ? plan.plan[plan.plan.length - 1].end - plan.plan[0].start : 1, t0 = plan.plan.length ? plan.plan[0].start : 0;
        var bar = h('div', { class: 'timeline' });
        plan.plan.forEach(function (p) {
          var ci = plan.tracks.indexOf(p.trackIndex);
          bar.appendChild(h('span', { style: { left: ((p.start - t0) / total * 100) + '%', width: ((p.end - p.start) / total * 100) + '%', background: COLORS[(ci < 0 ? 5 : ci) % COLORS.length] }, title: 'V' + (p.trackIndex + 1) }));
        });
        var list = h('div', { class: 'list' });
        plan.plan.forEach(function (p) {
          var sel = UI.select(plan.tracks.map(function (v) { return { value: v, label: 'V' + (v + 1) }; }), p.trackIndex, function (v) { p.trackIndex = +v; draw(); });
          list.appendChild(h('div', { class: 'item' }, h('span', { class: 't click', onclick: function () { S.setPlayhead(p.start); } }, UI.fmtTime(p.start)), h('span', { class: 'grow' }, (p.end - p.start).toFixed(1) + 's'), sel));
        });
        var applyBtn = UI.btn('طبّق الخطة', function () {
          UI.safe('بيطبّق', function () { return S.multicamApply({ plan: plan.plan, tracks: plan.tracks, clone: true }).then(function (r) { UI.toast(r.switches + ' تبديلة ✓ — ' + r.sequence); }); }, applyBtn);
        }, 'primary');
        out.appendChild(UI.card('الخطة — ' + plan.summary.cuts + ' تبديلة (راجعها قبل التطبيق)', bar, list, UI.row(applyBtn)));
      }
      var analyze = UI.btn('حلّل مين بيتكلم', function () {
        var chosen = rows.filter(function (r) { return r.on.checked; });
        UI.safe('بيحلل الصوت', function () {
          return S.multicamAnalyze({ audioTracks: chosen.map(function (r) { return r.a; }), videoTracks: chosen.map(function (r) { return +r.v.value; }), minShot: minShot, wideTrack: setup.wide ? +setup.wide.value : -1 })
            .then(function (r) { plan = r; draw(); });
        }, analyze);
      }, 'primary');
      view.appendChild(UI.card('الكاميرات', UI.hint('كل كاميرا على تراك فيديو، وصوت مايك كل واحد على تراك صوت، ومتزامنين.'), setup,
        UI.field('أقل مدة لقطة', UI.slider(0.8, 6, 0.1, minShot, function (v) { return v.toFixed(1) + 's'; }, function (v) { minShot = v; })), UI.row(analyze)));
      view.appendChild(out);
    }
  });
})();
