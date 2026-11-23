/* Suture Atlas — the wound pictures shared by the case test and the matching game.
   Each is a top view in a 100 x 70 box with the wound along y = 37 from x = 12 to 88
   (or round, centred on 50, 37), so the stitch drawings in stitch.js line up with
   every scene. The coats, the clipped field and the organs share the palette of the
   3D lab. Needs stitch.js first. */
window.SutureScenes = (function () {
  'use strict';
  const S = window.StitchSVG, el = S.el;
  const COAT = { dog: '#8a6646', cat: '#7a736c', horse: '#55361f', sheep: '#e4d9bf', cattle: '#6a3a24' };
  const SKIN = '#ecbcaa', SKIN_D = '#d99f8b', CUT = '#6e2c26', DRAPE = '#2d6470';
  const shade = (h, k) => {
    const n = parseInt(h.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, '0');
    return '#' + f(n >> 16 & 255) + f(n >> 8 & 255) + f(n & 255);
  };
  const tint = (h, k) => {   /* towards white */
    const n = parseInt(h.slice(1), 16), f = c => Math.round(c + (255 - c) * k).toString(16).padStart(2, '0');
    return '#' + f(n >> 16 & 255) + f(n >> 8 & 255) + f(n & 255);
  };
  /* the same strands every time a scene is drawn */
  const rng = seed => { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  const add = (g, tag, a) => { const n = el(tag, a); g.appendChild(n); return n; };

  function drape(g) {
    add(g, 'rect', { x: 0, y: 0, width: 100, height: 70, fill: DRAPE });
    for (let x = -70; x < 100; x += 3.2) add(g, 'path', { d: `M${x} 0 l70 70`, stroke: '#fff', 'stroke-opacity': 0.035, 'stroke-width': 0.6 });
  }
  function coat(g, species, angle, seed, colour) {
    const c = colour || COAT[species] || COAT.dog, r = rng(seed);
    add(g, 'rect', { x: 0, y: 0, width: 100, height: 70, fill: c });
    if (species === 'sheep') {
      /* fleece: crimped locks rather than lying hair */
      for (let i = 0; i < 230; i++) {
        const x = r() * 104 - 2, y = r() * 74 - 2, s = 1.4 + r() * 1.8;
        add(g, 'path', { d: `M${x} ${y} q${s} ${-s} ${2 * s} 0 q${s} ${s} ${2 * s} 0`, fill: 'none',
          stroke: r() < 0.5 ? shade(c, 0.8) : '#fffaf0', 'stroke-opacity': 0.75, 'stroke-width': 0.55, 'stroke-linecap': 'round' });
      }
      return;
    }
    if (species === 'cat') {
      /* tabby bands under the hair */
      for (let i = 0; i < 9; i++) add(g, 'path', { d: `M${i * 13 - 8} -4 q6 38 -2 78`, stroke: shade(c, 0.62), 'stroke-width': 3.2, fill: 'none', opacity: 0.55 });
    }
    for (let i = 0; i < 300; i++) {
      const x = r() * 104 - 2, y = r() * 74 - 2, a = angle + (r() - 0.5) * 0.5, len = 2.2 + r() * 2.6;
      add(g, 'path', { d: `M${x.toFixed(1)} ${y.toFixed(1)} l${(Math.cos(a) * len).toFixed(2)} ${(Math.sin(a) * len).toFixed(2)}`,
        stroke: r() < 0.6 ? shade(c, 0.72) : shade(c, 1.3), 'stroke-opacity': 0.7, 'stroke-width': 0.45, 'stroke-linecap': 'round' });
    }
  }
  /* the clipped, prepared field round the wound */
  function clipped(g, x, y, w, h, seed) {
    add(g, 'rect', { x, y, width: w, height: h, rx: 7, fill: SKIN });
    add(g, 'rect', { x: x + 0.6, y: y + 0.6, width: w - 1.2, height: h - 1.2, rx: 6.5, fill: 'none', stroke: SKIN_D, 'stroke-width': 0.6, opacity: 0.6 });
    const r = rng(seed + 7);
    for (let i = 0; i < 140; i++) {
      const px = x + 2 + r() * (w - 4), py = y + 2 + r() * (h - 4);
      add(g, 'circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 0.22, fill: '#8a5a48', opacity: 0.45 });
    }
  }
  function incision(g, o) {
    o = o || {};
    add(g, 'path', { d: 'M12 37 L88 37', stroke: o.col || CUT, 'stroke-width': o.w || 2.2, 'stroke-linecap': 'round' });
    add(g, 'path', { d: 'M13 38.5 L87 38.5', stroke: '#fff', 'stroke-opacity': 0.3, 'stroke-width': 0.6, 'stroke-linecap': 'round' });
  }
  function arrow(g, x, y, dx, dy) {
    add(g, 'path', { d: `M${x} ${y} l${dx} ${dy}`, stroke: '#fff', 'stroke-width': 0.9, 'stroke-opacity': 0.8, 'stroke-linecap': 'round' });
    const a = Math.atan2(dy, dx), hx = x + dx, hy = y + dy;
    add(g, 'path', { d: `M${hx} ${hy} l${(-Math.cos(a - 0.5) * 2.4).toFixed(2)} ${(-Math.sin(a - 0.5) * 2.4).toFixed(2)} M${hx} ${hy} l${(-Math.cos(a + 0.5) * 2.4).toFixed(2)} ${(-Math.sin(a + 0.5) * 2.4).toFixed(2)}`,
      stroke: '#fff', 'stroke-width': 0.9, 'stroke-opacity': 0.8, 'stroke-linecap': 'round', fill: 'none' });
  }

  const SCENES = {
    limb: (g, c) => { coat(g, c.species, 0.35, 11); clipped(g, 8, 13, 84, 48, 11); incision(g); },
    bite: (g, c) => {
      coat(g, c.species, 0, 23); clipped(g, 7, 12, 86, 50, 23);
      /* a few puncture marks beside the tear, and the drain below it */
      [[26, 30], [61, 45], [70, 29]].forEach(([x, y]) => add(g, 'circle', { cx: x, cy: y, r: 1.1, fill: '#7a3128', opacity: 0.8 }));
      add(g, 'path', { d: 'M46 41 C48 50 50 56 54 66', stroke: '#e9d48c', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', opacity: 0.95 });
      add(g, 'path', { d: 'M46 41 C48 50 50 56 54 66', stroke: '#b89d4f', 'stroke-width': 0.5, fill: 'none', opacity: 0.8 });
      incision(g);
    },
    gaping: (g, c) => {
      coat(g, c.species, 0.2, 37); clipped(g, 7, 11, 86, 52, 37);
      add(g, 'path', { d: 'M12 37 Q50 28.5 88 37 Q50 45.5 12 37 Z', fill: '#9a463b' });
      add(g, 'path', { d: 'M18 37 Q50 33 82 37 Q50 41 18 37 Z', fill: '#e8c46a', opacity: 0.75 });
      add(g, 'path', { d: 'M12 37 Q50 28.5 88 37 M12 37 Q50 45.5 88 37', stroke: CUT, 'stroke-width': 1.3, fill: 'none' });
    },
    tension: (g, c) => {
      coat(g, c.species, -0.3, 41); clipped(g, 6, 10, 88, 54, 41);
      add(g, 'path', { d: 'M14 37 Q50 31.5 86 37 Q50 42.5 14 37 Z', fill: '#a14b40' });
      add(g, 'path', { d: 'M14 37 Q50 31.5 86 37 M14 37 Q50 42.5 86 37', stroke: CUT, 'stroke-width': 1.5, fill: 'none' });
      /* the pull on both edges */
      [30, 50, 70].forEach(x => { arrow(g, x, 29, 0, -9); arrow(g, x, 45, 0, 9); });
    },
    oblique: (g, c) => {
      /* the hair runs along the body: the wound crosses it at an angle */
      coat(g, c.species, -0.62, 53); clipped(g, 7, 12, 86, 50, 53);
      add(g, 'path', { d: 'M4 64 L96 8', stroke: '#fff', 'stroke-opacity': 0.35, 'stroke-width': 0.6, 'stroke-dasharray': '2 2' });
      incision(g);
      arrow(g, 30, 30, -6, -6); arrow(g, 70, 44, 6, 6);
    },
    flank: (g, c) => {
      drape(g);
      add(g, 'rect', { x: 3, y: 6, width: 94, height: 58, rx: 3, fill: COAT[c.species] || COAT.dog });
      clipped(g, 5, 8, 90, 54, 61);
      incision(g, { w: 2.6 });
    },
    belly: (g, c) => {
      /* the belly's paler coat, a wide clipped field and, in a bitch or queen, the teats */
      coat(g, c.species, 1.2, 83, tint(COAT[c.species] || COAT.dog, 0.38));
      clipped(g, 5, 7, 90, 56, 83);
      if (c.species === 'dog' || c.species === 'cat') {
        [20, 40, 60, 80].forEach(x => [17, 57].forEach(y => {
          add(g, 'circle', { cx: x, cy: y, r: 2.4, fill: '#d79d90', opacity: 0.7 });
          add(g, 'circle', { cx: x, cy: y, r: 1.1, fill: '#b9786d' });
        }));
      }
      incision(g);
    },
    bowel: g => {
      drape(g);
      /* the mesentery fanning down from the loop, with its vessels */
      add(g, 'path', { d: 'M8 54 L50 72 L92 54 Z', fill: '#ead39c', opacity: 0.8 });
      [18, 34, 50, 66, 82].forEach(x => add(g, 'path', { d: `M50 72 Q${(50 + x) / 2} 62 ${x} 55`, stroke: '#a8283a', 'stroke-width': 0.8, fill: 'none' }));
      add(g, 'rect', { x: -2, y: 18, width: 104, height: 37, rx: 17, fill: '#d9998b' });
      add(g, 'rect', { x: -2, y: 19, width: 104, height: 8, rx: 4, fill: '#f0c3b8', opacity: 0.6 });
      add(g, 'rect', { x: -2, y: 47, width: 104, height: 8, rx: 4, fill: '#b9786d', opacity: 0.45 });
      incision(g, { col: '#7d2f39' });
      add(g, 'path', { d: 'M20 37 L80 37', stroke: '#a5323e', 'stroke-width': 0.7 });
    },
    stomach: g => {
      drape(g);
      add(g, 'path', { d: 'M3 18 Q30 4 70 9 Q98 13 97 34 Q96 60 66 64 Q30 68 8 56 Q-2 40 3 18 Z', fill: '#dca596' });
      add(g, 'path', { d: 'M8 56 Q30 68 66 64 Q96 60 97 34', stroke: '#a8283a', 'stroke-width': 1, fill: 'none' });
      add(g, 'path', { d: 'M10 20 Q32 9 68 13', stroke: '#f2cbbd', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', opacity: 0.7 });
      /* stay sutures holding the ends of the incision up */
      [[9, 37], [91, 37]].forEach(([x, y]) => add(g, 'path', { d: `M${x} ${y - 3} q-3 3 0 6`, stroke: '#8d9aa3', 'stroke-width': 0.9, fill: 'none' }));
      incision(g, { col: '#7d2f39' });
    },
    uterus: g => {
      drape(g);
      add(g, 'rect', { x: -4, y: 11, width: 108, height: 50, rx: 24, fill: '#d98a8c' });
      add(g, 'rect', { x: -4, y: 12, width: 108, height: 10, rx: 5, fill: '#efb6b5', opacity: 0.55 });
      /* the tortuous uterine vessels running along it */
      add(g, 'path', { d: 'M-2 57 C10 52 16 60 28 55 S46 52 58 57 S80 60 102 54', stroke: '#5b3b70', 'stroke-width': 1.6, fill: 'none' });
      add(g, 'path', { d: 'M-2 54 C12 50 18 57 30 52 S48 49 60 54 S82 57 102 51', stroke: '#a8283a', 'stroke-width': 1.1, fill: 'none' });
      incision(g, { col: '#7d2f39', w: 2.6 });
    },
    anus: (g, c) => {
      coat(g, c.species, 0, 71);
      /* the tail above, the clipped perineum, and the swollen ring of the reduced prolapse */
      add(g, 'rect', { x: 39, y: -4, width: 22, height: 16, rx: 9, fill: shade(COAT[c.species] || COAT.dog, 0.9) });
      add(g, 'circle', { cx: 50, cy: 37, r: 29, fill: SKIN });
      add(g, 'circle', { cx: 50, cy: 37, r: 15, fill: '#b98378', opacity: 0.55 });
      add(g, 'circle', { cx: 50, cy: 37, r: 10.5, fill: '#c76a6f' });
      add(g, 'circle', { cx: 50, cy: 37, r: 6.5, fill: '#5a2024' });
    }
  };

  /* draw scene `scene` for `species` into an svg; returns the group to draw over */
  function draw(svg, scene, species) {
    S.clear(svg);
    svg.setAttribute('viewBox', '0 0 100 70');
    const g = el('g');
    svg.appendChild(g);
    (SCENES[scene] || SCENES.limb)(g, { species: species || 'dog' });
    return g;
  }
  return { draw, COAT };
})();
