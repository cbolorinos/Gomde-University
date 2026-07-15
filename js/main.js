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

  /* Hero scroll parallax — the background image drifts slower than the page
     as you scroll, giving depth. Transform-only, rAF-throttled; skipped when
     the user prefers reduced motion. */
  if (!reduced) {
    var heroBg = document.querySelector('.page-hero--image .parallax-bg, .hero--image .parallax-bg');
    if (heroBg) {
      var heroTicking = false;
      var HERO_FACTOR = 0.18, HERO_CAP = 46; /* px — stays within the .parallax-bg bleed */
      var updateHero = function () {
        var y = window.pageYOffset || document.documentElement.scrollTop || 0;
        var shift = Math.min(y * HERO_FACTOR, HERO_CAP);
        heroBg.style.transform = 'translate3d(0,' + shift.toFixed(1) + 'px,0)';
        heroTicking = false;
      };
      window.addEventListener('scroll', function () {
        if (!heroTicking) { heroTicking = true; requestAnimationFrame(updateHero); }
      }, { passive: true });
      updateHero();
    }
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

})();
