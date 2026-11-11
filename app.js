/* ==========================================================================
   NEON 词境 · app.js
   赛博二次元四六级背单词 —— 纯前端，无依赖，双击 index.html 即可运行
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- 工具 */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var rnd = function (n) { return Math.floor(Math.random() * n); };
  var shuffle = function (a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };
  var todayKey = function (d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  };
  var dayOffsetKey = function (n) {
    var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return todayKey(d);
  };
  var DAY_MS = 86400000;

  /* ---------------------------------------------------------------- 存储 */
  var K = "neon-words-v1";
  var DEFAULT_SETTINGS = { goal: 20, sound: true, tts: true, repeat: true, mode: "choice" };

  var state = load();

  function load() {
    var base = {
      w: {},        // 词掌握度 { level: {word:{lv,streak,right,wrong,last}} }
      days: {},     // 每日统计 { "2026-11-11": {n,ok,bad,checkin} }
      streak: { cur: 0, best: 0, last: "" },
      xp: 0,
      mistakes: {}, // { level: {word:{count,added}} }
      settings: Object.assign({}, DEFAULT_SETTINGS),
      seen: {}      // 每个词库的游标，保证不总从 a 开头
    };
    try {
      var raw = localStorage.getItem(K);
      if (!raw) return base;
      var got = JSON.parse(raw);
      if (got && typeof got === "object") {
        base.w = got.w || {};
        base.days = got.days || {};
        base.streak = got.streak || base.streak;
        base.xp = got.xp || 0;
        base.mistakes = got.mistakes || {};
        base.settings = Object.assign({}, DEFAULT_SETTINGS, got.settings || {});
        base.seen = got.seen || {};
      }
    } catch (e) { /* 坏数据就当新用户 */ }
    if (!base.settings.mode) base.settings.mode = "choice";
    return base;
  }
  function save() {
    try { localStorage.setItem(K, JSON.stringify(state)); } catch (e) {
      toast("⚠️ 保存失败：浏览器存储空间可能已满");
    }
  }

  /* 等级 = 每 100 XP 升 1 级 */
  function levelOf(xp) { return Math.floor(xp / 100) + 1; }
  function xpInLevel(xp) { return xp % 100; }

  /* ---------------------------------------------------------------- 音效 */
  var AudioFX = (function () {
    var ctx = null;
    function ac() {
      if (!state.settings.sound) return null;
      try {
        if (!ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          ctx = new AC();
        }
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
      } catch (e) { return null; }
    }
    /* 单个音符 */
    function beep(freq, dur, type, gain, when) {
      var c = ac(); if (!c) return;
      var t0 = c.currentTime + (when || 0);
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain == null ? 0.16 : gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    /* 噪声（开门 / 电流） */
    function noise(dur, gain, filterFrom, filterTo) {
      var c = ac(); if (!c) return;
      var len = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, len, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = c.createBufferSource(); src.buffer = buf;
      var flt = c.createBiquadFilter();
      flt.type = "bandpass"; flt.Q.value = 1.2;
      flt.frequency.setValueAtTime(filterFrom || 900, c.currentTime);
      flt.frequency.exponentialRampToValueAtTime(filterTo || 120, c.currentTime + dur);
      var g = c.createGain(); g.gain.value = gain == null ? 0.14 : gain;
      src.connect(flt); flt.connect(g); g.connect(c.destination);
      src.start();
    }
    return {
      resume: function () { ac(); },
      click: function () { beep(880, 0.06, "triangle", 0.06); },
      correct: function () {
        beep(659.25, 0.13, "triangle", 0.14, 0);
        beep(987.77, 0.20, "triangle", 0.12, 0.10);
        beep(1318.5, 0.26, "sine", 0.09, 0.20);
      },
      wrong: function () {
        beep(196, 0.18, "sawtooth", 0.12, 0);
        beep(146.8, 0.26, "sawtooth", 0.10, 0.10);
      },
      reveal: function () { noise(0.16, 0.05, 2400, 600); beep(1046.5, 0.09, "sine", 0.07, 0.02); },
      gate: function () {
        noise(0.75, 0.16, 180, 1800);
        beep(110, 0.5, "sine", 0.10, 0.05);
        beep(440, 0.12, "triangle", 0.07, 0.42);
        beep(880, 0.14, "triangle", 0.07, 0.55);
        beep(1320, 0.30, "sine", 0.06, 0.66);
      },
      levelup: function () {
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) {
          beep(f, 0.30, "triangle", 0.10, i * 0.09);
        });
      },
      checkin: function () {
        [659.25, 830.61, 987.77, 1318.5].forEach(function (f, i) {
          beep(f, 0.26, "sine", 0.09, i * 0.07);
        });
      },
      tick: function () { beep(1500, 0.03, "square", 0.03); }
    };
  })();

  /* ---------------------------------------------------------------- 语音 */
  var TTS = (function () {
    var voice = null, ready = false;
    function pick() {
      if (!window.speechSynthesis) return null;
      var vs = speechSynthesis.getVoices() || [];
      var en = vs.filter(function (v) { return /^en(-|_|$)/i.test(v.lang); });
      if (!en.length) return null;
      var prefer = ["Google US English", "Microsoft Aria", "Microsoft Zira", "Samantha", "Microsoft Mark", "Alex"];
      for (var i = 0; i < prefer.length; i++) {
        var hit = en.filter(function (v) { return v.name.indexOf(prefer[i]) > -1; })[0];
        if (hit) return hit;
      }
      return en[0];
    }
    if (window.speechSynthesis) {
      voice = pick();
      speechSynthesis.onvoiceschanged = function () { voice = pick(); ready = true; };
    }
    return {
      speak: function (text) {
        if (!state.settings.tts || !window.speechSynthesis || !text) return;
        try {
          speechSynthesis.cancel();
          var u = new SpeechSynthesisUtterance(text);
          u.lang = "en-US";
          u.rate = 0.9;
          u.pitch = 1.02;
          if (!voice) voice = pick();
          if (voice) u.voice = voice;
          speechSynthesis.speak(u);
          var btn = $("#btnSpeak");
          if (btn) {
            btn.classList.add("playing");
            u.onend = u.onerror = function () { btn.classList.remove("playing"); };
            setTimeout(function () { btn.classList.remove("playing"); }, 2200);
          }
        } catch (e) { /* 忽略 */ }
      }
    };
  })();

  /* ---------------------------------------------------------------- 提示 */
  var toastBox = $("#toasts");
  function toast(msg, kind) {
    if (!toastBox) return;
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    toastBox.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      setTimeout(function () { el.remove(); }, 320);
    }, 2200);
  }
  function levelUpFX(level) {
    var box = document.createElement("div");
    box.className = "levelup";
    box.innerHTML = '<div class="box"><div class="lv-no">LEVEL UP</div>' +
      '<div class="lv-t">Lv.' + level + '</div><div class="lv-no" style="color:#ffd166">词境共鸣增强</div></div>';
    document.body.appendChild(box);
    AudioFX.levelup();
    setTimeout(function () { box.remove(); }, 2300);
  }

  /* ---------------------------------------------------------------- 装饰 */
  (function decorate() {
    var box = $("#petals");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!box || reduce) return;
    for (var i = 0; i < 16; i++) {
      var p = document.createElement("i");
      p.className = "petal";
      var s = 7 + Math.random() * 11;
      p.style.left = (Math.random() * 100) + "vw";
      p.style.width = s + "px";
      p.style.height = s + "px";
      p.style.animationDuration = (12 + Math.random() * 14).toFixed(1) + "s";
      p.style.animationDelay = (-Math.random() * 20).toFixed(1) + "s";
      p.style.opacity = (0.25 + Math.random() * 0.4).toFixed(2);
      box.appendChild(p);
    }
    var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    var fl = $("#floatLetters");
    if (fl) {
      for (var j = 0; j < 14; j++) {
        var sp = document.createElement("span");
        sp.textContent = letters[rnd(letters.length)];
        sp.style.left = (Math.random() * 96) + "%";
        sp.style.top = (Math.random() * 92) + "%";
        sp.style.fontSize = (14 + Math.random() * 30) + "px";
        sp.style.animationDelay = (-Math.random() * 7).toFixed(1) + "s";
        sp.style.animationDuration = (5 + Math.random() * 5).toFixed(1) + "s";
        fl.appendChild(sp);
      }
    }
  })();

  /* ---------------------------------------------------------------- 开门 */
  (function gate() {
    var gateEl = $("#gate");
    var app = $("#app");
    var core = $("#tapCore");
    var opened = false;

    function openGate() {
      if (opened) return;
      opened = true;
      AudioFX.resume();
      AudioFX.gate();
      gateEl.classList.add("open");
      document.body.style.overflow = "";
      setTimeout(function () {
        gateEl.classList.add("done");
        app.classList.remove("hidden");
        bootApp();
        setTimeout(function () { gateEl.style.display = "none"; }, 700);
      }, 820);
    }
    core.addEventListener("click", function (e) { e.stopPropagation(); openGate(); });
    gateEl.addEventListener("click", openGate);
    function keyHandler(e) {
      if (opened) return;
      if (e.key === "Tab") return;
      if (e.key === "Enter" || e.key === " ") e.preventDefault();
      openGate();
    }
    document.addEventListener("keydown", keyHandler);
    window.addEventListener("beforeunload", function () {
      document.removeEventListener("keydown", keyHandler);
    });
  })();

  /* ---------------------------------------------------------------- 词库 */
  var DATA = window.WORDS || { cet4: [], cet6: [] };
  var LEVELS = {
    cet4: { key: "cet4", name: "四级词汇", code: "CET-4", art: "assets/char-pink.webp", tone: "cyan" },
    cet6: { key: "cet6", name: "六级词汇", code: "CET-6", art: "assets/char-yae.webp", tone: "pink" }
  };
  function pool(level) { return DATA[level] || []; }

  /* 单词掌握记录 */
  function rec(level, word) {
    var byLv = state.w[level] || (state.w[level] = {});
    var r = byLv[word];
    if (!r) {
      r = byLv[word] = { lv: 0, streak: 0, right: 0, wrong: 0, last: 0, due: 0 };
    }
    return r;
  }
  var MASTERY = [0, 8 * 60e3, 30 * 60e3, 3 * 24 * 36e5, 7 * 24 * 36e5, 21 * 24 * 36e5];
  function bumpMastery(r, ok) {
    if (ok) {
      r.right++;
      r.streak++;
      if (r.streak >= 2) r.lv = clamp(r.lv + 1, 0, 5);
      r.due = Date.now() + (MASTERY[r.lv] || MASTERY[1]);
    } else {
      r.wrong++;
      r.streak = 0;
      r.lv = Math.max(0, r.lv - 1);
      r.due = Date.now() + 10 * 60e3;
    }
    r.last = Date.now();
  }
  function dueCount(level) {
    var byLv = state.w[level] || {}, now = Date.now(), n = 0;
    for (var k in byLv) { if (byLv[k].due && byLv[k].due <= now) n++; }
    return n;
  }
  function masteredCount(level) {
    var byLv = state.w[level] || {}, n = 0;
    for (var k in byLv) if (byLv[k].lv >= 4) n++;
    return n;
  }
  var DAY_TARGET = function () { return clamp(state.settings.goal || 20, 5, 200); };

  function todayStats(level) {
    var d = state.days[todayKey()] || { n: 0, ok: 0, bad: 0, checkin: false };
    if (!d.byLv) d.byLv = {};
    var e = d.byLv[level] || 0;
    return { all: d, levelN: e };
  }

  /* ---------------------------------------------------------------- 视图 */
  var VIEWS = { home: "#view-home", learn: "#view-learn", summary: "#view-summary", mistakes: "#view-mistakes", profile: "#view-profile" };
  var currentView = "home";
  /* 每个场景的背景图与不透明度 */
  var SCENES = {
    home:     { img: "assets/hero-girl.webp",  op: 0.42 },
    learn:    { img: "assets/bg-stars.webp",   op: 0.22 },
    summary:  { img: "assets/bg-stars2.webp",  op: 0.30 },
    mistakes: { img: "assets/bg-stars.webp",   op: 0.18 },
    profile:  { img: "assets/bg-stars2.webp",  op: 0.26 }
  };
  function setScene(name) {
    var sc = SCENES[name] || SCENES.home;
    var art = $("#bgArt");
    if (!art) return;
    art.style.setProperty("--scene-img", 'url("' + sc.img + '")');
    art.style.setProperty("--scene-op", String(sc.op));
  }

  function show(view) {
    Object.keys(VIEWS).forEach(function (v) {
      var el = $(VIEWS[v]);
      if (el) el.classList.toggle("hidden", v !== view);
    });
    currentView = view;
    $$(".tab").forEach(function (t) {
      t.setAttribute("aria-current", t.dataset.tab === view ? "true" : "false");
    });
    setScene(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (view === "home") renderHome();
    if (view === "mistakes") renderMistakes();
    if (view === "profile") renderProfile();
  }
  /* 开门瞬间先锁成首页场景，避免上次停留的页面影响背景 */
  setScene("home");

  /* ---------------------------------------------------------------- 首页 */
  function renderHome() {
    /* 词量 */
    $$("[data-total]").forEach(function (el) {
      var d = DATA[el.dataset.total];
      el.textContent = d ? d.length.toLocaleString() : "—";
    });
    /* 进度环 */
    $$("[data-ring]").forEach(function (ring) {
      var lv = ring.dataset.ring;
      var total = pool(lv).length || 1;
      var m = masteredCount(lv);
      var pct = Math.round(m / total * 100);
      ring.style.setProperty("--p", pct);
      ring.querySelector("i").textContent = pct + "%";
    });
    $$("[data-mastered]").forEach(function (el) { el.textContent = masteredCount(el.dataset.mastered); });
    $$("[data-today]").forEach(function (el) {
      var lv = el.dataset.today;
      el.textContent = (todayStats(lv).levelN || 0);
    });

    /* 今日目标 */
    var d = state.days[todayKey()] || { n: 0, ok: 0, bad: 0, checkin: false };
    var target = DAY_TARGET();
    var pct = clamp(Math.round((d.n || 0) / target * 100), 0, 100);
    var ring = $("#goalRing");
    if (ring) {
      ring.style.setProperty("--p", pct);
      $("#goalPct").textContent = pct + "%";
      $("#goalDone").textContent = d.n || 0;
      $("#goalTarget").textContent = target;
      $("#goalBar").style.width = pct + "%";
    }

    /* 正确率 */
    var acc = (d.ok || 0) + (d.bad || 0) > 0 ? Math.round(d.ok / (d.ok + d.bad) * 100) + "%" : "—";
    $("#qsAccuracy").textContent = acc;

    /* 汇总 */
    var allM = masteredCount("cet4") + masteredCount("cet6");
    $("#qsMastered").textContent = allM;
    var totalLearned = 0, totalOk = 0, totalBad = 0, studyDays = 0;
    Object.keys(state.days).forEach(function (k) {
      var x = state.days[k];
      if ((x.n || 0) > 0) studyDays++;
      totalLearned += x.n || 0; totalOk += x.ok || 0; totalBad += x.bad || 0;
    });
    $("#qsTotal").textContent = totalLearned;
    $("#qsDays").textContent = studyDays;

    /* 等级 / XP */
    var lv = levelOf(state.xp), inLv = xpInLevel(state.xp);
    $("#lvNum").textContent = lv;
    $("#xpNum").textContent = state.xp;
    var pill = $("#xpPill");
    if (pill) pill.title = "Lv." + lv + " · " + inLv + "/100 XP 到下一级";

    /* 打卡 */
    $("#streakNum").textContent = state.streak.cur || 0;
    renderHeat();

    /* 错题 / 待复习 */
    var mc = 0;
    Object.keys(state.mistakes).forEach(function (l) { mc += Object.keys(state.mistakes[l]).length; });
    $("#mistakeCount").textContent = mc;
    $("#dueCount").textContent = dueCount("cet4") + dueCount("cet6");

    var ci = $("#btnCheckin");
    if (ci) {
      if (d.checkin) { ci.textContent = "✓ 今日已打卡"; ci.disabled = true; ci.style.opacity = ".7"; }
      else { ci.textContent = "今日打卡"; ci.disabled = false; ci.style.opacity = "1"; }
    }
    /* 模式 chips */
    $$(".mode-chip").forEach(function (c) {
      c.setAttribute("aria-pressed", c.dataset.mode === state.settings.mode ? "true" : "false");
    });
  }

  function renderHeat() {
    var heat = $("#heat");
    if (!heat) return;
    heat.innerHTML = "";
    /* 84 天，按列（每列 7 天）填充，最后一列是本周 */
    var start = 83;
    for (var i = start; i >= 0; i--) {
      var key = dayOffsetKey(-i);
      var d = state.days[key] || {};
      var n = d.n || 0;
      var lv = n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4;
      var el = document.createElement("i");
      el.dataset.lv = String(lv);
      el.title = key + (n ? " · 学习 " + n + " 词" + (d.checkin ? " · 已打卡" : "") : " · 无记录");
      heat.appendChild(el);
    }
  }

  /* ---------------------------------------------------------------- 打卡 */
  function doCheckin(silent) {
    var key = todayKey();
    var d = state.days[key] || (state.days[key] = { n: 0, ok: 0, bad: 0, byLv: {}, checkin: false });
    if (d.checkin) {
      if (!silent) toast("今天已经打过卡啦 ✓");
      return;
    }
    d.checkin = true;
    /* 连续天数 */
    var prev = dayOffsetKey(-1);
    state.streak.cur = state.days[prev] && state.days[prev].checkin ? (state.streak.cur || 0) + 1 : 1;
    state.streak.best = Math.max(state.streak.best || 0, state.streak.cur);
    state.streak.last = key;
    state.xp += 20;
    save();
    AudioFX.checkin();
    if (!silent) {
      toast("📅 打卡成功！连续 " + state.streak.cur + " 天 · +20 XP", "gold");
    }
    renderHome();
    if (currentView === "profile") renderProfile();
  }

  /* ---------------------------------------------------------------- 组词 */
  var session = null;   // { level, mode, list, idx, ok, bad, rightFirst, startXp, results:[] }

  function pickWords(level, n, opts) {
    opts = opts || {};
    var arr = pool(level);
    if (!arr.length) return [];
    var byLv = state.w[level] || {};
    var now = Date.now();
    var due = [], fresh = [], learning = [];
    arr.forEach(function (it) {
      var r = byLv[it.w];
      if (!r) fresh.push(it);
      else if (r.due && r.due <= now) due.push(it);
      else if (r.lv < 4) learning.push(it);
    });
    var out = [];
    if (opts.onlyDue) {
      out = shuffle(due).slice(0, n);
      if (!out.length) out = shuffle(learning).slice(0, n);
    } else if (opts.words) {
      var map = {};
      arr.forEach(function (it) { map[it.w.toLowerCase()] = it; });
      opts.words.forEach(function (w) {
        var hit = map[String(w).toLowerCase()];
        if (hit) out.push(hit);
      });
      out = out.slice(0, n);
    } else {
      /* 优先待复习，再新词，再随手巩固 */
      out = shuffle(due).slice(0, Math.ceil(n * 0.5));
      var rest = n - out.length;
      out = out.concat(shuffle(fresh).slice(0, rest));
      if (out.length < n) {
        out = out.concat(shuffle(learning).slice(0, n - out.length));
      }
      /* 还不够就随机补 */
      if (out.length < n) {
        var have = {};
        out.forEach(function (x) { have[x.w] = 1; });
        var more = shuffle(arr.filter(function (x) { return !have[x.w]; }));
        out = out.concat(more.slice(0, n - out.length));
      }
    }
    /* 去重 */
    var seen = {}, uniq = [];
    out.forEach(function (x) { if (!seen[x.w]) { seen[x.w] = 1; uniq.push(x); } });
    return shuffle(uniq);
  }

  function startSession(level, opts) {
    opts = opts || {};
    var n = opts.count || Math.min(30, Math.max(10, DAY_TARGET()));
    var list = pickWords(level, n, opts);
    if (!list.length) { toast("这个词库暂时没有可学的词"); return; }
    session = {
      level: level, mode: opts.mode || state.settings.mode, pool: list,
      queue: list.slice(), idx: 0, ok: 0, bad: 0, startXp: state.xp,
      wrongWords: [], repeat: state.settings.repeat, title: opts.title || null
    };
    show("learn");
    nextQuestion();
  }

  /* ---------------------------------------------------------------- 出题 */
  function nextQuestion() {
    var s = session;
    if (!s) return;
    if (s.idx >= s.queue.length) { finishSession(); return; }
    var item = s.queue[s.idx];
    s.current = item;
    s.answered = false;
    s.firstTry = true;
    s.chosenOk = false;

    var r = rec(s.level, item.w);
    /* 顶部 */
    $("#hudLevel").textContent = LEVELS[s.level].code + (s.title ? " · " + s.title : "");
    $("#hudCount").textContent = (s.idx + 1) + " / " + s.queue.length;
    $("#hudBar").style.width = Math.round(s.idx / s.queue.length * 100) + "%";
    $("#hudOk").textContent = "✓ " + s.ok;
    $("#hudNo").textContent = "✗ " + s.bad;
    $("#wcLevel").textContent = LEVELS[s.level].code + " · WORD " + pad2(s.idx + 1);
    var ms = $("#wcMastery");
    ms.innerHTML = "";
    for (var i = 0; i < 5; i++) {
      var dot = document.createElement("i");
      if (i < r.lv) dot.className = "on";
      ms.appendChild(dot);
    }

    /* 单词 */
    var wt = $("#wordText");
    wt.textContent = item.w;
    wt.classList.remove("glitch");
    void wt.offsetWidth;
    wt.classList.add("glitch");

    /* 释义（遮住） */
    var defs = $("#defs");
    defs.innerHTML = item.d.map(function (p) {
      return '<span>' + (p[0] ? '<b class="pos">' + esc(p[0]) + "</b>" : "") + esc(p[1]) + "</span>";
    }).join("");
    var meaning = $("#meaning");
    meaning.classList.add("locked");
    $("#lockBadge").classList.remove("hidden");

    /* 短语 */
    var pb = $("#phraseBox");
    pb.innerHTML = (item.p || []).map(function (ph) {
      return '<div class="phrase"><b>' + esc(ph[0]) + "</b><em>" + esc(ph[1]) + "</em></div>";
    }).join("");

    /* 反馈复位 */
    var fb = $("#feedback");
    fb.className = "feedback";
    $("#btnStar").classList.add("hidden");
    s._resolved = false;

    var isSpell = s.mode === "spell";
    var isReveal = s.mode === "reveal";

    /* 拼写模式才隐藏选项区；「遮释义」模式的两个自评按钮也放在这里，不能隐藏 */
    $("#choiceBlock").classList.toggle("hidden", isSpell);
    $("#spellBlock").classList.toggle("hidden", !isSpell);
    $("#lockBadge").classList.toggle("hidden", isSpell);
    var kbd = $("#kbdHint");
    if (kbd) kbd.classList.toggle("hidden", isReveal);
    var card = $(".word-card");
    if (card) card.classList.toggle("spell-mode", isSpell);

    if (isSpell) {
      wt.textContent = "? ? ?";
      $("#spellInput").value = "";
      $("#spellInput").className = "spell-input";
      $("#spellInput").disabled = false;
      $("#spellFirst").textContent = item.w[0].toUpperCase();
      $("#spellLen").textContent = item.w.length;
      $("#wordHint").textContent = "看中文释义 / 按 S 听发音，敲出正确的英文单词";
      setTimeout(function () { TTS.speak(item.w); }, 260);
      setTimeout(function () { $("#spellInput").focus(); }, 380);
      /* 拼写模式：释义直接展示 */
      meaning.classList.remove("locked");
    } else if (isReveal) {
      $("#wordHint").textContent = "先自己回想，再按空格揭示释义，然后判断「记住了 / 没记住」";
      renderRevealActions();
    } else {
      $("#wordHint").textContent = "轻触喇叭收听发音 · 选择正确的释义（1-4）";
      renderOptions(item);
    }
  }

  function renderOptions(item) {
    var s = session;
    var opts = buildOptions(item, s.level);
    var box = $("#options");
    box.innerHTML = "";
    opts.forEach(function (o, i) {
      var b = document.createElement("button");
      b.className = "opt";
      b.type = "button";
      b.dataset.i = String(i);
      b.innerHTML = '<span class="kbd">' + (i + 1) + "</span><span>" + defText(o) + "</span>";
      b.addEventListener("click", function () { answerChoice(i, opts, item); });
      box.appendChild(b);
    });
    s.options = opts;
  }

  function defText(o) {
    return o.d.map(function (p) {
      return (p[0] ? '<b class="pos">' + esc(p[0]) + "</b>" : "") + esc(p[1]);
    }).join(" ");
  }

  function buildOptions(item, level) {
    var arr = pool(level);
    var uniq = {}, keys = [];
    item.d.forEach(function (p) { if (p[1] && p[1].length > 1) uniq[p[1]] = 1; });
    keys = Object.keys(uniq);
    /* 干扰项：同词库、释义不同 */
    var cand = arr.filter(function (x) {
      if (x.w === item.w) return false;
      var t = x.d.map(function (p) { return p[1]; }).join("");
      return t && keys.every(function (k) { return t.indexOf(k) < 0; });
    });
    var pick = shuffle(cand).slice(0, 3);
    while (pick.length < 3) {
      var extra = arr[rnd(arr.length)];
      if (extra && extra.w !== item.w && pick.indexOf(extra) < 0) pick.push(extra);
      else break;
    }
    var all = shuffle(pick.concat([item]));
    return all;
  }

  function answerChoice(i, opts, item) {
    var s = session;
    if (s.answered) return;
    s.answered = true;
    var correctIdx = opts.indexOf(item);
    var ok = i === correctIdx;
    var nodes = $$("#options .opt");
    nodes.forEach(function (n, j) {
      n.disabled = true;
      if (j === correctIdx) n.classList.add("correct");
      else if (j === i) n.classList.add("wrong");
      else n.classList.add("dim");
    });
    resolve(ok, ok ? null : item);
  }

  function renderRevealActions() {
    var box = $("#options");
    box.innerHTML = "";
    var b1 = document.createElement("button");
    b1.className = "opt"; b1.type = "button";
    b1.innerHTML = '<span class="kbd">1</span><span>😵 没想起来（稍后再练）</span>';
    b1.addEventListener("click", function () { resolve(false, session.current); });
    var b2 = document.createElement("button");
    b2.className = "opt"; b2.type = "button";
    b2.innerHTML = '<span class="kbd">2</span><span>🙂 想起来了（记住了）</span>';
    b2.addEventListener("click", function () { resolve(true, null); });
    box.appendChild(b1); box.appendChild(b2);
    session.revealMode = true;
  }

  function answerSpell() {
    var s = session;
    if (!s || s.answered) return;
    var val = $("#spellInput").value.trim();
    if (!val) return;
    s.answered = true;
    var target = s.current.w.toLowerCase();
    var ok = val.toLowerCase() === target;
    /* 容错：漏一个字母算接近 */
    var close = !ok && levenshtein(val.toLowerCase(), target) <= 1 && target.length > 4;
    $("#spellInput").className = "spell-input " + (ok ? "ok" : "no");
    $("#spellInput").disabled = true;
    if (ok) { s.ok++; }
    resolve(ok, ok ? null : s.current, close);
  }

  function levenshtein(a, b) {
    var m = a.length, n = b.length, prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }

  /* 统一的判题结果处理 */
  function resolve(ok, item, close) {
    var s = session;
    if (!s) return;
    if (s._resolved) return;

    /* 「遮释义」模式：自评，不计正确率、不进错题本，只标注掌握度 */
    if (s.mode === "reveal") {
      s._resolved = true;
      s.answered = true;
      var rr = rec(s.level, s.current.w);
      bumpMastery(rr, ok);
      var dk = todayKey();
      var dd = state.days[dk] || (state.days[dk] = { n: 0, ok: 0, bad: 0, byLv: {}, checkin: false });
      dd.byLv = dd.byLv || {};
      dd.n = (dd.n || 0) + 1;
      dd.byLv[s.level] = (dd.byLv[s.level] || 0) + 1;
      if (ok) dd.ok = (dd.ok || 0) + 1; else dd.bad = (dd.bad || 0) + 1;
      var g = ok ? 8 : 2;
      var before = levelOf(state.xp);
      state.xp += g;
      save();
      AudioFX[ok ? "correct" : "tick"]();
      var mEl = $("#meaning");
      if (mEl) mEl.classList.remove("locked");
      $("#lockBadge").classList.add("hidden");
      var fbEl = $("#feedback");
      fbEl.className = "feedback show " + (ok ? "ok" : "no");
      $("#fbHead").textContent = ok ? "✓ 记住了" : "✗ 再练一次";
      $("#fbBody").innerHTML = ok ? "掌握度提升 · <b>+8 XP</b>" : "已记录，之后会再考你一次 · <b>+2 XP</b>";
      $("#btnStar").classList.add("hidden");
      $("#hudOk").textContent = "✓ " + (ok ? ++s.ok : s.ok);
      $("#hudNo").textContent = "✗ " + (ok ? s.bad : ++s.bad);
      $("#hudBar").style.width = Math.round((s.idx + 1) / s.queue.length * 100) + "%";
      var after = levelOf(state.xp);
      if (after > before) { levelUpFX(after); }
      return;
    }

    s._resolved = true;   /* 同一题只结算一次 */
    item = item || s.current;
    var r = rec(s.level, item.w);
    bumpMastery(r, ok);

    /* 当日统计 */
    var key = todayKey();
    var d = state.days[key] || (state.days[key] = { n: 0, ok: 0, bad: 0, byLv: {}, checkin: false });
    d.byLv = d.byLv || {};
    d.n = (d.n || 0) + 1;
    d.byLv[s.level] = (d.byLv[s.level] || 0) + 1;
    if (ok) { d.ok = (d.ok || 0) + 1; s.ok++; }
    else { d.bad = (d.bad || 0) + 1; s.bad++; }

    /* 错题本 */
    if (!ok) {
      var mb = state.mistakes[s.level] || (state.mistakes[s.level] = {});
      var m = mb[item.w] || { count: 0, added: Date.now() };
      m.count++;
      mb[item.w] = m;
      s.wrongWords.push(item.w);
    } else if (state.mistakes[s.level] && state.mistakes[s.level][item.w]) {
      /* 答对可抵消错题计数，降到 0 移出 */
      var mm = state.mistakes[s.level][item.w];
      mm.count--;
      if (mm.count <= 0) delete state.mistakes[s.level][item.w];
    }

    /* XP */
    var gain = ok ? 12 : 1;
    var beforeLv = levelOf(state.xp);
    state.xp += gain;
    save();
    AudioFX[ok ? "correct" : "wrong"]();

    /* 释义揭示 */
    var meaning = $("#meaning");
    meaning.classList.remove("locked");
    $("#lockBadge").classList.add("hidden");

    /* 反馈 */
    var fb = $("#feedback");
    fb.className = "feedback show " + (ok ? "ok" : "no");
    $("#fbHead").textContent = ok ? "✓ 正确！" : (close ? "接近了…" : "✗ 再记一次");
    var body = ok ? "记忆链路 +1 · 已获得 <b>+12 XP</b>" : "正确答案：<b>" + esc(session.current.w) + "</b> · " +
      session.current.d.map(function (p) { return (p[0] ? p[0] + ". " : "") + p[1]; }).join("；");
    $("#fbBody").innerHTML = body;
    $("#btnStar").classList.toggle("hidden", ok);
    $("#hudOk").textContent = "✓ " + s.ok;
    $("#hudNo").textContent = "✗ " + s.bad;
    $("#hudBar").style.width = Math.round((s.idx + 1) / s.queue.length * 100) + "%";

    /* 答错且开启重练：本组末尾再出现一次 */
    if (!ok && s.repeat) {
      s.queue.push({ w: item.w, d: item.d, p: item.p });
      $("#hudCount").textContent = (s.idx + 1) + " / " + s.queue.length;
    }

    /* 升级 */
    var afterLv = levelOf(state.xp);
    if (afterLv > beforeLv) {
      levelUpFX(afterLv);
      toast("🎖 升到 Lv." + afterLv + "！", "pink");
    }
    /* 每日目标达成 */
    if ((d.n || 0) === DAY_TARGET()) {
      toast("🎯 今日目标达成，别忘打卡！", "gold");
      AudioFX.checkin();
    }
    /* 自动发音（拼写模式听写需要） */
    if (s.mode === "spell" && ok) TTS.speak(item.w);
  }

  function advance() {
    var s = session;
    if (!s) return;
    if (!s.answered) {
      /* 还没作答：空格 / 点击 → 揭示释义 */
      revealMeaning();
      return;
    }
    s.idx++;
    var nextBtn = $("#btnNext");
    if ($("#spellInput")) { $("#spellInput").disabled = false; }
    nextQuestion();
  }

  function revealMeaning() {
    var meaning = $("#meaning");
    if (!meaning.classList.contains("locked")) return;
    meaning.classList.remove("locked");
    $("#lockBadge").classList.add("hidden");
    AudioFX.reveal();
    var s = session;
    if (!s || s._resolved) return;
    if (s.mode === "reveal") {
      /* 只揭义，判题交给「想起来了 / 没想起来」两个按钮 */
      $("#feedback").className = "feedback";
    } else if (s.mode === "choice") {
      var fb = $("#feedback");
      fb.className = "feedback show";
      $("#fbHead").textContent = "释义已揭示";
      $("#fbBody").innerHTML = "看完后从下面选出正确的释义；记不住就点「加入错题本」。";
    }
  }

  function finishSession() {
    var s = session;
    var total = s.ok + s.bad;
    var acc = total ? Math.round(s.ok / total * 100) : 0;
    var xpGain = state.xp - s.startXp;
    $("#sumTotal").textContent = total;
    $("#sumOk").textContent = s.ok;
    $("#sumAcc").textContent = acc + "%";
    $("#sumXp").textContent = "+" + xpGain;
    $("#sumIco").textContent = acc >= 90 ? "🏆" : acc >= 70 ? "🎉" : "💪";
    $("#sumTitle").textContent = acc >= 90 ? "词境全亮！" : acc >= 70 ? "本节完成！" : "继续练，别停";
    $("#sumDesc").textContent = LEVELS[s.level].name + " · 答对 " + s.ok + " / 共 " + total + " 题";
    session = null;
    show("summary");
    save();
  }

  /* ---------------------------------------------------------------- 错题本 */
  function renderMistakes() {
    var list = $("#mistakeList");
    var empty = $("#mistakesEmpty");
    if (!list) return;
    list.innerHTML = "";
    var rows = [];
    Object.keys(state.mistakes).forEach(function (level) {
      Object.keys(state.mistakes[level]).forEach(function (w) {
        rows.push({ level: level, w: w, m: state.mistakes[level][w], item: findWord(level, w) });
      });
    });
    rows.sort(function (a, b) { return (b.m || {}).count - (a.m || {}).count; });
    if (!rows.length) { empty.classList.remove("hidden"); return; }
    empty.classList.add("hidden");
    rows.forEach(function (row) {
      var el = document.createElement("div");
      el.className = "mistake";
      var defs = row.item ? row.item.d.map(function (p) { return (p[0] ? p[0] + ". " : "") + p[1]; }).join("；") : "（词库中未找到）";
      el.innerHTML =
        '<div class="m-word">' + esc(row.w) + "</div>" +
        '<div class="m-def">' + esc(defs) + "</div>" +
        '<div class="m-count">错 ' + (row.m.count || 1) + " 次</div>" +
        '<button class="m-del" title="移出错题本" aria-label="移出">✕</button>';
      el.querySelector(".m-del").addEventListener("click", function () {
        delete state.mistakes[row.level][row.w];
        save(); renderMistakes(); renderHome();
        toast("已移出错题本");
      });
      list.appendChild(el);
    });
  }

  function findWord(level, w) {
    var arr = pool(level);
    for (var i = 0; i < arr.length; i++) if (arr[i].w === w) return arr[i];
    return null;
  }

  function mistakesWords(level) {
    var out = [];
    Object.keys(state.mistakes[level] || {}).forEach(function (w) { out.push(w); });
    return out;
  }

  /* ---------------------------------------------------------------- 我的 */
  function renderProfile() {
    var total = 0, ok = 0, bad = 0, days = 0, best = state.streak.best || 0;
    Object.keys(state.days).forEach(function (k) {
      var d = state.days[k];
      if ((d.n || 0) > 0) days++;
      total += d.n || 0; ok += d.ok || 0; bad += d.bad || 0;
    });
    $("#pfTotal").textContent = total;
    $("#pfMastered").textContent = masteredCount("cet4") + masteredCount("cet6");
    $("#pfAcc").textContent = ok + bad ? Math.round(ok / (ok + bad) * 100) + "%" : "—";
    $("#pfStreak").textContent = state.streak.cur || 0;
    $("#pfBest").textContent = best;
    $("#pfDays").textContent = days;

    /* 本月日历 */
    var cal = $("#calendar");
    cal.innerHTML = "";
    ["日", "一", "二", "三", "四", "五", "六"].forEach(function (d) {
      var h = document.createElement("div");
      h.className = "cal-cell head";
      h.textContent = d;
      cal.appendChild(h);
    });
    var now = new Date();
    var y = now.getFullYear(), mo = now.getMonth();
    var first = new Date(y, mo, 1);
    var startPad = first.getDay();
    var dim = new Date(y, mo + 1, 0).getDate();
    for (var p = 0; p < startPad; p++) {
      var blank = document.createElement("div");
      blank.className = "cal-cell";
      blank.style.background = "transparent";
      cal.appendChild(blank);
    }
    for (var day = 1; day <= dim; day++) {
      var key = y + "-" + pad2(mo + 1) + "-" + pad2(day);
      var st = state.days[key] || {};
      var cell = document.createElement("div");
      cell.className = "cal-cell";
      if (key === todayKey()) cell.classList.add("today");
      if (st.checkin) {
        cell.classList.add("done");
        if ((st.n || 0) >= 30) cell.classList.add("hot");
      }
      cell.textContent = String(day);
      cell.title = key + ((st.n || 0) ? " · " + st.n + " 词" : " · 无记录") + (st.checkin ? " · 已打卡" : "");
      cal.appendChild(cell);
    }

    /* 设置同步 */
    setSwitch($("#swSound"), state.settings.sound);
    setSwitch($("#swTts"), state.settings.tts);
    setSwitch($("#swRepeat"), state.settings.repeat);
    $("#goalInput").value = state.settings.goal;
  }
  function setSwitch(el, on) {
    if (el) el.setAttribute("aria-checked", on ? "true" : "false");
  }

  /* ---------------------------------------------------------------- 弹窗 */
  var modal = $("#modal");
  function openModal(title, html) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = html;
    modal.classList.remove("hidden");
  }
  function closeModal() { modal.classList.add("hidden"); }
  $("#modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

  function showSettingsModal() {
    var s = state.settings;
    openModal("设置",
      '<div class="setting-row"><div><span class="lbl">合成音效</span><span class="hint">答题反馈音</span></div>' +
      '<button class="switch" id="mSound" role="switch" aria-checked="' + s.sound + '"></button></div>' +
      '<div class="setting-row"><div><span class="lbl">单词发音</span><span class="hint">TTS 朗读</span></div>' +
      '<button class="switch" id="mTts" role="switch" aria-checked="' + s.tts + '"></button></div>' +
      '<div class="setting-row"><div><span class="lbl">每日目标</span><span class="hint">5 ~ 200 词</span></div>' +
      '<input class="num-inp" id="mGoal" type="number" min="5" max="200" step="5" value="' + s.goal + '"></div>');
    $("#mSound").addEventListener("click", function () {
      state.settings.sound = !state.settings.sound; save();
      setSwitch($("#mSound"), state.settings.sound); renderProfile(); AudioFX.click();
    });
    $("#mTts").addEventListener("click", function () {
      state.settings.tts = !state.settings.tts; save();
      setSwitch($("#mTts"), state.settings.tts); renderProfile();
    });
    $("#mGoal").addEventListener("change", function (e) {
      var v = clamp(parseInt(e.target.value, 10) || 20, 5, 200);
      state.settings.goal = v; e.target.value = v; save(); renderHome(); renderProfile();
      toast("每日目标已设为 " + v + " 词");
    });
  }

  function showStatsModal() {
    var total = 0, ok = 0, bad = 0, days = 0;
    Object.keys(state.days).forEach(function (k) {
      var d = state.days[k];
      if ((d.n || 0) > 0) days++;
      total += d.n || 0; ok += d.ok || 0; bad += d.bad || 0;
    });
    var m4 = masteredCount("cet4"), m6 = masteredCount("cet6");
    var t4 = pool("cet4").length || 1, t6 = pool("cet6").length || 1;
    openModal("学习统计",
      '<div class="stat-grid">' +
      '<div class="stat-box"><b>' + total + '</b><span>累计学习词次</span></div>' +
      '<div class="stat-box"><b>' + days + '</b><span>学习天数</span></div>' +
      '<div class="stat-box"><b>' + (ok + bad ? Math.round(ok / (ok + bad) * 100) + "%" : "—") + '</b><span>总正确率</span></div>' +
      '<div class="stat-box"><b>' + state.xp + '</b><span>总 XP</span></div>' +
      "</div>" +
      '<div style="margin-top:16px;font-size:13px;color:var(--ink-dim)">' +
      "<div>四级掌握：" + m4 + " / " + t4 + "（" + Math.round(m4 / t4 * 100) + "%）</div>" +
      '<div class="goal-bar" style="margin:6px 0 14px"><i style="width:' + Math.round(m4 / t4 * 100) + '%"></i></div>' +
      "<div>六级掌握：" + m6 + " / " + t6 + "（" + Math.round(m6 / t6 * 100) + "%）</div>" +
      '<div class="goal-bar" style="margin:6px 0 0"><i style="width:' + Math.round(m6 / t6 * 100) + '%"></i></div>' +
      "</div>");
  }

  function showHelpModal() {
    openModal("快捷键与玩法",
      '<div style="font-size:13.5px;color:var(--ink-dim);line-height:2">' +
      "<div><b style='color:#fff'>空格</b>　揭示 / 收起释义</div>" +
      "<div><b style='color:#fff'>1 / 2 / 3 / 4</b>　选择对应选项</div>" +
      "<div><b style='color:#fff'>Enter</b>　下一题</div>" +
      "<div><b style='color:#fff'>S</b>　朗读单词</div>" +
      "<div><b style='color:#fff'>Esc</b>　返回首页</div>" +
      "<hr style='border:0;border-top:1px dashed rgba(255,255,255,.14);margin:10px 0'>" +
      "<div>记住每一格的掌握度：答对 2 次升一级，答错降一级。掌握度越高的词，复习间隔越长（10 分钟 → 3 天 → 21 天）。</div>" +
      "<div>拼写模式下少打一个字母会判为「接近」，不计对但会提示。</div>" +
      "<div>数据全部存在本机浏览器，可在「我的」里导出备份。</div>" +
      "</div>");
  }

  /* ---------------------------------------------------------------- 事件 */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* 关卡点击 */
  $$(".level-card").forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest(".mode-chip")) return;
      AudioFX.resume(); AudioFX.click();
      startSession(card.dataset.level, { mode: state.settings.mode });
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        AudioFX.resume(); AudioFX.click();
        startSession(card.dataset.level, { mode: state.settings.mode });
      }
    });
  });

  /* 模式 chip（注意：卡片本身也是按钮，必须拦住冒泡，否则会误解成点击卡片） */
  $$(".mode-chip").forEach(function (chip) {
    chip.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      var mode = chip.dataset.mode;
      if (!mode) return;
      state.settings.mode = mode;
      save();
      $$(".mode-chip").forEach(function (c) {
        c.setAttribute("aria-pressed", c.dataset.mode === mode ? "true" : "false");
      });
      AudioFX.resume();
      AudioFX.click();
      var names = { choice: "四选一", reveal: "遮释义回想", spell: "拼写模式" };
      toast("已切换：" + names[mode] + "（下次进入词境生效）");
    }, true);
  });

  /* 底部导航 */
  $$(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var t = tab.dataset.tab;
      if (t === "learn") {
        var last = localStorage.getItem(K + "-last");
        startSession(last || "cet4", { mode: state.settings.mode });
        return;
      }
      AudioFX.click();
      show(t);
    });
  });

  $("#btnContinue").addEventListener("click", function () {
    AudioFX.click();
    var last = localStorage.getItem(K + "-last") || "cet4";
    startSession(last, { mode: state.settings.mode });
  });
  function randomSession() {
    startSession("cet4", { mode: state.settings.mode, words: null, count: 20 });
  }
  $("#btnRandom").addEventListener("click", function () { AudioFX.click(); randomSession(); });
  $("#btnRandom2").addEventListener("click", function () { AudioFX.click(); randomSession(); });
  $("#btnMistakes").addEventListener("click", function () { AudioFX.click(); show("mistakes"); });
  $("#btnSumMistakes").addEventListener("click", function () { show("mistakes"); });

  $("#btnReviewDue").addEventListener("click", function () {
    /* 优先复习当前词库的到期词，其次是另一本 */
    var last = (localStorage.getItem(K + "-last") || "cet4");
    var lv = null;
    if (dueCount(last)) lv = last;
    else if (dueCount("cet4")) lv = "cet4";
    else if (dueCount("cet6")) lv = "cet6";
    if (!lv) {
      toast("暂时没有到期的复习词，去词境学几组新词吧～");
      return;
    }
    AudioFX.click();
    startSession(lv, { onlyDue: true, mode: state.settings.mode, title: "待复习" });
  });

  $("#btnCheckin").addEventListener("click", function () { doCheckin(); });

  $("#btnStats").addEventListener("click", function () { AudioFX.click(); showStatsModal(); });
  $("#btnSettings").addEventListener("click", function () { AudioFX.click(); showSettingsModal(); });
  $("#btnHelp").addEventListener("click", function () { AudioFX.click(); showHelpModal(); });

  /* 学习界面 */
  $("#btnBack").addEventListener("click", function () {
    if (session && (session.ok + session.bad) > 0) {
      if (!window.confirm("退出当前这一组？已学的词会保留。")) return;
    }
    session = null;
    show("home");
  });
  $("#btnSpeak").addEventListener("click", function () {
    if (session && session.current) { TTS.speak(session.current.w); AudioFX.tick(); }
  });
  $("#btnSpeakAll").addEventListener("click", function () {
    if (session && session.current) TTS.speak(session.current.w);
  });
  $("#btnNext").addEventListener("click", function () { advance(); });
  $("#btnStar").addEventListener("click", function () {
    if (!session || !session.current) return;
    var lv = session.level, w = session.current.w;
    var mb = state.mistakes[lv] || (state.mistakes[lv] = {});
    if (!mb[w]) mb[w] = { count: 1, added: Date.now() };
    save(); renderHome();
    toast("已加入错题本： " + w, "pink");
  });
  $("#meaning").addEventListener("click", function () { revealMeaning(); });
  $("#lockBadge").addEventListener("click", function () { revealMeaning(); });
  $("#spellInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!session) return;
      if (session.answered) advance(); else answerSpell();
    }
  });
  $("#spellInput").addEventListener("input", function () {
    if (session && session.current) {
      var v = $("#spellInput").value.trim().toLowerCase();
      var t = session.current.w.toLowerCase();
      if (v && t.indexOf(v) === 0 && v.length >= 2) AudioFX.tick();
    }
  });

  /* 总结页 */
  $("#btnAgain").addEventListener("click", function () {
    var lv = localStorage.getItem(K + "-last") || "cet4";
    startSession(lv, { mode: state.settings.mode });
  });
  $("#btnSumHome").addEventListener("click", function () { show("home"); });

  /* 错题本 */
  $("#btnReviewMistakes").addEventListener("click", function () {
    var lv = null, words = [];
    ["cet4", "cet6"].forEach(function (l) {
      var ws = mistakesWords(l);
      if (ws.length) { lv = l; words = ws; }
    });
    if (!lv) { toast("错题本是空的"); return; }
    var all4 = mistakesWords("cet4"), all6 = mistakesWords("cet6");
    if (all4.length && all6.length) {
      /* 两个级别都有：先复习四级 */
      startSession("cet4", { words: all4, mode: state.settings.mode, title: "错题复习" });
    } else {
      startSession(lv, { words: words, mode: state.settings.mode, title: "错题复习" });
    }
  });
  $("#btnClearMistakes").addEventListener("click", function () {
    if (!window.confirm("确定清空全部错题吗？")) return;
    state.mistakes = {};
    save(); renderMistakes(); renderHome();
    toast("错题本已清空");
  });

  /* 设置页 */
  $("#swSound").addEventListener("click", function () {
    state.settings.sound = !state.settings.sound; save(); renderProfile();
    if (state.settings.sound) AudioFX.click();
  });
  $("#swTts").addEventListener("click", function () {
    state.settings.tts = !state.settings.tts; save(); renderProfile();
    if (state.settings.tts) TTS.speak("Hello, keep going.");
  });
  $("#swRepeat").addEventListener("click", function () {
    state.settings.repeat = !state.settings.repeat; save(); renderProfile();
    toast(state.settings.repeat ? "答错会重练一次" : "答错不再重练");
  });
  $("#goalInput").addEventListener("change", function (e) {
    var v = clamp(parseInt(e.target.value, 10) || 20, 5, 200);
    state.settings.goal = v; e.target.value = v; save(); renderHome();
    toast("每日目标已设为 " + v + " 词");
  });
  $("#btnExport").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "neon-words-backup-" + todayKey() + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    toast("已导出备份文件");
  });
  $("#btnImport").addEventListener("click", function () {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json,.json";
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var got = JSON.parse(fr.result);
          if (!got || typeof got !== "object") throw new Error("bad");
          if (!window.confirm("导入会覆盖当前进度，确定吗？")) return;
          state = Object.assign({
            w: {}, days: {}, streak: { cur: 0, best: 0, last: "" }, xp: 0,
            mistakes: {}, settings: Object.assign({}, DEFAULT_SETTINGS), seen: {}
          }, got);
          state.settings = Object.assign({}, DEFAULT_SETTINGS, got.settings || {});
          save(); renderHome(); renderProfile(); show("home");
          toast("导入成功 ✓");
        } catch (e) { toast("导入失败：文件格式不对"); }
      };
      fr.readAsText(f);
    };
    inp.click();
  });
  $("#btnReset").addEventListener("click", function () {
    if (!window.confirm("这会清空全部学习进度和打卡记录，确定吗？")) return;
    if (!window.confirm("再确认一次：真的要清空吗？")) return;
    state = {
      w: {}, days: {}, streak: { cur: 0, best: 0, last: "" }, xp: 0,
      mistakes: {}, settings: Object.assign({}, DEFAULT_SETTINGS), seen: {}
    };
    save(); renderHome(); renderProfile();
    toast("已清空全部进度");
  });

  /* 记住最后一个词库 */
  var _startSession = startSession;
  startSession = function (level, opts) {
    try { localStorage.setItem(K + "-last", level); } catch (e) {}
    _startSession(level, opts);
  };
  /* 让前面注册的按钮也能用上包装后的版本（它们引用的是函数名，运行时已更新） */

  /* 键盘 */
  document.addEventListener("keydown", function (e) {
    if (!modal.classList.contains("hidden")) {
      if (e.key === "Escape") closeModal();
      return;
    }
    var tag = (e.target && e.target.tagName) || "";
    var typing = tag === "INPUT" || tag === "TEXTAREA";
    if (e.key === "Escape") {
      if (currentView === "learn") { $("#btnBack").click(); }
      else if (currentView !== "home") show("home");
      return;
    }
    if (currentView !== "learn" || !session) return;

    if (e.key === " " && !typing) {
      e.preventDefault();
      if (session.mode === "spell") { TTS.speak(session.current.w); return; }
      if (!session.answered) revealMeaning();
      else advance();
      return;
    }
    if (e.key === "Enter") {
      if (typing) return; /* 拼写输入框自己处理 */
      e.preventDefault();
      advance();
      return;
    }
    if ((e.key === "s" || e.key === "S") && !typing) {
      e.preventDefault();
      if (session.current) TTS.speak(session.current.w);
      return;
    }
    if (session.mode === "choice" && !session.answered && /^[1-4]$/.test(e.key) && !typing) {
      var i = parseInt(e.key, 10) - 1;
      var nodes = $$("#options .opt");
      if (nodes[i]) nodes[i].click();
    }
    if (session.mode === "reveal" && !session.answered && (e.key === "1" || e.key === "2") && !typing) {
      var ns = $$("#options .opt");
      if (ns[parseInt(e.key, 10) - 1]) ns[parseInt(e.key, 10) - 1].click();
    }
  });

  /* ---------------------------------------------------------------- 启动 */
  function bootApp() {
    /* 词库缺失时给出明确提示 */
    var total = (DATA.cet4 || []).length + (DATA.cet6 || []).length;
    var note = $("#bootNote");
    if (note) note.remove();
    if (!total) {
      var app = $("#app");
      if (app) {
        app.innerHTML = '<div class="wrap" id="errState">' +
          '<div class="badge pink">ERROR</div>' +
          "<h1>词库没有加载成功</h1>" +
          "<p style='color:var(--ink-dim)'>请确认 <code>words.js</code> 和 <code>index.html</code> 在同一个文件夹里。" +
          "如果是从压缩包解压，注意不要只复制了 index.html。</p>" +
          '<p style="color:var(--ink-mute);font-size:12px">本页面由 小挽 制作 · 给 CFOOOO</p></div>';
      }
      return;
    }
    /* 首次进入送一次「新手提示」 */
    if (!state.streak.last) {
      setTimeout(function () {
        toast("👋 欢迎来到词境 · 每次答对答错都会有音效反馈", "pink");
      }, 900);
    }
    show("home");
  }

  /* 兜底：若 words.js 未定义 */
  if (!window.WORDS) {
    setTimeout(function () {
      if ($("#bootNote")) $("#bootNote").textContent = "词库加载失败，请检查 words.js 是否在同目录";
    }, 1500);
  }
})();

