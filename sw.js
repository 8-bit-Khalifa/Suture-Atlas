/* Suture Atlas — the offline copy.
   The first visit stores every page and file of the site on the device, so it keeps
   working with no signal: in a barn, on a farm call, on a phone added to the home screen.
   Online, every file is still fetched fresh (and the stored copy updated), so changes
   to the site show up straight away; the stored copy is only used when the network
   fails or takes too long.
   After changing the list of files below, or to refresh the offline copy of pages a
   visitor has not opened since, raise the version number. */
const VERSION = 'suture-atlas-v1';
const FILES = [
  './',
  'index.html', 'atlas.html', 'match.html', 'test.html', 'materials.html', 'knot.html',
  'manifest.webmanifest',
  'assets/site.css', 'assets/site.js',
  'assets/favicon.svg', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png', 'assets/apple-touch-icon.png',
  'assets/materials-threads.svg',
  'assets/data.js', 'assets/stitch.js', 'assets/scenes.js',
  'assets/three.min.js', 'assets/engine.js', 'assets/context.js', 'assets/atlas.js',
  'assets/match.js', 'assets/test.js', 'assets/quiz.js'
];
/* how long to wait for the network before falling back to the stored copy */
const PATIENCE = 4000;

/* Hosts such as Cloudflare Pages answer atlas.html with a redirect to /atlas. A page
   stored from a redirect is refused by the browser when it is served for a navigation,
   so every response is stored as a plain copy of itself. */
const plain = res => !res.redirected ? Promise.resolve(res)
  : res.blob().then(b => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }));
/* the same page under its other name: /atlas and atlas.html, / and index.html */
const otherName = href => {
  const u = new URL(href);
  if (u.pathname.endsWith('/')) u.pathname += 'index.html';
  else if (/\.html$/.test(u.pathname)) u.pathname = u.pathname.replace(/(index)?\.html$/, '');
  else if (!/\.[a-z0-9]+$/i.test(u.pathname)) u.pathname += '.html';
  return u.href;
};

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(FILES.map(f =>
        fetch(new Request(f, { cache: 'reload' })).then(res => {
          if (!res.ok) throw new Error('Could not store ' + f);
          return plain(res).then(r => c.put(f, r));
        }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('suture-atlas-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  /* a page opened with ?site=… or #knot is still the same stored page */
  const stored = () => caches.match(req, { ignoreSearch: true })
    .then(hit => hit || caches.match(otherName(req.url), { ignoreSearch: true }))
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
  e.respondWith(new Promise(resolve => {
    let settled = false;
    const finish = r => { if (!settled && r) { settled = true; resolve(r); } };
    const net = fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        plain(copy).then(r => caches.open(VERSION).then(c => c.put(req, r)));
      }
      return res;
    });
    /* a slow connection: show the stored copy rather than a blank screen */
    const timer = setTimeout(() => stored().then(finish), PATIENCE);
    net.then(res => { clearTimeout(timer); finish(res); })
      .catch(() => { clearTimeout(timer); stored().then(hit => finish(hit || Response.error())); });
  }));
});
