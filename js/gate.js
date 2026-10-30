/* Site access gate removed. This stub only exists so any cached page that still
   references js/gate.js does not lock the visitor out; it is no longer loaded. */
(function () {
  try { localStorage.removeItem('kremseggAccess'); } catch (e) {}
  document.documentElement.classList.remove('gate-locked');
})();
