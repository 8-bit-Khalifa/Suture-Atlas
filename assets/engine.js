/* Suture Atlas — 3D technique engine.
   Tissue is a real cross-section (layers extruded along the wound) or a ring for
   purse-string. Every needle pass is a circular arc through two surface points, so
   one timeline model covers interrupted, mattress, continuous, inverting and round
   patterns. Units are millimetres. */
window.SutureLab = (function () {
  'use strict';
  const PI = Math.PI;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  /* A bite is not one slide along the arc. The surgeon drives the needle in and it
     settles; the hand comes off, catches the far end, and the needle is then drawn
     out along its curve in a second movement. Most bites are written as two steps,
     so the push settles at the end of the first and the draw starts after a short
     beat. A bite written as a single step gets both movements inside it. */
  const passProg = (f0, f1, l) => {
    const span = f1 - f0;
    if (Math.abs(span) < 0.02) return f1;
    if (span >= 0.8) {
      const hit = clamp((0.62 - f0) / span, 0.1, 0.9);
      if (l <= hit - 0.05) return f0 + span * 0.62 * ss(l / (hit - 0.05));
      if (l <= hit + 0.05) return f0 + span * 0.62;
      return f0 + span * 0.62 + (f1 - f0 - span * 0.62) * ss((l - hit - 0.05) / (0.95 - hit));
    }
    /* A step that carries on from the one before it. A short settle at the top of a
       bite reads as the hand coming back onto the needle; a pause late in the bite,
       where the needle is already being drawn out, only reads as a stutter. So the
       first continuation of a bite gets a brief beat and later ones none. */
    const hold = f0 > 0.05 && f0 < 0.5 ? 0.06 : 0;
    const e = l < hold ? 0 : ss((l - hold) / (1 - hold));
    return f0 + span * e;
  };

  function mount(host, opts) {
    opts = opts || {};
    const T3 = window.THREE;
    if (!T3) {
      host.innerHTML = '<div class="nogl">3D graphics could not load. Check your connection, or use the written steps and illustrations on this page.</div>';
      return null;
    }
    const V3 = T3.Vector3;

    let renderer;
    try {
      renderer = new T3.WebGLRenderer({ antialias: true });
    } catch (e) {
      host.innerHTML = '<div class="nogl">This browser could not start 3D graphics. Try another browser or enable hardware acceleration.</div>';
      return null;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.localClippingEnabled = true;
    host.insertBefore(renderer.domElement, host.firstChild);

    const scene = new T3.Scene();
    scene.background = new T3.Color(0x0b1514);
    const camera = new T3.PerspectiveCamera(34, 1.6, 0.1, 900);
    renderer.toneMapping = T3.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    scene.add(new T3.HemisphereLight(0xf2ece2, 0x2a2420, 0.5));
    const key = new T3.DirectionalLight(0xfff1de, 0.62); key.position.set(24, 40, 26); scene.add(key);
    const rim = new T3.DirectionalLight(0xb9cbe0, 0.26); rim.position.set(-28, 14, -22); scene.add(rim);

    const clipPlane = new T3.Plane(new V3(0, 0, -1), 0.02);
    const tissueG = new T3.Group(); scene.add(tissueG);
    const threadMat = new T3.MeshStandardMaterial({ color: 0x2f6df6, roughness: .45, metalness: .05, emissive: 0x0a2a7a, emissiveIntensity: .5 });
    /* Low metalness with a little emissive: without an environment map a metallic
       needle renders almost black, and a surgical needle has to read as bright steel. */
    const steel = new T3.MeshStandardMaterial({ color: 0xeef3f8, metalness: .18, roughness: .3, emissive: 0x2b3a4a, emissiveIntensity: .55, side: T3.DoubleSide });
    const darkSteel = new T3.MeshStandardMaterial({ color: 0x9aa4af, metalness: .12, roughness: .45, emissive: 0x1b242c, emissiveIntensity: .5 });
    const edgeMat = new T3.LineBasicMaterial({ color: 0x1a0c0c, transparent: true, opacity: .34, clippingPlanes: [clipPlane] });
    const ghostMat = threadMat.clone();
    ghostMat.clippingPlanes = [clipPlane];
    const thread = new T3.Mesh(new T3.BufferGeometry(), threadMat);
    thread.renderOrder = 14; scene.add(thread);
    const ghostG = new T3.Group(); scene.add(ghostG);
    const arrowG = new T3.Group(); scene.add(arrowG);

    /* ---------- state ---------- */
    const S = { t: 0, playing: true, speed: 1, auto: true, clip: false, view: '3d', rows: false, lock: -1, seeThrough: true };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) S.playing = false;

    let tech = null, tissue = null, steps = [], total = 0, arcs = [], meshes = [], cur = null;
    let K = new V3(), tailStart = new V3(), tailEnd = new V3();
    let needleG = null, needleInner = null, needleTorus = null, needleTip = null;
    let lastArc = null, needleInside = false, wantView = '', wantAt = 0;
    let holdArc = null, holdProg = 0;
    let lastKey = '', lastP = -1, curStep = -1, knots = null, lockRings = [], endPts = null;

    /* ---------- surface ---------- */
    function yAt(u, d, p) {
      const atten = Math.exp(-Math.max(0, d) * tissue.falloff);
      return -d + tissue.lift(u, p) * atten;
    }
    function surf(side, u, d, z) {
      if (side === 'C') return ringPoint(u, d, z);
      const x = cur.edge + u;
      return new V3(side === 'L' ? -x : x, yAt(u, d, cur.p), z || 0);
    }
    function ringPoint(deg, d, z) {
      const a = deg * PI / 180, r = Math.max(cur.r0 + 2.6 + d, 0.4);
      return new V3(r * Math.cos(a), 0.12 - (d || 0) * 0.5, r * Math.sin(a));
    }

    /* ---------- tissue meshes ---------- */
    function disposeMeshes() {
      meshes.forEach(m => {
        if (m.out) { tissueG.remove(m.out); if (m.out.geometry) m.out.geometry.dispose(); }
        const parts = m.round ? [m.m, m.ring] : [m.m, m.cap];
        parts.forEach(o => {
          if (!o) return;
          tissueG.remove(o);
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
      });
      meshes = [];
      while (tissueG.children.length) tissueG.remove(tissueG.children[0]);
    }
    function makeMeshes() {
      disposeMeshes();
      if (tissue.type === 'linear') {
        ['L', 'R'].forEach(side => {
          let d0 = 0;
          tissue.layers.forEach((L, li) => {
            const d1 = d0 + L.t;
            const mat = new T3.MeshStandardMaterial({
              color: L.c, roughness: .96, metalness: 0, side: T3.DoubleSide,
              clippingPlanes: [clipPlane]
            });
            const capMat = new T3.MeshStandardMaterial({
              color: new T3.Color(L.c).lerp(new T3.Color(0xffffff), 0.16), roughness: .95,
              side: T3.DoubleSide, clippingPlanes: [clipPlane]
            });
            const m = new T3.Mesh(new T3.BufferGeometry(), mat);
            const cap = new T3.Mesh(new T3.BufferGeometry(), capMat);
            cap.visible = false;
            const out = new T3.LineSegments(new T3.BufferGeometry(), edgeMat);
            tissueG.add(m, cap, out);
            meshes.push({ side, li, d0, d1, m, cap, out });
            d0 = d1;
          });
        });
      } else {
        const mat = new T3.MeshStandardMaterial({ color: tissue.layers[1].c, roughness: .95, metalness: 0, side: T3.DoubleSide });
        const top = new T3.MeshStandardMaterial({ color: tissue.layers[0].c, roughness: .95, metalness: 0, side: T3.DoubleSide });
        const m = new T3.Mesh(new T3.BufferGeometry(), mat);
        const ring = new T3.Mesh(new T3.BufferGeometry(), top);
        tissueG.add(m, ring);
        meshes.push({ round: true, m, ring });
      }
    }
    function extrude(poly, hz) {
      const n = poly.length, pos = [], idx = [];
      poly.forEach(q => pos.push(q[0], q[1], -hz));
      poly.forEach(q => pos.push(q[0], q[1], hz));
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        idx.push(i, j, n + j, i, n + j, n + i);
      }
      const tri = T3.ShapeUtils.triangulateShape(poly.map(q => new T3.Vector2(q[0], q[1])), []);
      tri.forEach(t => { idx.push(t[0], t[1], t[2], n + t[0], n + t[1], n + t[2]); });
      const g = new T3.BufferGeometry();
      g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const ng = g.toNonIndexed();
      ng.computeVertexNormals();
      g.dispose();
      return ng;
    }
    function capGeo(poly) {
      const pos = [];
      poly.forEach(q => pos.push(q[0], q[1], 0.005));
      const tri = T3.ShapeUtils.triangulateShape(poly.map(q => new T3.Vector2(q[0], q[1])), []);
      const idx = [];
      tri.forEach(t => idx.push(t[0], t[1], t[2]));
      const g = new T3.BufferGeometry();
      g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    function updateMeshes() {
      const hz = tissue.hz;
      if (tissue.type === 'linear') {
        const N = 48;
        const notch = tissue.notch;
        meshes.forEach(m => {
          const poly = [];
          const sg = m.side === 'L' ? -1 : 1;
          /* The wound wall leans in with depth and meets its twin below `notch`, so
             the cut reads as a V rather than a slot and the layers stack up the
             slanted face. `uIn(d)` is that wall's distance from the edge at depth d. */
          const uIn = d => -cur.edge * Math.min(1, d / notch);
          const pt = (u, d) => [sg * (cur.edge + u), yAt(u, d, cur.p)];
          const a = uIn(m.d0), b = uIn(m.d1);
          for (let i = 0; i <= N; i++) poly.push(pt(lerp(a, tissue.span, i / N), m.d0));
          for (let i = N; i >= 0; i--) poly.push(pt(lerp(b, tissue.span, i / N), m.d1));
          m.m.geometry.dispose(); m.m.geometry = extrude(poly, hz);
          m.cap.geometry.dispose(); m.cap.geometry = capGeo(poly);
          m.cap.visible = S.clip;
          if (m.out) { m.out.geometry.dispose(); m.out.geometry = new T3.EdgesGeometry(m.m.geometry, 26); }
        });
      } else {
        const r0 = cur.r0, r1 = tissue.r1, T = tissue.T, lift = 0.95 * cur.p;
        const prof = [
          new T3.Vector2(r0, lift),
          new T3.Vector2(lerp(r0, r1, .45), lift * .35),
          new T3.Vector2(r1, 0),
          new T3.Vector2(r1, -T),
          new T3.Vector2(r0, -T)
        ];
        const g = new T3.LatheGeometry(prof, 64);
        meshes[0].m.geometry.dispose(); meshes[0].m.geometry = g;
        const p2 = [
          new T3.Vector2(r0, lift),
          new T3.Vector2(lerp(r0, r1, .45), lift * .35),
          new T3.Vector2(r1, .02),
          new T3.Vector2(r1, -.34),
          new T3.Vector2(r0, -.34)
        ];
        const g2 = new T3.LatheGeometry(p2, 64);
        meshes[0].ring.geometry.dispose(); meshes[0].ring.geometry = g2;
      }
    }

    /* ---------- needle arcs ---------- */
    function makeArc(a, b, sag, side) {
      const out = { a: a.clone(), b: b.clone(), pts: [], delta: 0, r: 1, c: new V3(), e1: new V3(1, 0, 0), e2: new V3(0, 1, 0) };
      const chord = new V3().subVectors(b, a);
      const len = chord.length();
      if (len < 1e-3) {
        out.pts = [a.clone(), b.clone()];
        out.len = 0;
        return out;
      }
      const u = chord.clone().divideScalar(len);
      let perp = new V3(0, -1, 0).addScaledVector(u, u.y);
      if (perp.length() < 0.25) {
        const inw = new V3((a.x + b.x) <= 0 ? -1 : 1, 0, 0);
        perp = inw.addScaledVector(u, -inw.dot(u));
        if (perp.length() < 0.02) perp.set(0, 0, 1);
      }
      perp.normalize();
      const s = Math.max(0.06, sag || 0.6);
      const half = len / 2;
      const r = clamp((half * half + s * s) / (2 * s), half * 1.001, 400);
      const mid = new V3().addVectors(a, b).multiplyScalar(.5);
      const c = mid.clone().addScaledVector(perp, s - r);
      const e1 = new V3().subVectors(a, c).normalize();
      const nrm = new V3().crossVectors(chord, perp).normalize();
      const e2 = new V3().crossVectors(nrm, e1).normalize();
      const vb = new V3().subVectors(b, c);
      let delta = Math.atan2(vb.dot(e2), vb.dot(e1));
      if (Math.abs(delta) < 1e-3) delta = 0.001;
      const count = Math.max(8, Math.ceil(Math.abs(delta) * r / 0.45));
      const pts = [];
      for (let i = 0; i <= count; i++) {
        const th = delta * i / count;
        pts.push(c.clone()
          .addScaledVector(e1, r * Math.cos(th))
          .addScaledVector(e2, r * Math.sin(th)));
      }
      out.pts = pts; out.delta = delta; out.r = r; out.c = c; out.e1 = e1; out.e2 = e2; out.nrm = nrm;
      out.len = Math.abs(delta) * r;
      return out;
    }

    function buildGeometry(p) {
      cur = { p };
      if (tissue.type === 'linear') {
        cur.edge = tissue.edge(p);
      } else {
        cur.edge = 0;
        cur.r0 = lerp(tissue.r0, 1.1, p);
      }
      // passes
      arcs = tech.passes.map((ps, i) => {
        let A, B;
        if (tissue.type === 'round') {
          const span = 360 / tech.ring.bites;
          const a0 = 14 + i * span, a1 = a0 + tech.ring.arc;
          A = surf('C', a0, 0, 0); B = surf('C', a1, 0, 0);
        } else {
          A = surf(ps.side, ps.a[0], ps.a[1], ps.a[2]);
          const s2 = ps.toR ? 'R' : ps.toL ? 'L' : ps.side;
          B = surf(s2, ps.b[0], ps.b[1], ps.b[2]);
        }
        return makeArc(A, B, ps.sag, ps.side);
      });
      // knot + tails
      if (tissue.type === 'linear') {
        K = surf(tech.knot[0], tech.knot[1], tech.knot[2], tech.knot[3]);
        const first = tech.passes[0], last = tech.passes[tech.passes.length - 1];
        const endSide = last.toL ? 'L' : last.toR ? 'R' : last.side;
        tailStart = surf(first.side, tech.tailU, -0.8, first.a[2]);
        tailEnd = surf(endSide, tech.endU, -0.8, last.b[2]);
      } else {
        const last = 14 + (tech.ring.bites - 1) * (360 / tech.ring.bites) + tech.ring.arc;
        tailStart = surf('C', 14 - 16, -1.4, 0);
        tailEnd = surf('C', last + 12, -1.4, 0);
        K = tailStart.clone().add(tailEnd).multiplyScalar(0.5);
        K.y = 0.5;
      }
      updateMeshes();
    }

    /* ---------- knots ---------- */
    const ringGeo = new T3.TorusGeometry(0.26, 0.085, 6, 18);
    function buildKnots() {
      if (knots) { scene.remove(knots); knots.children.slice().forEach(c => knots.remove(c)); }
      knots = new T3.Group(); scene.add(knots);
      const rings = [], stubs = [];
      for (let i = 0; i < 3; i++) {
        const m = new T3.Mesh(ringGeo, threadMat);
        m.rotation.x = PI / 2; m.renderOrder = 14;
        knots.add(m); rings.push(m);
      }
      const stubGeo = new T3.CylinderGeometry(0.1, 0.1, 1, 7).rotateX(PI / 2);
      for (let i = 0; i < 2; i++) {
        const m = new T3.Mesh(stubGeo, threadMat);
        m.renderOrder = 14;
        knots.add(m); stubs.push(m);
      }
      knots.userData = { rings, stubs, K: K.clone(), round: tissue.type === 'round' };
      lockRings.forEach(r => { scene.remove(r); r.geometry.dispose(); });
      const lg = new T3.TorusGeometry(0.55, 0.09, 6, 16);
      lockRings = (tech.locks || []).map(z => {
        const m = new T3.Mesh(lg, threadMat);
        m.rotation.x = PI / 2; m.renderOrder = 14;
        m.position.set(0, 0.15, z);
        scene.add(m);
        return m;
      });
    }
    function placeKnots(st) {
      if (!knots) return;
      const { rings, stubs } = knots.userData;
      const on = st.q > 0.98;
      const kx = K.x, ky = K.y, kz = K.z;
      rings.forEach((r, i) => {
        const a = ss((i) / 1.2, 0, 1);
        const grow = clamp((st.k - i) / 0.9, 0, 1);
        r.visible = on && grow > 0.02;
        r.scale.setScalar(Math.max(grow, .001) * 1.4);
        r.position.set(kx + (i - 1) * 0.24, ky + 0.04, kz);
        r.rotation.set(PI / 2, 0, (i % 2 ? 1 : -1) * 0.4 * grow);
      });
      const len = 5 - 3.4 * ss(st.c);
      stubs.forEach((s, i) => {
        const sg = i ? 1 : -1;
        s.visible = on && st.k > 0.1;
        s.scale.set(1, 1, Math.max(len, .01));
        s.position.set(kx + (i ? .14 : -.14), ky + .1, kz + sg * len / 2);
      });
    }
    function placeLocks(prog) {
      lockRings.forEach((r, i) => {
        const z = tech.locks[i];
        const sg = tech.lockSide === 'L' ? -1 : 1;
        r.position.set(sg * (cur.edge + 6), 0.18, z);
        r.visible = (prog[i] || 0) > 0.98;
      });
    }


    /* ---------- thread assembly ---------- */
    function appendArc(out, arc, prog) {
      const n = Math.max(2, Math.ceil(arc.pts.length * clamp(prog, 0, 1)));
      for (let i = 1; i < n; i++) out.push(arc.pts[i].clone());
      if (prog >= 0.999) out.push(arc.b.clone());
    }
    function connector(out, a, b, idx) {
      const dist = a.distanceTo(b);
      if (dist < 0.07) return;
      if (tissue.type === 'round') {
        const span = 360 / tech.ring.bites;
        const a0 = 14 + (idx - 1) * span + tech.ring.arc;
        const a1 = 14 + idx * span;
        for (let i = 1; i <= 6; i++) {
          out.push(surf('C', lerp(a0, a1, i / 6), 0, 0));
        }
        return;
      }
      const lift = Math.min(3.2, 0.3 * dist + 0.85);
      const mid = new V3().addVectors(a, b).multiplyScalar(.5);
      mid.y += lift;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, it = 1 - t;
        out.push(new V3(
          it * it * a.x + 2 * it * t * mid.x + t * t * b.x,
          it * it * a.y + 2 * it * t * mid.y + t * t * b.y,
          it * it * a.z + 2 * it * t * mid.z + t * t * b.z
        ));
      }
    }
    function dedupe(pts) {
      const out = [];
      pts.forEach(v => { if (!out.length || out[out.length - 1].distanceTo(v) > 0.03) out.push(v); });
      return out;
    }
    function threadPoints(st, prog) {
      const out = [];
      let a0 = tailStart.clone(), a1 = tailEnd.clone();
      if (st.q > 0) { a0.lerp(K, clamp(st.q * 1.6, 0, 1)); a1.lerp(K, clamp(st.q * 1.6, 0, 1)); }
      out.push(a0);
      if (!arcs.length) return out;
      out.push(arcs[0].a.clone());
      for (let i = 0; i < arcs.length; i++) {
        const pr = prog[i] || 0;
        if (pr > 0) appendArc(out, arcs[i], pr);
        if (pr < 0.999) break;
        if (i + 1 < arcs.length) {
          connector(out, arcs[i].b, arcs[i + 1].a, i + 1);
          out.push(arcs[i + 1].a.clone());
        } else {
          out.push(a1);
        }
      }
      return dedupe(out);
    }
    function setThread(pts) {
      if (pts.length < 2) { thread.visible = false; return; }
      thread.visible = true;
      const curve = new T3.CatmullRomCurve3(pts, false, 'centripetal');
      const len = curve.getLength();
      const seg = Math.min(560, Math.max(24, Math.round(len * 6)));
      const geo = new T3.TubeGeometry(curve, seg, 0.15, 8, false);
      thread.geometry.dispose();
      thread.geometry = geo;
      return curve;
    }

    /* ---------- needle ---------- */
    /* The diameter along a real needle, from the swage (t = 0) to the point (t = 1):
       a narrow swage, a short swell to full diameter, then a long taper down to a
       point. Building it this way keeps the back end slim, so the sharp point is
       unmistakably the end that leads through the tissue. */
    function needleProfile(t) {
      if (t < 0.26) return 0.6 + 0.4 * Math.min(1, t / 0.18);
      const u = (t - 0.26) / 0.74;
      return 1 - 0.95 * Math.pow(u, 0.85);
    }
    function needleGeo(r, sweep, rmax) {
      const segs = Math.max(14, Math.round(sweep * 20));
      const radial = 8, pos = [], idx = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, a = sweep * t;
        const rad = Math.max(rmax * needleProfile(t), 0.006);
        const cx = r * Math.cos(a), cy = r * Math.sin(a);
        for (let j = 0; j < radial; j++) {
          const th = j / radial * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
          pos.push(cx + rad * ct * Math.cos(a), cy + rad * ct * Math.sin(a), rad * st);
        }
      }
      for (let i = 0; i < segs; i++) {
        for (let j = 0; j < radial; j++) {
          const j2 = (j + 1) % radial;
          const a0 = i * radial + j, a1 = i * radial + j2;
          const b0 = (i + 1) * radial + j, b1 = (i + 1) * radial + j2;
          idx.push(a0, b0, a1, a1, b0, b1);
        }
      }
      const g = new T3.BufferGeometry();
      g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    let needleKey = '';
    function ensureNeedle() {
      if (needleG) return;
      needleG = new T3.Group();
      needleInner = new T3.Group();
      needleTorus = new T3.Mesh(new T3.BufferGeometry(), steel);
      needleTip = new T3.Mesh(new T3.SphereGeometry(0.024, 8, 6), steel);
      [needleTorus, needleTip].forEach(o => { o.renderOrder = 14; });
      needleInner.add(needleTorus);
      needleG.add(needleInner);
      needleG.add(needleTip);
      scene.add(needleG);
    }
    /* A needle holder: two jaws round the swage, a box joint, two shanks and the
       finger rings. Built once in world space so it can be kept clear of the tissue
       instead of being dragged through the skin with the needle. */
    let holderG = null, holderVis = 0, holderT = 0;
    function makeHolder() {
      const g = new T3.Group();
      const jawMetal = new T3.MeshStandardMaterial({ color: 0xd2dbe4, metalness: .2, roughness: .32, emissive: 0x1d2833, emissiveIntensity: .5 });
      const bodyMetal = new T3.MeshStandardMaterial({ color: 0x929ca8, metalness: .16, roughness: .42, emissive: 0x151d25, emissiveIntensity: .45 });
      const jawGeo = new T3.BoxGeometry(0.52, 3.1, 0.8);
      jawGeo.translate(0, 1.85, 0);
      [-1, 1].forEach(s => {
        const j = new T3.Mesh(jawGeo, jawMetal);
        j.position.set(s * 0.36, 0, 0);
        j.rotation.z = s * 0.05;
        j.renderOrder = 14; g.add(j);
      });
      const pivot = new T3.Mesh(new T3.CylinderGeometry(0.5, 0.5, 1.6, 12), bodyMetal);
      pivot.rotation.x = PI / 2; pivot.position.set(0, 3.6, 0); pivot.renderOrder = 14; g.add(pivot);
      const shankGeo = new T3.BoxGeometry(0.86, 13.4, 0.82);
      shankGeo.translate(0, 6.7, 0);
      [-1, 1].forEach(s => {
        const sh = new T3.Mesh(shankGeo, bodyMetal);
        sh.position.set(s * 0.46, 4.0, 0);
        sh.rotation.z = -s * 0.052;
        sh.renderOrder = 14; g.add(sh);
      });
      const ringGeo = new T3.TorusGeometry(1.95, 0.4, 8, 22);
      [-1, 1].forEach(s => {
        const rg = new T3.Mesh(ringGeo, bodyMetal);
        rg.position.set(s * 1.34, 19.2, 0);
        rg.renderOrder = 14; g.add(rg);
      });
      g.visible = false;
      scene.add(g);
      return g;
    }
    /* Is this point inside the open wound, i.e. reachable from above without
       crossing intact skin? */
    function inSlot(pt) {
      if (!cur || tissue.type === 'round') return false;
      if (Math.abs(pt.z) > tissue.hz - 1) return false;
      if (Math.abs(pt.x) > cur.edge + 1.4) return false;
      const top = yAt(Math.max(0, Math.abs(pt.x) - cur.edge), 0, cur.p);
      return pt.y < top - 0.15 && pt.y > -tissue.T + 0.3;
    }
    /* Two grips, as a surgeon works. The jaws drive the needle in by its swage while
       that end is still outside the skin. When the swage goes under, the holder lets
       go and reaches down into the open wound to catch the part that has come
       through, then pulls the rest of the needle out along its curve. It is never
       dragged through intact tissue, and it fades in and out instead of popping. */
    function placeHolder(arc, prog, vis, force) {
      if (!holderG) holderG = makeHolder();
      /* Work along the sampled arc itself: that is exactly the curve the needle
         occupies between its back end and its point. */
      const P = arc.pts, n = P.length - 1;
      const f = Math.max(0, Math.min(1, prog));
      const tipIdx = Math.round(f * n);
      const spanFrac = Math.min(1.85 / Math.max(0.001, Math.abs(arc.delta)), 1);
      const swageIdx = Math.max(0, Math.round((f - spanFrac) * n));
      const at = i => P[Math.max(0, Math.min(n, i))];
      const swage = at(swageIdx).clone();

      let grip = null, dir = null;
      if (swage.y > -0.15) {
        /* drive it in by the back end, from outside the skin */
        grip = swage;
        dir = new V3().subVectors(swage, at(swageIdx + 2));
        if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0); else dir.normalize();
        /* lean it away from the wound so the rings stay in frame */
        dir.x += swage.x < 0 ? -0.28 : 0.28;
        if (dir.y < 0.5) dir.y = 0.5;
        dir.normalize();
      } else if (inSlot(swage)) {
        /* the back end has come through into the open wound: reach in and take it */
        grip = swage;
        dir = new V3(swage.x < 0 ? -0.55 : 0.55, 1, 0).normalize();
      } else {
        /* buried in the tissue - hold whatever part has come through, if any */
        const mid = Math.round((tipIdx + swageIdx) / 2);
        for (let i = tipIdx; i >= mid; i--) {
          const p = at(i);
          if (inSlot(p)) {
            grip = p.clone();
            dir = new V3(p.x < 0 ? -0.55 : 0.55, 1, 0).normalize();
            break;
          }
        }
      }

      /* a hand that has not let go keeps its grip even when the swage is out of
         reach of the wound slot, e.g. while the needle is being turned over */
      if (!grip && force) {
        grip = swage.clone();
        dir = new V3().subVectors(swage, at(swageIdx + 2));
        if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0); else dir.normalize();
        dir.x += swage.x < 0 ? -0.28 : 0.28;
        if (dir.y < 0.5) dir.y = 0.5;
        dir.normalize();
      }
      const on = vis > 0.5 && !!grip;
      const nowMs = performance.now();
      const dt = holderT ? Math.min(0.12, (nowMs - holderT) / 1000) : 0.016;
      holderT = nowMs;
      holderVis += ((on ? 1 : 0) - holderVis) * Math.min(1, dt * 10);
      holderG.visible = holderVis > 0.02;
      if (!holderG.visible) return;
      if (grip) {
        holderG.position.copy(grip);
        holderG.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
      }
      /* the purse-string works on a 27 mm ring, so the holder is scaled down to keep
         the instrument out of proportion with the opening it is closing */
      const base = tissue.type === 'round' ? (S.view === 'section' ? 0.3 : 0.36) : (S.view === 'section' ? 0.48 : 0.62);
      holderG.scale.setScalar(base * Math.max(0.2, vis) * holderVis);
    }
    /* A needle pose: the circle the needle lies on (centre, radius, basis), where its
       back end sits on that circle, and how much of the circle the needle covers.
       Everything that draws the needle is described this way, which is what lets two
       poses be blended - that is how the needle is turned over between two bites
       instead of snapping at the boundary. */
    function needlePose(arc, prog) {
      const delta = arc.delta;
      const sweep = Math.min(1.85, Math.abs(delta));
      /* `phi` is the angle of the back (swage) end; the point sits at phi + sweep,
         which is exactly where the tip has always been drawn: delta * prog. */
      const phi = delta * prog - sweep;
      const q = new T3.Quaternion().setFromRotationMatrix(
        new T3.Matrix4().makeBasis(arc.e1, arc.e2, arc.nrm));
      return { c: arc.c.clone(), q, phi, r: arc.r, sweep };
    }
    /* Plane turns by slerp, centre by a straight lerp, and the needle travels the
       short way round its own circle. */
    function mixPose(A, B, t) {
      let d = B.phi - A.phi;
      while (d > PI) d -= 2 * PI;
      while (d < -PI) d += 2 * PI;
      return {
        c: A.c.clone().lerp(B.c, t),
        q: A.q.clone().slerp(B.q, t),
        phi: A.phi + d * t,
        r: A.r, sweep: A.sweep
      };
    }
    /* the needle's own curve in world space, back end first */
    function posePts(st, n) {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const a = st.phi + st.sweep * (i / n);
        out.push(new V3(st.r * Math.cos(a), st.r * Math.sin(a), 0).applyQuaternion(st.q).add(st.c));
      }
      return out;
    }
    function drawPose(st, vis) {
      ensureNeedle();
      needleG.visible = vis > 0.02;
      if (!needleG.visible) { if (holderG) holderG.visible = false; return false; }
      const r = st.r, sweep = st.sweep;
      const k = r.toFixed(2) + '|' + sweep.toFixed(2);
      if (k !== needleKey) {
        needleKey = k;
        needleTorus.geometry.dispose();
        needleTorus.geometry = needleGeo(r, sweep, 0.2);
      }
      needleG.position.copy(st.c);
      needleG.quaternion.copy(st.q);
      needleInner.rotation.z = st.phi;
      needleInner.scale.set(1, 1, 1);
      needleTip.position.set(r * Math.cos(st.phi + sweep), r * Math.sin(st.phi + sweep), 0);
      needleG.scale.setScalar(Math.max(0.02, vis));
      needleG.updateMatrixWorld(true);
      /* is any of the drawn part of the needle actually through the tissue? this
         drives the automatic camera below */
      const pAt = a => new V3(r * Math.cos(a), r * Math.sin(a), 0).applyQuaternion(st.q).add(st.c);
      const a0 = st.phi, a1 = st.phi + sweep;
      let inside = 0;
      for (let i = 0; i <= 7; i++) if (inTissue(pAt(a0 + (a1 - a0) * (i / 7)))) inside++;
      needleInside = sweep > 0.08 && inside >= 2;
      return true;
    }
    function placeNeedle(arc, prog, vis, rest) {
      lastArc = arc;
      if (!drawPose(needlePose(arc, prog), vis)) return;
      /* while the needle is only resting between passes no hand is on it */
      placeHolder(arc, prog, rest ? 0 : vis);
    }
    /* Between two bites the needle is carried across the wound and turned over, with
       the hand still on it, from the pose the last bite left it in to the pose the
       next bite starts from. */
    function turnNeedle(from, to, t, vis) {
      const st = mixPose(from, to, t);
      if (!drawPose(st, vis)) return;
      placeHolder({ pts: posePts(st, 14), delta: st.sweep, r: st.r }, 1, vis, true);
    }
    /* point-in-tissue test: above the lifted surface is out, the slab below it is in */
    function inTissue(pt) {
      if (!cur) return false;
      if (tissue.type === 'round') return pt.y < 0.15 && pt.y > -tissue.T - 0.4;
      if (Math.abs(pt.z) > tissue.hz) return false;
      if (Math.abs(pt.x) > cur.edge + tissue.span) return false;
      const u = Math.max(0, Math.abs(pt.x) - cur.edge);
      const top = yAt(u, 0, cur.p);
      return pt.y < top - 0.25 && pt.y > -tissue.T - 0.4;
    }

    /* ---------- camera ---------- */
    /* `el` is measured from straight up: small is a plan view, 90 is level with the
       wound. The section therefore sits at the horizon and the top view nearly
       overhead. */
    const PRE = {
      '3d': { az: 34, el: 56, d: 46 },
      section: { az: 0, el: 88, d: 29 },
      top: { az: 0, el: 10, d: 50 },
      knot: { az: 30, el: 56, d: 13 }
    };
    const cam = { az: 34, el: 56, d: 46, tx: 0, ty: -1, tz: 0 };
    const goal = { az: 34, el: 56, d: 46, tx: 0, ty: -1, tz: 0 };
    let view = '3d', tween = null;
    /* Close framing, as in the reference animation: the wound and the stitch fill
       the frame instead of sitting in the middle of a large slab. */
    function frameFor(name) {
      const P = PRE[name] || PRE['3d'];
      const g = { az: P.az, el: P.el, d: P.d };
      const R = tissue.type === 'round';
      if (name === 'knot') {
        g.tx = K.x; g.ty = K.y + 1.2; g.tz = K.z; g.d = R ? 26 : 20;
      } else if (name === 'section') {
        g.tx = 0; g.ty = -tissue.T * 0.5; g.tz = 0; g.d = R ? 51 : 38;
      } else if (name === 'top') {
        g.tx = 0; g.ty = -0.4; g.tz = 0; g.d = R ? 74 : 68;
      } else {
        g.tx = 0; g.ty = -tissue.T * 0.10; g.tz = 0; g.d = R ? 64 : 58;
      }
      return g;
    }
    function setView(name, fromUser, fast) {
      view = name; S.view = name;
      const g = frameFor(name);
      const moved = Math.abs(goal.az - g.az) > 0.01 || Math.abs(goal.el - g.el) > 0.01 ||
        Math.abs(goal.d - g.d) > 0.05 || Math.abs(goal.tx - g.tx) > 0.05 ||
        Math.abs(goal.ty - g.ty) > 0.05 || Math.abs(goal.tz - g.tz) > 0.05;
      goal.az = g.az; goal.el = g.el; goal.d = g.d; goal.tx = g.tx; goal.ty = g.ty; goal.tz = g.tz;
      S.clip = name === 'section';
      applyViewFlags();
      if (moved) glide(fromUser ? 70 : (fast ? 90 : 200), fromUser ? 800 : (fast ? 700 : 1250));
      if (fromUser) { S.auto = false; if (opts.onAuto) opts.onAuto(false); }
      if (opts.onView) opts.onView(name);
      hud(name);
    }
    /* Timed tween with an ease-in-out, so a change of plane reads as a camera move
       rather than a snap. Distance interpolates geometrically; azimuth takes the
       short way round. */
    function glide(delay, dur) {
      tween = {
        from: { az: cam.az, el: cam.el, d: cam.d, tx: cam.tx, ty: cam.ty, tz: cam.tz },
        to: { az: goal.az, el: goal.el, d: goal.d, tx: goal.tx, ty: goal.ty, tz: goal.tz },
        t0: performance.now() + delay, dur: dur
      };
    }
    function snapCam() {
      ['az', 'el', 'd', 'tx', 'ty', 'tz'].forEach(k => { cam[k] = goal[k]; });
      tween = null;
    }
    const HUD = {
      '3d': '3D view · wound and stitch', section: 'Cross-section · cut through the stitch',
      top: 'Top view · plan of the wound', knot: 'Close-up · knot and edges'
    };
    function hud(n) { const el = opts.hud; if (el) el.textContent = HUD[n] || ''; }
    /* The layers are drawn at partial opacity so the ones under the surface show
       through: the tissue reads as stacked strata instead of one solid block. */
    const TISSUE_OP = 0.64;
    function applyViewFlags() {
      const see = !!S.seeThrough;
      const op = see ? TISSUE_OP : 1;
      const tint = (mm, o) => {
        mm.transparent = o < 1;
        mm.opacity = o;
        mm.depthWrite = o >= 1;
        mm.needsUpdate = true;
      };
      meshes.forEach(m => {
        if (m.round) {
          tint(m.m.material, op);
          tint(m.ring.material, see ? 0.72 : 1);
          return;
        }
        m.cap.visible = S.clip;
        m.m.material.clippingPlanes = S.clip ? [clipPlane] : [];
        m.m.material.needsUpdate = true;
        tint(m.m.material, op);
        if (m.out) { m.out.material.opacity = see ? 0.42 : 0.3; m.out.material.needsUpdate = true; }
      });
    }
    function stepCam(now) {
      if (tween) {
        const e = clamp((now - tween.t0) / tween.dur, 0, 1);
        const s = e * e * (3 - 2 * e);
        const f = tween.from, t = tween.to;
        cam.az = f.az + (((t.az - f.az + 540) % 360) - 180) * s;
        cam.el = lerp(f.el, t.el, s);
        cam.d = f.d * Math.pow(Math.max(0.01, t.d) / Math.max(0.01, f.d), s);
        cam.tx = lerp(f.tx, t.tx, s);
        cam.ty = lerp(f.ty, t.ty, s);
        cam.tz = lerp(f.tz, t.tz, s);
        if (e >= 1) tween = null;
      }
      const az = cam.az * PI / 180, el = cam.el * PI / 180;
      const d = Math.max(4, cam.d);
      camera.position.set(
        cam.tx + Math.sin(el) * Math.sin(az) * d,
        cam.ty + Math.cos(el) * d,
        cam.tz + Math.sin(el) * Math.cos(az) * d
      );
      camera.lookAt(cam.tx, cam.ty, cam.tz);
    }
    let drag = null;
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { }
      host.classList.add('drag');
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      goal.az -= dx * .45; goal.el = clamp(goal.el - dy * .45, 2, 90);
      cam.az = goal.az; cam.el = goal.el;
      tween = null;
      S.auto = false; if (opts.onAuto) opts.onAuto(false);
    });
    const endDrag = () => { drag = null; host.classList.remove('drag'); };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      goal.d = clamp(goal.d * (1 + Math.sign(e.deltaY) * .08), 6, 240);
      cam.d = goal.d;
      tween = null;
    }, { passive: false });

    /* ---------- timeline ---------- */
    function compile() {
      steps = []; total = 0;
      let st = { p: 0, q: 0, k: 0, c: 0 }, done = 0;
      tech.steps.forEach((s, i) => {
        const o = {
          i, title: s.t, body: s.b, cam: s.cam || '3d', marks: s.marks || [],
          rows: !!s.rows, lock: s.lock == null ? -1 : s.lock,
          kind: s.pass != null ? 'pass' : 'cine', pi: s.pass == null ? -1 : s.pass,
          doneBefore: done,
          f0: s.f0 == null ? 0 : s.f0, f1: s.f1 == null ? 1 : s.f1
        };
        const from = Object.assign({}, st);
        let dur = s.dur;
        if (o.kind === 'pass') {
          const a = arcs[o.pi];
          if (!dur) dur = Math.max(1.2, ((a ? a.len : 9) * (o.f1 - o.f0)) / 12 + 0.55);
        } else if (!dur) dur = 3.2;
        if (s.cine) {
          for (const k in s.cine) {
            from[k] = s.cine[k][0];
            st[k] = s.cine[k][1];
          }
        }
        o.from = from; o.to = Object.assign({}, st);
        o.t0 = total; total += dur; o.t1 = total;
        /* only a step that reaches the end of the arc finishes that bite: a bite can be
           written as a push step and a separate draw step on the same arc */
        if (o.kind === 'pass' && o.f1 >= 0.999) done = o.pi + 1;
        steps.push(o);
      });
      /* The needle stays in view between passes - it is put down, regripped and
         picked up again, it does not vanish and reappear somewhere else. It goes
         away after the step that follows the last pass. */
      let first = -1, last = -1;
      steps.forEach((s, i) => { if (s.pi >= 0) { if (first < 0) first = i; last = i; } });
      steps.forEach((s, i) => {
        s.needleOn = first >= 0 && i >= first && i <= Math.min(steps.length - 1, last + 1);
        /* a beat between two bites where the hand is still on the needle */
        s.regrip = first >= 0 && s.pi < 0 && i > first && i < last;
      });
    }
    /* the nearest pass step before (dir -1) or after (dir 1) this one */
    function passStepNear(i, dir) {
      for (let k = i + dir; k >= 0 && k < steps.length; k += dir) if (steps[k].pi >= 0) return steps[k];
      return null;
    }
    function evalAt(t) {
      let i = steps.length - 1;
      for (let k = 0; k < steps.length; k++) { if (t < steps[k].t1) { i = k; break; } }
      const s = steps[i];
      const l = clamp((t - s.t0) / (s.t1 - s.t0 || 1), 0, 1);
      const e = s.kind === 'pass' ? l : ss(l);
      const st = {
        p: lerp(s.from.p, s.to.p, e), q: lerp(s.from.q, s.to.q, e),
        k: lerp(s.from.k, s.to.k, e), c: lerp(s.from.c, s.to.c, e)
      };
      const prog = [];
      for (let j = 0; j < arcs.length; j++) {
        if (j < s.doneBefore) prog[j] = 1;
        else if (s.kind === 'pass' && j === s.pi) prog[j] = passProg(s.f0, s.f1, l);
        else prog[j] = 0;
      }
      return { i, l, s, st, prog };
    }

    /* ---------- annotations ---------- */
    const annLayer = opts.annLayer;
    let anns = [], annSvg = null, annHost = null;
    if (annLayer) {
      annSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      annHost = document.createElement('div');
      annLayer.appendChild(annSvg);
      annLayer.appendChild(annHost);
    }
    function markPoint(at) {
      if (Array.isArray(at)) return surf(at[0], at[1], at[2], at[3]);
      if (at === 'knot') return K.clone();
      if (at === 'wound') {
        if (tissue.type === 'round') return new V3(0, 0.6, -cur.r0 * 0.2);
        return new V3(0, 0.3, 0);
      }
      if (at === 'cross') {
        const a = arcs[0].b, b = arcs[1] ? arcs[1].a : a;
        return new V3(0, 0.6, (a.z + b.z) / 2);
      }
      return new V3();
    }
    function buildAnns(list) {
      if (!annLayer) return;
      annHost.innerHTML = ''; annSvg.innerHTML = ''; anns = [];
      list.forEach(a => {
        const el = document.createElement('div');
        el.className = 'ann';
        el.textContent = a.label;
        annHost.appendChild(el);
        const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const ci = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ci.setAttribute('r', 3.5);
        annSvg.append(ln, ci);
        anns.push({ a, el, ln, ci, dx: a.dx == null ? 16 : a.dx, dy: a.dy == null ? -30 : a.dy });
      });
    }
    function updateAnns(show) {
      if (!annLayer || !anns.length) return;
      const W = host.clientWidth, H = host.clientHeight;
      anns.forEach(n => {
        const v = markPoint(n.a.at).project(camera);
        if (!isFinite(v.x)) return;
        const x = (v.x * .5 + .5) * W, y = (-v.y * .5 + .5) * H;
        const lw = n.el.offsetWidth || 120, lh = n.el.offsetHeight || 20;
        const lx = clamp(x + n.dx, 6, Math.max(6, W - lw - 6));
        const ly = clamp(y + n.dy, 6, Math.max(6, H - lh - 6));
        n.el.style.transform = 'translate(' + lx + 'px,' + ly + 'px)';
        n.ci.setAttribute('cx', x); n.ci.setAttribute('cy', y);
        n.ln.setAttribute('x1', x); n.ln.setAttribute('y1', y);
        n.ln.setAttribute('x2', lx + lw / 2); n.ln.setAttribute('y2', ly + (ly > y ? 0 : lh));
        const vis = show && v.z < 1;
        n.el.classList.toggle('on', vis);
        n.ln.style.opacity = n.ci.style.opacity = vis ? 1 : 0;
      });
    }

    /* ---------- public: load ---------- */
    function load(id) {
      tech = window.SUTURE.TECHNIQUES.find(t => t.id === id) || window.SUTURE.TECHNIQUES[0];
      tissue = tech.tissue;
      S.t = 0; S.playing = !reduced; S.auto = true; S.rows = false; S.lock = -1;
      curStep = -1; lastKey = ''; lastP = -1;
      wantView = ''; wantAt = 0; holdArc = null; holdProg = 0; holderVis = 0; holderT = 0;
      makeMeshes();
      buildGeometry(0);
      buildKnots();
      buildGhostRows();
      compile();
      setView('3d');
      snapCam();
      stepCam(performance.now());
      if (opts.onStep) opts.onStep(0, tech.steps[0], tech);
      if (opts.onLoad) opts.onLoad(tech, total);
      return tech;
    }

    /* ---------- render loop ---------- */
    let last = performance.now(), uiClock = 0, lastUI = -1;
    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    else window.addEventListener('resize', resize);
    resize();

    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (S.playing) {
        S.t += dt * S.speed;
        if (S.t >= total) { S.t = total; S.playing = false; }
      }
      const E = evalAt(S.t);
      if (Math.abs(E.st.p - lastP) > 0.004 || lastP < 0) {
        buildGeometry(E.st.p);
        lastP = E.st.p;
        lastKey = '';
      }
      const key = [E.st.p, E.st.q, E.st.k, E.st.c, E.prog.map(v => v.toFixed(3)).join('.')].join('|');
      if (key !== lastKey) {
        lastKey = key;
        const pts = threadPoints(E.st, E.prog);
        setThread(pts);
        endPts = pts;
      }
      if (E.i !== curStep) {
        curStep = E.i;
        const s = E.s;
        buildAnns(s.marks);
        S.lock = s.lock;
        if (S.auto) setView(bestView(s));
        if (opts.onStep) opts.onStep(E.i, tech.steps[E.i], tech);
        if (s.rows) buildGhostRows(); else clearGhosts();
      }
      const pi = E.s.kind === 'pass' ? E.s.pi : -1;
      if (pi >= 0) { holdArc = arcs[pi]; holdProg = E.prog[pi] || 0; }
      if (pi >= 0) {
        /* One pass step straight after another, with no resting step between them:
           the needle has to get from the pose the last bite ended in to the pose this
           bite starts from, so the turn is folded into the top of the bite. It turns
           while the bite is still easing in, and is in place before the tip is far
           under the skin. */
        const before = steps[E.i - 1];
        const turnS = Math.min(0.55, Math.max(0.3, (E.s.t1 - E.s.t0) * 0.3));
        const u = before && before.pi >= 0 && before.pi !== pi
          ? clamp(E.l * (E.s.t1 - E.s.t0) / turnS, 0, 1) : 1;
        if (u < 1) turnNeedle(needlePose(arcs[before.pi], before.f1), needlePose(holdArc, holdProg), ss(u), 1);
        else placeNeedle(holdArc, holdProg, 1, false);
      }
      else if (E.s.needleOn && holdArc) {
        const prev = passStepNear(E.i, -1), next = passStepNear(E.i, 1);
        if (E.s.regrip && prev && next) {
          /* a beat between the two bites: turn the needle from where the first bite
             left it to where the second bite starts, rather than letting it snap at
             the step boundary */
          turnNeedle(needlePose(arcs[prev.pi], prev.f1), needlePose(arcs[next.pi], next.f0), ss(E.l), 1);
        } else placeNeedle(holdArc, holdProg, 1, true);
      } else { needleG && (needleG.visible = false); if (holderG) holderG.visible = false; }
      /* The camera follows the needle itself: a plan view while it is still above the
         skin, a cross-section the moment it is through it. */
      if (S.auto && pi >= 0 && needleG && needleG.visible) {
        const want = needleInside ? (offPlane(lastArc) ? '3d' : 'section') : 'top';
        /* only move once the needle has really changed state, so a tip crossing the
           skin twice in quick succession does not make the camera flicker */
        if (want !== wantView) { wantView = want; wantAt = now; }
        else if (view !== want && now - wantAt > 260) setView(want, false, true);
      } else wantView = '';
      placeKnots(E.st);
      placeLocks(E.prog);
      applyGhosts(E);
      stepCam(now);
      updateAnns(E.l > 0.18);
      if (opts.onTime && now - uiClock > 90) {
        uiClock = now;
        opts.onTime(S.t, total, E.i, E.l, S.playing);
      }
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }

    /* repeat rows shown at the end of interrupted techniques */
    let ghostMeshes = [];
    function clearGhosts() {
      ghostMeshes.forEach(m => { ghostG.remove(m); if (m.geometry) m.geometry.dispose(); });
      ghostMeshes = [];
    }
    function buildGhostRows() {
      clearGhosts();
      if (!thread.visible || !endPts || endPts.length < 2) return;
      let zmin = 1e9, zmax = -1e9;
      endPts.forEach(p => { zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); });
      const gap = Math.max(7, (zmax - zmin) + 6);
      /* only repeat if the copy really sits inside the wound, otherwise it floats
         in mid-air beyond the end of the tissue block */
      if (zmax + gap > tissue.hz - 1 || zmin - gap < -tissue.hz + 1) return;
      const geo = thread.geometry.clone();
      [-1, 1].forEach(s => {
        const m = new T3.Mesh(geo, ghostMat);
        m.visible = false; m.renderOrder = 13;
        m.position.z = s * gap;
        ghostG.add(m);
        ghostMeshes.push(m);
      });
    }
    function applyGhosts(E) {
      ghostMeshes.forEach(m => { m.visible = !!E.s.rows && thread.visible; });
    }

    /* ---------- public API ---------- */
    const api = {
      load,
      state: S,
      get total() { return total; },
      get currentStep() { return curStep; },
      play() { if (S.t >= total - .01) S.t = 0; S.playing = true; },
      pause() { S.playing = false; },
      toggle() { if (S.playing) S.playing = false; else { if (S.t >= total - .01) S.t = 0; S.playing = true; } },
      seek(t) { S.t = clamp(t, 0, total); S.playing = false; },
      seekStep(i) {
        const s = steps[i]; if (!s) return;
        S.t = s.t0 + 0.01; S.playing = true; S.auto = true;
        if (opts.onAuto) opts.onAuto(true);
      },
      setSpeed(v) { S.speed = v; },
      setView(n) { setView(n, true); },
      get seeThrough() { return !!S.seeThrough; },
      setSeeThrough(v) { S.seeThrough = !!v; applyViewFlags(); return S.seeThrough; },
      toggleAuto() { S.auto = !S.auto; if (S.auto) setView(stepCamName()); if (opts.onAuto) opts.onAuto(S.auto); return S.auto; },
      setAuto(v) { S.auto = v; if (v) setView(stepCamName()); if (opts.onAuto) opts.onAuto(v); },
      resize
    };
    /* The section cuts at z = 0, so it hides any limb that sits off that plane
       (mattress stitches, purse-string bites). Fall back to the see-through 3D view
       instead of switching to a plane that cannot show the step. */
    function offPlane(a) { return !!a && (Math.abs(a.a.z) > 1.6 || Math.abs(a.b.z) > 1.6); }
    function bestView(s) {
      const nm = (s && s.cam) || '3d';
      if (nm !== 'section' || !s || s.pi == null || s.pi < 0) return nm;
      return offPlane(arcs[s.pi]) ? '3d' : nm;
    }
    function stepCamName() { return bestView(steps[curStep] || steps[0] || { cam: '3d' }); }

    load(opts.startWith || window.SUTURE.TECHNIQUES[0].id);
    requestAnimationFrame(frame);
    return api;
  }

  return { mount };
})();
