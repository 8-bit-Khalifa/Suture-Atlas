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
    /* Phones and tablets (a touch screen as the main pointer) get a lighter picture:
       a little less pixel density, which their dense screens hide, and cheaper shadows. */
    const LITE = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1.5 : 2));
    renderer.localClippingEnabled = true;
    /* Soft shadows: instruments throw a real shadow across the wound, which is most
       of what makes them read as solid objects lying on the tissue. */
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = LITE ? T3.PCFShadowMap : T3.PCFSoftShadowMap;
    host.insertBefore(renderer.domElement, host.firstChild);

    const scene = new T3.Scene();
    scene.background = new T3.Color(0x141918);
    const camera = new T3.PerspectiveCamera(34, 1.6, 0.1, 900);
    renderer.toneMapping = T3.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.94;
    scene.add(new T3.HemisphereLight(0xf2ece2, 0x2a2420, 0.34));
    const key = new T3.DirectionalLight(0xfff1de, 0.62); key.position.set(24, 40, 26); scene.add(key);
    key.castShadow = true;
    key.shadow.mapSize.set(LITE ? 512 : 1024, LITE ? 512 : 1024);
    key.shadow.camera.left = -46; key.shadow.camera.right = 46;
    key.shadow.camera.top = 46; key.shadow.camera.bottom = -46;
    key.shadow.camera.near = 4; key.shadow.camera.far = 140;
    key.shadow.bias = -0.0006;
    key.shadow.radius = 3;
    const rim = new T3.DirectionalLight(0xb9cbe0, 0.26); rim.position.set(-28, 14, -22); scene.add(rim);
    const fill = new T3.DirectionalLight(0xffffff, 0.18); fill.position.set(-16, 24, 30); scene.add(fill);

    /* A studio environment, generated rather than loaded: three softboxes over a
       graded dome. Without an environment map every metal surface renders as flat
       grey; with it the needle, the driver and the scissors pick up highlights that
       shift as the camera moves. */
    function studioEnv() {
      const s = new T3.Scene();
      const c = document.createElement('canvas');
      c.width = 8; c.height = 128;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, '#dfe7ec');
      g.addColorStop(0.42, '#94a0a6');
      g.addColorStop(1, '#23282a');
      x.fillStyle = g; x.fillRect(0, 0, 8, 128);
      const tex = new T3.CanvasTexture(c);
      s.add(new T3.Mesh(new T3.SphereGeometry(70, 18, 12),
        new T3.MeshBasicMaterial({ map: tex, side: T3.BackSide })));
      [[-32, 28, 20, 0xffffff, 30, 20], [26, 34, -12, 0xdce8f2, 20, 24], [0, 10, 44, 0xffe8cf, 34, 14]]
        .forEach(([px, py, pz, col, w, h]) => {
          const p = new T3.Mesh(new T3.PlaneGeometry(w, h), new T3.MeshBasicMaterial({ color: col }));
          p.position.set(px, py, pz);
          p.lookAt(0, 0, 0);
          s.add(p);
        });
      const pm = new T3.PMREMGenerator(renderer);
      const env = pm.fromScene(s, 0.035).texture;
      pm.dispose();
      s.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      return env;
    }
    scene.environment = studioEnv();

    /* texture caches, declared before the materials that ask for them */
    let braidTex = null;
    const clipPlane = new T3.Plane(new V3(0, 0, -1), 0.02);
    const tissueG = new T3.Group(); scene.add(tissueG);
    const threadMat = new T3.MeshStandardMaterial({
      color: 0xffffff, map: makeBraidTex(), bumpMap: makeBraidTex(), bumpScale: 0.03,
      roughness: .48, metalness: .05, emissive: 0x0a2a7a, emissiveIntensity: .1
    });
    /* Brushed steel: with an environment map in the scene a metal surface reflects it,
       so the needle and the driver read as polished steel rather than flat grey. */
    const steel = new T3.MeshStandardMaterial({
      color: 0xc3cfda, metalness: .82, roughness: .24, envMapIntensity: 1.15,
      emissive: 0x121a21, emissiveIntensity: .22, side: T3.DoubleSide
    });
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
    let tech = null, tissue = null, steps = [], total = 0, arcs = [], meshes = [], cur = null;
    let K = new V3(), tailStart = new V3(), tailEnd = new V3();
    let needleG = null, needleInner = null, needleTorus = null;
    let lastArc = null, needleInside = false, wantView = '', wantAt = 0;
    let holdArc = null, holdProg = 0;
    let lastKey = '', lastP = -1, curStep = -1, lockRings = [], endPts = null;

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
              color: new T3.Color(L.c).offsetHSL(0, 0.09, -0.01), roughness: .94, metalness: 0,
              side: T3.DoubleSide, envMapIntensity: 0.12, clippingPlanes: [clipPlane]
            });
            /* a little of the layer's own colour as emission: living tissue scatters
               light, so its shadowed side is warm and not black */
            mat.emissive = new T3.Color(L.c).multiplyScalar(0.05);
            mat.emissiveIntensity = 1;
            if (li === 0) {
              mat.map = makeSkinTex();
              mat.bumpMap = mat.map;
              mat.bumpScale = 0.09;
            }
            /* the cut face carries its own light: it is a diagram of the layers, and
               a cut surface lit only by the key light goes grey in the crevice */
            const capMat = new T3.MeshStandardMaterial({
              color: new T3.Color(L.c).offsetHSL(0, 0.1, -0.02), roughness: .95,
              side: T3.DoubleSide, envMapIntensity: 0.1, clippingPlanes: [clipPlane]
            });
            capMat.emissive = new T3.Color(L.c).multiplyScalar(0.16);
            capMat.emissiveIntensity = 1;
            const m = new T3.Mesh(new T3.BufferGeometry(), mat);
            m.castShadow = true; m.receiveShadow = true;
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
                opacity: 0.55, side: T3.DoubleSide, clippingPlanes: [clipPlane]
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
          const mm = new T3.MeshStandardMaterial({ color: tissue.layers[i].c, roughness: .95, metalness: 0, envMapIntensity: 0.12, side: T3.DoubleSide });
          mm.emissive = new T3.Color(tissue.layers[i].c).multiplyScalar(0.05);
          mm.emissiveIntensity = 1;
          const o = new T3.Mesh(new T3.BufferGeometry(), mm);
          o.castShadow = true; o.receiveShadow = true;
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
    /* Braided suture: a two-strand twist drawn once and tiled along the thread. The
       uv of the thread tube runs along its length, so the braid follows the curve. */
    function makeBraidTex() {
      if (braidTex) return braidTex;
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = '#2f6df6'; x.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 8; i++) {
        const y = i * 8;
        x.strokeStyle = i % 2 ? 'rgba(190,215,255,.62)' : 'rgba(12,40,120,.62)';
        x.lineWidth = 3.4;
        x.beginPath(); x.moveTo(0, y); x.lineTo(64, y + 10); x.stroke();
        x.beginPath(); x.moveTo(0, y + 8); x.lineTo(64, y + 18); x.stroke();
      }
      braidTex = new T3.CanvasTexture(c);
      braidTex.wrapS = braidTex.wrapT = T3.RepeatWrapping;
      braidTex.anisotropy = 4;
      return braidTex;
    }
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
    function stubbleGeo(sg, N, hz, from) {
      const pos = [], uv = [], idx = [];
      const u0 = from || 0;
      for (let i = 0; i <= N; i++) {
        const u = lerp(u0, tissue.span, i / N);
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
        /* The wound lip. A cut edge is not a knife edge: the top layer rolls over
           into the wall. It is rounded on the layer's own profile, in the (u, d)
           plane the whole block is built from, so the lip is solid tissue and the
           clip plane still cuts a solid section - a separate bead along the edge
           would be a closed tube and open up hollow when the section cut it. */
        const wallSlope = Math.min(cur.edge, notch) / notch;   /* |du/dd| of the wall */
        const lipArm = Math.hypot(wallSlope, 1);
        const lipDepth = Math.min(0.62 / lipArm, tissue.layers[0].t * 0.85);
        const lipFace = lipDepth * lipArm;                     /* where it leaves the surface */
        meshes.forEach(m => {
          const poly = [];
          const sg = m.side === 'L' ? -1 : 1;
          /* The wound wall leans in with depth and meets its twin below `notch`, so
             the cut reads as a V rather than a slot and the layers stack up the
             slanted face. `uIn(d)` is that wall's distance from the edge at depth d. */
          const uIn = d => -cur.edge * Math.min(1, d / notch);
          const pt = (u, d) => [sg * (cur.edge + u), yAt(u, d, cur.p)];
          if (m.li === 0) {
            /* from the wall, round the lip onto the surface, then out to the span */
            const bU = -wallSlope * lipDepth;
            const STEP = 6;
            for (let i = 0; i <= STEP; i++) {
              const t = i / STEP, w0 = (1 - t) * (1 - t), w2 = t * t;
              /* the corner is the control point, so the curve leaves the wall and
                 joins the surface tangentially on both sides */
              poly.push(pt(w0 * bU + w2 * lipFace, w0 * lipDepth));
            }
            for (let i = 1; i <= N; i++) poly.push(pt(lerp(lipFace, tissue.span, i / N), m.d0));
          } else {
            for (let i = 0; i <= N; i++) poly.push(pt(lerp(uIn(m.d0), tissue.span, i / N), m.d0));
          }
          for (let i = N; i >= 0; i--) poly.push(pt(lerp(uIn(m.d1), tissue.span, i / N), m.d1));
          m.m.geometry.dispose(); m.m.geometry = extrude(poly, hz);
          m.cap.geometry.dispose(); m.cap.geometry = capGeo(poly);
          m.cap.visible = S.clip;
          if (m.out) { m.out.geometry.dispose(); m.out.geometry = new T3.EdgesGeometry(m.m.geometry, 26); }
          /* the stubble decal starts on the surface past the lip, not over it */
          if (m.skin) { m.skin.geometry.dispose(); m.skin.geometry = stubbleGeo(sg, 48, hz, lipFace); }
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
    function makeArc(a, b, R, bend) {
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
      /* A bite can be told which way to bulge: an intradermal bite swings out into
         the dermis, sideways and a little down, instead of diving under the wound;
         the rest of the needle's circle then stands up in the open wound. */
      if (bend) perp = bend.clone().addScaledVector(u, -bend.dot(u));
      perp.normalize();
      const half = len / 2;
      /* A sag of half the chord is the degenerate case: the chord becomes a
         diameter and the arc can bulge either way, which is how a bite ends up
         above the skin with its swage buried. Keep every arc clearly shallower
         than that. */
      /* One needle is one piece of steel: every bite in a technique lies on a circle
         of the same radius, the needle's own, and the chord comes from the anatomy.
         The sag then follows from that radius instead of being chosen per bite, so a
         narrow bite is a shallow bite of the same needle rather than a different
         needle - and the point is on the circle by construction. */
      const RR = Math.max(R || half * 1.05, half * 1.02);
      const s = Math.max(0.02, RR - Math.sqrt(Math.max(0, RR * RR - half * half)));
      const r = RR;
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
      // passes: the ends first, then one radius for every bite of this needle
      const ends = tech.passes.map((ps, i) => {
        if (tissue.type === 'round') {
          const span = 360 / tech.ring.bites;
          const a0 = 14 + i * span, a1 = a0 + tech.ring.arc;
          return { A: surf('C', a0, 0, 0), B: surf('C', a1, 0, 0) };
        }
        const s2 = ps.toR ? 'R' : ps.toL ? 'L' : ps.side;
        return { A: surf(ps.side, ps.a[0], ps.a[1], ps.a[2]), B: surf(s2, ps.b[0], ps.b[1], ps.b[2]), side: ps.side };
      });
      let widest = 0;
      ends.forEach(e => { widest = Math.max(widest, e.A.distanceTo(e.B)); });
      /* A real curved needle covers roughly 3/8 of a circle, so the chord of a bite is
         a bit shorter than the needle's diameter. One radius for the whole technique
         also means the needle no longer changes size from bite to bite. */
      cur.R = tech.radius || Math.max(2.4, widest * 0.68);
      /* a technique whose bites run in the dermis (intradermal) bends each bite out
         into its own side of the wound */
      const dermal = tech.bitePlane === 'dermal';
      arcs = ends.map(e => makeArc(e.A, e.B, cur.R,
        dermal && e.side ? new V3(e.side === 'L' ? -0.6 : 0.6, -0.8, 0) : null));
      // knot + tails
      if (tissue.type === 'linear') {
        K = surf(tech.knot[0], tech.knot[1], tech.knot[2], tech.knot[3]);
        const first = tech.passes[0], last = tech.passes[tech.passes.length - 1];
        const endSide = last.toL ? 'L' : last.toR ? 'R' : last.side;
        /* the ends lie on the skin, or under it where the knots are buried */
        const tailD = tech.tailD != null ? tech.tailD : -0.8;
        tailStart = surf(first.side, tech.tailU, tailD, first.a[2]);
        tailEnd = surf(endSide, tech.endU, tailD, last.b[2]);
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
      if (CTX.obj && CTX.obj.update) CTX.obj.update(cur);
    }

    /* ---------- lock rings (the continuous interlock) ---------- */
    function buildLocks() {
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
      /* only the points the swage has actually reached: rounding up here drew the
         thread a point ahead of the needle and back again, a spike at the exit */
      const n = Math.floor(clamp(prog, 0, 1) * (arc.pts.length - 1) + 1e-6) + 1;
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
      /* a buried line (intradermal) crosses the wound under the skin, not over it */
      const lift = tech.buried ? -0.25 : Math.min(3.2, 0.3 * dist + 0.85);
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
        /* kept on the skin - unless both ends are buried, as at an intradermal line's
           buried knots, where the strand stays under the skin with them */
        const buried = tech && tech.buried && a.y < 0 && b.y < 0;
        if (cur && tissue.type !== 'round' && !buried) p.y = Math.max(p.y, skinY(p.x, p.z) + 0.2);
        pts.push(p);
      }
      return pts;
    }
    /* The tube is the expensive part of a frame: a fresh CatmullRom and TubeGeometry
       every frame at high segment counts starves the stepping and leaves the cord
       jittering. Points are thinned, the tube is coarse, and a cord that has barely
       moved keeps the geometry it already has. */
    /* A tube with a radius of its own along the strand. A suture is drawn out thinner
       at its free end, and the taper is what makes a pull read as material moving
       rather than a rod sliding. The uv runs along the length, so the braid texture
       follows the thread instead of being projected flat. */
    function taperTube(curve, seg, radial, r0, r1) {
      const pts = curve.getPoints(seg);
      const frames = curve.computeFrenetFrames(seg, false);
      const pos = [], nor = [], uv = [], idx = [];
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const r = lerp(r0, r1, Math.pow(t, 0.85));
        const c = pts[i];
        const k = Math.min(i, seg - 1);
        const n = frames.normals[k], b = frames.binormals[k];
        for (let j = 0; j <= radial; j++) {
          const a = j / radial * PI * 2, ct = Math.cos(a), st = Math.sin(a);
          const nx = ct * n.x + st * b.x, ny = ct * n.y + st * b.y, nz = ct * n.z + st * b.z;
          pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
          nor.push(nx, ny, nz);
          uv.push(t * 9, j / radial);
        }
      }
      for (let i = 0; i < seg; i++) {
        for (let j = 0; j < radial; j++) {
          const a = i * (radial + 1) + j, b2 = a + radial + 1;
          idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
        }
      }
      const g = new T3.BufferGeometry();
      g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new T3.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new T3.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    }
    let threadKey = '';
    /* `fine` keeps every point and samples the tube densely, for the turns of a knot
       a fraction of a millimetre across; the strand is then one thickness all along */
    function setThread(pts, fine) {
      if (pts.length < 2) { thread.visible = false; return; }
      thread.visible = true;
      const thin = [];
      for (let i = 0; i < pts.length; i += fine ? 1 : 2) thin.push(pts[i]);
      if (thin[thin.length - 1] !== pts[pts.length - 1]) thin.push(pts[pts.length - 1]);
      let sig = '';
      const dp = fine ? 2 : 1;
      thin.forEach(q => { sig += q.x.toFixed(dp) + ',' + q.y.toFixed(dp) + ',' + q.z.toFixed(dp) + ';'; });
      if (sig === threadKey) return;
      threadKey = sig;
      const curve = new T3.CatmullRomCurve3(thin, false, 'centripetal');
      const len = curve.getLength();
      const seg = fine ? Math.min(900, Math.max(60, Math.round(len * 9)))
        : Math.min(180, Math.max(16, Math.round(len * 3)));
      const geo = fine ? taperTube(curve, seg, 8, 0.13, 0.13) : taperTube(curve, seg, 6, 0.175, 0.10);
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
      needleTorus.castShadow = true;
      needleInner.add(needleTorus);
      needleG.add(needleInner);
      scene.add(needleG);
    }
    /* The needle holder is built once in world space, so it can be kept clear of
       the tissue instead of being dragged through the skin with the needle. */
    let holderG = null, gridG = null;
    /* A Mayo-Hegar needle holder, built in its own frame: the needle is clamped at
       the origin and runs along local Z, the jaws close on it from either side
       along X, and the instrument runs up +Y to the finger rings. Each half - jaw,
       handle and ring - turns about the box-lock screw, so opening the jaws is a
       real movement of the whole half, the way the instrument is built. */
    const HOLDER_PIVOT = 4.4;
    function makeHolder() {
      const g = new T3.Group();
      const jawMetal = new T3.MeshStandardMaterial({ color: 0xdbe3ea, metalness: .72, roughness: .24, emissive: 0x11181e, emissiveIntensity: .3, envMapIntensity: 1.1 });
      const bodyMetal = new T3.MeshStandardMaterial({ color: 0xa9b3bd, metalness: .62, roughness: .32, emissive: 0x0d1318, emissiveIntensity: .28, envMapIntensity: 1.0 });
      /* gold finger rings: the mark of a tungsten-carbide jaw insert */
      const gold = new T3.MeshStandardMaterial({ color: 0xc9a24c, metalness: .7, roughness: .3, emissive: 0x2a1d05, emissiveIntensity: .35, envMapIntensity: 1.0 });
      const dark = new T3.MeshStandardMaterial({ color: 0x4a535c, metalness: .5, roughness: .55 });
      const P = HOLDER_PIVOT;
      /* the jaw seen side-on: broad at the box lock, short, ending in a blunt
         rounded tip just ahead of the needle */
      const jawShape = new T3.Shape();
      jawShape.moveTo(-0.9, P - 0.2);
      jawShape.lineTo(-0.62, 0.35);
      jawShape.quadraticCurveTo(-0.56, -0.66, 0, -0.82);
      jawShape.quadraticCurveTo(0.56, -0.66, 0.62, 0.35);
      jawShape.lineTo(0.9, P - 0.2);
      jawShape.closePath();
      const jawGeo = new T3.ExtrudeGeometry(jawShape, { depth: 0.62, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 2, curveSegments: 8 });
      /* shape x is the jaw's width, which lies along the needle (local Z); the
         extrusion is its thickness, across the needle (local X) */
      jawGeo.rotateY(PI / 2);
      jawGeo.translate(-0.31, 0, 0);
      /* the cross-hatched grip face, a darker strip on the inside of each jaw */
      const faceGeo = new T3.BoxGeometry(0.04, 2.8, 0.9);
      const halves = [];
      [-1, 1].forEach(s => {
        const h = new T3.Group();
        h.position.y = P;
        h.userData.side = s;
        const add = (m, x, y, z) => { m.position.set(x, y - P, z); m.renderOrder = 14; h.add(m); return m; };
        /* the inside faces stand 0.3 off the centre line, the needle's own half
           thickness at the scale the instrument is drawn */
        add(new T3.Mesh(jawGeo, jawMetal), s * 0.65, 0, 0);
        add(new T3.Mesh(faceGeo, dark), s * 0.255, 0.95, 0);
        /* the handle: a long flat shank, flaring gently out to its ring. Drawn on
           its own side rather than mirrored, so its faces stay the right way out. */
        const sh = new T3.Shape();
        sh.moveTo(s * 0.10, P + 0.7);
        sh.quadraticCurveTo(s * 0.22, P + 7, s * 0.62, 18.7);
        sh.lineTo(s * 1.16, 18.7);
        sh.quadraticCurveTo(s * 0.80, P + 7, s * 0.74, P + 0.7);
        sh.closePath();
        const shGeo = new T3.ExtrudeGeometry(sh, { depth: 0.46, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 10 });
        shGeo.translate(0, 0, -0.23);
        add(new T3.Mesh(shGeo, bodyMetal), 0, 0, 0);
        /* ratchet teeth on the inside of each handle, offset so they interlock */
        for (let k = 0; k < 3; k++) {
          const t = new T3.Mesh(new T3.BoxGeometry(0.36, 0.2, 0.42), bodyMetal);
          add(t, s * 0.44, 15.7 + k * 0.42, s * 0.1);
          t.rotation.z = s * 0.5;
        }
        /* finger ring, slightly oval and set outward of the handle */
        const ring = add(new T3.Mesh(new T3.TorusGeometry(1.55, 0.3, 10, 30), gold), s * 2.0, 19.9, 0);
        ring.scale.set(1.18, 1, 1);
        g.add(h);
        halves.push(h);
      });
      /* the box lock and its screw, the one part that does not move */
      const box = new T3.Mesh(new T3.BoxGeometry(2.4, 1.6, 1.9), bodyMetal);
      box.position.y = P + 0.1; box.renderOrder = 14; g.add(box);
      const screw = new T3.Mesh(new T3.CylinderGeometry(0.46, 0.46, 0.2, 18), jawMetal);
      screw.rotation.x = PI / 2; screw.position.set(0, P + 0.1, 1.0); screw.renderOrder = 15; g.add(screw);
      const slot = new T3.Mesh(new T3.BoxGeometry(0.66, 0.09, 0.08), dark);
      slot.position.set(0, P + 0.1, 1.11); slot.rotation.z = 0.6; slot.renderOrder = 15; g.add(slot);
      g.userData.halves = halves;
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.visible = false;
      scene.add(g);
      return g;
    }
    /* Surgical scissors: two halves crossing on a screw, a tapered blade above the
       pivot and a shank with a finger ring below it. Closing them is a rotation of
       each half about that screw, so a snip is a real movement of the blades. */
    let scissorG = null, scisHalves = [], scisVis = 0, scisLastT = -1;
    function makeScissors() {
      const g = new T3.Group();
      const bladeMat = new T3.MeshStandardMaterial({ color: 0xe6edf4, metalness: .2, roughness: .26, emissive: 0x26323f, emissiveIntensity: .55 });
      const steelMat = new T3.MeshStandardMaterial({ color: 0xb9c2ca, metalness: .2, roughness: .34, emissive: 0x1b232b, emissiveIntensity: .45 });
      const darkMat = new T3.MeshStandardMaterial({ color: 0x39434c, metalness: .2, roughness: .5 });
      /* Straight suture scissors. Each blade is a flat plate with a straight cutting
         edge on the inside and a convex back, broad at the screw and narrowing to
         its tip - one tip sharp, one blunt, as on a Mayo pair. The two blades lie
         one in front of the other and turn about the screw, so a snip is the
         blades really crossing. */
      const BL = 8.2;
      scisHalves = [];
      [-1, 1].forEach(s => {
        const h = new T3.Group();
        const sharp = s > 0;
        const tipW = sharp ? 0.03 : 0.2;
        const shape = new T3.Shape();
        shape.moveTo(-s * 0.5, -0.55);
        shape.lineTo(s * 0.46, -0.55);
        shape.lineTo(s * 0.44, 0.25);
        /* the cutting edge: straight, inside */
        shape.lineTo(s * (tipW + 0.05), BL * 0.93);
        shape.quadraticCurveTo(s * tipW * 0.6, BL, -s * (sharp ? 0.08 : 0.16), BL * 0.985);
        /* the back: a long convex curve down to the screw */
        shape.quadraticCurveTo(-s * 0.52, BL * 0.55, -s * 0.5, -0.55);
        const bladeGeo = new T3.ExtrudeGeometry(shape, {
          depth: 0.26, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10
        });
        bladeGeo.translate(0, 0, -0.13);
        const bl = new T3.Mesh(bladeGeo, bladeMat);
        bl.position.z = s * 0.2;
        bl.renderOrder = 14; h.add(bl);
        /* the shank sweeps out from the screw to its ring, round in section */
        const path = new T3.CatmullRomCurve3([
          new V3(s * 0.05, -0.4, 0), new V3(s * 0.38, -2.4, 0),
          new V3(s * 0.95, -4.7, 0), new V3(s * 1.4, -6.3, 0)
        ]);
        const shank = new T3.Mesh(new T3.TubeGeometry(path, 24, 0.27, 10, false), steelMat);
        shank.position.z = s * 0.2;
        shank.renderOrder = 14; h.add(shank);
        /* finger ring: oval, a little heavier than the shank, canted outward */
        const ring = new T3.Mesh(new T3.TorusGeometry(1.32, 0.27, 10, 30), steelMat);
        ring.position.set(s * 1.72, -7.75, s * 0.2);
        ring.scale.set(1.22, 1, 1);
        ring.rotation.z = s * 0.22;
        ring.renderOrder = 14; h.add(ring);
        h.userData.side = s;
        g.add(h);
        scisHalves.push(h);
      });
      /* the screw: a domed head with its slot in front, a nut behind */
      const head = new T3.Mesh(new T3.SphereGeometry(0.5, 18, 10, 0, PI * 2, 0, PI / 2), steelMat);
      head.rotation.x = PI / 2; head.scale.set(1, 1, 0.55);
      head.position.z = 0.44; head.renderOrder = 15; g.add(head);
      const slot = new T3.Mesh(new T3.BoxGeometry(0.7, 0.1, 0.12), darkMat);
      slot.position.z = 0.68; slot.rotation.z = 0.5; slot.renderOrder = 15; g.add(slot);
      const nut = new T3.Mesh(new T3.CylinderGeometry(0.42, 0.42, 0.16, 16), steelMat);
      nut.rotation.x = PI / 2; nut.position.z = -0.44; nut.renderOrder = 15; g.add(nut);
      g.visible = false;
      scene.add(g);
      return g;
    }
    /* Where the scissors are: `near` runs 0 with the instrument held back below the
       knot to 1 with the blades on the tails. `close` runs 0 open to 1 shut. */
    function placeScissors(vis, near, close) {
      if (!scissorG) scissorG = makeScissors();
      /* same rule as the needle holder: the fade belongs to the timeline, so a paused
         frame is still and a seek does not leave the instrument fading in late */
      const dT = scisLastT < 0 ? 0 : S.t - scisLastT;
      scisLastT = S.t;
      scisVis += ((vis > 0.5 ? 1 : 0) - scisVis) * (Math.abs(dT) > 0.5 ? 1 : Math.min(1, dT * 9));
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
      /* open wide enough to take the tails between the blades, shut flush */
      const spread = lerp(0.2, 0, clamp(close, 0, 1));
      scisHalves.forEach(h => { h.rotation.z = h.userData.side * spread; });
    }
    /* An orientation for the holder from the way its shank points, with the roll
       about the shank fixed (the jaws close across a horizontal line), so a change
       of direction never spins the instrument the short way round. */
    function quatAlong(dir, zHint) {
      const Y = dir.clone().normalize();
      const Z = (zHint ? zHint.clone() : new V3(0, 0, 1)).addScaledVector(Y, -Y.dot(zHint || new V3(0, 0, 1)));
      if (Z.lengthSq() < 1e-4) Z.set(1, 0, 0).addScaledVector(Y, -Y.x);
      Z.normalize();
      const X = new V3().crossVectors(Y, Z).normalize();
      return new T3.Quaternion().setFromRotationMatrix(new T3.Matrix4().makeBasis(X, Y, Z));
    }
    /* The instrument has to read as a needle holder, several times the needle's
       length. The purse-string works on a 27 mm ring, so there it is drawn smaller.
       The size follows the camera's framing, but eases there instead of jumping
       when the view changes. */
    let holderBase = -1, frameDt = 1 / 60;
    function holderScaleTarget() {
      return tissue.type === 'round' ? (S.view === 'section' ? 0.32 : 0.38)
        : (S.view === 'section' ? 0.56 : S.view === 'top' ? 0.6 : 0.82);
    }
    /* Put the holder down exactly as asked: position, orientation, how far the jaws
       are open (0 shut on the needle, 1 open) and how much of it is shown. */
    function setHolderRig(H, factor) {
      if (!holderG) holderG = makeHolder();
      if (!H || !(H.vis > 0.02)) { holderG.visible = false; return; }
      const target = holderScaleTarget();
      holderBase = holderBase < 0 ? target : holderBase + (target - holderBase) * (1 - Math.exp(-frameDt * 4));
      holderG.visible = true;
      holderG.position.copy(H.pos);
      holderG.quaternion.copy(H.quat);
      holderG.userData.halves.forEach(h => { h.rotation.z = h.userData.side * 0.15 * clamp(H.open || 0, 0, 1); });
      /* a pose may fix its own size (the knot's wraps are measured against the jaws) */
      const size = H.scale != null ? H.scale : holderBase * (factor || 1);
      holderG.scale.setScalar(size * clamp(H.vis, 0, 1));
    }
    /* A needle pose: the circle the needle lies on (centre, radius, basis), where its
       back end sits on that circle, and how much of the circle the needle covers.
       Everything that draws the needle is described this way, which is what lets two
       poses be blended - that is how the needle is turned over between two bites
       instead of snapping at the boundary. */
    function needlePose(arc, prog) {
      const delta = arc.delta;
      /* one needle of one curve for every bite of the technique */
      const sweep = needleS > 0 ? needleS : Math.min(1.55, Math.abs(delta));
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
    /* ---------- tissue reaction ----------
       The skin is not a rigid sheet: the point presses a small dimple in at the entry
       and lifts a tent where it comes out, and when the needle lets go the tent
       springs back. Two small meshes carry this, driven by two springs so the recoil
       overshoots instead of snapping flat. */
    let reactG = null, dimpleM = null, tentM = null;
    const react = { d: 0, dV: 0, t: 0, tV: 0, on: false };
    function makeReaction() {
      if (reactG) return;
      reactG = new T3.Group();
      reactG.visible = false;
      const dMat = new T3.MeshStandardMaterial({
        color: 0x7d4f45, roughness: .92, metalness: 0,
        transparent: true, opacity: .55, depthWrite: false, side: T3.DoubleSide
      });
      dimpleM = new T3.Mesh(new T3.TorusGeometry(0.5, 0.13, 6, 16), dMat);
      dimpleM.rotation.x = -PI / 2;
      dimpleM.renderOrder = 12;
      const tMat = new T3.MeshStandardMaterial({ color: 0xc99a8a, roughness: .92, metalness: 0, envMapIntensity: .12 });
      tentM = new T3.Mesh(new T3.SphereGeometry(1, 12, 8, 0, PI * 2, 0, PI / 2), tMat);
      tentM.renderOrder = 12;
      reactG.add(dimpleM, tentM);
      scene.add(reactG);
    }
    function reactTargets(arc, prog) {
      if (!arc) return { d: 0, t: 0 };
      /* pressed in from the moment the point touches, released as the bite is drawn */
      const d = clamp((prog - 0.02) / 0.2, 0, 1) * (1 - clamp((prog - 1) / 0.35, 0, 1));
      const t = clamp((prog - 0.62) / 0.3, 0, 1) * (1 - clamp((prog - 1.02) / 0.5, 0, 1));
      return { d, t };
    }
    function reactStep(arc, prog, dt) {
      makeReaction();
      const h = clamp(dt || 1 / 60, 0.001, 0.05);
      const tg = reactTargets(arc, prog);
      /* the dimple is damped hard - skin under a needle does not wobble. The tent is
         under-damped, which is the recoil. */
      const spring = (v, vv, target, K, C) => {
        vv += (target - v) * K * h - vv * C * h;
        return [v + vv * h, vv];
      };
      [react.d, react.dV] = spring(react.d, react.dV, tg.d, 120, 2 * Math.sqrt(120) * 1.1);
      [react.t, react.tV] = spring(react.t, react.tV, tg.t, 90, 2 * Math.sqrt(90) * 0.42);
      react.on = arc && (react.d > 0.01 || Math.abs(react.t) > 0.01);
      reactG.visible = !!react.on;
      if (!react.on) return;
      const yA = tissue.type === 'round' ? 0.16 : skinY(arc.a.x, arc.a.z) + 0.03;
      const yB = tissue.type === 'round' ? 0.16 : skinY(arc.b.x, arc.b.z) + 0.03;
      dimpleM.position.set(arc.a.x, yA, arc.a.z);
      dimpleM.scale.setScalar(0.5 + 0.5 * react.d);
      dimpleM.material.opacity = 0.42 * clamp(react.d, 0, 1);
      tentM.position.set(arc.b.x, yB - 0.03, arc.b.z);
      tentM.scale.set(0.5, Math.max(0.02, react.t * 0.42), 0.5);
      tentM.visible = react.t > 0.08;
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

    /* ---------- the default movement: drive, regrasp, draw out ----------
       How a needle is really passed, at the pace of the reference animation.

       The needle is one piece of steel, a little under half a circle, long enough
       that its point comes out of the far side while the hand still holds the back
       third above the skin. It always turns about its own centre, at one steady
       angular speed, so a bite runs on through the narration's step boundaries and
       only eases where the needle really comes to rest.

       The holder is a hand, not a sleeve. It clamps the needle a little over a
       quarter of the way from the swage and is rigid on it while it drives: the
       wrist turns, and the whole instrument turns with the needle. When the jaws
       reach the skin it lets go - the needle stays where the tissue holds it - opens,
       lifts across and closes on the point that has come through, then draws the
       needle out along its curve, again rigidly. Between bites it moves back to the
       swage end, carries the needle to the next entry, and after the last bite sets
       the needle aside before the knot.

       Everything here is a function of the timeline, so it scrubs and pauses. */
    const DRV = {
      omega: 0.54,     /* rad/s while driving: about the reference's needle speed */
      omegaOut: 1.45,  /* rad/s drawing out, which teaches less and is quicker */
      ramp: 0.3,       /* seconds to come up to speed from rest, and to settle */
      regrasp: 0.9,    /* the hand moving from the swage end to the point */
      reload: 0.8,     /* back to the swage end once the needle is out */
      carry: 0.7,      /* carrying the needle to the next entry, plus distance */
      gS: 0.22,        /* the driving grip, as a fraction of the needle from the swage */
      fast: 3.2        /* the bites of a run (a ring, a running line) turn quicker; the
                          hand's changes of grip only a little quicker, or they snap */
    };
    const CAM_HINT = new V3(0.55, 0, 0.83);
    let needleS = 0, DRIVE = null;
    /* the point on the needle at fraction g from the swage, and the needle's own
       frame there: out from its centre, along it towards the point, and its axis */
    function gripFrame(st, g) {
      const a = st.phi + st.dir * st.sweep * g;
      const ca = Math.cos(a), sa = Math.sin(a);
      return {
        P: new V3(st.r * ca, st.r * sa, 0).applyQuaternion(st.q).add(st.c),
        ur: new V3(ca, sa, 0).applyQuaternion(st.q),
        ut: new V3(-sa * st.dir, ca * st.dir, 0).applyQuaternion(st.q),
        n: new V3(0, 0, 1).applyQuaternion(st.q)
      };
    }
    /* How the hand holds the needle, written in the needle's own frame so it can
       be kept fixed while the needle turns. The shank rises at about 45° and leans
       back along the needle's axis, away from the camera, so it is clear of the
       tissue and does not stand between the camera and the bite. */
    function idealRel(st, g) {
      const F = gripFrame(st, g);
      const side = F.n.clone().multiplyScalar(F.n.dot(CAM_HINT) > 0 ? -1 : 1);
      const Y = side.multiplyScalar(0.7).add(new V3(0, 0.72, 0)).normalize();
      return { g, kr: Y.dot(F.ur), kt: Y.dot(F.ut), kn: Y.dot(F.n) };
    }
    function holderFromRel(st, rel) {
      const F = gripFrame(st, rel.g);
      const Y = F.ur.clone().multiplyScalar(rel.kr)
        .addScaledVector(F.ut, rel.kt).addScaledVector(F.n, rel.kn).normalize();
      /* the needle lies across the jaws: the clamp line is the needle's tangent */
      const Z = F.ut.clone().addScaledVector(Y, -F.ut.dot(Y));
      if (Z.lengthSq() < 1e-6) Z.copy(F.n);
      Z.normalize();
      const X = new V3().crossVectors(Y, Z).normalize();
      const q = new T3.Quaternion().setFromRotationMatrix(new T3.Matrix4().makeBasis(X, Y, Z));
      return { pos: F.P, quat: q, open: 0, vis: 1 };
    }
    function blendH(A, B, w) {
      return {
        pos: A.pos.clone().lerp(B.pos, w), quat: A.quat.clone().slerp(B.quat, w),
        open: lerp(A.open || 0, B.open || 0, w), vis: lerp(A.vis == null ? 1 : A.vis, B.vis == null ? 1 : B.vis, w)
      };
    }
    /* A change of grip with the needle left where it is: the jaws open, the
       instrument backs off its own length and lifts, travels to the new hold and
       closes there. */
    function regraspH(A, B, u) {
      const w = ss(clamp((u - 0.12) / 0.7, 0, 1));
      const H = blendH(A, B, w);
      const lift = Math.sin(PI * w) * 2.4;
      H.pos.addScaledVector(new V3(0, 1, 0).applyQuaternion(H.quat), lift * 0.55).add(new V3(0, lift * 0.6, 0));
      H.open = ss(clamp(u / 0.14, 0, 1)) * (1 - ss(clamp((u - 0.84) / 0.14, 0, 1)));
      return H;
    }
    /* One unbroken turn of the needle: it comes up to speed, holds it, and settles.
       `ang` is the angle turned after `t` seconds; `tAt` inverts it. */
    function makeRun(A, w, r) {
      const T = Math.max(A / w + r, 2 * r);
      const we = A / Math.max(1e-6, T - r);
      const S1 = x => x * x * x - 0.5 * x * x * x * x;
      const ang = t => {
        t = clamp(t, 0, T);
        if (t < r) return we * r * S1(t / r);
        if (t > T - r) return A - we * r * S1((T - t) / r);
        return we * (r / 2 + (t - r));
      };
      const tAt = a => {
        let lo = 0, hi = T;
        for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (ang(m) < a) lo = m; else hi = m; }
        return (lo + hi) / 2;
      };
      return { T, ang, tAt };
    }
    /* Lay the needle's whole program out on the timeline. Pass steps take the time
       their movement needs; the beats around them keep their own length. */
    function buildDrive() {
      DRIVE = null; needleS = 0;
      if (!arcs.length) return;
      let maxD = 0;
      arcs.forEach(a => { maxD = Math.max(maxD, Math.abs(a.delta)); });
      /* long enough that a good length of the point is out before the driving grip
         reaches the skin: there has to be something to take hold of */
      needleS = clamp((maxD + 0.42) / (1 - DRV.gS), 2.36, 3.0);
      const B = arcs.map(a => {
        const D = Math.max(0.05, Math.abs(a.delta));
        /* let go when the jaws are at the skin; the point is through by then */
        const rel = Math.max((needleS * (1 - DRV.gS) - 0.06) / D, 1 + 0.1 / D);
        /* and draw until the swage has cleared the exit */
        const out = 1 + (needleS + 0.12) / D;
        /* take the point by the middle of the part that has come through */
        const fExit = 1 - D * (rel - 1) / needleS;
        const gT = Math.max(fExit + 0.03, Math.min(0.95, fExit + (1 - fExit) * 0.5));
        return { D, rel, out, gT };
      });
      const lastStepOf = {};
      steps.forEach((s, i) => { if (s.kind === 'pass') for (let j = s.pi; j <= s.passTo; j++) lastStepOf[j] = i; });
      const firstPass = steps.findIndex(s => s.kind === 'pass');
      if (firstPass < 0) return;
      const segs = [];
      let state = null;
      steps.forEach((s, i) => {
        const fast = s.kind === 'pass' && s.passTo > s.pi ? DRV.fast : 1;
        const add = o => { o.step = i; o.fast = fast; segs.push(o); return o; };
        const lead = (j, f0) => {
          if (!state) {
            add({ k: 'approach', pi: j, p: f0, dur: 1.1 });
          } else if (state.pi !== j) {
            const hf = Math.sqrt(fast);
            if (state.grip === 't') add({ k: 'reload', pi: state.pi, p: state.p, dur: DRV.reload / hf });
            const d = needlePose(arcs[state.pi], state.p).c.distanceTo(needlePose(arcs[j], f0).c);
            add({ k: 'carry', pi: state.pi, p: state.p, pi2: j, p2: f0, dur: (DRV.carry + d * 0.04) / hf });
          }
          state = state && state.pi === j ? state : { pi: j, p: f0, grip: 's' };
        };
        if (s.kind === 'pass') {
          for (let j = s.pi; j <= s.passTo; j++) {
            const f0 = j === s.pi ? s.f0 : 0;
            let f1 = j === s.passTo ? s.f1 : 1;
            if (f1 >= 0.999 && lastStepOf[j] === i) f1 = B[j].out;
            lead(j, f0);
            const rel = B[j].rel;
            let p = f0;
            if (p < rel && f1 > rel) {
              add({ k: 'rot', pi: j, p0: p, p1: rel, grip: 's' });
              p = rel;
            }
            if (p >= rel && state.grip === 's' && f1 > p) {
              add({ k: 'regrasp', pi: j, p, dur: DRV.regrasp / Math.sqrt(fast) });
              state.grip = 't';
            }
            if (f1 > p) add({ k: 'rot', pi: j, p0: p, p1: f1, grip: state.grip });
            state.p = f1;
          }
        } else if (s.needleOn) {
          const next = passStepNear(i, 1);
          const dur = s.t1 - s.t0;
          if (!state) {
            const nx = next || steps[firstPass];
            const ap = Math.min(1.1, dur);
            add({ k: 'approach', pi: nx.pi, p: nx.f0, dur: ap });
            if (dur - ap > 0.01) add({ k: 'hold', pi: nx.pi, p: nx.f0, dur: dur - ap });
            state = { pi: nx.pi, p: nx.f0, grip: 's' };
          } else if (next && next.pi !== state.pi) {
            const rl = state.grip === 't' ? Math.min(DRV.reload, Math.max(0.5, dur * 0.4)) : 0;
            if (rl) add({ k: 'reload', pi: state.pi, p: state.p, dur: rl });
            add({ k: 'carry', pi: state.pi, p: state.p, pi2: next.pi, p2: next.f0, dur: Math.max(dur - rl, 0.7) });
            state = { pi: next.pi, p: next.f0, grip: 's' };
          } else if (next) {
            add({ k: 'hold', pi: state.pi, p: state.p, dur });
          } else {
            /* the stitch is done: lift the needle off to the side of the exit */
            const A = arcs[state.pi];
            const sx = A.b.x < 0 ? -1 : 1;
            add({ k: 'aside', pi: state.pi, p: state.p, dur, off: new V3(sx * 4, 6.5, -2.5) });
            state = null;
          }
        }
      });
      if (!segs.length) return;
      /* runs: one uninterrupted turn of the needle, however many steps it crosses */
      const runs = [];
      segs.forEach((g, k) => {
        if (g.k !== 'rot') return;
        const prev = segs[k - 1];
        if (prev && prev.k === 'rot' && prev.run && prev.pi === g.pi && prev.grip === g.grip) {
          g.run = prev.run; g.run.segs.push(g); g.run.p1 = g.p1;
        } else {
          g.run = { pi: g.pi, grip: g.grip, p0: g.p0, p1: g.p1, segs: [g], fast: g.fast };
          runs.push(g.run);
        }
      });
      runs.forEach(R => {
        const D = B[R.pi].D;
        const w = (R.grip === 's' ? DRV.omega : DRV.omegaOut) * R.fast;
        const M = makeRun(D * (R.p1 - R.p0), w, DRV.ramp / Math.sqrt(R.fast));
        R.M = M; R.D = D;
        R.segs.forEach(g => { g.dur = M.tAt(D * (g.p1 - R.p0)) - M.tAt(D * (g.p0 - R.p0)); });
        /* the hold is fixed for the whole run, chosen where the hand is most
           upright: mid-drive, or early in the draw while the jaws are near the skin */
        const pm = R.p0 + (R.p1 - R.p0) * (R.grip === 's' ? 0.5 : 0.35);
        R.rel = idealRel(needlePose(arcs[R.pi], pm), R.grip === 's' ? DRV.gS : B[R.pi].gT);
        R.progAt = tau => R.p0 + M.ang(tau) / D;
      });
      /* each beat's hold: carried on from the last, or taken up by the next turn */
      let curRel = null;
      segs.forEach((g, k) => {
        let nextRun = null;
        for (let m = k + 1; m < segs.length; m++) if (segs[m].run) { nextRun = segs[m].run; break; }
        const nextRel = nextRun ? nextRun.rel : curRel;
        if (g.k === 'rot') { curRel = g.run.rel; return; }
        if (g.k === 'approach') { g.rel = nextRel; curRel = g.rel; return; }
        if (g.k === 'hold' || g.k === 'aside') { g.rel = curRel || nextRel; return; }
        if (g.k === 'regrasp') { g.relA = curRel; g.relB = nextRel; curRel = g.relB; return; }
        if (g.k === 'reload') {
          g.relA = curRel;
          g.relB = idealRel(needlePose(arcs[g.pi], g.p), DRV.gS);
          curRel = g.relB; return;
        }
        if (g.k === 'carry') { g.relA = curRel; g.relB = nextRel || curRel; curRel = g.relB; }
      });
      /* the steps take the time their movement needs, and the timeline is laid out
         again from the top */
      const need = steps.map(() => 0), has = steps.map(() => false);
      segs.forEach(g => { need[g.step] += g.dur; has[g.step] = true; });
      total = 0;
      steps.forEach((s, i) => {
        const dur = has[i] ? (s.kind === 'pass' ? need[i] : Math.max(s.t1 - s.t0, need[i])) : s.t1 - s.t0;
        s.t0 = total; total += dur; s.t1 = total;
      });
      let at = -1, cursor = 0;
      segs.forEach(g => {
        if (g.step !== at) { at = g.step; cursor = steps[at].t0; }
        g.t0 = cursor; cursor += g.dur; g.t1 = cursor;
      });
      runs.forEach(R => { R.t0 = R.segs[0].t0; });
      DRIVE = { segs, B };
    }
    /* Where the needle and the hand are at time t, or null when no needle is in
       the field. */
    function rigAt(t) {
      if (!DRIVE) return null;
      const segs = DRIVE.segs;
      if (t < segs[0].t0 - 1e-9 || t > segs[segs.length - 1].t1 + 1e-9) return null;
      let g = segs[segs.length - 1];
      for (let k = 0; k < segs.length; k++) if (t < segs[k].t1) { g = segs[k]; break; }
      const u = clamp((t - g.t0) / Math.max(1e-6, g.t1 - g.t0), 0, 1);
      let pose, H, prog = g.p, nVis = 1, end = null, drop = 0;
      if (g.k === 'rot') {
        prog = g.run.progAt(t - g.run.t0);
        pose = needlePose(arcs[g.pi], prog);
        H = holderFromRel(pose, g.run.rel);
      } else if (g.k === 'regrasp' || g.k === 'reload') {
        pose = needlePose(arcs[g.pi], g.p);
        H = regraspH(holderFromRel(pose, g.relA), holderFromRel(pose, g.relB), u);
      } else if (g.k === 'carry') {
        const w = ss(u);
        const A0 = needlePose(arcs[g.pi], g.p), B0 = needlePose(arcs[g.pi2], g.p2);
        pose = mixPose(A0, B0, w, false);
        /* carried up and over, not dragged across the tissue */
        pose.c.y += Math.sin(PI * w) * Math.min(5, 1.6 + 0.15 * A0.c.distanceTo(B0.c));
        H = blendH(holderFromRel(pose, g.relA), holderFromRel(pose, g.relB), w);
      } else if (g.k === 'approach') {
        const w = ss(u);
        pose = needlePose(arcs[g.pi], g.p);
        pose.c.add(new V3(0, 13 * (1 - w), 5 * (1 - w)));
        H = holderFromRel(pose, g.rel);
        H.vis = nVis = ss(clamp(u / 0.3, 0, 1));
      } else if (g.k === 'aside' && tech.tie) {
        /* The needle is handed to the other hand, which keeps the long end up and out
           to the side ready for the tie: the needle is carried there, the holder lets
           go and comes away, and the needle goes on out of the field. */
        pose = needlePose(arcs[g.pi], g.p);
        const sw0 = new V3(pose.r * Math.cos(pose.phi), pose.r * Math.sin(pose.phi), 0).applyQuaternion(pose.q).add(pose.c);
        /* the holder carries it part of the way, then the other hand has it */
        const carried = ss(clamp(u / 0.7, 0, 1)), held = ss(clamp(Math.min(u, 0.4) / 0.7, 0, 1));
        const toHand = tieHandStart().sub(sw0);
        const hp = pose.c.clone();
        pose.c.addScaledVector(toHand, carried);
        nVis = 1 - ss(clamp((u - 0.6) / 0.35, 0, 1));
        const hpose = Object.assign({}, pose, { c: hp.addScaledVector(toHand, held) });
        H = holderFromRel(hpose, g.rel);
        if (u > 0.4) {
          /* let go, back off along the shank and fade */
          const w = ss(clamp((u - 0.4) / 0.5, 0, 1));
          H = { pos: H.pos.clone().addScaledVector(new V3(0, 1, 0).applyQuaternion(H.quat), 5 * w).add(new V3(0, 3 * w, 0)),
            quat: H.quat, open: ss(clamp((u - 0.4) / 0.12, 0, 1)), vis: 1 - w };
        }
      } else if (g.k === 'aside') {
        pose = needlePose(arcs[g.pi], g.p);
        pose.c.addScaledVector(g.off, ss(clamp(u / 0.6, 0, 1)));
        H = holderFromRel(pose, g.rel);
        /* the needle is cut free: it goes, and the end of the strand drops to the skin */
        nVis = 1 - ss(clamp((u - 0.62) / 0.33, 0, 1));
        const cutW = ss(clamp((u - 0.55) / 0.4, 0, 1));
        if (cutW > 0) { end = cutW; drop = cutW; }
      } else {
        pose = needlePose(arcs[g.pi], g.p);
        H = holderFromRel(pose, g.rel);
      }
      const swage = new V3(pose.r * Math.cos(pose.phi), pose.r * Math.sin(pose.phi), 0)
        .applyQuaternion(pose.q).add(pose.c);
      /* once a bite has been drawn right through, its thread is complete, even if the
         tissue then moves and the bite's own curve changes under it */
      const through = prog >= DRIVE.B[g.pi].out - 1e-6;
      return { k: g.k, pi: g.pi, prog, pose, nVis, holder: H, swage, cut: end, drop, through };
    }
    /* The thread for the default movement. It always leaves from the needle's swage
       while the needle is in the field - through the bite as far as the swage has
       gone, and from the exit up to the needle once the needle is out - so the
       thread is never in a hole the needle has not reached yet. */
    function threadLive(st, prog, R) {
      const out = [];
      const a0 = tailStart.clone(), a1 = tailEnd.clone();
      if (st.q > 0) { a0.lerp(K, clamp(st.q * 1.6, 0, 1)); a1.lerp(K, clamp(st.q * 1.6, 0, 1)); }
      out.push(a0);
      if (!arcs.length) return out;
      /* the free end of the strand: the swage, or the skin once the needle is cut off */
      const endAt = R ? (R.cut ? R.swage.clone().lerp(a1, R.cut) : R.swage) : null;
      const run = (a, b, drop) => sagRun(a, b, 10, drop).forEach(p => out.push(p));
      /* the stretch from the last exit to a needle that has not entered yet: taut
         while it is carried, settling onto the shape it will have on the skin as
         the point reaches the entry */
      const lead = (i, sw) => {
        if (i === 0) {
          sagRun(a0, sw, 7).forEach(p => out.push(p));
          return;
        }
        const from = arcs[i - 1].b, to = arcs[i].a;
        const C = [];
        connector(C, from, to, i);
        const wC = clamp(1 - sw.distanceTo(to) / 5, 0, 1);
        const shift = new V3().subVectors(sw, to);
        const n = C.length;
        C.forEach((c, k) => {
          const f = (k + 1) / n;
          const line = from.clone().lerp(sw, f);
          out.push(line.lerp(c.clone().addScaledVector(shift, f), wC));
        });
      };
      if (!R && !prog.some(v => v > 0)) {
        /* before the needle is brought in: the strand hangs from where it will be */
        const sw = posePts(needlePose(arcs[0], 0), 2)[0].add(new V3(0, 13, 5));
        sagRun(a0, sw, 7).forEach(p => out.push(p));
        out.push(sw);
        return dedupe(out);
      }
      for (let i = 0; i < arcs.length; i++) {
        const A = arcs[i];
        if (R && i === R.pi) {
          const D = Math.abs(A.delta);
          const frac = R.through ? Math.max(1, (D * R.prog - needleS) / D) : (D * R.prog - needleS) / D;
          if (frac <= 0) { lead(i, endAt); out.push(endAt.clone()); return dedupe(out); }
          lead(i, A.a);
          out.push(A.a.clone());
          if (frac < 0.999) {
            if (frac > 0.02) appendArc(out, A, frac);
            out.push(endAt.clone());
            return dedupe(out);
          }
          appendArc(out, A, 1);
          run(A.b, endAt, lerp(0, 2.6, R.drop || 0));
          out.push(endAt.clone());
          return dedupe(out);
        }
        if ((prog[i] || 0) < 0.999) break;
        lead(i, A.a);
        out.push(A.a.clone());
        appendArc(out, A, 1);
        if (i === arcs.length - 1 && !R) {
          run(A.b, a1, 2.6);
          out.push(a1);
        }
      }
      return dedupe(out);
    }

    /* ---------- the instrument tie: the knot at the end of every stitch ----------
       Two ends are tied. For a single stitch, a mattress or a purse-string they are
       the two free ends of the thread: the short tail (A), which the holder takes,
       and the long end (B), which runs up to the other hand with the needle still
       on it. A running line has no short tail at its finish: it is tied off to its
       own last loop - the stretch between the last two bites, left standing - so
       there the loop is A, both of its legs together. Each throw is tied the way it
       is done at the table:

         place  - the holder is laid across, between the two ends
         wrap   - the long end is wound round the jaws (twice for the surgeon's
                  first throw, once after that)
         grasp  - the holder, wraps and all, goes to A and takes it by its tip
         pull   - it draws A back through the wraps, which slide off the jaws onto
                  it; the hands cross to the other sides
         seat   - both ends are pulled out level and the throw beds down on the one
                  below it; on the first throw, the wound edges meet

       The knot is made of the thread itself: every throw is the long strand coiled
       round A, the throws stacked on each other and wound in opposite directions,
       so the knot is square. `st.tie` runs 0 to the number of throws, one unit a
       throw, and the phases split each unit. Directions are taken from the knot's
       own place - towards where A lies - so the same tie works on either side of
       the wound, along it, or on the purse-string's ring. */
    const TIE = {
      pitch: 0.27,     /* the rise of one wrap in a seated throw: one thread thick */
      rTight: 0.27,    /* the long strand lying on the short one */
      rLoose: 0.75,    /* a throw sliding down, before it is pulled tight */
      scale: 0.62,     /* the holder is drawn at one fixed size here, so the wraps fit its jaws */
      rJaw: 1.35,      /* the wraps round the jaws, in the holder's own units */
      phases: [0, 0.15, 0.45, 0.62, 0.82, 1]
    };
    function tieThrows() { return (tech && tech.tie && tech.tie.throws) || []; }
    /* where throw k's phase stands at tie time T: which phase, and how far through */
    function tiePhase(T, k) {
      const u = clamp(T - k, 0, 1), P = TIE.phases;
      for (let i = 0; i < 5; i++) if (u < P[i + 1] || i === 4) return { i, w: clamp((u - P[i]) / (P[i + 1] - P[i]), 0, 1), u };
      return { i: 4, w: 1, u };
    }
    /* the coil of one throw: centre, frame (local y is its axis), radii, length,
       turns, hand of the turn and the angle it starts at */
    function coilPts(c, out) {
      const n = Math.max(6, Math.ceil(Math.abs(c.turns) * 18) + 2);
      for (let i = 0; i <= n; i++) {
        const s = i / n, a = c.phi0 + c.hand * 2 * PI * c.turns * s;
        out.push(new V3(c.rx * Math.cos(a), (s - 0.5) * c.len, c.rz * Math.sin(a)).applyQuaternion(c.q).add(c.C));
      }
      return out;
    }
    function coilAxis(c, s) { return new V3(0, (s - 0.5) * c.len, 0).applyQuaternion(c.q).add(c.C); }
    /* a polyline as n points spread evenly along its length, so two shapes can be
       blended point for point */
    function evenPts(pts, n) {
      const L = [0];
      for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const tot = L[L.length - 1], out = [];
      if (pts.length < 2 || tot < 1e-6) { for (let k = 0; k < n; k++) out.push(pts[0].clone()); return out; }
      let j = 0;
      for (let k = 0; k < n; k++) {
        const s = tot * k / (n - 1);
        while (j < L.length - 2 && L[j + 1] < s) j++;
        out.push(pts[j].clone().lerp(pts[j + 1], clamp((s - L[j]) / Math.max(1e-9, L[j + 1] - L[j]), 0, 1)));
      }
      return out;
    }
    const blendPts = (a, b, w, n) => {
      if (w <= 0) return a;
      if (w >= 1) return b;
      const A = evenPts(a, n), Bp = evenPts(b, n);
      return A.map((p, i) => p.lerp(Bp[i], w));
    };
    /* Where the knot is and which way it faces: the foot of the knot, the stitch
       points A leaves from, where A lies before the tie, and a frame with `u` level
       and pointing at A, so every pose below is written once for any stitch. */
    function tieFrame() {
      const n = arcs.length, loop = !!(tech.tie && tech.tie.loop) && n >= 2;
      const up = new V3(0, 1, 0);
      const Kb = tissue.type === 'round' ? K.clone().add(new V3(0, -0.1, 0))
        : new V3(K.x, skinY(K.x, K.z) + 0.16, K.z);
      let S1, S2 = null, loopRest = null;
      if (loop) {
        /* the last loop, as the line left it on the skin */
        S1 = arcs[n - 2].b.clone(); S2 = arcs[n - 1].a.clone();
        loopRest = [];
        connector(loopRest, S1, S2, n - 1);
        if (loopRest.length < 3) loopRest = [S1.clone().lerp(S2, 0.5), S2.clone()];
      } else S1 = arcs[0].a.clone();
      const Arest = loop ? loopRest[Math.floor((loopRest.length - 1) / 2)].clone() : tailStart.clone();
      /* towards where A lies; a purse-string's two ends close up as it is drawn
         tight, but the direction between them holds, so only a true tie falls back */
      const u = Arest.clone().sub(Kb).setY(0);
      if (u.lengthSq() < 1e-6) u.copy(Kb.clone().sub(arcs[n - 1].b).setY(0));
      if (u.lengthSq() < 1e-6) u.set(-1, 0, 0);
      u.normalize();
      const w = new V3().crossVectors(up, u).normalize();
      const X = u.clone().negate();
      const Qb = new T3.Quaternion().setFromRotationMatrix(new T3.Matrix4().makeBasis(X, up, w));
      return { n, loop, up, Kb, u, w, X, Qb, S1, S2, loopRest, Arest };
    }
    const tieOff = (F, a, y, z) => F.u.clone().multiplyScalar(a).addScaledVector(F.up, y).addScaledVector(F.w, z);
    /* where the other hand holds the long end when the tie begins */
    function tieHandStart() { const F = tieFrame(); return F.Kb.clone().add(tieOff(F, -15, 9, 4)); }
    /* Everything the tie needs at tie time T and cut amount `cut`. */
    function tieState(T, cut) {
      const W = tieThrows(), n = W.length;
      const F = tieFrame();
      const { up, Kb } = F;
      const last = arcs[F.n - 1];
      /* stack heights: the seated throws, one on another */
      const h = [0];
      W.forEach((wr, k) => h.push(h[k] + wr * TIE.pitch));
      const side = k => (k % 2 === 0 ? 1 : -1);       /* A lies towards u at even throws */
      const hand = k => (k % 2 === 0 ? 1 : -1);       /* which way throw k is wound */
      const off = (a, y, z) => tieOff(F, a, y, z);
      const stackTop = k => Kb.clone().addScaledVector(up, h[k]);
      const onSkin = p => new V3(p.x, skinY(p.x, p.z) + 0.2, p.z);
      const tipPull = k => Kb.clone().add(off(-side(k) * 11, 4.5, -1));
      const sc = TIE.scale;
      const pose = (P, dir) => ({ pos: P, quat: quatAlong(dir, F.w), open: 0, vis: 1, scale: sc });
      const pullPose = k => pose(tipPull(k), off(-side(k) * 0.8, 0.5, -0.3));
      const seatPose = k => { const H = pullPose(k); H.pos.add(off(-side(k) * 1.6, -0.9, 0)); return H; };
      /* A let go falls straight down onto the skin where it was held */
      const tailRest = k => (k === 0 ? F.Arest.clone() : onSkin(seatPose(k - 1).pos));
      const handPull = k => Kb.clone().add(off(side(k) * 15, 8, 4));
      const seatHand = k => handPull(k).add(off(side(k) * 1.5, -1, 0));
      const handRest = k => (k === 0 ? Kb.clone().add(off(-15, 9, 4)) : seatHand(k - 1));
      const placePose = k => pose(stackTop(k).add(off(side(k) * 2.2, 3.2, 0.6)), off(-side(k) * 0.75, 0.5, -0.4));
      const graspPose = k => pose(tailRest(k).add(new V3(0, 0.25, 0)), off(-side(k) * 0.7, 0.65, -0.3));
      /* how far A sags: as it lies at rest, and not at all once it is held up */
      const lift = p => clamp(1 - (p.y - F.Arest.y) / 2, 0, 1);
      /* the throw coil sitting tight in the stack; round a loop it has two legs to
         go round, so it stands a little wider across them */
      const tightCoil = k => ({
        C: Kb.clone().addScaledVector(up, h[k] + W[k] * TIE.pitch / 2),
        q: F.Qb.clone().multiply(new T3.Quaternion().setFromAxisAngle(new V3(0, 0, 1), hand(k) * 0.3)),
        rx: TIE.rTight * 1.5, rz: TIE.rTight * (F.loop ? 1.9 : 1), len: W[k] * TIE.pitch,
        turns: W[k], hand: hand(k), phi0: 0
      });
      /* the same throw wound on the jaws of a holder posed at H */
      const jawCoil = (H, k, turns) => ({
        C: H.pos.clone().addScaledVector(new V3(0, 1, 0).applyQuaternion(H.quat), 1.4 * sc),
        q: H.quat.clone(), rx: TIE.rJaw * sc, rz: TIE.rJaw * sc,
        len: Math.max(0.001, turns * 0.55), turns, hand: hand(k), phi0: 0
      });
      /* the angle in a jaw coil's own frame that faces a point */
      const facing = (c, P) => {
        const d = P.clone().sub(c.C).applyQuaternion(c.q.clone().invert());
        return Math.atan2(d.z, d.x);
      };
      const blendCoil = (a, b, w) => {
        let p1 = b.phi0;
        while (p1 - a.phi0 > PI) p1 -= 2 * PI;
        while (p1 - a.phi0 < -PI) p1 += 2 * PI;
        return {
          C: a.C.clone().lerp(b.C, w), q: a.q.clone().slerp(b.q, w),
          rx: lerp(a.rx, b.rx, w), rz: lerp(a.rz, b.rz, w), len: lerp(a.len, b.len, w),
          turns: b.turns, hand: b.hand, phi0: lerp(a.phi0, p1, w)
        };
      };

      /* which throw is being tied, and how far */
      const k = Math.min(n - 1, Math.floor(clamp(T, 0, n - 1e-6)));
      const done = T >= n - 1e-6 ? n : k;          /* throws already seated */
      const ph = tiePhase(T, k);
      const forming = done < n;
      let H = null, coil = null, tip = null, handP = null, guide = 0, contact = 0;
      if (forming) {
        /* the first throw starts with the holder coming in from above */
        const prevH = k === 0
          ? (() => { const P = placePose(0); P.pos.add(off(-9, 14, 2)); P.vis = 0; return P; })()
          : seatPose(k - 1);
        const prevTip = k === 0 ? tailRest(0) : seatPose(k - 1).pos;
        const turnsAll = W[k];
        if (ph.i === 0) {
          /* lay the holder across; it lets go of the end it last drew through */
          const w = ss(ph.w);
          H = blendH(prevH, placePose(k), w);
          H.scale = sc;
          if (k === 0) H.vis = ss(clamp(ph.w / 0.5, 0, 1));
          else H.open = ss(clamp(ph.w / 0.25, 0, 1)) * (1 - ss(clamp((ph.w - 0.55) / 0.35, 0, 1)));
          tip = prevTip.clone().lerp(tailRest(k), ss(clamp(ph.w / 0.7, 0, 1)));
          handP = handRest(k);
          contact = w; guide = ss(clamp((ph.w - 0.5) / 0.5, 0, 1));
        } else if (ph.i === 1) {
          H = placePose(k);
          coil = jawCoil(H, k, turnsAll * ss(ph.w));
          tip = tailRest(k); handP = handRest(k); contact = 1; guide = 1;
        } else if (ph.i === 2) {
          const w = ss(ph.w);
          H = blendH(placePose(k), graspPose(k), w); H.scale = sc;
          H.open = ss(clamp((ph.w - 0.35) / 0.3, 0, 1)) * (1 - ss(clamp((ph.w - 0.82) / 0.16, 0, 1)));
          coil = jawCoil(H, k, turnsAll);
          /* the jaws close on the very tip, lifting it off the skin */
          tip = tailRest(k).add(new V3(0, 0.25 * ss(clamp((ph.w - 0.8) / 0.2, 0, 1)), 0));
          handP = handRest(k); contact = 1; guide = 1 - w;
        } else if (ph.i === 3) {
          const w = ss(ph.w);
          H = blendH(graspPose(k), pullPose(k), w); H.scale = sc;
          const loose = tightCoil(k);
          loose.C.addScaledVector(up, 1.1); loose.rx = loose.rz = TIE.rLoose; loose.len = W[k] * 0.5;
          const onJaws = jawCoil(graspPose(k), k, turnsAll);
          onJaws.phi0 = facing(onJaws, handRest(k));
          coil = blendCoil(onJaws, loose, w);
          tip = H.pos.clone(); handP = handRest(k).lerp(handPull(k), w); contact = 1;
        } else {
          const w = ss(ph.w);
          H = blendH(pullPose(k), seatPose(k), w); H.scale = sc;
          const loose = tightCoil(k);
          loose.C.addScaledVector(up, 1.1); loose.rx = loose.rz = TIE.rLoose; loose.len = W[k] * 0.5;
          coil = blendCoil(loose, tightCoil(k), w);
          tip = H.pos.clone(); handP = handPull(k).lerp(seatHand(k), w); contact = 1;
        }
        /* the jaw coil's start faces the knot and its end faces the hand */
        if (coil && ph.i <= 2) coil.phi0 = facing(coil, handP);
      } else {
        /* all thrown: the holder still has A, until the ends are cut */
        H = seatPose(n - 1);
        tip = H.pos.clone(); handP = seatHand(n - 1);
        if (cut > 0) {
          const w = ss(clamp(cut / 0.3, 0, 1));
          H = blendH(H, (() => { const P = seatPose(n - 1); P.pos.add(off(0, 6, -2)); P.vis = 0; return P; })(), ss(clamp((cut - 0.55) / 0.4, 0, 1)));
          H.scale = sc;
          tip.add(new V3(0, 1.5 * w, 0));
          handP = handP.clone().add(new V3(0, 1.5 * w, 0));
        }
      }

      /* ---- A: from the stitch, up through the knot, to its tip ----
         A tail lying down sags onto the skin; drawn up into the jaws it straightens.
         When the jaws pull back, the wraps slide forward off their tips and onto A,
         so A comes to run along the middle of the wraps - gradually, from the shape
         it had in the jaws, not by jumping into them. A loop is two such legs side
         by side, meeting at its tip. */
      const top = stackTop(done);
      const through = coil && ph.i >= 3;
      const snipped = cut >= 0.55;
      const legOff = F.w.clone().multiplyScalar(0.3);
      const sagAmt = (a, b) => (snipped ? 0 : Math.min(a.distanceTo(b) * 0.22, 5) * lift(tip));
      const leg = (S, o) => {
        const pts = [S.clone()];
        if (done > 0) {
          /* from the stitch to the foot of the knot, lying as it did while the throw
             below was being drawn down onto it */
          const foot = Kb.clone().add(o);
          sagRun(S, foot, 7, sagAmt(S, foot)).forEach(p => pts.push(p));
          pts.push(foot); pts.push(top.clone().add(o));
        }
        const from = pts[pts.length - 1];
        let end = tip.clone();
        if (snipped) {
          const dir = tip.clone().sub(from).setY(0).normalize();
          end = from.clone().addScaledVector(dir, 2.5);
        }
        const sag = p => sagAmt(from, p);
        const rest = sagRun(from, end, 7, sag(end));
        if (through && rest.length) {
          const ax0 = coilAxis(coil, 0).add(o), ax1 = coilAxis(coil, 1).add(o);
          const s = ph.i === 3 ? ss(clamp(ph.w / 0.4, 0, 1)) : 1;
          const lr = rest[rest.length - 1];
          const R0 = rest.concat([lr.clone().lerp(end, 1 / 3), lr.clone().lerp(end, 2 / 3)]);
          const thru = sagRun(from, ax0, 7, sag(ax0));
          const R1 = thru.length === rest.length ? thru.concat([ax0, ax1])
            : R0.map((p, i) => (i < R0.length - 2 ? ax0 : ax1).clone());
          R0.forEach((p, i) => pts.push(p.clone().lerp(R1[i], s)));
        } else rest.forEach(p => pts.push(p));
        pts.push(end);
        return pts;
      };
      let Afwd = leg(F.S1, new V3());
      let Aret = F.loop ? leg(F.S2, legOff).reverse() : null;
      if (F.loop && k === 0 && done === 0 && ph.i <= 2) {
        /* the loop as the line left it, until the holder has hold of it */
        const g = ph.i < 2 ? 0 : ss(ph.w);
        const mid = Math.floor((F.loopRest.length - 1) / 2);
        const fRest = [F.S1.clone()].concat(F.loopRest.slice(0, mid + 1).map(p => p.clone()));
        const rRest = F.loopRest.slice(mid).map(p => p.clone());
        Afwd = blendPts(fRest, Afwd, g, 16);
        Aret = blendPts(rRest, Aret, g, 16);
      }

      /* ---- B: from the last exit, up through the knot, to the other hand ---- */
      const Bpath = [last.b.clone()];
      if (done > 0) {
        /* across to the foot of the knot, then up through the seated throws */
        Bpath.push(Kb.clone().addScaledVector(F.X, TIE.rTight * 1.5));
        for (let j = 0; j < done; j++) coilPts(tightCoil(j), Bpath);
      }
      const from = Bpath[Bpath.length - 1].clone();
      let handEnd = handP;
      if (snipped) {
        const dir = handP.clone().sub(from).setY(0).normalize();
        handEnd = from.clone().addScaledVector(dir, 2.5);
      }
      /* Before the wraps go on, the strand is laid against the jaws where the first
         wrap will start, so winding it on is a continuation, not a jump. */
      let wc = coil;
      if (!wc && H && forming && contact > 0) { wc = jawCoil(H, k, 0); wc.phi0 = facing(wc, handP); }
      if (wc) {
        if (wc.turns > 0.001) coilPts(wc, Bpath);
        else Bpath.push(from.clone().lerp(handEnd, 0.4).lerp(coilPts(wc, [])[0], contact));
        if (guide > 0 && ph.i <= 2) {
          /* the other hand winds the strand: it goes round the jaws at a hand's reach,
             and straightens out to the hand once the wraps are on */
          const end = Bpath[Bpath.length - 1];
          const c2 = coilAxis(wc, 1);
          const ang = wc.phi0 + wc.hand * 2 * PI * wc.turns;
          const orbit = new V3(3.5 * Math.cos(ang), 0, 3.5 * Math.sin(ang)).applyQuaternion(wc.q).add(c2);
          Bpath.push(end.clone().lerp(handEnd, 0.3).lerp(orbit, guide));
        }
      }
      Bpath.push(handEnd);

      /* ---- the whole strand, in thread order ---- */
      const route = [];
      if (F.loop) {
        /* the line up to its last loop, the loop, the last bite, the long end */
        const a0 = tailStart.clone();
        route.push(a0);
        sagRun(a0, arcs[0].a, 7).forEach(p => route.push(p));
        route.push(arcs[0].a.clone());
        for (let i = 0; i < F.n - 1; i++) {
          if (i > 0) { connector(route, arcs[i - 1].b, arcs[i].a, i); route.push(arcs[i].a.clone()); }
          appendArc(route, arcs[i], 1);
        }
        Afwd.forEach(p => route.push(p));
        Aret.forEach(p => route.push(p));
        route.push(last.a.clone());
        appendArc(route, last, 1);
      } else {
        /* the short tail, the whole line, the long end */
        Afwd.slice().reverse().forEach(p => route.push(p));
        for (let i = 0; i < F.n; i++) {
          if (i > 0) { connector(route, arcs[i - 1].b, arcs[i].a, i); route.push(arcs[i].a.clone()); }
          appendArc(route, arcs[i], 1);
        }
      }
      Bpath.slice(1).forEach(p => route.push(p));
      return {
        route: dedupe(route), holder: H && H.vis > 0.01 ? H : null,
        /* the wound closes as the first throw is drawn down */
        p: ss(clamp((T - 0.62) / 0.38, 0, 1))
      };
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
        g.tx = K.x; g.ty = K.y + 1.1; g.tz = K.z;
        g.d = R ? 26 : 20;
        /* the tie works over the whole knot site - holder, both ends, both sides of
           the wound - so the close-up stands back far enough to keep all of it */
        if (tech && tech.tie) { g.ty = K.y + 1.8; g.d = 32; }
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
      /* in context the opening shot stands back far enough to show the organ */
      if (CTX.obj && name !== 'knot' && curStep <= 0) g.d *= CTX.obj.wide || 1.5;
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
    /* The camera is a critically damped spring, not a tween: the goal moves when the
       step changes and the camera eases after the work, overshooting a little and
       settling. Scrubbing the timeline or changing the plane therefore never cuts. */
    const camV = { az: 0, el: 0, d: 0, tx: 0, ty: 0, tz: 0 };
    function glide() { /* the goal has moved; the spring in stepCam does the rest */ }
    function snapCam() {
      ['az', 'el', 'd', 'tx', 'ty', 'tz'].forEach(k => { cam[k] = goal[k]; camV[k] = 0; });
      tween = null;
    }
    const HUD = {
      '3d': '3D view · wound and stitch', section: 'Cross-section · cut through the stitch',
      top: 'Top view · plan of the wound', knot: 'Close-up · knot and edges'
    };
    function hud(n) {
      const el = opts.hud; if (!el) return;
      const sp = species();
      el.textContent = (HUD[n] || '') + (sp.id === 'dog' ? '' : ' · ' + sp.name);
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
          /* The serosa has to stay the surface you read, so it keeps most of its
             opacity and the muscle and mucosa show as depth under it rather than
             washing the whole top face to one colour. In the cut view the shells are
             concentric, so translucency stacks them into one wash: there the strata
             stay solid, because a cut face is a diagram. */
          tint(m.m.material, S.clip ? 1 : op);
          tint(m.ring.material, S.clip ? 1 : (see ? 0.78 : 1));
          tint(m.muc.material, S.clip ? 1 : (see ? 0.6 : 1));
          /* in the cut view the caps are the diagram, so they keep the true colours */
          const seeCaps = see && !S.clip;
          if (m.capSkin) {
            const c = seeCaps ? m.capSkin.userData.see : m.capSkin.userData.base;
            m.capSkin.color.copy(c); m.capSkin.emissive.copy(c);
            m.capSkin.needsUpdate = true;
          }
          if (m.capMus) {
            const c = seeCaps ? m.capMus.userData.see : m.capMus.userData.base;
            m.capMus.color.copy(c); m.capMus.emissive.copy(c);
            m.capMus.needsUpdate = true;
          }
          if (m.capMuc) {
            const c = seeCaps ? m.capMuc.userData.see : m.capMuc.userData.base;
            m.capMuc.color.copy(c); m.capMuc.emissive.copy(c);
            m.capMuc.needsUpdate = true;
          }
          return;
        }
        m.cap.visible = S.clip;
        m.cap.position.z = cutZ;
        m.m.material.clippingPlanes = (S.clip ? [clipPlane] : []).concat(CTX.planes);
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
          m.skin.material.clippingPlanes = (S.clip ? [clipPlane] : []).concat(CTX.planes);
          m.skin.material.needsUpdate = true;
        }
      });
      /* in context the block can be trimmed to a window the organ continues from: the
         cut faces and the outlines are trimmed with it */
      if (CTX.planes.length || CTX.hadPlanes) {
        meshes.forEach(m => {
          if (m.round) return;
          m.cap.material.clippingPlanes = [clipPlane].concat(CTX.planes);
          m.cap.material.needsUpdate = true;
        });
        edgeMat.clippingPlanes = [clipPlane].concat(CTX.planes);
        edgeMat.needsUpdate = true;
        CTX.hadPlanes = CTX.planes.length > 0;
      }
      /* set into an organ, a solid block's outlines are seams: they stay for see-through */
      if (CTX.obj && !see) edgeMat.opacity = 0;
      ctxView();
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
    function stepCam(now, dt) {
      const h = clamp(dt || 1 / 60, 0.001, 0.05);
      /* stiffness and damping: just under critical, so the move has a soft landing */
      const K = 34, C = 2 * Math.sqrt(K) * 0.94;
      const adv = (key, target, wrap) => {
        let d = target - cam[key];
        if (wrap) d = ((d + 540) % 360) - 180;
        const a = d * K - camV[key] * C;
        camV[key] += a * h;
        cam[key] += camV[key] * h;
      };
      adv('az', goal.az, true);
      adv('el', goal.el); adv('d', goal.d);
      adv('tx', goal.tx); adv('ty', goal.ty); adv('tz', goal.tz);
      /* keep the orbit inside the same limits the drag handler uses */
      cam.el = clamp(cam.el, 2, 90);
      cam.d = clamp(cam.d, 4, 240);
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
      camV.az = 0; camV.el = 0;
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
      /* a technique whose bite is already in the skin starts with it finished */
      let st = { p: 0, q: 0, k: 0, c: 0, tie: 0 }, done = tech.preplaced ? tech.passes.length : 0;
      tech.steps.forEach((s, i) => {
        const o = {
          i, title: s.t, body: s.b, cam: s.cam || '3d', marks: s.marks || [],
          rows: !!s.rows, lock: s.lock == null ? -1 : s.lock,
          knot: !!s.knot, cut: !!s.cut,
          kind: s.pass != null ? 'pass' : 'cine', pi: s.pass == null ? -1 : s.pass,
          /* a step may run a run of bites in sequence (`passEnd`), which is how a
             continuous line or a ring is shown as one unbroken movement */
          passTo: s.pass == null ? -1 : (s.passEnd == null ? s.pass : s.passEnd),
          doneBefore: done,
          f0: s.f0 == null ? 0 : s.f0, f1: s.f1 == null ? 1 : s.f1
        };
        const from = Object.assign({}, st);
        /* a pass step lasts as long as its movement takes, which the needle's own
           program decides below; any other beat keeps its written length */
        const dur = o.kind === 'pass' ? 1 : (s.dur || 3.2);
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
      /* the pass steps are timed from the needle's own program */
      buildDrive();
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
        k: lerp(s.from.k, s.to.k, e), c: lerp(s.from.c, s.to.c, e),
        /* the tie runs at an even rate through its steps: its own phases ease, so a
           step boundary inside a throw is not a stop */
        tie: lerp(s.from.tie || 0, s.to.tie || 0, l)
      };
      /* on the knot tab the wound closes as the first throw is drawn down */
      if (tech.tie) st.p = Math.max(st.p, ss(clamp((st.tie - 0.62) / 0.38, 0, 1)));
      /* the needle's progress comes from its own program, and every bite before
         the one in hand is finished */
      const rig = rigAt(t);
      const prog = [];
      for (let j = 0; j < arcs.length; j++) {
        if (rig) prog[j] = j < rig.pi ? 1 : (j === rig.pi ? rig.prog : 0);
        else prog[j] = j < s.doneBefore ? 1 : 0;
      }
      return { i, l, s, st, prog, rig };
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
        ci.setAttribute('r', 2.8);
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
      if (base.tailD != null) c.tailD = +(base.tailD * k).toFixed(2);
      c.steps = base.steps.map(s => s.marks ? Object.assign({}, s, {
        marks: s.marks.map(mk => Array.isArray(mk.at)
          ? Object.assign({}, mk, { at: [mk.at[0], +(mk.at[1] * k).toFixed(2), +(mk.at[2] * k).toFixed(2), mk.at[3]] })
          : mk)
      }) : s);
      return c;
    }

    /* ---------- anatomical context (assets/context.js, optional) ----------
       The "Organ view" puts the organ or region a technique is used on around the working
       block. The block is never moved or reshaped - the needle, the thread and the tie
       all depend on it - so the site is built around it, the block's layers take the
       site's names and colours, and the block can be trimmed to a window the organ
       continues from. With the context off none of this changes anything. */
    const ctxQ = new URLSearchParams(location.search);
    /* on by default; ?scene=block shows the plain tissue block instead */
    const CTX = { on: ctxQ.get('scene') !== 'block', site: (ctxQ.get('site') || '').toLowerCase(), obj: null, planes: [], hadPlanes: false };
    function ctxSites() { return (window.SutureContext && tech) ? window.SutureContext.sitesFor(tech.id) : []; }
    function disposeContext() {
      if (!CTX.obj) return;
      scene.remove(CTX.obj.group);
      CTX.obj.dispose();
      CTX.obj = null;
      CTX.planes = [];
    }
    function layerLook(i) {
      const ov = CTX.obj && CTX.obj.layers;
      return (ov && ov[i]) || tissue.layers[i];
    }
    /* the block's colours: the site's with the context on, the technique's own with it off */
    function applyLayerLook() {
      const plain = !!(CTX.obj && CTX.obj.plainTop);
      /* inside an organ the block does not shadow itself: on a plain wet surface that
         self-shadow shows as rings; the instruments still cast onto it */
      const selfShadow = !CTX.obj;
      const gl = CTX.obj && CTX.obj.gloss;
      meshes.forEach(m => {
        if (m.round) {
          [[m.ring, 0], [m.m, 1], [m.muc, 2]].forEach(([o, i]) => {
            const L = layerLook(i);
            o.castShadow = selfShadow;
            o.material.roughness = gl ? gl.roughness : 0.95;
            o.material.envMapIntensity = gl ? gl.env : 0.12;
            const mp = (i === 0 && CTX.obj && CTX.obj.topMap) || null;
            if (o.material.map !== mp) { o.material.map = mp; o.material.needsUpdate = true; }
            o.userData.base = new T3.Color(L.c);
            o.userData.see = new T3.Color(L.sc || L.c);
            o.material.emissive.copy(new T3.Color(L.c).multiplyScalar(0.05));
          });
          [[m.capSkin, 0], [m.capMus, 1], [m.capMuc, 2]].forEach(([cm, i]) => {
            const L = layerLook(i);
            cm.userData = { base: new T3.Color(L.c), see: new T3.Color(L.sc || L.c) };
          });
          return;
        }
        const L = layerLook(m.li);
        m.m.castShadow = selfShadow;
        m.m.material.roughness = gl ? gl.roughness : 0.94;
        m.m.material.envMapIntensity = gl ? gl.env : 0.12;
        m.m.userData.base = new T3.Color(L.c);
        m.m.userData.see = new T3.Color(L.sc || L.c);
        m.m.material.emissive.copy(new T3.Color(L.c).multiplyScalar(0.05));
        m.cap.material.emissive.copy(new T3.Color(L.c).multiplyScalar(0.16));
        if (m.li === 0) {
          /* fascia, serosa and uterus are not shaved skin: no stubble on them */
          if (!('map0' in m.m.userData)) m.m.userData.map0 = m.m.material.map;
          const mp = plain ? (CTX.obj.topMap || null) : m.m.userData.map0;
          if (m.m.material.map !== mp) {
            m.m.material.map = mp; m.m.material.bumpMap = mp;
            m.m.material.needsUpdate = true;
          }
          if (m.skin) m.skin.visible = !plain;
        }
      });
    }
    function buildContext() {
      const fog0 = !!scene.fog;
      disposeContext();
      const sites = ctxSites();
      if (CTX.on && sites.length) {
        const site = sites.indexOf(CTX.site) >= 0 ? CTX.site : sites[0];
        CTX.obj = window.SutureContext.build(tech.id, site, { T3, tissue, species: species(), clipPlane, cur });
      }
      const o = CTX.obj;
      if (o) {
        scene.add(o.group);
        CTX.planes = o.clipX ? [new T3.Plane(new V3(-1, 0, 0), o.clipX), new T3.Plane(new V3(1, 0, 0), o.clipX)] : [];
        if (o.update) o.update(cur);
      }
      if (gridG) gridG.visible = !o;
      /* the organ fades into the dark away from the wound instead of ending at an edge */
      scene.fog = o ? new T3.Fog(scene.background.getHex(), 120, 300) : null;
      if (fog0 !== !!scene.fog) scene.traverse(n => { if (n.material) [].concat(n.material).forEach(mm => { mm.needsUpdate = true; }); });
      applyLayerLook();
      applyViewFlags();
      if (opts.onContext) opts.onContext(contextInfo());
    }
    function contextInfo() {
      const sites = ctxSites(), o = CTX.obj;
      return {
        available: sites.length > 0,
        on: !!o,
        site: o ? o.site : null,
        sites: sites.map(id => ({ id, label: window.SutureContext.label(id) })),
        caption: o ? o.caption : '',
        layers: o ? tissue.layers.map((L, i) => ({ n: layerLook(i).n, c: layerLook(i).c })) : null,
        extra: o ? (o.legend || []) : []
      };
    }
    function ctxView() {
      if (!CTX.obj) return;
      const A = ringCutArc || arcs[0];
      CTX.obj.view({ clip: !!S.clip, see: !!S.seeThrough, type: tissue.type, cutZ, az: tissue.type === 'round' && A ? ringCutAz(A) : 0 });
    }

    /* ---------- public: load ---------- */
    function load(id) {
      disposeContext();
      const base = window.SUTURE.TECHNIQUES.find(t => t.id === id) || window.SUTURE.TECHNIQUES[0];
      tech = scaleTech(base, species());
      tissue = tech.tissue;
      S.t = 0; S.playing = !reduced; S.auto = true; S.rows = false; S.lock = -1;
      curStep = -1; lastKey = ''; lastP = -1;
      threadKey = '';
      wantView = ''; wantAt = 0; holdArc = null; holdProg = 0;
      scisVis = 0; scisLastT = -1; holderBase = -1;
      makeMeshes();
      buildGeometry(0);
      buildLocks();
      buildGhostRows();
      compile();
      buildContext();
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

    let onScreen = true, idleFrames = 0, lastSig = '';
    if (window.IntersectionObserver) {
      new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; }).observe(host);
    }
    /* everything that changes what the frame shows */
    function frameSig() {
      return [tech && tech.id, speciesId, CTX.on, CTX.site, S.t.toFixed(4), S.view, S.seeThrough, S.auto,
        goal.az.toFixed(2), goal.el.toFixed(2), goal.d.toFixed(2), goal.tx.toFixed(2), goal.ty.toFixed(2), goal.tz.toFixed(2),
        cv.width, cv.height].join('|');
    }
    function isIdle() {
      if (S.playing || drag) { idleFrames = 0; lastSig = ''; return false; }
      const settled = ['az', 'el', 'd', 'tx', 'ty', 'tz'].every(k =>
        Math.abs(camV[k]) < 0.002 && Math.abs((k === 'az' ? ((goal[k] - cam[k] + 540) % 360) - 180 : goal[k] - cam[k])) < 0.002);
      const sig = frameSig();
      if (!settled || sig !== lastSig) { lastSig = sig; idleFrames = 0; return false; }
      /* a few more frames after the last change, so everything has caught up */
      return ++idleFrames > 4;
    }
    function frame(now) {
      /* hidden behind another player (the technique lab's knot tab): draw nothing
         and report nothing until the canvas is shown again */
      if (!cv.offsetWidth) { last = now; requestAnimationFrame(frame); return; }
      /* Rest when there is nothing new to draw: scrolled out of view, or paused with
         the camera settled and nothing changed. The last frame stays on screen, so the
         picture is the same; a phone just stops redrawing it sixty times a second. */
      if (!onScreen || isIdle()) { last = now; requestAnimationFrame(frame); return; }
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      frameDt = dt;
      if (S.playing) {
        S.t += dt * S.speed;
        if (S.t >= total) { S.t = total; S.playing = false; }
      }
      let E = evalAt(S.t);
      if (Math.abs(E.st.p - lastP) > 0.004 || lastP < 0) {
        buildGeometry(E.st.p);
        lastP = E.st.p;
        lastKey = '';
        /* the arcs have moved with the tissue, so the needle's pose has too */
        if (DRIVE) E = evalAt(S.t);
      }
      const R = E.rig || null;
      /* once the needle has been handed off, the tie decides the strand and the hand */
      const tieTime = !R && tech.tie && (!DRIVE || S.t >= DRIVE.segs[DRIVE.segs.length - 1].t1);
      const TS = tieTime ? tieState(E.st.tie, E.st.c) : null;
      const key = [E.st.p, E.st.q, E.st.k, E.st.c, E.st.tie, E.prog.map(v => v.toFixed(3)).join('.'),
        R ? R.swage.toArray().map(v => v.toFixed(3)).join(',') + (R.cut || 0).toFixed(3) : ''].join('|');
      /* the cord only needs rebuilding when the pose has changed */
      const route = TS ? TS.route : threadLive(E.st, E.prog, R);
      endPts = route;
      if (key !== lastKey) setThread(route, !!TS);
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
      /* which bite of a multi-bite step the needle is on right now */
      let actPi = pi;
      if (pi >= 0) {
        actPi = pEnd;
        for (let k = pi; k <= pEnd; k++) if ((E.prog[k] || 0) < 0.999) { actPi = k; break; }
        /* the default movement knows which bite the needle is in, drawing out included */
        if (R && R.pi >= pi && R.pi <= pEnd) actPi = R.pi;
      }
      /* The ring's cut is framed on one bite, so it has to move to the bite being
         worked when the next one starts. */
      if (tissue.type === 'round' && S.auto && S.view === 'section') {
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
      /* the needle and the hand are wherever the needle's program says now */
      if (R) {
        lastArc = holdArc = arcs[R.pi];
        holdProg = R.prog;
        drawPose(R.pose, R.nVis);
        setHolderRig(R.holder, 1);
        if (E.s.knot) placeScissors(0, E.l, 0);
      } else if (TS) {
        if (needleG) needleG.visible = false;
        setHolderRig(TS.holder);
        if (E.s.cut) {
          /* in, snip, away - the snip is the moment the tails are cut */
          const come = ss(clamp(E.l / 0.3, 0, 1));
          const go = ss(clamp((E.l - 0.8) / 0.2, 0, 1));
          placeScissors(1, come * (1 - go), ss(clamp((E.l - 0.46) / 0.16, 0, 1)));
        } else placeScissors(0, E.l, 0);
      } else {
        /* before the needle comes in: nothing in the field yet */
        if (needleG) needleG.visible = false;
        setHolderRig(null);
        placeScissors(0, E.l, 0);
      }
      /* The camera follows the needle itself: the oblique view while it is above the
         skin, a cross-section the moment it is through it. The needle is a whole
         needle in a hand, standing well up off the skin before it goes in, so seen
         from overhead it would point straight at the camera. */
      if (S.auto && pi >= 0 && needleG && needleG.visible) {
        const want = needleInside ? (offPlane(lastArc) ? '3d' : 'section') : '3d';
        /* only move once the needle has really changed state, so a tip crossing the
           skin twice in quick succession does not make the camera flicker */
        if (want !== wantView) { wantView = want; wantAt = now; }
        else if (view !== want && now - wantAt > 260) setView(want, false, true);
      } else wantView = '';
      /* the skin's reaction is stepped once per frame, from whatever the needle is
         actually doing - including nothing, when the tent has to spring back */
      reactStep(needleG && needleG.visible ? holdArc : null,
        needleG && needleG.visible ? holdProg : 0, dt);
      placeLocks(E.prog);
      applyGhosts(E);
      stepCam(now, dt);
      updateAnns(E.l > 0.18);
      orderTissue();
      if (scene.fog) { scene.fog.near = cam.d * 0.85 + 18; scene.fog.far = cam.d * 2.3 + 80; }
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
      get species() { return speciesId; },
      setSpecies(id) {
        speciesId = id;
        if (tech) load(tech.id);
        return speciesId;
      },
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
      /* the anatomical context: on or off, and which site where a technique has two */
      get context() { return contextInfo(); },
      setContext(on, site) {
        CTX.on = !!on;
        if (site) CTX.site = String(site).toLowerCase();
        if (tech) { buildContext(); if (S.auto) setView(view, false, true); }
        return contextInfo();
      },
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
