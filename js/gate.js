/* ==========================================================================
   Kremsegg University — site access gate
   --------------------------------------------------------------------------
   Hides every page behind a shared access password until the visitor enters
   it. Once entered, the browser remembers it (localStorage) so it is asked
   for only once per device.

   NOTE ON SECURITY: this is a client-side gate. It keeps the site out of
   casual view and out of the hands of anyone who happens on the URL, but it
   is not real security — someone technical can read this file. For genuine
   protection the check has to happen on the server (a Netlify Edge Function
   or Netlify's built-in password protection on a paid plan).

   TO CHANGE THE PASSWORD: run this in any browser console —
       (function(s){var h=5381;for(var i=0;i<s.length;i++){h=((h*33)^s.charCodeAt(i))>>>0;}return h.toString(36);})('YourNewPassword')
   and paste the result into CODE below. Bump the ?v= number on the
   <script src="js/gate.js?v=1"> tags so browsers pick up the new file.
   ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'kremseggAccess';
  var CODE = 'z3n1w0'; /* fingerprint of the current access password */

  function fingerprint(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) { h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; }
    return h.toString(36);
  }

  try { if (window.localStorage.getItem(STORE_KEY) === CODE) return; } catch (e) {}

  var doc = document;
  var root = doc.documentElement;
  root.className += ' gate-locked';

  var style = doc.createElement('style');
  style.setAttribute('data-gate', '');
  style.textContent =
    'html.gate-locked, html.gate-locked body { overflow: hidden !important; }' +
    'html.gate-locked body > * { display: none !important; }' +
    'html.gate-locked body > #site-gate { display: flex !important; }' +
    '#site-gate { position: fixed; inset: 0; z-index: 2147483647; display: flex;' +
      ' align-items: center; justify-content: center; padding: 24px;' +
      ' background: #FDF9F0; color: #2A2118;' +
      " font-family: 'Noto Serif', Georgia, 'Times New Roman', serif; }" +
    '#site-gate .gate-card { width: 100%; max-width: 400px; text-align: center; }' +
    '#site-gate img { width: 132px; height: auto; margin: 0 auto 26px; display: block; }' +
    '#site-gate h1 { font-size: 1.32rem; font-weight: 600; letter-spacing: .02em;' +
      ' margin: 0 0 10px; color: #782718; }' +
    '#site-gate p { font-size: .95rem; line-height: 1.6; color: #6E5F4D; margin: 0 0 26px; }' +
    '#site-gate input { width: 100%; box-sizing: border-box; padding: 13px 15px;' +
      ' font-size: 1rem; font-family: inherit; color: #2A2118; background: #fff;' +
      ' border: 1px solid #E5DAC3; border-radius: 3px; text-align: center;' +
      ' letter-spacing: .04em; }' +
    '#site-gate input:focus { outline: none; border-color: #B98A4A;' +
      ' box-shadow: 0 0 0 3px rgba(185,138,74,.18); }' +
    '#site-gate button { width: 100%; margin-top: 12px; padding: 13px 15px;' +
      ' font-size: .95rem; font-family: inherit; letter-spacing: .08em;' +
      ' text-transform: uppercase; color: #FDF9F0; background: #782718;' +
      ' border: 0; border-radius: 3px; cursor: pointer; }' +
    '#site-gate button:hover { background: #67251A; }' +
    '#site-gate .gate-error { min-height: 1.3em; margin: 14px 0 0; font-size: .875rem;' +
      ' color: #7E2F21; opacity: 0; transition: opacity .15s; }' +
    '#site-gate .gate-error.show { opacity: 1; }' +
    '@media (max-width: 480px) { #site-gate img { width: 108px; } }';
  (doc.head || root).appendChild(style);

  function build() {
    if (doc.getElementById('site-gate')) return;

    /* Pages in sub-folders (e.g. /admin/) need to walk up for the logo. */
    var base = /\/[^\/]+\/[^\/]*$/.test(location.pathname) && location.pathname.indexOf('/admin/') === 0 ? '../' : '';

    var gate = doc.createElement('div');
    gate.id = 'site-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-label', 'Password required');
    gate.innerHTML =
      '<div class="gate-card">' +
        '<img src="' + base + 'img/logo-web.webp" alt="Kremsegg University">' +
        '<h1>Private preview</h1>' +
        '<p>This site is not yet public. Please enter the password to continue.</p>' +
        '<form id="gate-form" autocomplete="off">' +
          '<input id="gate-input" type="password" name="access" placeholder="Password"' +
            ' aria-label="Password" autocomplete="current-password" autocapitalize="off"' +
            ' autocorrect="off" spellcheck="false">' +
          '<button type="submit">Enter</button>' +
          '<p class="gate-error" id="gate-error" role="alert">That password is not correct.</p>' +
        '</form>' +
      '</div>';
    doc.body.appendChild(gate);

    var input = doc.getElementById('gate-input');
    var error = doc.getElementById('gate-error');
    try { input.focus(); } catch (e) {}

    doc.getElementById('gate-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (fingerprint(input.value) === CODE) {
        try { window.localStorage.setItem(STORE_KEY, CODE); } catch (e) {}
        gate.parentNode.removeChild(gate);
        if (style.parentNode) style.parentNode.removeChild(style);
        root.className = root.className.replace(/\s*gate-locked\b/, '');
      } else {
        error.className = 'gate-error show';
        input.value = '';
        input.focus();
      }
    });

    input.addEventListener('input', function () { error.className = 'gate-error'; });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', build);
  else build();
})();
