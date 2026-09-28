/* Emma English system: 今日任务 / 分级词汇 / 场景学习 / 课本&PET.
 * Level tracks focus on spelling + understanding (reuses the shared quiz engine in app.js
 * for EN→CN, CN→EN, 拼写, 听写, 综合测试). Scene tracks focus on meaning, context and usage
 * (own engine below: no spelling / dictation). Leitner SRS stored in profile.emma. */
(function () {
  "use strict";
  const DATA_V = "11";
  const BASE = "data/emma/";
  const INT = [0, 1, 2, 4, 7, 15, 30, 60]; // Leitner box intervals (days)
  const MASTER_BOX = 5;
  const DEFAULT_SETTINGS = { newPerDay: 20, source: "L1", scenePerDay: 6 };

  const VK = () => window.__vocabKid;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => VK().escapeHtml(String(s == null ? "" : s));
  const shuffle = (a) => VK().shuffle(a.slice());
  const sample = (a, n) => shuffle(a).slice(0, n);

  // ---------- modes (each track has its own set, with a one-line purpose) ----------
  const LEVEL_MODES = [
    { id: "guided", emoji: "🌟", label: "闯关（推荐）", desc: "理解 → 拼写 → 听写，一条龙", engine: "app", wide: true },
    { id: "card", emoji: "📖", label: "认词卡", desc: "音标 · 中文 · 例句 · 搭配，先认识", engine: "emma" },
    { id: "en2zh", emoji: "🔤", label: "EN → CN", desc: "看英文选意思，检查理解", engine: "app" },
    { id: "zh2en", emoji: "🀄", label: "CN → EN", desc: "看中文选单词，分清形近词", engine: "app" },
    { id: "spell", emoji: "🔠", label: "拼写", desc: "用字母拼出单词，记牢拼法", engine: "app" },
    { id: "dictation", emoji: "🎧", label: "听写", desc: "只听发音写单词，最能检验拼写", engine: "app" },
    { id: "form", emoji: "🧩", label: "词形 / 搭配", desc: "选对词形或固定搭配（介词、动词）", engine: "emma" },
    { id: "test", emoji: "🏅", label: "综合测试", desc: "25 题，拼写 + 听写占一半以上", engine: "app", wide: true, test: true },
  ];
  const SCENE_MODES = [
    { id: "scard", emoji: "🗂️", label: "场景词卡", desc: "词组 + 对话里的原句，看懂怎么用" },
    { id: "ctx", emoji: "🔍", label: "语境选义", desc: "这句话里的它是什么意思？" },
    { id: "sit", emoji: "💡", label: "情景选句", desc: "遇到这种情况，该怎么说？" },
    { id: "gap", emoji: "🧏", label: "听对话补全", desc: "听一段对话，选出缺的那句" },
    { id: "resp", emoji: "💬", label: "听一句选回应", desc: "听对方说话，选最合适的回答" },
    { id: "order", emoji: "🔢", label: "对话排序", desc: "把打乱的对话排回正确顺序" },
    { id: "role", emoji: "🎭", label: "角色扮演", desc: "选一个角色，电脑读对方台词" },
    { id: "shadow", emoji: "🗣️", label: "跟读", desc: "一句一句听，跟着大声说" },
    { id: "stest", emoji: "🏅", label: "场景综合测试", desc: "语境 + 回应 + 情景 + 听力，约 24 题", wide: true, test: true },
  ];
  const TRACKS = [
    { id: "daily", emoji: "📅", name: "今日任务", desc: "新词练拼写，短语练用法，到期的自动复习" },
    { id: "levels", emoji: "🪜", name: "分级词汇", desc: "小学 → 初中 → KET → PET：重拼写和词义" },
    { id: "scenes", emoji: "🌍", name: "场景学习", desc: "机场、课堂、餐厅…：重语境、用法和听力" },
    { id: "textbook", emoji: "📘", name: "课本 & PET", desc: "原来的课本单元词表和练习" },
  ];

  // ---------- state ----------
  const cache = { levelIndex: null, levels: {}, sceneIndex: null, scenes: {} };
  const ui = { view: "tracks", level: null, groups: [], scene: null, sub: null };
  let wordLevel = {}; // en(lower) -> {lv}; set when a synthetic session starts (for SRS hook)
  let play = null; // current emma-engine session

  function fetchJSON(path) {
    return fetch(BASE + path + "?v=" + DATA_V).then((r) => {
      if (!r.ok) throw new Error("load " + path);
      return r.json();
    });
  }
  function loadLevelIndex() {
    return cache.levelIndex ? Promise.resolve(cache.levelIndex) : fetchJSON("levels/index.json").then((j) => (cache.levelIndex = j.levels));
  }
  function loadLevel(id) {
    return cache.levels[id] ? Promise.resolve(cache.levels[id]) : fetchJSON("levels/" + id + ".json").then((j) => (cache.levels[id] = j));
  }
  function loadSceneIndex() {
    return cache.sceneIndex ? Promise.resolve(cache.sceneIndex) : fetchJSON("scenes/index.json").then((j) => (cache.sceneIndex = j.scenes));
  }
  function loadScene(id) {
    return cache.scenes[id] ? Promise.resolve(cache.scenes[id]) : fetchJSON("scenes/" + id + ".json").then((j) => (cache.scenes[id] = j));
  }

  // ---------- profile store / SRS ----------
  function store() {
    const p = VK().profileStore();
    return p.emma || {};
  }
  function settings() {
    return Object.assign({}, DEFAULT_SETTINGS, store().settings || {});
  }
  function updateEmma(fn) {
    VK().updateProfile((p) => {
      p.emma = p.emma || {};
      p.emma.srs = p.emma.srs || {};
      fn(p.emma);
    });
  }
  function today() {
    const d = new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  }
  const lkey = (lv, w) => "L|" + lv + "|" + w;
  const skey = (sc, w) => "S|" + sc + "|" + w;
  function srsIntro(key) {
    updateEmma((e) => {
      if (!e.srs[key]) e.srs[key] = { b: 0, due: today(), f: today() };
    });
  }
  function srsGrade(key, ok) {
    const t = today();
    updateEmma((e) => {
      const it = e.srs[key] || { b: 0, due: t, f: t };
      if (ok) {
        if (it.due <= t) {
          it.b = Math.min(INT.length - 1, it.b + 1);
          it.due = t + INT[it.b];
        }
      } else {
        it.b = 1;
        it.due = t + 1;
        it.l = (it.l || 0) + 1;
      }
      it.n = (it.n || 0) + 1;
      e.srs[key] = it;
    });
  }
  function srsStats(prefix) {
    const srs = store().srs || {};
    let learned = 0, mastered = 0, due = 0;
    const t = today();
    Object.keys(srs).forEach((k) => {
      if (k.indexOf(prefix) !== 0) return;
      const it = srs[k];
      if (it.b >= 1) learned++;
      if (it.b >= MASTER_BOX) mastered++;
      if (it.due <= t && it.b >= 1) due++;
    });
    return { learned, mastered, due };
  }

  // ---------- TTS (en-US, a different voice per dialogue role when available) ----------
  let voices = [];
  function refreshVoices() {
    try {
      voices = speechSynthesis.getVoices().filter((v) => /^en[-_]US/i.test(v.lang));
    } catch (e) { voices = []; }
  }
  if (typeof speechSynthesis !== "undefined") {
    refreshVoices();
    try { speechSynthesis.addEventListener("voiceschanged", refreshVoices); } catch (e) {}
  }
  let speakGen = 0;
  function stopSpeak() {
    speakGen++;
    try { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); } catch (e) {}
  }
  /** speak one line; resolves when done (or after an estimated time if the engine is silent) */
  function say(text, opt) {
    opt = opt || {};
    return new Promise((resolve) => {
      const est = Math.min(9000, 700 + String(text).length * 65 / (opt.rate || 0.92));
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      try {
        if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return setTimeout(fin, 300);
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = opt.rate || 0.92;
        const vi = opt.voice || 0;
        if (voices.length) u.voice = voices[vi % voices.length];
        if (voices.length < 2 && vi % 2 === 1) u.pitch = 1.3;
        u.onend = fin;
        u.onerror = fin;
        speechSynthesis.speak(u);
      } catch (e) {}
      setTimeout(fin, est + 1500);
    });
  }
  function sayOne(text, opt) {
    stopSpeak();
    return say(text, opt);
  }
  async function sayLines(lines, roleVoice, opt) {
    stopSpeak();
    const gen = speakGen;
    for (const ln of lines) {
      if (gen !== speakGen) return;
      if (ln.gap) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      await say(ln.en, Object.assign({ voice: roleVoice(ln.r) }, opt || {}));
      if (gen !== speakGen) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  function roleVoiceFor(dlg) {
    const ids = Object.keys(dlg.roles || {});
    return (r) => Math.max(0, ids.indexOf(r));
  }

  // ---------- small DOM helpers ----------
  function h(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }
  function btn(label, cls, onClick) {
    const b = h("button", cls || "", label);
    b.type = "button";
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }
  function speakBtn(text, opt) {
    const b = btn("🔊", "speak", (e) => { e.stopPropagation(); sayOne(text, opt); });
    b.title = "听发音";
    return b;
  }
  const stripPos = (z) => String(z || "").replace(/^([a-z]+\.\s*)+/i, "");
  function root() { return $("#emma-root"); }
  function status(t) { const s = $("#app-status"); if (s) { s.textContent = t; s.style.color = ""; } }
  function showEmma() {
    VK().showScreen("emma");
    const nb = document.querySelector('.nav-tabs button[data-nav="home"]');
    if (nb) nb.classList.add("active");
    window.scrollTo(0, 0);
  }
  function backBar(label, onBack) {
    const row = h("div", "emma-back");
    row.appendChild(btn("← " + label, "ghost", onBack));
    return row;
  }
  function modeGrid(modes, onPick, disabled) {
    const grid = h("div", "mode-grid emma-modes");
    modes.forEach((m) => {
      const b = btn(`<span class="emoji">${m.emoji}</span><span class="label">${esc(m.label)}</span><span class="desc">${esc(m.desc)}</span>`,
        "mode-btn" + (m.wide ? " wide" : "") + (m.test ? " test-btn" : ""), () => onPick(m));
      b.dataset.emode = m.id;
      b.disabled = !!disabled;
      grid.appendChild(b);
    });
    return grid;
  }

  // ================= VIEWS =================
  function enter() {
    stopSpeak();
    VK().stopTimer();
    VK().clearSession();
    ui.view = "tracks";
    render();
  }
  function render() {
    if (ui.view === "tracks") return renderTracks();
    if (ui.view === "levels") return renderLevels();
    if (ui.view === "groups") return renderGroups();
    if (ui.view === "scenes") return renderScenes();
    if (ui.view === "scene") return renderScene();
    if (ui.view === "daily") return renderDaily();
  }

  function renderTracks() {
    showEmma();
    status("Emma · 英文");
    const r = root();
    r.innerHTML = "";
    const card = h("div", "card");
    card.appendChild(h("h2", "", "Emma 的英文"));
    card.appendChild(h("p", "muted small", "四条路线，各有侧重。每天先做「今日任务」最省心。"));
    const grid = h("div", "emma-track-grid");
    TRACKS.forEach((t) => {
      const b = btn(`<span class="emma-track-emoji">${t.emoji}</span><span class="emma-track-name">${esc(t.name)}</span><span class="emma-track-desc">${esc(t.desc)}</span><span class="emma-track-extra small muted" id="emma-extra-${t.id}"></span>`,
        "emma-track " + t.id, () => openTrack(t.id));
      b.dataset.track = t.id;
      grid.appendChild(b);
    });
    card.appendChild(grid);
    r.appendChild(card);
    const s = settings();
    const st = srsStats("L|");
    const ss = srsStats("S|");
    const ex = $("#emma-extra-daily");
    if (ex) ex.textContent = `每天 ${s.newPerDay} 个新词 · 到期复习 ${st.due + ss.due} 个`;
    const el = $("#emma-extra-levels");
    if (el) el.textContent = `已学 ${st.learned} · 掌握 ${st.mastered}`;
    const es = $("#emma-extra-scenes");
    if (es) es.textContent = `已学短语 ${ss.learned} · 掌握 ${ss.mastered}`;
  }
  function openTrack(id) {
    if (id === "textbook") return VK().enterEnglishTextbook();
    ui.view = id;
    render();
  }

  // ----- levels -----
  function renderLevels() {
    showEmma();
    status("Emma · 分级词汇");
    const r = root();
    r.innerHTML = "";
    const card = h("div", "card");
    card.appendChild(backBar("返回", () => { ui.view = "tracks"; render(); }));
    card.appendChild(h("h2", "", "分级词汇"));
    card.appendChild(h("p", "muted small", "重点：拼写 + 词义。先选一个级别，再选词组（每组 20 词）。"));
    const grid = h("div", "emma-level-grid");
    card.appendChild(grid);
    r.appendChild(card);
    loadLevelIndex().then((levels) => {
      levels.forEach((lv) => {
        const st = srsStats("L|" + lv.id + "|");
        const b = btn(
          `<span class="lv-name">${esc(lv.name)}</span><span class="lv-sub small muted">${esc(lv.sub)}</span>` +
            (lv.ready
              ? `<span class="lv-meta">${lv.count} 词 · ${lv.groups} 组</span><span class="lv-prog small">已学 ${st.learned} · 掌握 ${st.mastered}</span>` +
                `<span class="bar-mini"><span style="width:${Math.round((st.learned / lv.count) * 100)}%"></span></span>`
              : `<span class="lv-soon">即将上线</span>`),
          "emma-level" + (lv.ready ? "" : " soon"),
          () => { if (!lv.ready) return; ui.level = lv.id; ui.groups = []; ui.view = "groups"; render(); }
        );
        b.dataset.level = lv.id;
        b.disabled = !lv.ready;
        grid.appendChild(b);
      });
    }).catch(loadFail);
  }
  function loadFail(err) {
    console.error(err);
    status("加载失败，请检查网络");
  }

  function levelShort(id) {
    return { "L4-ket": "KET", "L4-pet": "PET" }[id] || id;
  }
  function groupLabel(lvId, ns) {
    const s = ns.slice().sort((a, b) => a - b);
    return levelShort(lvId) + " · 第" + (s.length > 3 ? s[0] + "–" + s[s.length - 1] + "组(" + s.length + ")" : s.join("、") + "组");
  }

  function renderGroups() {
    showEmma();
    const r = root();
    r.innerHTML = "";
    const card = h("div", "card");
    card.appendChild(backBar("级别", () => { ui.view = "levels"; render(); }));
    const title = h("h2", "", "…");
    card.appendChild(title);
    card.appendChild(h("p", "muted small", "点选一个或多个组（可多选）。数字＝已学/掌握。"));
    const tools = h("div", "action-row");
    tools.style.marginBottom = "10px";
    const grid = h("div", "emma-group-grid");
    const sel = h("p", "muted emma-sel");
    card.appendChild(tools);
    card.appendChild(grid);
    card.appendChild(sel);
    r.appendChild(card);
    const mcard = h("div", "card");
    mcard.appendChild(h("h2", "", "分级练习模式"));
    mcard.appendChild(h("p", "muted small", "分级词汇重拼写 + 词义：拼写、听写在闯关和综合测试里占大头。"));
    const mhost = h("div");
    mcard.appendChild(mhost);
    r.appendChild(mcard);
    loadLevel(ui.level).then((L) => {
      title.textContent = L.title + " · " + L.count + " 词";
      status("Emma · " + L.title);
      const srs = store().srs || {};
      const redraw = () => {
        grid.innerHTML = "";
        L.groups.forEach((g) => {
          let learned = 0, mastered = 0;
          g.words.forEach((w) => {
            const it = srs[lkey(L.id, w.w)];
            if (it && it.b >= 1) learned++;
            if (it && it.b >= MASTER_BOX) mastered++;
          });
          const on = ui.groups.includes(g.n);
          const b = btn(`<strong>第 ${g.n} 组</strong><span class="small muted">${esc(g.words.slice(0, 3).map((w) => w.w).join(", "))}…</span><span class="gp small">${learned}/${mastered}${mastered === g.words.length ? " ⭐" : ""}</span>`,
            "emma-group" + (on ? " selected" : "") + (learned === g.words.length ? " done" : ""), () => {
              ui.groups = on ? ui.groups.filter((x) => x !== g.n) : ui.groups.concat(g.n);
              redraw();
            });
          b.dataset.group = g.n;
          grid.appendChild(b);
        });
        const n = ui.groups.length;
        sel.textContent = n ? `已选 ${groupLabel(L.id, ui.groups)} · ${n * 20} 词左右` : "请先点选一个或多个组";
        mhost.innerHTML = "";
        mhost.appendChild(modeGrid(LEVEL_MODES, (m) => startLevelMode(m.id), !n));
      };
      tools.innerHTML = "";
      tools.appendChild(btn("下一个没学完的组", "secondary", () => {
        const g = L.groups.find((g) => g.words.some((w) => !(srs[lkey(L.id, w.w)] && srs[lkey(L.id, w.w)].b >= 1)));
        ui.groups = g ? [g.n] : [];
        redraw();
      }));
      tools.appendChild(btn("清空", "ghost", () => { ui.groups = []; redraw(); }));
      redraw();
    }).catch(loadFail);
  }

  // --- synthetic units for the shared engine ---
  function tokenRe(w) {
    return new RegExp("(^|[^A-Za-z'])(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![A-Za-z])", "i");
  }
  function unitFromGroup(L, g) {
    const words = g.words.map((x) => ({ en: x.w, zh: x.z, ipa: x.i }));
    const fillIns = [];
    const sentences = [];
    g.words.forEach((x) => {
      if (!x.e) return;
      sentences.push({ en: x.e, zh: x.c });
      if (/\s/.test(x.w)) return;
      const m = tokenRe(x.w).exec(x.e);
      if (!m) return;
      const at = m.index + m[1].length;
      fillIns.push({ template: x.e.slice(0, at) + "____" + x.e.slice(at + m[2].length), answer: x.w, zh: x.c });
    });
    return { id: levelShort(L.id) + "·" + g.n, title: levelShort(L.id) + " · 第" + g.n + "组", titleZh: L.title, words, fillIns, sentences };
  }
  function synthData(units, extra) {
    return Object.assign({ units, __emmaLevel: true }, extra || {});
  }
  function startLevelMode(mode) {
    const L = cache.levels[ui.level];
    const groups = L.groups.filter((g) => ui.groups.includes(g.n));
    if (!groups.length) return;
    const m = LEVEL_MODES.find((x) => x.id === mode);
    if (m.engine === "emma") return startEmmaPlay(mode, levelItems(mode, L, groups), { back: () => { ui.view = "groups"; render(); }, label: m.label });
    wordLevel = {};
    groups.forEach((g) => g.words.forEach((w) => (wordLevel[w.w.toLowerCase()] = L.id)));
    const units = groups.map((g) => unitFromGroup(L, g));
    VK().startSynth(synthData(units, { __emmaReturn: () => { ui.view = "groups"; render(); } }), units.map((u) => u.id), mode);
  }
  function onLevelResult(en, ok) {
    const lv = wordLevel[String(en).toLowerCase()];
    if (!lv) return;
    srsGrade(lkey(lv, en), ok);
  }
  function backFromSession(data) {
    if (data && typeof data.__emmaReturn === "function") {
      data.__emmaReturn();
      return true;
    }
    return false;
  }

  // --- level: 认词卡 + 词形/搭配 items ---
  const PREPS = ["in", "on", "at", "for", "with", "from", "to", "of", "by", "about", "into", "up", "out", "off"];
  const VERBS = ["make", "do", "take", "have", "get", "give", "go", "keep", "put", "come", "pay", "look"];
  function wordForms(w) {
    const v = /[^aeiou]y$/.test(w) ? w.slice(0, -1) : null;
    const s = v ? v + "ies" : /(s|x|z|ch|sh)$/.test(w) ? w + "es" : w + "s";
    const ed = v ? v + "ied" : /e$/.test(w) ? w + "d" : w + "ed";
    const ing = /[^e]e$/.test(w) ? w.slice(0, -1) + "ing" : w + "ing";
    const dbl = /^[a-z]*[^aeiou][aeiou][bdgmnprt]$/.test(w) && w.length <= 5 ? w + w.slice(-1) : null;
    const extra = dbl ? [dbl + "ed", dbl + "ing"] : [];
    return { s, ed, ing, all: [w, s, ed, ing, w + "er", w + "est", w + "ly"].concat(extra) };
  }
  function levelItems(mode, L, groups) {
    const words = groups.flatMap((g) => g.words.map((w) => Object.assign({ lv: L.id }, w)));
    if (mode === "card") return shuffle(words).slice(0, 20).map((w) => ({ type: "card", w, key: lkey(L.id, w.w) }));
    const items = [];
    shuffle(words).forEach((w) => {
      const it = collocItem(w, words) || formItem(w);
      if (it) items.push(it);
    });
    return items.slice(0, 12);
  }
  function collocItem(w, pool) {
    const ks = (w.k || []).filter((k) => /\s/.test(k[0]));
    for (const k of shuffle(ks)) {
      const toks = k[0].split(" ");
      if (toks.length > 4) continue;
      const idx = toks.findIndex((t) => t.toLowerCase() !== w.w.toLowerCase() && (PREPS.includes(t) || VERBS.includes(t)));
      if (idx < 0) continue;
      const ans = toks[idx];
      const cls = PREPS.includes(ans) ? PREPS : VERBS;
      const opts = [ans].concat(sample(cls.filter((x) => x !== ans), 3));
      const blanked = toks.map((t, i) => (i === idx ? "____" : t)).join(" ");
      return {
        type: "mcq", cat: "搭配", key: lkey(w.lv, w.w),
        hint: "选出正确的搭配词",
        promptHtml: `<div class="emma-big">${esc(blanked)}</div><div class="prompt-zh small">${esc(k[1])}</div>`,
        options: shuffle(opts).map((o) => ({ text: o, ok: o === ans })),
        answer: k[0], speak: k[0],
        explain: `${k[0]}：${k[1]}` + (w.e ? `\n例句：${w.e}\n${w.c}` : ""),
      };
    }
    return null;
  }
  function formItem(w) {
    if (/\s/.test(w.w) || !w.e || !/^[a-z]+$/.test(w.w)) return null;
    const F = wordForms(w.w);
    const toks = w.e.match(/[A-Za-z']+/g) || [];
    const hit = toks.find((t) => F.all.includes(t.toLowerCase()));
    if (!hit) return null;
    const a = hit.toLowerCase();
    let opts = Array.from(new Set([a, w.w, F.s, F.ed, F.ing]));
    if (opts.length < 3) return null;
    opts = [a].concat(sample(opts.filter((o) => o !== a), 3));
    const m = tokenRe(hit).exec(w.e);
    const at = m.index + m[1].length;
    const blanked = w.e.slice(0, at) + "____" + w.e.slice(at + hit.length);
    return {
      type: "mcq", cat: "词形", key: lkey(w.lv, w.w),
      hint: `选出 ${w.w} 在句子里的正确形式`,
      promptHtml: `<div class="sentence-box">${esc(blanked)}</div><div class="prompt-zh small">${esc(w.c)}</div>`,
      options: shuffle(opts).map((o) => ({ text: o, ok: o === a })),
      answer: hit, speak: w.e,
      explain: `${w.w}（${stripPos(w.z)}）\n${w.e}\n${w.c}`,
    };
  }

  // ----- scenes -----
  function renderScenes() {
    showEmma();
    status("Emma · 场景学习");
    const r = root();
    r.innerHTML = "";
    const card = h("div", "card");
    card.appendChild(backBar("返回", () => { ui.view = "tracks"; render(); }));
    card.appendChild(h("h2", "", "场景学习"));
    card.appendChild(h("p", "muted small", "重点：意思、语境和用法（不考拼写）。每个场景 3 个小场景，每个都有真实对话。"));
    const grid = h("div", "emma-scene-grid");
    card.appendChild(grid);
    r.appendChild(card);
    loadSceneIndex().then((scenes) => {
      scenes.forEach((s) => {
        const st = srsStats("S|" + s.id + "|");
        const nWords = (s.subs || []).reduce((a, x) => a + x.words, 0);
        const b = btn(`<span class="sc-emoji">${s.emoji}</span><span class="sc-title">${esc(s.title)}</span>` +
          (s.ready ? `<span class="small muted">${esc(s.purpose || "")}</span><span class="small sc-prog">${s.subs.length} 个小场景 · 已学 ${st.learned}/${nWords}</span>` : `<span class="lv-soon">即将上线</span>`),
          "emma-scene" + (s.ready ? "" : " soon"), () => { if (!s.ready) return; ui.scene = s.id; ui.sub = s.subs[0].id; ui.view = "scene"; render(); });
        b.dataset.scene = s.id;
        b.disabled = !s.ready;
        grid.appendChild(b);
      });
    }).catch(loadFail);
  }
  function renderScene() {
    showEmma();
    const r = root();
    r.innerHTML = "";
    const card = h("div", "card");
    card.appendChild(backBar("场景", () => { ui.view = "scenes"; render(); }));
    const title = h("h2", "", "…");
    card.appendChild(title);
    const purpose = h("p", "muted small", "");
    card.appendChild(purpose);
    const subs = h("div", "emma-sub-grid");
    card.appendChild(subs);
    const preview = h("div", "emma-preview small muted");
    card.appendChild(preview);
    r.appendChild(card);
    const mcard = h("div", "card");
    mcard.appendChild(h("h2", "", "场景练习模式"));
    mcard.appendChild(h("p", "muted small", "场景学习重理解和运用：全部是选择、排序、听和说，没有拼写。"));
    const mh = h("div");
    mcard.appendChild(mh);
    r.appendChild(mcard);
    loadScene(ui.scene).then((S) => {
      title.textContent = S.emoji + " " + S.title;
      purpose.textContent = S.purpose || "";
      status("Emma · 场景 · " + S.title);
      const redraw = () => {
        subs.innerHTML = "";
        S.subs.forEach((sb) => {
          const st = srsStats("S|" + S.id + "|");
          const b = btn(`<strong>${esc(sb.title)}</strong><span class="small muted">${sb.words.length} 词组 · ${sb.patterns.length} 句型 · ${sb.dialogues.length} 段对话</span>`,
            "emma-sub" + (sb.id === ui.sub ? " selected" : ""), () => { ui.sub = sb.id; redraw(); });
          b.dataset.sub = sb.id;
          subs.appendChild(b);
        });
        const sb = S.subs.find((x) => x.id === ui.sub);
        preview.textContent = "对话：" + sb.dialogues.map((d) => d.title).join(" / ") + " · 词组：" + sb.words.slice(0, 6).map((w) => w.w).join(", ") + "…";
        mh.innerHTML = "";
        mh.appendChild(modeGrid(SCENE_MODES, (m) => startSceneMode(m.id)));
      };
      redraw();
    }).catch(loadFail);
  }

  // --- scene question generators ---
  function sceneWords(S, sb) {
    return sb.words.map((w) => Object.assign({ sc: S.id }, w));
  }
  function allSceneWords(S) {
    return S.subs.flatMap((x) => sceneWords(S, x));
  }
  function highlight(sentence, phrase) {
    const i = sentence.toLowerCase().indexOf(phrase.toLowerCase());
    if (i < 0) return esc(sentence);
    return esc(sentence.slice(0, i)) + "<mark>" + esc(sentence.slice(i, i + phrase.length)) + "</mark>" + esc(sentence.slice(i + phrase.length));
  }
  function zhDistract(correct, pool, n) {
    const seen = new Set([correct]);
    const out = [];
    shuffle(pool).forEach((w) => {
      if (out.length < n && !seen.has(w.z)) { seen.add(w.z); out.push(w.z); }
    });
    return out;
  }
  function qCtx(w, S) {
    const opts = [w.z].concat(zhDistract(w.z, allSceneWords(S), 3));
    return {
      type: "mcq", cat: "语境选义", key: skey(S.id, w.w),
      hint: "这句话里，黄色部分是什么意思？",
      promptHtml: `<div class="sentence-box emma-ctx">${highlight(w.e, w.w)}</div>`,
      speakAuto: w.e,
      options: shuffle(opts).map((o) => ({ text: o, ok: o === w.z })),
      answer: w.w + " = " + w.z, prompt: w.e, speak: w.e,
      explain: `${w.w}：${w.z}\n${w.e}\n${w.c}`,
    };
  }
  function qListen(w, S) {
    const opts = [w.z].concat(zhDistract(w.z, allSceneWords(S), 3));
    return {
      type: "mcq", cat: "听力", key: skey(S.id, w.w),
      hint: "听一听，选出意思", listenOnly: w.w, speakAuto: w.w,
      options: shuffle(opts).map((o) => ({ text: o, ok: o === w.z })),
      answer: w.w + " = " + w.z, prompt: "（听音）" + w.w, speak: w.w,
      explain: `${w.w}：${w.z}\n${w.e}\n${w.c}`,
    };
  }
  function qSit(p, S) {
    const pool = S.subs.flatMap((x) => x.patterns).filter((x) => x.en !== p.en);
    const opts = [p.en].concat(sample(pool, 3).map((x) => x.en));
    return {
      type: "mcq", cat: "情景选句",
      hint: "这种情况下，你应该说：",
      promptHtml: `<div class="emma-sit">💡 ${esc(p.sit || p.zh)}</div>`,
      options: shuffle(opts).map((o) => ({ text: o, ok: o === p.en, speakable: true })),
      answer: p.en, prompt: p.sit || p.zh, speak: p.en,
      explain: `${p.en}\n${p.zh}`,
    };
  }
  function otherLines(S, dlg) {
    return S.subs.flatMap((x) => x.dialogues).filter((d) => d !== dlg).flatMap((d) => d.lines);
  }
  function qGap(dlg, i, S) {
    const L = dlg.lines;
    const from = Math.max(0, i - 3), to = Math.min(L.length - 1, i + 1);
    const ctx = L.slice(from, to + 1).map((ln, k) => (from + k === i ? Object.assign({}, ln, { gap: true }) : ln));
    const pool = otherLines(S, dlg).filter((x) => x.en !== L[i].en);
    const opts = [L[i].en].concat(sample(pool, 3).map((x) => x.en));
    return {
      type: "mcq", cat: "对话补全", dlg,
      hint: "听对话，选出空白处的那一句",
      dialogue: ctx, speakLinesAuto: true,
      options: shuffle(opts).map((o) => ({ text: o, ok: o === L[i].en })),
      answer: L[i].en, prompt: dlg.title + "：补全对话", speak: L[i].en,
      explain: `${roleName(dlg, L[i].r)}：${L[i].en}\n${L[i].zh}`,
    };
  }
  function qResp(dlg, i, S) {
    const L = dlg.lines;
    const pool = otherLines(S, dlg).filter((x) => x.en !== L[i + 1].en && x.r !== L[i].r);
    const opts = [L[i + 1].en].concat(sample(pool.length >= 3 ? pool : otherLines(S, dlg), 3).map((x) => x.en));
    return {
      type: "mcq", cat: "最佳回应", dlg,
      hint: `听 ${roleName(dlg, L[i].r)} 说的话，选最合适的回应`,
      hearLine: L[i], speakLinesAuto: true,
      options: shuffle(Array.from(new Set(opts))).map((o) => ({ text: o, ok: o === L[i + 1].en })),
      answer: L[i + 1].en, prompt: L[i].en, speak: L[i + 1].en,
      explain: `${roleName(dlg, L[i].r)}：${L[i].en}（${L[i].zh}）\n→ ${L[i + 1].en}\n${L[i + 1].zh}`,
    };
  }
  function roleName(dlg, r) {
    const ro = (dlg.roles || {})[r];
    return ro ? ro.en : r;
  }
  function gapIdx(dlg) {
    return dlg.lines.map((_, i) => i).filter((i) => i >= 1 && dlg.lines[i].en.split(" ").length >= 3);
  }
  function respIdx(dlg) {
    return dlg.lines.map((_, i) => i).filter((i) => i < dlg.lines.length - 1 && dlg.lines[i].r !== dlg.lines[i + 1].r);
  }
  function sceneItems(mode, S, sb) {
    const words = sceneWords(S, sb);
    if (mode === "scard") return words.map((w) => ({ type: "scard", w, key: skey(S.id, w.w) }));
    if (mode === "ctx") return shuffle(words).slice(0, 12).map((w) => qCtx(w, S));
    if (mode === "sit") return shuffle(sb.patterns).map((p) => qSit(p, S));
    if (mode === "gap") return shuffle(sb.dialogues.flatMap((d) => sample(gapIdx(d), 4).map((i) => qGap(d, i, S)))).slice(0, 8);
    if (mode === "resp") return shuffle(sb.dialogues.flatMap((d) => sample(respIdx(d), 5).map((i) => qResp(d, i, S)))).slice(0, 10);
    if (mode === "order") {
      const out = [];
      sb.dialogues.forEach((d) => {
        for (let s = 0; s < d.lines.length; s += 6) {
          const chunk = d.lines.slice(s, s + 6);
          if (chunk.length >= 3) out.push({ type: "order", dlg: d, lines: chunk, part: s / 6 + 1 });
        }
      });
      return out;
    }
    if (mode === "stest") {
      const ws = shuffle(words);
      const items = []
        .concat(ws.slice(0, 6).map((w) => qCtx(w, S)))
        .concat(ws.slice(6, 10).map((w) => qListen(w, S)))
        .concat(sample(sb.patterns, 5).map((p) => qSit(p, S)))
        .concat(shuffle(sb.dialogues.flatMap((d) => sample(respIdx(d), 3).map((i) => qResp(d, i, S)))).slice(0, 5))
        .concat(shuffle(sb.dialogues.flatMap((d) => sample(gapIdx(d), 2).map((i) => qGap(d, i, S)))).slice(0, 4));
      return shuffle(items);
    }
    return [];
  }
  function startSceneMode(mode) {
    const S = cache.scenes[ui.scene];
    const sb = S.subs.find((x) => x.id === ui.sub);
    const m = SCENE_MODES.find((x) => x.id === mode);
    const back = () => { ui.view = "scene"; render(); };
    if (mode === "role" || mode === "shadow") return startDialogueFlow(mode, S, sb, back);
    startEmmaPlay(mode, sceneItems(mode, S, sb), { back, label: m.label, test: !!m.test, scene: S, sub: sb });
  }

  // ================= EMMA ENGINE =================
  function startEmmaPlay(mode, items, opt) {
    if (!items.length) { alert("这组没有可出的题，换一组试试～"); return; }
    stopSpeak();
    play = { mode, items, i: 0, correct: 0, answered: 0, results: [], opt, start: Date.now(), locked: false };
    VK().showScreen("emma-play");
    window.scrollTo(0, 0);
    renderPlay();
  }
  function playChrome() {
    const P = play;
    $("#emma-play-mode").textContent = P.opt.label || "";
    $("#emma-play-count").textContent = `${Math.min(P.i + 1, P.items.length)} / ${P.items.length}`;
    $("#emma-play-score").textContent = P.opt.test ? `✎ 已答 ${P.answered}` : `★ ${P.correct}`;
    $("#emma-play-progress").style.width = Math.round((P.i / P.items.length) * 100) + "%";
  }
  function renderPlay() {
    const P = play;
    if (!P) return;
    if (P.i >= P.items.length) return finishPlay();
    P.locked = false;
    playChrome();
    const host = $("#emma-play-area");
    host.innerHTML = "";
    $("#emma-feedback").textContent = "";
    $("#emma-feedback").className = "feedback";
    $("#emma-next-row").hidden = true;
    const it = P.items[P.i];
    if (it.type === "card") return renderLevelCard(host, it);
    if (it.type === "scard") return renderSceneCard(host, it);
    if (it.type === "order") return renderOrder(host, it);
    return renderMCQ(host, it);
  }
  function nextItem() {
    stopSpeak();
    if (!play) return;
    play.i++;
    renderPlay();
  }
  function showNext(label) {
    const row = $("#emma-next-row");
    row.hidden = false;
    $("#emma-next").textContent = label || "下一题 →";
  }
  function record(it, ok, chosen) {
    const P = play;
    P.answered++;
    if (ok) P.correct++;
    if (it.key) srsGrade(it.key, ok);
    P.results.push({ cat: it.cat || "", score: ok ? 1 : 0, prompt: it.prompt || it.answer || "", py: "", answer: it.answer || "", chosen: ok ? "" : chosen || "", speak: it.speak || it.answer, explain: it.explain || "" });
  }
  function renderLevelCard(host, it) {
    const w = it.w;
    srsIntro(it.key);
    const c = h("div", "emma-card");
    const top = h("div", "emma-card-top");
    top.appendChild(h("span", "emma-card-word", esc(w.w)));
    top.appendChild(speakBtn(w.w));
    c.appendChild(top);
    c.appendChild(h("div", "emma-ipa", esc(w.i || "")));
    c.appendChild(h("div", "emma-zh", (w.p ? `<span class="emma-pos">${esc(w.p)}</span> ` : "") + esc(stripPos(w.z))));
    if (w.e) {
      const ex = h("div", "emma-ex");
      ex.innerHTML = `<div class="ex-en">${highlight(w.e, w.w)}</div><div class="ex-zh">${esc(w.c)}</div>`;
      ex.appendChild(speakBtn(w.e));
      c.appendChild(ex);
    }
    if (w.k && w.k.length) {
      const k = h("div", "emma-colloc");
      k.innerHTML = "<div class=\"emma-colloc-title\">常用搭配</div>" + w.k.map((x) => `<div><strong>${esc(x[0])}</strong> <span class="muted">${esc(x[1])}</span></div>`).join("");
      c.appendChild(k);
    }
    host.appendChild(c);
    sayOne(w.w);
    showNext(play.i === play.items.length - 1 ? "完成 ✓" : "认识了，下一个 →");
  }
  function renderSceneCard(host, it) {
    const w = it.w;
    srsIntro(it.key);
    const c = h("div", "emma-card scene");
    const top = h("div", "emma-card-top");
    top.appendChild(h("span", "emma-card-word", esc(w.w)));
    top.appendChild(speakBtn(w.w));
    c.appendChild(top);
    c.appendChild(h("div", "emma-ipa", esc(w.i || "")));
    c.appendChild(h("div", "emma-zh", esc(w.z)));
    const ex = h("div", "emma-ex");
    ex.innerHTML = `<div class="emma-colloc-title">在对话里这样用</div><div class="ex-en">${highlight(w.e, w.w)}</div><div class="ex-zh">${esc(w.c)}</div>`;
    ex.appendChild(speakBtn(w.e));
    c.appendChild(ex);
    host.appendChild(c);
    sayOne(w.w).then(() => { if (play && play.items[play.i] === it) say(w.e); });
    showNext(play.i === play.items.length - 1 ? "完成 ✓" : "下一个 →");
  }
  function renderDialogueBox(host, lines, dlg, showText) {
    const box = h("div", "emma-dlg");
    lines.forEach((ln) => {
      const row = h("div", "emma-line" + (ln.gap ? " gap" : ""));
      row.innerHTML = `<span class="emma-role">${esc(roleName(dlg, ln.r))}</span>` +
        (ln.gap ? `<span class="emma-gap">？？？</span>` : `<span class="emma-line-en${showText ? "" : " hidden-text"}">${esc(ln.en)}</span>`);
      box.appendChild(row);
    });
    host.appendChild(box);
    return box;
  }
  function renderMCQ(host, it) {
    const P = play;
    host.appendChild(h("p", "hint", esc(it.hint || "")));
    let replay = null;
    if (it.promptHtml) host.appendChild(h("div", "emma-prompt", it.promptHtml));
    if (it.listenOnly) {
      const big = btn("🔊 再听一次", "emma-listen", () => sayOne(it.listenOnly));
      host.appendChild(big);
      replay = () => sayOne(it.listenOnly);
    }
    if (it.dialogue) {
      const box = renderDialogueBox(host, it.dialogue, it.dlg, true);
      const rv = roleVoiceFor(it.dlg);
      replay = () => sayLines(it.dialogue, rv);
      const rb = btn("🔊 听这段对话", "secondary emma-replay", replay);
      host.insertBefore(rb, box);
    }
    if (it.hearLine) {
      const rv = roleVoiceFor(it.dlg);
      replay = () => sayLines([it.hearLine], rv);
      const box = renderDialogueBox(host, [it.hearLine], it.dlg, false);
      const row = h("div", "action-row");
      row.appendChild(btn("🔊 再听一次", "secondary", replay));
      row.appendChild(btn("👀 显示文字", "ghost", (e) => { box.querySelectorAll(".hidden-text").forEach((x) => x.classList.remove("hidden-text")); e.target.disabled = true; }));
      host.appendChild(row);
    }
    if (!replay && it.speakAuto) {
      const sa = it.speakAuto;
      replay = () => sayOne(sa);
      const p = host.querySelector(".emma-prompt");
      if (p) p.appendChild(speakBtn(sa));
    }
    const ch = h("div", "choices");
    it.options.forEach((o) => {
      const b = btn(esc(o.text), "choice", () => {
        if (P.locked) return;
        P.locked = true;
        record(it, o.ok, o.text);
        if (P.opt.test) {
          $("#emma-feedback").textContent = "已记录 ✓";
          setTimeout(() => { if (play === P && play.items[play.i] === it) nextItem(); }, 500);
          return;
        }
        ch.querySelectorAll("button").forEach((x) => (x.disabled = true));
        b.classList.add(o.ok ? "correct" : "wrong-soft");
        const right = Array.from(ch.children)[it.options.findIndex((x) => x.ok)];
        if (right) { right.classList.add("correct"); right.disabled = false; }
        const f = $("#emma-feedback");
        f.textContent = o.ok ? "答对啦！👍" : "再看看正确答案 👇";
        f.className = "feedback " + (o.ok ? "good" : "gentle");
        playChrome();
        if (!o.ok || it.dialogue || it.hearLine) {
          const ex = h("div", "explain-card emma-explain");
          ex.innerHTML = `<div class="explain-title">💡 小讲解</div><div class="explain-body">${esc(it.explain || "")}</div>`;
          host.appendChild(ex);
        }
        sayOne(it.speak || it.answer);
        showNext(P.i === P.items.length - 1 ? "看结果 ✓" : "下一题 →");
      });
      if (o.speakable) b.title = o.text;
      ch.appendChild(b);
    });
    host.appendChild(ch);
    if (replay && !P.opt.silent) setTimeout(() => { if (play === P && play.items[play.i] === it) replay(); }, 250);
  }
  function renderOrder(host, it) {
    const P = play;
    host.appendChild(h("p", "hint", `把「${esc(it.dlg.title)}」第 ${it.part} 段按顺序点出来（先点第一句）`));
    const done = h("div", "emma-dlg emma-order-done");
    host.appendChild(done);
    const bank = h("div", "emma-order-bank");
    host.appendChild(bank);
    let next = 0, mistakes = 0;
    const rv = roleVoiceFor(it.dlg);
    shuffle(it.lines.map((ln, i) => ({ ln, i }))).forEach(({ ln, i }) => {
      const b = btn(`<span class="emma-role">${esc(roleName(it.dlg, ln.r))}</span> ${esc(ln.en)}`, "emma-order-btn", () => {
        if (i === next) {
          next++;
          b.remove();
          const row = h("div", "emma-line");
          row.innerHTML = `<span class="emma-role">${esc(roleName(it.dlg, ln.r))}</span><span class="emma-line-en">${esc(ln.en)}</span><span class="emma-line-zh small muted">${esc(ln.zh)}</span>`;
          done.appendChild(row);
          sayLines([ln], rv);
          if (next === it.lines.length) {
            const ok = mistakes <= 1;
            record({ cat: "对话排序", answer: it.dlg.title, prompt: it.dlg.title + " 排序", explain: it.lines.map((x) => x.en).join("\n") }, ok, mistakes + " 次点错");
            const f = $("#emma-feedback");
            f.textContent = mistakes === 0 ? "完全正确！🎉" : `完成！点错 ${mistakes} 次`;
            f.className = "feedback " + (ok ? "good" : "gentle");
            playChrome();
            const row2 = h("div", "action-row");
            row2.appendChild(btn("🔊 完整听一遍", "secondary", () => sayLines(it.lines, rv)));
            host.appendChild(row2);
            showNext(P.i === P.items.length - 1 ? "看结果 ✓" : "下一段 →");
          }
        } else {
          mistakes++;
          b.classList.add("shake");
          setTimeout(() => b.classList.remove("shake"), 400);
        }
      });
      bank.appendChild(b);
    });
  }
  function finishPlay() {
    const P = play;
    stopSpeak();
    const secs = Math.round((Date.now() - P.start) / 1000);
    if (P.opt.onFinish) P.opt.onFinish(P);
    if (P.opt.test) return finishSceneTest(P, secs);
    const host = $("#emma-play-area");
    host.innerHTML = "";
    $("#emma-next-row").hidden = true;
    $("#emma-feedback").textContent = "";
    $("#emma-play-progress").style.width = "100%";
    const graded = P.answered;
    const acc = graded ? Math.round((P.correct / graded) * 100) : 100;
    const stars = graded ? Math.round((P.correct / graded) * 10) / 2 : 5;
    const box = h("div", "emma-done");
    box.appendChild(h("div", "cele", stars >= 4.5 ? "🎊" : stars >= 3 ? "🎉" : "🌱"));
    const sr = h("div", "star-row");
    box.appendChild(sr);
    VK().renderStarRow(sr, stars, stars >= 5);
    box.appendChild(h("h2", "", graded ? "本关完成！" : "看完啦！"));
    box.appendChild(h("div", "score-big", graded ? acc + "%" : P.items.length + " 个"));
    box.appendChild(h("p", "muted", graded ? `答对 ${P.correct} / ${graded} · 用时 ${VK().formatMMSS(secs)}` : "这些词已加入复习计划，明天会再见面～"));
    const row = h("div", "action-row");
    row.appendChild(btn("再来一轮", "", () => startEmmaPlay(P.mode, P.opt.regen ? P.opt.regen() : P.items, P.opt)));
    row.appendChild(btn("返回", "secondary", () => { play = null; P.opt.back(); }));
    box.appendChild(row);
    host.appendChild(box);
  }
  function finishSceneTest(P, secs) {
    const TK = window.__testKit;
    const res = P.results;
    const n = res.length;
    const score = n ? Math.round((res.reduce((a, r) => a + r.score, 0) / n) * 100) : 0;
    const stars = TK.starsFromScore(score, n);
    const cats = ["语境选义", "听力", "情景选句", "最佳回应", "对话补全"].map((name) => {
      const rs = res.filter((r) => r.cat === name);
      return { name, got: rs.reduce((a, r) => a + r.score, 0), total: rs.length };
    });
    const unitsLabel = "场景 · " + P.opt.scene.title + " / " + P.opt.sub.title;
    const prev = (VK().profileStore().tests || []).find((t) => t.unitsLabel === unitsLabel);
    VK().updateProfile((p) => {
      p.tests = [{ at: Date.now(), units: [P.opt.scene.id + "/" + P.opt.sub.id], unitsLabel, score, stars, elapsedSec: secs, answered: n, total: P.items.length, cats }].concat(p.tests || []).slice(0, 50);
    });
    VK().showScreen("test-report");
    window.scrollTo(0, 0);
    TK.renderReport({
      title: "场景综合测试完成！", score, stars, elapsedSec: secs, answered: n, total: P.items.length, cats, items: res, unitsLabel,
      prevScore: prev ? prev.score : null,
      renderStarRow: VK().renderStarRow,
      speak: (t) => sayOne(t),
      onAgain: () => startSceneMode("stest"),
      onHome: () => { play = null; P.opt.back(); },
    });
  }
  function quitPlay() {
    stopSpeak();
    if (!play) return;
    const P = play;
    if (P.opt.test && P.answered > 0) {
      if (!window.__testKit.confirmQuit()) return;
      P.items = P.items.slice(0, P.answered);
      return finishPlay();
    }
    if (P.answered > 0 && !P.opt.test) { P.items = P.items.slice(0, P.i + (P.locked ? 1 : 0)); return finishPlay(); }
    play = null;
    P.opt.back();
  }

  // ----- 角色扮演 / 跟读 -----
  function startDialogueFlow(mode, S, sb, back) {
    stopSpeak();
    play = { mode, items: [], i: 0, correct: 0, answered: 0, results: [], opt: { back, label: mode === "role" ? "角色扮演" : "跟读" }, start: Date.now() };
    VK().showScreen("emma-play");
    window.scrollTo(0, 0);
    $("#emma-play-mode").textContent = play.opt.label;
    $("#emma-play-count").textContent = "";
    $("#emma-play-score").textContent = "";
    $("#emma-play-progress").style.width = "0%";
    $("#emma-next-row").hidden = true;
    $("#emma-feedback").textContent = "";
    const host = $("#emma-play-area");
    host.innerHTML = "";
    host.appendChild(h("p", "hint", mode === "role" ? "选一段对话和你要演的角色。电脑会读对方的台词，轮到你时大声说出来。" : "选一段对话，一句一句听，然后跟着大声说。"));
    sb.dialogues.forEach((d, di) => {
      const c = h("div", "emma-pick");
      c.appendChild(h("div", "emma-pick-title", `${esc(d.title)} <span class="small muted">${d.lines.length} 句</span>`));
      const row = h("div", "action-row");
      if (mode === "role") {
        Object.keys(d.roles).forEach((r) => {
          const b = btn(`我演 ${esc(d.roles[r].en)}（${esc(d.roles[r].zh)}）`, "", () => runRole(d, r));
          b.dataset.role = r;
          b.dataset.dlg = di;
          row.appendChild(b);
        });
      } else {
        const b = btn("开始跟读", "", () => runShadow(d));
        b.dataset.dlg = di;
        row.appendChild(b);
      }
      c.appendChild(row);
      host.appendChild(c);
    });
  }
  function runRole(d, me) {
    const host = $("#emma-play-area");
    host.innerHTML = "";
    const rv = roleVoiceFor(d);
    let i = 0;
    let showMine = false;
    const top = h("div", "action-row");
    const tog = btn("👀 显示我的台词", "ghost", () => {
      showMine = !showMine;
      tog.textContent = showMine ? "🙈 隐藏我的台词" : "👀 显示我的台词";
      host.querySelectorAll(".emma-line.mine .emma-line-en").forEach((x) => x.classList.toggle("hidden-text", !showMine));
    });
    tog.id = "emma-role-toggle";
    top.appendChild(tog);
    host.appendChild(top);
    host.appendChild(h("p", "hint small", `你是 ${esc(d.roles[me].en)}（${esc(d.roles[me].zh)}）。轮到你时看中文提示，先自己说，再点「听示范」对照。`));
    const box = h("div", "emma-dlg emma-role-box");
    host.appendChild(box);
    const ctl = h("div", "action-row");
    host.appendChild(ctl);
    const step = () => {
      $("#emma-play-count").textContent = `${Math.min(i + 1, d.lines.length)} / ${d.lines.length}`;
      $("#emma-play-progress").style.width = Math.round((i / d.lines.length) * 100) + "%";
      ctl.innerHTML = "";
      if (i >= d.lines.length) {
        $("#emma-play-progress").style.width = "100%";
        const f = $("#emma-feedback");
        f.textContent = "演完啦！🎭 换个角色再来一次？";
        f.className = "feedback good";
        ctl.appendChild(btn("换个角色", "", () => runRole(d, Object.keys(d.roles).find((r) => r !== me) || me)));
        ctl.appendChild(btn("🔊 完整听一遍", "secondary", () => sayLines(d.lines, rv)));
        ctl.appendChild(btn("返回", "ghost", () => { stopSpeak(); startSceneMode("role"); }));
        return;
      }
      const ln = d.lines[i];
      const mine = ln.r === me;
      const row = h("div", "emma-line" + (mine ? " mine" : ""));
      row.innerHTML = `<span class="emma-role">${esc(roleName(d, ln.r))}${mine ? "（你）" : ""}</span>` +
        `<span class="emma-line-en${mine && !showMine ? " hidden-text" : ""}">${esc(ln.en)}</span><span class="emma-line-zh small muted">${esc(ln.zh)}</span>`;
      box.appendChild(row);
      row.scrollIntoView({ block: "nearest" });
      if (mine) {
        ctl.appendChild(btn("🔊 听示范", "secondary", () => { row.querySelector(".emma-line-en").classList.remove("hidden-text"); say(ln.en, { voice: rv(ln.r) }); }));
        const nb = btn("我说完了 →", "", () => { i++; step(); });
        nb.id = "emma-role-next";
        ctl.appendChild(nb);
      } else {
        const nb = btn("⏳ 对方在说…", "", () => { i++; step(); });
        nb.id = "emma-role-next";
        ctl.appendChild(btn("🔊 再听", "secondary", () => sayOne(ln.en, { voice: rv(ln.r) })));
        ctl.appendChild(nb);
        sayOne(ln.en, { voice: rv(ln.r) }).then(() => {
          if (nb.isConnected) nb.textContent = "继续 →";
        });
      }
    };
    step();
  }
  function runShadow(d) {
    const host = $("#emma-play-area");
    host.innerHTML = "";
    const rv = roleVoiceFor(d);
    let i = 0;
    const card = h("div", "emma-shadow");
    host.appendChild(card);
    const ctl = h("div", "action-row");
    host.appendChild(ctl);
    const step = () => {
      $("#emma-play-count").textContent = `${Math.min(i + 1, d.lines.length)} / ${d.lines.length}`;
      $("#emma-play-progress").style.width = Math.round((i / d.lines.length) * 100) + "%";
      ctl.innerHTML = "";
      if (i >= d.lines.length) {
        $("#emma-play-progress").style.width = "100%";
        card.innerHTML = `<div class="cele">🗣️</div><h2>跟读完成！</h2><p class="muted">每天跟读一段，口语会越来越顺。</p>`;
        ctl.appendChild(btn("再读一遍", "", () => runShadow(d)));
        ctl.appendChild(btn("返回", "secondary", () => startSceneMode("shadow")));
        return;
      }
      const ln = d.lines[i];
      card.innerHTML = `<div class="emma-role">${esc(roleName(d, ln.r))}</div><div class="emma-shadow-en">${esc(ln.en)}</div><div class="muted">${esc(ln.zh)}</div><p class="hint small">听完后，跟着大声说一遍 👄</p>`;
      ctl.appendChild(btn("🔊 再听", "secondary", () => sayOne(ln.en, { voice: rv(ln.r) })));
      ctl.appendChild(btn("🐢 慢速", "secondary", () => sayOne(ln.en, { voice: rv(ln.r), rate: 0.7 })));
      const nb = btn("我跟读了，下一句 →", "", () => { i++; step(); });
      nb.id = "emma-shadow-next";
      ctl.appendChild(nb);
      sayOne(ln.en, { voice: rv(ln.r) });
    };
    step();
  }

  // ================= 今日任务 =================
  function findLevelWord(lv, w) {
    const L = cache.levels[lv];
    if (!L) return null;
    for (const g of L.groups) for (const x of g.words) if (x.w === w) return { g, x };
    return null;
  }
  function findSceneWord(sc, w) {
    const S = cache.scenes[sc];
    if (!S) return null;
    for (const sb of S.subs) for (const x of sb.words) if (x.w === w) return { sb, x };
    return null;
  }
  async function buildPlan(force) {
    const t = today();
    const e = store();
    if (!force && e.daily && e.daily.day === t) return e.daily;
    const s = settings();
    const srs = e.srs || {};
    const L = await loadLevel(s.source);
    const newL = [];
    for (const g of L.groups) {
      for (const w of g.words) {
        if (newL.length >= s.newPerDay) break;
        if (!srs[lkey(L.id, w.w)]) newL.push(lkey(L.id, w.w));
      }
      if (newL.length >= s.newPerDay) break;
    }
    const due = Object.keys(srs).filter((k) => srs[k].due <= t && srs[k].b >= 1 || (srs[k].b === 0 && srs[k].f < t));
    const revL = due.filter((k) => k[0] === "L").slice(0, 60);
    const revS = due.filter((k) => k[0] === "S").slice(0, 30);
    const newS = [];
    if (s.scenePerDay > 0) {
      const idx = await loadSceneIndex();
      for (const sc of idx.filter((x) => x.ready)) {
        if (newS.length >= s.scenePerDay) break;
        const S = await loadScene(sc.id);
        for (const sb of S.subs) {
          const fresh = sb.words.filter((w) => !srs[skey(S.id, w.w)]);
          if (fresh.length) { fresh.slice(0, s.scenePerDay - newS.length).forEach((w) => newS.push(skey(S.id, w.w))); break; }
        }
      }
    }
    const plan = { day: t, newL, revL, newS, revS, done: {} };
    updateEmma((x) => { x.daily = plan; });
    return plan;
  }
  async function ensurePlanData(plan) {
    const lvs = new Set(), scs = new Set();
    plan.newL.concat(plan.revL).forEach((k) => lvs.add(k.split("|")[1]));
    plan.newS.concat(plan.revS).forEach((k) => scs.add(k.split("|")[1]));
    await Promise.all(Array.from(lvs).map(loadLevel).concat(Array.from(scs).map(loadScene)));
  }
  function markDone(step) {
    updateEmma((e) => { if (e.daily) e.daily.done[step] = true; });
  }
  const DAILY_STEPS = [
    { id: "cards", emoji: "📖", name: "新词卡片", desc: "先认识：音标、意思、例句、搭配", track: "level" },
    { id: "spell", emoji: "🔠", name: "理解 + 拼写", desc: "每个新词：选意思 + 拼字母", track: "level" },
    { id: "dict", emoji: "🎧", name: "新词听写", desc: "听发音写出今天的新词", track: "level" },
    { id: "review", emoji: "🔁", name: "旧词复习", desc: "到期的旧词：听写 / 拼写", track: "level" },
    { id: "scene", emoji: "💬", name: "场景短语", desc: "新短语：场景词卡 → 语境选义 → 情景选句（不考拼写）", track: "scene" },
    { id: "srev", emoji: "🗣️", name: "短语复习", desc: "到期短语：语境选义 / 听音选义", track: "scene" },
  ];
  function stepCount(plan, id) {
    const spellable = (k) => /^[a-zA-Z]+$/.test(k.split("|")[2]);
    return { cards: plan.newL.length, spell: plan.newL.length, dict: plan.newL.filter(spellable).length, review: plan.revL.length, scene: plan.newS.length, srev: plan.revS.length }[id];
  }
  function renderDaily() {
    showEmma();
    status("Emma · 今日任务");
    const r = root();
    r.innerHTML = "";
    const card = h("div", "card");
    card.appendChild(backBar("返回", () => { ui.view = "tracks"; render(); }));
    card.appendChild(h("h2", "", "📅 今日任务"));
    const sum = h("p", "muted small", "正在准备…");
    card.appendChild(sum);
    const list = h("div", "emma-daily-list");
    card.appendChild(list);
    r.appendChild(card);
    r.appendChild(parentSettingsCard());
    buildPlan(false).then(async (plan) => {
      await ensurePlanData(plan);
      const s = settings();
      const lvName = (cache.levels[s.source] || {}).title || s.source;
      sum.textContent = `新词 ${plan.newL.length}（来自 ${lvName}）· 到期复习 ${plan.revL.length + plan.revS.length} · 场景短语 ${plan.newS.length}。按顺序做完即可～`;
      list.innerHTML = "";
      let allDone = true;
      DAILY_STEPS.forEach((st, idx) => {
        const n = stepCount(plan, st.id);
        if (!n) return;
        const done = !!plan.done[st.id];
        if (!done) allDone = false;
        const b = btn(`<span class="dstep-emoji">${done ? "✅" : st.emoji}</span><span class="dstep-main"><strong>${idx + 1}. ${esc(st.name)}</strong> <span class="small muted">${n} 个</span><br><span class="small muted">${esc(st.desc)}</span></span><span class="dstep-tag ${st.track}">${st.track === "level" ? "拼写向" : "用法向"}</span>`,
          "emma-dstep" + (done ? " done" : ""), () => runDailyStep(st.id, plan));
        b.dataset.step = st.id;
        list.appendChild(b);
      });
      if (!list.children.length) list.appendChild(h("p", "muted", "今天没有要做的内容（词都学完了？去家长设置换个词库吧）。"));
      else if (allDone) list.appendChild(h("div", "emma-daily-done", "🎉 今日任务全部完成！明天见～"));
    }).catch(loadFail);
  }
  function parentSettingsCard() {
    const s = settings();
    const c = h("details", "card emma-settings");
    c.innerHTML = `<summary>👪 家长设置</summary>
      <label>每天新词数 <input type="number" id="emma-set-new" min="0" max="60" step="5" value="${s.newPerDay}"></label>
      <label>新词来源 <select id="emma-set-src"></select></label>
      <label>每天场景短语数 <input type="number" id="emma-set-scene" min="0" max="20" value="${s.scenePerDay}"></label>
      <p class="small muted">保存后会按新设置重新生成今天的任务（已学的进度不受影响）。</p>`;
    const save = btn("保存并重新生成", "secondary", () => {
      const v = {
        newPerDay: Math.max(0, Math.min(60, parseInt($("#emma-set-new").value, 10) || 0)),
        source: $("#emma-set-src").value,
        scenePerDay: Math.max(0, Math.min(20, parseInt($("#emma-set-scene").value, 10) || 0)),
      };
      updateEmma((e) => { e.settings = v; e.daily = null; });
      renderDaily();
    });
    save.id = "emma-set-save";
    c.appendChild(save);
    loadLevelIndex().then((lv) => {
      const sel = $("#emma-set-src", c);
      lv.filter((x) => x.ready).forEach((x) => {
        const o = document.createElement("option");
        o.value = x.id;
        o.textContent = x.name + "（" + x.count + " 词）";
        if (x.id === s.source) o.selected = true;
        sel.appendChild(o);
      });
    });
    return c;
  }
  function runDailyStep(id, plan) {
    const back = () => { ui.view = "daily"; render(); };
    const onFinish = () => markDone(id);
    if (id === "cards") {
      const items = plan.newL.map((k) => { const [, lv, w] = k.split("|"); const f = findLevelWord(lv, w); return f && { type: "card", w: Object.assign({ lv }, f.x), key: k }; }).filter(Boolean);
      return startEmmaPlay("card", items, { back, label: "今日 · 新词卡片", onFinish });
    }
    if (id === "scene" || id === "srev") {
      const items = [];
      const keys = id === "scene" ? plan.newS : plan.revS;
      const found = keys.map((k) => { const [, sc, w] = k.split("|"); const f = findSceneWord(sc, w); return f && { k, S: cache.scenes[sc], sb: f.sb, w: Object.assign({ sc }, f.x) }; }).filter(Boolean);
      if (id === "scene") {
        found.forEach((f) => items.push({ type: "scard", w: f.w, key: f.k }));
        shuffle(found).forEach((f) => items.push(qCtx(f.w, f.S)));
        const pats = [];
        found.forEach((f) => { const p = f.sb.patterns.find((p) => p.en.toLowerCase().indexOf(f.w.w.toLowerCase()) >= 0); if (p && !pats.includes(p)) pats.push({ p, S: f.S }); });
        if (pats.length < 3 && found[0]) sample(found[0].sb.patterns, 3 - pats.length).forEach((p) => pats.push({ p, S: found[0].S }));
        pats.slice(0, 5).forEach((x) => items.push(qSit(x.p, x.S)));
      } else {
        shuffle(found).forEach((f, i) => items.push(i % 2 ? qListen(f.w, f.S) : qCtx(f.w, f.S)));
      }
      return startEmmaPlay(id, items, { back, label: id === "scene" ? "今日 · 场景短语" : "今日 · 短语复习", onFinish });
    }
    // level steps through the shared engine (spelling-oriented)
    const keys = id === "review" ? plan.revL : plan.newL;
    const groupsByLv = {};
    const targets = [];
    keys.forEach((k) => {
      const [, lv, w] = k.split("|");
      const f = findLevelWord(lv, w);
      if (!f) return;
      (groupsByLv[lv] = groupsByLv[lv] || new Set()).add(f.g);
      targets.push({ lv, w, b: ((store().srs || {})[k] || {}).b || 0 });
    });
    wordLevel = {};
    const units = [];
    Object.keys(groupsByLv).forEach((lv) => {
      groupsByLv[lv].forEach((g) => {
        g.words.forEach((x) => (wordLevel[x.w.toLowerCase()] = lv));
        units.push(unitFromGroup(cache.levels[lv], g));
      });
    });
    targets.forEach((t) => (wordLevel[t.w.toLowerCase()] = t.lv));
    if (!units.length) return;
    const custom = (words) => {
      const byEn = {};
      words.forEach((w) => (byEn[w.en] = byEn[w.en] || w));
      const sp = (w) => /^[a-zA-Z]+$/.test(w.en);
      const T = targets.map((t) => byEn[t.w] && Object.assign({ _b: t.b }, byEn[t.w])).filter(Boolean);
      if (id === "spell") {
        const choice = T.map((w, i) => ({ type: i % 2 ? "zh2en" : "en2zh", word: w }));
        const spells = T.filter(sp).map((w) => ({ type: "spell", word: w, hard: false }));
        return shuffle(choice).concat(shuffle(spells));
      }
      if (id === "dict") return shuffle(T.filter(sp)).map((w) => ({ type: "dictation", word: w }));
      return shuffle(T).map((w) => (sp(w) ? (w._b >= 3 ? { type: "dictation", word: w } : { type: "spell", word: w, hard: false }) : { type: "zh2en", word: w }));
    };
    VK().startSynth(synthData(units, { __customItems: custom, __onFinish: onFinish, __emmaReturn: back }), units.map((u) => u.id), "custom");
  }

  // ================= 进度 =================
  function renderProgress(host) {
    host.innerHTML = '<h3>Emma 分级词汇进度</h3><p class="small muted">已学＝至少答对一次；掌握＝复习间隔达到 15 天（Leitner 第 5 盒）。</p>';
    const tbl = h("div", "emma-prog-list");
    host.appendChild(tbl);
    const sc = h("div", "emma-prog-list");
    loadLevelIndex().then((levels) => {
      levels.forEach((lv) => {
        const st = srsStats("L|" + lv.id + "|");
        const row = h("div", "history-item emma-prog-row");
        row.dataset.level = lv.id;
        if (!lv.ready) row.innerHTML = `<strong>${esc(lv.name)}</strong> <span class="small muted">即将上线</span>`;
        else row.innerHTML = `<strong>${esc(lv.name)}</strong> <span class="small muted">共 ${lv.count} 词 · 已学 ${st.learned} · 掌握 ${st.mastered} · 待复习 ${st.due}</span>` +
          `<div class="bar-mini emma-dual"><span class="learned" style="width:${(st.learned / lv.count) * 100}%"></span><span class="mastered" style="width:${(st.mastered / lv.count) * 100}%"></span></div>`;
        tbl.appendChild(row);
      });
      host.appendChild(h("h3", "", "场景短语进度"));
      host.appendChild(sc);
      return loadSceneIndex();
    }).then((scenes) => {
      scenes.filter((s) => s.ready).forEach((s) => {
        const st = srsStats("S|" + s.id + "|");
        const n = s.subs.reduce((a, x) => a + x.words, 0);
        const row = h("div", "history-item");
        row.innerHTML = `${s.emoji} <strong>${esc(s.title)}</strong> <span class="small muted">${n} 个 · 已学 ${st.learned} · 掌握 ${st.mastered}</span><div class="bar-mini"><span style="width:${(st.learned / n) * 100}%"></span></div>`;
        sc.appendChild(row);
      });
    }).catch(loadFail);
  }

  function bind() {
    $("#emma-next").addEventListener("click", nextItem);
    $("#emma-quit").addEventListener("click", quitPlay);
  }

  window.__emma = {
    handles: (pid) => pid === "emma",
    enter,
    backFromSession,
    onLevelResult,
    renderProgress,
    _ui: ui,
    _cache: cache,
    _play: () => play,
    _srs: () => store().srs || {},
    _openTrack: openTrack,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
