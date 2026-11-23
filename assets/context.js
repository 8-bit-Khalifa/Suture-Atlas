/* Suture Atlas — anatomical context for the technique lab (the "Organ view", on by default).
   Each technique can be shown at the site it is usually used on: the organ or region is
   built here from procedural geometry and placed around the engine's working tissue
   block. The block itself is never moved or reshaped (the needle, thread and tie all
   depend on it): a site only adds its surroundings, gives the block's layers the site's
   names and colours, can trim the block to a window the organ continues from, and draws
   the organ's cut faces for the cross-section. Remove this file and the lab is exactly
   as it was. Units are millimetres, at the same legible scale as the block. */
window.SutureContext = (function () {
  'use strict';
  const PI = Math.PI;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const gauss = (x, z) => Math.exp(-(x * x + z * z));
  const rgb = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  const hex = c => (Math.round(clamp(c[0], 0, 1) * 255) << 16) | (Math.round(clamp(c[1], 0, 1) * 255) << 8) | Math.round(clamp(c[2], 0, 1) * 255);
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  function lin(a, b, n) { const o = []; for (let i = 0; i <= n; i++) o.push(i === n ? b : lerp(a, b, i / n)); return o; }
  function join() { let o = []; for (let k = 0; k < arguments.length; k++) o = o.concat(o.length ? arguments[k].slice(1) : arguments[k]); return o; }
  function near(arr, v) { let b = 0; arr.forEach((a, i) => { if (Math.abs(a - v) < Math.abs(arr[b] - v)) b = i; }); return b; }
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  function circlePoly(cx, cy, r, n) { const o = []; n = n || 28; for (let i = 0; i < n; i++) { const a = 2 * PI * i / n; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; }

  /* ---------------- which site for which technique ---------------- */
  const BY_TECH = {
    interrupted: ['limb'], lembert: ['bowel'], horizontal: ['fascia'], cross: ['joint'],
    vertical: ['flank'], interlock: ['linea'], intradermal: ['belly'], cushing: ['uterus'], purse: ['anus', 'stomach']
  };
  const SITES = {
    limb: { name: 'skin laceration on a forelimb', label: 'Forelimb skin', make: k => skinSite(k, 'limb') },
    joint: { name: 'loose skin over the elbow', label: 'Elbow skin', make: k => skinSite(k, 'joint') },
    flank: { name: 'flank skin under tension', label: 'Flank skin', make: k => skinSite(k, 'flank') },
    belly: { name: 'belly skin, closing a spay incision', label: 'Belly skin', make: k => skinSite(k, 'belly') },
    fascia: { name: 'abdominal wall fascia (external rectus sheath)', label: 'Abdominal fascia', make: k => abdomenSite(k, false) },
    linea: { name: 'linea alba, laparotomy closure', label: 'Linea alba', make: k => abdomenSite(k, true) },
    bowel: { name: 'small intestine, enterotomy closure', label: 'Small intestine', make: k => tubeSite(k, 'bowel') },
    uterus: { name: 'uterus, caesarean closure', label: 'Uterus', make: k => tubeSite(k, 'uterus') },
    anus: { name: 'anus, after reducing a rectal prolapse', label: 'Anus · rectal prolapse', make: anusSite },
    stomach: { name: 'stomach wall around a gastrostomy feeding tube', label: 'Stomach · feeding tube', make: stomachSite }
  };
  const COAT = { dog: 0x8a6646, cat: 0x7a736c, horse: 0x55361f, sheep: 0xe4d9bf, cattle: 0x6a3a24 };
  /* how far the coat stands off the skin, in mm: a sheep's fleece is deep */
  const FUR = { sheep: 4.2, cattle: 1.3 };
  const DRAPE = 0x2d6470;
  const BONE = 0xeee4cc;

  /* ---------------- textures (drawn once, shared) ---------------- */
  let texStrand = null, texWet = null;
  /* short strands lying mostly one way: stubble on clipped skin, a coat where it is not */
  function strandTex(T3) {
    if (texStrand) return texStrand;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3200; i++) {
      const px = Math.random() * 256, py = Math.random() * 256;
      const a = 1.25 + (Math.random() - 0.5) * 0.8, len = 3 + Math.random() * 8;
      const dark = Math.random() < 0.72;
      x.strokeStyle = dark ? 'rgba(46,30,20,' + (0.10 + Math.random() * 0.24).toFixed(3) + ')'
        : 'rgba(255,246,232,' + (0.12 + Math.random() * 0.22).toFixed(3) + ')';
      x.lineWidth = 0.7 + Math.random() * 1.1;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
    }
    texStrand = new T3.CanvasTexture(c);
    texStrand.wrapS = texStrand.wrapT = T3.RepeatWrapping;
    texStrand.anisotropy = 4;
    return texStrand;
  }
  /* a moist serosal surface: soft mottling and a few fine capillaries */
  function wetTex(T3) {
    if (texWet) return texWet;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 140; i++) {
      x.fillStyle = 'rgba(160,70,70,' + (0.025 + Math.random() * 0.05).toFixed(3) + ')';
      x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 26, 0, 2 * PI); x.fill();
    }
    for (let i = 0; i < 46; i++) {
      x.strokeStyle = 'rgba(150,30,40,' + (0.08 + Math.random() * 0.14).toFixed(3) + ')';
      x.lineWidth = 0.6 + Math.random() * 0.9;
      const px = Math.random() * 256, py = Math.random() * 256;
      x.beginPath(); x.moveTo(px, py);
      x.quadraticCurveTo(px + (Math.random() - 0.5) * 60, py + (Math.random() - 0.5) * 60, px + (Math.random() - 0.5) * 90, py + (Math.random() - 0.5) * 90);
      x.stroke();
    }
    texWet = new T3.CanvasTexture(c);
    texWet.wrapS = texWet.wrapT = T3.RepeatWrapping;
    texWet.anisotropy = 4;
    return texWet;
  }

  /* ---------------- the kit every site is built with ---------------- */
  function kit(env) {
    const T3 = env.T3;
    const sp = env.species || { id: 'dog', name: 'Dog', thick: 1 };
    const K = {
      T3, env, sp,
      /* a cat is smaller and a horse larger, but never smaller than the block itself */
      sz: clamp(0.55 + 0.45 * (sp.thick || 1), 0.8, 1.25),
      group: new T3.Group(), capsG: new T3.Group(),
      mats: [], geos: [], capMeshes: [], cutHidden: [],
      clip: false, capKey: '', lastView: null, caps: null
    };
    K.group.add(K.capsG);
    K.capsG.visible = false;
    K.M = o => {
      /* The surroundings are drawn with cheaper shading than the working tissue: the
         organ fills most of the screen, so its cost is paid on nearly every pixel. A
         shiny, wet surface keeps a simple highlight; a matte one (skin, coat, drape) is
         lit per vertex, which looks the same on a matte surface. No bump maps and no
         environment reflections out here. */
      const p = Object.assign({}, o);
      const rough = p.roughness == null ? 0.82 : p.roughness;
      const env = p.envMapIntensity == null ? 0.16 : p.envMapIntensity;
      ['roughness', 'metalness', 'envMapIntensity', 'bumpMap', 'bumpScale'].forEach(k => { delete p[k]; });
      const m = rough <= 0.55
        ? new T3.MeshPhongMaterial(Object.assign({ specular: 0x262626, shininess: Math.round((1 - rough) * 55) }, p))
        : new T3.MeshLambertMaterial(p);
      /* the studio light a surface used to pick up from the environment, given back as
         brightness, so the organ still matches the tissue in the window */
      m.color.multiplyScalar(1 + env * 0.8);
      K.mats.push(m);
      return m;
    };
    K.mesh = (geo, mat, o) => {
      o = o || {};
      K.geos.push(geo);
      const me = new T3.Mesh(geo, mat);
      /* the instruments' shadows fall on the working tissue; out here they would cost
         a shadow lookup on almost every pixel for nearly nothing */
      me.receiveShadow = false;
      me.castShadow = !!o.cast;
      if (o.noCut) K.cutHidden.push(me);
      if (o.order != null) me.renderOrder = o.order;
      K.group.add(me);
      return me;
    };
    /* Small repeated parts (vessels, teats) are queued by material and drawn as one
       mesh each: a phone pays for every separate object it draws, not for the detail
       inside one. */
    K.batch = new Map();
    K.queue = (geo, mat) => {
      if (!K.batch.has(mat)) K.batch.set(mat, []);
      K.batch.get(mat).push(geo);
    };
    K.flush = () => {
      K.batch.forEach((geos, mat) => { if (geos.length) K.mesh(mergeGeos(T3, geos), mat); });
      K.batch.clear();
    };
    K.coat = rgb(COAT[sp.id] || COAT.dog);
    K.furH = (FUR[sp.id] || 1.5) * K.sz;
    K.coatName = sp.id === 'sheep' ? 'Fleece' : 'Hair coat';
    /* bigger animals take wider bites, so the window the organ continues from widens
       with them and the thread never lies beyond it */
    K.kb = clamp(sp.bite || 1, 1, 1.45);
    return K;
  }
  /* several indexed geometries with the same attributes, as one */
  function mergeGeos(T3, geos) {
    let nv = 0, ni = 0;
    geos.forEach(g => { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let ov = 0, oi = 0;
    geos.forEach(g => {
      const n = g.attributes.position.count;
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.set(g.attributes.position.array, ov * 3);
      nor.set(g.attributes.normal.array, ov * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, ov * 2);
      if (g.index) { const I = g.index.array; for (let k = 0; k < I.length; k++) idx[oi + k] = I[k] + ov; oi += I.length; }
      else { for (let k = 0; k < n; k++) idx[oi + k] = k + ov; oi += n; }
      ov += n;
      g.dispose();
    });
    const m = new T3.BufferGeometry();
    m.setAttribute('position', new T3.BufferAttribute(pos, 3));
    m.setAttribute('normal', new T3.BufferAttribute(nor, 3));
    m.setAttribute('uv', new T3.BufferAttribute(uv, 2));
    m.setIndex(new T3.BufferAttribute(idx, 1));
    m.computeBoundingSphere();
    return m;
  }
  function setCaps(K, list) {
    const T3 = K.T3;
    K.capMeshes.forEach(m => { K.capsG.remove(m); m.geometry.dispose(); m.material.dispose(); });
    K.capMeshes = [];
    list.forEach(b => {
      if (!b.poly || b.poly.length < 3) return;
      const shape = new T3.Shape(b.poly.map(p => new T3.Vector2(p[0], p[1])));
      const geo = new T3.ShapeGeometry(shape);
      const mat = new T3.MeshLambertMaterial({ color: b.c, side: T3.DoubleSide });
      mat.userData = { c: b.c, sc: b.sc || b.c };
      const me = new T3.Mesh(geo, mat);
      me.position.z = b.z || 0;
      K.capsG.add(me);
      K.capMeshes.push(me);
    });
  }
  /* the engine's view state: cut or not, which plane, see-through or not */
  function view(K, info) {
    K.lastView = info;
    const clip = !!info.clip;
    if (clip !== K.clip) {
      K.clip = clip;
      K.mats.forEach(m => { m.clippingPlanes = clip ? [K.env.clipPlane] : []; m.needsUpdate = true; });
      K.cutHidden.forEach(o => { o.visible = !clip; });
    }
    K.capsG.visible = clip && !!K.caps;
    if (!clip || !K.caps) return;
    const key = K.caps.key(info);
    if (key !== K.capKey) { K.capKey = key; setCaps(K, K.caps.make(info)); }
    if (info.type === 'round') { K.capsG.rotation.y = info.az - PI / 2; K.capsG.position.z = 0; }
    else { K.capsG.rotation.y = 0; K.capsG.position.z = info.cutZ - 0.12; }
    /* the block's own cut face takes the see-through palette on a line wound, so the
       organ's does too; the ring's cut face keeps its true colours */
    const seeCol = info.see && info.type !== 'round';
    /* the glow stays the base colour's, as on the block's own cut face */
    K.capMeshes.forEach(me => {
      me.material.color.setHex(seeCol ? me.material.userData.sc : me.material.userData.c);
      me.material.emissive.setHex(me.material.userData.c).multiplyScalar(0.16);
    });
  }
  function dispose(K) {
    setCaps(K, []);
    K.geos.forEach(g => g.dispose());
    K.mats.forEach(m => m.dispose());
  }

  /* ---------------- geometry ---------------- */
  /* A grid of points P(i, j) made into one surface; `hole(i, j)` leaves out the cell
     between columns i, i+1 and rows j, j+1 (where the tissue block sits). */
  function gridGeo(K, nu, nv, P, opt) {
    opt = opt || {};
    const T3 = K.T3, W = nu + 1, n = W * (nv + 1);
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const k = j * W + i, q = P(i, j);
      pos.set(q.p, k * 3);
      col.set(q.c || [1, 1, 1], k * 3);
      uv.set(q.t || [q.p[0] * 0.04, q.p[2] * 0.04], k * 2);
    }
    const idx = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      if (opt.hole && opt.hole(i, j)) continue;
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      if (opt.flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.BufferAttribute(pos, 3));
    g.setAttribute('color', new T3.BufferAttribute(col, 3));
    g.setAttribute('uv', new T3.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function bez(P0, P1, P2, P3, t) {
    const u = 1 - t;
    return [u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0],
      u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1]];
  }
  /* normals (outward, for a counter-clockwise loop) and arc length along a closed profile */
  function finishLoop(raw, iR, iL) {
    const N = raw.length, L = [];
    let s = 0;
    for (let i = 0; i < N; i++) {
      const p = raw[i], pn = raw[(i + 1) % N], pp = raw[(i - 1 + N) % N];
      if (i) s += Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]);
      let tx = pn[0] - pp[0], ty = pn[1] - pp[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      L.push({ x: p[0], y: p[1], nx: ty, ny: -tx, s, win: i >= iR && i <= iL });
    }
    L.total = s + Math.hypot(raw[0][0] - raw[N - 1][0], raw[0][1] - raw[N - 1][1]);
    L.iR = iR; L.iL = iL;
    return L;
  }
  /* A limb, a trunk, a bowel in cross-section: flat across the top for exactly the width
     of the window (so the organ meets the block level and tangent), rounding over the
     shoulders and under the bottom. Counter-clockwise, starting at the bottom centre. */
  function loafLoop(X, W, H, q, nTop, nSide, nBot) {
    const yW = -q * H, b = H - q * H;
    const P0 = [W, yW], P1 = [W, yW * 0.45], P2 = [X + (W - X) * 0.55, 0], P3 = [X, 0];
    const pts = [];
    for (let i = 0; i < nBot; i++) { const a = -PI / 2 + (PI / 2) * i / nBot; pts.push([W * Math.cos(a), yW + b * Math.sin(a)]); }
    for (let i = 0; i < nSide; i++) pts.push(bez(P0, P1, P2, P3, i / nSide));
    const iR = pts.length;
    for (let i = 0; i <= nTop; i++) pts.push([i === nTop ? -X : lerp(X, -X, i / nTop), 0]);
    const iL = pts.length - 1;
    for (let i = 1; i <= nSide; i++) { const p = bez(P0, P1, P2, P3, 1 - i / nSide); pts.push([-p[0], p[1]]); }
    for (let i = 1; i < nBot; i++) { const a = PI + (PI / 2) * i / nBot; pts.push([W * Math.cos(a), yW + b * Math.sin(a)]); }
    return finishLoop(pts, iR, iL);
  }
  function strip(L, i0, i1) {
    const N = L.length, out = [];
    for (let i = i0, n = 0; n <= N; i = (i + 1) % N, n++) { out.push(L[i]); if (i === i1) break; }
    return out;
  }
  /* the part of a profile between depth d0 and d1 under its surface, as one polygon */
  function band(pts, d0, d1) {
    return pts.map(q => [q.x - q.nx * d0, q.y - q.ny * d0])
      .concat(pts.slice().reverse().map(q => [q.x - q.nx * d1, q.y - q.ny * d1]));
  }
  /* The axis runs straight along z through the wound, then bends down on both sides
     (a flexed joint, a loop of bowel lifted out). The frame's x stays world x. */
  function bendFrame(Zs, Rb, phiMax) {
    return z => {
      const sg = z < 0 ? -1 : 1, a = Math.abs(z);
      if (a <= Zs) return { A: [0, 0, z], U: [0, 1, 0] };
      const s = a - Zs, sArc = Rb * phiMax, phi = Math.min(s / Rb, phiMax);
      let Ay = -Rb + Rb * Math.cos(phi), Az = Zs + Rb * Math.sin(phi);
      if (s > sArc) { const e = s - sArc; Ay -= Math.sin(phiMax) * e; Az += Math.cos(phiMax) * e; }
      return { A: [0, Ay, sg * Az], U: [0, Math.cos(phi), sg * Math.sin(phi)] };
    };
  }
  function worldPt(frame, x, y, z) {
    const F = frame ? frame(z) : null;
    return F ? [F.A[0] + x, F.A[1] + y * F.U[1], F.A[2] + y * F.U[2]] : [x, y, z];
  }
  /* a profile carried along z, optionally bent, offset and coloured per point */
  function sweep(K, loopAt, zs, o) {
    const loops = zs.map((z, j) => loopAt(j)), N = loops[0].length;
    return gridGeo(K, N, zs.length - 1, (i, j) => {
      const L = loops[j], q = L[i % N], z = zs[j];
      const off = o.off ? o.off(q, z) : 0;
      const p = worldPt(o.frame, q.x + q.nx * off, q.y + q.ny * off, z);
      return { p, c: o.color ? o.color(q, z) : null, t: [(i === N ? L.total : q.s) * 0.04, z * 0.04] };
    }, { hole: o.hole, flip: o.flip });
  }
  function vessel(K, pts, r, mat) {
    const T3 = K.T3;
    if (pts.length < 2) return;
    const curve = new T3.CatmullRomCurve3(pts.map(p => new T3.Vector3(p[0], p[1], p[2])));
    K.queue(new T3.TubeGeometry(curve, Math.max(8, pts.length * 4), r, 5, false), mat);
  }
  function drapePlane(K, y) {
    const T3 = K.T3, g = new T3.PlaneGeometry(900, 900, 1, 1);
    g.rotateX(-PI / 2);
    g.translate(0, y, 0);
    K.mesh(g, K.M({ color: DRAPE, roughness: 1, envMapIntensity: 0.05 }));
  }
  const skinMat = K => K.M({ vertexColors: true, map: strandTex(K.T3), bumpMap: strandTex(K.T3), bumpScale: 0.04, roughness: 0.86 });
  const layerSum = t => t.layers.reduce((s, L) => s + L.t, 0);

  /* ================= skin: forelimb, elbow, flank ================= */
  function skinSite(K, kind) {
    const t = K.env.tissue, hz = t.hz, X = 22 * K.kb, sz = K.sz, T = layerSum(t);
    const P = {
      limb: { W: 54, H: 94, q: 0.46, L: 210, clipA: 18, clipZ: 30, drapeY: -98, wide: 1.55 },
      joint: { W: 54, H: 94, q: 0.46, L: 150, clipA: 18, clipZ: 26, drapeY: -170, wide: 1.6 },
      flank: { W: 120, H: 180, q: 0.5, L: 260, clipA: 30, clipZ: 42, drapeY: -186, wide: 1.6 },
      /* the belly, animal on its back: a wide clipped field round a midline incision */
      belly: { W: 120, H: 170, q: 0.5, L: 260, clipA: 44, clipZ: 62, drapeY: -176, wide: 1.6 }
    }[kind];
    const W = P.W * sz, H = P.H * sz;
    const loop = loafLoop(X, W, H, P.q, 22, 18, 20);
    const zs = join(lin(-P.L, -hz - 40, 10), lin(-hz - 40, -hz, 16), lin(-hz, hz, 14), lin(hz, hz + 40, 16), lin(hz + 40, P.L, 10));
    const j0 = near(zs, -hz), j1 = near(zs, hz);
    const sR = loop[loop.iR].s, sL = loop[loop.iL].s;
    const dArc = q => q.win ? 0 : (q.s < sR ? sR - q.s : q.s - sL);
    /* clipped round the wound for surgery, the coat beyond */
    const furW = (q, z) => smooth(1, 1.18, Math.hypot(dArc(q) / P.clipA, Math.max(0, Math.abs(z) - hz) / P.clipZ));
    const skin = rgb(t.layers[0].c);
    const frame = kind === 'joint' ? bendFrame(hz + 8, 130, 0.78) : null;
    const bump = (q, z) => {
      const a = Math.abs(z), da = dArc(q);
      if (kind === 'joint') {
        /* loose skin over the joint lies in soft transverse folds either side of the wound */
        if (a < hz) return 0;
        const s = Math.sin((a - hz) * 0.62);
        return 0.75 * s * s * smooth(hz, hz + 3, a) * (1 - smooth(hz + 22, hz + 32, a)) * (1 - smooth(14, 26, da));
      }
      if (kind === 'flank') {
        /* the last ribs towards the head, the thigh towards the tail */
        const c = Math.cos(z * 0.42);
        const ribs = 0.9 * (0.5 + 0.5 * c) * smooth(-48, -80, z);
        const thigh = 18 * sz * Math.exp(-Math.pow((z - 175) / 55, 2)) * Math.exp(-Math.pow((q.x - 10) / 85, 2)) * (q.y > -H * 0.6 ? 1 : 0);
        return ribs + thigh;
      }
      return 0;
    };
    const coatAt = q => kind === 'flank'
      ? mix(scl(K.coat, 0.78), scl(K.coat, 1.18), smooth(-90 * sz, 90 * sz, q.x))   /* darker along the back */
      : kind === 'belly' ? mix(K.coat, [1, 0.97, 0.92], 0.35)                    /* the belly's paler coat */
        : K.coat;
    const geo = sweep(K, () => loop, zs, {
      frame,
      hole: (i, j) => i >= loop.iR && i < loop.iL && j >= j0 && j < j1,
      off: (q, z) => K.furH * furW(q, z) + bump(q, z),
      color: (q, z) => mix(skin, coatAt(q), furW(q, z))
    });
    K.mesh(geo, skinMat(K));
    drapePlane(K, P.drapeY * sz);
    /* a bitch or queen has two rows of teats down the belly, inside the clipped field */
    if (kind === 'belly' && (K.sp.id === 'dog' || K.sp.id === 'cat')) {
      const T3 = K.T3, nipMat = K.M({ color: 0xa96f66, roughness: 0.7 });
      [-1, 1].forEach(sg => {
        let q = loop[0];
        loop.forEach(p => { if (Math.abs(p.x - sg * 46 * sz) < Math.abs(q.x - sg * 46 * sz) && p.y > -40) q = p; });
        [-96, -48, 0, 48, 96].forEach(z => {
          const g = new T3.SphereGeometry(1, 14, 10);
          g.scale(2.2 * sz, 1.3, 2.2 * sz);
          g.translate(q.x, q.y + 0.2, z);
          K.queue(g, nipMat);
        });
      });
    }

    /* the cut face: the skin's own layers carried round the limb, then what lies inside */
    const inner = [];
    let core = { c: 0x8e2c40, sc: 0xb98089 }, extra = [];
    if (kind === 'limb') {
      inner.push({ poly: circlePoly(-9 * sz, -T - 20 * sz, 7 * sz), c: BONE });
      inner.push({ poly: circlePoly(10 * sz, -T - 17 * sz, 5.5 * sz), c: BONE });
      extra = [{ n: 'Bone (radius and ulna)', c: BONE }];
    } else if (kind === 'joint') {
      inner.push({ poly: circlePoly(0, -T - 17 * sz, 11 * sz), c: BONE });
      extra = [{ n: 'Bone (elbow)', c: BONE }];
    } else {
      /* flank or belly: the body wall, with loops of bowel in the cavity beneath */
      core = { c: 0x6e3440, sc: 0x9a6a72 };
      [[-28, -34, 10], [6, -52, 11], [36, -30, 9], [-8, -84, 12], [30, -76, 10]].forEach(([x, y, r]) =>
        inner.push({ poly: circlePoly(x * sz, -T + y * sz, r * sz), c: 0xc98f86, sc: 0xdcb0a8 }));
      extra = [{ n: 'Abdominal wall and cavity', c: 0x6e3440 }];
    }
    K.caps = {
      key: () => 'skin',
      make: () => {
        const list = [], st = strip(loop, loop.iL, loop.iR);
        let d = 0;
        t.layers.forEach(L => { list.push({ poly: band(st, d, d + L.t), c: L.c, sc: L.sc || L.c }); d += L.t; });
        list.push({ poly: loop.map(q => [q.x - q.nx * T, q.y - q.ny * T]), c: core.c, sc: core.sc });
        /* the coat on the cut edge, as thick as it stands off the skin */
        const furPts = st.filter(q => furW(q, 0) > 0.02);
        if (furPts.length > 2) {
          const out = furPts.map(q => { const o = K.furH * furW(q, 0); return [q.x + q.nx * o, q.y + q.ny * o]; });
          list.push({ poly: out.concat(furPts.slice().reverse().map(q => [q.x, q.y])), c: hex(K.coat) });
        }
        inner.forEach(b => list.push(Object.assign({ z: 0.02 }, b)));
        return list;
      }
    };
    return {
      clipX: X, wide: P.wide,
      legend: [{ n: K.coatName, c: hex(K.coat) }].concat(extra)
    };
  }

  /* ================= abdominal wall: fascia and linea alba ================= */
  const FASCIA_LAYERS = [
    { n: 'External rectus sheath', c: 0xe6dccf, sc: 0xf4eee6 },
    { n: 'Rectus abdominis', c: 0xa8434f, sc: 0xd39aa0 },
    { n: 'Internal rectus sheath', c: 0xe0d3c0, sc: 0xece2d0 },
    { n: 'Peritoneum and falciform fat', c: 0xe6c77a, sc: 0xd8c690 }
  ];
  const LINEA_LAYERS = [
    { n: 'Linea alba', c: 0xf0ebe2, sc: 0xfaf7f1 },
    { n: 'Linea alba, deep fibres', c: 0xe2d6c6, sc: 0xeee4d6 },
    { n: 'Falciform fat', c: 0xe8c66e, sc: 0xcdbd7a },
    { n: 'Peritoneum and abdominal cavity', c: 0xc98a8a, sc: 0xd8a8a8 }
  ];
  function abdomenSite(K, linea) {
    const t = K.env.tissue, hz = t.hz, X = 22 * K.kb, sz = K.sz, T = layerSum(t);
    const LY = linea ? LINEA_LAYERS : FASCIA_LAYERS;
    /* The skin and fat have been incised and are retracted either side: the floor of the
       opening is the fascia (y = 0, level with the block), its walls are cut fat, its
       rim the skin edge, and the belly curves away beyond it. */
    const H = 10 * sz, Wf = 27 * K.kb, Zf = 52, fT = 1 + 9 / Wf;
    const surf = (x, z) => {
      const f = Math.hypot(x / Wf, z / Zf), open = smooth(1, fT, f);
      const belly = -Math.pow(Math.max(0, Math.abs(x) - 44), 2) / 360 - Math.pow(Math.max(0, Math.abs(z) - 110), 2) / 1400;
      return { y: open * (H + belly), open, f };
    };
    const sheath = rgb(LY[0].c), white = rgb(0xf3efe6), muscle = rgb(0xc98a88);
    const floor = (x, z) => {
      if (linea) {
        /* the linea alba runs down the middle; rectus sheath over the muscle either side */
        const side = mix(rgb(0xe4d2c8), muscle, 0.12 * (0.5 + 0.5 * Math.sin(x * 1.25 + 2 * Math.sin(z * 0.04))));
        return mix(sheath, side, smooth(X, X + 4, Math.abs(x)));
      }
      /* paramedian: the sheath over the rectus, and the linea just to one side */
      const base = mix(sheath, muscle, 0.10 * (0.5 + 0.5 * Math.sin(x * 1.25 + 2 * Math.sin(z * 0.04))) * smooth(X - 2, X + 2, Math.abs(x)));
      return mix(base, white, 1 - smooth(1.6, 2.8, Math.abs(x + X + 3)));
    };
    const fat = rgb(0xe9bd4f), dermis = rgb(0xf2dfcc), skinC = rgb(0xcf9a86), areola = rgb(0xb27a70);
    /* a bitch or queen has her teats in two rows down the abdomen; a mare, ewe or cow
       has them on the udder between the hind legs, out of this field */
    const nipples = [];
    if (K.sp.id === 'dog' || K.sp.id === 'cat') {
      [-110, -55, 0, 55, 110].forEach(z => [-1, 1].forEach(s => nipples.push([s * 52 * sz, z])));
    }
    const xs = join(lin(-170, -60, 10), lin(-60, -X, 30), lin(-X, X, 22), lin(X, 60, 30), lin(60, 170, 10));
    const zs = join(lin(-200, -90, 9), lin(-90, -hz, 34), lin(-hz, hz, 16), lin(hz, 90, 34), lin(90, 200, 9));
    const i0 = near(xs, -X), i1 = near(xs, X), j0 = near(zs, -hz), j1 = near(zs, hz);
    const geo = gridGeo(K, xs.length - 1, zs.length - 1, (i, j) => {
      const x = xs[i], z = zs[j], s = surf(x, z);
      let c;
      /* the floor darkens a little where it runs under the cut walls */
      if (s.open < 0.03) c = scl(floor(x, z), 1 - 0.2 * Math.exp(-Math.pow((s.f - 1) / 0.08, 2)));
      else if (s.open < 0.8) c = mix(floor(x, z), fat, smooth(0.03, 0.12, s.open));
      else if (s.open < 0.97) c = mix(fat, dermis, smooth(0.8, 0.9, s.open));
      else c = mix(dermis, skinC, smooth(0.97, 1, s.open));
      let ar = 0;
      nipples.forEach(n => { ar = Math.max(ar, gauss((x - n[0]) / 4.5, (z - n[1]) / 4.5)); });
      if (ar > 0.01) c = mix(c, areola, ar * 0.8);
      return { p: [x, s.y, z], c, t: [x * 0.04, z * 0.04] };
    }, { flip: true, hole: (i, j) => i >= i0 && i < i1 && j >= j0 && j < j1 });
    K.mesh(geo, K.M({ vertexColors: true, map: wetTex(K.T3), roughness: 0.5, envMapIntensity: 0.35 }));
    const T3 = K.T3, nipMat = K.M({ color: 0xa96f66, roughness: 0.7 });
    nipples.forEach(n => {
      const g = new T3.SphereGeometry(1, 14, 10);
      g.scale(2.1 * sz, 1.3, 2.1 * sz);
      g.translate(n[0], surf(n[0], n[1]).y + 0.1, n[1]);
      K.queue(g, nipMat);
    });
    /* a fenestrated drape over the skin beyond the clipped field */
    const hx = 88 * sz, hzD = 142;
    const dx = join(lin(-260, -hx, 8), lin(-hx, hx, 22), lin(hx, 260, 8));
    const dz = join(lin(-280, -hzD, 8), lin(-hzD, hzD, 26), lin(hzD, 280, 8));
    const di0 = near(dx, -hx), di1 = near(dx, hx), dj0 = near(dz, -hzD), dj1 = near(dz, hzD);
    K.mesh(gridGeo(K, dx.length - 1, dz.length - 1, (i, j) => {
      const x = dx[i], z = dz[j];
      const e = Math.min(Math.abs(Math.abs(x) - hx), Math.abs(Math.abs(z) - hzD));
      return { p: [x, surf(x, z).y + 1.0 + 0.9 * Math.exp(-e * e / 8), z] };
    }, { flip: true, hole: (i, j) => i >= di0 && i < di1 && j >= dj0 && j < dj1 }), K.M({ color: DRAPE, roughness: 1, envMapIntensity: 0.05 }));

    K.caps = {
      key: info => 'a' + info.cutZ.toFixed(2),
      make: info => {
        const z = info.cutZ, list = [], Wm = 170;
        let d = 0;
        t.layers.forEach((L, i) => {
          const lk = LY[i];
          [-1, 1].forEach(sg => list.push({ poly: rect(sg * X, -d, sg * Wm, -d - L.t), c: lk.c, sc: lk.sc }));
          d += L.t;
        });
        list.push({ poly: rect(-Wm, -T, Wm, -T - 40), c: 0x4f2530, sc: 0x7a4a52 });
        [-1, 1].forEach(sg => {
          const top = [];
          for (let k = 0; k <= 90; k++) { const x = lerp(X, Wm, k / 90); top.push([sg * x, surf(sg * x, z).y]); }
          list.push({ poly: top.concat([[sg * Wm, 0], [sg * X, 0]]), c: 0xe9bd4f, sc: 0xdccb8e, z: 0.005 });
          const sk = top.filter(p => surf(p[0], z).open >= 0.97);
          if (sk.length > 2) list.push({ poly: sk.concat(sk.slice().reverse().map(p => [p[0], p[1] - 1.6 * sz])), c: 0xcf9a86, sc: 0xe7aeb4, z: 0.01 });
        });
        return list;
      }
    };
    return {
      layers: LY, plainTop: true, clipX: X, wide: 1.6, gloss: { roughness: 0.5, env: 0.35 },
      legend: [{ n: 'Subcutaneous fat (retracted)', c: 0xe9bd4f }, { n: 'Skin edge', c: 0xcf9a86 }, { n: 'Drape', c: DRAPE }]
    };
  }

  /* ================= hollow organs: small intestine and uterus ================= */
  const UTERUS_LAYERS = [
    { n: 'Perimetrium (serosa)', c: 0xd99a98, sc: 0xecc6c4 },
    { n: 'Myometrium', c: 0xb14a58, sc: 0xd28c96 },
    { n: 'Myometrium, vascular layer', c: 0xc9717b, sc: 0xe7b6bc },
    { n: 'Endometrium', c: 0x8e2a3c, sc: 0xb8606e }
  ];
  function tubeSite(K, kind) {
    const t = K.env.tissue, T = t.T, hz = t.hz, sz = K.sz, T3 = K.T3;
    const ut = kind === 'uterus';
    /* the bowel keeps its own layers, with the living serosa's salmon pink on top */
    const LY = ut ? UTERUS_LAYERS : t.layers.map((L, i) => i ? L : Object.assign({}, L, { c: 0xd9998b }));
    const P = ut
      ? { X: 14, W: 32, H: 48, q: 0.4, R: 25, Zs: 42, Rb: 60, phi: 1.0, L: 190, mesD: 46, mesZ: 120, spread: 0.55 }
      : { X: 12, W: 22, H: 30, q: 0.38, R: 16, Zs: 40, Rb: 40, phi: 1.2, L: 170, mesD: 58, mesZ: 95, spread: 0 };
    const X = P.X * K.kb, W = Math.max(P.W * sz, X + 7), H = P.H * sz, R = P.R * sz;
    /* across the wound the wall lies flat for the width of the window; away from it the
       tube is round again */
    const loaf = loafLoop(X, W, H, P.q, 18, 14, 18);
    const raw = loaf.map(q => [q.x, q.y]);
    const circ = loaf.map(q => { const b = 2 * PI * q.s / loaf.total; return [R * Math.sin(b), -R - R * Math.cos(b)]; });
    const zs = join(lin(-P.L, -P.Zs, 10), lin(-P.Zs, -hz, 14), lin(-hz, hz, 16), lin(hz, P.Zs, 14), lin(P.Zs, P.L, 10));
    const j0 = near(zs, -hz), j1 = near(zs, hz);
    const outers = zs.map(z => {
      const w = smooth(hz, hz + 24, Math.abs(z));
      return w <= 0 ? loaf : finishLoop(raw.map((p, i) => [lerp(p[0], circ[i][0], w), lerp(p[1], circ[i][1], w)]), loaf.iR, loaf.iL);
    });
    const inners = outers.map(L => finishLoop(L.map(q => [q.x - q.nx * T, q.y - q.ny * T]), L.iR, L.iL));
    const frame = bendFrame(P.Zs, P.Rb, P.phi);
    const hole = (i, j) => i >= loaf.iR && i < loaf.iL && j >= j0 && j < j1;
    const outMat = K.M({ color: LY[0].c, map: wetTex(T3), roughness: 0.36, envMapIntensity: 0.5 });
    const inMat = K.M({ color: LY[3].c, emissive: new T3.Color(LY[3].c).multiplyScalar(0.12), roughness: 0.5, envMapIntensity: 0.3 });
    K.mesh(sweep(K, j => outers[j], zs, { frame, hole }), outMat);
    /* the lumen: seen through the gaping incision before it is closed */
    K.mesh(sweep(K, j => inners[j], zs, { frame, hole, flip: true }), inMat);

    const art = K.M({ color: 0xa8283a, roughness: 0.4, envMapIntensity: 0.4 });
    const vein = K.M({ color: 0x5b3b70, roughness: 0.4, envMapIntensity: 0.4 });
    const N = loaf.length;
    const onWall = (L, i, z, lift) => { const q = L[i]; return worldPt(frame, q.x + q.nx * lift, q.y + q.ny * lift, z); };
    /* the mesentery (bowel) or broad ligament (uterus), from the mesenteric border down */
    const mj = []; zs.forEach((z, j) => { if (Math.abs(z) <= P.mesZ) mj.push(j); });
    const bottom = j => onWall(outers[j], 0, zs[j], -1.2);
    const rootAt = z => [0, -H - P.mesD * sz, z * P.spread];
    const KM = 12;
    const mesGeo = gridGeo(K, mj.length - 1, KM, (i, k) => {
      const B = bottom(mj[i]), Rt = rootAt(zs[mj[i]]), f = k / KM;
      return { p: [lerp(B[0], Rt[0], f) + Math.sin(f * PI) * 2.2 * Math.sin(i * 0.5), lerp(B[1], Rt[1], f), lerp(B[2], Rt[2], f)] };
    });
    K.mesh(mesGeo, K.M({ color: ut ? 0xe8b8a8 : 0xead39c, transparent: true, opacity: 0.55, depthWrite: false, side: T3.DoubleSide, roughness: 0.45, envMapIntensity: 0.4 }));
    const fanPt = (z, f, dx) => { const j = near(zs, z), B = bottom(j), Rt = rootAt(zs[j]); return [lerp(B[0], Rt[0], f) + dx, lerp(B[1], Rt[1], f), lerp(B[2], Rt[2], f)]; };
    const vz = ut ? [-90, -60, -30, 0, 30, 60, 90] : [-64, -40, -16, 8, 32, 56];
    vz.forEach((z, n) => {
      [[0.7, art, 0.75], [-0.7, vein, 0.85]].forEach(([dx, m, r]) => {
        vessel(K, [fanPt(z * 0.25, 0.97, dx), fanPt(z * 0.55, 0.6, dx), fanPt(z * 0.85, 0.3, dx), fanPt(z, 0.14, dx)], r * sz, m);
        if (n < vz.length - 1) {
          const z2 = vz[n + 1], zm = (z + z2) / 2;
          /* arcades between neighbouring vessels, and straight vessels on to the wall */
          vessel(K, [fanPt(z, 0.14, dx), fanPt(zm, 0.2, dx), fanPt(z2, 0.14, dx)], r * 0.7 * sz, m);
          [0.3, 0.55, 0.8].forEach(f => { const zz = lerp(z, z2, f); vessel(K, [fanPt(zz, 0.17, dx), fanPt(zz, 0.02, dx)], r * 0.45 * sz, m); });
        }
      });
    });
    /* small vessels wrapping the wall from the mesenteric border, stopping short of the
       opposite (antimesenteric) border where the incision is */
    for (let z = -P.Zs + 4, n = 0; z <= P.Zs - 4; z += (ut ? 7 : 6) + 2.5 * Math.sin(n * 2.3), n++) {
      const j = near(zs, z), L = outers[j], m = n % 2 ? vein : art;
      /* each one reaches a different way up the wall and wanders a little */
      const reach = 5 + (n * 7) % 5, wob = i => (ut ? 1.2 : 0.7) * Math.sin(i * 0.9 + n);
      const right = [], left = [];
      for (let i = 0; i <= loaf.iR - reach; i += 2) right.push(onWall(L, i, zs[j] + wob(i), 0.3));
      for (let i = N - 1; i >= loaf.iL + reach; i -= 2) left.push(onWall(L, i, zs[j] + wob(i), 0.3));
      left.unshift(onWall(L, 0, zs[j], 0.3));
      vessel(K, right, (ut ? 0.42 : 0.26) * sz, m);
      vessel(K, left, (ut ? 0.42 : 0.26) * sz, m);
    }
    if (ut) {
      /* the uterine vessels run tortuous along the mesometrial border */
      [[3, art], [N - 3, vein]].forEach(([i, m]) => {
        const pts = [];
        for (let z = -120; z <= 120; z += 6) { const j = near(zs, z); pts.push(onWall(outers[j], i, zs[j] + 2.2 * Math.sin(z * 0.35), 1.0)); }
        vessel(K, pts, 1.0 * sz, m);
      });
      /* the other horn, leaving the body towards the ovary */
      const c = new T3.CatmullRomCurve3([[0, -H * 0.5, -P.Zs + 8], [-26, -H * 0.62, -P.Zs - 16], [-66, -H - 8, -P.Zs - 34], [-104, -H - 46, -P.Zs - 28]]
        .map(p => new T3.Vector3(p[0] * sz, p[1], p[2])));
      K.mesh(new T3.TubeGeometry(c, 48, R * 0.86, 28, false), outMat);
    }
    drapePlane(K, -H - P.mesD * sz - 8);

    K.caps = {
      key: () => 'tube',
      make: () => {
        const st = strip(loaf, loaf.iL, loaf.iR);
        let d = 0;
        return t.layers.map((L, i) => { const lk = LY[i]; const b = { poly: band(st, d, d + L.t), c: lk.c, sc: lk.sc || lk.c }; d += L.t; return b; });
      }
    };
    return {
      layers: LY, plainTop: true, clipX: X, wide: ut ? 1.6 : 1.55, gloss: { roughness: 0.38, env: 0.5 },
      legend: [{ n: ut ? 'Broad ligament' : 'Mesentery', c: ut ? 0xe8b8a8 : 0xead39c }, { n: 'Artery', c: 0xa8283a }, { n: 'Vein', c: 0x5b3b70 }]
    };
  }

  /* ================= purse-string: the anus ================= */
  const ANUS_LAYERS = [
    { n: 'Perianal skin', c: 0x7d5d57, sc: 0xd2aaa4 },
    { n: 'External anal sphincter', c: 0xa63c4a, sc: 0xd0868f },
    { n: 'Anal mucosa', c: 0x9c3040, sc: 0xc4737c }
  ];
  function anusSite(K) {
    const t = K.env.tissue, T = t.T, r1 = t.r1, sz = K.sz, T3 = K.T3;
    /* The perineum with the anus facing up: the ischial tuberosities either side, the
       tail base above it (towards -z), haired beyond the clipped field. */
    const hRad = r => 3.2 * sz * smooth(r1 + 3, 75, r);
    const hgt = (r, x, z) => hRad(r) + smooth(r1, r1 + 26, r) * (
      11 * sz * (gauss((x - 58 * sz) / 34, (z - 8) / 42) + gauss((x + 58 * sz) / 34, (z - 8) / 42)) +
      16 * sz * gauss(x / 26, (z + 66 * sz) / 26));
    const furW = r => smooth(82, 94, r);
    const pig = rgb(ANUS_LAYERS[0].c), skinC = rgb(0xc9a08f);
    const rs = join(lin(r1, 45, 14), lin(45, 100, 18), lin(100, 180, 8));
    const NT = 72;
    K.mesh(gridGeo(K, NT, rs.length - 1, (i, j) => {
      const th = 2 * PI * i / NT, r = rs[j], x = r * Math.cos(th), z = r * Math.sin(th), w = furW(r);
      return { p: [x, hgt(r, x, z) + K.furH * w, z], c: mix(mix(pig, skinC, smooth(r1 + 4, 46, r)), K.coat, w), t: [x * 0.04, z * 0.04] };
    }), skinMat(K));
    const tail = new T3.CatmullRomCurve3([[0, 2, -70], [0, 24, -96], [0, 60, -118], [0, 104, -128]].map(p => new T3.Vector3(p[0] * sz, p[1] * sz, p[2] * sz)));
    K.mesh(new T3.TubeGeometry(tail, 30, 12 * sz, 20, false), K.M({ color: hex(K.coat), map: strandTex(T3), bumpMap: strandTex(T3), bumpScale: 0.04, roughness: 0.9 }), { noCut: true });

    /* The rectum below the anus: it opens from the ring's own opening, which narrows as
       the purse-string is drawn, so it is rebuilt with the ring. */
    const ys = lin(-T, -80, 20), NR = 36;
    const rIn = (y, r0) => lerp(r0, 15 * sz, smooth(-T, -T - 26, y));
    const funnel = (rf, flip) => gridGeo(K, NR, ys.length - 1, (i, j) => {
      const a = 2 * PI * i / NR, r = rf(ys[j]);
      return { p: [r * Math.cos(a), ys[j], r * Math.sin(a)] };
    }, { flip });
    let r0 = K.env.cur && K.env.cur.r0 != null ? K.env.cur.r0 : t.r0;
    const gIn = funnel(y => rIn(y, r0), false), gOut = funnel(y => rIn(y, r0) + T, true);
    K.mesh(gIn, K.M({ color: ANUS_LAYERS[2].c, emissive: new T3.Color(ANUS_LAYERS[2].c).multiplyScalar(0.12), roughness: 0.5 }));
    K.mesh(gOut, K.M({ color: ANUS_LAYERS[1].c, roughness: 0.6 }));
    const reshape = () => {
      [[gIn, 0], [gOut, T]].forEach(([g, add]) => {
        const pa = g.attributes.position;
        for (let j = 0; j < ys.length; j++) for (let i = 0; i <= NR; i++) {
          const a = 2 * PI * i / NR, r = rIn(ys[j], r0) + add;
          pa.setXYZ(j * (NR + 1) + i, r * Math.cos(a), ys[j], r * Math.sin(a));
        }
        pa.needsUpdate = true;
        g.computeVertexNormals();
      });
    };
    /* the rectum runs on out of sight: its far end is closed in shadow */
    const endDisc = new T3.CircleGeometry(15 * sz + T, 40);
    endDisc.rotateX(-PI / 2);
    endDisc.translate(0, -79, 0);
    K.mesh(endDisc, K.M({ color: 0x3a121a, roughness: 0.9 }));
    K.mesh(new T3.PlaneGeometry(900, 900).rotateX(-PI / 2).translate(0, -84, 0), K.M({ color: DRAPE, roughness: 1, envMapIntensity: 0.05 }));

    K.caps = {
      key: info => 'n' + info.az.toFixed(3) + ':' + r0.toFixed(2),
      make: info => {
        const list = [];
        const dxs = Math.sin(info.az), dzs = Math.cos(info.az);
        const rc = join(lin(r1, 45, 12), lin(45, 180, 30));
        const yc = lin(-T, -80, 20);
        [1, -1].forEach(sg => {
          const top = rc.map(r => { const x = sg * r * dxs, z = sg * r * dzs; return [sg * r, hgt(r, x, z) + K.furH * furW(r)]; });
          const skinB = top.map(p => [p[0], p[1] - 1.6 * sz]);
          list.push({ poly: top.concat(skinB.slice().reverse()), c: 0xc9a08f, z: -0.03 });
          const wallOut = yc.map(y => [sg * (rIn(y, r0) + T), y]);
          list.push({ poly: skinB.concat([[sg * 180, -80]], wallOut.slice().reverse(), [[sg * r1, -T]]), c: 0xd8b98c, z: -0.03 });
          const wallIn = yc.map(y => [sg * rIn(y, r0), y]);
          list.push({ poly: wallIn.concat(wallOut.slice().reverse()), c: ANUS_LAYERS[1].c, z: -0.035 });
          const muc = yc.map(y => [sg * (rIn(y, r0) + 1.1), y]);
          list.push({ poly: wallIn.concat(muc.slice().reverse()), c: ANUS_LAYERS[2].c, z: -0.04 });
        });
        return list;
      }
    };
    return {
      layers: ANUS_LAYERS, wide: 1.45,
      update: cur => { if (cur && cur.r0 != null && Math.abs(cur.r0 - r0) > 1e-4) { r0 = cur.r0; reshape(); } },
      legend: [{ n: K.coatName, c: hex(K.coat) }, { n: 'Rectal wall', c: ANUS_LAYERS[1].c }, { n: 'Ischiorectal fat', c: 0xd8b98c }]
    };
  }

  /* ================= purse-string: stomach round a feeding tube ================= */
  const STOMACH_LAYERS = [
    { n: 'Gastric serosa', c: 0xd9b6a3, sc: 0xead2c4 },
    { n: 'Gastric muscularis', c: 0xb4585f, sc: 0xd08b90 },
    { n: 'Gastric mucosa', c: 0xa5323e, sc: 0xc4737c }
  ];
  function stomachSite(K) {
    const t = K.env.tissue, T = t.T, r1 = t.r1, sz = K.sz, T3 = K.T3;
    /* the stomach wall around the ring, curving away over the body of the stomach */
    const Rm = 118 * sz, Dm = 80 * sz, Db = 96 * sz;
    /* down from the ring to the widest point, then round under to close the stomach,
       so the opening looks into the lumen and not through it */
    const raw = [];
    for (let k = 0; k <= 44; k++) { const a = (k / 44) * PI / 2; raw.push([r1 + (Rm - r1) * Math.sin(a), -Dm * Math.pow(1 - Math.cos(a), 1.35)]); }
    for (let k = 1; k <= 24; k++) { const b = (k / 24) * PI / 2; raw.push([Math.max(0.01, Rm * Math.cos(b)), -Dm - Db * Math.sin(b)]); }
    const prof = raw.map((p, k) => {
      const pn = raw[Math.min(raw.length - 1, k + 1)], pp = raw[Math.max(0, k - 1)];
      let tr = pn[0] - pp[0], ty = pn[1] - pp[1]; const l = Math.hypot(tr, ty) || 1; tr /= l; ty /= l;
      return { r: p[0], y: p[1], nr: -ty, ny: tr };
    });
    const NT = 72;
    const lathe = (off, flip) => gridGeo(K, NT, prof.length - 1, (i, j) => {
      const a = 2 * PI * i / NT, q = prof[j], r = q.r - q.nr * off, y = q.y - q.ny * off;
      return { p: [r * Math.cos(a), y, r * Math.sin(a)], t: [r * Math.cos(a) * 0.04, r * Math.sin(a) * 0.04] };
    }, { flip });
    K.mesh(lathe(0, false), K.M({ color: STOMACH_LAYERS[0].c, map: wetTex(T3), roughness: 0.38, envMapIntensity: 0.5 }));
    K.mesh(lathe(T, true), K.M({ color: STOMACH_LAYERS[2].c, emissive: new T3.Color(STOMACH_LAYERS[2].c).multiplyScalar(0.12), roughness: 0.5 }));
    /* the gastroepiploic vessels along the greater curvature, branching onto the wall */
    const art = K.M({ color: 0xa8283a, roughness: 0.4, envMapIntensity: 0.4 });
    const vein = K.M({ color: 0x5b3b70, roughness: 0.4, envMapIntensity: 0.4 });
    const onWall = (k, a, lift) => { const q = prof[k], r = q.r + q.nr * lift, y = q.y + q.ny * lift; return [r * Math.cos(a), y, r * Math.sin(a)]; };
    [[34, art, 0.9, 0], [35, vein, 1.0, 0.02]].forEach(([k, m, r, da]) => {
      const pts = []; for (let a = -1.1; a <= 1.1; a += 0.1) pts.push(onWall(k, a + da, 0.9));
      vessel(K, pts, r * sz, m);
      for (let a = -0.9; a <= 0.9; a += 0.3) {
        const br = []; for (let kk = k; kk >= 16; kk -= 3) br.push(onWall(kk, a + da + 0.04 * Math.sin(kk), 0.5));
        vessel(K, br, r * 0.45 * sz, m);
      }
    });
    /* The feeding tube: a mushroom tip inside the lumen, the shaft up through the
       opening the purse-string closes round, then away out of the field. It leans away
       from the camera at 30° as soon as it is out: the needle holder works over the
       centre of the ring, and this is the one path that stays clear of it and of the
       thread for the whole technique (checked against every frame). */
    const tubeMat = K.M({ color: 0xe9e1cd, roughness: 0.32, envMapIntensity: 0.6 });
    const lean = s => new T3.Vector3(-0.612 * s, 2 + 0.5 * s, -0.612 * s);
    const path = new T3.CatmullRomCurve3([new T3.Vector3(0, -T - 2, 0), new T3.Vector3(0, -1.5, 0), new T3.Vector3(0, 0.9, 0),
      lean(1.6), lean(8), lean(40), lean(110)], false, 'centripetal');
    K.mesh(new T3.TubeGeometry(path, 120, 1.0, 12, false), tubeMat, { cast: true });
    const dome = new T3.SphereGeometry(5.5, 24, 12, 0, 2 * PI, 0, PI / 2);
    dome.rotateX(PI);
    dome.scale(1, 0.55, 1);
    dome.translate(0, -T - 0.8, 0);
    K.mesh(dome, tubeMat);
    drapePlane(K, -Dm - Db - 8);

    K.caps = {
      key: () => 'g',
      make: () => {
        const list = [];
        [1, -1].forEach(sg => {
          let d = 0;
          t.layers.forEach((L, i) => {
            const a = prof.map(q => [sg * (q.r - q.nr * d), q.y - q.ny * d]);
            const b = prof.map(q => [sg * (q.r - q.nr * (d + L.t)), q.y - q.ny * (d + L.t)]);
            list.push({ poly: a.concat(b.reverse()), c: STOMACH_LAYERS[i].c, z: -0.03 });
            d += L.t;
          });
        });
        return list;
      }
    };
    return {
      layers: STOMACH_LAYERS, wide: 1.5, gloss: { roughness: 0.4, env: 0.5 }, plainTop: true,
      legend: [{ n: 'Gastrostomy tube', c: 0xe9e1cd }, { n: 'Artery', c: 0xa8283a }, { n: 'Vein', c: 0x5b3b70 }]
    };
  }

  /* ---------------- public ---------------- */
  function sitesFor(techId) { return (BY_TECH[techId] || []).slice(); }
  function label(id) { return SITES[id] ? SITES[id].label : id; }
  function build(techId, site, env) {
    const list = sitesFor(techId);
    if (!list.length) return null;
    if (list.indexOf(site) < 0) site = list[0];
    const K = kit(env);
    const out = SITES[site].make(K);
    K.flush();
    return {
      site,
      caption: (K.sp.name || 'Dog') + ' — ' + SITES[site].name,
      layers: out.layers || null,
      legend: out.legend || [],
      clipX: out.clipX || 0,
      plainTop: !!out.plainTop,
      /* a moist surface for the block's top layer where it is not shaved skin */
      topMap: out.plainTop ? wetTex(K.T3) : null,
      /* a moist organ glistens: the block's layers take the organ's sheen so the window
         does not show as a matte patch */
      gloss: out.gloss || null,
      wide: out.wide || 1.5,
      group: K.group,
      update: cur => {
        if (!out.update) return;
        out.update(cur);
        if (K.clip && K.lastView) view(K, K.lastView);
      },
      view: info => view(K, info),
      dispose: () => dispose(K)
    };
  }
  return { sitesFor, label, build };
})();
