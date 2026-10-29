/* Small page features, all client side: open-now chip, shelf guide, scroll
   progress and section dots, photo lightbox, EN / Tamil toggle.
   EDIT: opening and closing times live in SITE inside index.html (window.bnSite). */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var html = document.documentElement;
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SITE = window.bnSite || { waPhone: '919355591909', openingTime: '', closingTime: '22:00' };
  var I18N = window.BN_I18N || { ta: [], strings: { en: {}, ta: {} }, shelves: {}, answers: {} };
  var lang = 'en';
  var listeners = [];
  function onLang(fn) { listeners.push(fn); }
  function t(key, vars) {
    var s = (I18N.strings[lang] && I18N.strings[lang][key]) || I18N.strings.en[key] || key;
    if (vars) { Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); }); }
    return s;
  }
  function shelfName(en) { return lang === 'ta' && I18N.shelves[en] ? I18N.shelves[en] : en; }
  function answerName(en) { return lang === 'ta' && I18N.answers[en] ? I18N.answers[en] : en; }
  function waUrl(text) { return 'https://wa.me/' + SITE.waPhone + '?text=' + encodeURIComponent(text); }

  /* ---------- 1. open-now chip, Asia/Kolkata time ---------- */
  function minutesIST() {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      var h = 0, m = 0;
      parts.forEach(function (p) { if (p.type === 'hour') { h = +p.value; } if (p.type === 'minute') { m = +p.value; } });
      return h * 60 + m;
    } catch (e) {
      var d = new Date();
      return ((d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440);
    }
  }
  function toMin(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function openState() {
    var now = minutesIST();
    var close = toMin(SITE.closingTime || '22:00');
    var open = toMin(SITE.openingTime);
    if (open === null) { return now < close ? 'closes' : 'closed'; }
    return (now >= open && now < close) ? 'open' : 'closed';
  }
  function renderOpen() {
    var st = openState();
    $$('[data-open-chip]').forEach(function (el) {
      el.dataset.state = st;
      var txt = $('.open-txt', el);
      if (txt) { txt.textContent = st === 'open' ? t('openNow') : st === 'closed' ? t('closedNow') : t('closes'); }
    });
  }
  renderOpen();
  window.setInterval(renderOpen, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { renderOpen(); } });
  onLang(renderOpen);

  /* ---------- 2. find your shelf ---------- */
  (function () {
    var root = $('#guide');
    if (!root) { return; }
    var nojs = $('.guide-nojs');
    if (nojs) { nojs.hidden = true; }
    root.hidden = false;
    var qs = $$('.guide-q', root);
    var stepEl = $('.guide-step', root);
    var back = $('.guide-back', root);
    var result = $('.guide-result', root);
    var answers = [null, null, null];
    var cur = 0;

    function show(i) {
      cur = i;
      qs.forEach(function (q, k) { q.hidden = k !== i; });
      result.hidden = i < qs.length;
      back.hidden = i === 0;
      stepEl.hidden = i >= qs.length;
      if (i < qs.length) { stepEl.textContent = t('step', { n: i + 1 }); }
    }
    function focusStep() {
      var target = cur < qs.length ? $('legend', qs[cur]) : $('h3', result);
      if (target) { target.setAttribute('tabindex', '-1'); try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
    }
    function suggestion() {
      var shelf = answers[0].shelf;
      var who = answers[1].value;
      if (who === 'Him' && (shelf === 'Skincare' || shelf === 'Haircare')) { shelf = "Men's Grooming"; }
      return shelf;
    }
    function renderResult() {
      var shelf = suggestion();
      $('#guideShelf').textContent = t('suggest', { shelf: shelfName(shelf) });
      var g = answers[2].value;
      $('#guideLine').textContent = g === 'Just point me to the shelf' ? t('guidePoint', { shelf: shelfName(shelf) })
        : g === 'A quick suggestion' ? t('guideQuick') : t('guideWalk');
      var gift = $('#guideGift');
      gift.textContent = answers[1].value === 'Someone else' && shelf !== 'Gifting' ? t('guideGift') : '';
      gift.hidden = !gift.textContent;
      /* the message to the shop stays in English with the English answers */
      var msg = 'Hi BEAUTE&NUTRIE! I used the shelf guide on your website.\n' +
        'Looking for: ' + answers[0].value + '\n' +
        'For: ' + answers[1].value + '\n' +
        'Guidance: ' + answers[2].value + '\n' +
        'Suggested shelf: ' + shelf + '\n' +
        'Could you help me with availability and advice?';
      $('#guideSend').href = waUrl(msg);
    }
    qs.forEach(function (q, i) {
      $$('.guide-opt', q).forEach(function (b) {
        b.addEventListener('click', function () {
          $$('.guide-opt', q).forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
          answers[i] = { value: b.dataset.value, shelf: b.dataset.shelf };
          if (i === qs.length - 1) { renderResult(); }
          show(i + 1);
          focusStep();
        });
      });
    });
    back.addEventListener('click', function () { show(Math.max(0, cur - 1)); focusStep(); });
    $('#guideAgain').addEventListener('click', function () {
      answers = [null, null, null];
      $$('.guide-opt', root).forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
      show(0);
      focusStep();
    });
    function relabel() {
      $$('.guide-opt', root).forEach(function (b) { b.textContent = answerName(b.dataset.value); });
      if (cur < qs.length) { stepEl.textContent = t('step', { n: cur + 1 }); } else { renderResult(); }
    }
    onLang(relabel);
    show(0);
  })();

  /* ---------- 3. scroll progress hairline and section dots ---------- */
  (function () {
    var bar = $('.progress > span');
    var ticking = false;
    function update() {
      ticking = false;
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (bar) { bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, window.scrollY / max)).toFixed(4) + ')'; }
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();

    var list = [
      ['top', 'Top'], ['inside', 'Shopfront'], ['collections', 'Collections'], ['shelf-guide', 'Find your shelf'],
      ['experience', 'At the counter'], ['mens', 'For him'], ['reviews', 'Reviews'], ['enquire', 'Direct line'], ['visit', 'Visit']
    ].filter(function (s) { return document.getElementById(s[0]); });
    var nav = document.createElement('nav');
    nav.className = 'dots';
    nav.setAttribute('aria-label', 'Sections');
    list.forEach(function (s) {
      var a = document.createElement('a');
      a.href = '#' + s[0];
      a.className = 'dot';
      a.innerHTML = '<span class="dot-label"></span>';
      a.querySelector('.dot-label').textContent = s[1];
      a.setAttribute('aria-label', 'Go to ' + s[1]);
      nav.appendChild(a);
    });
    document.body.appendChild(nav);
    var dots = $$('.dot', nav);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (!en.isIntersecting) { return; }
          var i = list.findIndex(function (s) { return s[0] === en.target.id; });
          dots.forEach(function (d, k) { if (k === i) { d.setAttribute('aria-current', 'true'); } else { d.removeAttribute('aria-current'); } });
          nav.classList.toggle('on-light', en.target.id === 'experience');
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      list.forEach(function (s) { io.observe(document.getElementById(s[0])); });
    }
  })();

  /* ---------- 4. photo lightbox for the shop's real photos ---------- */
  (function () {
    var imgs = $$('img[data-lightbox]');
    if (!imgs.length || !window.HTMLDialogElement) { return; }
    var dlg = document.createElement('dialog');
    dlg.className = 'lb';
    dlg.setAttribute('aria-label', 'Photo viewer');
    dlg.innerHTML =
      '<figure class="lb-fig"><img class="lb-img" alt=""><figcaption class="lb-cap"><span class="lb-count"></span><span class="lb-alt"></span></figcaption></figure>' +
      '<button type="button" class="lb-btn lb-prev"><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M20 12H5m5-5-5 5 5 5"/></svg></button>' +
      '<button type="button" class="lb-btn lb-next"><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M4 12h15m-5-5 5 5-5 5"/></svg></button>' +
      '<button type="button" class="lb-btn lb-close"><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M6 6l12 12M18 6 6 18"/></svg></button>';
    document.body.appendChild(dlg);
    var big = $('.lb-img', dlg), cap = $('.lb-alt', dlg), count = $('.lb-count', dlg);
    var prev = $('.lb-prev', dlg), next = $('.lb-next', dlg), close = $('.lb-close', dlg);
    var idx = 0, opener = null;

    function label() {
      prev.setAttribute('aria-label', t('prev'));
      next.setAttribute('aria-label', t('next'));
      close.setAttribute('aria-label', t('close'));
    }
    function go(i) {
      idx = (i + imgs.length) % imgs.length;
      var src = imgs[idx];
      big.src = src.currentSrc || src.src;
      big.alt = src.alt;
      /* never wider than the photo's own pixels */
      big.style.maxWidth = 'min(92vw, ' + (parseInt(src.getAttribute('width'), 10) || src.naturalWidth || 600) + 'px)';
      cap.textContent = src.alt;
      count.textContent = t('photo', { n: idx + 1, total: imgs.length });
      prev.hidden = next.hidden = imgs.length < 2;
    }
    function open(i, from) {
      opener = from;
      label();
      go(i);
      dlg.showModal();
      html.classList.add('lb-open');
      close.focus();
    }
    dlg.addEventListener('close', function () {
      html.classList.remove('lb-open');
      if (opener) { try { opener.focus({ preventScroll: true }); } catch (e) { opener.focus(); } }
    });
    prev.addEventListener('click', function () { go(idx - 1); });
    next.addEventListener('click', function () { go(idx + 1); });
    close.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) { dlg.close(); } });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
      else if (e.key === 'Tab') {
        /* keep focus on the dialog's own controls */
        var f = [prev, next, close].filter(function (b) { return !b.hidden; });
        var at = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
    var sx = null;
    dlg.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') { sx = e.clientX; } });
    dlg.addEventListener('pointerup', function (e) {
      if (sx === null) { return; }
      var dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) > 50) { go(idx + (dx < 0 ? 1 : -1)); }
    });
    imgs.forEach(function (img, i) {
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'View larger photo: ' + img.alt);
      img.addEventListener('click', function () { open(i, img); });
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i, img); }
      });
    });
    onLang(function () { if (dlg.open) { label(); go(idx); } });
  })();

  /* ---------- 5. EN / Tamil toggle ---------- */
  (function () {
    var buttons = $$('.lang-btn');
    var saved = {};          /* element -> original English text */
    var KEY = 'bn-lang';
    function textNodeOf(el) {
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3 && n.nodeValue.trim()) { return n; }
      }
      return null;
    }
    function apply(next) {
      lang = next === 'ta' ? 'ta' : 'en';
      html.lang = lang === 'ta' ? 'ta' : 'en';
      I18N.ta.forEach(function (row, i) {
        $$(row[0]).forEach(function (el, k) {
          var id = i + ':' + k;
          var node = textNodeOf(el);
          if (!node && !el.children.length) { node = el.firstChild || el.appendChild(document.createTextNode('')); }
          if (!node) { return; }
          if (!(id in saved)) { saved[id] = node.nodeValue; }
          var lead = saved[id].match(/^\s*/)[0], trail = saved[id].match(/\s*$/)[0];
          node.nodeValue = lang === 'ta' ? lead + row[1] + trail : saved[id];
        });
      });
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.lang === lang ? 'true' : 'false'); });
      listeners.forEach(function (fn) { try { fn(lang); } catch (e) {} });
      try { window.localStorage.setItem(KEY, lang); } catch (e) {}
    }
    buttons.forEach(function (b) { b.addEventListener('click', function () { apply(b.dataset.lang); }); });
    var start = 'en';
    try { start = window.localStorage.getItem(KEY) || 'en'; } catch (e) {}
    if (start === 'ta') { apply('ta'); }
  })();
})();
