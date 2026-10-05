/* EditFast AI — المونتير الذكي. */
(function () {
  var EF = window.EF, UI = EF.ui, h = UI.h;
  EF.tabs = EF.tabs || [];

  var state = { agent: null, level: null, log: [] };

  function styleForm(S, onSaved) {
    var st = S.settings.style || {};
    var f = {
      primary: h('input', { type: 'color', value: st.primary || '#7C5CFF' }),
      accent: h('input', { type: 'color', value: st.accent || '#FFD84D' }),
      text: h('input', { type: 'color', value: st.text || '#FFFFFF' }),
      background: h('input', { type: 'color', value: st.background || '#0E0E14' }),
      font: h('input', { value: st.font || 'Cairo', class: 'grow' }),
      pace: UI.select([{ value: 'calm', label: 'هادي' }, { value: 'medium', label: 'متوسط' }, { value: 'fast', label: 'سريع (ريلز)' }], st.pace || 'fast'),
      captions: UI.select([{ value: 'word', label: 'كلمة كلمة' }, { value: 'short', label: '3-4 كلمات' }, { value: 'sentence', label: 'جملة' }], st.captions || 'short'),
      sfx: UI.select([{ value: 'low', label: 'قليل' }, { value: 'medium', label: 'متوسط' }, { value: 'high', label: 'كتير' }], st.sfx || 'medium'),
      motion: UI.select([{ value: '1', label: 'هادي' }, { value: '2', label: 'متوسط' }, { value: '3', label: 'قوي' }], String(st.motion || 2)),
      notes: h('textarea', { placeholder: 'أي حاجة تانية عن ستايلك… (مثلاً: بحب الزووم السريع، مش بحب الترانزيشنز الكتير)' }, st.notes || '')
    };
    return UI.card('ذوقك (بيتسأل مرة واحدة)',
      UI.hint('المونتير الذكي بيلتزم بالألوان والإيقاع دول في كل فيديو. تقدر تغيّرهم في أي وقت.'),
      UI.row(h('label', null, 'الألوان'), f.primary, 'أساسي', f.accent, 'مميز', f.text, 'نص', f.background, 'خلفية'),
      UI.field('الخط', f.font), UI.field('الإيقاع', f.pace), UI.field('الكابشن', f.captions),
      UI.field('المؤثرات', f.sfx), UI.field('قوة الحركة', f.motion), f.notes,
      UI.row(UI.btn('احفظ ذوقي', function () {
        var style = {}; Object.keys(f).forEach(function (k) { style[k] = f[k].value; });
        S.saveSettings({ style: style }); UI.toast('اتحفظ ذوقك ✓'); state.agent = null; onSaved();
      }, 'primary')));
  }

  EF.tabs.push({
    id: 'agent', icon: '✨', label: 'المونتير', title: 'EditFast AI — المونتير الذكي',
    render: function (view) {
      var S = EF.services;
      var level = state.level || S.settings.agentLevel || 'strong';
      var chat = h('div', { class: 'chat' });
      var input = h('textarea', { placeholder: 'اكتب اللي عايزه… مثلاً: "ابني مشهد افتتاحي فيه اسم القناة بألواني" أو "مونتج الفيديو ده كله"', rows: 3 });
      var send = UI.btn('ابعت', go, 'primary');
      var stop = UI.btn('وقّف', function () { if (state.agent) state.agent.stop(); }, 'danger');
      var pickerWrap = h('div');
      var styleWrap = h('div');

      var typing = null;
      function add(cls, text) {
        var m = h('div', { class: 'msg ' + cls });
        if (cls === 'ai') UI.wordFx(m, text, { step: 28 }); else m.textContent = text;
        if (typing && typing.parentNode === chat) chat.insertBefore(m, typing); else chat.appendChild(m); // the typing dots stay last
        chat.scrollTop = chat.scrollHeight; state.log.push({ cls: cls, text: text }); return m;
      }
      function setTyping(on) {
        if (on && !typing) { typing = h('div', { class: 'msg typing', 'aria-label': 'بيشتغل' }, h('i'), h('i'), h('i')); chat.appendChild(typing); chat.scrollTop = chat.scrollHeight; }
        if (!on && typing) { typing.remove(); typing = null; }
      }
      state.log.forEach(function (l) { var m = h('div', { class: 'msg ' + l.cls }); if (l.cls === 'ai') UI.wordFx(m, l.text, { step: 10 }); else m.textContent = l.text; chat.appendChild(m); });

      function picker() { UI.empty(pickerWrap).appendChild(UI.modelPicker(level === 'max' ? 'agent_max' : 'agent_strong')); }
      function renderStyle() { UI.empty(styleWrap); if (!S.settings.style) styleWrap.appendChild(styleForm(S, renderStyle)); }

      function askUser(question, options) {
        return new Promise(function (resolve) {
          setTyping(false);
          var box = add('ask', question);
          var chips = h('div', { class: 'chips' });
          var other = h('input', { placeholder: 'أو اكتب ردك…', class: 'grow' });
          function answer(v) { box.appendChild(h('div', { class: 'hint' }, '← ' + v)); chips.remove(); otherRow.remove(); state.log.push({ cls: 'user', text: v }); setTyping(true); resolve(v); }
          (options || []).forEach(function (o) { chips.appendChild(h('button', { class: 'chip', type: 'button', onclick: function () { answer(o); } }, o)); });
          var otherRow = UI.row(other, UI.btn('رد', function () { if (other.value.trim()) answer(other.value.trim()); }, 'small'));
          other.addEventListener('keydown', function (e) { if (e.key === 'Enter' && other.value.trim()) answer(other.value.trim()); });
          box.appendChild(chips); box.appendChild(otherRow); chat.scrollTop = chat.scrollHeight;
        });
      }
      S.askUserImpl = askUser;

      // the agent outlives this view (switching tabs keeps the conversation), so its events always target the live chat
      state.ui = { add: add, pending: [] };
      function getAgent() {
        if (state.agent && state.agentLevel === level) return state.agent;
        var Agent = EF.node('agent').EditFastAgent;
        state.agentLevel = level;
        state.agent = new Agent({
          llm: S.llm, model: S.model(level === 'max' ? 'agent_max' : 'agent_strong'), services: S, level: level, style: S.settings.style,
          events: {
            onText: function (t) { if (t && t.trim()) state.ui.add('ai', t.trim()); },
            onTool: function (name) { state.ui.pending.push(state.ui.add('tool', toolLabel(name))); },
            onToolResult: function (name, r) {
              // tools run in order, so the oldest pending line belongs to this result (an ask_user box may sit in between)
              var line = state.ui.pending.shift(); if (!line) return;
              line.classList.add(r.ok ? 'ok' : 'fail');
              if (!r.ok) line.textContent += ' — ' + r.error;
            }
          }
        });
        return state.agent;
      }

      function go() {
        var text = input.value.trim(); if (!text) return;
        if (!S.settings.keys.openrouter) { UI.toast('حط مفتاح OpenRouter من الإعدادات الأول', true); return; }
        input.value = ''; add('user', text);
        var a = getAgent(); a.model = S.model(level === 'max' ? 'agent_max' : 'agent_strong');
        setTyping(true);
        UI.safe('المونتير شغّال', function () { return a.send(text); }, send).then(function () { setTyping(false); });
      }
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(); });

      var suggestions = ['إيه اللي عند رأس التشغيل؟', 'مونتج الفيديو ده كله بذوقي', 'شيل السكتات والتكرار وابدأ بهوك قوي', 'ابني مشهد افتتاحي فيه اسم القناة', 'نزّل كابشن كلمة كلمة', 'حط مؤثرات صوت على اللحظات المهمة'];

      view.appendChild(UI.card(null,
        UI.row(h('label', null, 'المستوى'), UI.seg([{ value: 'strong', label: 'قوي' }, { value: 'max', label: 'قوي جدًا' }], level, function (v) {
          level = state.level = v; S.saveSettings({ agentLevel: v }); picker();
        }), h('span', { class: 'spacer' }), UI.btn('محادثة جديدة', function () { state.agent = null; state.log = []; UI.empty(chat); }, 'small')),
        pickerWrap,
        UI.hint('بيشتغل بس على السيكوينس المفتوحة وأدوات الإضافة. أي عملية بتشيل أجزاء بتتعمل على نسخة.')));
      // what the AI editor can see right now — refreshed while this tab is open
      var seeTxt = h('span', { class: 'grow' }, 'بيقرا السيكوينس…');
      var seeBar = h('div', { class: 'seebar', title: 'المونتير الذكي بياخد صورة حية من السيكوينس مع كل رسالة' }, h('span', { class: 'eye' }), seeTxt);
      function refreshSee() {
        if (!document.body.contains(seeBar)) { clearInterval(seeTimer); return; }
        S.seq().then(function (sq) {
          var clips = sq.video.concat(sq.audio).reduce(function (n, t) { return n + t.clips.length; }, 0);
          var tr = S.transcript && S.transcript.seqId === sq.id ? ' · تفريغ ' + S.transcript.words.length + ' كلمة' : ' · من غير تفريغ';
          UI.empty(seeTxt).appendChild(document.createTextNode('شايف: '));
          seeTxt.appendChild(h('bdi', null, sq.name)); seeTxt.appendChild(document.createTextNode(' · '));
          seeTxt.appendChild(h('bdi', null, UI.fmtTime(sq.playhead)));
          seeTxt.appendChild(document.createTextNode(' · ' + clips + ' كليب' + ((sq.markers || []).length ? ' · ' + sq.markers.length + ' ماركر' : '') + tr));
          seeBar.classList.add('live');
        }).catch(function () { seeTxt.textContent = 'مفيش سيكوينس مفتوحة'; seeBar.classList.remove('live'); });
      }
      view.appendChild(seeBar);
      var seeTimer = setInterval(refreshSee, 3000); refreshSee();
      view.appendChild(styleWrap);
      view.appendChild(UI.card(null, chat,
        h('div', { class: 'chips' }, suggestions.map(function (s) { return h('button', { class: 'chip', type: 'button', onclick: function () { input.value = s; input.focus(); } }, s); })),
        h('div', { style: { marginTop: '8px' } }, input), UI.row(send, stop, h('span', { class: 'hint' }, 'Ctrl+Enter للإرسال'))));
      picker(); renderStyle();
    }
  });

  var LABELS = {
    get_project_state: 'بيقرا السيكوينس', ask_user: 'سؤال ليك', save_style: 'بيحفظ ذوقك', transcribe: 'بيفرّغ الكلام', get_transcript: 'بيقرا التفريغ',
    remove_silences: 'بيشيل السكتات', remove_repeats: 'بيشيل التكرار', make_hook: 'بيعمل الهوك', add_captions: 'بينزّل الكابشن',
    apply_motion: 'بيحط حركة', add_title: 'بينزّل تايتل', build_scene: 'بيبني مشهد متحرك', generate_sfx: 'بيولّد مؤثر صوتي',
    auto_effects: 'مؤثرات تلقائية', add_markers: 'بيحط ماركرز', search_broll: 'بيدوّر على B-Roll', place_broll: 'بيحط B-Roll',
    library_search: 'بيدوّر في مكتبتك', place_library_item: 'بيحط من مكتبتك', chapters: 'بيطلّع الفصول', set_playhead: 'بيحرّك رأس التشغيل'
  };
  function toolLabel(n) { return LABELS[n] || n; }
})();
