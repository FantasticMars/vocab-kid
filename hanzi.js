/* 语文 · 汉字学习模块（认字卡 / 读音 / 组词 / 选词填空 / 描红 / 默写 / 听写 / 错字复习）
 * Vanilla JS. Uses Hanzi Writer (lib/hanzi-writer.min.js, MIT) with vendored stroke data in data/hanzi/<char>.json
 */
(function () {
  "use strict";
  const V = window.__vocabKid;
  if (!V) return;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const shuffle = V.shuffle;
  const esc = V.escapeHtml;

  const SIZES = { cards: 10, sound: 10, zuci: 10, fill: 10, trace: 8, moxie: 8, tingxie: 6, review: 10, test: 12 };
  const MODE_NAMES = {
    cards: "认字卡", sound: "读音", zuci: "组词", fill: "选词填空",
    trace: "描红", moxie: "默写", tingxie: "听写挑战", review: "错字复习", test: "综合测试",
  };
  const WRITE_OK_MISTAKES = 3; // ≤3 wrong strokes in one char still counts as 写对
  const LENIENCY = 1.4;

  // common polyphones in the bank: speak the word (not the lone char) so TTS reads the right sound
  const POLY = "相挑落粘暴钻漂卷盛朝划壳抹差单度血占哦呆冒劲奏仅";
  // look-alike / same-sound groups for distractors (组词)
  const LOOKALIKE = ("睛晴精清情 晶品 珠株蛛 壮状装 洁结 润闰 狂枉 功攻 互五 碰砰 径经轻劲 枫风 霜箱 挑桃跳 深探 凌陵 乱刮 杏查 枚玫 邮油抽轴由 挤济 挖控 板版 准谁 暴瀑 钻站 爬把 漂飘票 晒洒 恒桓 萌明 妥受 培陪赔 厘里 葫胡 芦户 错借惜 普谱 宫官 肯背 冒帽 式试 怜冷铃玲 旅族 另别 及极级 卷券拳 救球求 尾毛 胃谓 管馆官 刚钢岗 咬胶较 申神伸 介价界 绍招昭 宗综棕 旨指 占站点 乏之泛眨 搭塔答 亲新 祖组租粗 披被波坡破 摇遥谣 停亭 翠萃 蓝篮监 静净睁争 悄俏消梢 吞天 捕铺浦蒲 英映 盛成城 耍要 使便史 脸险检验 欠吹 朝潮嘲 钓钩约药 察擦 拢龙笼 喜嘉 景京影 优忧扰 淡谈炎 浅线钱 底低抵 岩炭岸 鹿麓 划刘 布市 茂戊 密蜜秘 厚原 料科 滨宾 帆凡 灰炭 跟根很 渔鱼 壳亮 院完 亚严业 透秀 除余徐 踩采菜 封树对 挡当档 坛云 显湿 苍仓抢 材村财 软砍 捉促足 返反饭 望忘旺 断继 楚础 至到室 孤狐瓜 饮饭 亦赤变 欲浴谷 抹末沫 宜宣谊 妙秒抄沙 奏泰凑 琴今 柔揉 感咸减 充统流 威咸 器哭 汇江 鸣鸟呜 塘糖唐 虾蚂 昆混棍 仅汉 序字 荣营 枯姑古 姿资次 态太 刺刻 梨利 部陪倍 奥澳 螺累 螃旁 蟹解 鲤理 鲫即 鲨沙 司同词 登灯凳瞪 跌失铁 皆阶 弃奔 持特待诗 击出 念今 差着羞 考老烤 均匀钧 退腿 努怒奴 单里 留溜 度渡席 奋备夺 棒捧奉 伤场汤扬 陆陈 血皿 取趣 盘般船 匆勿忽 医区 迅讯 速束 眶框筐 呆保果 睹堵赌都 坡波 呼乎 读续卖 热熟 闹市 轰车 笛苗 罚罪 黄寅 急隐 庭廷挺 未末味 寒赛 斜余 朗郎浪 粘沾 印即 案安 展屋 列例烈 规现观 则侧测 凉晾谅 爽夹 菊鞠 频顿 勾句沟 等待寺 瞅秋揪").split(" ");
  const RADICAL_TIP = {
    "土": "和泥土有关", "氵": "和水有关", "扌": "和手的动作有关", "口": "和嘴巴有关", "目": "和眼睛有关",
    "木": "和树木有关", "艹": "和花草有关", "讠": "和说话有关", "亻": "和人有关", "忄": "和心情有关",
    "钅": "和金属有关", "⻊": "和脚有关", "日": "和太阳、时间有关", "月": "和身体或月亮有关", "灬": "和火有关",
    "火": "和火有关", "雨": "和天气有关", "虫": "和小虫子有关", "鱼": "和鱼有关", "宀": "和房屋有关",
    "纟": "和丝线有关", "辶": "和走路有关", "冫": "和冰、冷有关", "米": "和米粮有关", "石": "和石头有关",
    "心": "和心里想的有关", "刂": "和刀有关", "犭": "和动物有关", "门": "和门有关", "王": "和玉石有关",
    "禾": "和庄稼有关", "女": "和女性有关", "⺮": "和竹子有关", "礻": "和祝福有关", "页": "和头有关",
    "力": "和力气有关", "车": "和车有关", "山": "和山有关", "广": "和房屋有关", "风": "和风有关",
    "饣": "和吃的东西有关", "欠": "和张口有关", "皿": "和器皿有关", "穴": "和洞有关", "厂": "和山崖、房屋有关",
    "阝": "在左边和山坡有关，在右边和城邑有关", "巾": "和布有关", "攵": "和动作有关", "尸": "和房屋有关",
  };

  let ZH = null; // loaded data
  let PROFILE = null;
  let CHARS = []; // flattened char entries
  let CHAR_MAP = {};
  let selUnits = [];
  let listUnits = [];
  let listPhase = "pick";
  let S = null; // session
  let timer = null;
  let advGen = 0;
  let activeWriter = null;
  const charDataCache = {};

  // ---------- storage ----------
  function zstore() {
    const p = V.profileStore();
    const h = p.hanzi || {};
    return {
      progress: h.progress || {},
      history: h.history || [],
      bests: h.bests || {},
      settings: h.settings || {},
    };
  }
  function zupdate(fn) {
    V.updateProfile((p) => {
      p.hanzi = p.hanzi || {};
      p.hanzi.progress = p.hanzi.progress || {};
      p.hanzi.history = p.hanzi.history || [];
      p.hanzi.bests = p.hanzi.bests || {};
      p.hanzi.settings = p.hanzi.settings || {};
      fn(p.hanzi);
    });
  }
  function mark(ch, ok, extra) {
    zupdate((h) => {
      const r = h.progress[ch] || { seen: 0, right: 0, wrong: 0 };
      r.seen++;
      if (ok) r.right++;
      else r.wrong++;
      r.last = Date.now();
      r.lastOk = !!ok;
      if (extra && extra.mistakes != null) r.lastMistakes = extra.mistakes;
      h.progress[ch] = r;
    });
  }
  function need(ch) {
    // higher = needs more practice
    const r = zstore().progress[ch];
    if (!r) return 1;
    return r.wrong * 2 - r.right + (r.lastOk === false ? 2 : 0);
  }

  // ---------- TTS (zh-CN) ----------
  function speakZh(texts) {
    const list = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || "").trim()).filter(Boolean);
    return new Promise((resolve) => {
      if (!list.length || typeof speechSynthesis === "undefined") return resolve();
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try {
        speechSynthesis.cancel();
        const voices = speechSynthesis.getVoices();
        const zh =
          voices.find((v) => /^zh(-|_)CN/i.test(v.lang)) ||
          voices.find((v) => /^zh/i.test(v.lang) && !/HK|TW/i.test(v.lang)) ||
          voices.find((v) => /^zh/i.test(v.lang));
        const hard = setTimeout(finish, 30000);
        let i = 0;
        const next = () => {
          if (i >= list.length) { clearTimeout(hard); setTimeout(finish, 50); return; }
          const u = new SpeechSynthesisUtterance(list[i++]);
          u.lang = "zh-CN";
          u.rate = 0.8;
          if (zh) u.voice = zh;
          u.onend = next;
          u.onerror = next;
          speechSynthesis.speak(u);
        };
        setTimeout(next, 80);
      } catch (e) {
        finish();
      }
    });
  }
  function mainWord(c) {
    const w = (c.words || []).find((x) => x.w.length >= 2);
    return w ? w.w : "";
  }
  function charSpeech(c) {
    const w = mainWord(c);
    if (!w) return [c.char];
    if (POLY.includes(c.char)) return [w + "的" + c.char, w];
    return [c.char + "，" + w + "的" + c.char];
  }

  // ---------- pinyin helpers ----------
  const TONED = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", "ü": "ǖǘǚǜ" };
  function toneInfo(py) {
    for (let i = 0; i < py.length; i++) {
      for (const base in TONED) {
        const k = TONED[base].indexOf(py[i]);
        if (k >= 0) return { idx: i, base, tone: k + 1 };
      }
    }
    return null;
  }
  function toneVariants(py) {
    const t = toneInfo(py);
    if (!t) return [];
    const out = [];
    for (let k = 0; k < 4; k++) {
      if (k + 1 === t.tone) continue;
      out.push(py.slice(0, t.idx) + TONED[t.base][k] + py.slice(t.idx + 1));
    }
    return out;
  }
  function stripTone(py) {
    let s = py;
    for (const base in TONED) for (const ch of TONED[base]) s = s.split(ch).join(base);
    return s;
  }
  const TONE_NAME = ["轻声", "第一声", "第二声", "第三声", "第四声"];

  // ---------- data ----------
  function loadData(def) {
    if (ZH && PROFILE && PROFILE.id === def.id) return Promise.resolve(ZH);
    return fetch(def.hanziUrl)
      .then((r) => { if (!r.ok) throw new Error("hanzi load failed"); return r.json(); })
      .then((d) => {
        ZH = d;
        PROFILE = def;
        CHARS = [];
        CHAR_MAP = {};
        d.units.forEach((u) => u.lessons.forEach((l) => l.chars.forEach((c) => {
          const e = Object.assign({}, c, { unitId: u.id, unitTitle: u.title, lessonId: l.id, lessonTitle: l.title });
          CHARS.push(e);
          CHAR_MAP[c.char] = e;
        })));
        const saved = zstore().settings.units;
        selUnits = Array.isArray(saved) && saved.length ? saved.filter((id) => d.units.some((u) => u.id === id)) : [d.units[0].id];
        listUnits = [];
        listPhase = "pick";
        return d;
      });
  }
  function charsIn(ids) { return CHARS.filter((c) => ids.includes(c.unitId)); }
  function tingxieIn(ids) {
    const out = [];
    ZH.units.filter((u) => ids.includes(u.id)).forEach((u) => u.lessons.forEach((l) =>
      l.tingxie.forEach((t) => out.push(Object.assign({}, t, { unitId: u.id, lessonTitle: l.title })))));
    return out;
  }
  function unitStats(u) {
    let c = 0, t = 0;
    u.lessons.forEach((l) => { c += l.chars.length; t += l.tingxie.length; });
    return { c, t };
  }
  function pickChars(pool, n) {
    // prioritise chars that need practice, keep variety
    const scored = shuffle(pool).map((c) => ({ c, s: need(c.char) + Math.random() * 1.5 }));
    scored.sort((a, b) => b.s - a.s);
    return shuffle(scored.slice(0, n).map((x) => x.c));
  }

  // ---------- Hanzi Writer ----------
  function charDataLoader(ch, onLoad, onError) {
    if (charDataCache[ch]) return onLoad(charDataCache[ch]);
    fetch("data/hanzi/" + encodeURIComponent(ch) + ".json")
      .then((r) => { if (!r.ok) throw new Error("no stroke data " + ch); return r.json(); })
      .then((j) => { charDataCache[ch] = j; onLoad(j); })
      .catch((e) => { console.warn(e); if (onError) onError(e); });
  }
  function gridSvg(size) {
    const m = size / 2;
    return (
      `<svg class="tzg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">` +
      `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="#fffdf8" stroke="#e17055" stroke-width="2" rx="6"/>` +
      `<line x1="0" y1="${m}" x2="${size}" y2="${m}" stroke="#f5b7a5" stroke-dasharray="6 6"/>` +
      `<line x1="${m}" y1="0" x2="${m}" y2="${size}" stroke="#f5b7a5" stroke-dasharray="6 6"/>` +
      `<line x1="0" y1="0" x2="${size}" y2="${size}" stroke="#fbd9cf" stroke-dasharray="4 8"/>` +
      `<line x1="${size}" y1="0" x2="0" y2="${size}" stroke="#fbd9cf" stroke-dasharray="4 8"/></svg>`
    );
  }
  function makePad(host, size) {
    const wrap = document.createElement("div");
    wrap.className = "zh-pad";
    wrap.style.width = size + "px";
    wrap.style.height = size + "px";
    wrap.innerHTML = gridSvg(size);
    const target = document.createElement("div");
    target.className = "zh-pad-target";
    wrap.appendChild(target);
    // keep the page from scrolling / zooming while a finger writes (iPad Safari)
    const stop = (e) => { if (e.cancelable) e.preventDefault(); };
    wrap.addEventListener("touchstart", stop, { passive: false });
    wrap.addEventListener("touchmove", stop, { passive: false });
    wrap.addEventListener("gesturestart", stop, { passive: false });
    host.appendChild(wrap);
    return target;
  }
  function padSize() {
    const w = Math.min(window.innerWidth || 360, 720) - 90;
    return Math.max(220, Math.min(320, w));
  }
  function createWriter(target, ch, size, opts) {
    if (typeof HanziWriter === "undefined") return null;
    return HanziWriter.create(target, ch, Object.assign({
      width: size,
      height: size,
      padding: Math.round(size * 0.06),
      showCharacter: false,
      showOutline: true,
      strokeColor: "#2d3436",
      outlineColor: "#e3e6ea",
      highlightColor: "#00b894",
      drawingColor: "#6c5ce7",
      drawingWidth: Math.max(8, Math.round(size / 22)),
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 220,
      charDataLoader,
    }, opts || {}));
  }
  function destroyWriter() {
    activeWriter = null;
  }

  // ---------- navigation ----------
  function setNav(id) {
    $$("#zh-nav button").forEach((b) => b.classList.toggle("active", b.dataset.zhnav === id));
  }
  function show(id, nav) {
    V.showScreen(id);
    if (nav) setNav(nav);
    window.scrollTo(0, 0);
  }
  function status(t) { $("#app-status").textContent = t; }

  function enter(def) {
    status("加载字库…");
    loadData(def)
      .then(() => {
        goHome();
      })
      .catch((e) => {
        console.error(e);
        status("字库加载失败，请检查网络后重试");
      });
  }
  function leave() {
    stopTimer();
    advGen++;
    S = null;
    closeModal();
  }
  function goHome() {
    leave();
    show("zh-home", "home");
    renderHome();
    const n = CHARS.length;
    const t = ZH.units.reduce((a, u) => a + unitStats(u).t, 0);
    status(`${PROFILE.name} · 语文 · ${ZH.units.length} 单元 · ${n} 生字 · ${t} 听写词`);
  }

  function renderUnitGrid(host, ids, onToggle) {
    host.innerHTML = "";
    ZH.units.forEach((u) => {
      const st = unitStats(u);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "unit-chip" + (ids.includes(u.id) ? " selected" : "");
      const lessons = u.lessons.map((l) => l.title.replace(/^第\d+课\*?\s*/, "").replace(/（.*?）/, "")).join("、");
      b.innerHTML =
        `<span><strong>${esc(u.title)}</strong><br><span class="small muted">${esc(lessons)}</span></span>` +
        `<span class="count">${st.c} 字</span>`;
      b.addEventListener("click", () => onToggle(u.id));
      host.appendChild(b);
    });
  }
  function renderHome() {
    renderUnitGrid($("#zh-unit-grid"), selUnits, (id) => {
      selUnits = selUnits.includes(id) ? selUnits.filter((x) => x !== id) : selUnits.concat(id);
      zupdate((h) => { h.settings.units = selUnits.slice(); });
      renderHome();
    });
    const cs = charsIn(selUnits).length;
    const ts = tingxieIn(selUnits).length;
    $("#zh-selected-count").textContent = selUnits.length
      ? `已选 ${selUnits.length} 个单元 · ${cs} 个生字 · ${ts} 个听写词`
      : "请先点选一个或多个单元";
    $$("#zh-modes-card .mode-btn").forEach((b) => {
      b.disabled = !selUnits.length && b.dataset.zhmode !== "review";
    });
    const weak = weakChars().length;
    $("#zh-review-desc").textContent = weak
      ? `有 ${weak} 个字要多练，优先复习它们`
      : "还没有错字～会从没练过的字里挑";
  }
  function weakChars() {
    const pr = zstore().progress;
    return CHARS.filter((c) => pr[c.char] && (pr[c.char].wrong > pr[c.char].right || pr[c.char].lastOk === false))
      .sort((a, b) => need(b.char) - need(a.char));
  }

  // ---------- session ----------
  function startMode(mode) {
    const pool = charsIn(selUnits);
    let items = [];
    const n = SIZES[mode];
    if (mode === "cards") items = pickChars(pool, n).map((c) => ({ type: "card", c }));
    else if (mode === "sound") items = pickChars(pool, n).map((c, i) => ({ type: i % 2 ? "hear" : "py", c }));
    else if (mode === "zuci") items = pickChars(pool.filter((c) => mainWord(c)), n).map((c) => ({ type: "zuci", c }));
    else if (mode === "fill") items = pickChars(pool.filter((c) => c.sentenceWord), n).map((c) => ({ type: "fill", c }));
    else if (mode === "trace") items = pickChars(pool, n).map((c) => ({ type: "write", c, outline: true }));
    else if (mode === "moxie") items = pickChars(pool, n).map((c) => ({ type: "write", c, outline: false }));
    else if (mode === "tingxie") {
      const words = tingxieIn(selUnits);
      // prefer words containing chars that need practice
      const scored = shuffle(words).map((t) => ({
        t, s: Array.from(t.w).reduce((a, ch) => a + (CHAR_MAP[ch] ? Math.max(0, need(ch)) : 0), 0) + Math.random() * 2,
      }));
      scored.sort((a, b) => b.s - a.s);
      const seen = {};
      items = scored.filter((x) => (seen[x.t.w] ? false : (seen[x.t.w] = true))).slice(0, n).map((x) => ({ type: "tingxie", t: x.t }));
      items = shuffle(items);
    } else if (mode === "review") {
      let rp = weakChars();
      const base = selUnits.length ? pool : CHARS;
      if (rp.length < n) {
        const extra = pickChars(base.filter((c) => !rp.includes(c)), n - rp.length);
        rp = rp.slice(0, n).concat(extra);
      }
      const kinds = ["py", "zuci", "write"];
      items = rp.slice(0, n).map((c, i) => {
        const k = kinds[i % 3];
        if (k === "zuci" && !mainWord(c)) return { type: "py", c };
        return k === "write" ? { type: "write", c, outline: false } : { type: k, c };
      });
      items = shuffle(items);
    }
    else if (mode === "test") {
      // 综合测试: 读音 + 组词 + 选词填空 + 默写 + 听写. Writing is strict: NO outline, NO hint flashes, NO 描红.
      const cs = pickChars(pool, 30);
      const used = new Set();
      const take = (k, ok) => {
        const out = [];
        for (const c of cs) { if (out.length >= k) break; if (!used.has(c.char) && ok(c)) { used.add(c.char); out.push(c); } }
        return out;
      };
      items = []
        .concat(take(2, () => true).map((c, i) => ({ type: i ? "hear" : "py", c })))
        .concat(take(2, (c) => mainWord(c)).map((c) => ({ type: "zuci", c })))
        .concat(take(2, (c) => c.sentenceWord).map((c) => ({ type: "fill", c })))
        .concat(take(4, () => true).map((c) => ({ type: "write", c, outline: false, strict: true })));
      const tw = shuffle(tingxieIn(selUnits)).filter((t) => t.w.length <= 3).slice(0, 2);
      items = shuffle(items).concat(tw.map((t) => ({ type: "tingxie", t, strict: true })));
    }
    if (!items.length) return;
    S = {
      mode, items, index: 0, correct: 0, answered: 0, mistakes: 0, writtenChars: 0,
      startedAt: Date.now(), timed: mode === "tingxie" || mode === "test", wrongChars: [], unitIds: selUnits.slice(),
    };
    show("zh-play");
    startTimer();
    renderQ();
  }

  function startTimer() {
    stopTimer();
    const badge = $("#zh-play-timer");
    if (!S || !S.timed) { badge.hidden = true; return; }
    badge.hidden = false;
    const tick = () => { if (S) badge.textContent = V.formatMMSS((Date.now() - S.startedAt) / 1000); };
    tick();
    timer = setInterval(tick, 250);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function chrome() {
    const total = S.items.length;
    const i = S.index;
    $("#zh-play-progress").style.width = Math.round((i / total) * 100) + "%";
    $("#zh-play-count").textContent = `${Math.min(i + 1, total)} / ${total}`;
    $("#zh-play-score").textContent = `★ ${S.correct}`;
    $("#zh-play-mode").textContent = MODE_NAMES[S.mode] || "";
  }
  function fb(text, kind) {
    const f = $("#zh-feedback");
    f.textContent = text || "";
    f.className = "feedback" + (kind ? " " + kind : "");
  }
  function hideNext() { $("#zh-next-row").hidden = true; }
  function hideExplain() { $("#zh-explain-card").hidden = true; }

  function renderQ() {
    advGen++;
    hideExplain();
    hideNext();
    fb("");
    destroyWriter();
    if (!S) return;
    S.locked = false;
    chrome();
    const host = $("#zh-play-area");
    host.innerHTML = "";
    if (S.index >= S.items.length) return finish();
    const it = S.items[S.index];
    if (it.type === "card") renderCard(host, it);
    else if (it.type === "py") renderPy(host, it);
    else if (it.type === "hear") renderHear(host, it);
    else if (it.type === "zuci") renderZuci(host, it);
    else if (it.type === "fill") renderFill(host, it);
    else if (it.type === "write") renderWrite(host, it);
    else if (it.type === "tingxie") renderTingxie(host, it);
  }
  function goNext() {
    if (!S) return;
    advGen++;
    hideNext();
    hideExplain();
    try { speechSynthesis.cancel(); } catch (e) {}
    S.index++;
    renderQ();
  }
  /** after a correct answer: speak, then auto-advance (or show 下一题 in Manual mode) */
  function advanceAfter(texts, minMs) {
    const gen = ++advGen;
    const manual = V.getAdvanceMode() === "manual";
    const t0 = Date.now();
    const est = (Array.isArray(texts) ? texts : [texts]).join("").length * 260 + 500;
    const wait = Math.max(minMs || 900, est);
    speakZh(texts).then(() => {
      if (gen !== advGen) return;
      if (manual) { $("#zh-next-row").hidden = false; return; }
      const left = Math.max(300, wait - (Date.now() - t0));
      setTimeout(() => { if (gen === advGen) goNext(); }, Math.min(left, 1500));
    });
    if (!manual) setTimeout(() => { if (gen === advGen) goNext(); }, wait + 2500); // safety if TTS never ends
    else setTimeout(() => { if (gen === advGen) $("#zh-next-row").hidden = false; }, 600);
  }

  // ----- 小讲解 -----
  function explainText(c, kind, chosen) {
    const lines = [];
    lines.push(`正确：「${c.char}」${c.pinyin}` + (c.radical ? `（部首「${c.radical}」，${c.strokes} 画，${c.structure || ""}结构）` : ""));
    const words = (c.words || []).map((w) => w.w).filter((w) => w.length > 1);
    if (words.length) lines.push("组词：" + words.join("、"));
    if (kind === "py" && chosen) {
      const a = toneInfo(chosen), b = toneInfo(c.pinyin);
      if (stripTone(chosen) === stripTone(c.pinyin) && a && b) {
        lines.push(`你选的「${chosen}」是${TONE_NAME[a.tone]}，「${c.char}」读${TONE_NAME[b.tone]}。小声读三遍：${c.pinyin}、${c.pinyin}、${c.pinyin}。`);
      } else {
        lines.push(`你选的「${chosen}」不是它的读音。想一想「${mainWord(c) || c.char}」怎么读，就记住啦。`);
      }
    } else if ((kind === "hear" || kind === "zuci") && chosen) {
      const o = CHAR_MAP[chosen];
      const tip = RADICAL_TIP[c.radical];
      if (o && o.radical && o.radical !== c.radical) {
        lines.push(`你选的「${chosen}」读 ${o.pinyin}，部首是「${o.radical}」；「${c.char}」的部首是「${c.radical}」${tip ? "，" + tip : ""}。看清部首就不会混啦。`);
      } else if (o) {
        lines.push(`你选的「${chosen}」读 ${o.pinyin}，和「${c.char}」不一样。记住：${mainWord(c)}的「${c.char}」。`);
      } else {
        lines.push(`「${chosen}」和「${c.char}」长得像或读音像。记住：${mainWord(c)}的「${c.char}」` + (tip ? `，部首「${c.radical}」${tip}。` : "。"));
      }
    } else if (kind === "fill" && chosen) {
      lines.push(`你选的是「${chosen}」。这句话要用「${c.sentenceWord}」：${c.sentence}`);
    } else if (kind === "write") {
      lines.push(`这个字有几笔不太顺，左边看一遍笔顺动画，跟着手指空写一遍就好。`);
    }
    if (c.sentence && kind !== "fill") lines.push("例句：" + c.sentence);
    return lines.join("\n");
  }
  function showExplain(c, kind, chosen, speakTexts) {
    advGen++;
    hideNext();
    $("#zh-explain-body").textContent = explainText(c, kind, chosen);
    const wbox = $("#zh-explain-writer");
    wbox.innerHTML = "";
    const size = 120;
    const t = makePad(wbox, size);
    const w = createWriter(t, c.char, size, { showCharacter: true, showOutline: true, strokeAnimationSpeed: 1.2 });
    if (w) setTimeout(() => { try { w.animateCharacter(); } catch (e) {} }, 300);
    wbox.onclick = () => { if (w) w.animateCharacter(); };
    $("#zh-explain-card").hidden = false;
    speakZh(speakTexts || charSpeech(c));
    $("#zh-explain-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ----- UI bits -----
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function speakBtn(label, texts) {
    const b = el("button", "speak", label || "🔊");
    b.type = "button";
    b.addEventListener("click", (e) => { e.stopPropagation(); speakZh(typeof texts === "function" ? texts() : texts); });
    return b;
  }
  function choiceGrid(host, options, onPick, cls) {
    const g = el("div", "choices zh-choices" + (cls ? " " + cls : ""));
    options.forEach((o) => {
      const b = el("button", "choice", o);
      b.type = "button";
      b.addEventListener("click", () => onPick(b, o, g));
      g.appendChild(b);
    });
    host.appendChild(g);
    return g;
  }
  function lockChoices(g, correct) {
    $$(".choice", g).forEach((b) => {
      b.disabled = true;
      if (b.textContent === correct) b.classList.add("correct");
    });
  }
  function answer(ok, c, kind, chosen, btn, g, correctLabel, speakOk) {
    if (S.locked) return;
    S.locked = true;
    S.answered++;
    lockChoices(g, correctLabel);
    mark(c.char, ok);
    if (ok) {
      S.correct++;
      btn.classList.add("correct");
      fb(["太棒了！✨", "答对啦！🌟", "真厉害！👍"][S.index % 3], "good");
      chrome();
      advanceAfter(speakOk || charSpeech(c));
    } else {
      btn.classList.add("wrong-soft");
      S.wrongChars.push(c.char);
      fb("没关系～看看小讲解", "gentle");
      chrome();
      showExplain(c, kind, chosen);
    }
  }

  // ----- 认字卡 -----
  function buildCharCard(host, c, opts) {
    const card = el("div", "zh-charcard");
    const left = el("div", "zh-cc-left");
    const size = (opts && opts.size) || Math.min(240, padSize());
    const target = makePad(left, size);
    const w = createWriter(target, c.char, size, { showCharacter: true, showOutline: true });
    const btns = el("div", "zh-cc-btns");
    const hear = speakBtn("🔊 读一读", () => charSpeech(c));
    const anim = el("button", "secondary", "▶ 笔顺");
    anim.type = "button";
    anim.addEventListener("click", () => { if (w) w.animateCharacter(); });
    btns.appendChild(hear);
    btns.appendChild(anim);
    left.appendChild(btns);
    const right = el("div", "zh-cc-right");
    right.appendChild(el("div", "zh-cc-py", c.pinyin));
    right.appendChild(el("div", "zh-cc-meta muted small",
      [c.radical ? "部首 " + c.radical : "", c.strokes ? c.strokes + " 画" : "", c.structure ? c.structure + "结构" : ""].filter(Boolean).join(" · ")));
    const ws = el("div", "zh-cc-words");
    (c.words || []).forEach((wd) => {
      const b = el("button", "zh-word-chip");
      b.type = "button";
      b.innerHTML = `<span class="py">${esc(wd.py)}</span><span class="w">${esc(wd.w)}</span>`;
      b.addEventListener("click", () => speakZh(wd.w));
      ws.appendChild(b);
    });
    right.appendChild(ws);
    if (c.sentence) {
      const s = el("div", "zh-cc-sent");
      const sw = c.sentenceWord || c.char;
      const parts = c.sentence.split(sw);
      s.innerHTML = "📖 " + parts.map(esc).join(`<b>${esc(sw)}</b>`);
      s.addEventListener("click", () => speakZh(c.sentence));
      right.appendChild(s);
    }
    right.appendChild(el("div", "muted small", c.lessonTitle || ""));
    card.appendChild(left);
    card.appendChild(right);
    host.appendChild(card);
    return w;
  }
  function renderCard(host, it) {
    const c = it.c;
    host.appendChild(el("p", "hint", "认一认：点「读一读」听读音，点「笔顺」看怎么写"));
    const w = buildCharCard(host, c);
    speakZh(charSpeech(c));
    if (w) setTimeout(() => { try { w.animateCharacter(); } catch (e) {} }, 900);
    const row = el("div", "action-row");
    const no = el("button", "secondary", "🤔 还不太熟");
    const yes = el("button", "", "✅ 我认识了");
    no.type = yes.type = "button";
    const done = (ok) => {
      if (S.locked) return;
      S.locked = true;
      S.answered++;
      if (ok) S.correct++;
      else S.wrongChars.push(c.char);
      // self-report: only counts as "wrong" softly so it shows up in 错字复习
      zupdate((h) => {
        const r = h.progress[c.char] || { seen: 0, right: 0, wrong: 0 };
        r.seen++;
        if (!ok) { r.wrong++; r.lastOk = false; }
        r.last = Date.now();
        h.progress[c.char] = r;
      });
      chrome();
      goNext();
    };
    no.addEventListener("click", () => done(false));
    yes.addEventListener("click", () => done(true));
    row.appendChild(no);
    row.appendChild(yes);
    host.appendChild(row);
  }

  // ----- 读音 -----
  function renderPy(host, it) {
    const c = it.c;
    host.appendChild(el("p", "hint", "这个字读什么？选正确的拼音"));
    const p = el("div", "zh-big-char", c.char);
    host.appendChild(p);
    const wHint = mainWord(c);
    if (wHint) host.appendChild(el("p", "hint small", "提示：" + wHint));
    let opts = shuffle(toneVariants(c.pinyin)).slice(0, 2);
    const others = shuffle(charsIn(S.unitIds.length ? S.unitIds : ZH.units.map((u) => u.id)).map((x) => x.pinyin))
      .filter((py) => py !== c.pinyin && !opts.includes(py));
    const sameInitial = others.filter((py) => py[0] === c.pinyin[0]);
    while (opts.length < 3 && (sameInitial.length || others.length)) {
      const x = sameInitial.length ? sameInitial.shift() : others.shift();
      if (!opts.includes(x) && x !== c.pinyin) opts.push(x);
    }
    opts = shuffle([c.pinyin].concat(opts.slice(0, 3)));
    choiceGrid(host, opts, (b, o, g) => answer(o === c.pinyin, c, "py", o, b, g, c.pinyin), "py-choices");
  }
  function charDistractors(c, n) {
    const out = [];
    const add = (x) => { if (x && x !== c.char && !out.includes(x) && out.length < n) out.push(x); };
    // same sound (ignoring tone) in bank
    shuffle(CHARS.filter((x) => stripTone(x.pinyin) === stripTone(c.pinyin))).forEach((x) => add(x.char));
    // look-alikes
    const la = LOOKALIKE.filter((g) => g.includes(c.char)).join("").split("");
    shuffle(la).slice(0, 2).forEach(add);
    // same radical in bank
    shuffle(CHARS.filter((x) => x.radical === c.radical)).slice(0, 2).forEach((x) => add(x.char));
    // same unit
    shuffle(CHARS.filter((x) => x.unitId === c.unitId)).forEach((x) => add(x.char));
    return out.slice(0, n);
  }
  function renderHear(host, it) {
    const c = it.c;
    host.appendChild(el("p", "hint", "听一听，选出听到的字"));
    const row = el("div", "dictation-hint-row");
    row.appendChild(speakBtn("🔊 再听一遍", () => charSpeech(c)));
    host.appendChild(row);
    host.appendChild(el("div", "zh-py-hint", c.pinyin));
    const opts = shuffle([c.char].concat(charDistractors(c, 3)));
    choiceGrid(host, opts, (b, o, g) => answer(o === c.char, c, "hear", o, b, g, c.char), "char-choices");
    speakZh(charSpeech(c));
  }

  // ----- 组词 -----
  function renderZuci(host, it) {
    const c = it.c;
    const words = (c.words || []).filter((w) => w.w.length >= 2);
    const wd = words[Math.floor(Math.random() * words.length)];
    const k = wd.w.indexOf(c.char);
    host.appendChild(el("p", "hint", "选一个字，组成正确的词语"));
    const box = el("div", "zh-word-q");
    const syl = wd.py.split(" ");
    Array.from(wd.w).forEach((ch, i) => {
      const cell = el("div", "zh-word-cell" + (i === k ? " blank" : ""));
      cell.appendChild(el("div", "py", syl[i] || ""));
      cell.appendChild(el("div", "ch", i === k ? "？" : ch));
      box.appendChild(cell);
    });
    host.appendChild(box);
    const allWords = new Set(CHARS.flatMap((x) => (x.words || []).map((w) => w.w)));
    const ds = charDistractors(c, 8).filter((d) => !allWords.has(wd.w.slice(0, k) + d + wd.w.slice(k + 1))).slice(0, 3);
    const opts = shuffle([c.char].concat(ds));
    choiceGrid(host, opts, (b, o, g) => {
      const blank = $(".zh-word-cell.blank .ch", box);
      if (blank) blank.textContent = c.char;
      answer(o === c.char, c, "zuci", o, b, g, c.char, [wd.w]);
    }, "char-choices");
  }

  // ----- 选词填空 -----
  function renderFill(host, it) {
    const c = it.c;
    const sw = c.sentenceWord;
    host.appendChild(el("p", "hint", "选一个词语填进句子里"));
    const box = el("div", "sentence-box zh-sentence");
    const parts = c.sentence.split(sw);
    box.appendChild(document.createTextNode(parts[0]));
    const blank = el("span", "blank", "？");
    box.appendChild(blank);
    box.appendChild(document.createTextNode(parts.slice(1).join(sw)));
    host.appendChild(box);
    const pool = charsIn(S.unitIds);
    let cands = shuffle(pool.filter((x) => x.char !== c.char).map((x) => x.sentenceWord).filter(Boolean))
      .filter((w) => !w.includes(c.char) && w !== sw && !c.sentence.includes(w));
    const sameLen = cands.filter((w) => w.length === sw.length);
    const ds = [];
    sameLen.concat(cands).forEach((w) => { if (ds.length < 3 && !ds.includes(w)) ds.push(w); });
    const opts = shuffle([sw].concat(ds));
    const g = el("div", "word-bank zh-bank");
    opts.forEach((o) => {
      const b = el("button", "choice", o);
      b.type = "button";
      b.addEventListener("click", () => {
        if (S.locked) { speakZh(o); return; }
        blank.textContent = sw;
        answer(o === sw, c, "fill", o, b, g, sw, [c.sentence]);
      });
      g.appendChild(b);
    });
    host.appendChild(g);
  }

  // ----- 描红 / 默写 -----
  function renderWrite(host, it) {
    const c = it.c;
    const trace = !!it.outline && !it.strict;
    const strict = !!it.strict;
    host.appendChild(el("p", "hint", trace ? "描红：照着灰色的字，一笔一笔写" : strict ? "测试 · 默写：看拼音和词语，自己写出这个字" : "默写：看拼音和词语，自己写出这个字"));
    const q = el("div", "zh-write-q");
    const wd = mainWord(c);
    const py = el("div", "zh-cc-py", c.pinyin);
    q.appendChild(py);
    if (wd) q.appendChild(el("div", "zh-write-word", trace ? wd : wd.split(c.char).join("（ ）")));
    const hear = speakBtn("🔊", () => charSpeech(c));
    q.appendChild(hear);
    host.appendChild(q);
    const size = padSize();
    const target = makePad(host, size);
    let mistakesNow = 0;
    let helped = false;
    const w = createWriter(target, c.char, size, { showOutline: trace, showCharacter: false });
    activeWriter = w;
    const tools = el("div", "action-row zh-write-tools");
    const bAnim = el("button", "secondary", "▶ 看笔顺");
    const bHint = el("button", "secondary", "💡 提示一下");
    const bRedo = el("button", "ghost", "↺ 重写");
    [bAnim, bHint, bRedo].forEach((b) => (b.type = "button"));
    if (!strict) tools.appendChild(bAnim);
    if (!trace && !strict) tools.appendChild(bHint);
    tools.appendChild(bRedo);
    host.appendChild(tools);
    const gen = advGen;
    const startQuiz = () => {
      if (!w) return;
      w.quiz({
        leniency: LENIENCY,
        showHintAfterMisses: strict ? false : trace ? 2 : 3,
        markStrokeCorrectAfterMisses: 5,
        highlightOnComplete: true,
        onMistake: () => {
          mistakesNow++;
          if (mistakesNow === 3 && !trace && !strict) fb("慢慢来～格子里会闪出提示笔画", "gentle");
        },
        onCorrectStroke: () => { if (!S || gen !== advGen) return; fb(""); },
        onComplete: (sum) => {
          if (!S || gen !== advGen) return;
          const m = sum && sum.totalMistakes != null ? sum.totalMistakes : mistakesNow;
          writeDone(c, m, helped, trace);
        },
      });
    };
    bAnim.addEventListener("click", () => {
      if (!w) return;
      helped = helped || !trace;
      w.cancelQuiz();
      w.showCharacter();
      w.animateCharacter({ onComplete: () => { if (gen !== advGen) return; w.hideCharacter(); startQuiz(); } });
    });
    bHint.addEventListener("click", () => {
      if (!w) return;
      helped = true;
      w.showOutline();
      setTimeout(() => { if (gen === advGen && !S.locked) w.hideOutline(); }, 1600);
    });
    bRedo.addEventListener("click", () => { if (!w || S.locked) return; mistakesNow = 0; startQuiz(); });
    speakZh(charSpeech(c));
    startQuiz();
    if (!w) fb("写字板加载失败", "gentle");
  }
  function writeDone(c, mistakes, helped, trace) {
    if (S.locked) return;
    S.locked = true;
    S.answered++;
    S.mistakes += mistakes;
    S.writtenChars++;
    const ok = mistakes <= WRITE_OK_MISTAKES && !(helped && !trace && mistakes > 1);
    mark(c.char, ok, { mistakes });
    if (ok) {
      S.correct++;
      fb(mistakes === 0 ? "一笔不错，太漂亮了！🌟" : `写好啦！有 ${mistakes} 笔需要再注意一下 👍`, "good");
      chrome();
      advanceAfter(mainWord(c) ? [mainWord(c)] : [c.char], 1400);
    } else {
      S.wrongChars.push(c.char);
      fb(`写完啦！这个字有 ${mistakes} 笔不太顺，再看看笔顺～`, "gentle");
      chrome();
      showExplain(c, "write");
    }
  }

  // ----- 听写 -----
  function tingxieSpeech(t) { return [t.w, t.w]; }
  function renderTingxie(host, it) {
    const t = it.t;
    const strict = !!it.strict;
    const chars = Array.from(t.w);
    const given = t.given || [];
    host.appendChild(el("p", "hint", "听写：听词语，把每个字写在格子里"));
    const top = el("div", "dictation-hint-row");
    top.appendChild(speakBtn("🔊 再听一遍", () => tingxieSpeech(t)));
    const pyBtn = el("button", "secondary", "看拼音");
    pyBtn.type = "button";
    top.appendChild(pyBtn);
    host.appendChild(top);
    const pyLine = el("div", "zh-py-hint", t.py);
    pyLine.style.visibility = "hidden";
    pyBtn.addEventListener("click", () => { pyLine.style.visibility = "visible"; });
    host.appendChild(pyLine);
    const row = el("div", "zh-tx-row");
    const cells = chars.map((ch, i) => {
      const cell = el("div", "zh-tx-cell" + (given.includes(i) ? " given" : ""), given.includes(i) ? ch : "");
      row.appendChild(cell);
      return cell;
    });
    host.appendChild(row);
    const padHost = el("div", "zh-tx-pad");
    host.appendChild(padHost);
    const tools = el("div", "action-row zh-write-tools");
    const bHint = el("button", "secondary", "💡 提示一下");
    const bSkip = el("button", "ghost", "这个字不会，跳过");
    bHint.type = bSkip.type = "button";
    if (!strict) tools.appendChild(bHint);
    tools.appendChild(bSkip);
    host.appendChild(tools);
    const results = [];
    const gen = advGen;
    let pos = -1;
    let w = null;
    const size = padSize();
    const nextChar = () => {
      pos++;
      while (pos < chars.length && given.includes(pos)) pos++;
      cells.forEach((cl, i) => cl.classList.toggle("current", i === pos));
      if (pos >= chars.length) return wordDone();
      padHost.innerHTML = "";
      const target = makePad(padHost, size);
      const ch = chars[pos];
      let mist = 0;
      w = createWriter(target, ch, size, { showOutline: false });
      activeWriter = w;
      w.quiz({
        leniency: LENIENCY,
        showHintAfterMisses: strict ? false : 3,
        markStrokeCorrectAfterMisses: 5,
        onMistake: () => { mist++; },
        onComplete: (sum) => {
          if (!S || gen !== advGen) return;
          const m = sum && sum.totalMistakes != null ? sum.totalMistakes : mist;
          results.push({ ch, mistakes: m, skipped: false });
          const cl = cells[pos];
          cl.textContent = ch;
          cl.classList.add(m <= WRITE_OK_MISTAKES ? "ok" : "soft");
          setTimeout(() => { if (gen === advGen) nextChar(); }, 450);
        },
      });
    };
    bHint.addEventListener("click", () => {
      if (!w) return;
      w.showOutline();
      results.hinted = (results.hinted || 0) + 1;
      setTimeout(() => { if (gen === advGen && w) w.hideOutline(); }, 1600);
    });
    bSkip.addEventListener("click", () => {
      if (!w || pos >= chars.length) return;
      const ch = chars[pos];
      try { w.cancelQuiz(); } catch (e) {}
      results.push({ ch, mistakes: 9, skipped: true });
      cells[pos].textContent = ch;
      cells[pos].classList.add("soft");
      nextChar();
    });
    function wordDone() {
      if (S.locked) return;
      S.locked = true;
      S.answered++;
      padHost.innerHTML = "";
      tools.hidden = true;
      pyLine.style.visibility = "visible";
      const bad = results.filter((r) => r.skipped || r.mistakes > WRITE_OK_MISTAKES);
      const m = results.reduce((a, r) => a + (r.skipped ? 0 : r.mistakes), 0);
      S.mistakes += m;
      S.writtenChars += results.length;
      results.forEach((r) => { if (CHAR_MAP[r.ch]) mark(r.ch, !(r.skipped || r.mistakes > WRITE_OK_MISTAKES), { mistakes: r.mistakes }); });
      if (!bad.length) {
        S.correct++;
        fb(m === 0 ? `「${t.w}」全对，一笔不错！🌟` : `「${t.w}」写好啦！👍`, "good");
        chrome();
        advanceAfter([t.w], 1400);
      } else {
        bad.forEach((r) => S.wrongChars.push(r.ch));
        const r0 = bad[0];
        const c = CHAR_MAP[r0.ch] || { char: r0.ch, pinyin: t.py.split(" ")[chars.indexOf(r0.ch)] || "", words: [{ w: t.w, py: t.py }], sentence: "" };
        fb(`「${t.w}」写完啦～「${bad.map((r) => r.ch).join("")}」要再练练`, "gentle");
        chrome();
        showExplain(c, "write", null, [t.w]);
      }
    }
    speakZh(tingxieSpeech(t));
    nextChar();
  }

  // ---------- finish ----------
  function finish() {
    stopTimer();
    const endedAt = Date.now();
    const elapsedSec = Math.max(0, Math.round((endedAt - S.startedAt) / 1000));
    const total = S.items.length;
    let result;
    if (S.mode === "cards") {
      result = { stars: 5, accuracy: Math.round((S.correct / Math.max(1, total)) * 100) };
    } else {
      const acc = Math.round((S.correct / Math.max(1, total)) * 100);
      let stars = V.accuracyCap(acc);
      if (S.timed) {
        const spc = elapsedSec / Math.max(1, S.writtenChars);
        const shave = spc <= 15 ? 0 : spc <= 25 ? 0.5 : spc <= 40 ? 1 : 1.5;
        stars = Math.max(S.correct > 0 ? 1 : 0.5, stars - shave);
      }
      stars = Math.max(0, Math.min(5, Math.round(stars * 2) / 2));
      result = { stars, accuracy: acc };
    }
    let isPB = false;
    if (S.mode === "tingxie" || S.mode === "test") {
      const bkey = S.mode;
      const rec = { stars: result.stars, accuracy: result.accuracy, elapsedSec, correct: S.correct, total, mistakes: S.mistakes, units: S.unitIds.slice(), at: Date.now() };
      const prev = zstore().bests[bkey];
      const better = !prev || rec.stars > prev.stars || (rec.stars === prev.stars && (rec.mistakes < (prev.mistakes || 0) || (rec.mistakes === prev.mistakes && rec.elapsedSec < prev.elapsedSec)));
      if (better) { isPB = true; zupdate((h) => { h.bests[bkey] = rec; }); }
    }
    zupdate((h) => {
      h.history = [{ at: Date.now(), mode: S.mode, units: S.unitIds.slice(), correct: S.correct, total, stars: result.stars, accuracy: result.accuracy, elapsedSec: S.timed ? elapsedSec : null, mistakes: S.mistakes }].concat(h.history).slice(0, 50);
    });
    show("zh-score");
    V.renderStarRow($("#zh-score-stars"), result.stars, result.stars >= 5);
    $("#zh-score-cele").textContent = result.stars >= 5 ? "🎊" : result.stars >= 3 ? "🎉" : "🌱";
    $("#zh-score-title").textContent = S.mode === "tingxie" ? "听写完成！" : S.mode === "test" ? "综合测试完成！" : S.mode === "cards" ? "认字卡学完啦！" : "本关完成！";
    $("#zh-score-big").textContent = S.mode === "cards" ? `${S.correct} / ${total}` : result.accuracy + "%";
    let detail = S.mode === "cards" ? `认识了 ${S.correct} 个字 · ${V.starsLabel(result.stars)}` : `答对 ${S.correct} / ${total} · ${V.starsLabel(result.stars)}`;
    if (S.writtenChars) detail += ` · 写了 ${S.writtenChars} 个字`;
    if (S.timed) detail += ` · 用时 ${V.formatMMSS(elapsedSec)}`;
    $("#zh-score-detail").textContent = detail;
    $("#zh-score-pb").hidden = !isPB;
    const best = zstore().bests[S.mode];
    $("#zh-score-best").textContent = (S.mode === "tingxie" || S.mode === "test") && best ? `最好成绩：${V.starsLabel(best.stars)} · ${best.accuracy}% · ${V.formatMMSS(best.elapsedSec)}` : "";
    const rv = $("#zh-score-review");
    rv.innerHTML = "";
    const uniq = Array.from(new Set(S.wrongChars));
    if (uniq.length) {
      rv.appendChild(el("div", "muted small", "这些字已放进「错字复习」，点一下看看："));
      const row = el("div", "zh-weak-row");
      uniq.forEach((ch) => {
        const b = el("button", "zh-char-tile small-tile", ch);
        b.type = "button";
        b.addEventListener("click", () => { if (CHAR_MAP[ch]) openModal(CHAR_MAP[ch]); });
        row.appendChild(b);
      });
      rv.appendChild(row);
    }
    $("#zh-score-msg").textContent =
      result.stars >= 5 ? "满分！又准又漂亮！" : result.stars >= 3.5 ? "非常棒，继续保持！" : result.stars >= 2 ? "很不错，明天还能更好～" : "今天也努力了，再练一轮会更熟！";
    S.done = true;
  }

  // ---------- 生字表 ----------
  function renderList() {
    const pick = $("#zh-list-pick"), card = $("#zh-list-card");
    if (listPhase !== "list" || !listUnits.length) {
      listPhase = "pick";
      pick.hidden = false;
      card.hidden = true;
      renderUnitGrid($("#zh-list-unit-grid"), listUnits, (id) => {
        listUnits = listUnits.includes(id) ? listUnits.filter((x) => x !== id) : listUnits.concat(id);
        renderList();
      });
      $("#zh-list-count").textContent = listUnits.length ? `已选 ${listUnits.length} 个单元 · ${charsIn(listUnits).length} 个生字` : "请先点选单元";
      $("#zh-list-enter").disabled = !listUnits.length;
      return;
    }
    pick.hidden = true;
    card.hidden = false;
    const body = $("#zh-list-body");
    body.innerHTML = "";
    const pr = zstore().progress;
    const units = ZH.units.filter((u) => listUnits.includes(u.id));
    $("#zh-list-hint").textContent = "范围：" + units.map((u) => u.title).join("、") + " · 点字看卡片，点词语听读音";
    units.forEach((u) => {
      body.appendChild(el("h3", "unit-section-title", u.title));
      u.lessons.forEach((l) => {
        if (!l.chars.length && !l.tingxie.length) return;
        body.appendChild(el("div", "zh-lesson-title", l.title));
        if (l.chars.length) {
          const grid = el("div", "zh-char-grid");
          l.chars.forEach((c0) => {
            const c = CHAR_MAP[c0.char];
            const b = el("button", "zh-char-tile");
            b.type = "button";
            const r = pr[c.char];
            const badge = r ? (r.lastOk === false || r.wrong > r.right ? "🔁" : r.right ? "★" : "") : "";
            b.innerHTML = `<span class="py">${esc(c.pinyin)}</span><span class="ch">${esc(c.char)}</span>${badge ? `<span class="badge">${badge}</span>` : ""}`;
            b.addEventListener("click", () => openModal(c));
            grid.appendChild(b);
          });
          body.appendChild(grid);
        }
        if (l.tingxie.length) {
          const tx = el("details", "zh-tx-list");
          tx.appendChild(el("summary", "", `听写词语（${l.tingxie.length}）`));
          const wrap = el("div", "zh-tx-words");
          l.tingxie.forEach((t) => {
            const b = el("button", "zh-word-chip");
            b.type = "button";
            b.innerHTML = `<span class="py">${esc(t.py)}</span><span class="w">${esc(t.w)}</span>`;
            b.addEventListener("click", () => speakZh(t.w));
            wrap.appendChild(b);
          });
          tx.appendChild(wrap);
          body.appendChild(tx);
        }
      });
    });
  }
  function openModal(c) {
    const m = $("#zh-modal");
    const body = $("#zh-modal-body");
    body.innerHTML = "";
    m.hidden = false;
    const w = buildCharCard(body, c, { size: Math.min(220, padSize()) });
    speakZh(charSpeech(c));
    if (w) setTimeout(() => { try { w.animateCharacter(); } catch (e) {} }, 700);
  }
  function closeModal() {
    const m = $("#zh-modal");
    if (m) m.hidden = true;
    const b = $("#zh-modal-body");
    if (b) b.innerHTML = "";
  }

  // ---------- 进度 ----------
  function renderProgress() {
    const pr = zstore().progress;
    const known = CHARS.filter((c) => pr[c.char] && pr[c.char].right > 0 && pr[c.char].right >= pr[c.char].wrong).length;
    $("#zh-prog-known").textContent = String(known);
    $("#zh-prog-total").textContent = String(CHARS.length);
    $("#zh-prog-bar").style.width = Math.round((known / Math.max(1, CHARS.length)) * 100) + "%";
    const weak = weakChars();
    const wl = $("#zh-weak-list");
    wl.innerHTML = "";
    if (!weak.length) { wl.classList.add("muted"); wl.textContent = "还没有要多练的字，真棒！"; }
    else {
      wl.classList.remove("muted");
      const row = el("div", "zh-weak-row");
      weak.slice(0, 40).forEach((c) => {
        const b = el("button", "zh-char-tile small-tile", c.char);
        b.type = "button";
        b.addEventListener("click", () => openModal(c));
        row.appendChild(b);
      });
      wl.appendChild(row);
    }
    const best = zstore().bests.tingxie;
    const bb = $("#zh-tingxie-best");
    if (best) {
      bb.classList.remove("muted");
      bb.innerHTML = `<strong>${V.starsLabel(best.stars)}</strong> · 正确率 ${best.accuracy}% · 用时 ${V.formatMMSS(best.elapsedSec)}` +
        `<div class="small muted" style="margin-top:4px">${esc(new Date(best.at).toLocaleString("zh-CN", { hour12: false }))}</div>`;
    } else { bb.classList.add("muted"); bb.textContent = "还没有听写纪录，去挑战一次吧！"; }
    const tb = zstore().bests.test;
    if (tb) {
      const d = el("div", "small", `综合测试最好：${V.starsLabel(tb.stars)} · 正确率 ${tb.accuracy}% · 用时 ${V.formatMMSS(tb.elapsedSec)}`);
      d.style.marginTop = "6px";
      bb.appendChild(d);
    }
    const host = $("#zh-history-list");
    host.innerHTML = "";
    const hist = zstore().history;
    if (!hist.length) { host.innerHTML = '<p class="muted">还没有练习记录，去学几个字吧！</p>'; return; }
    hist.slice(0, 20).forEach((h) => {
      const d = el("div", "history-item");
      const when = new Date(h.at).toLocaleString("zh-CN", { hour12: false });
      const ut = ZH.units.filter((u) => (h.units || []).includes(u.id)).map((u) => u.title).join("、") || "复习";
      let extra = `${V.starsLabel(h.stars)} · ${h.correct}/${h.total}`;
      if (h.elapsedSec != null) extra += ` · ${V.formatMMSS(h.elapsedSec)}`;
      d.innerHTML = `<strong>${esc(when)}</strong> · ${esc(ut)}<br><span class="small muted">${esc(MODE_NAMES[h.mode] || h.mode)} · ${esc(extra)}</span>` +
        `<div class="bar-mini"><span style="width:${h.accuracy || 0}%"></span></div>`;
      host.appendChild(d);
    });
  }

  // ---------- bind ----------
  function bind() {
    $$("#zh-nav button").forEach((b) => b.addEventListener("click", () => {
      if (!ZH) return;
      const id = b.dataset.zhnav;
      if (id === "home") goHome();
      else if (id === "list") { leave(); show("zh-list", "list"); renderList(); }
      else if (id === "progress") { leave(); show("zh-progress", "progress"); renderProgress(); }
    }));
    $("#zh-select-all").addEventListener("click", () => { selUnits = ZH.units.map((u) => u.id); zupdate((h) => { h.settings.units = selUnits.slice(); }); renderHome(); });
    $("#zh-select-none").addEventListener("click", () => { selUnits = []; zupdate((h) => { h.settings.units = []; }); renderHome(); });
    $$("#zh-modes-card .mode-btn").forEach((b) => b.addEventListener("click", () => startMode(b.dataset.zhmode)));
    $("#zh-explain-ok").addEventListener("click", () => { hideExplain(); goNext(); });
    $("#zh-next-q").addEventListener("click", goNext);
    $("#zh-quit").addEventListener("click", () => {
      if (S && S.answered > 0) { S.items = S.items.slice(0, S.answered); advGen++; finish(); }
      else goHome();
    });
    $("#zh-again").addEventListener("click", () => { const m = S ? S.mode : "cards"; startMode(m); });
    $("#zh-back-home").addEventListener("click", goHome);
    $("#zh-list-all").addEventListener("click", () => { listUnits = ZH.units.map((u) => u.id); renderList(); });
    $("#zh-list-none").addEventListener("click", () => { listUnits = []; renderList(); });
    $("#zh-list-enter").addEventListener("click", () => { if (listUnits.length) { listPhase = "list"; renderList(); } });
    $("#zh-list-back").addEventListener("click", () => { listPhase = "pick"; renderList(); });
    $("#zh-modal-close").addEventListener("click", closeModal);
    $("#zh-modal").addEventListener("click", (e) => { if (e.target.id === "zh-modal") closeModal(); });
    $("#zh-clear-progress").addEventListener("click", () => {
      if (confirm("确定清空语文的进度、错字和听写纪录吗？（英文进度不受影响）")) {
        zupdate((h) => { h.progress = {}; h.history = []; h.bests = {}; });
        renderProgress();
      }
    });
  }
  bind();

  window.__zh = {
    enter,
    leave,
    // test hooks
    _state: () => ({ S, selUnits, chars: CHARS.length }),
    _writer: () => activeWriter,
    _goto: (i) => { if (S) { S.index = i; renderQ(); } },
    _toneVariants: toneVariants,
  };
})();
