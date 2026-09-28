/* 综合测试 shared kit: stars, report screen, history + trend, pause overlay (used by app.js + hanzi.js) */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function mmss(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function fmtNum(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
  function starsFromScore(score, answered) {
    if (!answered) return 0;
    if (score >= 95) return 5;
    if (score >= 85) return 4.5;
    if (score >= 75) return 4;
    if (score >= 65) return 3.5;
    if (score >= 55) return 3;
    if (score >= 45) return 2.5;
    if (score >= 30) return 2;
    if (score >= 15) return 1.5;
    return 1;
  }
  /** cats: [{name, got, total}] */
  function summary(cats) {
    const c = cats.filter((x) => x.total > 0).map((x) => Object.assign({ pct: x.got / x.total }, x));
    if (!c.length) return "";
    const best = c.slice().sort((a, b) => b.pct - a.pct)[0];
    const weak = c.slice().sort((a, b) => a.pct - b.pct)[0];
    if (weak.pct >= 0.999) return "每一类都答得很好，太厉害了！🌟";
    if (best.pct - weak.pct < 0.01) return `各类题都差不多，继续加油，下次会更稳！`;
    return `最拿手：${best.name}（${fmtNum(best.got)}/${best.total}）👍　下次可以多练练：${weak.name}，再练一练就更稳啦～`;
  }
  let pauseHandlers = null;
  function pause(h) {
    pauseHandlers = h;
    $("#test-pause").hidden = false;
  }
  function bindPause() {
    const el = $("#test-pause");
    if (!el) return;
    $("#test-pause-resume").addEventListener("click", () => {
      el.hidden = true;
      const h = pauseHandlers;
      pauseHandlers = null;
      if (h && h.onResume) h.onResume();
    });
    $("#test-pause-quit").addEventListener("click", () => {
      if (!confirm("确定结束测试吗？已经做完的题会算成绩。")) return;
      el.hidden = true;
      const h = pauseHandlers;
      pauseHandlers = null;
      if (h && h.onResume) h.onResume();
      if (h && h.onQuit) h.onQuit();
    });
  }
  function confirmQuit() {
    return confirm("确定结束测试吗？已经做完的题会算成绩。");
  }

  /**
   * opts: {title, score, stars, elapsedSec, answered, total, cats, items, unitsLabel, prevScore,
   *        speak(text), renderExtra(item, host), onAgain(), onHome(), renderStarRow(el, stars, celebrate)}
   * item: {cat, score, prompt, py, answer, chosen, speak, explain}
   */
  function renderReport(o) {
    $("#tr-title").textContent = o.title || "综合测试完成！";
    $("#tr-cele").textContent = o.stars >= 4.5 ? "🏆" : o.stars >= 3 ? "🎉" : "🌱";
    if (o.renderStarRow) o.renderStarRow($("#tr-stars"), o.stars, o.stars >= 5);
    $("#tr-score").innerHTML = `${o.score}<span class="tr-of"> / 100</span>`;
    let d = `用时 ${mmss(o.elapsedSec)} · 完成 ${o.answered} / ${o.total} 题`;
    if (o.unitsLabel) d += ` · ${o.unitsLabel}`;
    $("#tr-detail").textContent = d;
    const prev = $("#tr-prev");
    if (o.prevScore != null) {
      const diff = o.score - o.prevScore;
      prev.hidden = false;
      prev.textContent = diff > 0 ? `比上次进步了 ${diff} 分！📈` : diff === 0 ? "和上次一样稳！" : `上次 ${o.prevScore} 分，这次也很努力！`;
    } else prev.hidden = true;
    const cats = $("#tr-cats");
    cats.innerHTML = "";
    o.cats.forEach((c) => {
      if (!c.total) return;
      const pct = Math.round((c.got / c.total) * 100);
      const row = document.createElement("div");
      row.className = "tr-cat";
      row.innerHTML = `<span class="tr-cat-name">${esc(c.name)}</span>` +
        `<span class="tr-cat-bar"><span style="width:${pct}%"></span></span>` +
        `<span class="tr-cat-num">${fmtNum(c.got)}/${c.total}</span>`;
      cats.appendChild(row);
    });
    $("#tr-summary").textContent = summary(o.cats);
    const wrap = $("#tr-wrong");
    wrap.innerHTML = "";
    const wrong = o.items.filter((it) => it.score < 1);
    $("#tr-wrong-title").textContent = wrong.length ? `要再看看的题（${wrong.length}）` : "";
    if (!wrong.length) {
      wrap.innerHTML = '<p class="muted">全部答对，没有要订正的题！🎊</p>';
    }
    wrong.forEach((it) => {
      const row = document.createElement("div");
      row.className = "tr-item";
      const half = it.score > 0 ? '<span class="tr-half">差一点</span>' : "";
      row.innerHTML =
        `<div class="tr-item-top"><span class="tr-tag">${esc(it.cat)}</span>${half}` +
        `<span class="tr-prompt">${esc(it.prompt)}</span></div>` +
        `<div class="tr-item-ans">` +
        (it.py ? `<span class="tr-py">${esc(it.py)}</span>` : "") +
        `<span class="tr-correct">✔ ${esc(it.answer)}</span>` +
        (it.chosen ? `<span class="tr-chosen">你的答案：${esc(it.chosen)}</span>` : "") +
        `</div>`;
      const btns = document.createElement("div");
      btns.className = "tr-item-btns";
      const hear = document.createElement("button");
      hear.type = "button";
      hear.className = "speak";
      hear.textContent = "🔊";
      hear.addEventListener("click", (e) => { e.stopPropagation(); if (o.speak) o.speak(it.speak || it.answer, it); });
      const ex = document.createElement("button");
      ex.type = "button";
      ex.className = "secondary";
      ex.textContent = "看解析";
      const box = document.createElement("div");
      box.className = "explain-card tr-explain";
      box.hidden = true;
      ex.addEventListener("click", (e) => {
        e.stopPropagation();
        box.hidden = !box.hidden;
        if (!box.hidden && !box.dataset.done) {
          box.dataset.done = "1";
          box.innerHTML = '<div class="explain-title">💡 小讲解</div>';
          const inner = document.createElement("div");
          inner.className = "zh-explain-top";
          const extra = document.createElement("div");
          const body = document.createElement("div");
          body.className = "explain-body";
          body.textContent = it.explain || "";
          inner.appendChild(extra);
          inner.appendChild(body);
          box.appendChild(inner);
          if (o.renderExtra) o.renderExtra(it, extra);
        }
      });
      btns.appendChild(hear);
      btns.appendChild(ex);
      row.appendChild(btns);
      row.appendChild(box);
      row.addEventListener("click", () => { if (o.speak) o.speak(it.speak || it.answer, it); });
      wrap.appendChild(row);
    });
    $("#tr-again").onclick = o.onAgain;
    $("#tr-home").onclick = o.onHome;
  }

  /** tests: newest first [{at, score, stars, elapsedSec, units, unitsLabel, cats}] */
  function renderHistory(host, tests) {
    host.innerHTML = "";
    if (!tests || !tests.length) {
      host.innerHTML = '<p class="muted">还没有综合测试记录，做一次试试吧！</p>';
      return;
    }
    const last = tests.slice(0, 10).reverse();
    const W = 300, H = 110, pad = 18;
    const bw = Math.min(36, (W - pad * 2) / last.length);
    let bars = "";
    last.forEach((t, i) => {
      const h = Math.max(3, ((H - 34) * t.score) / 100);
      const x0 = (W - bw * last.length) / 2;
      const x = x0 + i * bw + bw * 0.15;
      const y = H - 18 - h;
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${i === last.length - 1 ? "#6c5ce7" : "#a29bfe"}"/>` +
        `<text x="${(x + bw * 0.35).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="10" text-anchor="middle" fill="#2d3436">${t.score}</text>`;
    });
    const trend = document.createElement("div");
    trend.className = "tr-trend";
    trend.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" aria-label="成绩趋势">` +
      `<line x1="${pad}" y1="${H - 18}" x2="${W - pad}" y2="${H - 18}" stroke="#dfe6e9"/>${bars}` +
      `<text x="${pad}" y="${H - 4}" font-size="10" fill="#636e72">较早</text>` +
      `<text x="${W - pad}" y="${H - 4}" font-size="10" text-anchor="end" fill="#636e72">最近</text></svg>`;
    host.appendChild(trend);
    tests.slice(0, 10).forEach((t) => {
      const d = document.createElement("div");
      d.className = "history-item";
      const when = new Date(t.at).toLocaleString("zh-CN", { hour12: false });
      const cats = (t.cats || []).filter((c) => c.total).map((c) => `${c.name} ${fmtNum(c.got)}/${c.total}`).join(" · ");
      d.innerHTML = `<strong>${esc(when)}</strong> · ${esc(t.unitsLabel || "")}<br>` +
        `<span class="small"><b>${t.score} 分</b> · ${t.stars}★ · 用时 ${mmss(t.elapsedSec)}</span><br>` +
        `<span class="small muted">${esc(cats)}</span>` +
        `<div class="bar-mini"><span style="width:${t.score}%"></span></div>`;
      host.appendChild(d);
    });
  }
  function interleave(nonWrite, write) {
    // spread "write" items evenly: slot i sits at ~ (i + 0.5) / n of the whole test
    const N = nonWrite.length + write.length;
    const n = write.length;
    const slots = new Set();
    for (let i = 0; i < n; i++) {
      let pos = Math.min(N - 1, Math.floor(((i + 0.5) * N) / n));
      while (slots.has(pos)) pos = (pos + 1) % N;
      slots.add(pos);
    }
    const out = [];
    let a = 0, b = 0;
    for (let k = 0; k < N; k++) out.push(slots.has(k) ? write[b++] : nonWrite[a++]);
    return out;
  }
  function unitsLabel(titles, totalUnits) {
    if (totalUnits && titles.length === totalUnits && totalUnits > 2) return `全部单元（${totalUnits}）`;
    if (titles.length > 4) return titles.slice(0, 3).join("、") + ` 等 ${titles.length} 个单元`;
    return titles.join("、");
  }
  document.addEventListener("DOMContentLoaded", bindPause);
  if (document.readyState !== "loading") bindPause();
  window.__testKit = { starsFromScore, summary, renderReport, renderHistory, pause, confirmQuit, interleave, unitsLabel, mmss };
})();
