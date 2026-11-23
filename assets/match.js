/* Suture Atlas — "connect the stitch" matching exercise */
(function () {
  'use strict';
  const D = window.SUTURE;
  const $ = s => document.querySelector(s);
  const board = $('#board'), wires = $('#wires');
  const sutureCol = $('#sutureCol'), siteCol = $('#siteCol');
  const scoreNum = $('#scoreNum'), missNum = $('#missNum'), feedback = $('#feedback');
  const donePanel = $('#donePanel'), resetBtn = $('#resetBtn');

  const TECHS = D.TECHNIQUES;
  const sites = D.SITES.slice();
  let pairs = [], misses = 0, selected = null, dragPoint = null;

  const shuffle = a => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };

  const SPECIES = D.SPECIES || [];
  const speciesName = id => { const s = SPECIES.find(x => x.id === id); return s ? s.name : id; };
  $('#scoreMax').textContent = sites.length;

  /* the patterns in the atlas's own order, each with its drawing; the wounds shuffled,
     each with the same picture the case test uses */
  function render() {
    const srcs = TECHS.filter(t => sites.some(s => s.tech === t.id));
    sutureCol.innerHTML = '<h3>Pattern</h3>' + srcs.map(t =>
      '<button class="pill src" data-tech="' + t.id + '" aria-pressed="false">' +
      '<svg data-kind="' + t.draw + '" aria-hidden="true"></svg><span>' + t.name + '<small>' + t.group + '</small></span></button>'
    ).join('');
    siteCol.innerHTML = '<h3>Wound</h3>' + shuffle(sites).map(s =>
      '<button class="site" data-site="' + s.id + '" data-tech="' + s.tech + '">' +
      '<svg data-scene="' + s.scene + '" data-species="' + s.species + '" aria-hidden="true"></svg>' +
      '<span class="txt"><span class="sp sp-' + s.species + '">' + speciesName(s.species) + '</span>' +
      '<b>' + s.name + '</b><span class="sub">' + s.sub + '</span>' +
      '<span class="why"></span></span></button>'
    ).join('');
    sutureCol.querySelectorAll('svg[data-kind]').forEach(svg =>
      StitchSVG.draw(svg, svg.dataset.kind, { organ: svg.dataset.kind === 'lembert' || svg.dataset.kind === 'cushing' }));
    siteCol.querySelectorAll('svg[data-scene]').forEach(svg => window.SutureScenes.draw(svg, svg.dataset.scene, svg.dataset.species));
    bind();
    drawWires();
  }

  function elByTech(id) { return sutureCol.querySelector('[data-tech="' + id + '"]'); }
  function elBySite(id) { return siteCol.querySelector('[data-site="' + id + '"]'); }

  /* ---------- pointer dragging ---------- */
  let activePill = null, pointerId = null;

  function bind() {
    sutureCol.querySelectorAll('.pill').forEach(p => {
      p.addEventListener('pointerdown', e => {
        if (p.classList.contains('done')) return;
        select(p);
        activePill = p;
        pointerId = e.pointerId;
        dragPoint = { x: e.clientX, y: e.clientY };
        try { board.setPointerCapture(e.pointerId); } catch (err) { }
        e.preventDefault();
      });
      /* a click, or Enter or Space from the keyboard, picks the pattern too */
      p.addEventListener('click', () => {
        if (p.classList.contains('done')) return;
        select(p);
        feedback.textContent = TECHS.find(t => t.id === p.dataset.tech).name + ' picked: now choose its wound.';
        feedback.style.color = 'var(--accent)';
      });
    });
    var downOnSite = null;
    siteCol.querySelectorAll('.site').forEach(s => {
      s.addEventListener('pointerdown', () => { downOnSite = s; });
      s.addEventListener('pointerup', e => {
        if (!selected) return;
        tryMatch(selected.dataset.tech, s);
      });
      s.addEventListener('click', e => {
        if (selected) tryMatch(selected.dataset.tech, s);
      });
    });
  }

  function bindBoard() {
    board.addEventListener('pointermove', e => {
      if (!activePill) return;
      dragPoint = { x: e.clientX, y: e.clientY };
      highlightUnder(e.clientX, e.clientY);
      drawWires();
    });
    board.addEventListener('pointerup', e => {
      if (!activePill) return;
      const target = siteUnder(e.clientX, e.clientY);
      if (target) tryMatch(activePill.dataset.tech, target);
      activePill = null; pointerId = null; dragPoint = null;
      clearHot();
      drawWires();
    });
    board.addEventListener('pointercancel', () => {
      activePill = null; dragPoint = null; clearHot(); drawWires();
    });
  }

  function select(pill) {
    sutureCol.querySelectorAll('.pill').forEach(p => {
      p.setAttribute('aria-pressed', String(p === pill));
    });
    selected = pill;
  }

  function siteUnder(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('.site') : null;
  }
  function highlightUnder(x, y) {
    const t = siteUnder(x, y);
    clearHot();
    if (t) t.classList.add('hot');
  }
  function clearHot() { siteCol.querySelectorAll('.site.hot').forEach(s => s.classList.remove('hot')); }

  /* ---------- matching ---------- */
  function tryMatch(techId, siteEl) {
    if (!siteEl || siteEl.classList.contains('done')) return;
    const siteId = siteEl.dataset.site;
    if (siteEl.dataset.tech === techId) {
      siteEl.classList.add('done');
      const pill = elByTech(techId);
      pill.classList.add('done');
      pill.setAttribute('aria-pressed', 'false');
      const t = TECHS.find(x => x.id === techId);
      siteEl.querySelector('.why').textContent = t.bestFor;
      pairs.push({ tech: techId, site: siteId, el: siteEl });
      selected = null;
      feedback.textContent = 'Matched: ' + t.name + '.';
      feedback.style.color = 'var(--good)';
      updateScore();
      drawWires();
      if (pairs.length === sites.length) finish();
    } else {
      misses++;
      siteEl.classList.add('miss');
      setTimeout(() => siteEl.classList.remove('miss'), 420);
      feedback.textContent = 'That pattern does not belong there. Look at the wound and ask what the stitch has to do to the edges.';
      feedback.style.color = 'var(--bad)';
      missNum.textContent = misses + (misses === 1 ? ' miss' : ' misses');
      selected = null;
      sutureCol.querySelectorAll('.pill').forEach(p => p.setAttribute('aria-pressed', 'false'));
    }
  }

  function updateScore() {
    scoreNum.textContent = pairs.length;
    missNum.textContent = misses + (misses === 1 ? ' miss' : ' misses');
  }

  /* ---------- wires ---------- */
  function rel(el) {
    const b = board.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
  }
  function clearSvg() { while (wires.firstChild) wires.removeChild(wires.firstChild); }
  function path(x1, y1, x2, y2, opt) {
    const dx = Math.max(26, (x2 - x1) * 0.5);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', opt.colour || '#0e7a63');
    p.setAttribute('stroke-width', opt.width || 2.2);
    p.setAttribute('stroke-linecap', 'round');
    if (opt.dash) p.setAttribute('stroke-dasharray', '5 5');
    p.setAttribute('opacity', opt.opacity == null ? 1 : opt.opacity);
    wires.appendChild(p);
    return p;
  }
  function knot(x, y, colour) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 4);
    c.setAttribute('fill', '#fff'); c.setAttribute('stroke', colour || '#0e7a63');
    c.setAttribute('stroke-width', 2);
    wires.appendChild(c);
  }
  function drawWires() {
    const b = board.getBoundingClientRect();
    wires.setAttribute('viewBox', `0 0 ${Math.max(1, b.width)} ${Math.max(1, b.height)}`);
    clearSvg();
    if (!b.width) return;
    pairs.forEach(pr => {
      const pill = elByTech(pr.tech), site = pr.el;
      if (!pill || !site) return;
      const a = rel(pill), s = rel(site);
      path(a.x + a.w - 4, a.y + a.h / 2, s.x + 6, s.y + s.h / 2, {});
      knot(s.x + 6, s.y + s.h / 2);
    });
    if (selected && (activePill || selected)) {
      const pill = selected;
      if (!pill || !dragPoint) return;
      const a = rel(pill);
      path(a.x + a.w - 4, a.y + a.h / 2, dragPoint.x - b.left, dragPoint.y - b.top,
        { colour: '#2f6fcf', dash: true, width: 2 });
    }
  }

  /* ---------- finish ---------- */
  function finish() {
    const score = Math.max(0, Math.round((pairs.length / sites.length) * 100) - misses * 4);
    donePanel.hidden = false;
    $('#doneTitle').textContent = Math.max(0, score) + '% — ' + (misses === 0 ? 'no wrong pairings' : misses + (misses === 1 ? ' wrong pairing' : ' wrong pairings'));
    $('#doneText').textContent = misses === 0
      ? 'Move on to the case test, where you also place the stitches yourself.'
      : 'Read the reason on each wound: the why is the part that gets asked in vivas.';
    $('#doneList').innerHTML = sites.map(s => {
      const t = TECHS.find(x => x.id === s.tech);
      return '<li><span class="sp sp-' + s.species + '">' + speciesName(s.species) + '</span>' +
        '<span class="t"><b>' + s.name + '</b><small>' + t.name + '</small></span>' +
        '<a class="s small" href="atlas.html#' + t.id + '">Watch →</a></li>';
    }).join('');
    donePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function restart() {
    pairs = []; misses = 0; selected = null; dragPoint = null;
    donePanel.hidden = true;
    feedback.textContent = '';
    render(); updateScore();
  }
  resetBtn.addEventListener('click', restart);
  $('#againBtn').addEventListener('click', () => { restart(); board.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  window.addEventListener('resize', () => { if (board.getBoundingClientRect().width) drawWires(); });

  bindBoard();
  render();
  updateScore();
})();
