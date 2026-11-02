/* Keystone · small, dependency-free enhancements. The site works fully without JavaScript. */
(function () {
  'use strict';
  var lang = document.documentElement.lang === 'en' ? 'en' : 'he';
  var locale = lang === 'en' ? 'en-IL' : 'he-IL';

  /* Mobile navigation */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var mq = window.matchMedia('(max-width: 900px)');
    var sync = function () {
      if (mq.matches) { nav.hidden = toggle.getAttribute('aria-expanded') !== 'true'; }
      else { nav.hidden = false; }
    };
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      sync();
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a') && mq.matches) { toggle.setAttribute('aria-expanded', 'false'); sync(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        toggle.setAttribute('aria-expanded', 'false'); sync(); toggle.focus();
      }
    });
    if (mq.addEventListener) mq.addEventListener('change', sync);
    sync();
  }

  /* Cost-of-a-repeated-task calculator */
  var calc = document.getElementById('calc-form');
  if (calc) {
    var nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    var outHours = document.getElementById('calc-hours');
    var outCost = document.getElementById('calc-cost');
    var num = function (id) { var v = parseFloat(document.getElementById(id).value); return isFinite(v) && v > 0 ? v : 0; };
    var update = function () {
      var hours = num('c-minutes') / 60 * num('c-times') * num('c-people') * 48;
      outHours.textContent = nf.format(hours);
      outCost.textContent = nf.format(hours * num('c-rate'));
    };
    calc.addEventListener('input', update);
    calc.addEventListener('submit', function (e) { e.preventDefault(); update(); });
    update();
  }

  /* Contact form: validate in place, send as JSON, announce the result */
  var form = document.getElementById('contact-form');
  if (form && window.fetch) {
    var status = document.getElementById('form-status');
    var msg = function (key) { return form.getAttribute('data-msg-' + key) || ''; };
    var setError = function (name, text) {
      var input = form.elements[name];
      var err = document.getElementById('err-' + name);
      if (!input || !err) return;
      err.textContent = text;
      if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    };
    var check = function () {
      var f = form.elements, bad = [];
      var put = function (name, ok, key) { setError(name, ok ? '' : msg(key)); if (!ok) bad.push(name); };
      put('name', f.name.value.trim().length >= 2, 'name');
      put('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim()), 'email');
      put('phone', !f.phone.value.trim() || /^[0-9+()\-\s.]{7,40}$/.test(f.phone.value.trim()), 'phone');
      put('message', f.message.value.trim().length >= 10, 'message');
      put('consent', f.consent.checked, 'consent');
      return bad;
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'form-status'; status.textContent = '';
      var bad = check();
      if (bad.length) { form.elements[bad[0]].focus(); return; }
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = msg('sending');
      var f = form.elements;
      var payload = {
        name: f.name.value, business: f.business.value, email: f.email.value, phone: f.phone.value,
        message: f.message.value, consent: f.consent.checked, website: f.website.value, lang: lang
      };
      fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (res) {
          if (res.body && res.body.ok) {
            form.reset();
            status.className = 'form-status ok'; status.textContent = msg('sent');
          } else {
            var key = res.status === 429 ? 'rate' : 'failed';
            if (res.body && res.body.fields) { Object.keys(res.body.fields).forEach(function (k) { setError(k, msg(k)); }); key = 'invalid'; }
            status.className = 'form-status bad'; status.textContent = msg(key);
          }
        })
        .catch(function () { status.className = 'form-status bad'; status.textContent = msg('failed'); })
        .then(function () { btn.disabled = false; btn.textContent = msg('submit'); status.focus(); });
    });
  }
})();
