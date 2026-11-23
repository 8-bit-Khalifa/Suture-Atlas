/* Suture Atlas — small 2D stitch drawings: thumbnails, matching-game art and the
   test's ideal-pattern overlay. All drawn in a 0 0 100 70 viewBox as a top view:
   the wound runs horizontally at y = 37 and every stitch crosses it vertically. */
window.StitchSVG = (function () {
  'use strict';
  const VB = '0 0 100 70';
  const C = { thread: '#2f6fcf', deep: '#7d2f39', muted: '#54655f', skin: '#e9b6a2', skin2: '#df9089', fat: '#f0d79a' };
  const W = { y0: 22, y1: 52, mid: 37, x0: 12, x1: 88 };

  function el(tag, attrs, extra) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (extra) n.innerHTML = extra;
    return n;
  }
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  const px = t => W.x0 + t * (W.x1 - W.x0);

  /* Base field + wound. organ = hollow viscus (tube seen from outside). */
  function base(root, organ, slant) {
    if (organ) {
      root.appendChild(el('rect', { x: 0, y: 0, width: 100, height: 70, fill: '#f8f4ee' }));
      root.appendChild(el('rect', { x: 0, y: 17, width: 100, height: 36, fill: '#d98b93' }));
      root.appendChild(el('rect', { x: 0, y: 17, width: 100, height: 4, fill: '#f0c3c8' }));
      root.appendChild(el('path', { d: 'M12 37 L88 37', stroke: C.deep, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
    } else {
      root.appendChild(el('rect', { x: 0, y: 0, width: 100, height: 70, fill: '#f8f4ee' }));
      root.appendChild(el('rect', { x: 0, y: 14, width: 100, height: 44, fill: C.skin }));
      root.appendChild(el('rect', { x: 0, y: 14, width: 100, height: 6, fill: '#f2c8b6' }));
      if (slant) {
        root.appendChild(el('path', { d: 'M10 44 L90 30', stroke: C.deep, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
      } else {
        root.appendChild(el('path', { d: 'M12 37 L88 37', stroke: C.deep, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
      }
    }
  }
  function knot(root, x, y) {
    root.appendChild(el('circle', { cx: x, cy: y, r: 2.5, fill: '#fff', stroke: C.thread, 'stroke-width': 1.7 }));
  }

  /* A completed pattern. positions are 0..1 along the wound. */
  function pattern(root, kind, positions, opts) {
    const o = opts || {};
    const col = o.colour || C.thread;
    const t = (x1, y1, x2, y2) => root.appendChild(el('path', {
      d: `M${x1} ${y1} L${x2} ${y2}`, stroke: col, 'stroke-width': 2.1,
      'stroke-linecap': 'round', fill: 'none'
    }));
    const arc = (d) => root.appendChild(el('path', { d, fill: 'none', stroke: col, 'stroke-width': 2.1, 'stroke-linecap': 'round' }));
    if (kind === 'intradermal') {
      /* Buried: bites along each edge just under the skin, crossing straight over
         between them, drawn dashed because none of it shows on the surface; the
         buried knots at the two ends are hollow. */
      const xs = (positions || [0.32, 0.5, 0.68]).map(px);
      const x0 = Math.min.apply(null, xs) - 8, x1 = Math.max.apply(null, xs) + 8;
      const k = Math.max(4, xs.length * 2 - 1), step = (x1 - x0) / k;
      let d = '';
      for (let i = 0; i < k; i++) {
        const y = W.mid + (i % 2 ? 3.4 : -3.4), xa = x0 + i * step - (i ? 0.8 : 0), xb = x0 + (i + 1) * step;
        d += (i ? ' L' : 'M') + xa.toFixed(1) + ' ' + y + ' L' + xb.toFixed(1) + ' ' + y;
      }
      root.appendChild(el('path', { d, fill: 'none', stroke: col, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '2.6 1.6' }));
      [[x0, W.mid - 3.4], [x1, W.mid + ((k - 1) % 2 ? 3.4 : -3.4)]].forEach(([x, y]) =>
        root.appendChild(el('circle', { cx: x, cy: y, r: 1.8, fill: 'none', stroke: col, 'stroke-width': 1.2 })));
      return;
    }
    (positions || [0.35, 0.65]).forEach((pos, i) => {
      const x = px(pos);
      if (kind === 'interrupted') {
        t(x, W.y0, x + 1.4, W.y1); knot(root, x, W.y0 - 1.5);
      } else if (kind === 'horizontal') {
        t(x - 5, W.y0, x - 5, W.y1); t(x + 5, W.y0, x + 5, W.y1);
        t(x - 5, W.y0, x + 5, W.y0); knot(root, x - 5, W.y0 - 1.5);
      } else if (kind === 'cross') {
        t(x - 6, W.y0, x + 6, W.y1); t(x + 6, W.y0, x - 6, W.y1); knot(root, x + 6, W.y0 - 1.5);
      } else if (kind === 'vertical') {
        t(x - 4, W.y0, x - 4, W.y1); t(x + 1.5, W.y0 + 6, x + 1.5, W.y1 - 6); knot(root, x - 4, W.y0 - 1.5);
      } else if (kind === 'interlock') {
        const x2 = i < positions.length - 1 ? px(positions[i + 1]) : Math.min(x + 16, W.x1);
        t(x, W.y0, x, W.y1);
        root.appendChild(el('path', {
          d: `M${x} ${W.y0} Q${(x + x2) / 2} ${W.mid} ${x2} ${W.y0}`,
          fill: 'none', stroke: col, 'stroke-width': 2.1, 'stroke-linecap': 'round'
        }));
        root.appendChild(el('ellipse', { cx: x, cy: W.y1 - 1, rx: 2.4, ry: 1.7, fill: '#fff', stroke: col, 'stroke-width': 1.4 }));
      } else if (kind === 'lembert') {
        arc(`M${x - 7} ${W.y0} Q${x} ${W.y0 + 6} ${x + 7} ${W.y0}`);
        knot(root, x, W.y0 - 1.4);
      } else if (kind === 'cushing') {
        t(x - 10, W.y0, x - 3, W.y0);
        t(x + 3, W.y0, x + 10, W.y0);
        t(x - 3, W.y0, x + 3, W.mid - 4);
        t(x + 3, W.mid - 4, x - 3, W.mid + 2);
        knot(root, x - 10, W.y0 - 1.4);
      } else if (kind === 'purse') {
        const cx = 50, cy = 37, r = 19;
        for (let k = 0; k < 10; k++) {
          const a0 = (k / 10) * Math.PI * 2 + .1, a1 = ((k + .55) / 10) * Math.PI * 2;
          arc(`M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`);
        }
        knot(root, cx, cy - r - 2);
      }
    });
  }

  function draw(svg, kind, opts) {
    if (typeof svg === 'string') svg = document.querySelector(svg);
    if (!svg) return;
    const o = opts || {};
    clear(svg);
    svg.setAttribute('viewBox', VB);
    svg.setAttribute('role', 'img');
    const root = el('g');
    if (kind === 'purse') {
      root.appendChild(el('rect', { x: 0, y: 0, width: 100, height: 70, fill: '#f8f4ee' }));
      root.appendChild(el('circle', { cx: 50, cy: 37, r: 30, fill: C.skin }));
      root.appendChild(el('circle', { cx: 50, cy: 37, r: 30, fill: 'none', stroke: '#c99a86', 'stroke-width': 1 }));
      root.appendChild(el('circle', { cx: 50, cy: 37, r: o.closed ? 3 : 10, fill: C.deep }));
      for (let k = 0; k < 12; k++) {
        const a0 = (k / 12) * Math.PI * 2 + .1, a1 = ((k + .62) / 12) * Math.PI * 2, r = 20;
        root.appendChild(el('path', {
          d: `M${50 + r * Math.cos(a0)} ${37 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${50 + r * Math.cos(a1)} ${37 + r * Math.sin(a1)}`,
          fill: 'none', stroke: C.thread, 'stroke-width': 2.1, 'stroke-linecap': 'round'
        }));
      }
      knot(root, 50, 37 - 20);
    } else {
      base(root, o.organ, o.slant);
      pattern(root, kind, o.positions || [0.32, 0.5, 0.68], o);
    }
    svg.appendChild(root);
  }

  /* little art for the matching game / cards: 52 x 40 */
  const SITE_ART = {
    skin: r => {
      r.appendChild(el('rect', { x: 1, y: 2, width: 50, height: 36, rx: 4, fill: '#f0d3c4' }));
      r.appendChild(el('path', { d: 'M8 20 L44 20', stroke: '#a2543f', 'stroke-width': 1.7 }));
      r.appendChild(el('path', { d: 'M16 14 L19 26 M26 14 L29 26 M36 14 L39 26', stroke: '#2f6fcf', 'stroke-width': 1.8 }));
    },
    tension: r => {
      r.appendChild(el('rect', { x: 1, y: 2, width: 50, height: 36, rx: 4, fill: '#f0d3c4' }));
      r.appendChild(el('path', { d: 'M8 20 L44 20', stroke: '#a2543f', 'stroke-width': 1.7 }));
      r.appendChild(el('path', { d: 'M12 12 Q20 20 28 12 M12 28 Q20 20 28 28', fill: 'none', stroke: '#2f6fcf', 'stroke-width': 1.9 }));
      r.appendChild(el('path', { d: 'M32 12 Q38 20 44 12', fill: 'none', stroke: '#2f6fcf', 'stroke-width': 1.9 }));
    },
    oblique: r => {
      r.appendChild(el('rect', { x: 1, y: 2, width: 50, height: 36, rx: 4, fill: '#f0d3c4' }));
      r.appendChild(el('path', { d: 'M10 30 L42 10', stroke: '#a2543f', 'stroke-width': 1.8 }));
      r.appendChild(el('path', { d: 'M16 30 L28 12 M34 28 L22 12', stroke: '#2f6fcf', 'stroke-width': 1.9 }));
    },
    gaping: r => {
      r.appendChild(el('rect', { x: 1, y: 2, width: 50, height: 36, rx: 4, fill: '#f0d3c4' }));
      r.appendChild(el('path', { d: 'M20 6 L20 34 M33 6 L33 34', stroke: '#a2543f', 'stroke-width': 1.5 }));
      r.appendChild(el('path', { d: 'M21 12 L32 12 M21 20 L32 20 M21 28 L32 28', stroke: '#2f6fcf', 'stroke-width': 2 }));
    },
    fascia: r => {
      r.appendChild(el('rect', { x: 1, y: 2, width: 50, height: 36, rx: 4, fill: '#efdcc8' }));
      r.appendChild(el('path', { d: 'M8 20 L44 20', stroke: '#a2543f', 'stroke-width': 1.6 }));
      r.appendChild(el('path', { d: 'M12 12 L12 28 M20 12 L20 28 M28 12 L28 28 M36 12 L36 28', stroke: '#2f6fcf', 'stroke-width': 1.9 }));
      r.appendChild(el('circle', { cx: 12, cy: 28, r: 2.2, fill: '#fff', stroke: '#2f6fcf', 'stroke-width': 1.4 }));
    },
    bowel: r => {
      r.appendChild(el('rect', { x: 1, y: 8, width: 50, height: 24, rx: 11, fill: '#d98b93' }));
      r.appendChild(el('path', { d: 'M8 20 L44 20', stroke: '#7d2f39', 'stroke-width': 1.5 }));
      r.appendChild(el('path', { d: 'M14 13 Q20 18 26 13 M30 13 Q36 18 42 13', fill: 'none', stroke: '#2f6fcf', 'stroke-width': 1.9 }));
    },
    stomach: r => {
      r.appendChild(el('path', { d: 'M7 10 Q26 2 45 12 Q41 34 24 32 Q7 30 7 10 Z', fill: '#d98b93' }));
      r.appendChild(el('path', { d: 'M10 18 L42 22', stroke: '#7d2f39', 'stroke-width': 1.5 }));
      r.appendChild(el('path', { d: 'M14 14 L22 16 M16 26 L28 28', stroke: '#2f6fcf', 'stroke-width': 1.9 }));
    },
    round: r => {
      r.appendChild(el('circle', { cx: 26, cy: 20, r: 16, fill: '#f0d3c4' }));
      r.appendChild(el('circle', { cx: 26, cy: 20, r: 5, fill: '#8d4a3c' }));
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        r.appendChild(el('line', {
          x1: 26 + 6.5 * Math.cos(a), y1: 20 + 6.5 * Math.sin(a),
          x2: 26 + 11 * Math.cos(a + .45), y2: 20 + 11 * Math.sin(a + .45),
          stroke: '#2f6fcf', 'stroke-width': 1.7, 'stroke-linecap': 'round'
        }));
      }
    }
  };
  function siteArt(svg, art) {
    if (typeof svg === 'string') svg = document.querySelector(svg);
    if (!svg) return;
    clear(svg);
    svg.setAttribute('viewBox', '0 0 52 40');
    const g = el('g');
    (SITE_ART[art] || SITE_ART.skin)(g);
    svg.appendChild(g);
  }

  return { draw, pattern, siteArt, base: (r, organ, slant) => base(r, organ, slant), el, clear, VB, px, W };
})();
