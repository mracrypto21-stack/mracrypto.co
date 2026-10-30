/* BTC cenas grafiks ikrīta kripto analīzes BTC blokā.
   Dati: assets/btc-chart.json (to stundā ieraksta VPS cron; apmeklētāja pārlūks CoinGecko NEpiesaista).
   Ja fails nav pieejams, ir bojāts vai vecāks par 6 h, grafiks paliek paslēpts (nav tukša bloka).
   Fragments assets/daily-analysis.html satur tikai <div class="au-chart" hidden> ar pogām; šis skripts to aizpilda. */
(function () {
  'use strict';
  if (window.btcChartInit) return;

  var URL = 'assets/btc-chart.json';
  var MAX_AGE = 6 * 3600 * 1000;
  var RANGES = ['1d', '1w', '1m'];
  var GA = { '1d': 'open_btcgrafiks_diena', '1w': 'open_btcgrafiks_nedela', '1m': 'open_btcgrafiks_menesis' };
  var LINE = '#EAD39C';          /* zeltaini krēmkrāsa */
  var GRID = 'rgba(232,168,60,0.14)';
  var TXT = '#C9AF87';
  var NS = 'http://www.w3.org/2000/svg';
  var HOUR = 3600 * 1000;

  var data = null, range = '1d', ready = false;

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

  /* y ass: "jauki" soļi (1-2-2.5-5) */
  function yTicks(lo, hi, maxN) {
    var m = [1, 2, 2.5, 5], mag = Math.pow(10, Math.floor(Math.log((hi - lo) / maxN / 10) / Math.LN10)), out, i, step, v;
    for (;; mag *= 10) {
      for (i = 0; i < m.length; i++) {
        step = m[i] * mag;
        out = [];
        for (v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v));
        if (out.length <= maxN) return out;
      }
    }
  }

  function money(v, lang) {
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
    var plot = box.querySelector('.au-plot');
    var pts = data && data.r[range];
    if (!plot || !pts) return;
    var W = Math.floor(plot.clientWidth);
    if (W < 120) return;                                   /* bloks aizvērts / paslēpts: ResizeObserver uzzīmēs, kad kļūs redzams */
    var lang = box.getAttribute('data-lang') === 'en' ? 'en' : 'lv';
    var H = Math.max(170, Math.min(240, Math.round(W * 0.62)));
    var fs = 11, mL = 0, mR = 14, mT = 10, mB = 22, i;

    var lo = Infinity, hi = -Infinity;
    for (i = 0; i < pts.length; i++) { if (pts[i][1] < lo) lo = pts[i][1]; if (pts[i][1] > hi) hi = pts[i][1]; }
    var pad_ = (hi - lo) * 0.08 || hi * 0.002;
    lo -= pad_; hi += pad_;
    var yt = yTicks(lo, hi, Math.max(3, Math.floor((H - mT - mB) / 30)));
    for (i = 0; i < yt.length; i++) mL = Math.max(mL, money(yt[i], lang).length);
    mL = Math.round(mL * 6.4 + 8);                         /* vietas cenu uzrakstiem ($) */

    var t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    var pw = W - mL - mR, ph = H - mT - mB;
    function X(t) { return mL + (t - t0) / (t1 - t0) * pw; }
    function Y(v) { return mT + (hi - v) / (hi - lo) * ph; }

    var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': lang === 'en' ? 'Bitcoin price chart, US dollars' : 'Bitcoin cenas grafiks, ASV dolāros' });
    svg.style.display = 'block';
    svg.style.maxWidth = '100%';

    for (i = 0; i < yt.length; i++) {
      var y = Y(yt[i]);
      svg.appendChild(el('line', { x1: mL, x2: W - mR, y1: y, y2: y, stroke: GRID, 'stroke-width': 1 }));
      svg.appendChild(el('text', { x: mL - 6, y: y + 4, 'text-anchor': 'end', fill: TXT, 'font-size': fs }, money(yt[i], lang)));
    }
    var xt = xTicks(t0, t1, range, Math.max(2, Math.floor(pw / 44)));
    for (i = 0; i < xt.length; i++) {
      var x = X(xt[i].t);
      if (x < mL + 14 || x > W - mR - 14) continue;
      svg.appendChild(el('line', { x1: x, x2: x, y1: mT + ph, y2: mT + ph + 4, stroke: GRID, 'stroke-width': 1 }));
      svg.appendChild(el('text', { x: x, y: H - 5, 'text-anchor': 'middle', fill: TXT, 'font-size': fs },
        range === '1d' ? pad(xt[i].h) + ':00' : dayLabel(xt[i], lang)));
    }
    var d = '';
    for (i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + X(pts[i][0]).toFixed(1) + ' ' + Y(pts[i][1]).toFixed(1);
    svg.appendChild(el('path', { d: d, fill: 'none', stroke: LINE, 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    var lx = X(t1), ly = Y(pts[pts.length - 1][1]);
    svg.appendChild(el('circle', { cx: lx, cy: ly, r: 5, fill: LINE, 'fill-opacity': 0.25 }));
    svg.appendChild(el('circle', { cx: lx, cy: ly, r: 2.6, fill: LINE }));

    plot.textContent = '';
    plot.appendChild(svg);
  }

  function drawAll() {
    var b = document.querySelectorAll('#auBox .au-chart:not([hidden])');
    for (var i = 0; i < b.length; i++) draw(b[i]);
  }

  function setPressed() {
    var btns = document.querySelectorAll('#auBox .au-chart .au-rng');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-r') === range ? 'true' : 'false');
  }

  /* ---------- dati ---------- */
  function valid(j) {
    if (!j || j.v !== 1 || !j.r || typeof j.t !== 'string') return false;
    var t = Date.parse(j.t);
    if (!t || Date.now() - t > MAX_AGE || t - Date.now() > 10 * 60 * 1000) return false;
    for (var i = 0; i < RANGES.length; i++) {
      var a = j.r[RANGES[i]];
      if (!Array.isArray(a) || a.length < 20) return false;
      for (var k = 0; k < a.length; k++) {
        if (!Array.isArray(a[k]) || !(a[k][0] > 0) || !(a[k][1] > 0)) return false;
        if (k && a[k][0] <= a[k - 1][0]) return false;
      }
    }
    return true;
  }

  var ro = null, loading = false;
  function show() {
    var boxes = document.querySelectorAll('#auBox .au-chart[hidden]');
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].hidden = false;
      if (ro) ro.observe(boxes[i].querySelector('.au-plot'));
    }
    setPressed();
    drawAll();
  }

  function init() {
    if (!document.querySelector('#auBox .au-chart[hidden]')) return;
    if (ready) { show(); return; }
    if (loading) return;
    loading = true;
    fetch(URL, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function (j) {
        if (!valid(j)) throw new Error('bad');
        data = j; ready = true;
        if (typeof ResizeObserver === 'function') ro = new ResizeObserver(function () { drawAll(); });
        else window.addEventListener('resize', drawAll);
        show();
      })
      .catch(function () { /* nav datu -> grafiks paliek paslēpts */ })
      .then(function () { loading = false; });
  }

  /* 1D / 1W / 1M pārslēgi (GA tikai pie īstas pārslēgšanas, nevis klikšķa uz jau izvēlēto) */
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('#auBox .au-rng') : null;
    if (!b || !ready) return;
    var r = b.getAttribute('data-r');
    if (RANGES.indexOf(r) < 0 || r === range) return;
    range = r;
    setPressed();
    drawAll();
    if (typeof window.gtag === 'function') window.gtag('event', GA[r]);
  });

  window.btcChartInit = init;
  init();
})();
