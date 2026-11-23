/* Suture Atlas — small things every page shares. Load last on each page. */
(function () {
  'use strict';

  /* The bug-report contact. The phone number is never written into the pages: bots
     that harvest numbers read a page's code, so the WhatsApp link is put together only
     when someone actually reaches for it (touch, mouse down, keyboard focus or click).
     Anyone who sends a message still sees the number in WhatsApp. */
  const parts = ['6981', '4030', '0102'];   /* stored backwards and in pieces */
  const number = () => parts.join('').split('').reverse().join('');
  const message = encodeURIComponent('Hi, I found a bug in Suture Atlas: ');
  const arm = a => { a.href = 'https://wa.me/' + number() + '?text=' + message; };
  document.querySelectorAll('a[data-wa]').forEach(a => {
    ['pointerdown', 'touchstart', 'focus', 'click'].forEach(ev => a.addEventListener(ev, () => arm(a), { passive: true }));
  });

  /* Dark or light. Every page opens dark (data-theme="dark" on <html>); a small script
     in each page's head switches to light before the page is drawn if that was the
     last choice. The header button flips it and remembers it, and other open tabs
     follow. */
  const root = document.documentElement;
  const themeBtn = document.getElementById('themeBtn');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const showTheme = () => {
    const light = root.dataset.theme === 'light';
    if (themeMeta) themeMeta.content = light ? '#eef2f1' : '#0b1211';
    if (themeBtn) {
      const label = light ? 'Switch to dark mode' : 'Switch to light mode';
      themeBtn.setAttribute('aria-label', label);
      themeBtn.title = label;
    }
  };
  const setTheme = (theme, save) => {
    root.dataset.theme = theme === 'light' ? 'light' : 'dark';
    if (save) { try { localStorage.setItem('suture-theme', root.dataset.theme); } catch (e) {} }
    showTheme();
  };
  showTheme();
  /* The switch is animated: the new theme spreads out in a circle from the button
     while its icon turns over. Browsers without view transitions (and anyone who has
     asked their system for less motion) get a soft cross-fade of the colours instead. */
  const flipTheme = () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    themeBtn.classList.remove('turn');
    void themeBtn.offsetWidth;            /* restart the icon's turn */
    themeBtn.classList.add('turn');
    if (!document.startViewTransition || still) {
      root.classList.add('themeFade');
      setTheme(next, true);
      clearTimeout(flipTheme.t);
      flipTheme.t = setTimeout(() => root.classList.remove('themeFade'), 600);
      return;
    }
    const r = themeBtn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = document.startViewTransition(() => setTheme(next, true));
    t.ready.then(() => {
      root.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + reach + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 700, easing: 'cubic-bezier(.45,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
  };
  if (themeBtn) themeBtn.addEventListener('click', flipTheme);
  window.addEventListener('storage', e => { if (e.key === 'suture-theme') setTheme(e.newValue, false); });

  /* The offline copy (sw.js). Registered once the page has finished loading, so it
     never competes with the page itself for a slow connection. Browsers allow it only
     on https or on this computer, never from a file opened directly. */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))) {
    const go = () => navigator.serviceWorker.register('sw.js').catch(() => {});
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
  }
})();
