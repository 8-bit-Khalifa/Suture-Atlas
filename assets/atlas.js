/* Suture Atlas — technique lab page wiring */
(function () {
  'use strict';
  const D = window.SUTURE;
  const $ = s => document.querySelector(s);
  const TECHS = D.TECHNIQUES;

  const tabsEl = $('#techTabs'), stepList = $('#stepList'), infoEl = $('#info');
  const legendEl = $('#legend'), nameEl = $('#techName'), tagEl = $('#techTag');
  const stepsBtn = $('#stepsBtn');
  const playBtn = $('#playBtn'), seekEl = $('#seek'), timeEl = $('#time'), speedEl = $('#speed');
  const autoBtn = $('#autoBtn'), seeBtn = $('#seeBtn'), viewsEl = $('#views');
  const motionBtn = $('#motionBtn'), mdBtn = $('#mdBtn');
  const speciesBar = $('#speciesBar'), speciesNote = $('#speciesNote');
  const SPECIES = D.SPECIES || [];

  const VIEWS = [
    { k: '3d', n: '3D' },
    { k: 'section', n: 'Cross-section' },
    { k: 'top', n: 'Top' },
    { k: 'knot', n: 'Close-up' }
  ];

  let current = (location.hash || '').replace('#', '') || TECHS[0].id;
  if (!TECHS.some(t => t.id === current)) current = TECHS[0].id;

  /* The transcript under the player: steps appear as the playhead reaches them,
     unless the reader asks for the whole list up front. */
  let stepsAll = false, stepIdx = 0;

  /* ---- tabs ---- */
  tabsEl.innerHTML = TECHS.map(t =>
    '<button role="tab" data-id="' + t.id + '" aria-selected="false">' + t.name + '</button>'
  ).join('');
  tabsEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (b) loadTech(b.dataset.id);
  });

  /* ---- view buttons ---- */
  viewsEl.insertAdjacentHTML('beforeend', VIEWS.map(v =>
    '<button class="btn sm" data-view="' + v.k + '" aria-pressed="false">' + v.n + '</button>'
  ).join(''));
  viewsEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    lab && lab.setView(b.dataset.view);
    markView(b.dataset.view);
  });

  function markView(name) {
    viewsEl.querySelectorAll('button[data-view]').forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.view === name));
  }

  /* ---- rail + info ---- */
  function buildRail(t) {
    nameEl.textContent = t.name;
    tagEl.textContent = t.tagline;
    stepList.innerHTML = t.steps.map(s =>
      '<li><button type="button"><span class="st">' + s.t + '</span>' +
      '<span class="sb">' + s.b + '</span><span class="bar"><i></i></span></button></li>'
    ).join('');
    stepList.querySelectorAll('li > button').forEach((b, i) => {
      b.addEventListener('click', () => lab && lab.seekStep(i));
    });
    stepIdx = 0;
    applySteps(0, true);
    legendEl.innerHTML = t.tissue.layers.map(l =>
      '<span><i style="background:#' + l.c.toString(16).padStart(6, '0') + '"></i>' + l.n + '</span>'
    ).join('') + '<span><i style="background:#2f6fcf;border-radius:6px;height:4px;width:16px;border:0"></i>Suture</span>' +
      '<span><i style="background:#e4ebf2;border-radius:50%;border:0"></i>Needle</span>';
  }

  function applySteps(i, instant) {
    stepList.querySelectorAll('li').forEach((li, k) => {
      const reached = stepsAll || k <= i;
      li.classList.toggle('cur', k === i);
      if (!reached) { li.classList.add('hide'); return; }
      if (li.classList.contains('hide')) {
        li.classList.remove('hide');
        if (!instant) {
          li.classList.add('in');
          setTimeout(() => li.classList.remove('in'), 320);
        }
      }
    });
  }

  stepsBtn.addEventListener('click', () => {
    stepsAll = !stepsAll;
    stepsBtn.setAttribute('aria-pressed', String(stepsAll));
    stepsBtn.textContent = stepsAll ? 'Show reached steps' : 'Show all steps';
    applySteps(stepIdx);
  });

  function fitChip(t, m) {
    if (t.typical.indexOf(m.id) >= 0) return '<span class="fit t">Typical</span>';
    if (t.possible.indexOf(m.id) >= 0) return '<span class="fit p">Possible</span>';
    return '<span class="fit r">Rarely used</span>';
  }

  function buildInfo(t) {
    const ul = a => '<ul>' + a.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    const rows = D.MATERIALS.map(m =>
      '<tr><td><b>' + m.name + '</b><br><span class="muted small">' + m.structure + '</span></td>' +
      '<td>' + m.abs + '</td><td>' + m.use + '</td><td>' + fitChip(t, m) + '</td></tr>'
    ).join('');
    infoEl.innerHTML =
      '<div class="card"><h3>Indications</h3>' + ul(t.indications) + '</div>' +
      '<div class="card pro"><h3>Advantages</h3>' + ul(t.pros) + '</div>' +
      '<div class="card con"><h3>Disadvantages</h3>' + ul(t.cons) + '</div>' +
      '<div class="card"><h3>Technique checklist</h3>' + ul(t.checklist) + '</div>' +
      '<div class="card"><h3>Needle and size</h3>' +
      '<p style="font-weight:600">' + t.needle + '</p>' +
      '<p class="small muted" style="margin-top:6px">' + t.needleWhy + '</p>' +
      '<p class="small" style="margin-top:10px"><b>Usual size:</b> ' + t.size + '</p>' +
      '<p class="small" style="margin-top:8px"><a href="materials.html">Compare materials and needles →</a></p></div>' +
      '<div class="card wide"><h3>Suture materials for this technique</h3><div class="tw"><table>' +
      '<thead><tr><th>Material</th><th>Type</th><th>Typical use</th><th>This technique</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<p class="note">“Typical” means the material is commonly chosen for this technique and tissue. Absorption times, sizes and knot security vary by product, tissue and patient — check the label and your local protocol.</p></div>';
  }

  /* ---- engine ---- */
  const lab = window.SutureLab ? window.SutureLab.mount($('#stage'), {
    startWith: (location.hash || '').replace('#', '') || TECHS[0].id,
    hud: $('#hud'),
    annLayer: $('#annLayer'),
    onStep: i => {
      stepIdx = i;
      applySteps(i);
    },
    onTime: (t, total, i, l, playing) => {
      if (document.activeElement !== seekEl) seekEl.value = Math.round(total ? (t / total) * 1000 : 0);
      timeEl.textContent = fmt(t) + ' / ' + fmt(total);
      playBtn.textContent = playing ? 'Pause' : (t >= total - 0.02 ? 'Replay' : 'Play');
      const bar = stepList.querySelector('li.cur .bar i');
      if (bar) bar.style.width = Math.round(l * 100) + '%';
    },
    onAuto: v => autoBtn.setAttribute('aria-pressed', String(!!v)),
    onView: markView
  }) : null;

  function fmt(v) {
    v = Math.max(0, v || 0);
    return Math.floor(v / 60) + ':' + String(Math.floor(v % 60)).padStart(2, '0');
  }

  function loadTech(id) {
    const t = TECHS.find(x => x.id === id) || TECHS[0];
    current = t.id;
    tabsEl.querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.id === t.id)));
    buildRail(t);
    buildInfo(t);
    /* keep the query string: `?motion=continuous` has to survive a change of tab */
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + '#' + t.id);
    if (lab) {
      lab.load(t.id);
    } else {
      document.querySelectorAll('#stepList li')[0]?.classList.add('cur');
    }
    autoBtn.setAttribute('aria-pressed', 'true');
    if (lab) {
      seeBtn.setAttribute('aria-pressed', String(lab.seeThrough));
      markMotion(lab.motionMode);
      markSpecies(lab.species);
    }
    markView('3d');
  }

  /* ---- species preset ---- */
  speciesBar.insertAdjacentHTML('beforeend', SPECIES.map(s =>
    '<button class="btn sm" data-species="' + s.id + '" aria-pressed="false">' + s.name + '</button>'
  ).join(''));
  function markSpecies(id) {
    speciesBar.querySelectorAll('button[data-species]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.species === id)));
    const s = SPECIES.find(x => x.id === id);
    speciesNote.textContent = s ? s.note : '';
  }
  /* Keep a choice in the query string so a reload comes back to the same view. */
  function putParam(k, v) {
    const u = new URL(location.href);
    if (v == null) u.searchParams.delete(k); else u.searchParams.set(k, v);
    if (history.replaceState) history.replaceState(null, '', u.pathname + u.search + (location.hash || ''));
  }
  speciesBar.addEventListener('click', e => {
    const b = e.target.closest('button[data-species]');
    if (!b || !lab) return;
    markSpecies(lab.setSpecies(b.dataset.species));
    putParam('species', b.dataset.species === 'dog' ? null : b.dataset.species);
  });

  /* ---- before/after movement model ---- */
  function markMotion(m) {
    const after = m === 'continuous';
    motionBtn.textContent = after ? 'Movement: after' : 'Movement: before';
    motionBtn.setAttribute('aria-pressed', String(after));
    mdBtn.setAttribute('aria-pressed', String(m === 'md'));
  }
  /* Each button toggles its own model; pressing it again returns to the plain arc. */
  function toggleMotion(mode) {
    if (!lab) return;
    const m = lab.setMotion(lab.motionMode === mode ? 'arc' : mode);
    markMotion(m);
    putParam('motion', m === 'arc' ? null : m);
  }
  motionBtn.addEventListener('click', () => toggleMotion('continuous'));
  mdBtn.addEventListener('click', () => toggleMotion('md'));

  /* ---- controls ---- */
  seeBtn.addEventListener('click', () => {
    if (!lab) return;
    seeBtn.setAttribute('aria-pressed', String(lab.setSeeThrough(!lab.seeThrough)));
  });
  playBtn.addEventListener('click', () => lab && lab.toggle());
  seekEl.addEventListener('input', () => lab && lab.seek((+seekEl.value / 1000) * lab.total));
  speedEl.addEventListener('change', () => lab && lab.setSpeed(+speedEl.value));
  autoBtn.addEventListener('click', () => lab && lab.toggleAuto());
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) {
      e.preventDefault();
      lab && lab.toggle();
    }
  });
  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').replace('#', '');
    if (id && id !== current) loadTech(id);
  });

  loadTech(current);
})();
