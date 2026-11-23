/* Suture Atlas — the instrument-tied surgeon's knot, as a teaching animation.

   A separate scene from the technique lab on purpose: this lesson is about one
   gesture, so the tissue is a bright block under studio light, the two ends of the
   suture are colour-coded (blue = long working strand, yellow = short tail) and the
   two instruments are staged either side of a vertical incision.

   Everything is a function of one number, the lesson time. Each phase moves for its
   duration, then holds for a second so the finished step can be read before the next
   begins. */
window.KnotLab = (function () {
  'use strict';

  /* three.js comes from a CDN and can fail to arrive; the module still defines
     itself so mount() can say so in the stage rather than leave it blank */
  const T3 = window.THREE;
  const { Vector3: V3, Quaternion, CatmullRomCurve3, TubeGeometry } = T3 || {};
  const PI = Math.PI;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  /* phase, seconds on screen, and the second of stillness at the end of it. The
     narration lives here too, so the lesson page and the technique lab's knot tab
     read the same words against the same timing. */
  const PHASES = [
    { key: 'setup', label: 'Position the strands', dur: 6.0,
      text: 'Both instruments enter. The blue long strand is held in the right instrument; the left instrument is placed between the yellow tail and the blue strand, flat on the tissue.' },
    { key: 'wrap', label: 'Double wrap', dur: 8.0,
      text: 'The blue strand is carried twice around the left jaws in the same direction — the double first throw. Follow the arrow: two loops, side by side, not crossed.' },
    { key: 'pull', label: 'Pull the tail through', dur: 8.0,
      text: 'The left jaws open and take the tip of the yellow tail, then draw it back through both loops to the left while the right hand holds the blue strand steady.' },
    { key: 'seat', label: 'Seat the first throw', dur: 6.0,
      text: 'Both instruments pull outward, evenly. The wound edges meet, the double twist lies flat on the skin, and the right instrument regrasps the blue strand close to the knot.' },
    { key: 'lock', label: 'Locking throw', dur: 7.0,
      text: 'The left instrument returns between the strands and the blue strand wraps once in the opposite direction. That reversed throw squares the knot and locks it.' }
  ];
  const HOLD = 1.0;
  const TOTAL = PHASES.reduce((s, p) => s + p.dur, 0);

  /* ---------- studio ---------- */
  function braidTex(base, light, angle) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = light; x.lineWidth = 5; x.globalAlpha = .55;
    for (let i = -64; i < 128; i += 16) {
      x.beginPath(); x.moveTo(i, 0);
      x.lineTo(i + Math.tan(angle) * 64, 64);
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 1);
    return t;
  }

  function metal() {
    return new THREE.MeshPhongMaterial({ color: 0x93a1ae, specular: 0xffffff, shininess: 140, flatShading: false });
  }

  /* A needle holder / forceps: jaws at the origin pointing along +Y towards the hand,
     a shaft, a box joint and two finger rings. Long enough to read as an instrument
     at this scale, and plain enough that the jaws stay the subject. */
  function instrument(len, width) {
    const g = new THREE.Group();
    const mat = metal();
    const jawLen = len * 0.26;
    [-1, 1].forEach(sg => {
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, jawLen, width * 0.42), mat);
      jaw.position.set(sg * width * 0.5, jawLen / 2, 0);
      jaw.userData.sg = sg;
      g.add(jaw);
    });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.85, width, len * 0.5, 14), mat);
    shaft.position.y = jawLen + len * 0.25;
    g.add(shaft);
    const box = new THREE.Mesh(new THREE.BoxGeometry(width * 2.1, len * 0.07, width * 1.1), mat);
    box.position.y = jawLen + len * 0.02;
    g.add(box);
    [-1, 1].forEach(sg => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(width * 2.0, width * 0.42, 8, 22), mat);
      ring.position.set(sg * width * 1.15, len - width * 0.9, 0);
      ring.rotation.y = PI / 2;
      g.add(ring);
    });
    return { g, jaws: g.children.filter(o => o.userData && o.userData.sg), jawLen };
  }

  /* ---------- the lesson ---------- */
  function mount(host, opts) {
    opts = opts || {};
    if (!T3) {
      host.insertAdjacentHTML('beforeend',
        '<div class="nogl">The 3D lesson could not start: the three.js library did not load. ' +
        'Check your connection and reload — the five steps below still describe the knot in full.</div>');
      return null;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 640, host.clientHeight || 420, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    /* first in the stage, so the step label and the hint paint over the canvas */
    host.insertBefore(renderer.domElement, host.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(28, 1.5, 1, 500);
    /* top-down 45°, looking along the wound from the foot of the table */
    camera.position.set(0, 64, 64);
    camera.lookAt(0, 1.4, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xe6e1da, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(-26, 46, 30);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -40; key.shadow.camera.right = 40;
    key.shadow.camera.top = 40; key.shadow.camera.bottom = -40;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.32);
    fill.position.set(34, 22, -18);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(-10, 6, -34);
    scene.add(rim);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300),
      new THREE.MeshPhongMaterial({ color: 0xf4f6f8, shininess: 0 }));
    floor.rotation.x = -PI / 2;
    floor.position.y = -15.2;
    floor.receiveShadow = true;
    scene.add(floor);

    /* ---------- tissue: a vertical incision, cut as two blocks ---------- */
    const LAYERS = [
      { t: 1.0, c: 0xd8a394 },
      { t: 3.4, c: 0xead6ba },
      { t: 4.2, c: 0xecd08a },
      { t: 5.4, c: 0xc07d84 }
    ];
    const HALF_W = 26, LEN = 34;
    const skin = new THREE.Group();
    scene.add(skin);
    const halves = [-1, 1].map(sg => {
      const g = new THREE.Group();
      let y = 0;
      LAYERS.forEach(L => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(HALF_W, L.t, LEN),
          new THREE.MeshPhongMaterial({ color: L.c, shininess: 8, specular: 0x1a120e }));
        m.position.set(sg * (HALF_W / 2), y - L.t / 2, 0);
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
        y -= L.t;
      });
      /* a chamfered lip along the cut edge, so the incision has a surface to catch
         the light instead of meeting as a knife-edge */
      const lip = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, LEN),
        new THREE.MeshPhongMaterial({ color: 0xd79a8a, shininess: 10 }));
      lip.position.set(sg * 0.85, -0.16, 0);
      lip.rotation.z = sg * 0.42;
      lip.castShadow = true;
      g.add(lip);

      skin.add(g);
      return g;
    });

    /* a dark bed under the incision, so the gap reads as depth rather than a slot
       through to the studio floor */
    const bed = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, LEN - 2),
      new THREE.MeshPhongMaterial({ color: 0x7d3b45, shininess: 4 }));
    bed.position.set(0, -4.2, 0);
    bed.receiveShadow = true;
    skin.add(bed);

    /* ---------- suture ---------- */
    const blueTex = braidTex('#2f6fcf', '#9dc0ff', 0.5);
    const yellowTex = braidTex('#d8b12a', '#ffe89a', 0.5);
    const strandMat = tex => new THREE.MeshPhongMaterial({ map: tex, color: 0xffffff, shininess: 40 });
    const blueMat = strandMat(blueTex), yellowMat = strandMat(yellowTex);

    function strandMesh(mat, radius) {
      const g = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      g.castShadow = true;
      scene.add(g);
      return { g, radius, key: '' };
    }
    function setStrand(s, pts) {
      if (pts.length < 2) { s.g.visible = false; return; }
      s.g.visible = true;
      const key = pts.map(p => p.x.toFixed(2) + p.y.toFixed(2) + p.z.toFixed(2)).join('|');
      if (key === s.key) return;
      s.key = key;
      const curve = new CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
      const geo = new TubeGeometry(curve, Math.min(220, Math.max(24, pts.length * 6)), s.radius, 8, false);
      s.g.geometry.dispose();
      s.g.geometry = geo;
    }
    const blue = strandMesh(blueMat, 0.72);
    const yellow = strandMesh(yellowMat, 0.56);

    /* ---------- instruments ---------- */
    const right = instrument(32, 1.85);
    const left = instrument(30, 1.6);
    scene.add(right.g, left.g);

    function place(inst, tip, dir, open) {
      inst.g.position.copy(tip);
      const q = new Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
      inst.g.quaternion.copy(q);
      inst.jaws.forEach(j => { j.rotation.z = j.userData.sg * (open ? 0.16 : -0.02); });
    }

    /* ---------- knot ---------- */
    const knot = new THREE.Group();
    const knotMat = new THREE.MeshPhongMaterial({ color: 0x2f6fcf, shininess: 50 });
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.5, 8, 20), knotMat);
      r.rotation.x = PI / 2 + (i - 1) * 0.22;
      r.rotation.z = (i - 1) * 0.3;
      r.position.set((i - 1) * 0.75, 0.55 + i * 0.12, 0);
      knot.add(r);
    }
    knot.visible = false;
    scene.add(knot);

    /* ---------- motion-path arrows ---------- */
    function helixArrow(radius, turns, dirSign) {
      const pts = [];
      const n = 70;
      for (let i = 0; i <= n; i++) {
        const a = dirSign * (i / n) * turns * 2 * PI;
        pts.push(new V3(radius * Math.cos(a), 1.2 + (i / n) * 5.0, radius * Math.sin(a)));
      }
      const g = new THREE.Group();
      const curve = new CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 0.34, 6, false),
        new THREE.MeshBasicMaterial({ color: 0x0e7a63, transparent: true, opacity: 0.5, depthWrite: false }));
      g.add(tube);
      const head = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.4, 12),
        new THREE.MeshBasicMaterial({ color: 0x0e7a63, transparent: true, opacity: 0.6, depthWrite: false }));
      const end = pts[pts.length - 1], prev = pts[pts.length - 3];
      head.position.copy(end);
      head.quaternion.setFromUnitVectors(new V3(0, 1, 0), end.clone().sub(prev).normalize());
      g.add(head);
      scene.add(g);
      return g;
    }
    const arrowCW = helixArrow(3.3, 2, 1);
    const arrowCCW = helixArrow(3.3, 1, -1);

    /* ---------- timeline ---------- */
    const S = { t: 0, playing: true, speed: 1, step: -1 };

    function phaseAt(t) {
      let acc = 0;
      for (let i = 0; i < PHASES.length; i++) {
        const p = PHASES[i];
        if (t < acc + p.dur || i === PHASES.length - 1) {
          const l = t - acc;
          const u = clamp(l / (p.dur - HOLD), 0, 1);
          return { i, l, u, holding: l > p.dur - HOLD, p };
        }
        acc += p.dur;
      }
      return { i: 0, l: 0, u: 0, holding: false, p: PHASES[0] };
    }

    /* ---------- the pose ---------- */
    const woundL = new V3(-3.4, 0.1, 0);
    const woundR = new V3(3.4, 0.1, 0);

    /* Every phase starts where the last one ended: these boundary poses are shared,
       so the value at u = 1 of one phase is the value at u = 0 of the next and no
       boundary can snap. */
    const L_HOME = new V3(-2.4, 3.2, 1.2), L_OUT = new V3(-18, 4.2, -2.0);
    const L_DIR_HOME = new V3(-0.15, 0.95, 0.28), L_DIR_OUT = new V3(-0.9, 0.35, 0.15);
    const R_START = new V3(13, 4.4, 6), R_WRAP = new V3(9.6, 5.8, 4.8), R_AFTER = new V3(12.6, 4.6, 5.8);
    const R_PULL = new V3(18, 5.4, 8), R_FAR = new V3(21, 6.6, 9.6), R_NEAR = new V3(9.5, 4.6, 4.0);
    const R_LOCK = new V3(10.0, 4.4, 4.4);
    const T_START = new V3(8.6, 3.0, 4.6);
    /* the tail is let go where the left jaws left it, so the hand can travel back to
       the knot without dragging it across the screen */
    const T_LEFT = L_OUT.clone().add(new V3(0.3, 0.8, 0.9));

    function pose(t) {
      const ph = phaseAt(t);
      const out = {
        gap: 2.8, wrap: 0, knotOn: 0,
        left: L_HOME.clone(), leftDir: L_DIR_HOME.clone(), leftOpen: true,
        right: R_START.clone(), rightDir: new V3(0.5, 0.82, 0.28), rightOpen: false,
        tail: T_START.clone(), hold: 0,
        arrow: 0, arrowSign: 1
      };
      const u = ss(ph.u);

      if (ph.i === 0) {                              /* setup */
        out.left.lerpVectors(new V3(-16, 9, 9), L_HOME, u);
        out.leftDir.lerpVectors(new V3(-0.5, 0.8, 0.3), L_DIR_HOME, u);
      } else if (ph.i === 1) {                       /* double wrap */
        out.wrap = 2 * u;
        out.arrow = 1; out.arrowSign = 1;
        /* the hand rocks in over the jaws and back out again, ending where the next
           step needs it rather than starting there */
        if (u < 0.5) out.right.lerpVectors(R_START, R_WRAP, ss(u / 0.5));
        else out.right.lerpVectors(R_WRAP, R_AFTER, ss((u - 0.5) / 0.5));
      } else if (ph.i === 2) {                       /* pull the tail through */
        out.wrap = lerp(2, 0, ss(clamp(u * 1.15, 0, 1)));
        out.leftOpen = u < 0.35;
        /* the jaws close on the tail and then draw it with them: `hold` blends the
           strand end from where the tail lies onto the jaws over the grasp */
        out.hold = clamp((u - 0.22) / 0.2, 0, 1);
        out.left.lerpVectors(L_HOME, L_OUT, ss(clamp((u - .2) / .7, 0, 1)));
        out.leftDir.lerpVectors(L_DIR_HOME, L_DIR_OUT, ss(u));
        out.knotOn = ss(clamp((u - .55) / .45, 0, 1));
        out.right.lerpVectors(R_AFTER, R_PULL, u);
      } else if (ph.i === 3) {                       /* seat the first throw */
        out.left.copy(L_OUT);
        out.leftDir.copy(L_DIR_OUT);
        out.tail.copy(T_LEFT);
        out.hold = 1;
        out.leftOpen = false;
        out.knotOn = 1;
        out.gap = lerp(2.8, 0.25, ss(u));
        out.right.lerpVectors(R_PULL, R_FAR, ss(clamp(u / .7, 0, 1)));
        if (u > .72) out.right.lerpVectors(R_FAR, R_NEAR, ss((u - .72) / .28));
      } else {                                       /* locking throw */
        out.knotOn = 1;
        out.gap = 0.25;
        /* the tail stays where it was laid; only the hand goes back */
        out.tail.copy(T_LEFT);
        out.hold = 0;
        const travel = ss(clamp(u / 0.42, 0, 1));
        out.left.lerpVectors(L_OUT, L_HOME, travel);
        out.leftDir.lerpVectors(L_DIR_OUT, L_DIR_HOME, travel);
        out.leftOpen = travel > 0.9;
        /* and only once it is in position does the blue strand wrap the other way */
        out.wrap = -1.0 * ss(clamp((u - 0.42) / 0.5, 0, 1));
        out.arrow = u > 0.44 && u < 0.95 ? 1 : 0; out.arrowSign = -1;
        out.right.lerpVectors(R_NEAR, R_LOCK, ss(clamp(u / .5, 0, 1)));
      }
      out.phase = ph;
      return out;
    }

    /* a helix of points around the left instrument's jaw */
    function wrapPoints(cfg, turns, sign) {
      const pts = [];
      const n = Math.max(8, Math.round(Math.abs(turns) * 22));
      const base = new V3(0, 4, 0).applyQuaternion(left.g.quaternion).add(cfg.left);
      const ax = new V3(0, 1, 0).applyQuaternion(left.g.quaternion);
      const side = new V3(1, 0, 0).applyQuaternion(left.g.quaternion);
      const up = new V3(0, 0, 1).applyQuaternion(left.g.quaternion);
      const R = 2.5;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const a = sign * f * turns * 2 * PI;
        const p = base.clone()
          .addScaledVector(ax, (f - 0.5) * 4.6)
          .addScaledVector(side, R * Math.cos(a))
          .addScaledVector(up, R * Math.sin(a));
        pts.push(p);
      }
      return pts;
    }

    function draw(cfg) {
      const gap = cfg.gap;
      halves[0].position.x = -(gap / 2);
      halves[1].position.x = gap / 2;

      place(right, cfg.right, cfg.rightDir, cfg.rightOpen);
      place(left, cfg.left, cfg.leftDir, cfg.leftOpen);

      /* once the tail has been pulled through, both ends leave the knot itself: the
         short tail to the left, the long strand to the right */
      const k = cfg.knotOn;

      /* blue: out of the wound on the left, round the left jaw if it is wrapping,
         then up to the right instrument's grip */
      const grip = cfg.right.clone().addScaledVector(cfg.rightDir, 5.2);
      const pts = [woundL.clone().lerp(new V3(-1.3, 0.5, 0), k)];
      pts.push(new V3(-6.0, 1.8, 1.4).lerp(new V3(-1.0, 1.1, 0.5), k));
      if (Math.abs(cfg.wrap) > 0.02) {
        const w = wrapPoints(cfg, cfg.wrap, Math.sign(cfg.wrap));
        w.forEach(p => pts.push(p));
      }
      /* slack between the wraps and the right hand: at the jaws while the strand is
         coiled round them, and back over the wound once it is not - so the strand does
         not trail after the left instrument as it returns for the locking throw */
      const wrapW = clamp(Math.abs(cfg.wrap), 0, 1);
      pts.push(new V3(0, 2.6, 1.2).lerp(cfg.left.clone().add(new V3(-2.5, 3.5, -2)), wrapW));
      pts.push(grip);
      pts.push(grip.clone().addScaledVector(cfg.rightDir, 12));
      setStrand(blue, pts);

      /* yellow: the short tail, first out of the right wound edge, then drawn through
         the loop and away to the left */
      const tail = [woundR.clone().lerp(new V3(1.3, 0.5, 0), k),
        new V3(4.6, 1.2, 1.2).lerp(new V3(0.5, 1.3, 0.3), k)];
      if (cfg.wrap > 0.1) tail.push(cfg.left.clone().add(new V3(1.2, 3.4, 0.8)));
      /* the tail is drawn onto the jaws over the grasp and left behind when the hand
         goes back for the locking throw */
      const jawTail = cfg.left.clone().add(new V3(0.3, 0.8, 0.9));
      tail.push(cfg.tail.clone().lerp(jawTail, cfg.hold || 0));
      setStrand(yellow, tail);

      knot.visible = cfg.knotOn > 0.02;
      if (knot.visible) {
        knot.position.set(0, 0.32 + 0.5 * (1 - cfg.knotOn), 0);
        knot.scale.setScalar(0.7 + 0.3 * cfg.knotOn);
        /* the third throw only appears with the locking throw */
        knot.children[2].visible = cfg.wrap < -0.02;
      }

      const a = Math.abs(cfg.wrap) > 0.02 ? cfg.arrow : 0;
      const fade = 0.45 + 0.2 * Math.sin(performance.now() / 260);
      [arrowCW, arrowCCW].forEach((g, i) => {
        const on = a > 0 && ((i === 0 && cfg.arrowSign > 0) || (i === 1 && cfg.arrowSign < 0));
        g.visible = !!on;
        if (on) {
          g.position.copy(cfg.left);
          g.quaternion.copy(left.g.quaternion);
          g.traverse(o => { if (o.material) { o.material.opacity = fade; } });
        }
      });
    }

    /* ---------- frame ---------- */
    let last = performance.now(), uiClock = 0;
    function frame(now) {
      /* hidden (the technique lab keeps this view mounted while another tab is
         shown): draw nothing and report nothing until it is shown again */
      if (!host.offsetWidth) { last = now; requestAnimationFrame(frame); return; }
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      if (S.playing) {
        S.t += dt * S.speed;
        if (S.t >= TOTAL) { S.t = TOTAL; S.playing = false; if (opts.onEnd) opts.onEnd(); }
      }
      const cfg = pose(S.t);
      draw(cfg);
      renderer.render(scene, camera);
      uiClock += dt;
      if (uiClock > 0.08) {
        uiClock = 0;
        const ph = cfg.phase;
        if (ph.i !== S.step) { S.step = ph.i; if (opts.onStep) opts.onStep(ph.i, PHASES[ph.i]); }
        if (opts.onTime) opts.onTime(S.t, TOTAL, ph, S.playing);
      }
      requestAnimationFrame(frame);
    }

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    else window.addEventListener('resize', resize);

    requestAnimationFrame(frame);

    return {
      play() { if (S.t >= TOTAL - .01) S.t = 0; S.playing = true; },
      pause() { S.playing = false; },
      toggle() { S.playing ? this.pause() : this.play(); },
      seek(t) { S.t = clamp(t, 0, TOTAL); },
      seekStep(i) {
        let acc = 0;
        for (let k = 0; k < i && k < PHASES.length; k++) acc += PHASES[k].dur;
        S.t = acc + 0.01; S.playing = true;
      },
      setSpeed(v) { S.speed = v; },
      get total() { return TOTAL; },
      get steps() { return PHASES.map(p => p.label); },
      get time() { return S.t; }
    };
  }

  return { mount, PHASES, TOTAL };
})();
