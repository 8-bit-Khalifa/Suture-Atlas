/* Suture Atlas — the case test. Eleven patients: read the record, choose the pattern,
   then place the stitches on the wound yourself. 60 points for the decision (32 for an
   acceptable second choice), 40 for stitches placed where the pattern needs them. */
(function () {
  'use strict';
  const D = window.SUTURE;
  const CASES = D.CASES;
  const PATTERNS = D.TECHNIQUES.filter(t => t.id !== 'knot');   /* the knot is not a pattern */
  const SPECIES = D.SPECIES || [];
  const root = document.getElementById('testRoot');
  const S = window.StitchSVG, el = S.el;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LET = 'ABCDEFGHIJ';

  let idx = 0, choice = null, taps = [], results = [], stage = 'choose';

  /* ================= the pictures =================
     The scenes are shared with the matching game (assets/scenes.js); the ideal pattern
     and the stitches placed are drawn over them here. */
  const add = (g, tag, a) => { const n = el(tag, a); g.appendChild(n); return n; };
  function drawArt(svg, c, o) {
    o = o || {};
    const g = window.SutureScenes.draw(svg, c.scene, c.species);
    if (o.ideal) {
      const t = PATTERNS.find(x => x.id === c.best);
      const ideal = el('g', { opacity: 0.95 });
      S.pattern(ideal, t.draw, c.targets);
      g.appendChild(ideal);
    }
    if (o.taps) {
      o.taps.forEach((p, k) => {
        add(g, 'circle', { cx: p.x, cy: p.y, r: 4.4, fill: 'rgba(255,255,255,.75)', stroke: '#a8382c', 'stroke-width': 1.3 });
        g.appendChild(el('text', { x: p.x, y: p.y + 2, 'text-anchor': 'middle', 'font-size': 5.6, 'font-family': 'ui-monospace,monospace', fill: '#a8382c', 'font-weight': 700 }, String(k + 1)));
      });
    }
  }
  /* ================= scoring ================= */
  function scoreCase(c, picked, pts) {
    const choiceScore = picked === c.best ? 60 : c.ok.indexOf(picked) >= 0 ? 32 : 0;
    const used = pts.map(() => false);
    let hits = 0;
    c.targets.forEach(t => {
      const tx = S.px(t);
      let found = -1;
      for (let k = 0; k < pts.length; k++) {
        if (used[k]) continue;
        const ok = c.wound === 'round'
          ? Math.hypot(pts[k].x - 50, pts[k].y - 37) < 13
          : Math.abs(pts[k].x - tx) < 11;
        if (ok) { found = k; break; }
      }
      if (found >= 0) { used[found] = true; hits++; }
    });
    const placeScore = Math.round(40 * hits / c.targets.length);
    return { choiceScore, placeScore, hits, total: choiceScore + placeScore };
  }

  /* ================= screens ================= */
  const techName = id => { const t = D.TECHNIQUES.find(x => x.id === id); return t ? t.name : '—'; };
  const speciesName = id => { const s = SPECIES.find(x => x.id === id); return s ? s.name : id; };
  function render() {
    if (stage === 'final') return renderFinal();
    const c = CASES[idx];
    if (stage === 'choose') return renderChoose(c);
    if (stage === 'place') return renderPlace(c);
    return renderResult(c);
  }
  function top() {
    const r = root.getBoundingClientRect();
    if (r.top < 0) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  /* one dot a patient: filled once seen, ringed for the one on screen */
  function progress() {
    return '<ol class="caseDots" aria-label="Progress">' + CASES.map((c, k) =>
      '<li class="' + (k < idx || (k === idx && stage === 'result') ? 'done' : k === idx ? 'cur' : '') + '"><span class="sr">Case ' + (k + 1) +
      (k < idx ? ', done' : k === idx ? ', current' : '') + '</span></li>').join('') + '</ol>';
  }
  /* the patient's record: who, where, when, then the history */
  function record(c, compact) {
    return '<div class="caseHead"><span class="n">Case ' + (idx + 1) + ' of ' + CASES.length + '</span>' + progress() + '</div>' +
      '<h2 class="caseTitle">' + esc(c.title) + '</h2>' +
      '<dl class="caseRec">' +
      '<div><dt>Patient</dt><dd><span class="sp sp-' + c.species + '">' + esc(speciesName(c.species)) + '</span> ' + esc(c.patient) + '</dd></div>' +
      '<div><dt>Wound</dt><dd>' + esc(c.site) + '</dd></div>' +
      '<div><dt>Seen</dt><dd>' + esc(c.seen) + '</dd></div></dl>' +
      (compact ? '' : '<p class="vignette">' + esc(c.text) + '</p>');
  }

  function renderChoose(c) {
    root.innerHTML = '<article class="card caseCard">' + record(c) +
      '<div class="woundbox"><svg id="art" role="img" aria-label="' + esc(c.title + ': ' + c.site) + '"></svg></div>' +
      '<p class="caseQ">Which pattern is the best choice here?</p>' +
      '<div class="caseOpts" id="opts">' + PATTERNS.map((t, k) =>
        '<button class="caseOpt" data-tech="' + t.id + '"><svg aria-hidden="true" data-kind="' + t.draw + '"></svg>' +
        '<span><span class="k">' + LET[k] + '</span>' + esc(t.name) + '<small>' + esc(t.group) + '</small></span></button>').join('') +
      '</div><p class="note">Pick one: on the next screen you place the stitches yourself.</p></article>';
    drawArt(document.getElementById('art'), c, {});
    root.querySelectorAll('.caseOpt svg').forEach(s => S.draw(s, s.dataset.kind, { organ: s.dataset.kind === 'lembert' || s.dataset.kind === 'cushing' }));
    document.getElementById('opts').addEventListener('click', e => {
      const b = e.target.closest('button[data-tech]');
      if (!b) return;
      choice = b.dataset.tech;
      taps = [];
      stage = 'place';
      render();
    });
    top();
  }

  function renderPlace(c) {
    const n = c.targets.length;
    root.innerHTML = '<article class="card caseCard">' + record(c, true) +
      '<p class="chosen">You chose <b>' + esc(techName(choice)) + '</b>. <button class="linkbtn" id="rechoose">Change</button></p>' +
      '<div class="woundbox place"><svg id="art" style="cursor:crosshair" role="img" aria-label="The wound: click to place each stitch"></svg></div>' +
      '<p class="caseQ">' + (c.wound === 'round'
        ? 'Click the centre of the opening to place the purse-string.'
        : 'Place ' + n + ' stitches: click where each one should cross the wound.') + '</p>' +
      '<p class="small muted" id="tapCount" aria-live="polite"></p>' +
      '<div class="caseBtns"><button class="btn" id="undoBtn">Undo last</button>' +
      '<button class="btn primary" id="checkBtn">Check my answer</button></div></article>';
    const svg = document.getElementById('art');
    const undo = document.getElementById('undoBtn'), check = document.getElementById('checkBtn'), count = document.getElementById('tapCount');
    const refresh = () => {
      drawArt(svg, c, { taps });
      count.textContent = taps.length + ' of ' + n + ' placed';
      undo.disabled = !taps.length;
      check.disabled = taps.length < n;
    };
    svg.addEventListener('pointerdown', e => {
      if (taps.length >= n) return;
      const r = svg.getBoundingClientRect();
      const p = { x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 70 };
      if (p.y < 6 || p.y > 66) return;
      taps.push(p);
      refresh();
    });
    undo.addEventListener('click', () => { taps.pop(); refresh(); });
    document.getElementById('rechoose').addEventListener('click', () => { stage = 'choose'; render(); });
    check.addEventListener('click', () => {
      if (taps.length < n) return;
      results[idx] = { c, picked: choice, taps: taps.slice(), score: scoreCase(c, choice, taps) };
      stage = 'result';
      render();
    });
    refresh();
    top();
  }

  function renderResult(c) {
    const r = results[idx], s = r.score;
    const right = r.picked === c.best, almost = c.ok.indexOf(r.picked) >= 0;
    const verdict = right ? 'best' : almost ? 'acceptable' : 'not the best';
    root.innerHTML = '<article class="card caseCard">' + record(c, true) +
      '<div class="caseScore"><span class="big">' + s.total + '</span><span class="muted small">/ 100 for this case</span></div>' +
      '<div class="woundbox"><svg id="art" role="img" aria-label="The ideal pattern in blue, your stitches in red"></svg></div>' +
      '<p class="artKey small muted"><span><i class="kb"></i>The pattern as it should be placed</span><span><i class="kr"></i>Your stitches</span></p>' +
      '<div class="verdict">' +
      '<div class="vrow"><b>Your choice</b><span>' + esc(techName(r.picked)) + ' <span class="chip ' + (right ? 't' : '') + '">' + verdict + '</span></span></div>' +
      (right ? '' : '<div class="vrow"><b>Best choice</b><span>' + esc(techName(c.best)) + '</span></div>') +
      '<div class="vrow"><b>Decision</b><span>' + s.choiceScore + ' / 60</span></div>' +
      '<div class="bar2"><i style="width:' + Math.round(s.choiceScore / 60 * 100) + '%"></i></div>' +
      '<div class="vrow"><b>Placement</b><span>' + s.hits + ' of ' + c.targets.length + ' in the right place → ' + s.placeScore + ' / 40</span></div>' +
      '<div class="bar2"><i style="width:' + Math.round(s.placeScore / 40 * 100) + '%"></i></div></div>' +
      '<p class="why"><b>Why:</b> ' + esc(c.why) + '</p>' +
      '<p class="trap"><b>What catches people out:</b> ' + esc(c.trap) + '</p>' +
      '<div class="caseBtns"><button class="btn primary" id="nextBtn">' + (idx + 1 < CASES.length ? 'Next patient →' : 'See your final score →') + '</button>' +
      '<a class="btn" href="atlas.html#' + c.best + '">Watch ' + esc(techName(c.best)) + '</a></div></article>';
    drawArt(document.getElementById('art'), c, { ideal: true, taps: r.taps });
    document.getElementById('nextBtn').addEventListener('click', () => {
      idx++;
      choice = null; taps = [];
      stage = idx < CASES.length ? 'choose' : 'final';
      render();
    });
    document.getElementById('nextBtn').focus({ preventScroll: true });
    top();
  }

  function renderFinal() {
    const total = results.reduce((s, r) => s + r.score.total, 0), max = CASES.length * 100;
    const pct = Math.round(total / max * 100);
    const band = pct >= 85 ? 'Excellent: your choices and your stitch placement both hold up.'
      : pct >= 70 ? 'Solid. Read the cases you lost points on, then run them again.'
        : pct >= 50 ? 'Getting there. The technique lab will fix most of what you missed.'
          : 'Start with the technique lab, one pattern at a time, then come back.';
    const weak = results.filter(r => r.score.total < 70);
    root.innerHTML = '<article class="card"><div class="final"><p class="eyebrow">Final score</p>' +
      '<div class="big">' + pct + '%</div><p class="muted small" style="margin-top:6px">' + total + ' of ' + max + ' points across ' + CASES.length + ' patients</p>' +
      '<p style="margin-top:12px;font-weight:600">' + band + '</p></div>' +
      '<ol class="caseList">' + results.map(r =>
        '<li><span class="sp sp-' + r.c.species + '">' + esc(speciesName(r.c.species)) + '</span>' +
        '<span class="t"><b>' + esc(r.c.title) + '</b><small>' + esc(techName(r.picked)) +
        (r.picked === r.c.best ? ' ✓' : ' · best: ' + esc(techName(r.c.best))) + '</small></span>' +
        '<span class="s">' + r.score.total + '</span></li>').join('') + '</ol>' +
      (weak.length ? '<div class="banner" style="margin-top:16px"><span aria-hidden="true">↻</span><span><b>Revise:</b> ' +
        weak.map(r => r.c.best).filter((v, i, a) => a.indexOf(v) === i)
          .map(id => '<a href="atlas.html#' + id + '">' + esc(techName(id)) + '</a>').join(', ') + '</span></div>' : '') +
      '<div class="caseBtns"><button class="btn primary" id="againBtn">Run the cases again</button>' +
      '<a class="btn" href="test.html#quiz">Try the multiple-choice quiz</a>' +
      '<a class="btn" href="atlas.html">Back to the technique lab</a></div></article>';
    document.getElementById('againBtn').addEventListener('click', () => {
      idx = 0; results = []; choice = null; taps = []; stage = 'choose';
      render();
    });
    top();
  }

  document.querySelectorAll('[data-count="cases"]').forEach(n => { n.textContent = CASES.length; });
  render();
})();
