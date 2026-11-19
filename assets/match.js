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

  function render() {
    const srcs = sites.map(s => TECHS.find(t => t.id === s.tech)).filter(Boolean);
    sutureCol.innerHTML = '<h3>Suture technique</h3>' + srcs.map(t =>
      '<button class="pill src" data-tech="' + t.id + '" aria-pressed="false">' +
      '<span class="dot" aria-hidden="true"></span>' + t.name + '</button>'
    ).join('');
    siteCol.innerHTML = '<h3>Tissue / organ</h3>' + shuffle(sites).map(s =>
      '<button class="site" data-site="' + s.id + '" data-tech="' + s.tech + '">' +
      '<svg data-art="' + s.art + '" aria-hidden="true"></svg>' +
      '<b>' + s.name + '</b><span>' + s.sub + '</span>' +
      '<span class="why"></span></button>'
    ).join('');
    siteCol.querySelectorAll('svg[data-art]').forEach(svg => StitchSVG.siteArt(svg, svg.dataset.art));
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
      feedback.textContent = 'Connected. ' + t.name + ' — ' + t.bestFor;
      feedback.style.color = 'var(--good)';
      updateScore();
      drawWires();
      if (pairs.length === sites.length) finish();
    } else {
      misses++;
      siteEl.classList.add('miss');
      setTimeout(() => siteEl.classList.remove('miss'), 420);
      feedback.textContent = 'That strand does not belong there. Look at the tissue and ask what the stitch has to do to the edges.';
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
    $('#doneTitle').textContent = 'All eight connected — ' + Math.max(0, score) + '%';
    $('#doneText').textContent = misses === 0
      ? 'No wrong connections. Move on to the case test, where you also have to place the stitches yourself.'
      : misses + (misses === 1 ? ' wrong connection' : ' wrong connections') + '. Read the reason under each card — that is the part that gets asked in vivas.';
    $('#doneList').innerHTML = sites.map(s => {
      const t = TECHS.find(x => x.id === s.tech);
      return '<div><b>' + s.name + '</b> → ' + t.name +
        '<p class="small muted" style="margin-top:4px">' + t.bestFor + '</p></div>';
    }).join('');
    donePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  resetBtn.addEventListener('click', () => {
    pairs = []; misses = 0; selected = null; dragPoint = null;
    donePanel.hidden = true;
    feedback.textContent = '';
    render(); updateScore();
  });
  window.addEventListener('resize', () => { if (board.getBoundingClientRect().width) drawWires(); });

  bindBoard();
  render();
  updateScore();
})();
