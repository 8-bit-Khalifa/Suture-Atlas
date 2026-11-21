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
      /* One movement with a soft shoulder where the surgeon's hand comes back onto
         the needle. Both halves ease in and out, so the needle slows to a near rest
         and picks up again instead of stopping dead and restarting. */
      const hit = clamp((0.62 - f0) / span, 0.1, 0.9);
      if (l <= hit) return f0 + span * 0.62 * ss(l / hit);
      return f0 + span * 0.62 + (f1 - f0 - span * 0.62) * ss((l - hit) / (1 - hit));
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
    scene.background = new T3.Color(0x141918);
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
    const edgeMat = new T3.LineBasicMaterial({ color: 0x140f0d, transparent: true, opacity: .34, clippingPlanes: [clipPlane] });
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
    /* Motion trial. `?motion=continuous` runs the interrupted stitch on the
       reference program - one monotonic needle angle, one angular speed and a real
       transfer stage between the bites - so the two motions can be judged side by
       side on the same page. The default, `?motion=arc` or no flag at all, keeps the
       arc model every other technique uses. */
    const MD_OMEGA = 1.15;   /* radians of needle rotation per second */
    const MD_LEAD = 0.8;     /* the clear-and-turn beat before each bite */
    const wantMotion = (new URLSearchParams(location.search).get('motion') || '').toLowerCase();
    /* Switched live by the before/after button, so the two movement models can be
       judged on the same page rather than from two builds. */
    let motionMode = wantMotion === 'md' ? 'md' : (wantMotion === 'continuous' ? 'continuous' : 'arc');
    const md = () => motionMode === 'md';

    let tech = null, tissue = null, steps = [], total = 0, arcs = [], meshes = [], cur = null;
    /* the opening approach: the needle is carried in from above, and the thread
       hangs from wherever the swage actually is, not from its landing point */
    const approachLift = new V3();
    let continuous = false;
    let K = new V3(), tailStart = new V3(), tailEnd = new V3();
    let needleG = null, needleInner = null, needleTorus = null;
    let lastArc = null, needleInside = false, wantView = '', wantAt = 0;
    let holdArc = null, holdProg = 0;
    let lastKey = '', lastP = -1, curStep = -1, knots = null, lockRings = [], endPts = null;

    /* ---------- surface ---------- */
    function yAt(u, d, p) {
      const atten = Math.exp(-Math.max(0, d) * tissue.falloff);
      return -d + tissue.lift(u, p) * atten;
    }
    /* The height of the outside of the skin at a point, and whether a point of the
       needle is clear of it. Everything the instrument does is judged against this:
       a needle holder works over the surface, it is never pushed through the skin. */
    function skinY(x, z) {
      if (tissue.type === 'round') return 0.12;
      return yAt(Math.max(0, Math.abs(x) - cur.edge), 0, cur.p);
    }
    function aboveSkin(pt) { return pt.y > skinY(pt.x, pt.z) + 0.1; }
    /* Where the hand takes the needle: the part nearest the swage that is clear of
       the skin. When the whole needle is under the surface there is nothing to hold,
       so the instrument waits just above the highest point until the needle is
       pushed back out and can be caught again. */
    function gripPoint(pts) {
      for (let i = 0; i < pts.length; i++) if (aboveSkin(pts[i])) return pts[i].clone();
      /* Nothing is exposed. The instrument does not hover over the middle of a
         buried needle: it goes to the point where the needle passes under the skin
         and presses there, jaws right down on the surface, so the hand is clearly
         driving the needle in rather than floating beside it. */
      let cross = -1;
      for (let i = 1; i < pts.length; i++) {
        if (aboveSkin(pts[i - 1]) && !aboveSkin(pts[i])) { cross = i; break; }
      }
      const g = (cross > 0 ? pts[cross] : pts[0]).clone();
      g.y = skinY(g.x, g.z) + 0.18;
      return g;
    }
    function surf(side, u, d, z) {
      if (side === 'C') return ringPoint(u, d, z);
      const x = cur.edge + u;
      return new V3(side === 'L' ? -x : x, yAt(u, d, cur.p), z || 0);
    }
    function ringPoint(deg, d, z) {
      const a = deg * PI / 180, r = Math.max(cur.r0 + 2.6 + d, 0.4);
      /* The stitch rides on the lifted top of the wall, not buried inside it: the
         ring's skin is opaque, so a thread a fraction of a millimetre under it simply
         disappears. It follows the lift as the drawstring gathers the tissue. */
      const y = 0.34 + 0.55 * (cur.p || 0) - (d || 0) * 0.5;
      return new V3(r * Math.cos(a), y, r * Math.sin(a));
    }

    /* ---------- tissue meshes ---------- */
    function disposeMeshes() {
      meshes.forEach(m => {
        if (m.out) { tissueG.remove(m.out); if (m.out.geometry) m.out.geometry.dispose(); }
        (m.caps || []).forEach(c => {
          [c.a, c.b].forEach(o => { if (o.geometry) o.geometry.dispose(); });
          tissueG.remove(c.g);
        });
        if (m.round) { m.capSkin && m.capSkin.dispose(); m.capMus && m.capMus.dispose(); m.capMuc && m.capMuc.dispose(); }
        const parts = m.round ? [m.m, m.ring, m.muc] : [m.m, m.cap, m.skin];
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
      /* A dark grid floor: it is what makes the translucent slabs read as solid
         blocks standing in space rather than coloured panes. */
      if (gridG) { scene.remove(gridG); gridG.geometry.dispose(); }
      const floorY = -(tissue.type === 'round' ? tissue.T : tissue.layers.reduce((s, L) => s + L.t, 0)) - 9;
      gridG = new T3.GridHelper(260, 52, 0x3a4642, 0x252e2b);
      gridG.position.y = floorY;
      scene.add(gridG);
      if (tissue.type === 'linear') {
        ['L', 'R'].forEach(side => {
          let d0 = 0;
          tissue.layers.forEach((L, li) => {
            const d1 = d0 + L.t;
            const mat = new T3.MeshStandardMaterial({
              color: L.c, roughness: .96, metalness: 0, side: T3.DoubleSide,
              clippingPlanes: [clipPlane]
            });
            if (li === 0) {
              mat.map = makeSkinTex();
              mat.bumpMap = mat.map;
              mat.bumpScale = 0.09;
            }
            const capMat = new T3.MeshStandardMaterial({
              color: new T3.Color(L.c).lerp(new T3.Color(0xffffff), 0.16), roughness: .95,
              side: T3.DoubleSide, clippingPlanes: [clipPlane]
            });
            const m = new T3.Mesh(new T3.BufferGeometry(), mat);
            m.userData.base = new T3.Color(L.c);
            m.userData.see = new T3.Color(L.sc || L.c);
            const cap = new T3.Mesh(new T3.BufferGeometry(), capMat);
            cap.visible = false;
            const out = new T3.LineSegments(new T3.BufferGeometry(), edgeMat);
            /* a decal of clipped stubble on the surface itself, so the prepared skin
               is legible even when the top layer is 42% opaque */
            let skin = null;
            if (li === 0) {
              const sm = new T3.MeshBasicMaterial({
                map: makeStubTex(), transparent: true, depthWrite: false,
                opacity: 0.9, side: T3.DoubleSide, clippingPlanes: [clipPlane]
              });
              skin = new T3.Mesh(new T3.BufferGeometry(), sm);
              skin.renderOrder = 12;
              tissueG.add(skin);
            }
            tissueG.add(m, cap, out);
            meshes.push({ side, li, d0, d1, m, cap, out, skin });
            d0 = d1;
          });
        });
      } else {
        /* Three shells, one per layer, so the wall really is serosa over muscle over
           mucosa the way the legend says: the ring used to be two shells, and the
           mucosa never existed as a surface at all. */
        const shell = i => {
          const mm = new T3.MeshStandardMaterial({ color: tissue.layers[i].c, roughness: .95, metalness: 0, side: T3.DoubleSide });
          const o = new T3.Mesh(new T3.BufferGeometry(), mm);
          o.userData.base = new T3.Color(tissue.layers[i].c);
          o.userData.see = new T3.Color(tissue.layers[i].sc || tissue.layers[i].c);
          return o;
        };
        const ring = shell(0), m = shell(1), muc = shell(2);
        tissueG.add(m, ring, muc);
        /* The cut face for the ring section: the wall's cross-section at the bite,
           drawn twice - once at the bite and once opposite it - because a plane
           through the centre cuts the ring in two. */
        /* A cut face is a diagram: it has to stay legible whichever way the light
           falls, so it carries a little of its own colour. */
        const capSkin = new T3.MeshStandardMaterial({ color: tissue.layers[0].c, emissive: tissue.layers[0].c, emissiveIntensity: .42, roughness: .95, metalness: 0, side: T3.DoubleSide });
        const capMus = new T3.MeshStandardMaterial({ color: tissue.layers[1].c, emissive: tissue.layers[1].c, emissiveIntensity: .42, roughness: .95, metalness: 0, side: T3.DoubleSide });
        capSkin.userData = { base: new T3.Color(tissue.layers[0].c), see: new T3.Color(tissue.layers[0].sc || tissue.layers[0].c) };
        capMus.userData = { base: new T3.Color(tissue.layers[1].c), see: new T3.Color(tissue.layers[1].sc || tissue.layers[1].c) };
        const capMuc = new T3.MeshStandardMaterial({ color: tissue.layers[2].c, emissive: tissue.layers[2].c, emissiveIntensity: .42, roughness: .95, metalness: 0, side: T3.DoubleSide });
        capMuc.userData = { base: new T3.Color(tissue.layers[2].c), see: new T3.Color(tissue.layers[2].sc || tissue.layers[2].c) };
        const caps = [-1, 1].map(sg => {
          const g = new T3.Group();
          const a = new T3.Mesh(new T3.BufferGeometry(), capSkin);
          const b = new T3.Mesh(new T3.BufferGeometry(), capMus);
          const c = new T3.Mesh(new T3.BufferGeometry(), capMuc);
          a.visible = b.visible = c.visible = false;
          g.add(a, b, c); g.visible = false;
          tissueG.add(g);
          return { sg, g, a, b, c };
        });
        meshes.push({ round: true, m, ring, muc, caps, capSkin, capMus, capMuc });
      }
    }
    /* Sheared, prepared surgical field: pale skin under close-clipped stubble, with
       faint clipper streaks. Drawn once into a canvas and tiled over the top slab so
       the surface is a skin rather than a flat colour plane. */
    let skinTex = null;
    function makeSkinTex() {
      if (skinTex) return skinTex;
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 70; i++) {
        x.fillStyle = 'rgba(150,120,105,' + (0.03 + Math.random() * 0.07).toFixed(3) + ')';
        x.beginPath();
        x.arc(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 46, 0, PI * 2);
        x.fill();
      }
      /* close-clipped stubble: short, coarse, lying every which way */
      for (let i = 0; i < 900; i++) {
        const px = Math.random() * 256, py = Math.random() * 256;
        const a = Math.random() * PI, len = 5 + Math.random() * 11;
        x.strokeStyle = 'rgba(84,64,50,' + (0.06 + Math.random() * 0.18).toFixed(3) + ')';
        x.lineWidth = 1.4 + Math.random() * 1.4;
        x.beginPath(); x.moveTo(px, py);
        x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
      }
      /* clipper streaks across the prepared field */
      for (let i = 0; i < 14; i++) {
        const py = Math.random() * 256;
        x.strokeStyle = 'rgba(120,96,80,' + (0.04 + Math.random() * 0.06).toFixed(3) + ')';
        x.lineWidth = 3 + Math.random() * 4;
        x.beginPath(); x.moveTo(0, py); x.lineTo(256, py + (Math.random() - 0.5) * 14); x.stroke();
      }
      skinTex = new T3.CanvasTexture(c);
      skinTex.wrapS = skinTex.wrapT = T3.RepeatWrapping;
      skinTex.anisotropy = 4;
      return skinTex;
    }
    /* A transparent decal of clipped stubble laid just over the skin. It is drawn
       on top of the translucent slabs, so the prepared surface reads in the
       see-through view where a map on the 42%-opaque top layer was washed out. */
    let stubTex = null;
    function makeStubTex() {
      if (stubTex) return stubTex;
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const x = c.getContext('2d');
      x.clearRect(0, 0, 512, 512);
      for (let i = 0; i < 2200; i++) {
        const px = Math.random() * 512, py = Math.random() * 512;
        const a = Math.random() * PI, len = 5 + Math.random() * 13;
        x.strokeStyle = 'rgba(58,38,26,' + (0.18 + Math.random() * 0.42).toFixed(3) + ')';
        x.lineWidth = 1.1 + Math.random() * 1.5;
        x.beginPath(); x.moveTo(px, py);
        x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
      }
      for (let i = 0; i < 18; i++) {
        const py = Math.random() * 512;
        x.strokeStyle = 'rgba(70,48,34,' + (0.10 + Math.random() * 0.16).toFixed(3) + ')';
        x.lineWidth = 4 + Math.random() * 7;
        x.beginPath(); x.moveTo(0, py); x.lineTo(512, py + (Math.random() - 0.5) * 30); x.stroke();
      }
      stubTex = new T3.CanvasTexture(c);
      stubTex.wrapS = stubTex.wrapT = T3.RepeatWrapping;
      stubTex.anisotropy = 4;
      return stubTex;
    }
    function stubbleGeo(sg, N, hz) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const u = tissue.span * (i / N);
        const x = sg * (cur.edge + u);
        const y = yAt(u, 0, cur.p) + 0.05;
        pos.push(x, y, -hz, x, y, hz);
        uv.push(x * 0.05, -hz * 0.05, x * 0.05, hz * 0.05);
      }
      for (let i = 0; i < N; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
      const g = new T3.BufferGeometry();
      g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T3.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
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
      /* planar UVs from the world position, so a surface texture (sheared skin)
         can be mapped onto the slab without hand-authoring coordinates */
      const pa = ng.attributes.position, uv = new Float32Array(pa.count * 2);
      for (let i = 0; i < pa.count; i++) {
        uv[i * 2] = pa.getX(i) * 0.05;
        uv[i * 2 + 1] = (pa.getZ(i) + pa.getY(i)) * 0.05;
      }
      ng.setAttribute('uv', new T3.BufferAttribute(uv, 2));
      g.dispose();
      return ng;
    }
    function capGeo(poly) {
      const pos = [];
      /* Just behind the cut plane, not on it: a needle that runs under the wound
         is inside the tissue at z = 0, and a cap sitting in front of it would hide
         the very thing the cross-section exists to show. */
      poly.forEach(q => pos.push(q[0], q[1], -0.06));
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
          if (m.skin) { m.skin.geometry.dispose(); m.skin.geometry = stubbleGeo(sg, 48, hz); }
        });
      } else {
        const r0 = cur.r0, r1 = tissue.r1, T = tissue.T, lift = 0.95 * cur.p;
        const rt = lerp(r0, r1, .45);
        /* Each shell is a closed profile: outer wall down through its own layer, floor,
           then the inner wall back up, so the lumen is lined by the mucosa instead of
           being an open tube showing the back of the outer wall. */
        const s0 = tissue.layers[0].t, mb = s0 + tissue.layers[1].t;
        const v2 = (a, b) => new T3.Vector2(a, b);
        const skinPoly = [[r0, lift], [rt, lift * .35], [r1, 0], [r1, -s0], [r0, -s0]];
        const musPoly = [[r0, -s0], [r1, -s0], [r1, -mb], [r0, -mb]];
        const mucPoly = [[r0, -mb], [r1, -mb], [r1, -T], [r0, -T]];
        const lathe = (poly, close) => new T3.LatheGeometry(
          poly.map(q => v2(q[0], q[1])).concat(close ? [v2(poly[0][0], poly[0][1])] : []), 64);
        const setGeo = (mesh, geo) => { mesh.geometry.dispose(); mesh.geometry = geo; };
        setGeo(meshes[0].ring, lathe(skinPoly, true));
        setGeo(meshes[0].m, lathe(musPoly, true));
        setGeo(meshes[0].muc, lathe(mucPoly, true));
        (meshes[0].caps || []).forEach(c => {
          setGeo(c.a, capGeo(skinPoly));
          setGeo(c.b, capGeo(musPoly));
          setGeo(c.c, capGeo(mucPoly));
        });
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
      const half = len / 2;
      /* A sag of half the chord is the degenerate case: the chord becomes a
         diameter and the arc can bulge either way, which is how a bite ends up
         above the skin with its swage buried. Keep every arc clearly shallower
         than that. */
      const s = Math.max(0.06, Math.min(sag || 0.6, half * 0.9));
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
        /* The wall lifts as the drawstring gathers it (0.34 + 0.55p), so the knot has
           to ride that height: a fixed one is left buried under the puckered rim. */
        K.y = 0.34 + 0.55 * (cur.p || 0) + 0.22;
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
    /* A free run of thread hangs. Two ends are joined by a shallow catenary and the
       result is kept just clear of the skin, so a loose end lies on the surface and a
       length carried over the wound droops instead of flying straight. This is what
       stops the *thread* looking like a drawn line when the needle is lifted. */
    function sagRun(a, b, n, drop) {
      const pts = [];
      const span = a.distanceTo(b);
      if (span < 0.8) return pts;
      const d = Math.min(drop == null ? span * 0.22 : drop, span * 0.5, 5);
      const mid = new V3().addVectors(a, b).multiplyScalar(.5);
      for (let i = 1; i < n; i++) {
        const t = i / n, it = 1 - t;
        const p = new V3(
          it * it * a.x + 2 * it * t * mid.x + t * t * b.x,
          it * it * a.y + 2 * it * t * (mid.y - d) + t * t * b.y,
          it * it * a.z + 2 * it * t * mid.z + t * t * b.z
        );
        if (cur && tissue.type !== 'round') p.y = Math.max(p.y, skinY(p.x, p.z) + 0.2);
        pts.push(p);
      }
      return pts;
    }
    function threadPoints(st, prog) {
      const out = [];
      let a0 = tailStart.clone(), a1 = tailEnd.clone();
      if (st.q > 0) { a0.lerp(K, clamp(st.q * 1.6, 0, 1)); a1.lerp(K, clamp(st.q * 1.6, 0, 1)); }
      out.push(a0);
      if (!arcs.length) return out;
      /* Before the first bite the thread is not in the skin yet: it hangs from the
         swage of the loaded needle, not from a track that does not exist. */
      if (!prog.some(v => v > 0)) {
        const swage = posePts(needlePose(arcs[0], 0), 2)[0].add(approachLift);
        sagRun(a0, swage, 9).forEach(p => out.push(p));
        out.push(swage);
        return dedupe(out);
      }
      sagRun(a0, arcs[0].a, 7).forEach(p => out.push(p));
      out.push(arcs[0].a.clone());
      for (let i = 0; i < arcs.length; i++) {
        const pr = prog[i] || 0;
        if (pr > 0) {
          if (pr < 0.999) {
            /* In the middle of a bite the needle still fills the track and the suture
               is attached to its swage, so the thread only lies along the part the
               needle has already vacated, and leaves from the back end - never from
               the point. */
            const sp = needlePose(arcs[i], pr);
            const frac = clamp(sp.phi / arcs[i].delta, 0, 1);
            if (frac > 0.02) appendArc(out, arcs[i], frac);
            out.push(new V3(arcs[i].r * Math.cos(sp.phi), arcs[i].r * Math.sin(sp.phi), 0)
              .applyQuaternion(sp.q).add(sp.c));
            break;
          }
          appendArc(out, arcs[i], 1);
        }
        if (pr < 0.999) break;
        if (i + 1 < arcs.length) {
          connector(out, arcs[i].b, arcs[i + 1].a, i + 1);
          out.push(arcs[i + 1].a.clone());
        } else {
          sagRun(out[out.length - 1], a1, 10, 2.6).forEach(p => out.push(p));
          out.push(a1);
        }
      }
      return dedupe(out);
    }
    /* ---------- thread as particles ---------- */
    /* A drawn cord is a function of the needle's pose, so it can jump and it can
       contain the whole exit track before the needle has vacated it. This is a
       position-based chain instead: a fixed number of particles with a fixed
       material length, the leading end pinned to the swage, gravity and the skin as
       the only forces on the free part, and the part that is inside the tissue held
       in the needle's track (the only route through it). Material is paid out of the
       free end as the needle pulls; once deployed it never shortens again, so the
       cord settles into its slack instead of shrinking back through the skin. */
    const SIM = { on: false, n: 84, p: [], v: [], rest: 1, L: 0, init: false };

    function polyLen(a) { let s = 0; for (let i = 1; i < a.length; i++) s += a[i].distanceTo(a[i - 1]); return s; }
    function resamplePath(a, step) {
      const out = [];
      if (!a.length) return out;
      out.push(a[0].clone());
      for (let i = 1; i < a.length; i++) {
        const p0 = a[i - 1], p1 = a[i], d = p0.distanceTo(p1);
        if (d < 1e-7) continue;
        const n = Math.max(1, Math.round(d / step));
        for (let k = 1; k <= n; k++) out.push(p0.clone().lerp(p1, k / n));
      }
      return out;
    }
    /* the height of the prepared surface at a point, for the skin collision */
    function surfY(x, z) {
      if (!cur) return 0;
      if (tissue.type === 'round') {
        const r = Math.hypot(x, z), r0 = cur.r0, r1 = tissue.r1;
        const lift = 0.95 * (cur.p || 0), rt = lerp(r0, r1, .45);
        if (r <= r0) return lift;
        if (r <= rt) return lerp(lift, lift * .35, (r - r0) / (rt - r0));
        if (r <= r1) return lerp(lift * .35, 0, (r - rt) / (r1 - rt));
        return 0;
      }
      return yAt(Math.max(0, Math.abs(x) - cur.edge), 0, cur.p);
    }
    function inBody(q) {
      if (!cur) return false;
      if (tissue.type === 'round') return q.y < surfY(q.x, q.z) - 0.12 && q.y > -tissue.T - 0.5;
      if (Math.abs(q.z) > tissue.hz + 1.5) return false;
      if (Math.abs(q.x) > cur.edge + tissue.span + 1) return false;
      return q.y < surfY(q.x, q.z) - 0.12 && q.y > -tissue.T - 0.5;
    }

    function simInit(route) {
      const tot = Math.max(2, polyLen(route));
      SIM.L = Math.max(SIM.L, tot * 1.01);
      SIM.rest = SIM.L / (SIM.n - 1);
      const rs = resamplePath(route, 0.2);
      SIM.p = new Array(SIM.n); SIM.v = new Array(SIM.n);
      for (let i = 0; i < SIM.n; i++) {
        const q = rs[Math.round(i * (rs.length - 1) / (SIM.n - 1))] || route[route.length - 1];
        SIM.p[i] = q.clone();
        SIM.v[i] = new V3();
      }
      SIM.init = true;
    }

    function simSolve(route, anchor, swage, iters, withBody) {
      const P = SIM.p, n = SIM.n, rest = SIM.rest;
      const rs = withBody ? resamplePath(route, 0.6) : null;
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < n - 1; i++) {
          const a = P[i], b = P[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const k = (d - rest) / d * 0.5;
          if (i > 0) { a.x += dx * k; a.y += dy * k; a.z += dz * k; }
          if (i + 1 < n - 1) { b.x -= dx * k; b.y -= dy * k; b.z -= dz * k; }
        }
        P[0].copy(anchor);
        P[n - 1].copy(swage);
        for (let i = 1; i < n - 1; i++) {
          const q = P[i];
          if (withBody && rs) {
            let best = null, bd = 900;
            for (let k = 0; k < rs.length; k += 2) {
              const dx = rs[k].x - q.x, dy = rs[k].y - q.y, dz = rs[k].z - q.z;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < bd) { bd = d2; best = rs[k]; }
            }
            if (best) {
              /* inside the tissue the only route is the needle's track, so the strand
                 is held in it; on the surface it lies along the laid strand, which is
                 what stops slack ballooning into arches between bites */
              if (inBody(q)) { if (it < 4) q.copy(best); }
              else if (bd < 9) q.lerp(best, 0.3);
            }
          }
          /* the skin is a floor: nothing lies inside it except along the track */
          const sy = surfY(q.x, q.z) + 0.16;
          if (!inBody(q) && q.y < sy) { q.y = sy; SIM.v[i].x *= 0.7; SIM.v[i].z *= 0.7; SIM.v[i].y = 0; }
        }
      }
    }

    function simStep(route, dt) {
      if (!route || route.length < 2) return;
      if (!SIM.init) simSettle(route);
      const P = SIM.p, V = SIM.v, n = SIM.n;
      /* the tail end is where the material is paid out from: it follows the start of
         the path, so as the needle pulls the strand is drawn in from there */
      const anchor = route[0], swage = route[route.length - 1];
      const step = Math.min(1 / 30, Math.max(1 / 240, dt));
      const prev = P.map(q => q.clone());
      for (let i = 1; i < n - 1; i++) {
        V[i].y -= 1500 * step;
        V[i].multiplyScalar(0.90);
        P[i].addScaledVector(V[i], step);
      }
      simSolve(route, anchor, swage, 5, true);
      for (let i = 1; i < n - 1; i++) {
        V[i].copy(P[i]).sub(prev[i]).divideScalar(step).multiplyScalar(0.9);
      }
    }

    /* settle: after a seek the chain is dropped onto the path and relaxed, so the cord
       is already at rest when the frame is drawn instead of whipping into place */
    function simSettle(route) {
      const anchor = route[0], swage = route[route.length - 1];
      simInit(route);
      simSolve(route, anchor, swage, 24, false);
      SIM.v.forEach(v => v.set(0, 0, 0));
      SIM.init = true;
    }

    function setThread(pts) {
      if (pts.length < 2) { thread.visible = false; return; }
      thread.visible = true;
      const curve = new T3.CatmullRomCurve3(pts, false, 'centripetal');
      const len = curve.getLength();
      const seg = Math.min(560, Math.max(24, Math.round(len * 6)));
      const geo = new T3.TubeGeometry(curve, seg, 0.17, 8, false);
      thread.geometry.dispose();
      thread.geometry = geo;
      return curve;
    }

    /* ---------- needle ---------- */
    /* The diameter along a real needle, from the swage (t = 0) to the point (t = 1).
       The back is a full-diameter cylinder cut off square, with one shallow groove
       where the holder grips it; the front is a long, concave grind that runs down
       to a hairline. A needle drawn this way is blunt at one end and a spike at the
       other, so the end that enters the skin is never in doubt. */
    function needleProfile(t) {
      if (t < 0.15) return 1 - 0.2 * Math.sin((t / 0.15) * PI);
      if (t < 0.6) return 1;
      const u = (t - 0.6) / 0.4;
      return 1 - 0.985 * Math.pow(u, 1.5);
    }
    function needleGeo(r, sweep, rmax) {
      const segs = Math.max(20, Math.round(sweep * 26));
      const radial = 12, pos = [], idx = [];
      const ring = (t, rad) => {
        const a = sweep * t, cx = r * Math.cos(a), cy = r * Math.sin(a);
        for (let j = 0; j < radial; j++) {
          const th = j / radial * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
          pos.push(cx + rad * ct * Math.cos(a), cy + rad * ct * Math.sin(a), rad * st);
        }
      };
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        ring(t, Math.max(rmax * needleProfile(t), 0.003));
      }
      for (let i = 0; i < segs; i++) {
        for (let j = 0; j < radial; j++) {
          const j2 = (j + 1) % radial;
          const a0 = i * radial + j, a1 = i * radial + j2;
          const b0 = (i + 1) * radial + j, b1 = (i + 1) * radial + j2;
          idx.push(a0, b0, a1, a1, b0, b1);
        }
      }
      /* Square faces at both ends, with their own ring of vertices so the rim stays
         a crisp edge: the swage butt reads as cut metal, the point closes to a tip. */
      [[0, false], [1, true]].forEach(([t, flip]) => {
        const base = pos.length / 3;
        ring(t, Math.max(rmax * needleProfile(t), 0.003));
        const a = sweep * t, c = pos.length / 3;
        pos.push(r * Math.cos(a), r * Math.sin(a), 0);
        for (let j = 0; j < radial; j++) {
          const j2 = (j + 1) % radial;
          if (flip) idx.push(c, base + j2, base + j);
          else idx.push(c, base + j, base + j2);
        }
      });
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
      needleTorus.renderOrder = 14;
      needleInner.add(needleTorus);
      needleG.add(needleInner);
      scene.add(needleG);
    }
    /* A needle holder: two jaws round the swage, a box joint, two shanks and the
       finger rings. Built once in world space so it can be kept clear of the tissue
       instead of being dragged through the skin with the needle. */
    let holderG = null, holderVis = 0, holderT = 0, gridG = null;
    /* the instruments glide to each new grip instead of being teleported onto it,
       which is what makes a change of hold read as a movement rather than a cut */
    let holderPos = null, holderQuat = null;
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
      const shankGeo = new T3.BoxGeometry(0.86, 16.2, 0.82);
      shankGeo.translate(0, 8.1, 0);
      [-1, 1].forEach(s => {
        const sh = new T3.Mesh(shankGeo, bodyMetal);
        sh.position.set(s * 0.46, 4.0, 0);
        sh.rotation.z = -s * 0.052;
        sh.renderOrder = 14; g.add(sh);
      });
      const ringGeo = new T3.TorusGeometry(1.95, 0.4, 8, 22);
      [-1, 1].forEach(s => {
        const rg = new T3.Mesh(ringGeo, bodyMetal);
        rg.position.set(s * 1.34, 22.8, 0);
        rg.renderOrder = 14; g.add(rg);
      });
      g.visible = false;
      scene.add(g);
      return g;
    }
    /* Surgical scissors: two halves crossing on a screw, a tapered blade above the
       pivot and a shank with a finger ring below it. Closing them is a rotation of
       each half about that screw, so a snip is a real movement of the blades. */
    let scissorG = null, scisHalves = [], scisVis = 0, scisT = 0;
    function makeScissors() {
      const g = new T3.Group();
      const bladeMat = new T3.MeshStandardMaterial({ color: 0xe6edf4, metalness: .2, roughness: .26, emissive: 0x26323f, emissiveIntensity: .55 });
      const steelMat = new T3.MeshStandardMaterial({ color: 0xb9c2ca, metalness: .2, roughness: .34, emissive: 0x1b232b, emissiveIntensity: .45 });
      const darkMat = new T3.MeshStandardMaterial({ color: 0x39434c, metalness: .2, roughness: .5 });
      /* The blade outline of a Mayo/Metzenbaum scissor: broad at the screw, tapering
         to a blunt tip, and flat. Extruded, it gives a real blade edge instead of a
         rod, so the pair reads as one slim instrument with two blades meeting along
         the middle, the way the reference photograph does. */
      const BL = 8.2;
      const shape = new T3.Shape();
      shape.moveTo(0.15, 0);
      shape.lineTo(0.31, BL * 0.35);
      shape.lineTo(0.30, BL * 0.78);
      shape.lineTo(0.12, BL * 0.97);
      shape.lineTo(-0.12, BL * 0.97);
      shape.lineTo(-0.30, BL * 0.78);
      shape.lineTo(-0.27, BL * 0.35);
      shape.lineTo(-0.13, 0);
      shape.closePath();
      const bladeGeo = new T3.ExtrudeGeometry(shape, {
        depth: 0.44, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1, curveSegments: 2
      });
      bladeGeo.translate(0, 0, -0.22);
      scisHalves = [];
      [-1, 1].forEach(s => {
        const h = new T3.Group();
        /* Two separate halves, one passing in front of the other at the screw, so
           the pair reads as scissors and not as one spear: a blade, a shank that
           bends outward, and a finger ring of its own. */
        const bl = new T3.Mesh(bladeGeo, bladeMat);
        bl.position.z = s * 0.17;
        bl.renderOrder = 14; h.add(bl);
        const shank = new T3.Mesh(new T3.BoxGeometry(0.34, 6.9, 0.34), steelMat);
        shank.position.set(s * 0.35, -3.4, s * 0.17);
        shank.rotation.z = s * 0.16;
        shank.renderOrder = 14; h.add(shank);
        const ring = new T3.Mesh(new T3.TorusGeometry(1.5, 0.26, 8, 24), steelMat);
        ring.position.set(s * 1.16, -7.3, s * 0.17);
        ring.scale.set(1.25, 1, 1);
        ring.renderOrder = 14; h.add(ring);
        h.userData.side = s;
        h.rotation.z = s * 0.03;
        g.add(h);
        scisHalves.push(h);
      });
      /* the screw and its slot: the one detail that says "scissors" rather than
         "tweezers" */
      const screw = new T3.Mesh(new T3.CylinderGeometry(0.46, 0.46, 0.64, 16), steelMat);
      screw.rotation.x = PI / 2; screw.renderOrder = 15; g.add(screw);
      const slot = new T3.Mesh(new T3.BoxGeometry(0.66, 0.11, 0.1), darkMat);
      slot.position.z = 0.34; slot.renderOrder = 15; g.add(slot);
      g.visible = false;
      scene.add(g);
      return g;
    }
    /* Where the scissors are: `near` runs 0 with the instrument held back below the
       knot to 1 with the blades on the tails. `close` runs 0 open to 1 shut. */
    function placeScissors(vis, near, close) {
      if (!scissorG) scissorG = makeScissors();
      const nowMs = performance.now();
      const dt = scisT ? Math.min(0.12, (nowMs - scisT) / 1000) : 0.016;
      scisT = nowMs;
      scisVis += ((vis > 0.5 ? 1 : 0) - scisVis) * Math.min(1, dt * 9);
      scissorG.visible = scisVis > 0.02;
      if (!scissorG.visible) return;
      /* the whole instrument is scaled, so the reach of the blades in millimetres is
         their built length times this */
      const base = tissue.type === 'round' ? 0.36 : 0.58;
      const reach = 8.2 * base;
      /* In from the far side of the knot from the holder, so both instruments stay
         readable and neither hides the other. Held back it sits up and towards the
         viewer, inside the tight close-up; coming in to cut it drops to the tails. */
      const near01 = clamp(near, 0, 1);
      const dir = new V3(-0.30, 0.62, 0.72).normalize()
        .lerp(new V3(-0.90, 0.34, 0.28).normalize(), near01).normalize();
      const meet = K.clone().add(new V3(-0.7, 0.65, 0.4));
      const dist = lerp(reach + 3.4, reach - 0.3, near01);
      scissorG.position.copy(meet).addScaledVector(dir, dist);
      scissorG.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.clone().negate());
      /* roll the instrument about its own long axis until the flat of the blades
         faces the camera: a scissor seen edge-on is a line */
      const axis = new V3(0, 1, 0).applyQuaternion(scissorG.quaternion);
      const face = new V3(0, 0, 1).applyQuaternion(scissorG.quaternion);
      const toCam = camera.position.clone().sub(scissorG.position);
      if (toCam.lengthSq() > 1e-4) {
        const want = toCam.normalize().addScaledVector(axis, -toCam.dot(axis));
        if (want.lengthSq() > 1e-4) {
          want.normalize();
          const roll = Math.atan2(new V3().crossVectors(face, want).dot(axis), face.dot(want));
          scissorG.quaternion.multiply(new T3.Quaternion().setFromAxisAngle(new V3(0, 1, 0), roll));
        }
      }
      scissorG.scale.setScalar(base * scisVis);
      const spread = lerp(0.075, 0.004, clamp(close, 0, 1));
      scisHalves.forEach(h => { h.rotation.z = h.userData.side * spread; });
    }
    /* The end of every stitch is worked over the skin, not in the wound: the holder
       sits on the knot as the post the throws are wrapped round, and the scissors
       come in for the tails. */
    function knotInstruments(E, needleStep) {
      const s = E.s;
      if (!s.knot) {
        setHolder(null, null, 0);
        placeScissors(0, E.l, 0);
        return;
      }
      /* a slow rock so the hand reads as alive rather than parked */
      const rock = Math.sin(E.l * PI * 1.6) * 0.6;
      const grip = K.clone().add(new V3(rock + 0.5, 1.8, 0.5));
      /* scaled down from the working hold: over a knot this small the instrument has
         to sit in the frame without swallowing it */
      setHolder(grip, new V3(0.26 + rock * 0.05, 1, 0.5).normalize(), 0.72);
      if (s.cut) {
        /* in, snip, away */
        const come = ss(clamp(E.l / 0.3, 0, 1));
        const go = ss(clamp((E.l - 0.8) / 0.2, 0, 1));
        placeScissors(1, come * (1 - go), ss(clamp((E.l - 0.46) / 0.16, 0, 1)));
      } else {
        /* the scissors are already in the hand while the throws are laid down,
           held back shut, ready for the tails */
        placeScissors(1, 0.16, 1);
      }
    }
    /* Two grips, as a surgeon works. The jaws drive the needle in by its swage while
       that end is still outside the skin. When the swage goes under, the holder lets
       go and reaches down into the open wound to catch the part that has come
       through, then pulls the rest of the needle out along its curve. It is never
       dragged through intact tissue, and it fades in and out instead of popping. */
    function placeHolder(pts, vis, force) {
      if (!holderG) holderG = makeHolder();
      /* `pts` runs along the needle itself, swage first and point last, so the hand
         always takes the back end and never the sharp end. */
      const n = pts.length - 1;
      const swage = pts[0].clone();
      const away = () => {
        const d = new V3().subVectors(swage, pts[1]);
        if (d.lengthSq() < 1e-4) d.set(0, 1, 0); else d.normalize();
        /* lean it away from the wound so the rings stay in frame */
        d.x += swage.x < 0 ? -0.28 : 0.28;
        if (d.y < 0.5) d.y = 0.5;
        return d.normalize();
      };

      /* The instrument stays over the skin. It takes the needle by the part nearest
         the swage that is still outside, and if the whole needle is under the surface
         it waits above the highest point instead of following it in. */
      const grip = gripPoint(pts);
      const dir = away();
      setHolder(grip, dir, vis);
    }
    /* Put the instrument down at a grip point, fading it in and out and scaling it to
       the tissue. Kept separate from choosing the grip, so a movement program can
       choose its own. */
    function setHolder(grip, dir, vis) {
      if (!holderG) holderG = makeHolder();
      const on = vis > 0.5 && !!grip;
      const nowMs = performance.now();
      const dt = holderT ? Math.min(0.12, (nowMs - holderT) / 1000) : 0.016;
      holderT = nowMs;
      holderVis += ((on ? 1 : 0) - holderVis) * Math.min(1, dt * 10);
      holderG.visible = holderVis > 0.02;
      if (!holderG.visible) return;
      if (grip) {
        const tq = new T3.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
        /* a glide to the new grip, but a snap for a real jump (a seek, a reload) */
        if (!holderPos || holderPos.distanceTo(grip) > 40) {
          holderPos = grip.clone(); holderQuat = tq.clone();
        } else {
          const a = Math.min(1, dt * 16);
          holderPos.lerp(grip, a);
          holderQuat.slerp(tq, a);
        }
        holderG.position.copy(holderPos);
        holderG.quaternion.copy(holderQuat);
      }
      /* The instrument has to read as a needle holder - five times the needle's
         length, not the same size as it. The purse-string works on a 27 mm ring, so
         there it is scaled down to stay in proportion with the opening it closes. */
      const base = tissue.type === 'round' ? (S.view === 'section' ? 0.32 : 0.38)
        : (S.view === 'section' ? 0.56 : S.view === 'top' ? 0.6 : 0.82);
      holderG.scale.setScalar(base * Math.max(0.2, vis) * holderVis);
    }
    /* The reference grip: the hand takes the needle part-way along it and slides as
       the needle travels, instead of staying pinned to the back end. `frac` runs 0 at
       the swage to 1 at the point; the jaws clamp round the shaft and the shank runs
       out from the centre of the needle's curve, clear of the skin. `frac` is a
       request, not an order: the slide stops at the last exposed part of the needle. */
    function placeHolderFrac(st, frac, vis) {
      const pts = posePts(st, 24);
      /* The jaws can only close on the part of the needle that is out of the tissue:
         the back end above the skin while the bite is being driven, or the end that
         has come through into the open wound once the needle has crossed. A grip
         asked for in the middle of a buried needle slides to the nearest exposed
         point instead, so the instrument never sinks out of sight in the tissue and
         the hand still reads as staying on the needle and walking along it. */
      const want = clamp(Math.round(clamp(frac, 0.04, 0.94) * 24), 0, 24);
      let grip = null;
      /* Search back from the wanted point only - never ahead of it, towards the
         point. That is what stops the hand jumping from the entry to the far end
         the instant the tip surfaces: the transfer is a move of its own, not a snap
         in the middle of a bite. Only a part of the needle that is clear of the skin
         can be gripped. */
      for (let k = want; k >= 0; k--) {
        if (aboveSkin(pts[k])) { grip = pts[k].clone(); break; }
      }
      /* everything is under the skin: wait above the needle rather than follow it in */
      if (!grip) grip = gripPoint(pts);
      const dir = new V3().subVectors(grip, st.c);
      if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0); else dir.normalize();
      dir.y = Math.max(dir.y, 0.55);
      /* lean the shank towards the viewer rather than behind the tissue, so the
         near wall does not swallow it in the cross-section */
      dir.z += 0.22;
      dir.normalize();
      setHolder(grip, dir, vis);
    }
    /* A needle pose: the circle the needle lies on (centre, radius, basis), where its
       back end sits on that circle, and how much of the circle the needle covers.
       Everything that draws the needle is described this way, which is what lets two
       poses be blended - that is how the needle is turned over between two bites
       instead of snapping at the boundary. */
    function needlePose(arc, prog) {
      const delta = arc.delta;
      const sweep = Math.min(1.55, Math.abs(delta));
      /* `phi` is the angle of the back (swage) end, measured on the same circle as
         the bite. The point leads at delta * prog; the body trails behind it, on the
         side the needle came from, whether the arc runs clockwise or anticlockwise.
         `dir` is the way the drawn span leaves the swage, so the mirrored geometry
         still ends in its point at the tip. */
      const dir = delta < 0 ? -1 : 1;
      const phi = delta * prog - dir * sweep;
      const q = new T3.Quaternion().setFromRotationMatrix(
        new T3.Matrix4().makeBasis(arc.e1, arc.e2, arc.nrm));
      return { c: arc.c.clone(), q, phi, r: arc.r, sweep, dir };
    }
    /* Plane turns by slerp, centre by a straight lerp, and the needle travels the
       short way round its own circle. */
    function mixPose(A, B, t, mono) {
      let d = B.phi - A.phi;
      /* `mono` keeps the needle turning the way it was already going, so a transfer
         is a continuation of the same rotation rather than a wobble the short way
         round. A swing of more than half a turn still takes the short way, since
         that is what the eye expects. */
      if (!mono || Math.abs(d) > PI) {
        while (d > PI) d -= 2 * PI;
        while (d < -PI) d += 2 * PI;
      }
      return {
        c: A.c.clone().lerp(B.c, t),
        q: A.q.clone().slerp(B.q, t),
        phi: A.phi + d * t,
        r: A.r, sweep: A.sweep, dir: t < 0.5 ? A.dir : B.dir
      };
    }
    /* the needle's own curve in world space, back end first */
    function posePts(st, n) {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const a = st.phi + st.dir * st.sweep * (i / n);
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
        needleTorus.geometry = needleGeo(r, sweep, 0.25);
      }
      needleG.position.copy(st.c);
      needleG.quaternion.copy(st.q);
      needleInner.rotation.z = st.phi;
      /* the profile always runs swage-to-point along +sweep; a negative direction
         simply mirrors that span onto the other side of the circle */
      needleInner.scale.set(1, st.dir, 1);
      needleG.scale.setScalar(Math.max(0.02, vis));
      needleG.updateMatrixWorld(true);
      /* is any of the drawn part of the needle actually through the tissue? this
         drives the automatic camera below */
      const pAt = a => new V3(r * Math.cos(a), r * Math.sin(a), 0).applyQuaternion(st.q).add(st.c);
      const a0 = st.phi, a1 = st.phi + st.dir * sweep;
      let inside = 0;
      for (let i = 0; i <= 7; i++) if (inTissue(pAt(a0 + (a1 - a0) * (i / 7)))) inside++;
      needleInside = sweep > 0.08 && inside >= 2;
      return true;
    }
    function placeNeedle(arc, prog, vis, rest) {
      lastArc = arc;
      const st = needlePose(arc, prog);
      if (!drawPose(st, vis)) return;
      /* while the needle is only resting between passes no hand is on it */
      placeHolder(posePts(st, 20), rest ? 0 : vis, false);
    }
    /* Between two bites the needle is carried across the wound and turned over, with
       the hand still on it, from the pose the last bite left it in to the pose the
       next bite starts from. */
    function turnNeedle(from, to, t, vis, mono, frac) {
      const st = mixPose(from, to, t, mono);
      if (!drawPose(st, vis)) return;
      if (frac != null) placeHolderFrac(st, frac, vis);
      else placeHolder(posePts(st, 20), vis, true);
    }
    /* The continuous program's bite: the needle travels at one angular speed and the
       hand walks back along it towards the point as the bite is drawn. */
    function placeNeedleCont(arc, prog, vis) {
      lastArc = arc;
      const st = needlePose(arc, prog);
      if (!drawPose(st, vis)) return;
      /* the reference grips the needle at 0.3 of its length while it is driven, and
         slides the hand back to the heel (0.78) to clear it and turn it */
      const g = motionMode === 'md'
        ? 0.3 + 0.06 * clamp(prog, 0, 1)
        : lerp(0.15, 0.5, clamp(prog, 0, 1));
      placeHolderFrac(st, g, vis);
    }
    /* how far the needle must turn after the exit before its whole body is out of
       the tissue: the bite ends at phi = delta, the swage is one needle-length behind */
    function mdClearProg(A) {
      const d = Math.max(0.2, Math.abs(A.delta));
      return 1 + Math.min(1.55, d) / d;
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
    /* ---- the ring's cut ---- */
    /* A plane through the ring centre and the bite's radial direction cuts the wall
       exactly where the stitch passes through it; the camera then looks along the
       tangent, straight at the cut face. That is the ring's equivalent of the line
       wound's cross-section: the wall in profile, with the bite crossing it. */
    let ringCutArc = null;
    /* The line wound's cut can slide along the wound, so it passes through the bite
       being worked. Without that a bite taken off the plane - a Cushing limb at
       z = -10 - sits behind the tissue and is drawn through it, which reads as a
       needle outside the skin. */
    let cutZ = 0;
    function ringCutAz(A) { return Math.atan2((A.a.x + A.b.x) / 2, (A.a.z + A.b.z) / 2); }
    function setRingPlane(A) {
      const az = ringCutAz(A);
      clipPlane.normal.set(-Math.cos(az), 0, Math.sin(az));
      clipPlane.constant = 0;
      return az;
    }
    function placeRingCaps(A) {
      const m0 = meshes[0];
      if (!m0 || !m0.caps || !A) return;
      const az = ringCutAz(A);
      m0.caps.forEach(c => {
        c.g.rotation.y = az - PI / 2 + (c.sg < 0 ? PI : 0);
        c.g.visible = !!S.clip;
        c.a.visible = c.b.visible = c.c.visible = !!S.clip;
      });
    }
    function frameFor(name) {
      const P = PRE[name] || PRE['3d'];
      const g = { az: P.az, el: P.el, d: P.d };
      const R = tissue.type === 'round';
      if (name === 'knot') {
        g.tx = K.x; g.ty = K.y + 1.2; g.tz = K.z; g.d = R ? 26 : 20;
      } else if (name === 'section') {
        g.tx = 0; g.ty = -tissue.T * 0.5; g.tz = R ? 0 : cutZ; g.d = R ? 51 : 38;
        /* On the ring the wound is a circle, so the fixed cut plane misses every
           bite. Frame the section radially at the first bite instead: the camera
           sits outside the ring looking in along the radius, so the wall is seen in
           profile and the needle crosses it the way it crosses the line wound. */
        if (R && arcs.length) {
          const A = ringCutArc || arcs[0];
          const az = ringCutAz(A);
          g.az = az * 180 / PI + 90;   /* along the tangent, square to the cut face */
          g.el = 78;
          g.d = 32;                    /* close on the cut face at the bite */
          g.tx = (A.a.x + A.b.x) / 2; g.tz = (A.a.z + A.b.z) / 2;
          g.ty = -tissue.T * 0.1;
        }
      } else if (name === 'top') {
        g.tx = 0; g.ty = -0.4; g.tz = 0; g.d = R ? 74 : 68;
      } else {
        g.tx = 0; g.ty = -tissue.T * 0.10; g.tz = 0; g.d = R ? 64 : 58;
      }
      /* A thinner species is framed closer and a thicker one further back, so the
         whole stack stays in shot when the preset changes its depth. */
      if (!R) {
        const tot = tissue.layers.reduce((s, L) => s + L.t, 0);
        g.d *= Math.max(0.74, Math.min(1.6, tot / 14));
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
    function hud(n) {
      const el = opts.hud; if (!el) return;
      const sp = species();
      el.textContent = (HUD[n] || '') + (sp.id === 'dog' ? '' : ' · ' + sp.name) +
        (motionMode === 'md' ? ' · markdown movement + simulated thread'
          : continuous ? ' · after: movement set + simulated thread' : ' · before: arc model + drawn thread');
    }
    /* The layers are drawn at partial opacity so the ones under the surface show
       through: the tissue reads as stacked strata instead of one solid block. */
    const TISSUE_OP = 0.42;
    function applyViewFlags() {
      const see = !!S.seeThrough;
      const op = see ? TISSUE_OP : 1;
      /* keep the cut plane in step with the tissue: the line wound cuts across the
         wound, the ring cuts through the bite */
      if (tissue.type === 'linear') {
        clipPlane.normal.set(0, 0, -1);
        clipPlane.constant = cutZ + 0.02;
      } else if (arcs.length) {
        const A = ringCutArc || arcs[0];
        ringCutArc = A;
        setRingPlane(A);
        placeRingCaps(A);
      }
      const tint = (mm, o) => {
        mm.transparent = o < 1;
        mm.opacity = o;
        mm.depthWrite = o >= 1;
        mm.needsUpdate = true;
      };
      meshes.forEach(m => {
        if (m.round) {
          /* the lathe is cut by the same plane as the line wound's slabs */
          m.m.material.clippingPlanes = S.clip ? [clipPlane] : [];
          m.ring.material.clippingPlanes = S.clip ? [clipPlane] : [];
          m.muc.material.clippingPlanes = S.clip ? [clipPlane] : [];
          m.m.material.color.copy(see ? m.m.userData.see : m.m.userData.base);
          m.ring.material.color.copy(see ? m.ring.userData.see : m.ring.userData.base);
          m.muc.material.color.copy(see ? m.muc.userData.see : m.muc.userData.base);
          m.m.material.needsUpdate = true; m.ring.material.needsUpdate = true; m.muc.material.needsUpdate = true;
          tint(m.m.material, op);
          tint(m.ring.material, see ? 0.6 : 1);
          tint(m.muc.material, see ? 0.55 : 1);
          if (m.capSkin) {
            const c = see ? m.capSkin.userData.see : m.capSkin.userData.base;
            m.capSkin.color.copy(c); m.capSkin.emissive.copy(c);
            m.capSkin.needsUpdate = true;
          }
          if (m.capMus) {
            const c = see ? m.capMus.userData.see : m.capMus.userData.base;
            m.capMus.color.copy(c); m.capMus.emissive.copy(c);
            m.capMus.needsUpdate = true;
          }
          if (m.capMuc) {
            const c = see ? m.capMuc.userData.see : m.capMuc.userData.base;
            m.capMuc.color.copy(c); m.capMuc.emissive.copy(c);
            m.capMuc.needsUpdate = true;
          }
          return;
        }
        m.cap.visible = S.clip;
        m.cap.position.z = cutZ;
        m.m.material.clippingPlanes = S.clip ? [clipPlane] : [];
        m.m.material.needsUpdate = true;
        /* See-through gets its own pale palette - pink, cream, olive, rose - so the
           layers stay distinct strata as they stack up instead of all darkening
           into the same red. The cut face uses the same colour, opaque, so the
           cross-section reads crisp. */
        if (m.m.userData.base) {
          m.m.material.color.copy(see ? m.m.userData.see : m.m.userData.base);
          if (m.cap && m.cap.material) {
            m.cap.material.color.copy(see ? m.m.userData.see : m.m.userData.base);
            m.cap.material.needsUpdate = true;
          }
        }
        tint(m.m.material, op);
        /* the layer outlines carry the see-through picture: without a firm edge the
           translucent slabs melt into one another */
        if (m.out) { m.out.material.opacity = see ? 0.92 : 0.3; m.out.material.needsUpdate = true; }
        /* The stubble decal is built with the cut plane attached, so it has to be
           released with the slabs: otherwise it stays sliced at cutZ and the part
           of the surface in front of the cut loses its texture entirely. */
        if (m.skin) {
          m.skin.material.clippingPlanes = S.clip ? [clipPlane] : [];
          m.skin.material.needsUpdate = true;
        }
      });
    }
    /* See-through tissue is blended with depth writing off, so the slabs are painted
       strictly back to front. Their centres are mirrored across x, which means the
       half that is nearer flips as the camera orbits, and equal sort distances fall
       back to creation order (left first, always). Order them from the camera every
       frame instead, so both halves blend the same way from any angle. */
    const _ordV = new T3.Vector3();
    function orderTissue() {
      if (!S.seeThrough || tissue.type !== 'linear') return;
      const list = meshes.filter(m => !m.round);
      list.forEach(m => {
        const sg = m.side === 'L' ? -1 : 1;
        _ordV.set(sg * (cur.edge + tissue.span * 0.5), (m.d0 + m.d1) * 0.5, 0);
        m._d = _ordV.distanceTo(camera.position);
      });
      list.sort((a, b) => b._d - a._d);
      list.forEach((m, n) => {
        m.m.renderOrder = n;
        if (m.out) m.out.renderOrder = n;
        if (m.skin) m.skin.renderOrder = 100;
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
      let st = { p: 0, q: 0, k: 0, c: 0 }, done = 0, lastPi = -1;
      tech.steps.forEach((s, i) => {
        const o = {
          i, title: s.t, body: s.b, cam: s.cam || '3d', marks: s.marks || [],
          rows: !!s.rows, lock: s.lock == null ? -1 : s.lock,
          knot: !!s.knot, cut: !!s.cut,
          kind: s.pass != null ? 'pass' : 'cine', pi: s.pass == null ? -1 : s.pass,
          /* a step may run a run of bites in sequence (`passEnd`), which is how a
             continuous line or a ring is shown as one unbroken movement */
          passTo: s.pass == null ? -1 : (s.passEnd == null ? s.pass : s.passEnd),
          doneBefore: done, leadT: 0,
          f0: s.f0 == null ? 0 : s.f0, f1: s.f1 == null ? 1 : s.f1
        };
        const from = Object.assign({}, st);
        let dur = s.dur;
        if (o.kind === 'pass') {
          const a = arcs[o.pi];
          const nb = Math.max(1, o.passTo - o.pi + 1);
          /* The reference runs the needle at a single angular speed, so a step lasts
             as long as the sweep it covers. The arc model keeps its own hand-timed
             durations. */
          if (motionMode === 'md') {
            /* markdown movement: every stage lasts as long as the angle it sweeps
               (constant angular speed), and each bite is preceded by a fixed beat in
               which the needle clears the skin and is turned to the next entry */
            /* a bite that ends the arc is carried on past the exit until the whole
               needle is out of the skin, so it clears before anything else happens */
            if (a && o.f1 >= 0.999) o.f1 = mdClearProg(a);
            const per = Math.max(0.4, Math.abs(a ? a.delta : 1.2) * (o.f1 - o.f0) / MD_OMEGA);
            /* only the first stage of a bite gets the clear-and-turn beat: the
               stages of one bite run into each other at the same angular speed */
            o.leadT = o.pi !== lastPi ? MD_LEAD : 0;
            dur = per * nb + o.leadT;
          } else {
            if (!dur) dur = continuous
              ? Math.max(0.7, Math.abs(a ? a.delta : 1.6) * (o.f1 - o.f0) / 0.6)
              : Math.max(1.2, ((a ? a.len : 9) * (o.f1 - o.f0)) / 12 + 0.55);
            dur *= nb;
          }
        } else if (!dur) dur = 3.2;
        if (o.kind === 'pass') lastPi = o.pi;
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
        if (o.kind === 'pass' && o.f1 >= 0.999) done = o.passTo + 1;
        steps.push(o);
      });
      /* The needle stays in view between passes - it is put down, regripped and
         picked up again, it does not vanish and reappear somewhere else. It goes
         away after the step that follows the last pass. */
      let first = -1, last = -1;
      steps.forEach((s, i) => { if (s.pi >= 0) { if (first < 0) first = i; last = i; } });
      steps.forEach((s, i) => {
        s.needleOn = first >= 0 && i >= Math.max(0, first - 1) && i <= Math.min(steps.length - 1, last + 1);
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
      /* markdown movement holds the needle still while it clears the skin and turns
         to the next entry, then sweeps the bite at the constant angular speed */
      const leadT = s.leadT || 0;
      const lEff = leadT > 0
        ? clamp((t - s.t0 - leadT) / Math.max(0.001, (s.t1 - s.t0) - leadT), 0, 1)
        : l;
      const e = s.kind === 'pass' ? lEff : ss(l);
      const st = {
        p: lerp(s.from.p, s.to.p, e), q: lerp(s.from.q, s.to.q, e),
        k: lerp(s.from.k, s.to.k, e), c: lerp(s.from.c, s.to.c, e)
      };
      const pEnd = s.kind === 'pass' ? s.passTo : -1;
      const nArc = Math.max(1, pEnd - s.pi + 1);
      const prog = [];
      for (let j = 0; j < arcs.length; j++) {
        if (j < s.doneBefore) prog[j] = 1;
        else if (s.kind === 'pass' && j >= s.pi && j <= pEnd) {
          /* one bite after another inside a single step */
          const lj = nArc === 1 ? lEff : clamp(lEff * nArc - (j - s.pi), 0, 1);
          prog[j] = continuous ? lerp(s.f0, s.f1, lj) : passProg(s.f0, s.f1, lj);
        }
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

    /* ---------- species presets ---------- */
    let speciesId = (new URLSearchParams(location.search).get('species') || 'dog').toLowerCase();
    function species() {
      const all = window.SUTURE.SPECIES || [];
      return all.find(s => s.id === speciesId) || all[0] || { id: 'dog', name: 'Dog', thick: 1, tension: 1, bite: 1 };
    }
    /* Rebuild a technique for a species: the layer stack thickens or thins, the wound
       edges sit further apart or closer, and every bite moves in or out from the edge
       by the same factor - which is what turns "3 mm in a cat, 5 mm in a dog" into
       something you can see against the ruler in the wound. */
    function scaleTech(base, sp) {
      if (sp.bite === 1 && sp.thick === 1 && sp.tension === 1) return base;
      const k = sp.bite, c = Object.assign({}, base);
      const t = base.tissue;
      if (t.type === 'linear') {
        c.tissue = Object.assign({}, t);
        c.tissue.layers = t.layers.map(L => Object.assign({}, L, { t: +(L.t * sp.thick).toFixed(2) }));
        c.tissue.T = +c.tissue.layers.reduce((s, L) => s + L.t, 0).toFixed(2);
        c.tissue.notch = +(t.notch * sp.thick).toFixed(2);
        c.tissue.edge = p => t.edge(p) * sp.tension;
      }
      /* The ring tissue carries its bites as angles and a sag, with no a/b points
         and no knot or tail in the data, so only scale what a technique actually has. */
      const sc = arr => [ +(arr[0] * k).toFixed(2), +(arr[1] * k).toFixed(2), arr[2] ];
      c.passes = base.passes.map(ps => {
        const o = Object.assign({}, ps);
        if (ps.a) o.a = sc(ps.a);
        if (ps.b) o.b = sc(ps.b);
        if (ps.sag != null) o.sag = +(ps.sag * k).toFixed(2);
        return o;
      });
      if (base.knot) c.knot = [base.knot[0], +(base.knot[1] * k).toFixed(2), base.knot[2], base.knot[3]];
      if (base.tailU != null) c.tailU = +(base.tailU * k).toFixed(2);
      if (base.endU != null) c.endU = +(base.endU * k).toFixed(2);
      c.steps = base.steps.map(s => s.marks ? Object.assign({}, s, {
        marks: s.marks.map(mk => Array.isArray(mk.at)
          ? Object.assign({}, mk, { at: [mk.at[0], +(mk.at[1] * k).toFixed(2), +(mk.at[2] * k).toFixed(2), mk.at[3]] })
          : mk)
      }) : s);
      return c;
    }

    /* ---------- public: load ---------- */
    function load(id) {
      const base = window.SUTURE.TECHNIQUES.find(t => t.id === id) || window.SUTURE.TECHNIQUES[0];
      tech = scaleTech(base, species());
      tissue = tech.tissue;
      continuous = motionMode === 'continuous' || motionMode === 'md';
      S.t = 0; S.playing = !reduced; S.auto = true; S.rows = false; S.lock = -1;
      curStep = -1; lastKey = ''; lastP = -1;
      SIM.init = false; SIM.p = []; SIM.v = []; SIM.L = 0;
      wantView = ''; wantAt = 0; holdArc = null; holdProg = 0; holderVis = 0; holderT = 0;
      holderPos = null; holderQuat = null; scisVis = 0; scisT = 0; approachLift.set(0, 0, 0);
      makeMeshes();
      buildGeometry(0);
      buildKnots();
      buildGhostRows();
      compile();
      /* the needle is in the hand before the first bite, so the opening steps have a
         pose to draw */
      if (arcs.length) holdArc = arcs[0];
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
      /* The simulated cord moves every frame, so it is stepped even when the pose has
         not changed; the drawn cord only needs rebuilding when the pose does. */
      const route = threadPoints(E.st, E.prog);
      endPts = route;
      if (SIM.on) {
        simStep(route, dt);
        setThread(SIM.p);
      } else if (key !== lastKey) {
        setThread(route);
      }
      lastKey = key;
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
      const pEnd = E.s.kind === 'pass' ? E.s.passTo : -1;
      const nArc = Math.max(1, pEnd - pi + 1);
      /* which bite of a multi-bite step the needle is on right now */
      let actPi = pi;
      if (pi >= 0) {
        actPi = pEnd;
        for (let k = pi; k <= pEnd; k++) if ((E.prog[k] || 0) < 0.999) { actPi = k; break; }
      }
      /* The ring's cut is framed on one bite, so it has to move to the bite being
         worked when the next one starts. */
      if (tissue.type === 'round' && S.auto && S.view === 'section' && !continuous) {
        const A = pi >= 0 ? arcs[actPi] : (lastArc || arcs[0]);
        if (A && A !== ringCutArc) { ringCutArc = A; setView('section', false, true); }
      }
      /* The line wound's cut follows the bite too, so a Cushing or mattress limb
         taken away from z = 0 is cut through instead of hidden behind the tissue. */
      if (tissue.type === 'linear' && S.clip && pi >= 0) {
        const A = arcs[actPi];
        if (A) {
          const z = (A.a.z + A.b.z) / 2;
          if (Math.abs(z - cutZ) > 0.01) { cutZ = z; setView('section', false, true); }
        }
      }
      /* the scissors belong to the knotting beats only: anywhere else they are put
         away, whether or not the needle branch is running this frame */
      if (!E.s.knot) placeScissors(0, E.l, 0);
      if (pi >= 0) { holdArc = arcs[actPi]; holdProg = E.prog[actPi] || 0; }
      if (pi >= 0) {
        /* One pass step straight after another, with no resting step between them:
           the needle has to get from the pose the last bite ended in to the pose this
           bite starts from, so the turn is folded into the top of the bite. It turns
           while the bite is still easing in, and is in place before the tip is far
           under the skin. */
        /* the transfer the needle has to make is from the last bite it finished:
           the one before this step, or the previous bite inside the same step */
        const before = steps[E.i - 1];
        const lArc = nArc === 1 ? E.l : clamp(E.l * nArc - (actPi - pi), 0, 1);
        const durArc = (E.s.t1 - E.s.t0) / nArc;
        const prevPi = actPi > pi ? actPi - 1 : (before && before.pi >= 0 ? before.pi : -1);
        const prevProg = actPi > pi ? 1 : (before ? before.f1 : 0);
        /* On the ring every bite is short, so the needle needs a longer, visible
           readjustment between one bite and the next: it is drawn out, turned over
           the tissue and brought back down on the far mark. */
        const turnS = tissue.type === 'round'
          ? Math.min(1.1, Math.max(0.6, durArc * 0.6))
          : Math.min(0.55, Math.max(0.3, durArc * 0.3));
        const u = prevPi >= 0 && prevPi !== actPi
          ? clamp(lArc * durArc / turnS, 0, 1) : 1;
        let placed = false;
        if (motionMode === 'md' && prevPi >= 0 && prevPi !== actPi) {
          /* The reference clears the needle before it turns to the next bite: it keeps
             rotating on the same arc until the swage has left the skin, then swings
             over to the next entry while the hand slides back down to the grip. */
          const leadT = E.s.leadT || MD_LEAD;
          const tt = lArc * durArc;
          const A0 = arcs[prevPi];
          const fromP = needlePose(A0, prevProg);
          const clearP = mdClearProg(A0);
          const cpd = Math.max(prevProg, clearP);
          const spot = needlePose(A0, cpd);
          const toP = needlePose(holdArc, holdProg);
          const needClear = cpd - prevProg > 0.02;
          const cT = needClear ? leadT * 0.55 : 0;
          if (tt < cT) {
            const uu = ss(tt / Math.max(0.001, cT));
            turnNeedle(fromP, spot, uu, 1, true, lerp(0.3, 0.78, uu));
            placed = true;
          } else if (tt < leadT) {
            const uu = ss((tt - cT) / Math.max(0.001, leadT - cT));
            turnNeedle(spot, toP, uu, 1, true, lerp(0.78, 0.3, uu));
            placed = true;
          }
        }
        if (!placed) {
          if (u < 1 && motionMode !== 'md') turnNeedle(needlePose(arcs[prevPi], prevProg), needlePose(holdArc, holdProg), ss(u), 1,
            continuous, continuous ? lerp(0.5, 0.15, ss(u)) : null);
          else if (continuous) placeNeedleCont(holdArc, holdProg, 1);
          else placeNeedle(holdArc, holdProg, 1, false);
        }
      }
      else if (E.s.needleOn && holdArc) {
        const prev = passStepNear(E.i, -1), next = passStepNear(E.i, 1);
        if (E.s.regrip && prev && next) {
          /* a beat between the two bites: turn the needle from where the first bite
             left it to where the second bite starts, rather than letting it snap at
             the step boundary. In continuous motion this is the transfer stage: the
             rotation carries on the way it was going and the hand slides back down
             the needle to reload it. */
          if (continuous) turnNeedle(needlePose(arcs[prev.pi], prev.f1), needlePose(arcs[next.pi], next.f0), ss(E.l), 1, true, lerp(0.5, 0.15, ss(E.l)));
          else turnNeedle(needlePose(arcs[prev.pi], prev.f1), needlePose(arcs[next.pi], next.f0), ss(E.l), 1);
        } else if (!next && prev) {
          /* The stitch is finished and the needle is out of the tissue: the hand keeps
             hold of it while the ends are drawn up, and lets go when the knotting
             starts. */
          placeNeedle(holdArc, holdProg, 1, false);
        } else if (!prev) {
          /* The stitch opens with the instrument bringing the needle down out of the
             field onto the entry point, already threaded, instead of the needle
             waiting in the wound for the first step. */
          const st = needlePose(holdArc, holdProg);
          const u = ss(clamp((E.l * (E.s.t1 - E.s.t0)) / 1.1, 0, 1));
          st.c.y += 13 * (1 - u);
          st.c.z += 5 * (1 - u);
          approachLift.set(0, 13 * (1 - u), 5 * (1 - u));
          if (drawPose(st, 1)) placeHolder(posePts(st, 20), 1, false);
        } else placeNeedle(holdArc, holdProg, 1, true);
      } else { needleG && (needleG.visible = false); knotInstruments(E, false); }
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
      orderTissue();
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
      get motion() { return continuous ? 'continuous' : 'arc'; },
      get motionMode() { return motionMode; },
      get species() { return speciesId; },
      setSpecies(id) {
        speciesId = id;
        if (tech) load(tech.id);
        return speciesId;
      },
      /* before/after: rebuild the same technique on the other movement model */
      setMotion(mode) {
        motionMode = mode === 'md' ? 'md' : (mode === 'continuous' ? 'continuous' : 'arc');
        SIM.on = motionMode !== 'arc';
        SIM.init = false;
        const id = tech ? tech.id : null;
        if (id) load(id);
        return motionMode;
      },
      get currentStep() { return curStep; },
      play() { if (S.t >= total - .01) S.t = 0; S.playing = true; },
      pause() { S.playing = false; },
      toggle() { if (S.playing) S.playing = false; else { if (S.t >= total - .01) S.t = 0; S.playing = true; } },
      seek(t) {
        S.t = clamp(t, 0, total); S.playing = false; holderPos = null;
        /* the chain is stateful: after a seek it is rebuilt on the path and relaxed,
           so it is at rest on the first frame rather than snapping into place */
        SIM.init = false;
      },
      get threadModel() { return SIM.on ? 'sim' : 'drawn'; },
      setThreadModel(m) {
        SIM.on = m === 'sim';
        SIM.init = false;
        return SIM.on ? 'sim' : 'drawn';
      },
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
    function offPlane(a) {
      /* the ring's section is framed along its own bite, so it is never off-plane */
      if (tissue.type === 'round') return false;
      return !!a && (Math.abs(a.a.z) > 1.6 || Math.abs(a.b.z) > 1.6);
    }
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
