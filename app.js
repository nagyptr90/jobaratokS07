(() => {
  "use strict";

  const ALL = window.QUESTIONS || [];
  const app = document.getElementById("app");

  // ---------- adatok ----------
  const EPISODES = {
    1: "Monica nagy napja", 2: "Rachel könyve", 3: "Phoebe sütije", 4: "Rachel asszisztense",
    5: "Az eljegyzési fénykép", 6: "A hálótársak", 7: "Ross könyvtári könyve",
    8: "Chandler nem szereti a kutyákat", 9: "A karácsonyi bonbon", 10: "A karácsonyi tatu",
    11: "A túrótorta", 12: "Az ébren töltött éjszaka", 13: "Rosita kimúlik",
    14: "Betöltöttük a harmincat", 15: "Joey új agya", 16: "Ez történt Londonban",
    17: "Az olcsó menyasszonyi ruha", 18: "Joey díja", 19: "Ross és Monica unokatestvére",
    20: "Rachel nagy csókja", 21: "A beszédek", 22: "Chandler apja",
    23: "Monica és Chandler esküvője 1.", 24: "Monica és Chandler esküvője 2."
  };
  const CATS = {
    kimondta: "Ki mondta?", folytasd: "Folytasd!", sorrend: "Melyik volt előbb?", szam: "Számok",
    helyszin: "Helyszín", epizod: "Melyik részben?", emoji: "Emoji-rejtvény", kakukk: "Kakukktojás",
    igazhamis: "Igaz vagy hamis?", szinkron: "Szinkronos", cselekmeny: "Cselekmény"
  };
  const DIFF = { 1: "könnyű", 2: "közepes", 3: "nehéz" };
  const TIER_W = { A: 3, B: 2, C: 1 };

  const LEVELS = {
    joey: {
      name: "Joey-szint", emoji: "🍕", sub: "Könnyű · 20 kérdés · 50/50 segítség",
      count: 20, timer: 0, fifty: 1,
      weight: q => q.diff === 1 ? 1 : (q.diff === 2 && q.tier === "A" ? 0.6 : 0)
    },
    rachel: {
      name: "Rachel-szint", emoji: "👗", sub: "Közepes · 20 kérdés · 50/50 segítség",
      count: 20, timer: 0, fifty: 1,
      weight: q => q.diff === 2 ? 1 : q.diff === 1 ? 0.35 : (q.tier !== "C" ? 0.5 : 0)
    },
    ross: {
      name: "Ross-szint", emoji: "🦕", sub: "Nehéz · 20 kérdés · 30 mp-es időlimit",
      count: 20, timer: 30, fifty: 0,
      weight: q => q.diff === 3 ? 1 : q.diff === 2 ? 0.4 : 0
    },
    monica: {
      name: "Monica-mód", emoji: "🧽", sub: "Egy hiba, és vége · egyre nehezebb · 20 mp",
      count: Infinity, timer: 20, fifty: 0,
      weight: () => 1
    }
  };

  // ---------- segédek ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  }
  function norm(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
  }
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = el("div", { class: "toast", role: "status" }); document.body.append(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function show(...nodes) { app.replaceChildren(...nodes.filter(n => n !== null && n !== undefined && n !== false)); }
  function epLabel(ep) { return ep ? `7×${String(ep).padStart(2, "0")} – ${EPISODES[ep]}` : "Az egész évad"; }
  function srcTime(src) { const m = /(\d\d:\d\d)/.exec(src || ""); return m ? m[1] : ""; }
  function baseUrl() { return location.href.split("?")[0].split("#")[0]; }
  function challengeUrl(lvl, seed) { return `${baseUrl()}?lvl=${lvl}&seed=${seed}`; }
  function newSeed() { return Math.floor(Math.random() * 900000) + 100000; }

  // ---------- kérdések sorsolása ----------
  function pickQuestions(lvlKey, seed) {
    const L = LEVELS[lvlKey];
    const rnd = mulberry32(seed);
    const keyed = ALL
      .map(q => ({ q, w: L.weight(q) * TIER_W[q.tier] }))
      .filter(x => x.w > 0)
      .map(x => ({ q: x.q, k: Math.pow(rnd(), 1 / x.w) }))
      .sort((a, b) => b.k - a.k)
      .map(x => x.q);

    let picked;
    if (L.count === Infinity) {
      // Monica-mód: mind, egyre nehezebb sorrendben (szinten belül véletlen)
      picked = [1, 2, 3].flatMap(d => keyed.filter(q => q.diff === d));
    } else {
      const perEp = {}, perCat = {}, out = [];
      const catMax = { emoji: 3, epizod: 2, sorrend: 3, kimondta: 5, folytasd: 3, igazhamis: 3, kakukk: 2 };
      for (const q of keyed) {
        if (out.length >= L.count) break;
        const epMax = q.ep === 0 ? 4 : 2;
        if ((perEp[q.ep] || 0) >= epMax) continue;
        if ((perCat[q.cat] || 0) >= (catMax[q.cat] || 7)) continue;
        out.push(q);
        perEp[q.ep] = (perEp[q.ep] || 0) + 1;
        perCat[q.cat] = (perCat[q.cat] || 0) + 1;
      }
      for (const q of keyed) { if (out.length >= L.count) break; if (!out.includes(q)) out.push(q); }
      picked = out.sort((a, b) => a.diff - b.diff);
    }
    // válaszlehetőségek keverése (szintén a seedből, hogy a kihívás azonos legyen)
    return picked.map(q => {
      const p = Object.assign({}, q);
      if (q.type === "mc" || q.type === "multi") {
        const correct = q.type === "mc" ? [q.answer] : q.answer;
        p.view = shuffle(q.options.map((t, i) => ({ t, ok: correct.includes(i) })), rnd);
      } else if (q.type === "order") {
        let s = shuffle(q.items.map((t, i) => ({ t, i })), rnd);
        if (s.every((x, i) => x.i === i)) s = s.slice(1).concat(s[0]);
        p.view = s;
      }
      return p;
    });
  }

  // ---------- állapot ----------
  let G = null;
  let timerH = null;

  function stopTimer() { if (timerH) { cancelAnimationFrame(timerH); timerH = null; } }

  // ---------- főmenü ----------
  function renderHome() {
    stopTimer();
    G = null;
    const params = new URLSearchParams(location.search);
    const cLvl = params.get("lvl"), cSeed = parseInt(params.get("seed"), 10);
    const hasChallenge = LEVELS[cLvl] && Number.isFinite(cSeed);

    const levelBtn = key => {
      const L = LEVELS[key];
      const best = store("jb7-best-" + key);
      return el("button", { class: "level", type: "button", onclick: () => startGame(key, newSeed()) },
        el("span", { class: "em", "aria-hidden": "true", text: L.emoji }),
        el("span", null, el("b", { text: L.name }), el("small", { text: L.sub })),
        el("span", { class: "best", text: best ? `Rekord: ${best}${key === "monica" ? "" : "/20"}` : "" })
      );
    };

    show(
      hasChallenge ? el("div", { class: "challenge pop" },
        el("div", null, "🏆 ", el("b", { text: "Kihívást kaptál!" }), ` Ugyanazokat a kérdéseket kapod (${LEVELS[cLvl].name}), mint aki küldte.`),
        el("div", { class: "row" },
          el("button", { class: "btn", type: "button", onclick: () => startGame(cLvl, cSeed) }, "Elfogadom a kihívást"))
      ) : null,
      el("section", { class: "card pop" },
        el("h2", { text: "Mennyire ismered a 7. évadot?" }),
        el("p", { class: "intro" }, "Eljegyzés, karácsonyi tatu, padlóról evett túrótorta és egy esküvő, ahol a vőlegény majdnem meglép. Válassz szintet!"),
        el("div", { class: "levels" }, ...Object.keys(LEVELS).map(levelBtn)),
        el("p", { class: "muted", style: "margin:14px 0 0;font-size:14px" },
          "Kérdéstípusok: Ki mondta? · Folytasd! · Melyik volt előbb? · számok · helyszínek · emoji-rejtvények · szinkronos különlegességek.")
      )
    );
  }

  // ---------- játék ----------
  function startGame(lvl, seed) {
    const qs = pickQuestions(lvl, seed);
    G = { lvl, seed, qs, i: 0, res: [], fifty: LEVELS[lvl].fifty, answered: false, t0: 0 };
    if (location.search) history.replaceState(null, "", baseUrl());
    renderQuestion();
  }

  function renderQuestion() {
    stopTimer();
    const L = LEVELS[G.lvl];
    const q = G.qs[G.i];
    G.answered = false;
    G.sel = new Set();
    G.order = [];
    G.t0 = performance.now();
    const total = L.count === Infinity ? G.qs.length : L.count;
    const score = G.res.filter(r => r.ok).length;

    const hud = el("div", { class: "hud" },
      el("span", { class: "lvl", text: `${L.emoji} ${L.name}` }),
      el("span", { text: L.count === Infinity ? `Sorozat: ${score}` : `${G.i + 1}/${total} · ${score} pont` })
    );
    const bar = el("div", { class: "bar" }, el("div", { style: `width:${L.count === Infinity ? Math.min(100, score * 2) : (G.i / total) * 100}%` }));

    const card = el("section", { class: "card pop" });
    if (L.timer) card.append(el("div", { class: "timer" }, el("div", { id: "tbar" })));
    card.append(
      el("div", { class: "chips" },
        el("span", { class: "chip", text: CATS[q.cat] || q.cat }),
        el("span", { class: `chip d${q.diff}`, text: DIFF[q.diff] })
      ),
      el("div", { class: "question", text: q.q })
    );
    const area = el("div", { id: "area" });
    card.append(area);
    buildAnswerArea(q, area);

    if (G.fifty > 0 && q.type === "mc" && q.view.length >= 4) {
      card.append(el("div", { class: "jokers" },
        el("button", { class: "btn ghost small", type: "button", id: "fiftyBtn", onclick: useFifty }, `🎯 50/50 (${G.fifty})`)
      ));
    }
    card.append(el("div", { id: "fb" }));
    show(hud, bar, card);
    if (q.type === "order") drawOrder();
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (L.timer) runTimer(q.type === "order" || q.type === "multi" ? L.timer + 15 : L.timer);
  }

  function runTimer(sec) {
    const bar = document.getElementById("tbar");
    const end = performance.now() + sec * 1000;
    const tick = () => {
      if (!G || G.answered) return;
      const left = end - performance.now();
      if (bar) bar.style.width = Math.max(0, (left / (sec * 1000)) * 100) + "%";
      if (left <= 0) { finish(false, true); return; }
      timerH = requestAnimationFrame(tick);
    };
    timerH = requestAnimationFrame(tick);
  }

  const KEYS = "ABCDEF";

  function buildAnswerArea(q, area) {
    if (q.type === "mc") {
      area.append(el("div", { class: "opts" }, q.view.map((o, i) =>
        el("button", { class: "opt", type: "button", "data-i": i, onclick: () => answerMc(i) },
          el("span", { class: "key", text: KEYS[i] }), el("span", { text: o.t })))));
    } else if (q.type === "tf") {
      area.append(el("div", { class: "opts tf" },
        el("button", { class: "opt", type: "button", "data-v": "1", onclick: () => answerTf(true) }, "Igaz"),
        el("button", { class: "opt", type: "button", "data-v": "0", onclick: () => answerTf(false) }, "Hamis")));
    } else if (q.type === "multi") {
      area.append(el("p", { class: "hint", text: "Jelöld be az összes jót, aztán nyomd meg a Kész gombot." }));
      area.append(el("div", { class: "opts" }, q.view.map((o, i) =>
        el("button", { class: "opt", type: "button", "data-i": i, "aria-pressed": "false", onclick: e => toggleMulti(i, e.currentTarget) },
          el("span", { class: "key", text: "✓" }), el("span", { text: o.t })))));
      area.append(el("div", { class: "row" }, el("button", { class: "btn", type: "button", id: "doneBtn", onclick: answerMulti }, "Kész")));
    } else if (q.type === "order") {
      area.append(el("p", { class: "hint", text: "Koppints az elemekre a helyes sorrendben. A kiválasztottra koppintva visszateheted." }));
      area.append(el("div", { class: "order-picked", id: "picked" }));
      area.append(el("div", { class: "opts order-pool", id: "pool" }));
      area.append(el("div", { class: "row" }, el("button", { class: "btn", type: "button", id: "doneBtn", disabled: true, onclick: answerOrder }, "Kész")));
    } else if (q.type === "text") {
      const inp = el("input", { class: "text-in", type: "text", id: "txt", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Írd be a választ…",
        onkeydown: e => { if (e.key === "Enter") answerText(); } });
      area.append(inp, el("div", { class: "row" }, el("button", { class: "btn", type: "button", onclick: answerText }, "Kész")));
      setTimeout(() => inp.focus(), 50);
    }
  }

  function drawOrder() {
    const q = G.qs[G.i];
    const picked = document.getElementById("picked"), pool = document.getElementById("pool");
    if (!picked) return;
    picked.replaceChildren(...G.order.map((vi, n) =>
      el("button", { class: "opt selected", type: "button", onclick: () => { if (G.answered) return; G.order.splice(n, 1); drawOrder(); } },
        el("span", { class: "key", text: String(n + 1) }), el("span", { text: q.view[vi].t }))));
    pool.replaceChildren(...q.view.map((o, vi) => G.order.includes(vi) ? null :
      el("button", { class: "opt", type: "button", onclick: () => { if (G.answered) return; G.order.push(vi); drawOrder(); } },
        el("span", { class: "key", text: "+" }), el("span", { text: o.t }))).filter(Boolean));
    const done = document.getElementById("doneBtn");
    if (done) done.disabled = G.order.length !== q.view.length;
  }

  function useFifty() {
    const q = G.qs[G.i];
    if (G.answered || G.fifty <= 0) return;
    G.fifty--;
    const wrong = q.view.map((o, i) => o.ok ? -1 : i).filter(i => i >= 0);
    shuffle(wrong, Math.random).slice(0, 2).forEach(i => {
      const b = document.querySelector(`.opt[data-i="${i}"]`);
      if (b) { b.classList.add("gone"); b.setAttribute("disabled", ""); }
    });
    const fb = document.getElementById("fiftyBtn");
    if (fb) fb.remove();
  }

  function lockOpts() { document.querySelectorAll("#area .opt").forEach(b => b.setAttribute("disabled", "")); }

  function answerMc(i) {
    if (G.answered) return;
    const q = G.qs[G.i];
    lockOpts();
    q.view.forEach((o, k) => {
      const b = document.querySelector(`.opt[data-i="${k}"]`);
      if (o.ok) b.classList.add("correct"); else if (k === i) b.classList.add("wrong");
    });
    finish(q.view[i].ok);
  }
  function answerTf(v) {
    if (G.answered) return;
    const q = G.qs[G.i];
    lockOpts();
    const ok = v === q.answer;
    document.querySelector(`.opt[data-v="${q.answer ? 1 : 0}"]`).classList.add("correct");
    if (!ok) document.querySelector(`.opt[data-v="${v ? 1 : 0}"]`).classList.add("wrong");
    finish(ok);
  }
  function toggleMulti(i, btn) {
    if (G.answered) return;
    if (G.sel.has(i)) G.sel.delete(i); else G.sel.add(i);
    btn.classList.toggle("selected", G.sel.has(i));
    btn.setAttribute("aria-pressed", String(G.sel.has(i)));
  }
  function answerMulti() {
    if (G.answered) return;
    const q = G.qs[G.i];
    lockOpts();
    let ok = true;
    q.view.forEach((o, k) => {
      const b = document.querySelector(`.opt[data-i="${k}"]`);
      const s = G.sel.has(k);
      b.classList.remove("selected");
      if (o.ok) b.classList.add("correct");
      else if (s) b.classList.add("wrong");
      if (o.ok !== s) ok = false;
    });
    const d = document.getElementById("doneBtn"); if (d) d.remove();
    finish(ok);
  }
  function answerOrder() {
    if (G.answered) return;
    const q = G.qs[G.i];
    const ok = G.order.every((vi, n) => q.view[vi].i === n);
    lockOpts();
    document.querySelectorAll("#picked .opt").forEach((b, n) => b.classList.add(q.view[G.order[n]].i === n ? "correct" : "wrong"));
    const d = document.getElementById("doneBtn"); if (d) d.remove();
    finish(ok);
  }
  function answerText() {
    if (G.answered) return;
    const q = G.qs[G.i];
    const inp = document.getElementById("txt");
    const v = norm(inp.value);
    if (!v) { inp.focus(); return; }
    inp.setAttribute("disabled", "");
    finish(q.answer.some(a => norm(a) === v));
  }

  function correctText(q) {
    if (q.type === "mc") return q.options[q.answer];
    if (q.type === "multi") return q.answer.map(i => q.options[i]).join(", ");
    if (q.type === "tf") return q.answer ? "Igaz" : "Hamis";
    if (q.type === "text") return q.answer[0];
    return null;
  }

  const OK_LINES = ["Ez az!", "Pontosan!", "Hibátlan!", "Így van!", "Stimmel!", "Talált!"];
  const BAD_LINES = ["Nem talált…", "Sajnos nem.", "Nem egészen.", "Hoppá!", "Ez nem az."];

  function finish(ok, timeout) {
    if (G.answered) return;
    G.answered = true;
    stopTimer();
    const q = G.qs[G.i];
    const ms = performance.now() - G.t0;
    G.res.push({ q, ok, ms, timeout: !!timeout });
    if (timeout) lockOpts();
    const jf = document.getElementById("fiftyBtn"); if (jf) jf.remove();

    const L = LEVELS[G.lvl];
    const isLast = L.count === Infinity ? (!ok || G.i + 1 >= G.qs.length) : G.i + 1 >= G.qs.length;
    const fb = document.getElementById("fb");
    const ct = correctText(q);
    fb.replaceChildren(el("div", { class: `feedback ${ok ? "ok" : "bad"} pop` },
      el("div", { class: "verdict", text: timeout ? "⏰ Lejárt az idő!" : ok ? "✅ " + OK_LINES[G.i % OK_LINES.length] : "❌ " + BAD_LINES[G.i % BAD_LINES.length] }),
      !ok && ct ? el("div", { class: "ans", text: "Helyes válasz: " + ct }) : null,
      !ok && q.type === "order" ? el("ol", null, q.items.map(t => el("li", { text: t }))) : null,
      el("div", { text: q.explain }),
      el("div", { class: "src", text: `📺 ${epLabel(q.ep)}${srcTime(q.src) ? " · " + srcTime(q.src) : ""}` }),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", id: "nextBtn", onclick: () => {
          if (isLast) renderResult(); else { G.i++; renderQuestion(); }
        } }, isLast ? "Eredmény 🎉" : "Következő ➜"))
    ));
    const nb = document.getElementById("nextBtn");
    nb.focus({ preventScroll: true });
    fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- eredmény ----------
  const BANDS = [
    { min: 0, emoji: "🍰", title: "Padlóról evett túrótorta", text: "A tudásod valahol a folyosó padlóján hever… De Joey szerint még ehető. Villát elő, és próbáld újra!" },
    { min: 0.21, emoji: "🦔", title: "Karácsonyi tatu", text: "Lelkes vagy, csak nem egészen az, akire számítottunk. A Mikulás déli képviselőjeként azért megállod a helyed." },
    { min: 0.41, emoji: "📸", title: "Az eljegyzési fénykép", text: "Próbálkozol, de a mosolyod még kicsit Chandleres. Nézz le… aztán fel!" },
    { min: 0.61, emoji: "🍪", title: "Nestley Couqueax receptje", text: "Majdnem tökéletes! Csak kiderült, hogy néhány válasz végig ott volt a zacskó hátulján." },
    { min: 0.81, emoji: "🎂", title: "Betöltöttük a harmincat", text: "Érett, bölcs, alig sírtál. Ennyi tudással Joey szerint már nem is öregszel." },
    { min: 1, emoji: "💍", title: "Monica és Chandler esküvője", text: "Hibátlan! Monica sírva fakad, Joey pedig a világháborús egyenruhájában összead téged a kvízzel." }
  ];
  const MONICA_BANDS = [
    { min: 0, emoji: "🧤", title: "„Ne legyél ilyen ovis!”", text: "Monica már a kiárusítás ajtajában leszedett volna. Gyakorolj még a Joey-szinten!" },
    { min: 5, emoji: "😤", title: "„Fel vagyok húzva!”", text: "Szép kezdés, de Monica rendszere ennél többet követel." },
    { min: 12, emoji: "📋", title: "„Nem tudod a rendszert!”", text: "Komoly sorozat! Monica megengedi, hogy segíts a bonbonkészítésben. Talán." },
    { min: 25, emoji: "👰", title: "Monica tanúja", text: "Elképesztő! Monica téged választana tanúnak – még Rachel és Phoebe előtt." }
  ];
  const PERSONAS = {
    chandler: { emoji: "😏", name: "Chandler vagy", text: "Minden beszólást fejből tudsz. „Ismer engem valaki?” – hát te igen." },
    monica: { emoji: "🧽", name: "Monica vagy", text: "A számok, listák és sorszámozott tepsik mestere. A 17. tepsi volt a legjobb – ugye tudtad?" },
    ross: { emoji: "🦕", name: "Ross vagy", text: "Az időrend a szakterületed, 7 milliárd évre visszamenőleg. Csak a Delaware-t ne felejtsd el!" },
    phoebe: { emoji: "🎸", name: "Phoebe vagy", text: "Senki sem érti, honnan tudod, de tudod. Múbalhé ide vagy oda." },
    rachel: { emoji: "👗", name: "Rachel vagy", text: "Tudod, ki hol volt, kivel, és milyen szmokingban. A pletykák királynője." },
    joey: { emoji: "🍕", name: "Joey vagy", text: "A lényeget érted, a részletek ráérnek. „Mi az a toner?”" }
  };
  const CAT_PERSONA = { kimondta: "chandler", folytasd: "chandler", szam: "monica", sorrend: "ross",
    szinkron: "phoebe", kakukk: "phoebe", igazhamis: "phoebe", helyszin: "rachel", epizod: "rachel", emoji: "rachel" };
  const PERSONA_ORDER = ["chandler", "monica", "ross", "phoebe", "rachel"];

  function persona(res) {
    const okRate = res.filter(r => r.ok).length / Math.max(1, res.length);
    if (okRate < 0.3) return PERSONAS.joey;
    const st = {};
    res.forEach(r => { const p = CAT_PERSONA[r.q.cat]; if (!p) return; st[p] = st[p] || { n: 0, ok: 0 }; st[p].n++; if (r.ok) st[p].ok++; });
    // a legjobb arányú kategória-persona; egyenlőségnél a több kérdés, majd a fix sorrend dönt
    let best = "rachel", bestScore = -1;
    for (const p of PERSONA_ORDER) {
      const s = st[p];
      if (!s || s.n < 2) continue;
      const sc = s.ok / s.n + s.n * 0.001;
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    return PERSONAS[best];
  }
  function badges(res) {
    const out = [];
    const by = c => res.filter(r => r.q.cat === c);
    const okN = res.filter(r => r.ok).length;
    const avg = res.reduce((s, r) => s + r.ms, 0) / Math.max(1, res.length);
    if (avg < 5000 && okN / res.length >= 0.6 && res.length >= 10) out.push("⚡ Villám-Joey");
    const sz = by("szam"); if (sz.length >= 3 && sz.every(r => r.ok)) out.push("🎯 Monica-precízió");
    const so = by("sorrend"); if (so.length >= 1 && so.every(r => r.ok)) out.push("🧩 Ross, az időrendmester");
    if (so.length >= 2 && so.every(r => !r.ok)) out.push("🙈 Rossz Ross");
    const sy = by("szinkron"); if (sy.length >= 2 && sy.every(r => r.ok)) out.push("🎙️ Szinkronguru");
    const km = res.filter(r => r.q.cat === "kimondta" || r.q.cat === "folytasd"); if (km.length >= 4 && km.every(r => r.ok)) out.push("🗣️ Idézetkirály");
    if (res.some(r => r.q.id === "e11-02" && r.ok) || res.some(r => r.q.id === "s7-01" && r.ok)) out.push("🍰 Tortatolvaj");
    if (res.some(r => r.timeout)) out.push("⏰ „Csak két kezem van!”");
    return out;
  }

  function renderResult() {
    stopTimer();
    const L = LEVELS[G.lvl];
    const res = G.res;
    const okN = res.filter(r => r.ok).length;
    const isMonica = L.count === Infinity;
    const total = isMonica ? res.length : L.count;
    const pct = okN / Math.max(1, total);
    const band = isMonica
      ? MONICA_BANDS.filter(b => okN >= b.min).pop()
      : BANDS.filter(b => pct >= b.min - 1e-9).pop();

    const bestKey = "jb7-best-" + G.lvl;
    const prev = parseInt(store(bestKey) || "0", 10);
    const isRecord = okN > prev;
    if (isRecord) store(bestKey, String(okN));

    const squares = res.map(r => r.ok ? "🟩" : r.timeout ? "🟨" : "🟥").join("");
    const scoreText = isMonica ? `${okN} jó válasz egymás után` : `${okN}/${total}`;
    const link = challengeUrl(G.lvl, G.seed);
    const shareText = `Jóbarátok 7. évad kvíz – ${L.name}: ${scoreText} ${band.emoji}\n„${band.title.replace(/[„”]/g, "")}”\n${squares}\nBírod überelni? ${link}`;
    const per = persona(res);
    const bdg = badges(res);
    const missed = res.filter(r => !r.ok);

    show(
      el("section", { class: "card pop" },
        el("div", { class: "result-emoji", "aria-hidden": "true", text: band.emoji }),
        el("div", { class: "score", text: isMonica ? String(okN) : `${okN}/${total}` }),
        isMonica ? el("p", { class: "center muted", style: "margin:0", text: "jó válasz egymás után" }) : null,
        el("div", { class: "band", text: band.title }),
        el("p", { class: "center", text: band.text }),
        isRecord && prev > 0 ? el("p", { class: "center", style: "font-weight:800", text: `🏅 Új rekord! (Előző: ${prev})` }) : null,
        el("div", { class: "squares", "aria-label": `${okN} jó válasz`, text: squares }),
        el("div", { class: "persona" },
          el("span", { class: "em", "aria-hidden": "true", text: per.emoji }),
          el("div", null, el("b", { text: per.name }), el("div", { class: "muted", text: per.text }))),
        bdg.length ? el("div", { class: "badges" }, bdg.map(b => el("span", { class: "badge", text: b }))) : null,
        el("div", { class: "row" },
          el("button", { class: "btn", type: "button", onclick: () => share(shareText) }, "📤 Eredmény megosztása"),
          el("button", { class: "btn ghost", type: "button", onclick: () => copy(link, "Kihívás link kimásolva!") }, "🏆 Kihívás link")),
        el("div", { class: "row" },
          el("button", { class: "btn ghost", type: "button", onclick: () => startGame(G.lvl, newSeed()) }, "🔁 Új játék"),
          el("button", { class: "btn ghost", type: "button", onclick: renderHome }, "🏠 Főmenü"))
      ),
      missed.length ? el("section", { class: "card" },
        el("details", null,
          el("summary", { text: `Mit rontottam el? (${missed.length})` }),
          missed.map(r => el("div", { class: "missed" },
            el("b", { text: r.q.q }),
            r.q.type === "order"
              ? el("ol", null, r.q.items.map(t => el("li", { text: t })))
              : el("div", { text: "✅ " + correctText(r.q) }),
            el("div", { class: "muted", text: `${epLabel(r.q.ep)} – ${r.q.explain}` })
          ))
        )
      ) : null
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg || "Kimásolva!"); }
    catch (e) {
      const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand("copy"); toast(msg || "Kimásolva!"); } catch (e2) { prompt("Másold ki:", text); }
      ta.remove();
    }
  }
  async function share(text) {
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    copy(text, "Eredmény kimásolva – illeszd be a csetbe!");
  }

  // ---------- billentyűzet ----------
  document.addEventListener("keydown", e => {
    if (!G || e.target.tagName === "INPUT" || e.ctrlKey || e.metaKey || e.altKey) return;
    const q = G.qs[G.i];
    if (G.answered) {
      if (e.key === "Enter" || e.key === " ") { const nb = document.getElementById("nextBtn"); if (nb && document.activeElement !== nb) { e.preventDefault(); nb.click(); } }
      return;
    }
    if (q.type === "mc") {
      const n = KEYS.indexOf(e.key.toUpperCase());
      if (n >= 0 && n < q.view.length) { const b = document.querySelector(`.opt[data-i="${n}"]`); if (b && !b.hasAttribute("disabled")) answerMc(n); }
    } else if (q.type === "tf") {
      if (e.key.toLowerCase() === "i") answerTf(true);
      if (e.key.toLowerCase() === "h") answerTf(false);
    }
  });

  document.getElementById("homeBtn").addEventListener("click", () => {
    if (G && G.res.length && !confirm("Biztosan kilépsz? Az aktuális játék elvész.")) return;
    renderHome();
  });

  if (!ALL.length) {
    show(el("section", { class: "card" }, el("p", { text: "Nem sikerült betölteni a kérdéseket (questions.js)." })));
  } else {
    renderHome();
  }
})();
