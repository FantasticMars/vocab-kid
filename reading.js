/* 阅读 Reading: graded passages for Alex (grade 1–2) and Emma (grade 7 / A2–B1).
 * Data: data/reading/index.json + data/reading/<id>.json (built by tools/reading/build.py).
 * Reader: long-press (~450 ms, touch or mouse) a word → hear it + popup with IPA and 中文; a quick tap does nothing.
 * Each paragraph has its own 🔊 (reads only that paragraph; never auto-reads or chains).
 * Quiz: one question at a time, shuffled options, v12-style instant feedback; progress saved in profile.reading. */
(function () {
  "use strict";
  const DATA_V = "15";
  const BASE = "data/reading/";
  const LONG_MS = 450;
  const MOVE_TOL = 10;
  const NEXT_MS = 1300;

  const VK = () => window.__vocabKid;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => VK().escapeHtml(String(s == null ? "" : s));

  const cache = { index: null, p: {} };
  const ui = { view: "list", id: null, back: null, quiz: null, showText: false };
  let qGen = 0;

  // ---------- data ----------
  function fetchJSON(path) {
    return fetch(BASE + path + "?v=" + DATA_V).then((r) => {
      if (!r.ok) throw new Error("load " + path);
      return r.json();
    });
  }
  function loadIndex() {
    return cache.index ? Promise.resolve(cache.index) : fetchJSON("index.json").then((j) => (cache.index = j));
  }
  function loadPassage(id) {
    return cache.p[id] ? Promise.resolve(cache.p[id]) : fetchJSON(id + ".json").then((j) => (cache.p[id] = j));
  }
  function loadFail(e) {
    console.warn(e);
    const r = root();
    if (r) r.innerHTML = '<div class="card"><p>文章加载失败，请检查网络后再试。</p></div>';
  }

  // ---------- profile store ----------
  function kid() { return VK().getActiveProfileId() === "emma" ? "emma" : "alex"; }
  function recs() { return VK().profileStore().reading || {}; }
  function saveRec(id, fn) {
    VK().updateProfile((p) => {
      p.reading = p.reading || {};
      const r = p.reading[id] || {};
      fn(r);
      p.reading[id] = r;
    });
  }
  function todayStr() {
    const d = new Date();
    const z = (n) => (n < 10 ? "0" : "") + n;
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }

  // ---------- helpers ----------
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
  function root() { return $("#reading-root"); }
  function status(t) { const s = $("#app-status"); if (s) { s.textContent = t; s.style.color = ""; } }
  function show() {
    VK().showScreen("reading");
    const nb = document.querySelector('#main-nav button[data-nav="home"]');
    if (nb) nb.classList.add("active");
  }
  function backBar(label, onBack) {
    const row = h("div", "emma-back");
    row.appendChild(btn("← " + label, "ghost", onBack));
    return row;
  }
  const LV = { "1": 1, "2": 2, A2: 1, "A2+": 2, B1: 3 };
  function diffLabel(p) {
    const n = LV[p.level] || 1;
    const max = p.kid === "alex" || /^a/.test(p.id) ? 2 : 3;
    let dots = "";
    for (let i = 1; i <= max; i++) dots += i <= n ? "●" : "○";
    const name = /^[0-9]$/.test(String(p.level)) ? (n === 1 ? "入门" : "进阶") : p.level;
    return `难度 <span class="rd-dots">${dots}</span> ${esc(name)}`;
  }
  function stopAll() {
    qGen++;
    hidePop();
    try { VK().stopSpeak(); } catch (e) {}
    document.querySelectorAll(".rd-para.speaking").forEach((x) => x.classList.remove("speaking"));
  }

  // ================= LIST =================
  /** opt.back: function to call for "← 返回" (Emma → tracks, Alex → home). */
  function enter(opt) {
    opt = opt || {};
    if (opt.back) ui.back = opt.back;
    stopAll();
    ui.view = "list";
    renderList();
  }
  function goBack() {
    stopAll();
    if (ui.back) return ui.back();
    if (window.__emma && window.__emma.handles(VK().getActiveProfileId())) return window.__emma.enter();
    VK().enterEnglishTextbook();
  }
  function renderList() {
    show();
    window.scrollTo(0, 0);
    status((kid() === "emma" ? "Emma" : "Alex") + " · 阅读");
    const r = root();
    r.innerHTML = '<div class="card"><p class="muted">加载文章…</p></div>';
    loadIndex().then((idx) => {
      if (ui.view !== "list") return;
      const list = idx[kid()] || [];
      const rc = recs();
      r.innerHTML = "";
      const card = h("div", "card rd-list-card");
      card.appendChild(backBar("返回", goBack));
      card.appendChild(h("h2", "", "📖 阅读 Reading"));
      const done = list.filter((p) => rc[p.id] && rc[p.id].done).length;
      card.appendChild(h("p", "muted small", (kid() === "alex"
        ? "选一篇小短文。长按不认识的单词，可以听发音、看意思。读完点「做题」。"
        : "选一篇文章。长按任何单词：听发音 + 音标 + 中文。读完点「做题」检查理解。") +
        ` 已完成 ${done} / ${list.length} 篇。`));
      const wrap = h("div", "rd-list");
      list.forEach((p, i) => {
        const rec = rc[p.id] || {};
        let st = '<span class="rd-badge new">新</span>';
        if (rec.done) st = `<span class="rd-badge done">✅ 完成 · 最好 ${rec.best}%</span>`;
        else if (rec.read) st = '<span class="rd-badge read">📖 读过</span>';
        const b = btn(
          `<span class="rd-num">${i + 1}</span>` +
          `<span class="rd-item-text"><span class="rd-item-title">${esc(p.title)}</span>` +
          `<span class="rd-item-zh">${esc(p.zh)}</span>` +
          `<span class="rd-item-meta">${diffLabel(Object.assign({ kid: kid() }, p))} · ${p.words} 词 · ${p.nq} 题 · ${esc(p.genre)}</span>` +
          `<span class="rd-item-st">${st}</span></span>`,
          "rd-item" + (rec.done ? " is-done" : ""), () => openPassage(p.id));
        b.dataset.rid = p.id;
        wrap.appendChild(b);
      });
      card.appendChild(wrap);
      r.appendChild(card);
    }).catch(loadFail);
  }

  // ================= READER =================
  function openPassage(id) {
    stopAll();
    ui.id = id;
    ui.view = "reader";
    loadPassage(id).then((p) => {
      if (ui.view !== "reader" || ui.id !== id) return;
      saveRec(id, (r) => { r.read = true; r.last = todayStr(); });
      renderReader(p);
    }).catch(loadFail);
  }
  /** Paragraph text with one <span class="w"> per word (data-k = glossary key, data-ph = phrase index). */
  function paraHTML(para) {
    let out = "", pos = 0;
    para.w.forEach((w) => {
      const [s, e, k, ph] = w;
      out += esc(para.t.slice(pos, s));
      out += `<span class="w${ph >= 0 ? " in-ph" : ""}" data-k="${esc(k)}" data-ph="${ph}">${esc(para.t.slice(s, e))}</span>`;
      pos = e;
    });
    return out + esc(para.t.slice(pos));
  }
  function passageBox(p) {
    const box = h("div", "rd-text-box" + (p.kid === "alex" ? " rd-alex" : ""));
    box.dataset.pid = p.id;
    p.paras.forEach((para, i) => {
      const row = h("div", "rd-para" + (i === 0 && p.paras.length > 1 && !/[.!?"”]$/.test(para.t.trim()) ? " rd-heading" : ""));
      row.dataset.pi = i;
      const txt = h("div", "rd-ptext", paraHTML(para));
      row.appendChild(txt);
      const sp = btn("🔊", "speak rd-say", (e) => { e.stopPropagation(); sayPara(row, para.t); });
      sp.title = "听这一段";
      sp.setAttribute("aria-label", "听这一段");
      row.appendChild(sp);
      box.appendChild(row);
    });
    bindLongPress(box, p);
    return box;
  }
  function sayPara(row, text) {
    hidePop();
    const was = row.classList.contains("speaking");
    VK().stopSpeak();
    document.querySelectorAll(".rd-para.speaking").forEach((x) => x.classList.remove("speaking"));
    if (was) return; // second tap on the same 🔊 = stop
    row.classList.add("speaking");
    VK().speakQueue([text]).then(() => row.classList.remove("speaking"));
  }
  function renderReader(p) {
    show();
    window.scrollTo(0, 0);
    status((kid() === "emma" ? "Emma" : "Alex") + " · 阅读 · " + p.title);
    const r = root();
    r.innerHTML = "";
    const card = h("div", "card rd-reader" + (p.kid === "alex" ? " rd-alex-card" : ""));
    card.appendChild(backBar("文章列表", () => { stopAll(); ui.view = "list"; renderList(); }));
    card.appendChild(h("h2", "rd-title", esc(p.title)));
    card.appendChild(h("div", "rd-sub", `${esc(p.zh)} · ${diffLabel(p)} · ${p.words} 词`));
    card.appendChild(h("p", "rd-tip small muted", "👆 长按单词：听发音、看意思 · 点 🔊 只读这一段"));
    card.appendChild(passageBox(p));
    const rec = recs()[p.id] || {};
    const go = btn(`<span class="bb-emoji">✏️</span><span class="bb-text"><span class="bb-label">做题</span><span class="bb-desc">${p.qs.length} 道题 · 每题马上知道对错` +
      (rec.done ? ` · 最好成绩 ${rec.best}%` : "") + `</span></span>`, "big-btn test rd-quiz-btn", () => startQuiz(p));
    const bw = h("div", "big-btns");
    bw.appendChild(go);
    card.appendChild(bw);
    r.appendChild(card);
  }

  // ---------- long-press lookup ----------
  let pop = null, popWord = null, lp = null, swallowClick = false;
  const lastTouch = { t: 0, x: -99, y: -99 };
  function noteTouch(e) {
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    lastTouch.t = Date.now();
    if (t) { lastTouch.x = t.clientX; lastTouch.y = t.clientY; }
  }
  /** the compatibility mouse events a browser fires right after a touch, at the same spot */
  function compatMouse(e) {
    return Date.now() - lastTouch.t < 700 && Math.abs(e.clientX - lastTouch.x) < 25 && Math.abs(e.clientY - lastTouch.y) < 25;
  }
  function popEl() {
    if (!pop) {
      pop = h("div", "rd-pop");
      pop.id = "rd-pop";
      pop.hidden = true;
      pop.setAttribute("role", "dialog");
      document.body.appendChild(pop);
      pop.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    return pop;
  }
  function hidePop() {
    if (pop) pop.hidden = true;
    if (popWord) popWord.classList.remove("hl");
    popWord = null;
  }
  function lookup(span, p) {
    const key = span.dataset.k;
    const g = p.gl[key];
    const surface = span.textContent;
    hidePop();
    popWord = span;
    span.classList.add("hl");
    VK().speakQueue([surface.replace(/’/g, "'")]);
    const el = popEl();
    const [lemma, ipa, zh] = g || [surface, "", ""];
    const showLemma = lemma && lemma.toLowerCase() !== surface.toLowerCase().replace(/’/g, "'") && !/的$/.test(zh);
    const phI = +span.dataset.ph;
    const ph = phI >= 0 && p.ph[phI] ? p.ph[phI] : null;
    el.innerHTML =
      `<div class="rd-pop-head"><span class="rd-pop-word">${esc(surface)}</span>` +
      (ipa ? `<span class="rd-pop-ipa">${esc(ipa)}</span>` : "") + `</div>` +
      (showLemma ? `<div class="rd-pop-lemma small muted">原形：${esc(lemma)}</div>` : "") +
      `<div class="rd-pop-zh">${esc(zh || "（暂无释义）")}</div>` +
      (ph ? `<div class="rd-pop-ph"><span class="rd-pop-ph-label">词组</span> <b>${esc(ph[0])}</b> ${esc(ph[1])}</div>` : "");
    const sp = btn("🔊", "speak rd-pop-say", (e) => { e.stopPropagation(); VK().speakQueue([surface.replace(/’/g, "'")]); });
    sp.setAttribute("aria-label", "再听一遍");
    el.querySelector(".rd-pop-head").appendChild(sp);
    if (ph) {
      const sp2 = btn("🔊", "speak rd-pop-say small", (e) => { e.stopPropagation(); VK().speakQueue([ph[0]]); });
      sp2.setAttribute("aria-label", "听词组");
      el.querySelector(".rd-pop-ph").appendChild(sp2);
    }
    el.hidden = false;
    // position near the word (fixed), below if there is room, else above; clamp inside the viewport
    const rect = span.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(340, vw - 16);
    el.style.width = w + "px";
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(8, Math.min(vw - w - 8, left));
    el.style.left = left + "px";
    const ph0 = el.offsetHeight;
    let top = rect.bottom + 10;
    if (top + ph0 > vh - 8 && rect.top - ph0 - 10 > 8) top = rect.top - ph0 - 10;
    el.style.top = Math.max(8, Math.min(vh - ph0 - 8, top)) + "px";
  }
  function bindLongPress(box, p) {
    const wordAt = (t) => (t && t.closest ? t.closest(".w") : null);
    const start = (target, x, y) => {
      cancel();
      const span = wordAt(target);
      if (!span) return;
      lp = { span, x, y, fired: false, timer: setTimeout(() => {
        if (!lp || lp.span !== span) return;
        lp.fired = true;
        lookup(span, p);
      }, LONG_MS) };
    };
    const move = (x, y) => {
      if (lp && !lp.fired && (Math.abs(x - lp.x) > MOVE_TOL || Math.abs(y - lp.y) > MOVE_TOL)) cancel();
    };
    const cancel = () => {
      if (lp) clearTimeout(lp.timer);
      lp = null;
    };
    box.addEventListener("touchstart", (e) => {
      noteTouch(e);
      if (e.touches.length !== 1) return cancel();
      const t = e.touches[0];
      start(e.target, t.clientX, t.clientY);
    }, { passive: true });
    box.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (lp && lp.fired) { if (e.cancelable) e.preventDefault(); return; } // keep the page still while the popup is up
      if (t) move(t.clientX, t.clientY);
    }, { passive: false });
    box.addEventListener("touchend", (e) => {
      noteTouch(e);
      // after a long-press, swallow the release so iOS does not select text / fire a click
      if (lp && lp.fired && e.cancelable) e.preventDefault();
      cancel();
    }, { passive: false });
    box.addEventListener("touchcancel", cancel);
    box.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || compatMouse(e)) return; // ignore the emulated mouse events that follow a touch
      start(e.target, e.clientX, e.clientY);
    });
    box.addEventListener("mousemove", (e) => move(e.clientX, e.clientY));
    box.addEventListener("mouseup", () => {
      if (lp && lp.fired) swallowClick = true;
      cancel();
    });
    box.addEventListener("mouseleave", cancel);
    box.addEventListener("click", (e) => {
      if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); }
    }, true);
    box.addEventListener("contextmenu", (e) => e.preventDefault());
    box.addEventListener("selectstart", (e) => e.preventDefault());
    box.addEventListener("dragstart", (e) => e.preventDefault());
  }
  // tap / press anywhere outside the popup closes it (a long-press on another word opens a new one)
  function outside(e) {
    if (!pop || pop.hidden) return;
    if (pop.contains(e.target)) return;
    hidePop();
  }
  document.addEventListener("touchstart", (e) => { noteTouch(e); outside(e); }, { passive: true });
  document.addEventListener("mousedown", (e) => { if (!compatMouse(e)) outside(e); });
  window.addEventListener("resize", hidePop);
  window.addEventListener("scroll", () => { if (!lp || !lp.fired) hidePop(); }, { passive: true });

  // ================= QUIZ =================
  function startQuiz(p) {
    stopAll();
    ui.view = "quiz";
    ui.showText = false;
    const qs = p.qs.map((q, i) => {
      const opts = q.o.map((text, j) => ({ text, ok: j === q.a }));
      return { q, i, opts: q.type === "tf" ? opts : VK().shuffle(opts) };
    });
    ui.quiz = { p, qs, i: 0, correct: 0, wrong: [], locked: false };
    renderQuestion();
  }
  const TF_ZH = { True: "对 True", False: "错 False" };
  const TYPE_ZH = { main: "主旨", detail: "细节", vocab: "词义", infer: "推断", tf: "判断对错", who: "人物" };
  function renderQuestion() {
    const Q = ui.quiz;
    if (!Q) return;
    const p = Q.p;
    show();
    status((kid() === "emma" ? "Emma" : "Alex") + " · 阅读做题 · " + p.title);
    const it = Q.qs[Q.i];
    Q.locked = false;
    const r = root();
    r.innerHTML = "";
    const card = h("div", "card rd-quiz" + (p.kid === "alex" ? " rd-alex-card" : ""));
    card.appendChild(backBar("回到文章", () => { stopAll(); ui.view = "reader"; ui.quiz = null; renderReader(p); }));
    const stats = h("div", "stats-row");
    stats.innerHTML = `<span>${esc(p.title)}</span><span class="rd-qcount">${Q.i + 1} / ${Q.qs.length}</span><span class="stars">★ ${Q.correct}</span>`;
    card.appendChild(stats);
    const bar = h("div", "progress-bar");
    bar.innerHTML = `<span style="width:${(Q.i / Q.qs.length) * 100}%"></span>`;
    card.appendChild(bar);
    // look back at the passage without leaving the question
    const tog = btn(ui.showText ? "📖 收起文章" : "📖 看文章", "secondary rd-toggle", () => {
      ui.showText = !ui.showText;
      hidePop();
      tbox.hidden = !ui.showText;
      tog.textContent = ui.showText ? "📖 收起文章" : "📖 看文章";
    });
    const trow = h("div", "rd-toggle-row");
    trow.appendChild(tog);
    card.appendChild(trow);
    const tbox = passageBox(p);
    tbox.classList.add("rd-lookback");
    tbox.hidden = !ui.showText;
    card.appendChild(tbox);

    const qbox = h("div", "rd-q");
    qbox.innerHTML = `<div class="rd-qtype small">${esc(TYPE_ZH[it.q.type] || "")}${it.q.type === "tf" ? " · 这句话对吗？" : ""}</div>` +
      `<div class="rd-qtext">${esc(it.q.q)}</div>` + (it.q.qz ? `<div class="rd-qzh muted">${esc(it.q.qz)}</div>` : "");
    const sq = btn("🔊", "speak rd-qsay", (e) => { e.stopPropagation(); VK().speakQueue([it.q.q.replace(/_{2,}/g, "blank")]); });
    sq.setAttribute("aria-label", "听题目");
    qbox.querySelector(".rd-qtext").appendChild(sq);
    card.appendChild(qbox);

    const ch = h("div", "choices rd-choices" + (it.q.type === "tf" ? " rd-tf" : ""));
    it.opts.forEach((o) => {
      const b = btn(esc(it.q.type === "tf" ? TF_ZH[o.text] || o.text : o.text), "choice", () => pick(b, o));
      b.dataset.ok = o.ok ? "1" : "0";
      ch.appendChild(b);
    });
    card.appendChild(ch);
    const fb = h("div", "feedback");
    fb.id = "rd-feedback";
    card.appendChild(fb);
    const ex = h("div", "explain-card rd-explain");
    ex.hidden = true;
    card.appendChild(ex);
    const nr = h("div", "action-row");
    nr.id = "rd-next-row";
    nr.hidden = true;
    nr.appendChild(btn(Q.i >= Q.qs.length - 1 ? "看成绩 ✓" : "下一题 →", "", nextQuestion));
    card.appendChild(nr);
    r.appendChild(card);
    window.scrollTo(0, 0);
  }
  function pick(b, o) {
    const Q = ui.quiz;
    if (!Q || Q.locked) return;
    Q.locked = true;
    hidePop();
    const it = Q.qs[Q.i];
    const all = Array.from(b.parentNode.querySelectorAll(".choice"));
    all.forEach((x) => { if (x.dataset.ok === "1") x.classList.add("correct"); x.disabled = true; });
    if (!o.ok) b.classList.add("wrong-pick");
    const f = $("#rd-feedback");
    const right = it.opts.find((x) => x.ok);
    const rightText = it.q.type === "tf" ? TF_ZH[right.text] : right.text;
    if (o.ok) {
      Q.correct++;
      f.textContent = "✓ 答对了！";
      f.className = "feedback good";
    } else {
      Q.wrong.push({ q: it.q, chosen: it.q.type === "tf" ? TF_ZH[o.text] : o.text, right: rightText });
      f.innerHTML = "";
      f.className = "feedback gentle test-wrong";
      f.appendChild(document.createTextNode("✗ 不对哦。正确答案："));
      const s = document.createElement("strong");
      s.textContent = rightText;
      f.appendChild(s);
      const ex = $(".rd-explain");
      if (ex && it.q.e) { ex.innerHTML = `<div class="explain-title">💡 小讲解</div><div class="explain-body">${esc(it.q.e)}</div>`; ex.hidden = false; }
      $("#rd-next-row").hidden = false;
    }
    const st = document.querySelector(".rd-quiz .stats-row .stars");
    if (st) st.textContent = "★ " + Q.correct;
    if (o.ok) {
      const gen = ++qGen;
      setTimeout(() => { if (gen === qGen && ui.quiz === Q && ui.view === "quiz") nextQuestion(); }, NEXT_MS);
    }
  }
  function nextQuestion() {
    const Q = ui.quiz;
    if (!Q) return;
    qGen++;
    hidePop();
    try { VK().stopSpeak(); } catch (e) {}
    if (Q.i >= Q.qs.length - 1) return finishQuiz();
    Q.i++;
    renderQuestion();
  }
  function finishQuiz() {
    const Q = ui.quiz;
    const p = Q.p;
    const n = Q.qs.length;
    const score = Math.round((Q.correct / n) * 100);
    const stars = window.__testKit ? window.__testKit.starsFromScore(score, n) : Math.round((Q.correct / n) * 10) / 2;
    const prev = recs()[p.id] || {};
    const isPB = !prev.done || score > (prev.best || 0);
    saveRec(p.id, (r) => {
      r.read = true;
      r.done = true;
      r.best = Math.max(r.best || 0, score);
      r.bestC = Math.max(r.bestC || 0, Q.correct);
      r.n = n;
      r.lastScore = score;
      r.last = todayStr();
      r.tries = (r.tries || 0) + 1;
    });
    ui.view = "result";
    show();
    window.scrollTo(0, 0);
    const r = root();
    r.innerHTML = "";
    const card = h("div", "card rd-result");
    card.style.textAlign = "center";
    card.appendChild(h("div", "cele", score === 100 ? "🏆" : score >= 60 ? "🎉" : "💪"));
    const sr = h("div", "star-row");
    card.appendChild(sr);
    VK().renderStarRow(sr, stars, stars >= 4.5);
    card.appendChild(h("h2", "", esc(p.title) + " · 做完啦！"));
    card.appendChild(h("div", "score-big rd-score", score + "%"));
    card.appendChild(h("p", "muted", `答对 ${Q.correct} / ${n} 题`));
    if (prev.done && isPB && score > (prev.best || 0)) card.appendChild(h("p", "pb-banner", "🏆 新纪录！"));
    else if (prev.done) card.appendChild(h("p", "best-line muted small", `最好成绩 ${Math.max(prev.best || 0, score)}%`));
    card.appendChild(h("p", "rd-msg", score === 100 ? "全部答对，读得真仔细！" : score >= 60 ? "很不错！看看下面的题，再读一读文章。" : "没关系，再读一遍文章，你会更明白的！"));
    if (Q.wrong.length) {
      const wr = h("div", "rd-review");
      wr.appendChild(h("h3", "", "再看看这几题"));
      Q.wrong.forEach((w) => {
        const it = h("div", "history-item rd-wrong-item");
        it.innerHTML = `<div class="rd-wq">${esc(w.q.q)}</div>` + (w.q.qz ? `<div class="small muted">${esc(w.q.qz)}</div>` : "") +
          `<div class="rd-wa"><span class="rd-mine">你的答案：${esc(w.chosen)}</span><br><span class="rd-right">正确答案：${esc(w.right)}</span></div>` +
          (w.q.e ? `<div class="small rd-we">💡 ${esc(w.q.e)}</div>` : "");
        wr.appendChild(it);
      });
      card.appendChild(wr);
    }
    const ar = h("div", "action-row");
    ar.appendChild(btn("再做一次", "", () => startQuiz(p)));
    ar.appendChild(btn("回到文章", "secondary", () => { stopAll(); ui.view = "reader"; ui.quiz = null; renderReader(p); }));
    ar.appendChild(btn("文章列表", "secondary", () => { stopAll(); ui.view = "list"; ui.quiz = null; renderList(); }));
    card.appendChild(ar);
    r.appendChild(card);
  }

  // ================= 进度 =================
  function renderProgress(host) {
    if (!host) return;
    host.hidden = false;
    host.innerHTML = '<h3 style="margin-top:18px">📖 阅读进度</h3><p class="small muted">加载中…</p>';
    loadIndex().then((idx) => {
      const list = idx[kid()] || [];
      const rc = recs();
      const done = list.filter((p) => rc[p.id] && rc[p.id].done);
      const read = list.filter((p) => rc[p.id] && rc[p.id].read);
      const avg = done.length ? Math.round(done.reduce((a, p) => a + (rc[p.id].best || 0), 0) / done.length) : 0;
      host.innerHTML = '<h3 style="margin-top:18px">📖 阅读进度</h3>';
      const sum = h("div", "best-box rd-prog-sum");
      sum.innerHTML = `完成 <strong>${done.length}</strong> / ${list.length} 篇 · 读过 ${read.length} 篇` + (done.length ? ` · 平均最好成绩 ${avg}%` : "") +
        `<div class="bar-mini"><span style="width:${list.length ? (done.length / list.length) * 100 : 0}%"></span></div>`;
      host.appendChild(sum);
      const touched = list.filter((p) => rc[p.id] && (rc[p.id].read || rc[p.id].done));
      if (!touched.length) {
        host.appendChild(h("p", "muted small", "还没有读过文章，去「学习」里点「阅读」试试吧！"));
        return;
      }
      touched.sort((a, b) => String(rc[b.id].last || "").localeCompare(String(rc[a.id].last || "")));
      touched.forEach((p) => {
        const x = rc[p.id];
        const row = h("div", "history-item rd-prog-row");
        row.dataset.rid = p.id;
        row.innerHTML = `<strong>${esc(p.title)}</strong> <span class="small muted">${esc(p.zh)}</span><br>` +
          `<span class="small muted">${x.done ? `✅ 最好 ${x.best}%（${x.bestC || 0}/${x.n || p.nq}）· 做过 ${x.tries || 1} 次` : "📖 读过，还没做题"}${x.last ? " · " + esc(x.last) : ""}</span>` +
          (x.done ? `<div class="bar-mini"><span style="width:${x.best}%"></span></div>` : "");
        host.appendChild(row);
      });
    }).catch((e) => { console.warn(e); host.innerHTML = '<h3 style="margin-top:18px">📖 阅读进度</h3><p class="muted small">加载失败</p>'; });
  }

  window.__reading = {
    enter,
    renderProgress,
    leave: stopAll,
    _ui: ui,
    _cache: cache,
    _open: openPassage,
  };
})();
