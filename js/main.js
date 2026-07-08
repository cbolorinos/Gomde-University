/* Kremsegg University — shared behaviour (no dependencies, ~1 KB gzipped) */
(function () {
  'use strict';

  /* Mobile menu */
  var menuBtn = document.querySelector('.menu-btn');
  var nav = document.querySelector('.nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menuBtn.classList.toggle('open', open);
      document.body.classList.toggle('menu-open', open);
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* Dropdowns: click/tap to toggle (works for touch + keyboard) */
  var toggles = document.querySelectorAll('.nav-toggle-btn');
  function closeAll(except) {
    document.querySelectorAll('.has-dropdown.open').forEach(function (li) {
      if (li !== except) {
        li.classList.remove('open');
        var b = li.querySelector('.nav-toggle-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    });
  }
  toggles.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var li = btn.closest('.has-dropdown');
      var open = li.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      closeAll(li);
    });
  });
  document.addEventListener('click', function () { closeAll(null); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeAll(null);
      if (nav && nav.classList.contains('open')) {
        nav.classList.remove('open');
        menuBtn.classList.remove('open');
        document.body.classList.remove('menu-open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    }
  });

  /* Scroll-reveal animations (progressive enhancement; skipped if
     IntersectionObserver is missing or the user prefers reduced motion) */
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reduced) {
    var selectors = '.split, .card, .person, .track, .phase, .section-head, .note, .quote blockquote, .form-card, .deflist li';
    var els = document.querySelectorAll(selectors);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (el) {
      el.classList.add('reveal');
      /* stagger siblings inside grids/lists */
      var parent = el.parentElement;
      if (parent && (parent.classList.contains('cards') || parent.classList.contains('deflist'))) {
        var idx = Array.prototype.indexOf.call(parent.children, el);
        el.classList.add('reveal-stagger');
        el.style.setProperty('--stagger', (idx * 0.08) + 's');
      }
      io.observe(el);
    });
  }

  /* Mark the current page in the nav */
  var here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a[href]').forEach(function (a) {
    if (a.getAttribute('href') === here) {
      a.setAttribute('aria-current', 'page');
      var li = a.closest('.has-dropdown');
      if (li) {
        var b = li.querySelector('.nav-toggle-btn');
        if (b) b.style.borderBottomColor = 'var(--gold-dark)';
      }
    }
  });

  /* Hero parallax — the background image drifts slightly opposite the cursor.
     Progressive enhancement only:
       - skipped if the user prefers reduced motion
       - skipped on coarse/touch pointers (no hover, saves work on phones)
     It touches only a CSS transform via requestAnimationFrame, so it stays
     cheap and never blocks rendering on slow devices. */
  var layers = document.querySelectorAll('.parallax-bg');
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (layers.length && finePointer && !reduced) {
    var MAX = 18;           /* max pixels of drift each axis */
    var tx = 0, ty = 0, cx = 0, cy = 0, ticking = false;
    function render() {
      /* ease toward the target for a smooth, weighty feel */
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      var t = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
      for (var i = 0; i < layers.length; i++) { layers[i].style.transform = t; }
      if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
        requestAnimationFrame(render);
      } else {
        ticking = false;
      }
    }
    window.addEventListener('mousemove', function (e) {
      /* -1..1 from centre, then inverted so the image moves the opposite way */
      var nx = (e.clientX / window.innerWidth) - 0.5;
      var ny = (e.clientY / window.innerHeight) - 0.5;
      tx = -nx * MAX * 2;
      ty = -ny * MAX * 2;
      if (!ticking) { ticking = true; requestAnimationFrame(render); }
    }, { passive: true });
  }
})();
