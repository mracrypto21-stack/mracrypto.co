/* Cenas grafiki mājaslapā: ikrīta kripto analīzes bloki (BTC, ETH, Total Cap) un galvenās lapas tirgus panelis (#livePanel).
   Dati: assets/btc-chart.json, assets/eth-chart.json, assets/totalcap-chart.json (tos stundā ieraksta VPS cron;
   apmeklētāja pārlūks CoinGecko NEpiesaista). Ja fails nav pieejams, ir bojāts, nepilns vai vecāks par 6 h,
   attiecīgais grafiks paliek paslēpts (nav tukša bloka).
   Marķējums (<div class="au-chart" data-asset="btc|eth|total" hidden>) ir fragmentā vai index.html; šis skripts to aizpilda.
   Viena loģika visiem grafikiem; atšķirības ir ASSETS konfigurācijā un atribūtos:
     data-lang="lv|en|auto"  auto = seko lapas valodai (panelī)
     data-mini               mazais līnijas grafiks bez asīm (panelī): zīmē līniju, uzraksta cenu (.lp-price) un 24 h diapazonu (.au-hilo)
   Periods katrai grupai (analīze / panelis) ir savs, dati ir kopīgi. */
(function () {
  'use strict';
  if (window.btcChartInit) return;

  var MAX_AGE = 6 * 3600 * 1000;
  var RANGES = ['1d', '1w', '1m'];
  var ASSETS = {
    btc: {
      url: 'assets/btc-chart.json', need: RANGES, grid: 1, div: 1,
      ga: { '1d': 'open_btcgrafiks_diena', '1w': 'open_btcgrafiks_nedela', '1m': 'open_btcgrafiks_menesis' },
      gaLp: { '1d': 'open_panelis_btc_diena', '1w': 'open_panelis_btc_nedela', '1m': 'open_panelis_btc_menesis' },
      label: { lv: 'Bitcoin cenas grafiks, ASV dolāros', en: 'Bitcoin price chart, US dollars' }
    },
    eth: {
      url: 'assets/eth-chart.json', need: RANGES, grid: 1, div: 1,
      ga: { '1d': 'open_ethgrafiks_diena', '1w': 'open_ethgrafiks_nedela', '1m': 'open_ethgrafiks_menesis' },
      label: { lv: 'Ethereum cenas grafiks, ASV dolāros', en: 'Ethereum price chart, US dollars' }
    },
    total: {
      /* vērtības failā ir USD miljardos; ass rāda triljonus ($). 1W/1M ir failā tikai tad, ja vēsture tos aptver, tāpēc obligāts ir tikai 1D */
      url: 'assets/totalcap-chart.json', need: ['1d'], grid: 0.01, div: 1000, trillions: true,
      ga: { '1d': 'open_totalgrafiks_diena', '1w': 'open_totalgrafiks_nedela', '1m': 'open_totalgrafiks_menesis' },
      label: { lv: 'Kopējā kriptovalūtu tirgus vērtības grafiks, ASV dolāros', en: 'Total crypto market cap chart, US dollars' }
    }
  };
  var LINE = '#EAD39C';          /* zeltaini krēmkrāsa */
  var GRID = 'rgba(232,168,60,0.14)';
  var TXT = '#C9AF87';
  var NS = 'http://www.w3.org/2000/svg';
  var HOUR = 3600 * 1000;

  var st = {};   /* st[asset] = {data, avail, ready, loading, ro}  (kopīgs visām grupām) */
  Object.keys(ASSETS).forEach(function (k) { st[k] = { data: null, avail: [], ready: false, loading: false, ro: null }; });
  var rng = {};  /* rng[grupa + ':' + asset] = izvēlētais periods; grupa: 'lp' (panelis) vai 'au' (analīze) */

  function groupOf(box) { return box.closest && box.closest('#livePanel') ? 'lp' : 'au'; }
  function assetOf(box) { var k = box.getAttribute('data-asset') || 'btc'; return ASSETS[k] ? k : 'btc'; }
  function rangeOf(box) {
    var s = st[assetOf(box)], r = rng[groupOf(box) + ':' + assetOf(box)] || '1d';
    return s.avail.indexOf(r) < 0 ? s.avail[0] : r;
  }
  function langOf(box) {
    var l = box.getAttribute('data-lang');
    if (l === 'auto' || !l) l = document.documentElement.getAttribute('lang');
    return l === 'en' ? 'en' : 'lv';
  }

  /* ---------- laiks (Rīgas josla, kā pārējā lapa) ---------- */
  var fmtParts = null;
  try {
    fmtParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Riga', hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  } catch (e) {}
  function riga(ms) {
    if (!fmtParts) { var d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), n: d.getUTCMinutes() }; }
    var p = fmtParts.formatToParts(new Date(ms)), o = {};
    for (var i = 0; i < p.length; i++) o[p[i].type] = parseInt(p[i].value, 10);
    return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, n: o.minute };
  }
  var MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* x ass atzīmes uz "apaļiem" laikiem: 1D = stundas, 1W/1M = Rīgas pusnakts */
  function xTicks(t0, t1, r, maxN) {
    var steps = r === '1d' ? [3, 4, 6, 12] : (r === '1w' ? [1, 2, 3] : [3, 5, 7, 10, 14]);
    var first = Math.ceil(t0 / HOUR) * HOUR, cand = [], t, p;
    for (t = first; t <= t1; t += HOUR) {
      p = riga(t);
      if (p.n !== 0) continue;
      if (r === '1d') cand.push({ t: t, h: p.h, d: p.d, m: p.m, k: p.h });
      else if (p.h === 0) cand.push({ t: t, h: 0, d: p.d, m: p.m, k: Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000) });
    }
    for (var i = 0; i < steps.length; i++) {
      var sel = [];
      for (var j = 0; j < cand.length; j++) if (cand[j].k % steps[i] === 0) sel.push(cand[j]);
      if (sel.length <= maxN) return sel;
    }
    return sel || [];
  }

  /* y ass: "jauki" soļi (1-2-2.5-5 x 10^n), kas ir `grid` daudzkārtņi (cenām 1 $, Total 0,01 T), ne vairāk kā maxN atzīmes */
  function yTicks(lo, hi, maxN, grid) {
    var m = [1, 2, 2.5, 5], mag = Math.pow(10, Math.floor(Math.log((hi - lo) / maxN / 10) / Math.LN10)), out, i, step, v, q;
    for (;; mag *= 10) {
      for (i = 0; i < m.length; i++) {
        step = m[i] * mag;
        q = step / grid;
        if (Math.abs(q - Math.round(q)) > 1e-6) continue;
        out = [];
        for (v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
        if (out.length <= maxN) return out;
      }
    }
  }

  function money(v, lang, a) {
    if (a.trillions) {
      var t = v.toFixed(2);
      return lang === 'en' ? '$' + t + 'T' : t.replace('.', ',') + '\u00a0T\u00a0$';
    }
    var s = String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '\u00a0');
    return lang === 'en' ? '$' + s : s + '\u00a0$';
  }
  function dayLabel(tk, lang) { return lang === 'en' ? tk.d + ' ' + MON_EN[tk.m - 1] : pad(tk.d) + '.' + pad(tk.m) + '.'; }

  function el(name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- zīmēšana ---------- */
  function draw(box) {
    var key = assetOf(box), a = ASSETS[key], s = st[key];
    var plot = box.querySelector('.au-plot');
    var range = rangeOf(box), mini = box.hasAttribute('data-mini');
    var raw = s.data && s.data.r[mini ? '1d' : range];
    if (!plot || !raw) return;
    var W = Math.floor(plot.clientWidth);
    if (W < (mini ? 60 : 120)) return;                     /* bloks aizvērts / paslēpts: ResizeObserver uzzīmēs, kad kļūs redzams */
    plot._w = W;
    var lang = langOf(box);
    var pts = raw.map(function (p) { return [p[0], p[1] / a.div]; });
    var last = pts[pts.length - 1][1];
    var lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < pts.length; i++) { if (pts[i][1] < lo) lo = pts[i][1]; if (pts[i][1] > hi) hi = pts[i][1]; }

    /* cena un 24 h diapazons tekstā (ja marķējumā ir šādi elementi) */
    var pe = box.querySelector('.lp-price');
    if (pe) pe.textContent = money(last, lang, a);
    var he = box.querySelector('.au-hilo');
    if (he) {   /* īss diapazons vienā rindā: "24 h: 2 183 – 2 275 $" (LV), "24h: $2,183 – $2,275" (EN) */
      var ml = money(lo, lang, a), mh = money(hi, lang, a);
      if (lang === 'lv') ml = ml.replace(/\u00a0(T\u00a0)?\$$/, '');
      he.textContent = (lang === 'en' ? '24h: ' : '24 h: ') + ml + ' \u2013 ' + mh;
    }

    var H, fs = 11, mL = 0, mR = 14, mT = 10, mB = 22, yt = [], xt = [];
    if (mini) {
      H = Math.max(52, Math.min(72, Math.round(W * 0.40)));
      mL = 4; mR = 8; mT = 8; mB = 8;
      var pm = (hi - lo) * 0.1 || hi * 0.002;
      lo -= pm; hi += pm;
    } else {
      H = groupOf(box) === 'lp' ? Math.max(118, Math.min(150, Math.round(W * 0.42)))    /* panelī zemāks grafiks */
                                : Math.max(170, Math.min(240, Math.round(W * 0.62)));
      var pad_ = (hi - lo) * 0.08 || hi * 0.002;
      lo -= pad_; hi += pad_;
      yt = yTicks(lo, hi, Math.max(3, Math.floor((H - mT - mB) / 30)), a.grid);
      for (i = 0; i < yt.length; i++) mL = Math.max(mL, money(yt[i], lang, a).length);
      mL = Math.round(mL * 6.4 + 8);                       /* vietas cenu uzrakstiem ($) */
    }

    var t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    var pw = W - mL - mR, ph = H - mT - mB;
    function X(t) { return mL + (t - t0) / (t1 - t0) * pw; }
    function Y(v) { return mT + (hi - v) / (hi - lo) * ph; }

    var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': a.label[lang] });
    svg.style.display = 'block';
    svg.style.maxWidth = '100%';

    if (!mini) {
      for (i = 0; i < yt.length; i++) {
        var y = Y(yt[i]);
        svg.appendChild(el('line', { x1: mL, x2: W - mR, y1: y, y2: y, stroke: GRID, 'stroke-width': 1 }));
        svg.appendChild(el('text', { x: mL - 6, y: y + 4, 'text-anchor': 'end', fill: TXT, 'font-size': fs }, money(yt[i], lang, a)));
      }
      xt = xTicks(t0, t1, range, Math.max(2, Math.floor(pw / 44)));
      for (i = 0; i < xt.length; i++) {
        var x = X(xt[i].t);
        if (x < mL + 14 || x > W - mR - 14) continue;
        svg.appendChild(el('line', { x1: x, x2: x, y1: mT + ph, y2: mT + ph + 4, stroke: GRID, 'stroke-width': 1 }));
        svg.appendChild(el('text', { x: x, y: H - 5, 'text-anchor': 'middle', fill: TXT, 'font-size': fs },
          range === '1d' ? pad(xt[i].h) + ':00' : dayLabel(xt[i], lang)));
      }
    } else {
      svg.appendChild(el('line', { x1: mL, x2: W - mR, y1: mT + ph, y2: mT + ph, stroke: GRID, 'stroke-width': 1 }));
    }
    var d = '';
    for (i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + X(pts[i][0]).toFixed(1) + ' ' + Y(pts[i][1]).toFixed(1);
    svg.appendChild(el('path', { d: d, fill: 'none', stroke: LINE, 'stroke-width': mini ? 1.6 : 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    var lx = X(t1), ly = Y(last);
    svg.appendChild(el('circle', { cx: lx, cy: ly, r: 5, fill: LINE, 'fill-opacity': 0.25 }));
    svg.appendChild(el('circle', { cx: lx, cy: ly, r: 2.6, fill: LINE }));

    plot.textContent = '';
    plot.appendChild(svg);
  }

  function boxes(key, hiddenOnly) {
    var all = document.querySelectorAll('.au-chart' + (hiddenOnly ? '[hidden]' : ':not([hidden])')), out = [];
    for (var i = 0; i < all.length; i++) if (assetOf(all[i]) === key) out.push(all[i]);
    return out;
  }
  function drawAsset(key) { boxes(key, false).forEach(draw); }
  function drawAll() { Object.keys(ASSETS).forEach(drawAsset); }

  function setPressed(box) {
    var s = st[assetOf(box)], cur = rangeOf(box), btns = box.querySelectorAll('.au-rng'), n = 0, i, r;
    for (i = 0; i < btns.length; i++) {
      r = btns[i].getAttribute('data-r');
      btns[i].setAttribute('aria-pressed', r === cur ? 'true' : 'false');
      btns[i].style.display = s.avail.indexOf(r) < 0 ? 'none' : '';   /* periods, ko dati vēl neaptver, nav redzams */
      if (s.avail.indexOf(r) >= 0) n++;
    }
    var row = box.querySelector('.au-rngs');
    if (row) row.style.display = n < 2 ? 'none' : '';                /* ja ir tikai viens periods, pārslēga nav */
  }

  /* ---------- dati ---------- */
  function validRange(a) {
    if (!Array.isArray(a) || a.length < 20) return false;
    for (var k = 0; k < a.length; k++) {
      if (!Array.isArray(a[k]) || !(a[k][0] > 0) || !(a[k][1] > 0)) return false;
      if (k && a[k][0] <= a[k - 1][0]) return false;
    }
    return true;
  }
  /* atgriež pieejamo periodu sarakstu vai null, ja fails nav derīgs */
  function validate(j, cfg) {
    if (!j || j.v !== 1 || !j.r || typeof j.t !== 'string') return null;
    var t = Date.parse(j.t);
    if (!t || Date.now() - t > MAX_AGE || t - Date.now() > 10 * 60 * 1000) return null;
    var avail = [], i;
    for (i = 0; i < RANGES.length; i++) {
      var r = RANGES[i];
      if (validRange(j.r[r])) avail.push(r);
      else if (cfg.need.indexOf(r) >= 0 || j.r[r] !== undefined) return null;   /* obligāts periods trūkst, vai ir, bet bojāts */
    }
    return avail;
  }

  function show(key) {
    var s = st[key];
    boxes(key, true).forEach(function (b) {
      b.hidden = false;
      var pl = b.querySelector('.au-plot');
      if (s.ro && pl) s.ro.observe(pl);
    });
    boxes(key, false).forEach(setPressed);
    drawAsset(key);
  }

  function initAsset(key) {
    var s = st[key], cfg = ASSETS[key];
    if (!boxes(key, true).length) return;
    if (s.ready) { show(key); return; }
    if (s.loading) return;
    s.loading = true;
    fetch(cfg.url, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function (j) {
        var avail = validate(j, cfg);
        if (!avail || !avail.length) throw new Error('bad');
        s.data = j; s.avail = avail; s.ready = true;
        /* pārzīmē tikai tad, ja mainījies platums (augstums mainās paša zīmējuma dēļ; citādi Safari met "ResizeObserver loop" brīdinājumu) */
        if (typeof ResizeObserver === 'function') s.ro = new ResizeObserver(function (es) {
          es.forEach(function (en) {
            var pl = en.target, box = pl.closest('.au-chart');
            if (box && Math.floor(pl.clientWidth) !== pl._w) requestAnimationFrame(function () { draw(box); });   /* ne RO atzvana laikā */
          });
        });
        else window.addEventListener('resize', function () { drawAsset(key); });
        show(key);
      })
      .catch(function () { /* nav datu -> grafiks paliek paslēpts */ })
      .then(function () { s.loading = false; });
  }

  function init() { Object.keys(ASSETS).forEach(initAsset); }

  /* 1D / 1W / 1M pārslēgi (GA tikai pie īstas pārslēgšanas, nevis klikšķa uz jau izvēlēto) */
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.au-chart .au-rng') : null;
    if (!b) return;
    var box = b.closest('.au-chart');
    var key = assetOf(box), s = st[key];
    if (!s.ready) return;
    var r = b.getAttribute('data-r'), g = groupOf(box);
    if (s.avail.indexOf(r) < 0 || r === rangeOf(box)) return;
    rng[g + ':' + key] = r;
    boxes(key, false).forEach(function (x) { if (groupOf(x) === g) { setPressed(x); draw(x); } });
    var names = g === 'lp' ? ASSETS[key].gaLp : ASSETS[key].ga;
    if (names && typeof window.gtag === 'function') window.gtag('event', names[r]);
  });

  /* lapas valoda mainās (LV/EN poga) -> pārzīmē grafikus, kas seko valodai */
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function () { drawAll(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }

  window.btcChartInit = init;
  init();
})();
