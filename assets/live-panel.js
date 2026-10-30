/* Tirgus panelis galvenajā lapā (#livePanel): Fear & Greed mērītājs + BTC / ETH / Total Cap grafiki.
   Cenu grafikus zīmē assets/btc-chart.js (viens kods visiem grafikiem); šis skripts dara pārējo:
   - Fear & Greed pusapļa mērītājs no assets/fng.json (stundā to ieraksta VPS cron; avots alternative.me);
   - 24 h izmaiņa (%) no assets/total-cap.json (tas pats fails, kas cenu joslai);
   - paneļa daļu redzamība (katra daļa paslēpta, ja tās fails nav pieejams / ir vecāks par 6 h; ja nav neviena, paslēpts viss panelis);
   - avota rinda un valoda LV/EN.
   Apmeklētāja pārlūks NEpiesaista CoinGecko, alternative.me vai citus ārējos pakalpojumus: tiek lasīti tikai šīs lapas faili. */
(function () {
  'use strict';
  var panel = document.getElementById('livePanel');
  if (!panel) return;
  var MAX_AGE = 6 * 3600 * 1000;
  var NS = 'http://www.w3.org/2000/svg';

  var T = {
    lv: { title: 'Tirgus pārskats', fng: 'Bailu un alkatības indekss', h24: '24 h',
          src: 'Dati', and: ' un ', upd: 'atjaunots', riga: 'Laiki pēc Rīgas laika',
          cls: { 'extreme fear': 'Ļoti lielas bailes', 'fear': 'Bailes', 'neutral': 'Neitrāls', 'greed': 'Alkatība', 'extreme greed': 'Ļoti liela alkatība' } },
    en: { title: 'Market overview', fng: 'Fear & Greed Index', h24: '24h',
          src: 'Data', and: ' and ', upd: 'updated', riga: 'Times in Riga time',
          cls: { 'extreme fear': 'Extreme Fear', 'fear': 'Fear', 'neutral': 'Neutral', 'greed': 'Greed', 'extreme greed': 'Extreme Greed' } }
  };
  /* tie paši toņi, kas cenu joslas Fear & Greed vērtībai */
  var COL = { 'extreme fear': '#E52B2B', 'fear': '#F87171', 'neutral': '#FACC15', 'greed': '#86EFAC', 'extreme greed': '#16A34A' };
  var ORDER = ['extreme fear', 'fear', 'neutral', 'greed', 'extreme greed'];
  var UP = '#4ADE80', DOWN = '#F87171';

  var fng = null;        /* derīgs fng.json saturs vai null */
  var tc = null;         /* derīgs total-cap.json saturs vai null */

  function lang() { return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'lv'; }
  function el(name, attrs) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function fresh(iso) { var t = Date.parse(iso); return t && Date.now() - t <= MAX_AGE && t - Date.now() <= 10 * 60 * 1000; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- Fear & Greed pusapļa mērītājs ---------- */
  function polar(cx, cy, r, deg) { var a = deg * Math.PI / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
  function arc(cx, cy, r, d0, d1) {   /* loks no leņķa d0 uz d1 (grādi, 180 = pa kreisi, 0 = pa labi) */
    var p0 = polar(cx, cy, r, d0), p1 = polar(cx, cy, r, d1);
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 0 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }
  function drawGauge() {
    var box = panel.querySelector('.lp-gauge'), part = panel.querySelector('.lp-fng');
    if (!box || !part || !fng) return;
    var L = lang(), W = 220, H = 120, cx = 110, cy = 106, r = 84, gap = 2.2;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img',
      'aria-label': T[L].fng + ': ' + fng.value + ' \u00b7 ' + T[L].cls[fng.cls] });
    svg.style.display = 'block'; svg.style.width = '100%';
    for (var i = 0; i < 5; i++) {   /* 5 posmi pa 36° (0–20–40–60–80–100) */
      var d0 = 180 - i * 36 - (i ? gap / 2 : 0), d1 = 180 - (i + 1) * 36 + (i < 4 ? gap / 2 : 0);
      svg.appendChild(el('path', { d: arc(cx, cy, r, d0, d1), fill: 'none', stroke: COL[ORDER[i]], 'stroke-width': 13,
        'stroke-linecap': 'butt', opacity: ORDER[i] === fng.cls ? 1 : 0.38 }));
    }
    var ang = 180 - fng.value * 1.8, tip = polar(cx, cy, r - 24, ang), base = polar(cx, cy, 6, ang + 90), base2 = polar(cx, cy, 6, ang - 90);
    svg.appendChild(el('path', { d: 'M' + base[0].toFixed(1) + ' ' + base[1].toFixed(1) + 'L' + tip[0].toFixed(1) + ' ' + tip[1].toFixed(1) +
      'L' + base2[0].toFixed(1) + ' ' + base2[1].toFixed(1) + 'Z', fill: '#F3E9D4' }));
    svg.appendChild(el('circle', { cx: cx, cy: cy, r: 7, fill: '#F3E9D4' }));
    svg.appendChild(el('circle', { cx: cx, cy: cy, r: 3, fill: '#0b0804' }));
    [['0', cx - r, cy + 13], ['100', cx + r, cy + 13]].forEach(function (t) {
      var tx = el('text', { x: t[1], y: t[2], 'text-anchor': 'middle', fill: '#C9AF87', 'font-size': 11 }); tx.textContent = t[0]; svg.appendChild(tx);
    });
    box.textContent = ''; box.appendChild(svg);
    var v = panel.querySelector('.lp-fng-val');
    v.textContent = fng.value + ' \u00b7 ' + T[L].cls[fng.cls];
    v.style.color = COL[fng.cls];
  }

  /* ---------- 24 h izmaiņa (%) ---------- */
  function fillChanges() {
    var map = { btc: tc && tc.btc && tc.btc.chg24, eth: tc && tc.eth && tc.eth.chg24, total: tc && tc.chg24 };
    var L = lang();
    var els = panel.querySelectorAll('.lp-chg');
    for (var i = 0; i < els.length; i++) {
      var v = map[els[i].getAttribute('data-for')];
      if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) > 60) { els[i].textContent = ''; continue; }
      var s = (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(1).replace('.', L === 'lv' ? ',' : '.') + '% ' + T[L].h24;
      els[i].textContent = s;
      els[i].style.color = v >= 0 ? UP : DOWN;
    }
  }

  /* ---------- teksti, avota rinda, redzamība ---------- */
  function texts() {
    var L = lang(), els = panel.querySelectorAll('[data-lp]');
    for (var i = 0; i < els.length; i++) els[i].textContent = T[L][els[i].getAttribute('data-lp')];
    if (fng) drawGauge();
    fillChanges();
    source();
  }
  function visible(e) { return e && !e.hidden; }
  /* avota norāde ar saitēm (CoinGecko API noteikumi prasa atribūciju; EN: "Powered by CoinGecko"). GA: open_avots_panelis_* */
  function link(name, url, ga) {
    var a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener nofollow'; a.textContent = name; a.setAttribute('data-ga', ga);
    return a;
  }
  function source() {
    var L = lang(), t = T[L];
    var cg = Array.prototype.some.call(panel.querySelectorAll('.au-chart'), visible);
    var am = visible(panel.querySelector('.lp-fng'));
    var src = panel.querySelector('.lp-src');
    if (!src) return;
    var cgA = link('CoinGecko', 'https://www.coingecko.com/en/api', 'open_avots_panelis_coingecko');
    var amA = link('Alternative.me', 'https://alternative.me', 'open_avots_panelis_alternativeme');
    var parts = [];   /* DOM mezgli un teksts pa secību */
    if (L === 'en') {
      if (cg) { parts.push('Powered by ', cgA); if (am) parts.push(t.and, amA); }
      else if (am) parts.push('Data: ', amA);
    } else {
      if (cg || am) parts.push(t.src + ': ');
      if (cg) parts.push(cgA);
      if (cg && am) parts.push(t.and);
      if (am) parts.push(amA);
    }
    if (parts.length) {
      var rest = '';
      if (tc) {
        try {
          var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Riga', hourCycle: 'h23', day: 'numeric', month: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(tc.t));
          var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
          rest += ' \u00b7 ' + t.upd + ' ' + pad(+o.day) + '.' + pad(+o.month) + '. ' + pad(+o.hour % 24) + ':' + o.minute;
        } catch (e) {}
      }
      parts.push(rest + ' \u00b7 ' + t.riga + '.');
    }
    src.textContent = '';
    parts.forEach(function (x) { src.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
    if (src.hidden !== !parts.length) src.hidden = !parts.length;   /* tikai ja mainās (hidden novērotājs) */
  }
  /* viss panelis ir redzams tikai tad, ja redzama vismaz viena daļa */
  function sync() {
    var grid = panel.querySelector('.lp-mini-grid');
    if (grid) {
      var anyMini = Array.prototype.some.call(grid.querySelectorAll('.au-chart'), visible);
      if (grid.hidden !== !anyMini) grid.hidden = !anyMini;            /* tikai ja mainās (hidden novērotājs) */
    }
    var any = visible(panel.querySelector('.lp-fng')) || Array.prototype.some.call(panel.querySelectorAll('.au-chart'), visible);
    if (panel.hidden !== !any) panel.hidden = !any;
    source();
  }

  /* ---------- dati ---------- */
  function getJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); });
  }
  getJson('assets/fng.json').then(function (j) {
    var ok = j && j.v === 1 && fresh(j.t) && typeof j.value === 'number' && j.value >= 0 && j.value <= 100 && COL[j.cls] && j.ts > 0 &&
      Date.now() / 1000 - j.ts < 48 * 3600;   /* paša indeksa mērījums nedrīkst būt vecāks par 2 dienām */
    if (!ok) throw new Error('bad');
    fng = j;
    panel.querySelector('.lp-fng').hidden = false;
    texts(); sync();
  }).catch(function () {});
  getJson('assets/total-cap.json').then(function (j) {
    if (!j || !fresh(j.t)) throw new Error('bad');
    tc = j; texts(); sync();
  }).catch(function () {});

  /* daļas parādās, kad assets/btc-chart.js noņem tām hidden -> pārskaita */
  if (typeof MutationObserver === 'function') {
    new MutationObserver(sync).observe(panel, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(texts).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  texts();
})();
