/* Suture Atlas — scored case test */
(function () {
  'use strict';
  const D = window.SUTURE;
  const TECHS = D.TECHNIQUES;
  const cases = D.CASES;
  const root = document.getElementById('testRoot');
  const el = StitchSVG.el;

  let idx = 0, choice = null, taps = [], results = [], stage = 'choose';

  const LET = 'ABCDEFGH';

  /* ---------------- wound illustrations (100 x 70, wound at y = 37) ---------------- */
  function field(g, fill) {
    g.appendChild(el('rect', { x: 0, y: 0, width: 100, height: 70, fill: '#f8f4ee' }));
    if (fill) g.appendChild(el('rect', { x: 3, y: 8, width: 94, height: 54, rx: 8, fill: fill }));
  }
  function woundLine(g, y1, y2, col) {
    g.appendChild(el('path', {
      d: `M14 ${y1 || 37} L86 ${y2 || 37}`, stroke: col || '#8d4a3c',
      'stroke-width': 2.6, 'stroke-linecap': 'round', fill: 'none'
    }));
  }
  function drawArt(svg, c, o) {
    o = o || {};
    StitchSVG.clear(svg);
    svg.setAttribute('viewBox', '0 0 100 70');
    const g = el('g');
    svg.appendChild(g);

    if (c.art === 'gaping') {
      field(g, null);
      g.appendChild(el('rect', { x: 3, y: 10, width: 94, height: 24, rx: 8, fill: '#f0d3c4' }));
      g.appendChild(el('rect', { x: 3, y: 40, width: 94, height: 22, rx: 8, fill: '#f0d3c4' }));
      g.appendChild(el('path', { d: 'M6 34 L94 34', stroke: '#c08368', 'stroke-width': 2, fill: 'none' }));
      g.appendChild(el('path', { d: 'M6 40 L94 40', stroke: '#c08368', 'stroke-width': 2, fill: 'none' }));
      g.appendChild(el('path', { d: 'M6 37 L94 37', stroke: '#8d4a3c', 'stroke-width': 1, 'stroke-dasharray': '3 4', fill: 'none' }));
    } else if (c.art === 'fascia') {
      field(g, '#efe2d0');
      for (let x = 10; x < 95; x += 9) {
        g.appendChild(el('path', { d: `M${x} 10 L${x + 5} 60`, stroke: '#dcc7ab', 'stroke-width': 1.3, fill: 'none' }));
      }
      woundLine(g);
    } else if (c.art === 'bowel') {
      field(g, null);
      g.appendChild(el('rect', { x: 2, y: 16, width: 96, height: 38, rx: 19, fill: '#d98b93' }));
      g.appendChild(el('rect', { x: 2, y: 16, width: 96, height: 5, rx: 3, fill: '#f0c3c8' }));
      woundLine(g, 37, 37, '#7d2f39');
      g.appendChild(el('path', { d: 'M14 21 L86 21', stroke: '#f6dfe1', 'stroke-width': 1.4, fill: 'none' }));
    } else if (c.art === 'stomach') {
      field(g, null);
      g.appendChild(el('path', { d: 'M8 14 Q40 2 88 14 Q92 44 74 58 Q44 64 20 54 Q4 38 8 14 Z', fill: '#d98b93' }));
      g.appendChild(el('path', { d: 'M9 18 Q44 6 87 17', stroke: '#f0c3c8', 'stroke-width': 3, fill: 'none' }));
      woundLine(g, 37, 37, '#7d2f39');
    } else if (c.art === 'round') {
      field(g, null);
      g.appendChild(el('circle', { cx: 50, cy: 37, r: 27, fill: '#f0d3c4' }));
      g.appendChild(el('circle', { cx: 50, cy: 37, r: 27, fill: 'none', stroke: '#c99a86', 'stroke-width': 1.2 }));
      g.appendChild(el('circle', { cx: 50, cy: 37, r: 7, fill: '#7d2f39' }));
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        g.appendChild(el('line', {
          x1: 50 + 30 * Math.cos(a), y1: 37 + 30 * Math.sin(a),
          x2: 50 + 36 * Math.cos(a), y2: 37 + 36 * Math.sin(a),
          stroke: '#d9b6a2', 'stroke-width': 1.4
        }));
      }
    } else {
      field(g, '#f0d3c4');
      for (let k = 0; k < 6; k++) {
        g.appendChild(el('path', {
          d: `M${8 + k * 15} 12 q6 8 0 18`, stroke: '#e5c0ae', 'stroke-width': 1, fill: 'none'
        }));
      }
      woundLine(g);
    }

    if (o.ideal) {
      const t = TECHS.find(x => x.id === c.best);
      StitchSVG.pattern(g, t.draw, c.targets);
    }
    if (o.taps) {
      o.taps.forEach((p, k) => {
        g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 5.6, fill: 'rgba(168,56,44,.16)', stroke: '#a8382c', 'stroke-width': 1.6 }));
        g.appendChild(el('text', {
          x: p.x, y: p.y + 2.6, 'text-anchor': 'middle', 'font-size': 6.4,
          'font-family': 'ui-monospace,monospace', fill: '#a8382c', 'font-weight': 700
        }, String(k + 1)));
      });
    }
  }

  /* ---------------- scoring ---------------- */
  function scoreCase(c, picked, pts) {
    const choiceScore = picked === c.best ? 60 : c.ok.indexOf(picked) >= 0 ? 32 : 0;
    const used = pts.map(() => false);
    let hits = 0;
    c.targets.forEach(t => {
      const tx = StitchSVG.px(t);
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

  /* ---------------- views ---------------- */
  function render() {
    const c = cases[idx];
    if (stage === 'choose') return renderChoose(c);
    if (stage === 'place') return renderPlace(c);
    if (stage === 'result') return renderResult(c);
    renderFinal();
  }

  function head(c) {
    return '<div class="caseHead"><span class="n">Case ' + (idx + 1) + ' of ' + cases.length + '</span>' +
      '<span class="muted small">' + c.title + '</span></div>';
  }

  function renderChoose(c) {
    root.innerHTML =
      '<div class="card">' + head(c) +
      '<p class="vignette">' + c.text + '</p>' +
      '<div class="woundbox"><svg id="art"></svg></div>' +
      '<p style="font-weight:600;margin-top:4px">Which technique is the best choice here?</p>' +
      '<div class="opts" id="opts">' + TECHS.map((t, k) =>
        '<button class="opt" data-tech="' + t.id + '"><span class="k">' + LET[k] + '</span>' + t.name + '</button>'
      ).join('') + '</div>' +
      '<p class="note">Pick one — you will place the stitches on the next screen.</p></div>';
    drawArt(document.getElementById('art'), c, {});
    document.getElementById('opts').addEventListener('click', e => {
      const b = e.target.closest('button[data-tech]');
      if (!b) return;
      choice = b.dataset.tech;
      taps = [];
      stage = 'place';
      render();
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderPlace(c) {
    const n = c.targets.length;
    root.innerHTML =
      '<div class="card">' + head(c) +
      '<p class="vignette" style="font-size:15px">' + c.text + '</p>' +
      '<p class="small" style="margin-top:8px"><b>You chose:</b> ' + techName(choice) + '</p>' +
      '<div class="woundbox" style="position:relative"><svg id="art" style="cursor:crosshair"></svg></div>' +
      '<p style="font-weight:600">' + (c.wound === 'round'
        ? 'Tap the centre of the defect to place your stitch.'
        : 'Place ' + n + ' stitches — tap where each one should cross the wound.') + '</p>' +
      '<p class="small muted" id="tapCount"></p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<button class="btn" id="undoBtn">Undo last</button>' +
      '<button class="btn primary" id="checkBtn">Check my answer</button>' +
      '</div></div>';
    const svg = document.getElementById('art');
    const undo = document.getElementById('undoBtn');
    const check = document.getElementById('checkBtn');
    const count = document.getElementById('tapCount');

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
      if (p.y < 8 || p.y > 64) return;
      taps.push(p);
      refresh();
    });
    undo.addEventListener('click', () => { taps.pop(); refresh(); });
    check.addEventListener('click', () => {
      if (taps.length < n) return;
      const s = scoreCase(c, choice, taps);
      results[idx] = { case: c, picked: choice, taps: taps.slice(), score: s };
      stage = 'result';
      render();
    });
    refresh();
  }

  function renderResult(c) {
    const r = results[idx];
    const s = r.score;
    const best = TECHS.find(t => t.id === c.best);
    const right = r.picked === c.best;
    const almost = c.ok.indexOf(r.picked) >= 0;
    root.innerHTML =
      '<div class="card">' + head(c) +
      '<div style="display:flex;align-items:baseline;gap:12px;margin:4px 0 10px">' +
      '<span style="font:700 34px/1 var(--mono);letter-spacing:-.02em">' + s.total + '</span>' +
      '<span class="muted small">/ 100 for this case</span></div>' +
      '<div class="woundbox"><svg id="art"></svg></div>' +
      '<div class="verdict">' +
      '<div class="vrow"><b>Your choice</b><span>' + techName(r.picked) +
      ' <span class="chip ' + (right ? 't' : '') + '">' + (right ? 'best' : almost ? 'acceptable' : 'not the best') + '</span></span></div>' +
      '<div class="vrow"><b>Best choice</b><span>' + best.name + '</span></div>' +
      '<div class="vrow"><b>Technique</b><span style="flex:1">' + s.choiceScore + '/60</span></div>' +
      '<div class="bar2" style="max-width:220px"><i style="width:' + Math.round(s.choiceScore / 60 * 100) + '%"></i></div>' +
      '<div class="vrow"><b>Placement</b><span style="flex:1">' + s.hits + ' of ' + c.targets.length + ' → ' + s.placeScore + '/40</span></div>' +
      '<div class="bar2" style="max-width:220px"><i style="width:' + Math.round(s.placeScore / 40 * 100) + '%"></i></div>' +
      '</div>' +
      '<p class="small" style="margin-top:14px"><b>Why:</b> ' + c.why + '</p>' +
      '<p class="small muted" style="margin-top:8px"><b>What catches people out:</b> ' + c.trap + '</p>' +
      '<div class="small muted" style="margin-top:14px;display:flex;gap:16px;flex-wrap:wrap">' +
      '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2f6fcf;margin-right:6px"></span>Ideal pattern</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#a8382c;margin-right:6px"></span>Your stitches</span></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">' +
      '<button class="btn primary" id="nextBtn">' + (idx + 1 < cases.length ? 'Next case →' : 'See final score →') + '</button>' +
      '<a class="btn" href="atlas.html#' + best.id + '">Watch ' + best.name + '</a>' +
      '</div></div>';
    drawArt(document.getElementById('art'), c, { ideal: true, taps: r.taps });
    document.getElementById('nextBtn').addEventListener('click', () => {
      idx++;
      choice = null; taps = [];
      stage = idx < cases.length ? 'choose' : 'final';
      render();
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderFinal() {
    const total = results.reduce((s, r) => s + r.score.total, 0);
    const max = cases.length * 100;
    const pct = Math.round(total / max * 100);
    const band = pct >= 85 ? 'Excellent — your choices and your stitch placement both hold up.'
      : pct >= 70 ? 'Solid. Read the cases you lost points on, then run it again.'
        : pct >= 50 ? 'Getting there. The technique lab will fix most of what you missed.'
          : 'Start with the technique lab, one pattern at a time, then come back.';
    const weak = results.filter(r => r.score.total < 70);
    root.innerHTML =
      '<div class="card"><div class="final">' +
      '<p class="eyebrow">Final score</p>' +
      '<div class="big">' + pct + '%</div>' +
      '<p class="muted small" style="margin-top:6px">' + total + ' of ' + max + ' points across ' + cases.length + ' cases</p>' +
      '<p style="margin-top:12px;font-weight:600">' + band + '</p></div>' +
      '<div class="breakdown">' + results.map((r, k) =>
        '<div><span>' + (k + 1) + '. ' + r.case.title + '<br><span class="small muted">' +
        techName(r.picked) + (r.picked === r.case.best ? ' ✓' : ' · best: ' + techName(r.case.best)) +
        '</span></span><span style="font:600 14px var(--mono)">' + r.score.total + '</span></div>'
      ).join('') + '</div>' +
      (weak.length ? '<div class="banner" style="margin-top:16px"><span>↻</span><span><b>Revise:</b> ' +
        weak.map(r => '<a href="atlas.html#' + r.case.best + '">' + techName(r.case.best) + '</a>').join(', ') +
        '</span></div>' : '') +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">' +
      '<button class="btn primary" id="againBtn">Run the cases again</button>' +
      '<a class="btn" href="match.html">Try the matching exercise</a>' +
      '<a class="btn" href="atlas.html">Back to the technique lab</a>' +
      '</div></div>';
    document.getElementById('againBtn').addEventListener('click', () => {
      idx = 0; results = []; choice = null; taps = []; stage = 'choose';
      render();
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function techName(id) {
    const t = TECHS.find(x => x.id === id);
    return t ? t.name : '—';
  }

  render();
})();
