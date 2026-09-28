(function () {
  "use strict";

  const LS_ACTIVE = "vocabKid.activeProfile";
  const LS_PROFILES = "vocabKid.profiles.v1";
  const SESSION_SIZE = 12;
  const CHOICE_COUNT = 4;
  const TIMED_MODES = { dictation: true, guided: true };

  const PROFILE_DEFS = [
    {
      id: "alex",
      name: "Alex",
      emoji: "🧒",
      avatar: "assets/alex.png",
      blurb: "小学课本 · Welcome + Unit 1–6",
      dataUrl: "data/words.json",
      hanziUrl: "data/alex-hanzi.json",
      hanziBlurb: "三年级上册 · 四会生字 + 听写词语",
      css: "alex",
    },
    {
      id: "emma",
      name: "Emma",
      emoji: "👧",
      avatar: "assets/emma.png",
      blurb: "六年级 / 初一 · PET 主题词汇",
      dataUrl: "data/emma-pet.json",
      css: "emma",
    },
  ];

  let DATA = null;
  let DATA_PROFILE = null;
  let activeProfileId = null;
  let activeSubject = null; // "en" | "zh" | null
  let selectedUnitIds = [];
  let wordsUnitIds = [];
  let wordsPhase = "pick"; // pick | list
  let session = null;
  let timerInterval = null;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function emptyProfileStore() {
    return { progress: {}, history: [], settings: {}, bests: { dictation: null } };
  }

  function loadAllProfiles() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_PROFILES) || "{}");
      const out = {};
      PROFILE_DEFS.forEach((p) => {
        out[p.id] = Object.assign(emptyProfileStore(), raw[p.id] || {});
        if (!out[p.id].bests) out[p.id].bests = { dictation: null };
      });
      // one-time migrate legacy flat keys into alex
      migrateLegacyIntoAlex(out);
      return out;
    } catch {
      const out = {};
      PROFILE_DEFS.forEach((p) => (out[p.id] = emptyProfileStore()));
      return out;
    }
  }

  function migrateLegacyIntoAlex(store) {
    try {
      const oldP = localStorage.getItem("vocabKid.progress.v1");
      const oldH = localStorage.getItem("vocabKid.history.v1");
      if (!oldP && !oldH) return;
      const alex = store.alex;
      const empty =
        Object.keys(alex.progress || {}).length === 0 && !(alex.history || []).length;
      if (!empty) return;
      if (oldP) alex.progress = JSON.parse(oldP);
      if (oldH) alex.history = JSON.parse(oldH);
      saveAllProfiles(store);
      localStorage.removeItem("vocabKid.progress.v1");
      localStorage.removeItem("vocabKid.history.v1");
      localStorage.removeItem("vocabKid.settings.v1");
    } catch (e) {
      console.warn("migrate skip", e);
    }
  }

  function saveAllProfiles(store) {
    localStorage.setItem(LS_PROFILES, JSON.stringify(store));
  }

  function profileStore() {
    const all = loadAllProfiles();
    return all[activeProfileId] || emptyProfileStore();
  }

  function updateProfile(mutator) {
    const all = loadAllProfiles();
    const cur = all[activeProfileId] || emptyProfileStore();
    mutator(cur);
    all[activeProfileId] = cur;
    saveAllProfiles(all);
  }

  function getProgress() {
    return profileStore().progress || {};
  }
  function getHistory() {
    return profileStore().history || [];
  }
  function getDictationBest() {
    return (profileStore().bests || {}).dictation || null;
  }

  function getAdvanceMode() {
    const s = (profileStore().settings || {}).advanceMode;
    return s === "manual" ? "manual" : "auto";
  }
  function setAdvanceMode(mode) {
    updateProfile((p) => {
      p.settings = p.settings || {};
      p.settings.advanceMode = mode === "manual" ? "manual" : "auto";
    });
  }
  function syncAdvanceToggle() {
    const mode = getAdvanceMode();
    const a = $("#btn-advance-auto");
    const m = $("#btn-advance-manual");
    if (a) a.classList.toggle("active", mode === "auto");
    if (m) m.classList.toggle("active", mode === "manual");
    const hint = $("#advance-hint");
    if (hint) {
      hint.textContent =
        mode === "manual"
          ? "Manual：每题读完后点「下一题」才继续"
          : "Auto：读完后按时间自动下一题";
    }
  }
  function hideNextButton() {
    const row = $("#next-row");
    if (row) row.hidden = true;
  }
  function showNextButton() {
    const row = $("#next-row");
    if (row) row.hidden = false;
  }


  function pushHistory(entry) {
    updateProfile((p) => {
      p.history = [entry].concat(p.history || []).slice(0, 50);
    });
  }

  // ---- Stars rubric ----
  function accuracyCap(pct) {
    if (pct < 50) return 1;
    if (pct < 75) return 2;
    if (pct < 90) return 3;
    if (pct < 100) return 4;
    return 5;
  }

  function speedShave(secPerItem) {
    if (secPerItem == null || !isFinite(secPerItem)) return 0; // untimed
    if (secPerItem <= 8) return 0;
    if (secPerItem <= 12) return 0.5;
    if (secPerItem <= 20) return 1.0;
    return 1.5;
  }

  /**
   * @returns {Object} stars, accuracy, elapsedSec, secPerItem, timed
   */
  function computeStars({ correct, total, elapsedSec, timed }) {
    const t = Math.max(1, total || 1);
    const accuracy = Math.round((correct / t) * 100);
    const cap = accuracyCap(accuracy);
    let stars = cap;
    let spi = null;
    if (timed && elapsedSec != null && elapsedSec >= 0) {
      spi = elapsedSec / t;
      stars = Math.max(0, cap - speedShave(spi));
      if (correct > 0) stars = Math.max(1, stars);
      else stars = Math.min(stars, 1);
    }
    // snap to .0 / .5
    stars = Math.round(stars * 2) / 2;
    stars = Math.max(0, Math.min(5, stars));
    return { stars, accuracy, elapsedSec: elapsedSec != null ? elapsedSec : null, secPerItem: spi, timed: !!timed };
  }

  function betterDictationRecord(a, b) {
    // higher stars, then lower time, then higher accuracy
    if (!a) return false;
    if (!b) return true;
    if (a.stars !== b.stars) return a.stars > b.stars;
    if ((a.elapsedSec || 0) !== (b.elapsedSec || 0)) return (a.elapsedSec || 0) < (b.elapsedSec || 0);
    return (a.accuracy || 0) > (b.accuracy || 0);
  }

  function renderStarRow(container, stars, celebrate) {
    container.innerHTML = "";
    container.className = "star-row" + (celebrate ? " celebrate" : "");
    for (let i = 1; i <= 5; i++) {
      const wrap = document.createElement("span");
      wrap.className = "star";
      const empty = document.createElement("span");
      empty.className = "empty";
      empty.textContent = "★";
      const full = document.createElement("span");
      full.className = "full";
      full.textContent = "★";
      let fill = 0;
      if (stars >= i) fill = 100;
      else if (stars >= i - 0.5) fill = 50;
      full.style.width = fill + "%";
      wrap.appendChild(empty);
      wrap.appendChild(full);
      container.appendChild(wrap);
    }
  }

  function formatMMSS(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function starsLabel(n) {
    return (Math.round(n * 2) / 2).toFixed(n % 1 ? 1 : 0) + "★";
  }

  // ---- TTS ----
  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.onvoiceschanged = function () {};
  }

  /** Speak texts one-by-one; resolves only after the last utterance fully ends. */
  function speakQueue(texts) {
    const list = (Array.isArray(texts) ? texts : [texts])
      .map((t) => String(t || "").trim())
      .filter(Boolean);
    return new Promise((resolve) => {
      if (!list.length || typeof speechSynthesis === "undefined") {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      try {
        speechSynthesis.cancel();
        const voices = speechSynthesis.getVoices();
        const en =
          voices.find((v) => /^en(-|_)/i.test(v.lang) && /US|United/i.test(v.lang)) ||
          voices.find((v) => /^en/i.test(v.lang));
        // Safety only — never use a short estimate (that cut off long sentences).
        const hardStop = setTimeout(finish, 90000);
        let i = 0;
        const waitIdleThenFinish = () => {
          if (speechSynthesis.speaking || speechSynthesis.pending) {
            setTimeout(waitIdleThenFinish, 100);
            return;
          }
          clearTimeout(hardStop);
          finish();
        };
        const speakNext = () => {
          if (i >= list.length) {
            waitIdleThenFinish();
            return;
          }
          const text = list[i++];
          const u = new SpeechSynthesisUtterance(text);
          u.lang = "en-US";
          u.rate = 0.92;
          if (en) u.voice = en;
          u.onend = () => speakNext();
          u.onerror = () => speakNext();
          speechSynthesis.speak(u);
        };
        // Let WebKit clear after cancel before speaking.
        setTimeout(speakNext, 80);
      } catch (e) {
        console.warn("TTS failed", e);
        finish();
      }
    });
  }
  function speak(text) {
    return speakQueue([text]);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function unitsByIds(ids) {
    return DATA.units.filter((u) => ids.includes(u.id));
  }
  function allWordsFrom(ids) {
    return unitsByIds(ids).flatMap((u) =>
      u.words.map((w) => Object.assign({}, w, { unitId: u.id, unitTitle: u.title }))
    );
  }
  function allFillInsFrom(ids) {
    return unitsByIds(ids).flatMap((u) =>
      (u.fillIns || []).map((f) => Object.assign({}, f, { unitId: u.id }))
    );
  }
  function answerKey(w) {
    return String(w.answerNorm || w.answer || w.en || "").toLowerCase().trim();
  }
  function normGuess(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function isSpellable(w) {
    return /^[a-zA-Z]+$/.test(w.en);
  }
  function autoHardForIndex(index, total) {
    if (total <= 1) return false;
    return index >= Math.ceil(total / 2);
  }
  function applyAutoHardToSpellItems(items) {
    const spellIdx = [];
    items.forEach((it, i) => {
      if (it.type === "spell") spellIdx.push(i);
    });
    const n = spellIdx.length;
    spellIdx.forEach((itemIndex, k) => {
      items[itemIndex].hard = autoHardForIndex(k, n);
    });
    return items;
  }
  function fillCompletedSentence(fill) {
    return String(fill.template || "").replace("____", fill.answer);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showScreen(id) {
    $$(".screen").forEach((s) => s.classList.remove("active"));
    const el = $("#screen-" + id);
    if (el) el.classList.add("active");
    $$(".nav-tabs button").forEach((b) => {
      b.classList.toggle("active", b.dataset.nav === id);
    });
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function activeElapsedMs() {
    if (!session) return 0;
    const now = session.endedAt || Date.now();
    const paused = (session.pausedMs || 0) + (session.pauseStart ? now - session.pauseStart : 0);
    return Math.max(0, now - session.startedAt - paused);
  }

  function startTimerUI() {
    stopTimer();
    const badge = $("#play-timer");
    if (!session || !session.timed) {
      badge.hidden = true;
      return;
    }
    badge.hidden = false;
    const tick = () => {
      if (!session) return;
      const sec = Math.floor(activeElapsedMs() / 1000);
      badge.textContent = formatMMSS(sec);
    };
    tick();
    timerInterval = setInterval(tick, 250);
  }

  // ---- Profiles ----
  function renderProfileSelect() {
    const grid = $("#profile-grid");
    grid.innerHTML = "";
    PROFILE_DEFS.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "profile-card " + p.css;
      const av = p.avatar
        ? `<img class="profile-avatar" src="${p.avatar}" alt="${escapeHtml(p.name)}" width="72" height="72"/>`
        : `<span class="profile-avatar emoji">${p.emoji}</span>`;
      btn.innerHTML =
        av +
        `<span><div class="pname">${escapeHtml(p.name)}</div>` +
        `<div class="pmeta">${escapeHtml(p.blurb)}</div></span>`;
      btn.addEventListener("click", () => selectProfile(p.id));
      grid.appendChild(btn);
    });
    $("#btn-profile-chip").hidden = true;
    if (window.__zh && window.__zh.leave) window.__zh.leave();
    setSubjectUI(null);
    showScreen("profiles");
    $("#app-status").textContent = "先选一个小朋友档案";
  }

  function selectProfile(id) {
    const def = PROFILE_DEFS.find((p) => p.id === id);
    if (!def) return;
    activeProfileId = id;
    localStorage.setItem(LS_ACTIVE, id);
    $("#btn-profile-chip").hidden = false;
    $("#btn-profile-chip").innerHTML = def.avatar
      ? `<img class="profile-chip-av" src="${def.avatar}" alt=""/>${escapeHtml(def.name)} ▾`
      : `${escapeHtml(def.name)} ▾`;
    showSubjectPicker();
  }

  function setSubjectUI(subj) {
    activeSubject = subj;
    $("#main-nav").hidden = subj !== "en";
    const zn = $("#zh-nav");
    if (zn) zn.hidden = subj !== "zh";
    const chip = $("#btn-subject-chip");
    if (chip) {
      chip.hidden = !subj;
      chip.textContent = subj === "zh" ? "🀄 语文 ⇄" : "🔤 英文 ⇄";
    }
  }

  function showSubjectPicker() {
    const def = PROFILE_DEFS.find((p) => p.id === activeProfileId);
    if (!def) return renderProfileSelect();
    stopTimer();
    $("#btn-pause-test").hidden = true;
    session = null;
    try {
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    } catch (e) {}
    if (window.__zh && window.__zh.leave) window.__zh.leave();
    setSubjectUI(null);
    $("#subject-title").textContent = def.name + "，今天学什么？";
    const zhBtn = $("#btn-subject-zh");
    const zhDesc = $("#subject-zh-desc");
    if (def.hanziUrl) {
      zhBtn.disabled = false;
      zhBtn.classList.remove("empty");
      zhDesc.textContent = (def.hanziBlurb ? def.hanziBlurb + " · " : "") + "生字 · 组词 · 写字 · 听写";
    } else {
      zhBtn.disabled = true;
      zhBtn.classList.add("empty");
      zhDesc.textContent = "还没有中文字库（请家长添加后再来）";
    }
    showScreen("subject");
    $("#app-status").textContent = def.name + " · 选科目";
  }

  function enterEnglish() {
    const def = PROFILE_DEFS.find((p) => p.id === activeProfileId);
    if (!def) return;
    setSubjectUI("en");
    if (DATA && DATA_PROFILE === def.id) {
      showScreen("home");
      renderHome();
      const n0 = DATA.units.reduce((a, u) => a + u.words.length, 0);
      $("#app-status").textContent = `${def.name} · 英文 · ${DATA.units.length} 单元 · ${n0} 词`;
      return;
    }
    $("#app-status").textContent = "加载词表…";
    fetch(def.dataUrl)
      .then((r) => {
        if (!r.ok) throw new Error("load failed");
        return r.json();
      })
      .then((data) => {
        DATA = data;
        DATA_PROFILE = def.id;
        selectedUnitIds = data.units[0] ? [data.units[0].id] : [];
        wordsUnitIds = [];
        wordsPhase = "pick";
        showScreen("home");
        renderHome();
        const n = data.units.reduce((a, u) => a + u.words.length, 0);
        $("#app-status").textContent = `${def.name} · 英文 · ${data.units.length} 单元 · ${n} 词`;
      })
      .catch((err) => {
        console.error(err);
        $("#app-status").textContent = "词表加载失败";
        $("#app-status").style.color = "#d63031";
      });
  }

  function enterChinese() {
    const def = PROFILE_DEFS.find((p) => p.id === activeProfileId);
    if (!def || !def.hanziUrl) return;
    stopTimer();
    session = null;
    setSubjectUI("zh");
    if (window.__zh && window.__zh.enter) window.__zh.enter(def);
  }

  function renderHome() {
    syncAdvanceToggle();
    const grid = $("#unit-grid");
    grid.innerHTML = "";
    DATA.units.forEach((u) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "unit-chip" + (selectedUnitIds.includes(u.id) ? " selected" : "");
      btn.innerHTML =
        `<span><strong>${escapeHtml(u.title)}</strong><br><span class="small muted">${escapeHtml(u.titleZh || "")}</span></span>` +
        `<span class="count">${u.words.length} 词</span>`;
      btn.addEventListener("click", () => {
        if (selectedUnitIds.includes(u.id)) {
          selectedUnitIds = selectedUnitIds.filter((x) => x !== u.id);
        } else {
          selectedUnitIds = selectedUnitIds.concat(u.id);
        }
        renderHome();
      });
      grid.appendChild(btn);
    });
    $("#selected-count").textContent = selectedUnitIds.length
      ? `已选 ${selectedUnitIds.length} 个单元 · ${allWordsFrom(selectedUnitIds).length} 个单词`
      : "请先点选一个或多个单元";
    $("#btn-start-modes").disabled = selectedUnitIds.length === 0;
    $("#btn-guided").disabled = selectedUnitIds.length === 0;
  }

  /** Sample for tests: ~70% from not-yet-mastered words, ~30% random (incl. mastered). */
  function pickWeighted(list, n, keyFn) {
    const prog = getProgress();
    const scored = shuffle(list).map((w) => {
      const st = prog[String(keyFn(w)).toLowerCase()] || { known: 0, seen: 0 };
      const miss = (st.seen || 0) - (st.known || 0);
      return { w, s: (st.known || 0) - miss * 2 + (st.seen ? 0 : -1) + Math.random() * 2 };
    });
    scored.sort((a, b) => a.s - b.s);
    const weakN = Math.ceil(n * 0.7);
    const out = scored.slice(0, weakN).map((x) => x.w);
    shuffle(scored.slice(weakN)).slice(0, n - out.length).forEach((x) => out.push(x.w));
    return out;
  }

  function buildTestItems(words) {
    const used = new Set();
    const pool = pickWeighted(words, words.length, (w) => w.en);
    const take = (k, ok) => {
      const out = [];
      for (const w of pool) {
        if (out.length >= k) break;
        const key = w.en.toLowerCase();
        if (!used.has(key) && ok(w)) { used.add(key); out.push(w); }
      }
      return out;
    };
    const fills = pickWeighted(allFillInsFrom(selectedUnitIds), 5, (f) => f.answer).slice(0, 5);
    fills.forEach((f) => used.add(String(f.answer).toLowerCase()));
    const fillItems = fills.map((f) => ({ type: "fill", fill: f, bankWords: buildFillBank(f, words) }));
    const extra = 5 - fillItems.length; // if a unit has few fill-ins, give more choice questions
    const spellItems = take(4, isSpellable).map((w) => ({ type: "spell", word: w, hard: false }));
    applyAutoHardToSpellItems(spellItems);
    const dictItems = take(2, (w) => isSpellable(w) && w.en.length <= 9).map((w) => ({ type: "dictation", word: w }));
    const choice = []
      .concat(take(7 + Math.ceil(extra / 2), () => true).map((w) => ({ type: "en2zh", word: w })))
      .concat(take(7 + Math.floor(extra / 2), () => true).map((w) => ({ type: "zh2en", word: w })));
    const nonWrite = shuffle(choice.concat(fillItems));
    return window.__testKit.interleave(nonWrite, shuffle(spellItems.concat(dictItems)));
  }

  function startSession(mode) {
    const words = allWordsFrom(selectedUnitIds);
    if (!words.length) return;
    let items = [];

    if (mode === "en2zh") {
      items = shuffle(words).slice(0, SESSION_SIZE).map((w) => ({ type: "en2zh", word: w }));
    } else if (mode === "zh2en") {
      items = shuffle(words).slice(0, SESSION_SIZE).map((w) => ({ type: "zh2en", word: w }));
    } else if (mode === "fill") {
      let fills = shuffle(allFillInsFrom(selectedUnitIds));
      if (!fills.length) {
        fills = shuffle(words).slice(0, SESSION_SIZE).map((w) => ({
          template: "I like ____.",
          answer: w.en,
          zh: "我喜欢……（练习）",
          unitId: w.unitId,
        }));
      }
      items = fills.slice(0, Math.min(SESSION_SIZE, fills.length)).map((f) => ({
        type: "fill",
        fill: f,
        bankWords: buildFillBank(f, words),
      }));
    } else if (mode === "spell") {
      const spellable = words.filter(isSpellable);
      const pool = shuffle(spellable.length ? spellable : words).slice(0, SESSION_SIZE);
      items = pool.map((w) => ({ type: "spell", word: w, hard: false }));
      applyAutoHardToSpellItems(items);
    } else if (mode === "dictation") {
      const dictable = words.filter(isSpellable);
      const pool = shuffle(dictable.length ? dictable : words).slice(0, SESSION_SIZE);
      items = pool.map((w) => ({ type: "dictation", word: w }));
    } else if (mode === "guided") {
      const spellable = shuffle(words.filter(isSpellable));
      const pool = shuffle(words);
      const fills = shuffle(allFillInsFrom(selectedUnitIds));
      const spellN = Math.min(5, Math.max(4, spellable.length));
      const fillN = Math.min(2, fills.length);
      items = []
        .concat(pool.slice(0, 3).map((w) => ({ type: "en2zh", word: w })))
        .concat(pool.slice(3, 5).map((w) => ({ type: "zh2en", word: w })))
        .concat(
          fills.slice(0, fillN).map((f) => ({
            type: "fill",
            fill: f,
            bankWords: buildFillBank(f, words),
          }))
        )
        .concat(spellable.slice(0, spellN).map((w) => ({ type: "spell", word: w, hard: false })));
      const nonSpell = items.filter((i) => i.type !== "spell");
      const spells = items.filter((i) => i.type === "spell");
      items = shuffle(nonSpell).concat(spells).slice(0, SESSION_SIZE);
      applyAutoHardToSpellItems(items);
    }

    else if (mode === "test") {
      items = buildTestItems(words);
    }

    if (!items.length) return;

    const timed = !!TIMED_MODES[mode] || mode === "test";
    session = {
      mode,
      unitIds: selectedUnitIds.slice(),
      items,
      index: 0,
      correct: 0,
      answered: 0,
      startedAt: Date.now(),
      endedAt: null,
      locked: false,
      timed,
      test: mode === "test",
      results: [],
      pausedMs: 0,
      pauseStart: null,
    };
    $("#btn-pause-test").hidden = mode !== "test";
    showScreen("play");
    startTimerUI();
    renderQuestion();
  }

  function buildFillBank(fill, words) {
    const ans = answerKey(fill);
    const distractors = shuffle(
      words.map((w) => w.en).filter((en) => en.toLowerCase() !== ans && !en.includes(" "))
    ).slice(0, 3);
    return shuffle([fill.answer].concat(distractors));
  }

  function updatePlayChrome() {
    const total = session.items.length;
    const i = session.index;
    const pct = total ? Math.round((i / total) * 100) : 0;
    $("#play-progress").style.width = pct + "%";
    $("#play-count").textContent = `${Math.min(i + 1, total)} / ${total}`;
    $("#play-score").textContent = session.test ? `✎ 已答 ${session.answered}` : `★ ${session.correct}`;
    const modeNames = {
      test: "综合测试",
      en2zh: "英→中",
      zh2en: "中→英",
      fill: "句子填空",
      spell: "拼写",
      dictation: "听写挑战",
      guided: "闯关练习",
    };
    $("#play-mode-label").textContent = modeNames[session.mode] || "";
  }

  function advanceAfter(ms) {
    setTimeout(() => {
      session.index++;
      renderQuestion();
    }, ms);
  }


  function findWordByEn(en) {
    const key = String(en || "").toLowerCase().trim();
    if (!DATA || !DATA.units) return { en: en, zh: "" };
    for (const u of DATA.units) {
      for (const w of u.words || []) {
        if (String(w.en).toLowerCase() === key) return w;
      }
    }
    return { en: en, zh: "" };
  }

  function buildExplain(opts) {
    const en = opts.en || "";
    const zh = opts.zh || findWordByEn(en).zh || "";
    const chosen = String(opts.chosen || "").trim();
    const kind = opts.kind || "";
    const lines = [];
    lines.push("正确答案：英文「" + en + "」" + (zh ? "＝「" + zh + "」" : "") + "。");
    if (chosen && chosen.toLowerCase() !== en.toLowerCase()) {
      if (kind === "en2zh") {
        lines.push("你选的「" + chosen + "」不是这个词的意思。记住：" + en + " → " + (zh || "看中文释义") + "。");
      } else if (kind === "zh2en") {
        lines.push("你选的「" + chosen + "」不对。看到「" + zh + "」要想起单词 " + en + "。");
      } else if (kind === "fill") {
        lines.push("空格里要填「" + en + "」。");
        if (opts.sentence) lines.push("完整句子：" + opts.sentence);
      } else if (kind === "spell" || kind === "dictation") {
        lines.push("你写的是「" + chosen + "」，正确拼写是「" + en + "」。可以按字母再念一遍。");
      } else {
        lines.push("你选的是「" + chosen + "」，这次记住正确的「" + en + "」就好。");
      }
    } else if (kind === "fill" && opts.sentence) {
      lines.push("完整句子：" + opts.sentence);
    }
    lines.push("点「明白了」听正确发音，再继续下一题～");
    return lines.join("\n");
  }

  let explainContinue = null;

  function hideExplain() {
    const card = $("#explain-card");
    if (card) card.hidden = true;
    explainContinue = null;
  }

  function showExplain(opts, continueTexts) {
    const card = $("#explain-card");
    const body = $("#explain-body");
    if (!card || !body) {
      advanceAfterSpeech(continueTexts);
      return;
    }
    advanceGen++;
    hideNextButton();
    body.textContent = buildExplain(opts);
    card.hidden = false;
    explainContinue = function () {
      hideExplain();
      advanceAfterSpeech(continueTexts);
    };
  }

  let advanceGen = 0;

  /** Forced minimum speak time from word/char counts (Safari onend is unreliable). */
  function estimateSpeakMs(texts) {
    const list = (Array.isArray(texts) ? texts : [texts])
      .map((t) => String(t || "").trim())
      .filter(Boolean);
    if (!list.length) return 0;
    let total = 80;
    list.forEach((text, idx) => {
      const words = text.split(/\s+/).filter(Boolean).length;
      const chars = text.replace(/\s+/g, "").length;
      // Tighter: ~280ms/word (rate 0.92) + light cushion — long sentences were too slow
      const piece = 250 + words * 280 + Math.max(0, chars - words) * 18;
      total += Math.max(piece, 450);
      if (idx < list.length - 1) total += 180;
    });
    return total;
  }

  /**
   * Start TTS, but advance only after BOTH:
   * 1) speech callback settles (best-effort), AND
   * 2) forced min duration from word count
   * then +0.5s buffer. Long sentences cannot be cut by flaky onend.
   */
  function advanceAfterSpeech(texts, pauseMs) {
    const pause = pauseMs == null ? 350 : pauseMs;
    const gen = ++advanceGen;
    const minMs = estimateSpeakMs(texts);
    const started = Date.now();
    const manual = getAdvanceMode() === "manual";
    hideNextButton();
    let armed = false;
    const goNext = () => {
      if (gen !== advanceGen) return;
      hideNextButton();
      session.index++;
      renderQuestion();
    };
    const arm = () => {
      if (armed || gen !== advanceGen) return;
      armed = true;
      if (manual) {
        showNextButton();
        return;
      }
      const elapsed = Date.now() - started;
      // If speech already ran past estimate, only wait pause; else wait rest of minMs + pause
      const remain = Math.max(0, minMs - elapsed) + pause;
      setTimeout(goNext, remain);
    };
    // Forced gate by word count
    setTimeout(arm, minMs);
    // If real TTS lasts longer than estimate, re-arm from actual end
    speakQueue(texts).then(() => {
      if (gen !== advanceGen) return;
      if (manual) {
        // ensure Next is visible once audio finished (min gate may already have shown it)
        showNextButton();
        return;
      }
      const elapsed = Date.now() - started;
      if (elapsed > minMs + 50) {
        // speech longer than estimate — schedule from now (once)
        if (!armed) {
          armed = true;
          setTimeout(goNext, pause);
        }
      }
      // else the minMs timer already handles advance
    });
  }

  function renderQuestion() {
    advanceGen++;
    hideExplain();
    hideNextButton();
    session.locked = false;
    updatePlayChrome();
    const host = $("#play-area");
    host.innerHTML = "";
    $("#feedback").textContent = "";
    $("#feedback").className = "feedback";

    if (session.index >= session.items.length) {
      finishSession();
      return;
    }

    const item = session.items[session.index];
    if (item.type === "en2zh") renderEn2Zh(host, item);
    else if (item.type === "zh2en") renderZh2En(host, item);
    else if (item.type === "fill") renderFill(host, item);
    else if (item.type === "spell") renderSpell(host, item);
    else if (item.type === "dictation") renderDictation(host, item);
  }

  function makeSpeakBtn(text) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "speak";
    b.title = "听发音";
    b.setAttribute("aria-label", "听发音");
    b.textContent = "🔊";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      speak(text);
    });
    return b;
  }

  function makeClickableEn(text, className) {
    const span = document.createElement("span");
    span.className = "clickable-en " + (className || "");
    span.textContent = text;
    span.title = "点我听发音";
    span.addEventListener("click", () => speak(text));
    return span;
  }

  function pickChoices(correctZh, allWords) {
    const distract = shuffle(allWords.map((w) => w.zh).filter((z) => z !== correctZh)).slice(
      0,
      CHOICE_COUNT - 1
    );
    return shuffle([correctZh].concat(distract));
  }
  function pickEnChoices(correctEn, allWords) {
    const distract = shuffle(allWords.map((w) => w.en).filter((e) => e !== correctEn)).slice(
      0,
      CHOICE_COUNT - 1
    );
    return shuffle([correctEn].concat(distract));
  }

  function renderEn2Zh(host, item) {
    const w = item.word;
    const words = allWordsFrom(session.unitIds);
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "这个英文是什么意思？点单词可听发音～";
    host.appendChild(hint);
    const prompt = document.createElement("div");
    prompt.className = "prompt-en";
    prompt.appendChild(makeClickableEn(w.en));
    prompt.appendChild(document.createTextNode(" "));
    prompt.appendChild(makeSpeakBtn(w.en));
    host.appendChild(prompt);
    const choices = document.createElement("div");
    choices.className = "choices";
    pickChoices(w.zh, words).forEach((zh) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.textContent = zh;
      b.addEventListener("click", () => onChoice(b, zh === w.zh, w.en, w.zh, "en2zh"));
      choices.appendChild(b);
    });
    host.appendChild(choices);
    speak(w.en);
  }

  function renderZh2En(host, item) {
    const w = item.word;
    const words = allWordsFrom(session.unitIds);
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "选正确的英文。点选项也能听～";
    host.appendChild(hint);
    const prompt = document.createElement("div");
    prompt.className = "prompt-zh";
    prompt.textContent = w.zh;
    host.appendChild(prompt);
    const choices = document.createElement("div");
    choices.className = "choices";
    pickEnChoices(w.en, words).forEach((en) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      // Plain text — makeClickableEn + speak + advanceAfterSpeech was reading 3x
      b.textContent = en;
      b.addEventListener("click", () => {
        onChoice(b, en === w.en, w.en, w.zh, "zh2en");
      });
      choices.appendChild(b);
    });
    host.appendChild(choices);
  }

  function onChoice(btn, ok, enSpeak, zhShow, kind) {
    if (session.locked) return;
    if (session.test) {
      $$(".choice", btn.parentElement).forEach((b) => (b.disabled = true));
      btn.classList.add("picked");
      const chosen0 = (btn.textContent || "").trim();
      testRecord(ok, kind === "en2zh"
        ? { cat: "英→中", kind, en: enSpeak, zh: zhShow, prompt: enSpeak, answer: zhShow, chosen: chosen0 }
        : { cat: "中→英", kind, en: enSpeak, zh: zhShow, prompt: zhShow, answer: enSpeak, chosen: chosen0 });
      return;
    }
    session.locked = true;
    session.answered++;
    const siblings = $$(".choice", btn.parentElement);
    siblings.forEach((b) => (b.disabled = true));
    const chosen = (btn.textContent || "").trim();
    if (ok) {
      btn.classList.add("correct");
      session.correct++;
      $("#feedback").textContent = "太棒了！✨";
      $("#feedback").className = "feedback good";
      markKnown(enSpeak);
      updatePlayChrome();
      advanceAfterSpeech(enSpeak);
    } else {
      btn.classList.add("wrong-soft");
      $("#feedback").textContent = "再想想～先看下面的小讲解哦";
      $("#feedback").className = "feedback gentle";
      siblings.forEach((b) => {
        const tx = b.textContent.trim();
        if (tx === zhShow || tx === enSpeak) b.classList.add("correct");
      });
      markSeen(enSpeak);
      updatePlayChrome();
      showExplain(
        { kind: kind || "choice", en: enSpeak, zh: zhShow, chosen: chosen },
        enSpeak
      );
    }
  }

  /** 综合测试: record silently (no reveal, no 小讲解), then go on. */
  function testRecord(ok, r) {
    if (!session || session.locked) return;
    session.locked = true;
    session.answered++;
    if (ok) session.correct++;
    if (ok) markKnown(r.en);
    else markSeen(r.en);
    const explain = ok ? "" : buildExplain({ kind: r.kind, en: r.en, zh: r.zh, chosen: r.chosen, sentence: r.sentence })
      .split("\n").filter((l) => l.indexOf("明白了") < 0).join("\n");
    session.results.push({
      cat: r.cat, score: ok ? 1 : 0, prompt: r.prompt, py: "", answer: r.answer,
      chosen: ok ? "" : r.chosen, speak: r.speak || r.en, explain,
    });
    updatePlayChrome();
    const f = $("#feedback");
    f.textContent = "已记录 ✓";
    f.className = "feedback";
    const gen = ++advanceGen;
    try { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); } catch (e) {}
    setTimeout(() => {
      if (gen !== advanceGen || !session) return;
      session.index++;
      renderQuestion();
    }, 550);
  }

  function markKnown(en) {
    updateProfile((p) => {
      const key = en.toLowerCase();
      p.progress = p.progress || {};
      p.progress[key] = p.progress[key] || { known: 0, seen: 0 };
      p.progress[key].known += 1;
      p.progress[key].seen += 1;
      p.progress[key].last = Date.now();
    });
  }
  function markSeen(en) {
    updateProfile((p) => {
      const key = en.toLowerCase();
      p.progress = p.progress || {};
      p.progress[key] = p.progress[key] || { known: 0, seen: 0 };
      p.progress[key].seen += 1;
      p.progress[key].last = Date.now();
    });
  }

  function renderFill(host, item) {
    const f = item.fill;
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "把正确的单词放进句子里～ " + (f.zh || "");
    host.appendChild(hint);
    const box = document.createElement("div");
    box.className = "sentence-box";
    const parts = String(f.template).split("____");
    box.appendChild(document.createTextNode(parts[0] || ""));
    const blank = document.createElement("span");
    blank.className = "blank";
    blank.textContent = "？";
    box.appendChild(blank);
    box.appendChild(document.createTextNode(parts[1] || ""));
    host.appendChild(box);
    const bank = document.createElement("div");
    bank.className = "word-bank";
    item.bankWords.forEach((en) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = en;
      b.addEventListener("click", () => {
        if (session.locked) {
          speak(en);
          return;
        }
        blank.textContent = en;
        const ok = en.toLowerCase() === answerKey(f);
        if (session.test) {
          $$(".word-bank button", host).forEach((x) => (x.disabled = true));
          b.classList.add("picked");
          testRecord(ok, {
            cat: "填空", kind: "fill", en: f.answer, zh: f.zh || findWordByEn(f.answer).zh,
            prompt: String(f.template).replace("____", "____"), answer: f.answer, chosen: en,
            sentence: fillCompletedSentence(f), speak: fillCompletedSentence(f),
          });
          return;
        }
        session.locked = true;
        session.answered++;
        $$(".word-bank button", host).forEach((x) => {
          x.disabled = true;
          if (x.textContent.toLowerCase() === answerKey(f)) x.classList.add("correct");
        });
        const full = fillCompletedSentence(f);
        if (ok) {
          b.classList.add("correct");
          session.correct++;
          $("#feedback").textContent = "填对啦！🌟";
          $("#feedback").className = "feedback good";
          markKnown(f.answer);
          updatePlayChrome();
          advanceAfterSpeech([f.answer, full]);
        } else {
          b.classList.add("wrong-soft");
          $("#feedback").textContent = "没关系，先看下面的小讲解～";
          $("#feedback").className = "feedback gentle";
          blank.textContent = f.answer;
          markSeen(f.answer);
          updatePlayChrome();
          const winfo = findWordByEn(f.answer);
          showExplain(
            {
              kind: "fill",
              en: f.answer,
              zh: f.zh || winfo.zh,
              chosen: en,
              sentence: full,
            },
            [f.answer, full]
          );
        }
      });
      bank.appendChild(b);
    });
    host.appendChild(bank);
  }

  function scrambleLetters(word, hard) {
    const letters = word.toLowerCase().split("");
    let pool = letters.slice();
    if (hard) {
      const decoys = "abcdefghijklmnopqrstuvwxyz".split("").filter((c) => !letters.includes(c));
      pool = pool.concat(shuffle(decoys).slice(0, Math.min(3, Math.max(2, 8 - letters.length))));
    }
    let scrambled = shuffle(pool);
    let guard = 0;
    while (scrambled.slice(0, letters.length).join("") === letters.join("") && guard++ < 10) {
      scrambled = shuffle(pool);
    }
    return scrambled;
  }

  function renderSpell(host, item) {
    const w = item.word;
    const letters = w.en.toLowerCase().replace(/[^a-z]/gi, "");
    if (!letters) {
      session.index++;
      renderQuestion();
      return;
    }
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent =
      "根据中文，把字母排成正确单词～" +
      (item.hard ? "（进阶：多了干扰字母）" : "（基础：只有单词字母）");
    host.appendChild(hint);
    const zh = document.createElement("div");
    zh.className = "prompt-zh";
    zh.textContent = w.zh;
    host.appendChild(zh);

    const slots = document.createElement("div");
    slots.className = "letter-slots";
    const built = [];
    for (let i = 0; i < letters.length; i++) {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "letter-slot";
      slot.addEventListener("click", () => {
        if (session.locked || !built.length) return;
        const last = built.pop();
        last.btn.classList.remove("used");
        last.btn.disabled = false;
        redrawSlots();
      });
      slots.appendChild(slot);
    }
    host.appendChild(slots);

    const bank = document.createElement("div");
    bank.className = "letter-bank";
    scrambleLetters(letters, !!item.hard).forEach((ch, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "letter-chip";
      b.textContent = ch;
      b.dataset.idx = String(idx);
      b.addEventListener("click", () => {
        if (session.locked || b.classList.contains("used")) return;
        if (built.length >= letters.length) return;
        speak(ch);
        built.push({ ch, btn: b });
        b.classList.add("used");
        b.disabled = true;
        redrawSlots();
        if (built.length === letters.length) checkSpell();
      });
      bank.appendChild(b);
    });
    host.appendChild(bank);

    const actions = document.createElement("div");
    actions.className = "action-row";
    const hear = document.createElement("button");
    hear.type = "button";
    hear.className = "secondary";
    hear.textContent = "听一听提示";
    hear.addEventListener("click", () => speak(w.en));
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "ghost";
    clear.textContent = "清空";
    clear.addEventListener("click", () => {
      if (session.locked) return;
      built.splice(0, built.length);
      $$(".letter-chip", bank).forEach((x) => {
        x.classList.remove("used");
        x.disabled = false;
      });
      redrawSlots();
    });
    if (!session.test) actions.appendChild(hear); // no hints in 综合测试
    actions.appendChild(clear);
    host.appendChild(actions);

    function redrawSlots() {
      $$(".letter-slot", slots).forEach((slot, i) => {
        slot.textContent = built[i] ? built[i].ch : "";
      });
    }
    function checkSpell() {
      if (session.locked) return;
      const guess = built.map((x) => x.ch).join("");
      if (session.test) {
        testRecord(guess === letters, { cat: "拼写", kind: "spell", en: w.en, zh: w.zh, prompt: w.zh, answer: w.en, chosen: guess });
        return;
      }
      session.locked = true;
      session.answered++;
      const ok = guess === letters;
      if (ok) {
        session.correct++;
        $("#feedback").textContent = "拼对啦！🎉";
        $("#feedback").className = "feedback good";
        markKnown(w.en);
        $$(".letter-slot", slots).forEach((s) => s.classList.add("correct"));
        updatePlayChrome();
        advanceAfterSpeech(w.en);
      } else {
        $("#feedback").textContent = "再练练～先看小讲解";
        $("#feedback").className = "feedback gentle";
        markSeen(w.en);
        $$(".letter-slot", slots).forEach((s, i) => {
          s.textContent = letters[i];
          s.classList.add("wrong-soft");
        });
        updatePlayChrome();
        showExplain(
          { kind: "spell", en: w.en, zh: w.zh, chosen: guess },
          w.en
        );
      }
    }
  }

  function renderDictation(host, item) {
    const w = item.word;
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "听写挑战：看中文，尽快写出英文！";
    host.appendChild(hint);
    const zh = document.createElement("div");
    zh.className = "prompt-zh";
    zh.textContent = w.zh;
    host.appendChild(zh);
    const hintRow = document.createElement("div");
    hintRow.className = "dictation-hint-row";
    const hear = document.createElement("button");
    hear.type = "button";
    hear.className = "speak";
    hear.textContent = "🔊 听发音";
    hear.addEventListener("click", () => speak(w.en));
    hintRow.appendChild(hear);
    host.appendChild(hintRow);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "dictation-input";
    input.autocomplete = "off";
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.spellcheck = false;
    input.placeholder = "在这里输入英文…";
    host.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "action-row";
    const submit = document.createElement("button");
    submit.type = "button";
    submit.textContent = "确认";
    submit.addEventListener("click", check);
    actions.appendChild(submit);
    host.appendChild(actions);

    setTimeout(() => input.focus(), 50);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        check();
      }
    });

    function check() {
      if (session.locked) return;
      const guess = normGuess(input.value);
      if (!guess) {
        $("#feedback").textContent = "先写一写再确认哦～";
        $("#feedback").className = "feedback gentle";
        return;
      }
      if (session.test) {
        input.disabled = true;
        submit.disabled = true;
        testRecord(guess === normGuess(w.en), { cat: "听写", kind: "dictation", en: w.en, zh: w.zh, prompt: w.zh, answer: w.en, chosen: guess });
        return;
      }
      session.locked = true;
      session.answered++;
      input.disabled = true;
      submit.disabled = true;
      const ok = guess === normGuess(w.en);
      if (ok) {
        session.correct++;
        $("#feedback").textContent = "写对啦！✨";
        $("#feedback").className = "feedback good";
        markKnown(w.en);
        updatePlayChrome();
        advanceAfterSpeech(w.en);
      } else {
        $("#feedback").textContent = "没关系，先看小讲解～";
        $("#feedback").className = "feedback gentle";
        input.value = w.en;
        markSeen(w.en);
        updatePlayChrome();
        showExplain(
          { kind: "dictation", en: w.en, zh: w.zh, chosen: guess },
          w.en
        );
      }
    }
  }

  function getTests() {
    return profileStore().tests || [];
  }

  function finishTest() {
    stopTimer();
    session.endedAt = Date.now();
    $("#btn-pause-test").hidden = true;
    const TK = window.__testKit;
    const res = session.results;
    const n = res.length;
    const pts = res.reduce((a, r) => a + r.score, 0);
    const score = n ? Math.round((pts / n) * 100) : 0;
    const stars = TK.starsFromScore(score, n);
    const elapsedSec = Math.round(activeElapsedMs() / 1000);
    const cats = ["英→中", "中→英", "填空", "拼写", "听写"].map((name) => {
      const rs = res.filter((r) => r.cat === name);
      return { name, got: rs.reduce((a, r) => a + r.score, 0), total: rs.length };
    });
    const unitsLabel = TK.unitsLabel(unitsByIds(session.unitIds).map((u) => u.title), DATA.units.length);
    const prev = getTests()[0];
    const rec = { at: Date.now(), units: session.unitIds.slice(), unitsLabel, score, stars, elapsedSec, answered: n, total: session.items.length, cats };
    updateProfile((p) => { p.tests = [rec].concat(p.tests || []).slice(0, 50); });
    pushHistory({ at: Date.now(), mode: "test", units: session.unitIds.slice(), correct: session.correct, total: n, score, stars, elapsedSec, timed: true, mins: Math.max(1, Math.round(elapsedSec / 60)) });
    showScreen("test-report");
    window.scrollTo(0, 0);
    TK.renderReport({
      title: "英文综合测试完成！",
      score, stars, elapsedSec, answered: n, total: session.items.length, cats, items: res, unitsLabel,
      prevScore: prev ? prev.score : null,
      renderStarRow,
      speak: (t) => speak(t),
      onAgain: () => startSession("test"),
      onHome: () => { showScreen("home"); renderHome(); },
    });
  }

  function quitTestFlow() {
    if (!session) return;
    if (session.answered > 0) {
      session.items = session.items.slice(0, Math.max(session.answered, 1));
      advanceGen++;
      finishTest();
    } else {
      stopTimer();
      $("#btn-pause-test").hidden = true;
      session = null;
      showScreen("home");
      renderHome();
    }
  }

  function finishSession() {
    if (session && session.test) return finishTest();
    stopTimer();
    session.endedAt = Date.now();
    const elapsedSec = Math.max(0, Math.round((session.endedAt - session.startedAt) / 1000));
    const result = computeStars({
      correct: session.correct,
      total: session.items.length,
      elapsedSec: session.timed ? elapsedSec : null,
      timed: session.timed,
    });

    let isPB = false;
    if (session.mode === "dictation") {
      const rec = {
        stars: result.stars,
        accuracy: result.accuracy,
        elapsedSec,
        correct: session.correct,
        total: session.items.length,
        units: session.unitIds.slice(),
        at: Date.now(),
      };
      const prev = getDictationBest();
      if (betterDictationRecord(rec, prev)) {
        isPB = true;
        updateProfile((p) => {
          p.bests = p.bests || {};
          p.bests.dictation = rec;
        });
      }
    }

    pushHistory({
      at: Date.now(),
      mode: session.mode,
      units: session.unitIds.slice(),
      correct: session.correct,
      total: session.items.length,
      score: result.accuracy,
      stars: result.stars,
      elapsedSec: session.timed ? elapsedSec : null,
      timed: session.timed,
      mins: Math.max(1, Math.round(elapsedSec / 60)),
    });

    showScreen("score");
    const celebrate = result.stars >= 5;
    renderStarRow($("#score-stars"), result.stars, celebrate);
    $("#score-cele").textContent = celebrate ? "🎊" : result.stars >= 3 ? "🎉" : "🌱";
    $("#score-title").textContent = session.mode === "dictation" ? "听写完成！" : "本关完成！";
    $("#score-big").textContent = result.accuracy + "%";

    let detail = `答对 ${session.correct} / ${session.items.length} · ${starsLabel(result.stars)}`;
    if (session.timed) detail += ` · 用时 ${formatMMSS(elapsedSec)}`;
    $("#score-detail").textContent = detail;

    const pbEl = $("#score-pb");
    if (session.mode === "dictation" && isPB) {
      pbEl.hidden = false;
      pbEl.textContent = "🏆 新纪录！";
    } else {
      pbEl.hidden = true;
    }

    const best = getDictationBest();
    const bestLine = $("#score-best");
    if (session.mode === "dictation" && best) {
      bestLine.textContent =
        `最好成绩：${starsLabel(best.stars)} · ${best.accuracy}% · ${formatMMSS(best.elapsedSec)}`;
    } else {
      bestLine.textContent = "";
    }

    $("#score-msg").textContent =
      result.stars >= 5
        ? "满分闪电侠！又快又准！"
        : result.stars >= 3.5
          ? "非常棒，继续保持！"
          : result.stars >= 2
            ? "很不错，明天还能更好～"
            : "今天也努力了，再练一轮会更熟！";
  }


  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function examplesForWord(unit, w) {
    const en = w.en;
    const out = [];
    const re = new RegExp("\\b" + escapeRegExp(en) + "\\b", "i");
    const low = en.toLowerCase();
    (unit.sentences || []).forEach((s) => {
      if (out.length >= 2) return;
      if (re.test(s.en) || s.en.toLowerCase().includes(low)) {
        out.push({ en: s.en, zh: s.zh });
      }
    });
    (unit.fillIns || []).forEach((f) => {
      if (out.length >= 2) return;
      const ans = String(f.answer || "");
      if (ans.toLowerCase() === low || re.test(ans)) {
        const sentence = String(f.template || "").replace("____", ans);
        if (sentence) out.push({ en: sentence, zh: f.zh || w.zh });
      }
    });
    if (!out.length) {
      out.push({
        en: '"' + en + '" means "' + w.zh + '".',
        zh: "「" + en + "」的意思是「" + w.zh + "」。",
      });
    }
    if (out.length < 2) {
      out.push({
        en: "I can use the word \"" + en + "\".",
        zh: "我会用单词「" + en + "」（" + w.zh + "）。",
      });
    }
    return out.slice(0, 2);
  }

  function renderWordsPicker() {
    const grid = $("#words-unit-grid");
    if (!grid || !DATA) return;
    grid.innerHTML = "";
    DATA.units.forEach((u) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "unit-chip" + (wordsUnitIds.includes(u.id) ? " selected" : "");
      btn.innerHTML =
        "<strong>" +
        escapeHtml(u.title) +
        "</strong><br><span class=\"small muted\">" +
        escapeHtml(u.titleZh || "") +
        " · " +
        u.words.length +
        " 词</span>";
      btn.addEventListener("click", () => {
        if (wordsUnitIds.includes(u.id)) {
          wordsUnitIds = wordsUnitIds.filter((x) => x !== u.id);
        } else {
          wordsUnitIds = wordsUnitIds.concat(u.id);
        }
        renderWordsPicker();
      });
      grid.appendChild(btn);
    });
    const n = wordsUnitIds.length;
    const wc = allWordsFrom(wordsUnitIds).length;
    $("#words-selected-count").textContent = n
      ? "已选 " + n + " 个单元 · " + wc + " 个单词"
      : "请先点选单元";
    $("#btn-words-enter").disabled = n === 0;
  }

  function renderWords() {
    if (!DATA) return;
    const pickCard = $("#words-pick-card");
    const listCard = $("#words-list-card");
    if (wordsPhase !== "list" || !wordsUnitIds.length) {
      wordsPhase = "pick";
      if (pickCard) pickCard.hidden = false;
      if (listCard) listCard.hidden = true;
      renderWordsPicker();
      return;
    }
    if (pickCard) pickCard.hidden = true;
    if (listCard) listCard.hidden = false;
    const host = $("#word-list");
    host.innerHTML = "";
    const progress = getProgress();
    const units = DATA.units.filter((u) => wordsUnitIds.includes(u.id));
    $("#words-list-hint").textContent =
      "范围：" +
      units.map((u) => u.title).join("、") +
      " · 点英文听发音并展开中文/例句";
    units.forEach((u) => {
      const h = document.createElement("h3");
      h.className = "unit-section-title";
      h.textContent = u.title + " · " + (u.titleZh || "") + "（" + u.words.length + "）";
      host.appendChild(h);
      u.words.forEach((w) => {
        const row = document.createElement("div");
        row.className = "word-row";
        const top = document.createElement("div");
        top.className = "word-row-top";
        top.style.display = "flex";
        top.style.justifyContent = "space-between";
        top.style.alignItems = "center";
        top.style.gap = "10px";
        const en = document.createElement("div");
        en.className = "en-only";
        en.textContent = w.en;
        if (w.note) {
          const note = document.createElement("div");
          note.className = "small muted";
          note.textContent = "also: " + w.note;
          en.appendChild(note);
        }
        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.alignItems = "center";
        right.style.gap = "6px";
        const chev = document.createElement("span");
        chev.className = "muted small";
        chev.textContent = "▸";
        right.appendChild(chev);
        const st = progress[w.en.toLowerCase()];
        if (st && st.known > 0) {
          const star = document.createElement("span");
          star.className = "small";
          star.textContent = "★".repeat(Math.min(3, st.known));
          right.appendChild(star);
        }
        top.appendChild(en);
        top.appendChild(right);
        const expand = document.createElement("div");
        expand.className = "expand";
        const zhLine = document.createElement("div");
        zhLine.className = "zh-line";
        zhLine.textContent = w.zh;
        expand.appendChild(zhLine);
        examplesForWord(u, w).forEach((ex) => {
          const box = document.createElement("div");
          box.className = "ex";
          const ee = document.createElement("div");
          ee.className = "ex-en";
          ee.textContent = ex.en;
          const ez = document.createElement("div");
          ez.className = "ex-zh";
          ez.textContent = ex.zh;
          box.appendChild(ee);
          box.appendChild(ez);
          expand.appendChild(box);
        });
        row.appendChild(top);
        row.appendChild(expand);
        row.addEventListener("click", () => {
          const open = row.classList.toggle("open");
          chev.textContent = open ? "▾" : "▸";
          speak(w.en);
        });
        host.appendChild(row);
      });
    });
  }


  function renderProgress() {
    const progress = getProgress();
    const all = DATA.units.flatMap((u) => u.words);
    const known = all.filter((w) => (progress[w.en.toLowerCase()] || {}).known > 0).length;
    $("#prog-known").textContent = String(known);
    $("#prog-total").textContent = String(all.length);
    const pct = all.length ? Math.round((known / all.length) * 100) : 0;
    $("#prog-bar").style.width = pct + "%";

    const bestBox = $("#dictation-best");
    const best = getDictationBest();
    if (best) {
      bestBox.classList.remove("muted");
      bestBox.innerHTML =
        `<strong>${starsLabel(best.stars)}</strong> · 正确率 ${best.accuracy}% · 用时 ${formatMMSS(best.elapsedSec)}` +
        `<div class="small muted" style="margin-top:4px">${new Date(best.at).toLocaleString("zh-CN", { hour12: false })}</div>`;
    } else {
      bestBox.classList.add("muted");
      bestBox.textContent = "还没有听写纪录，去挑战一次吧！";
    }

    const th = $("#en-test-history");
    if (th && window.__testKit) window.__testKit.renderHistory(th, getTests());

    const host = $("#history-list");
    host.innerHTML = "";
    const hist = getHistory();
    if (!hist.length) {
      host.innerHTML = '<p class="muted">还没有练习记录，去学几个单词吧！</p>';
      return;
    }
    const modeNames = {
      en2zh: "英→中",
      zh2en: "中→英",
      fill: "填空",
      spell: "拼写",
      dictation: "听写",
      guided: "闯关",
      test: "综合测试",
    };
    hist.slice(0, 20).forEach((h) => {
      const div = document.createElement("div");
      div.className = "history-item";
      const when = new Date(h.at).toLocaleString("zh-CN", { hour12: false });
      const unitTitles = DATA.units
        .filter((u) => (h.units || []).includes(u.id))
        .map((u) => u.title)
        .join("、");
      const modeLabel = modeNames[h.mode] || h.mode;
      let extra = `${h.correct}/${h.total} · ${h.score ?? h.accuracy}%`;
      if (h.stars != null) extra = `${starsLabel(h.stars)} · ` + extra;
      if (h.elapsedSec != null) extra += ` · ${formatMMSS(h.elapsedSec)}`;
      div.innerHTML =
        `<strong>${escapeHtml(when)}</strong> · ${escapeHtml(unitTitles || "单元")}<br>` +
        `<span class="small muted">${escapeHtml(modeLabel)} · ${escapeHtml(extra)}</span>` +
        `<div class="bar-mini"><span style="width:${h.score ?? h.accuracy ?? 0}%"></span></div>`;
      host.appendChild(div);
    });
  }

  function bindUI() {
    $("#btn-subject-chip").addEventListener("click", () => showSubjectPicker());
    $("#btn-subject-en").addEventListener("click", () => enterEnglish());
    $("#btn-subject-zh").addEventListener("click", () => enterChinese());
    $("#btn-profile-chip").addEventListener("click", () => {
      stopTimer();
      session = null;
      renderProfileSelect();
    });

    $$(".nav-tabs button").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.dataset.nav;
        if (id === "home") {
          showScreen("home");
          renderHome();
        } else if (id === "words") {
          showScreen("words");
          renderWords();
        } else if (id === "progress") {
          showScreen("progress");
          renderProgress();
        }
      });
    });

    
    $("#btn-words-select-all").addEventListener("click", () => {
      if (!DATA) return;
      wordsUnitIds = DATA.units.map((u) => u.id);
      renderWordsPicker();
    });
    $("#btn-words-select-none").addEventListener("click", () => {
      wordsUnitIds = [];
      renderWordsPicker();
    });
    $("#btn-words-enter").addEventListener("click", () => {
      if (!wordsUnitIds.length) return;
      wordsPhase = "list";
      renderWords();
    });
    $("#btn-words-back").addEventListener("click", () => {
      wordsPhase = "pick";
      renderWords();
    });

    $("#btn-select-all").addEventListener("click", () => {
      selectedUnitIds = DATA.units.map((u) => u.id);
      renderHome();
    });
    $("#btn-select-none").addEventListener("click", () => {
      selectedUnitIds = [];
      renderHome();
    });

    $$(".mode-btn[data-mode]").forEach((b) => {
      b.addEventListener("click", () => startSession(b.dataset.mode));
    });
    $("#btn-guided").addEventListener("click", () => startSession("guided"));
    $("#btn-start-modes").addEventListener("click", () => {
      $("#modes-card").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    $("#btn-explain-ok").addEventListener("click", () => {
      if (typeof explainContinue === "function") explainContinue();
    });

    $("#btn-advance-auto") && $("#btn-advance-auto").addEventListener("click", () => {
      setAdvanceMode("auto");
      syncAdvanceToggle();
    });
    $("#btn-advance-manual") && $("#btn-advance-manual").addEventListener("click", () => {
      setAdvanceMode("manual");
      syncAdvanceToggle();
    });
    if ($("#btn-next-q")) {
      $("#btn-next-q").addEventListener("click", () => {
        if (!session) return;
        advanceGen++;
        hideExplain();
        hideNextButton();
        try {
          if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
        } catch (e) {}
        session.index++;
        renderQuestion();
      });
    }

    $("#btn-pause-test").addEventListener("click", () => {
      if (!session || !session.test || session.pauseStart) return;
      session.pauseStart = Date.now();
      try { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); } catch (e) {}
      window.__testKit.pause({
        onResume: () => {
          if (!session || !session.pauseStart) return;
          session.pausedMs += Date.now() - session.pauseStart;
          session.pauseStart = null;
        },
        onQuit: () => quitTestFlow(),
      });
    });
    $("#btn-quit-play").addEventListener("click", () => {
      if (session && session.test) {
        if (window.__testKit.confirmQuit()) quitTestFlow();
        return;
      }
      if (session && session.answered > 0) finishSession();
      else {
        stopTimer();
        showScreen("home");
        renderHome();
      }
    });
    $("#btn-again").addEventListener("click", () => {
      startSession(session ? session.mode : "guided");
    });
    $("#btn-back-home").addEventListener("click", () => {
      showScreen("home");
      renderHome();
    });
    $("#btn-clear-progress").addEventListener("click", () => {
      const name = (PROFILE_DEFS.find((p) => p.id === activeProfileId) || {}).name || "当前";
      if (confirm(`确定清空「${name}」的进度、历史和听写纪录吗？（单词表不会删）`)) {
        updateProfile((p) => {
          p.progress = {};
          p.history = [];
          p.bests = { dictation: null };
          p.tests = [];
        });
        renderProgress();
      }
    });
  }

  // expose for quick tests
  window.__vocabKid = {
    computeStars,
    accuracyCap,
    speedShave,
    PROFILE_DEFS,
    // shared helpers for the 语文 module (hanzi.js)
    showScreen,
    renderStarRow,
    formatMMSS,
    starsLabel,
    shuffle,
    escapeHtml,
    updateProfile,
    profileStore,
    getAdvanceMode,
    showSubjectPicker,
    getActiveProfileId: () => activeProfileId,
    _session: () => session,
  };

  function boot() {
    bindUI();
    // Always show profile pick on launch (clear intentional choice)
    renderProfileSelect();
  }

  boot();
})();
