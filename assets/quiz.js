/* Suture Atlas — the multiple-choice quiz, and the switch on the test page between it
   and the case test. Questions live in data.js (SUTURE.QUIZ); the first option of each
   is the right one, and both the questions and the options are shuffled every round. */
(function () {
  'use strict';
  const D = window.SUTURE;
  const ALL = D.QUIZ || [];
  const TECHS = D.TECHNIQUES;
  const root = document.getElementById('quizRoot');
  const LET = 'ABCD';
  const TOPICS = ALL.reduce((a, q) => (a.indexOf(q.topic) < 0 ? a.concat(q.topic) : a), []);

  /* ---------------- the two modes of the test page ---------------- */
  const tabs = document.querySelectorAll('[data-mode]');
  const panes = { cases: document.getElementById('casesPane'), quiz: document.getElementById('quizPane') };
  function setMode(m, keep) {
    if (!panes[m]) m = 'cases';
    tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    Object.keys(panes).forEach(k => { panes[k].hidden = k !== m; });
    if (keep && history.replaceState) history.replaceState(null, '', location.pathname + location.search + (m === 'quiz' ? '#quiz' : ''));
  }
  tabs.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode, true)));
  window.addEventListener('hashchange', () => setMode(location.hash === '#quiz' ? 'quiz' : 'cases'));
  document.querySelectorAll('[data-count="quiz"]').forEach(n => { n.textContent = ALL.length; });
  setMode(location.hash === '#quiz' ? 'quiz' : 'cases');

  /* ---------------- state ---------------- */
  const picked = new Set(TOPICS);
  let deck = [], i = 0, log = [];
  const shuffle = a => {
    a = a.slice();
    for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); const t = a[k]; a[k] = a[j]; a[j] = t; }
    return a;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const count = t => ALL.filter(q => q.topic === t).length;
  function seeLink(q) {
    if (q.see === 'materials') return '<a href="materials.html">Compare the materials →</a>';
    const t = TECHS.find(x => x.id === q.see);
    return t ? '<a href="atlas.html#' + t.id + '">Watch ' + esc(t.name) + ' →</a>' : '';
  }
  function show() {
    const r = root.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.6) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------- start: pick the topics ---------------- */
  function start(focusTopic) {
    const n = ALL.filter(q => picked.has(q.topic)).length;
    root.innerHTML = '<div class="card quizStart">' +
      '<p class="lbl">Topics</p>' +
      '<div class="row topicRow">' + TOPICS.map(t =>
        '<button class="btn sm" data-topic="' + esc(t) + '" aria-pressed="' + picked.has(t) + '">' + esc(t) +
        '<span class="cnt">' + count(t) + '</span></button>').join('') + '</div>' +
      '<p class="small muted" style="margin-top:12px">The questions come in a random order and the answers are shuffled every round. ' +
      'Click an answer, or press A to D. Each answer comes with the reason and a link to the technique that teaches it.</p>' +
      '<button class="btn primary" id="quizGo" style="margin-top:16px"' + (n ? '' : ' disabled') + '>' +
      (n ? 'Start: ' + n + ' question' + (n === 1 ? '' : 's') : 'Pick at least one topic') + '</button></div>';
    root.querySelector('.topicRow').addEventListener('click', e => {
      const b = e.target.closest('[data-topic]');
      if (!b) return;
      const t = b.dataset.topic;
      if (picked.has(t)) picked.delete(t); else picked.add(t);
      start(t);
    });
    root.querySelector('#quizGo').addEventListener('click', () => deal(ALL.filter(q => picked.has(q.topic))));
    if (focusTopic) {
      const b = Array.prototype.find.call(root.querySelectorAll('[data-topic]'), x => x.dataset.topic === focusTopic);
      if (b) b.focus();
    }
  }

  /* ---------------- one question at a time ---------------- */
  function deal(list) {
    deck = shuffle(list).map(q => ({ q, order: shuffle(q.opts.map((o, k) => k)), done: false }));
    i = 0; log = [];
    ask();
  }
  function ask() {
    const d = deck[i], q = d.q;
    const right = log.filter(r => r.ok).length;
    root.innerHTML = '<div class="card quizCard">' +
      '<div class="caseHead"><span class="n">Question ' + (i + 1) + ' of ' + deck.length + '</span>' +
      '<span class="chip">' + esc(q.topic) + '</span>' +
      (i ? '<span class="muted small qscore">' + right + ' of ' + i + ' correct so far</span>' : '') + '</div>' +
      '<div class="bar2 qprog" aria-hidden="true"><i style="width:' + Math.round(i / deck.length * 100) + '%"></i></div>' +
      '<p class="qtext" id="qtext">' + esc(q.q) + '</p>' +
      '<div class="qopts" role="group" aria-labelledby="qtext">' + d.order.map((k, n) =>
        '<button class="opt" data-k="' + k + '"><span class="k">' + LET[n] + '</span><span>' + esc(q.opts[k]) + '</span></button>').join('') +
      '</div><div id="qfb" aria-live="polite"></div></div>';
    root.querySelector('.qopts').addEventListener('click', e => {
      const b = e.target.closest('button[data-k]');
      if (b) answer(+b.dataset.k);
    });
    show();
  }
  function answer(k) {
    const d = deck[i];
    if (!d || d.done) return;
    d.done = true;
    const ok = k === 0;
    log.push({ q: d.q, k, ok });
    root.querySelectorAll('.qopts button').forEach(b => {
      const bk = +b.dataset.k;
      b.disabled = true;
      if (bk === 0) b.classList.add('good');
      else if (bk === k) b.classList.add('bad');
    });
    const last = i + 1 >= deck.length;
    root.querySelector('#qfb').innerHTML = '<div class="qfb ' + (ok ? 'ok' : 'no') + '">' +
      '<p><b>' + (ok ? 'Correct.' : 'Not quite. The answer is: ' + esc(d.q.opts[0])) + '</b></p>' +
      '<p class="small" style="margin-top:6px">' + esc(d.q.why) + '</p>' +
      '<div class="qnext"><button class="btn primary" id="qNext">' + (last ? 'See your score →' : 'Next question →') + '</button>' +
      '<span class="small">' + seeLink(d.q) + '</span></div></div>';
    const nx = root.querySelector('#qNext');
    nx.addEventListener('click', () => { i++; if (i < deck.length) ask(); else finish(); });
    nx.focus({ preventScroll: true });
    const fb = root.querySelector('.qfb').getBoundingClientRect();
    if (fb.bottom > window.innerHeight) window.scrollBy({ top: fb.bottom - window.innerHeight + 24, behavior: 'smooth' });
  }
  /* A to D, or 1 to 4, answers the question on screen */
  document.addEventListener('keydown', e => {
    if (panes.quiz.hidden || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const d = deck[i];
    if (!d || d.done || !root.querySelector('.qopts')) return;
    let pos = 'abcd'.indexOf(e.key.toLowerCase());
    if (pos < 0) pos = '1234'.indexOf(e.key);
    if (pos >= 0 && pos < d.order.length) { e.preventDefault(); answer(d.order[pos]); }
  });

  /* ---------------- the score ---------------- */
  function finish() {
    const n = log.length, right = log.filter(r => r.ok).length, pct = Math.round(right / n * 100);
    const band = pct >= 90 ? 'Excellent. You know the patterns and the reasons behind them.'
      : pct >= 75 ? 'Solid. Go over the ones you missed, then try a new round.'
        : pct >= 50 ? 'Getting there. The technique lab covers most of what you missed.'
          : 'Start with the technique lab, one pattern at a time, then come back.';
    const byTopic = TOPICS.map(t => {
      const rs = log.filter(r => r.q.topic === t);
      return rs.length ? { t, ok: rs.filter(r => r.ok).length, n: rs.length } : null;
    }).filter(Boolean);
    const missed = log.filter(r => !r.ok);
    root.innerHTML = '<div class="card"><div class="final">' +
      '<p class="eyebrow">Quiz score</p><div class="big">' + pct + '%</div>' +
      '<p class="muted small" style="margin-top:6px">' + right + ' of ' + n + ' correct</p>' +
      '<p style="margin-top:12px;font-weight:600">' + band + '</p></div>' +
      '<div class="verdict">' + byTopic.map(b =>
        '<div class="vrow"><b>' + esc(b.t) + '</b><span>' + b.ok + ' of ' + b.n + '</span></div>' +
        '<div class="bar2"><i style="width:' + Math.round(b.ok / b.n * 100) + '%"></i></div>').join('') + '</div>' +
      (missed.length ? '<h3 style="margin-top:24px">Go over these</h3><ol class="missed">' + missed.map(r =>
        '<li><p>' + esc(r.q.q) + '</p>' +
        '<p class="small"><b>Answer:</b> ' + esc(r.q.opts[0]) + '</p>' +
        '<p class="small muted">You said: ' + esc(r.q.opts[r.k]) + '</p>' +
        '<p class="small">' + seeLink(r.q) + '</p></li>').join('') + '</ol>' : '') +
      '<div class="qend">' +
      (missed.length ? '<button class="btn primary" id="qMissed">Retry the ' + missed.length + ' you missed</button>' : '') +
      '<button class="btn' + (missed.length ? '' : ' primary') + '" id="qAgain">New round</button>' +
      '<button class="btn" id="qTopics">Change topics</button></div></div>';
    const m = root.querySelector('#qMissed');
    if (m) m.addEventListener('click', () => deal(missed.map(r => r.q)));
    root.querySelector('#qAgain').addEventListener('click', () => deal(ALL.filter(q => picked.has(q.topic))));
    root.querySelector('#qTopics').addEventListener('click', () => start());
    show();
  }

  start();
})();
