/* Suture Atlas — content model.
   Pass geometry is authored in millimetres.
   a = [u, d, z]  u = distance from the wound edge along the surface,
                  d = depth below the surface (0 = surface), z = position along the wound.
   sag = how far the needle's arc dips below the straight chord at its midpoint. */
window.SUTURE = (function () {
  'use strict';

  /* ---------------- tissue models ---------------- */
  /* Tissue is a block cut down the middle into a V: the two walls lean in and meet
     below the surface, so a student sees the layer stack on a slanted face and the
     dead space closing as the edges come together (the reference animation is cut
     this way). `notch` is the depth at which the two walls meet; below it the block is
     continuous. `lift(u,p)` is the vertical movement of the *surface* at distance u
     from the edge: positive rolls the edges up and together (eversion, skin), negative
     rolls them down and inward (inversion, bowel). `falloff` fades that movement out
     with depth, so the surface folds while the deep layer stays apposed - which is
     what a suture does. */
  const SKIN = {
    type: 'linear', T: 14, hz: 15, span: 34, needle: 8, falloff: 0.34, notch: 5.2,
    layers: [
      { n: 'Epidermis', t: 1.0, c: 0xc29c88, sc: 0xe7aeb4 },
      { n: 'Dermis', t: 3.4, c: 0xdfcbab, sc: 0xf1e5c9 },
      { n: 'Subcutaneous fat', t: 4.2, c: 0xe7c46b, sc: 0xbfb16f },
      { n: 'Muscle and deep tissue', t: 5.4, c: 0xb8264d, sc: 0xc98b90 }
    ],
    edge: p => 0.03 + 1.5 * (1 - p),
    lift: (u, p) => p * (1.7 * Math.exp(-u / 4.0) - 0.9 * Math.exp(-u / 0.7))
  };
  const BOWEL = {
    type: 'linear', T: 4.4, hz: 17, span: 34, needle: 5, lumen: true, falloff: 0.42, notch: 2.8,
    layers: [
      { n: 'Serosa', t: 0.4, c: 0xd6b9a6, sc: 0xe9d4c2 },
      { n: 'Muscularis', t: 1.4, c: 0xb4585f, sc: 0xd08b90 },
      { n: 'Submucosa', t: 1.4, c: 0xe6d5b2, sc: 0xf0e3c8 },
      { n: 'Mucosa', t: 1.2, c: 0xa5323e, sc: 0xc4737c }
    ],
    edge: p => 0.03 + 0.85 * (1 - p),
    lift: (u, p) => -p * (1.5 * Math.exp(-u / 2.8) - 0.75 * Math.exp(-u / 0.6))
  };
  const ROUND = {
    type: 'round', T: 3.2, hz: 0, span: 30, needle: 4,
    r0: 10, r1: 27, falloff: 0.4,
    layers: [
      { n: 'Serosa / skin', t: 0.5, c: 0xd9c3a4, sc: 0xe9d6ba },
      { n: 'Muscle', t: 1.6, c: 0xb4585f, sc: 0xd08b90 },
      { n: 'Mucosa', t: 1.1, c: 0xa5323e, sc: 0xc4737c }
    ],
    edge: () => 0,
    lift: () => 0
  };

  /* ---------------- materials ---------------- */
  const MATERIALS = [
    {
      id: 'nylon', name: 'Nylon', short: 'Non-absorbable monofilament', abs: 'Non-absorbable',
      structure: 'Monofilament', strength: 'Strength fades slowly over years',
      use: 'Skin closure in dogs, cats and horses; tie-over dressings and temporary retention. Springy, keeps memory, needs 3–4 throws to hold.',
      watch: 'Stiff handling, can cut through thin feline skin, and the knot slips without enough throws.',
      weeks: { perm: true, note: 'Keeps its strength; loses it slowly over years' },
      colour: '#d8e3ef', removal: 'Dogs and cats: removed at 10–14 days (limbs 14, tension lines up to 21). Horses: 10–14 days, limb wounds up to 21'
    },
    {
      id: 'prolene', name: 'Polypropylene (Prolene)', short: 'Non-absorbable monofilament', abs: 'Non-absorbable',
      structure: 'Monofilament', strength: 'Retained long term, very low reactivity',
      use: 'Skin, vascular anastomoses, perineal hernia repair in dogs, and fascia where permanent support is wanted.',
      watch: 'Very smooth, so knots slip: use more throws. Memory makes handling fiddly in fine sizes.',
      weeks: { perm: true, note: 'Keeps its strength indefinitely' },
      colour: '#c9d8e6', removal: 'Skin: removed at 10–14 days. Vessels, hernia repairs and fascia: left in place'
    },
    {
      id: 'silk', name: 'Silk', short: 'Braided, non-absorbable by convention', abs: 'Non-absorbable (loses strength over ~1 year)',
      structure: 'Braided', strength: 'Loses strength slowly, degraded over years',
      use: 'Ligatures, securing drains and feeding tubes. The best handling of any material — but the braid wicks fluid, so it is not the thread for mucosa or a contaminated field.',
      watch: 'Wicks fluid and harbours bacteria; the most tissue-reactive suture. Avoid in contaminated wounds, in the mouth or nose, the abdomen and on skin.',
      weeks: { perm: true, note: 'Non-absorbable by convention; loses most of its strength over about a year' },
      colour: '#e8dcbd', removal: 'Ligatures and drain holders stay with the drain; a skin stitch, if used, comes out at 10–14 days'
    },
    {
      id: 'vicryl', name: 'Polyglactin 910 (Vicryl)', short: 'Absorbable braided, coated', abs: 'Absorbable',
      structure: 'Braided, coated', strength: '~2–3 weeks of useful strength, gone by 2–3 months',
      use: 'Subcutis, bowel, bladder and uterus in dogs and cats; ligatures. Predictable and easy to tie.',
      watch: 'Braided: higher infection risk than monofilament. Not for skin that needs support beyond 2–3 weeks.',
      weeks: { hold: [2, 3], gone: [9, 13] },
      colour: '#d6c6e2', removal: 'Absorbed — no removal. Strength gone by 3–4 weeks, absorbed by 60–90 days'
    },
    {
      id: 'monocryl', name: 'Poliglecaprone 25 (Monocryl)', short: 'Absorbable monofilament', abs: 'Absorbable',
      structure: 'Monofilament', strength: '~2–3 weeks of strength, gone by 3–4 months',
      use: 'Subcuticular and intradermal closure in dogs and cats, and soft-tissue approximation where a fine, low-reaction thread is wanted.',
      watch: 'Strength falls fast; not for fascia, the linea alba or slowly healing tissue.',
      weeks: { hold: [2, 3], gone: [13, 17] },
      colour: '#cfe0d6', removal: 'Absorbed — no removal. Strength gone by 2–3 weeks, absorbed by 90–120 days'
    },
    {
      id: 'pds', name: 'Polydioxanone (PDS)', short: 'Absorbable monofilament, long-acting', abs: 'Absorbable',
      structure: 'Monofilament', strength: '~4–6 weeks of strength, gone by about 6 months',
      use: 'Linea alba and body-wall closure, bladder, bowel, equine fascia and tendon sheath — anywhere support is needed for weeks.',
      watch: 'Stiffer and slower to absorb; can leave a visible ridge in thin skin. Memory makes knots slippery.',
      weeks: { hold: [4, 6], gone: [24, 26] },
      colour: '#cfd7e6', removal: 'Absorbed — no removal. Strength for 4–6 weeks, absorbed by about 180 days'
    },
    {
      id: 'gut', name: 'Surgical gut (plain / chromic)', short: 'Absorbable natural', abs: 'Absorbable',
      structure: 'Twisted natural fibre', strength: 'Plain ~1 week, chromic ~2–3 weeks',
      use: 'Legacy material: some mucosal work and quick ligatures, still seen in large animal practice. Largely replaced by synthetics.',
      watch: 'Unpredictable absorption and the highest tissue reaction. Not recommended where modern synthetics are available.',
      weeks: { hold: [1, 3], gone: [10, 13], note: 'Plain gut holds about a week, chromic 2–3 weeks' },
      colour: '#e2cfae', removal: 'Absorbed — no removal. Plain loses strength in 7–10 days, chromic in 2–3 weeks'
    },
    {
      id: 'steel', name: 'Stainless steel', short: 'Non-absorbable, very high tensile strength', abs: 'Non-absorbable',
      structure: 'Monofilament (wire)', strength: 'Permanent',
      use: 'Equine tendon and orthopaedic work, and abdominal wall closure in high-tension or infected fields.',
      watch: 'Difficult handling, wire ends are sharp and have to be turned in, and it needs a specific needle and instrument set.',
      weeks: { perm: true, note: 'Permanent' },
      colour: '#b9c2cb', removal: 'Usually left in place; skin wires removed at 10–14 days'
    }
  ];

  /* ---------------- helpers for step authoring ---------------- */
  /* Every stitch ends with the same instrument tie (the engine draws it from the
     technique's `tie`): a surgeon's double first throw, then two single throws,
     each the opposite way to the last. `tie` runs one unit a throw; within a unit
     the holder is laid across, the long end wrapped, the other end grasped, drawn
     through and seated, at 0.15 / 0.45 / 0.62 / 0.82.
     o.loop   - a running line, tied off to its own last loop instead of a tail
     o.keepP  - the edges are already where they should be (an inverting layer
                that has been tightened): do not draw them up again
     o.handoff - false when the step that follows the last bite is the technique's
                own (the purse-string's drawstring) */
  const TIE3 = { throws: [2, 1, 1] };
  const TIE3_LOOP = { throws: [2, 1, 1], loop: true };
  const knotSteps = (o = {}) => {
    const A = o.loop ? 'the last loop' : 'the short tail';
    const steps = [];
    if (o.handoff !== false) steps.push({
      t: o.loop ? 'Leave the last loop, hand off the needle' : 'Hand off the needle, take up the slack', cam: 'section',
      b: (o.loop
        ? 'On the last bite the needle is not passed through the loop: that loop is left standing to tie to. '
        : '') + 'The needle goes to the other hand, which keeps the long end up and out to the side. ' +
        (o.keepP ? 'The edges are already where they should be; nothing is pulled tight yet.'
          : 'The slack comes out and the edges come towards each other — not tight yet: tissue that blanches now will be too tight once it swells.'),
      cine: o.keepP ? undefined : { p: [0, 0.4] }, dur: 3.4,
      marks: [{ at: 'wound', label: o.keepP ? 'Edges in place' : 'Edges drawn together, not yet tight', dx: 22, dy: -46 }]
    });
    steps.push(
      { t: 'Lay the holder across, between the ends', cine: { tie: [0, 0.15] }, dur: 1.6,
        b: 'The needle holder is laid across where the knot will sit — beside the wound, not on it — jaws towards ' + A + ', and the long end is brought against its jaws.',
        marks: [{ at: 'knot', label: 'The knot sits beside the wound', dx: -150, dy: -34 }] },
      { t: 'Wrap twice: the surgeon’s throw', cine: { tie: [0.15, 0.45] }, dur: 3.4,
        b: 'The other hand winds the long end twice round the jaws, both turns the same way and side by side. Two wraps give the first throw the friction to hold the edges by itself while the next throw is made.',
        marks: [{ at: 'knot', label: 'Two wraps, side by side', dx: 30, dy: -50 }] },
      { t: 'Take ' + A + ' by its tip', cine: { tie: [0.45, 0.62] }, dur: 2.1,
        b: 'Still carrying the wraps, the holder goes to ' + A + ', opens and takes it by the very tip — gripping further up crushes the part of the strand that will lie in the knot.' },
      { t: 'Draw it through: the first throw closes the wound', cine: { tie: [0.62, 1] }, dur: 4.2,
        b: 'The holder draws ' + A + ' back through the wraps, which slide off the jaws onto it, and the hands cross to the other sides. Both ends are pulled out level and the double throw beds down; stop as soon as the edges meet.',
        marks: [{ at: 'wound', label: 'The throw seats the edges', dx: 26, dy: -48 }] },
      { t: 'Second throw: one wrap, the other way', cine: { tie: [1, 2] }, dur: 5,
        b: 'Laid across again, the long end wound once — in the opposite direction — ' + A + ' taken and drawn through, the hands back to their own sides. Reversing is what squares the knot; the same direction twice makes a granny knot, which slips.',
        marks: [{ at: 'knot', label: 'Throw 2 — reversed', dx: 34, dy: -46 }] },
      { t: 'Third throw: lock it', cine: { tie: [2, 3] }, dur: 5,
        b: 'One more single wrap, reversed again, drawn through and seated on the other two. Three throws is the usual minimum for monofilament; very smooth material such as polypropylene may need a fourth.',
        marks: [{ at: 'knot', label: 'Throw 3 of 3', dx: 34, dy: -46 }] },
      { t: o.loop ? 'Cut the ends' : 'Cut the tails', cine: { c: [0, 1] }, cut: true, dur: 2.8,
        b: o.loop
          ? 'Cut the free end and both strands of the loop 2–3 mm from the knot. Any shorter and the knot can work loose; any longer and the ends irritate the tissue and snag.'
          : 'Trim the tails to about 2–3 mm. Any shorter and the knot can work loose; any longer and the ends wick bacteria along a braided thread, irritate the skin and snag the next stitch.',
        marks: [{ at: 'knot', label: 'Tails 2–3 mm', dx: 34, dy: -46 }] }
    );
    /* every one of these is a knotting beat, framed on the knot */
    return steps.map(s => Object.assign({ knot: true, cam: 'knot' }, s));
  };

  /* On the ring the bite positions come from `ring`, so each pass only needs its
     arc depth; the count is the number of bites. */
  const ringBites = (n, sag) => Array.from({ length: n }, () => ({ sag }));

  /* ---------------- techniques ---------------- */
  const T = [

    /* 1. SIMPLE INTERRUPTED */
    {
      id: 'interrupted', name: 'Simple interrupted', also: 'Interrupted suture',
      group: 'Interrupted', tissue: SKIN, draw: 'interrupted',
      tagline: 'Dogs · cats · horses — skin, fascia, muscle and mucosa: the default closing stitch',
      bestFor: 'Low to moderate tension in dog, cat and horse skin, and any wound where one stitch may need to come out early.',
      indications: [
        'Skin lacerations and surgical incisions under low or moderate tension in dogs and cats, and clean, fresh limb wounds in horses — distal limb wounds often heal better by second intention',
        'Wounds that may become infected — a bite or a contaminated laceration: single stitches can be removed to let pus out',
        'Irregular, curved or stellate wounds from a bite or a fence, where every stitch needs its own tension',
        'Fascia, muscle and oral mucosa closed with an absorbable thread'
      ],
      pros: [
        'Secure: if one stitch fails, the rest of the line stays closed',
        'Tension is adjusted stitch by stitch',
        'Easy to learn, easy to remove, and works on almost any tissue in a dog, cat or horse',
        'Good eversion when the bite is wider at depth than at the surface'
      ],
      cons: [
        'Slower than a continuous line',
        'One knot per stitch means more foreign material and more bulk',
        'Too tight, or left too long, leaves cross-hatch marks and can cause edge necrosis',
        'Uses more thread than a continuous closure'
      ],
      checklist: [
        'Enter at 90° to the skin, 3–5 mm from the edge — 2–3 mm in cat skin, 5 mm in a horse’s limb',
        'Equal depth and equal distance out on both sides',
        'Take slightly more deep tissue than superficial — a flask-shaped bite — so the edges sit level instead of turning in',
        'Edges just touch — allow room for post-operative swelling',
        'Square knot placed beside the wound, not on it'
      ],
      typical: ['nylon', 'prolene'], possible: ['vicryl', 'monocryl', 'pds'],
      needle: 'Cutting or reverse-cutting for skin; taper for bowel, bladder or oral mucosa',
      needleWhy: 'Dog and horse skin is thick and tough, so it needs a cutting edge to pass without bending the needle; cat skin is thin and takes a finer cutting needle. Mucosa and bowel need a taper point that pushes tissue aside instead of cutting it.',
      size: '3-0 to 4-0 in dogs, 4-0 to 5-0 in cats, 2-0 to 3-0 on horse limbs; 4-0 to 5-0 on the face and ears',
      /* One bite straight across the wound: in through the skin 5 mm out, down under
         the wound, and out through the skin 5 mm out on the far side. The needle and
         the thread it carries leave the skin, which is what the stitch looks like
         from the outside - the needle moves from one part of the skin, through it,
         out into the open, and in again at the next stitch. */
      passes: [
        { side: 'L', a: [5, 0, 0], b: [5, 0, 0], toR: true, sag: 4.4 }
      ],
      tailU: 13, endU: 13, knot: ['L', 2.2, -0.9, 0], tie: TIE3,
      steps: [
        { t: 'Assess the wound', cam: '3d', dur: 1.4, b: 'Clean, viable edges and no tension. Each stitch crosses the wound at a right angle and stands on its own. Plan the spacing before the first bite.' },
        { t: 'Enter perpendicular to the skin', cam: '3d', pass: 0, f1: 0.3,
          b: 'Hold the needle about two-thirds back from the tip. Place the point 5 mm from the edge at 90° to the skin and drive it in by rotating the wrist, not by pushing.',
          marks: [{ at: ['L', 5, 0, 0], label: 'Entry 5 mm out, 90° to skin', dx: -170, dy: -34 }] },
        { t: 'Follow the needle’s own curve', cam: 'section', pass: 0, f0: 0.3, f1: 0.66,
          b: 'Let the needle travel along its curve through epidermis and dermis and down under the wound, taking slightly more deep tissue than superficial tissue. That flask shape brings the base of the wound together and keeps the edges from turning inward.' },
        { t: 'Bring the point out through the skin', cam: 'section', pass: 0, f0: 0.66, f1: 0.95,
          b: 'Keep turning the wrist: the point tents the skin 5 mm out on the far side and breaks through it. When the tip shows in the wound, regrasp it — the thread follows the needle out of the track.',
          marks: [{ at: ['R', 5, 0, 0], label: 'Out through the skin, same 5 mm', dx: 24, dy: -46 }] },
        { t: 'Draw the needle out', cam: '3d', pass: 0, f0: 0.95, f1: 1.55,
          b: 'Regrasp the tip two-thirds back now that it is clear of the skin and draw the needle and thread out along the same arc, so the thread runs through the track without tearing — pulling straight enlarges the track. A short tail stays on the first side, and the strand passes under the wound with nothing holding the edges yet.' },
        ...knotSteps(),
        { t: 'Repeat along the wound', cam: '3d', rows: true,
          b: 'Space stitches 5–10 mm apart. On a long wound place the first stitch in the middle and halve the remaining gaps, so the line stays even.', dur: 4 }
      ]
    },

    /* 2. HORIZONTAL MATTRESS */
    {
      id: 'horizontal', name: 'Horizontal mattress', also: 'Horizontal mattress suture',
      group: 'Mattress', tissue: SKIN, draw: 'horizontal',
      tagline: 'Tension-bearing skin · thin or fragile skin · eversion',
      bestFor: 'Skin that needs support and eversion: a dog’s flank or groin, a clean fresh horse limb wound, thin skin in an older cat.',
      indications: [
        'Skin wounds under tension where a simple stitch would tear out — a dog’s flank, or a clean, fresh horse limb wound',
        'Thin, loose or fragile skin: older cats, the groin of a dog, the flank of a deep-chested dog',
        'Wounds whose edges roll inward and need to be everted',
        'Skin grafts and flaps, and as a tension-relieving or haemostatic stitch in oozing tissue'
      ],
      pros: [
        'Two limbs share the load, so tension is spread over a wider area',
        'Strong eversion of the wound edges',
        'Quick: two bites and one knot close a gaping wound',
        'Can act as a haemostatic stitch in oozing tissue'
      ],
      cons: [
        'Can strangulate the edges and cause ischaemia if tied too tightly',
        'Over-eversion leaves a ridge and a worse scar',
        'More fiddly to remove than a simple stitch',
        'The double bite can strangulate very thin or poorly vascular skin — a cat’s ear, the skin straight over a joint — so keep the bites small and tie only until the edges meet'
      ],
      checklist: [
        'Bites 5–10 mm from the edge and 5–10 mm apart along the wound — halve these on a cat',
        'Both limbs at the same depth, both square to the skin',
        'Tie only until the edges meet — do not blanch the skin',
        'Leave the stitch in long enough to hold, short enough to avoid marks',
        'Second limb goes back across the wound, parallel to the first'
      ],
      typical: ['nylon', 'prolene'], possible: ['vicryl', 'pds'],
      needle: 'Cutting or reverse-cutting',
      needleWhy: 'Dog and horse skin under tension is tough and thickened, so a cutting edge is needed to pass through it without the needle bending.',
      size: '2-0 to 3-0 in dogs and horses; 3-0 to 4-0 in cats',
      passes: [
        { side: 'L', a: [10, 0, 0], b: [10, 0, 0], sag: 9.5, toR: true },
        { side: 'R', a: [10, 0, 8], b: [10, 0, 8], sag: 9.5, toL: true }
      ],
      tailU: 14, endU: 14, knot: ['L', 9, -1.1, 4], tie: TIE3,
      steps: [
        { t: 'Plan the two limbs', cam: 'top',
          b: 'This stitch is a U lying parallel to the wound: two bites across the wound, joined on the surface. Decide where both limbs will sit before the first bite.' },
        { t: 'First bite: enter far from the edge', cam: '3d', pass: 0, f1: 0.55,
          b: 'Enter 8–10 mm from the edge at 90° to the skin, pass through both walls and exit the same distance out on the far side.',
          marks: [{ at: ['L', 10, 0, 0], label: '10 mm from the edge', dx: -160, dy: -34 }] },
        { t: 'Seat the first limb', cam: 'section', pass: 0, f0: 0.55,
          b: 'The deep limb splints the wound and takes the tension off the surface. Keep it square, not oblique, or the edges will slide out of line.' },
        { t: 'Move along the wound on the far side', cam: 'top', dur: 2.2,
          b: 'Carry the thread 5–10 mm along the wound on the far side. This surface segment is the base of the U.' },
        { t: 'Second bite: come back across', cam: '3d', pass: 1,
          b: 'Re-enter on the side you have just come out of, 5–10 mm along the wound, and cross back on the same line you came in on, so the two limbs lie parallel and the bridges sit flat along the wound.',
          marks: [{ at: ['R', 10, 0, 8], label: 'Same 10 mm, 8 mm along', dx: 90, dy: -44 }] },
        ...knotSteps(),
        { t: 'Repeat along the wound', cam: '3d', rows: true,
          b: 'Leave 5–10 mm between stitches. Check the skin between stitches: if it is blanched, the stitch is too tight.', dur: 4 }
      ]
    },

    /* 3. CROSS MATTRESS */
    {
      id: 'cross', name: 'Cross mattress', also: 'Crossed mattress suture',
      group: 'Mattress', tissue: SKIN, draw: 'cross',
      tagline: 'Oblique and curved wounds · tension in two directions',
      bestFor: 'A horizontal-mattress variant where the second limb crosses the first, making an X over the wound.',
      indications: [
        'Oblique or curved lacerations where a parallel mattress would pull the edges out of line — a horse’s flank, a dog’s shoulder',
        'Wounds that gape in two directions and need support from more than one angle, as wire and bite injuries often do',
        'Thin skin under moderate tension where a simple stitch cuts through',
        'Closing a defect beside a corner, where the loop must not run along the wound'
      ],
      pros: [
        'Spreads tension in two directions instead of one',
        'Holds an oblique wound that a parallel stitch would skew',
        'Good eversion with a small amount of material',
        'Quick to place and easy to remove'
      ],
      cons: [
        'Less precise apposition than interrupted or vertical mattress',
        'Bulky on the surface and leaves a cross-shaped mark',
        'Easy to strangulate the tip of the X, causing ischaemia',
        'Unfamiliar to many students and new graduates — write the pattern in the record'
      ],
      checklist: [
        'First limb crosses the wound obliquely, not at 90°',
        'Re-enter 3–5 mm from the first exit so the limbs really cross',
        'Keep both limbs at the same depth',
        'Tie on the side, off the crossing point',
        'Check the skin inside the X for blanching before you leave'
      ],
      typical: ['nylon', 'prolene'], possible: ['vicryl'],
      needle: 'Cutting or reverse-cutting',
      needleWhy: 'Same as any skin stitch: a cutting edge passes through dermis without undue force.',
      size: '2-0 to 3-0 in horses and large dogs; 3-0 to 4-0 in cats and small dogs',
      passes: [
        { side: 'L', a: [9, 0, -6], b: [9, 0, 2], sag: 9, toR: true },
        { side: 'R', a: [9, 0, 7], b: [9, 0, -11], sag: 9, toL: true }
      ],
      tailU: 13, endU: 13, knot: ['L', 8, -1.1, -8.5], tie: TIE3,
      steps: [
        { t: 'Set the angle of the first limb', cam: 'top',
          b: 'Unlike a horizontal mattress, the first limb crosses the wound on a diagonal. That angle is what lets the second limb cross it.' },
        { t: 'First limb: enter and cross obliquely', cam: '3d', pass: 0,
          b: 'Enter 8–10 mm from the edge and cross the wound at an angle, exiting the same distance out on the far side, further along the wound.',
          marks: [{ at: ['L', 9, 0, -6], label: 'Oblique entry', dx: -150, dy: -34 }] },
        { t: 'Reload close to the exit', cam: '3d', dur: 2,
          b: 'Pick the needle up again 3–5 mm from where it came out, still on the far side. This short gap is what makes the limbs cross instead of running parallel.' },
        { t: 'Second limb: cross back the other way', cam: 'top', pass: 1,
          b: 'Cross the wound again on the opposite diagonal, so the two limbs form an X over the wound. Pull through and keep the tension even on both limbs.',
          marks: [{ at: 'cross', label: 'The limbs cross over the wound', dx: 24, dy: -44 }] },
        ...knotSteps(),
        { t: 'Repeat: the same angle every time', cam: '3d', rows: true,
          b: 'Each stitch is independent. Keep the X the same size and the same angle along the wound, and leave 6–10 mm between stitches.', dur: 4 }
      ]
    },

    /* 4. VERTICAL MATTRESS */
    {
      id: 'vertical', name: 'Vertical mattress', also: 'Donati · Allgöwer suture',
      group: 'Mattress', tissue: SKIN, draw: 'vertical',
      tagline: 'Gaping wounds · loose skin · deep dead space',
      bestFor: 'Wounds under real tension that also need the edges everted and the deep dead space closed — a dog’s elbow, or a clean fresh horse limb wound.',
      indications: [
        'Skin wounds under marked tension: a dog’s elbow or hock; clean, fresh horse limb wounds, where distal limb wounds often heal better by second intention',
        'Loose, thin or redundant skin that rolls inward — older cats, the flank of a deep-chested dog, the ventral abdomen of a bitch',
        'Wounds with dead space under the skin that must be obliterated',
        'Closing skin and subcutaneous tissue in one stitch when anaesthetic time is short'
      ],
      pros: [
        'The best eversion of any simple stitch',
        'The deep far-far limb closes dead space and splints the wound',
        'Strong: spreads tension across a wide, deep bite',
        'One stitch approximates several layers'
      ],
      cons: [
        'Slower and technically more demanding than a simple stitch',
        'Ischaemia of the edge if tied tightly — the near-near limb sits in the same skin',
        'Leaves cross-hatch marks if left too long',
        'Fiddly to remove, and the marks last longer than a simple stitch'
      ],
      checklist: [
        'Far-far limb: 8–10 mm out, deep enough to close the dead space',
        'Near-near limb: 2–3 mm out, in the superficial dermis only',
        'The two limbs lie in the same line, perpendicular to the wound',
        'Tie until the edges just meet — no blanching',
        'Remove at 10–14 days on the body, up to 21 on a limb'
      ],
      typical: ['nylon', 'prolene'], possible: ['vicryl', 'pds'],
      needle: 'Cutting or reverse-cutting',
      needleWhy: 'The deep limb has to pass a lot of tough dermis; a cutting edge keeps the needle straight, especially in a horse’s limb.',
      size: '2-0 to 3-0 in dogs and horses; 3-0 to 4-0 in cats',
      passes: [
        { side: 'L', a: [10, 0, 0], b: [10, 0, 0], sag: 9.5, toR: true },
        { side: 'R', a: [2.6, 0, 0], b: [2.6, 0, 0], sag: 1.4, toL: true }
      ],
      tailU: 14, endU: 14, knot: ['L', 6.4, -1.1, 0], tie: TIE3,
      steps: [
        { t: 'Two limbs, one stitch', cam: 'section',
          b: 'A deep far-far bite for strength and dead space, then a shallow near-near bite for eversion. Both lie in the same line across the wound.' },
        { t: 'Far-far: enter well out and deep', cam: '3d', pass: 0, f1: 0.6,
          b: 'Enter 8–10 mm from the edge at 90°, take a deep bite through the dermis and into the subcutis, and exit the same distance out on the far side. This is the limb that closes the dead space.',
          marks: [{ at: ['L', 10, 0, 0], label: 'Enter 8–10 mm out', dx: -160, dy: -36 }] },
        { t: 'Seat the deep limb', cam: 'section', pass: 0, f0: 0.6,
          b: 'This limb splints the wound and closes the dead space. Keep it square: an oblique deep bite will pull the edges out of alignment.' },
        { t: 'Turn the needle around', cam: 'top', dur: 2,
          b: 'Bring the needle back to the surface on the far side, then re-enter close to the wound for the second limb.' },
        { t: 'Near-near: 2–3 mm, superficial only', cam: 'section', pass: 1,
          b: 'Take a shallow bite of superficial dermis 2–3 mm from each edge and cross back. This is the limb that turns the edges outward.',
          marks: [{ at: ['R', 2.6, 0, 0], label: 'Shallow, 2–3 mm from the edge', dx: 40, dy: -46 }] },
        ...knotSteps(),
        { t: 'Repeat along the wound', cam: '3d', rows: true,
          b: 'Space stitches 5–10 mm apart. With both limbs seated, the wound line sits slightly raised — that is the eversion you wanted.', dur: 4 }
      ]
    },

    /* 5. CONTINUOUS INTERLOCK */
    {
      id: 'interlock', name: 'Continuous interlock', also: 'Continuous locked · Ford interlocking',
      group: 'Continuous', tissue: SKIN, draw: 'interlock',
      tagline: 'Long skin and fascial lines · speed with locked tension',
      bestFor: 'Long incisions that need to be closed quickly without the line losing tension between stitches.',
      indications: [
        'Long skin lacerations and surgical incisions in dogs, cats and horses',
        'Long fascial lines: a midline laparotomy in a dog or cat, a ventral midline coeliotomy in a horse',
        'Securing skin grafts and long flaps',
        'Any long wound where speed under anaesthesia matters and a single continuous line is acceptable'
      ],
      pros: [
        'Fast: one thread, one or two knots for the whole line',
        'Each stitch is locked, so tension cannot migrate along the line',
        'Even, haemostatic closure of a long wound',
        'Less foreign material than a line of interrupted stitches'
      ],
      cons: [
        'If the thread breaks or one stitch fails, the whole line can open',
        'Hard to remove selectively or to revise part of the wound',
        'Over-tight locks strangulate the edges and leave a ladder of marks',
        'Needs more length of thread; a short tail ends the closure early'
      ],
      checklist: [
        'Start with a knotted anchor stitch and cut only the short tail',
        'Bites 5–10 mm from the edge, evenly spaced',
        'Pass the needle through the loop each time before pulling tight',
        'Snug, not tight: the skin between stitches must not blanch',
        'Finish by tying the last loop to the free end; never leave it unlocked'
      ],
      typical: ['nylon', 'prolene', 'pds'], possible: ['vicryl'],
      needle: 'Cutting for skin; taper for fascia',
      needleWhy: 'Skin needs a cutting edge. The linea alba is tough but not layered like skin, so a heavy taper or a cutting needle both work.',
      size: '2-0 to 3-0 for skin in dogs and horses, 3-0 to 4-0 in cats; 2-0 to 3-0 for the linea alba in a dog or cat, 2 in a horse',
      passes: [
        { side: 'L', a: [6, 0, -12], b: [6, 0, -12], sag: 6.7, toR: true },
        { side: 'L', a: [6, 0, -4], b: [6, 0, -4], sag: 6.7, toR: true },
        { side: 'L', a: [6, 0, 4], b: [6, 0, 4], sag: 6.7, toR: true },
        { side: 'L', a: [6, 0, 12], b: [6, 0, 12], sag: 6.7, toR: true }
      ],
      lockSide: 'R',
      tailU: 14, endU: 14, knot: ['R', 7, -1.2, 12], locks: [-12, -4, 4, 12], tie: TIE3_LOOP,
      steps: [
        { t: 'Anchor the line', cam: '3d', pass: 0,
          b: 'Start with one complete knotted stitch at the far end and cut only the short tail. That knot is the anchor for the whole line.',
          marks: [{ at: 'knot', label: 'Anchor knot — keep the long end', dx: -140, dy: -34 }] },
        { t: 'Lock the first loop', cam: '3d', dur: 2.4,
          b: 'Before tightening, pass the needle through the loop you have just made. Pulling now locks the stitch instead of sliding it back.',
          marks: [{ at: ['R', 6, 0, -12], label: 'Pass the needle through the loop', dx: 40, dy: -44 }], lock: 0 },
        { t: 'Carry the thread to the next bite', cam: 'top', dur: 2.2,
          b: 'The thread crosses the wound on the surface. Keep that crossing at the same angle for every stitch, so the closure looks and behaves evenly.' },
        { t: 'Next bite, same size', cam: '3d', pass: 1,
          b: 'Enter 5–10 mm from the edge and take exactly the same bite as the first. Uneven bites are what make a locked line pucker.' },
        { t: 'Lock again', cam: '3d', pass: 2,
          b: 'Through the loop, then snug. Feel the lock seat rather than pulling hard: the tension should be in the loop, not in the skin.' },
        { t: 'Continue to the end of the wound', cam: '3d', pass: 3,
          b: 'Keep the spacing and the depth constant. Watch the far end: leave enough thread to tie off comfortably.' },
        /* the line is finished by tying the needle end to its own last loop */
        ...knotSteps({ loop: true })
      ]
    },

    /* 6. LEMBERT */
    {
      id: 'lembert', name: 'Lembert', also: 'Lembert suture',
      group: 'Inverting', tissue: BOWEL, draw: 'lembert',
      tagline: 'Bowel · stomach · bladder · uterus — inverting, stays out of the lumen',
      bestFor: 'Closing a hollow organ so that serosa meets serosa, without putting the thread inside the lumen.',
      indications: [
        'Closing an enterotomy or a small bowel defect in a dog or cat',
        'The outer, inverting layer of a two-layer intestinal anastomosis',
        'Closing the bladder after a cystotomy, or the uterus after a caesarean',
        'Reinforcing a first appositional layer, or closing a bowel stump'
      ],
      pros: [
        'Inverts the edges so serosa meets serosa, which seals quickly',
        'The needle never enters the lumen, so less contamination along the thread',
        'Interrupted bites: one failure does not open the line',
        'Easy to reinforce with a second row'
      ],
      cons: [
        'Inversion adds bulk and can narrow a small or tubular lumen',
        'Tying too tightly strangles the fold and risks ischaemia',
        'Uses more tissue than simple apposition',
        'Not for skin, or for any tissue that must stay everted'
      ],
      checklist: [
        'Bites perpendicular to the cut edge',
        'Seromuscular-submucosal: serosa → muscularis → submucosa — the submucosa is the layer that holds — never into the lumen',
        'Enter 5–8 mm from the edge and exit 2–3 mm from it (scale down for thin organs)',
        'Mirror the bite on the other side at the same depth',
        'Tie only until serosa touches serosa'
      ],
      typical: ['vicryl', 'pds'], possible: ['silk', 'monocryl'],
      needle: 'Taper (round-bodied)',
      needleWhy: 'A taper point pushes bowel wall aside instead of cutting it, so the thread track stays sealed.',
      size: '3-0 to 4-0 for small bowel in dogs and cats; 2-0 to 3-0 for stomach and bladder; 2-0 for equine small intestine',
      passes: [
        { side: 'L', a: [6.5, 0, 0], b: [1.6, 0, 0], sag: 2.2 },
        { side: 'R', a: [1.6, 0, 0], b: [6.5, 0, 0], sag: 2.2 }
      ],
      tailU: 10, endU: 10, knot: ['L', 4, -0.9, 0], tie: TIE3,
      steps: [
        { t: 'Two edges side by side', cam: '3d',
          b: 'A cut hollow organ has two full-thickness edges. The aim is to fold both edges inward so that serosa meets serosa on the outside of the bowel.' },
        { t: 'Enter the serosa, far from the edge', cam: '3d', pass: 0, f1: 0.4,
          b: 'Start about 6 mm from the cut edge, perpendicular to the cut. The bite is seromuscular: the needle never needs to enter the lumen.',
          marks: [{ at: ['L', 6.5, 0, 0], label: 'Enter serosa 5–8 mm out', dx: -160, dy: -34 }] },
        { t: 'Stay inside the wall', cam: 'section', pass: 0, f0: 0.4, f1: 0.82,
          b: 'Follow the needle curve through the muscularis and into the submucosa, stopping short of the mucosa. The submucosa is the holding layer: a bite that stops in muscle pulls out, and a full-thickness bite lets bowel contents track along the thread.',
          marks: [{ at: ['L', 4, 2.2, 0], label: 'Seromuscular-submucosal bite', dx: -40, dy: 40 }] },
        { t: 'Exit close to the cut edge', cam: 'section', pass: 0, f0: 0.82,
          b: 'Bring the tip out through the serosa 2–3 mm from the edge, then pull the needle off along its curve.' },
        { t: 'Cross the cut on the surface', cam: '3d', dur: 2.2,
          b: 'Carry the thread across the cut to the matching point on the other side. This short surface bridge is what will be pulled down as the fold inverts.' },
        { t: 'Mirror the bite', cam: 'section', pass: 1,
          b: 'Enter near the edge (2–3 mm), pass through the same layers at the same depth and exit far out (5–8 mm) on the other side. Symmetry keeps the fold flat.',
          marks: [{ at: ['R', 6.5, 0, 0], label: 'Same depth, same distances', dx: 30, dy: -44 }] },
        { t: 'Tighten: the edges roll inward', cam: 'section',
          b: 'As the loop closes, both cut edges are pulled under and the serosal surfaces come face to face. Tighten only until they meet — strangling the fold causes ischaemia and narrows the lumen.',
          cine: { p: [0, 1] }, dur: 4.6,
          marks: [{ at: 'wound', label: 'Serosa meets serosa', dx: 26, dy: -44 }] },
        ...knotSteps({ keepP: true }),
        { t: 'Repeat along the line', cam: '3d', rows: true,
          b: 'Place stitches a few millimetres apart so no gap can leak. Check the line for leaks and confirm the lumen is not narrowed.', dur: 4 }
      ]
    },

    /* 7. CUSHING */
    {
      id: 'cushing', name: 'Cushing', also: 'Cushing suture',
      group: 'Inverting', tissue: BOWEL, draw: 'cushing',
      tagline: 'Stomach · bladder · uterus — continuous inverting layer in dogs and cats',
      bestFor: 'A long hollow-organ incision that must be inverted in one continuous, watertight layer — typically a gastrotomy or a cystotomy.',
      indications: [
        'Closing a long incision in the stomach or bladder of a dog or cat',
        'A continuous inverting seromuscular layer over a first closure',
        'Closing the stomach after a gastrotomy for a foreign body',
        'Any long hollow-organ wound where speed and a watertight line matter'
      ],
      pros: [
        'Fast: one continuous inverting line, two knots',
        'Even inversion along the whole length',
        'Never enters the lumen (unlike a Connell, which does)',
        'Watertight and haemostatic when the bites are even'
      ],
      cons: [
        'If the thread breaks, the whole inverting line can loosen',
        'Narrows the lumen; avoid on the small bowel of a cat or a small dog',
        'Needs constant bite size — uneven bites pucker and leak',
        'Can strangulate the inverted fold if pulled too tight'
      ],
      checklist: [
        'Anchor with a knot at one end, then run the line',
        'Bites parallel to the incision, 3–5 mm from the edge',
        'Cross the wound obliquely between bites, never through the lumen',
        'Snug each crossing before moving on',
        'Finish with a knot and check the line is watertight'
      ],
      typical: ['vicryl', 'pds'], possible: ['monocryl', 'silk'],
      needle: 'Taper (round-bodied)',
      needleWhy: 'A taper point passes through the wall without cutting a track that could leak.',
      size: '2-0 to 3-0 for stomach and bladder; 3-0 to 4-0 for small bowel in dogs and cats',
      passes: [
        { side: 'L', a: [5, 0, -14], b: [5, 0, -6], sag: 2.2 },
        { side: 'R', a: [5, 0, -6], b: [5, 0, 2], sag: 2.2 },
        { side: 'L', a: [5, 0, 2], b: [5, 0, 10], sag: 2.2 },
        { side: 'R', a: [5, 0, 10], b: [5, 0, 16], sag: 2.2 }
      ],
      tailU: 10, endU: 10, knot: ['R', 5, -1.2, 16], tie: TIE3_LOOP,
      steps: [
        { t: 'Anchor at one end', cam: '3d', dur: 2.4,
          b: 'Start with a simple interrupted or Lembert anchor stitch at one end of the incision and cut only the short tail. From here the line runs continuously.',
          marks: [{ at: 'knot', label: 'Anchor knot', dx: -140, dy: -34 }] },
        { t: 'A bite parallel to the incision', cam: '3d', pass: 0,
          b: 'Take a shallow seromuscular bite that runs along the wound, 3–5 mm from the edge, staying outside the lumen.',
          marks: [{ at: ['L', 5, 2, -10], label: 'Bite parallel to the wound', dx: -160, dy: -34 }] },
        { t: 'Cross the wound on the surface', cam: 'top', dur: 2.2,
          b: 'The thread crosses to the far side at a slight angle. Every crossing passes over the wound, so when it is pulled snug the edges roll inward and the thread is buried under the inverted serosa.' },
        { t: 'Mirror the bite on the far side', cam: '3d', pass: 1,
          b: 'The same parallel bite, the same distance from the edge and the same depth, running the other way along the wound.',
          marks: [{ at: ['R', 5, 2, -2], label: 'Same bite, other side', dx: 30, dy: -44 }] },
        { t: 'Cross back and continue', cam: 'top', pass: 2,
          b: 'Keep each crossing oblique — never set square to the wound — and the spacing even. Square, uneven crossings are what make a Cushing line leak.' },
        { t: 'Finish the line', cam: '3d', pass: 3,
          b: 'Carry the last crossing to the end of the incision, pull each crossing snug as you go, then tie the needle end to the last loop with three throws.' },
        ...knotSteps({ loop: true }),
        { t: 'Check inversion and lumen', cam: 'section', dur: 4.5,
          b: 'Look at the line: the edges should be rolled in, serosa to serosa, with no gap. Check the organ has not been drawn up and bunched like a purse-string, then feel for narrowing — if the lumen is tight, the bites were too big or too tight.',
          marks: [{ at: 'wound', label: 'Inverted, watertight, not narrowed', dx: 26, dy: -46 }] }
      ]
    },

    /* 8. PURSE STRING */
    {
      id: 'purse', name: 'Purse-string', also: 'Purse-string suture',
      group: 'Round', tissue: ROUND, draw: 'purse',
      tagline: 'Rectal prolapse · drain sites · round defects — a drawstring closure',
      bestFor: 'Gathering a circular opening closed, or closing tissue snugly around a tube.',
      indications: [
        'Holding a rectal prolapse reduced in a dog or cat while the swelling settles',
        'Closing the body wall snugly around a thoracic or abdominal drain',
        'Closing a small round skin defect or a bite puncture',
        'Securing a gastrostomy or cystostomy tube, and closing the skin after an anal sacculectomy',
        'Closing a port site or a feeding-tube site after the device is removed'
      ],
      pros: [
        'Closes a round defect with one continuous thread and one knot',
        'Adjustable: tighten until the opening is exactly as closed as you want',
        'No long scar and no corner where three wound edges meet',
        'Fast, and works around a tube without leaking'
      ],
      cons: [
        'Puckers the tissue and leaves a star-shaped scar',
        'Easy to narrow too much, or to leave a small leak',
        'Uneven bites bunch the tissue to one side',
        'Blind bites near bowel or vessels can injure what lies beneath'
      ],
      checklist: [
        'Bites 2–3 mm from the edge, 3–5 mm apart, all at the same depth',
        'Keep the needle parallel to the surface to avoid deep structures',
        'Both ends must come out on the same surface, next to each other',
        'Pull evenly, like a drawstring, before tying',
        'Check the closure: no gap, no pucker large enough to necrose'
      ],
      typical: ['nylon', 'prolene', 'vicryl'], possible: ['pds', 'silk'],
      needle: 'Cutting for skin; taper for serosa or viscera',
      needleWhy: 'Match the point to the tissue: a cutting edge for skin, a taper for bowel or serosa, and a blunt point near liver or kidney.',
      size: '2-0 to 3-0 around a rectal prolapse in a dog; 3-0 to 4-0 for drain sites and skin in dogs and cats',
      /* A purse-string bite dives into the wall and comes out again: with a shallow
         sag the needle skimmed the surface and the thread never showed. */
      passes: ringBites(12, 1.5),
      ring: { bites: 12, arc: 24 }, tie: TIE3,
      steps: [
        { t: 'A ring, not a line', cam: 'top',
          b: 'The stitch travels around the opening at a constant distance from its edge, like a drawstring threaded through a hem. Every bite is the same size.' },
        { t: 'Start with a tail outside the ring', cam: '3d', pass: 0,
          b: 'Begin at one point on the ring, 2–3 mm from the edge, and leave a tail long enough to hold. Keep the needle parallel to the surface.' },
        { t: 'Bites around the circle', cam: 'top', pass: 1, passEnd: 5,
          b: 'Take small bites in and out of the tissue, following the circle. Each bite enters and leaves the surface, and a short length of thread is left lying over the tissue between one bite and the next.' },
        { t: 'Keep the spacing even', cam: 'top', pass: 6, passEnd: 10,
          b: 'Even spacing prevents one side bunching. If the tissue is thin, take shallower bites rather than wider ones, and keep every bite at the same distance from the edge.' },
        { t: 'Come out beside the start', cam: '3d', pass: 11,
          b: 'Finish so both ends emerge on the same surface, next to each other. Pull the needle off and leave both ends free.' },
        { t: 'Cinch like a drawstring', cam: 'top',
          b: 'The needle goes to the other hand, and both ends are pulled evenly. In practice, keep a finger, a tube or the tip of closed forceps in the opening, so the tissue rolls in over it instead of closing on nothing. Stop when the edges meet — over-tightening strangulates the tips of the puckers.',
          cine: { p: [0, 1] }, dur: 4.4,
          marks: [{ at: 'wound', label: 'Gathers evenly from all sides', dx: 20, dy: -40 }] },
        /* tied under that tension, the two ends side by side */
        ...knotSteps({ handoff: false }),
        { t: 'Check the closure', cam: 'top', dur: 3.4,
          b: 'Check there is no gap: a purse-string that leaks is worse than a slightly puckered one.',
          marks: [{ at: 'knot', label: 'Tied under tension', dx: 26, dy: -42 }] }
      ]
    },

    /* 9. THE SURGICAL KNOT — INSTRUMENT TIE */
    {
      id: 'knot', name: 'Surgical knot', also: 'Instrument tie · surgeon’s knot',
      group: 'Knot', tissue: SKIN, draw: 'interrupted',
      tagline: 'The needle holder · one strand · the knot that holds every stitch',
      bestFor: 'Tying any suture when the wound is deep, the strand is short, or gloves and fine thread make a finger tie clumsy — the standard knot in dog, cat and horse surgery.',
      indications: [
        'Every tied stitch: simple and mattress patterns in skin, fascia, muscle, bowel and bladder, and the single knot of a purse-string',
        'Deep or narrow fields — the mouth of a dog, the perineum of a cat, a horse’s hoof — where the fingers cannot reach the knot and would block the view',
        'A short strand: when only a few centimetres of thread are left after the bite, an instrument tie finishes it without needing room for fingers',
        'A first throw that must hold by itself while the second is tied — the double first throw of a surgeon’s knot, for skin under tension',
        'Any knot tied in monofilament, which slips far more readily than braid and needs the extra throws'
      ],
      pros: [
        'Uses only the instruments already in the hands — no fingers inside the wound',
        'The double first throw holds the wound apposed while the second is placed',
        'Tension is set by feel and can be eased off before the knot is locked',
        'Works in a deep or narrow field, and keeps both hands and the wound in view'
      ],
      cons: [
        'Two throws in the same direction make a sliding granny knot that loosens as the wound swells',
        'Over-tightening strangles the tissue — thin feline skin cuts through before the knot looks tight',
        'Too few throws: monofilament, especially polypropylene, needs three or four',
        'A long tail wicks bacteria, irritates the skin and catches the next stitch; a tail under 2 mm works loose'
      ],
      checklist: [
        'The holder laid across the wound between the two ends, jaws towards the short tail',
        'Two wraps of the long end round the jaws — the surgeon’s double first throw',
        'The short tail taken by its very tip, not further up where it will lie in the knot',
        'The tail drawn back through the wraps; the hands cross to the other sides',
        'Both ends pulled out level until the edges just meet and the throw lies flat',
        'Second and third throws a single wrap each, each the opposite way to the last',
        'Tails cut to 2–3 mm, the knot beside the wound and not on it'
      ],
      typical: ['nylon', 'prolene', 'vicryl', 'pds'], possible: ['monocryl', 'silk', 'gut'],
      needle: 'The needle stays on the long end, out of the field in the other hand; the knot is tied with the needle holder alone.',
      needleWhy: 'What holds a knot is the direction of the throws, an even pull and enough of them. The needle only decides where the strand lies in the tissue, and by this point its work is done.',
      size: 'Tied with whatever strand closed the wound: 3-0 to 4-0 skin in a dog or cat, 2-0 to 3-0 fascia and body wall, 4-0 to 5-0 on the face, eyelid or ear, 2-0 to 3-0 on a horse’s limb or body wall.',
      /* One simple bite is already in the skin when the tab starts: the video is the
         knot alone. `tie.throws` is the wraps in each throw - a double first throw,
         then single throws - and each step's `tie` range is the part of the tie it
         shows: one unit a throw, split place / wrap / grasp / pull / seat at
         0.15 / 0.45 / 0.62 / 0.82. */
      passes: [
        { side: 'L', a: [5, 0, 0], b: [5, 0, 0], toR: true, sag: 4.4 }
      ],
      preplaced: true,
      tailU: 13, endU: 13, knot: ['L', 2.2, -0.9, 0],
      tie: { throws: [2, 1, 1] },
      steps: [
        { t: 'The bite is in, both ends out', cam: '3d', dur: 3.2,
          b: 'The stitch has been passed and the needle drawn clear. The short tail lies on the near side; the long end leaves the far side and runs up to the other hand, which still has the needle. Nothing holds the edges yet.',
          marks: [{ at: ['L', 11, 0, 0], label: 'Short tail', dx: -120, dy: -30 }, { at: ['R', 7, 0, 0], label: 'Long end, to the other hand', dx: 24, dy: -46 }] },
        { t: 'Lay the holder across, between the ends', cam: 'knot', cine: { tie: [0, 0.15] }, dur: 1.9,
          b: 'The needle holder is laid across the wound over the place the knot will sit, jaws towards the short tail, and the long end is brought against its jaws.' },
        { t: 'Wrap twice: the surgeon’s throw', cam: 'knot', cine: { tie: [0.15, 0.45] }, dur: 4.2,
          b: 'The other hand winds the long end twice round the jaws, both turns the same way and side by side. Two wraps give the first throw the friction to hold the edges on its own while the next throw is made.',
          marks: [{ at: 'knot', label: 'Two wraps, side by side', dx: 30, dy: -50 }] },
        { t: 'Take the short tail by its tip', cam: 'knot', cine: { tie: [0.45, 0.62] }, dur: 2.4,
          b: 'Still carrying the wraps, the holder goes to the short tail, opens and takes it by the very tip. Gripping further up crushes the part of the strand that will lie in the knot.' },
        { t: 'Draw it through — the hands cross', cam: 'knot', cine: { tie: [0.62, 0.82] }, dur: 2.8,
          b: 'The holder draws the tail back through the wraps, which slide off the jaws and onto it. The ends change sides: the short tail goes to the far side, the long end comes to the near side.' },
        { t: 'Lay the throw flat — the edges meet', cam: 'section', cine: { tie: [0.82, 1] }, dur: 2.8,
          b: 'Both ends are pulled out level and in opposite directions, and the double throw beds down on the skin. Stop as soon as the edges meet: a throw that blanches the skin is already too tight for a wound that will swell.',
          marks: [{ at: 'wound', label: 'Edges meet, not blanched', dx: 24, dy: -48 }] },
        { t: 'Second throw: one wrap, the other way', cam: 'knot', cine: { tie: [1, 1.45] }, dur: 3.6,
          b: 'The holder is laid across again and the long end wound once round it — in the opposite direction to the first throw. That reversal is what squares the knot; the same direction twice makes a granny, which slips.' },
        { t: 'Grasp, draw through, seat it', cam: 'knot', cine: { tie: [1.45, 2] }, dur: 4.6,
          b: 'The tail is taken by its tip and drawn through, the hands go back to their own sides, and the second throw is laid down flat on the first.',
          marks: [{ at: 'knot', label: 'Throw 2 — reversed', dx: 30, dy: -50 }] },
        { t: 'Third throw locks it', cam: 'knot', cine: { tie: [2, 3] }, dur: 7,
          b: 'One more single wrap, reversed again, drawn through and seated on the other two. Three throws is the minimum in monofilament; smooth polypropylene may need a fourth.',
          marks: [{ at: 'knot', label: 'Throw 3 — reversed again', dx: 30, dy: -50 }] },
        { t: 'Cut the tails to 2–3 mm', cam: 'knot', cine: { c: [0, 1] }, cut: true, dur: 3.2,
          b: 'Both tails are cut 2–3 mm from the knot. Shorter and the knot can work loose; longer and the ends wick bacteria, irritate the skin and catch the next stitch.',
          marks: [{ at: 'knot', label: 'Tails 2–3 mm', dx: 30, dy: -50 }] },
        { t: 'The finished knot', cam: '3d', dur: 3.4,
          b: 'A square knot lying flat beside the wound, with the edges just touching under it. Sitting off the incision line, it does not press into the scar and is easy to find and cut when the stitch comes out.' }
      ]
    }
  ];

  /* ---------------- matching game ---------------- */
  const SITES = [
    { id: 'skin', tech: 'interrupted', name: 'Dog — clean limb laceration', sub: '4 cm, low tension, healthy skin', art: 'skin' },
    { id: 'tension', tech: 'horizontal', name: 'Dog — thin skin under tension', sub: 'Flank or groin, edges rolling in', art: 'tension' },
    { id: 'oblique', tech: 'cross', name: 'Horse — oblique flank laceration', sub: 'Wire injury, gapes in two directions', art: 'oblique' },
    { id: 'gaping', tech: 'vertical', name: 'Cat — gaping stifle wound', sub: 'Thin loose skin, deep dead space', art: 'gaping' },
    { id: 'fascia', tech: 'interlock', name: 'Dog — midline laparotomy', sub: '20 cm linea alba, fast closure', art: 'fascia' },
    { id: 'bowel', tech: 'lembert', name: 'Dog — small bowel enterotomy', sub: 'Serosa must meet serosa', art: 'bowel' },
    { id: 'stomach', tech: 'cushing', name: 'Dog — gastrotomy incision', sub: 'Long, continuous, inverting', art: 'stomach' },
    { id: 'round', tech: 'purse', name: 'Dog — thoracic drain site', sub: 'Close snugly around the tube', art: 'round' }
  ];

  /* ---------------- case test ---------------- */
  const CASES = [
    {
      id: 'c1', art: 'skin', wound: 'line', length: 4,
      title: 'Clean thigh laceration — working dog',
      text: 'A 4 cm clean laceration on the lateral thigh of a healthy 3-year-old working dog, seen two hours after the injury. The wound has been clipped and lavaged, the edges are clean and viable, and they fall together with almost no tension. The dog is due back at work in ten days.',
      best: 'interrupted', ok: ['vertical', 'horizontal'],
      targets: [0.3, 0.5, 0.7], targetCount: 3,
      why: 'Low-tension skin with clean edges is the standard case for simple interrupted stitches: precise apposition, tension set stitch by stitch, and a single stitch can be removed early if the wound begins to discharge.',
      trap: 'A mattress pattern would hold, but it puts more foreign material and more tension into skin that needs neither, and leaves a heavier scar on a limb that has to move.'
    },
    {
      id: 'c2', art: 'gaping', wound: 'line', length: 6,
      title: 'Gaping stifle wound — older cat',
      text: 'A 6 cm gaping laceration over the stifle of a thin 12-year-old cat, seen six hours after the injury and still clean. The skin is thin and loose, the edges curl inward, and the wound opens whenever the joint flexes. There is dead space under the skin and the cat will not tolerate a dressing.',
      best: 'vertical', ok: ['horizontal', 'cross'],
      targets: [0.22, 0.5, 0.78], targetCount: 3,
      why: 'Vertical mattress does both jobs: the far-far limb closes the dead space and carries the tension, and the near-near limb everts the curled edges away from the joint surface.',
      trap: 'A simple stitch cuts straight through thin feline skin and leaves the edges inverted. Horizontal mattress is a reasonable second choice but addresses the dead space less well.'
    },
    {
      id: 'c3', art: 'oblique', wound: 'line', length: 7,
      title: 'Oblique flank laceration — horse',
      text: 'A 7 cm laceration running obliquely across the flank of a horse, from a wire fence. The two edges are pulled in different directions by the flank musculature, so a stitch placed straight across drags the wound out of line as the horse moves. The wound is fresh, clean and fully clipped.',
      best: 'cross', ok: ['horizontal', 'vertical'],
      targets: [0.25, 0.5, 0.75], targetCount: 3,
      why: 'The crossed limbs of a cross mattress hold tension in two directions, which keeps an oblique wound on a moving flank from skewing while it closes.',
      trap: 'A horizontal mattress pulls in one direction only; on an oblique wound under this much movement it tends to slide the edges past each other and leave a step.'
    },
    {
      id: 'c4', art: 'fascia', wound: 'line', length: 9,
      title: 'Midline laparotomy — dog',
      text: 'A 20 cm midline laparotomy in a 4-year-old Labrador after a splenectomy. The linea alba must be closed securely and quickly; the abdomen is clean and the dog is stable, but the operating list is running late and the surgeon is working alone.',
      best: 'interlock', ok: ['interrupted'],
      targets: [0.15, 0.4, 0.65, 0.9], targetCount: 4,
      why: 'A continuous locked line closes a long fascial incision quickly, with one knot and even tension along its length. Small bites taken well into the linea alba matter in a dog that will be weight-bearing on the abdominal wall the day it wakes.',
      trap: 'Interrupted sutures are secure but slow on a 20 cm line. A continuous unlocked line is faster still, but can loosen along its length and let the omentum through.'
    },
    {
      id: 'c5', art: 'bowel', wound: 'line', length: 3,
      title: 'Small bowel enterotomy — dog',
      text: 'A 2 cm enterotomy in the jejunum of a 6-year-old terrier after removing a linear foreign body. The lumen is only about 2 cm across and the wall is oedematous, and the closure must be watertight without narrowing it.',
      best: 'lembert', ok: ['cushing'],
      targets: [0.35, 0.65], targetCount: 2,
      why: 'Interrupted Lembert bites invert the edges so serosa meets serosa, stay out of the lumen, and can be placed exactly where they are needed in short, small-calibre bowel.',
      trap: 'A continuous inverting line (Cushing) can narrow a 2 cm lumen and leave the dog vomiting after an otherwise good surgery. Interrupted bites let you check the calibre as you go.'
    },
    {
      id: 'c6', art: 'stomach', wound: 'line', length: 8,
      title: 'Gastrotomy — dog',
      text: 'An 8 cm gastrotomy incision in a 3-year-old spaniel after removing a foreign body. The stomach wall is thick and well vascularised, the lumen is spacious, and the closure must invert the edges along the whole length in one layer.',
      best: 'cushing', ok: ['lembert'],
      targets: [0.2, 0.45, 0.7, 0.92], targetCount: 4,
      why: 'Cushing runs a continuous inverting seromuscular line with bites parallel to the incision: fast, even and watertight on a thick, spacious organ such as the stomach.',
      trap: 'Interrupted Lembert stitches would also invert the wall but take far longer on 8 cm of stomach, and every extra knot is more material in a contaminated field.'
    },
    {
      id: 'c7', art: 'round', wound: 'round', length: 0,
      title: 'Thoracic drain site — dog',
      text: 'A 12 mm thoracic drain is pulled from a dog recovering from pneumothorax. The round defect must close snugly the moment the drain leaves, with no air leak and no dead space, and the skin must not pucker into a star that the dog will lick.',
      best: 'purse', ok: [],
      targets: [0.5], targetCount: 1,
      why: 'A purse-string gathers a round opening evenly from all sides with one thread, so the defect is closed around the drain and shut the instant it is withdrawn.',
      trap: 'Interrupted stitches around a circle leave corners between them, which is exactly where air leaks and the wound reopens.'
    }
  ];

  /* Species presets: the numbers the copy quotes (3 mm bites in a cat, 5 mm in a
     dog, 6-7 mm in a horse's limb) applied to the model. `thick` scales every
     layer, `tension` scales how far the wound edges sit apart, `bite` scales the
     distance of every bite from the edge and its depth. */
  const SPECIES = [
    {
      id: 'dog', name: 'Dog', thick: 1, tension: 1, bite: 1,
      note: 'Dog — 14 mm of skin, fat and muscle; bites 5 mm from the edge, 5–10 mm apart.'
    },
    {
      id: 'cat', name: 'Cat', thick: 0.62, tension: 0.7, bite: 0.6,
      note: 'Cat — thin, fragile skin (about 9 mm to muscle): 3 mm bites, placed gently, the knot only until the edges meet.'
    },
    {
      id: 'horse', name: 'Horse', thick: 1.45, tension: 1.4, bite: 1.3,
      note: 'Horse — thick, tough limb skin under tension (about 20 mm): 6–7 mm bites and a wider gap to close.'
    },
    {
      id: 'sheep', name: 'Sheep', thick: 0.8, tension: 0.85, bite: 0.85,
      note: 'Sheep — thin skin under a heavy fleece (about 11 mm to muscle): clip the wool well back, 4 mm bites, and tie gently, because sheep skin tears easily.'
    },
    {
      id: 'cattle', name: 'Cattle', thick: 1.7, tension: 1.5, bite: 1.45,
      note: 'Cattle — the thickest, toughest hide of the five (about 24 mm to muscle): 7–8 mm bites with a large cutting needle and heavy thread, and a wide gap to close.'
    }
  ];

  /* ---------------- multiple-choice quiz ----------------
     The first option is always the right one: the quiz shuffles them. `see` is the
     technique tab (or 'materials') that teaches the answer. */
  const QUIZ = [
    /* patterns */
    { topic: 'Patterns', see: 'interrupted',
      q: 'One stitch in a closed line fails. With which pattern does the rest of the line stay closed?',
      opts: ['Simple interrupted', 'Continuous interlock', 'Cushing', 'Purse-string'],
      why: 'Each simple interrupted stitch is tied on its own, so losing one does not loosen the others. A continuous line depends on one strand and can open along its length.' },
    { topic: 'Patterns', see: 'interrupted',
      q: 'Why does a simple interrupted bite take slightly more deep tissue than superficial tissue?',
      opts: ['The flask-shaped bite everts the edges so they sit level', 'It hides the knot', 'It stops the thread wicking', 'It halves the number of stitches needed'],
      why: 'A bite wider at depth than at the surface pushes the edges up and together. A bite wider at the surface lets them roll in.' },
    { topic: 'Patterns', see: 'interrupted',
      q: 'Why is a stitch tied only until the edges just meet?',
      opts: ['The wound swells after surgery, and a snug stitch becomes a tight one', 'It saves suture material', 'Loose stitches always heal with less scar', 'It makes the stitch easier to remove'],
      why: 'Post-operative swelling tightens every stitch. One that already blanches the skin will strangle the edge and leave cross-hatch marks.' },
    { topic: 'Patterns', see: 'vertical',
      q: 'In a vertical mattress, what is the far-far limb for?',
      opts: ['Taking the tension and closing the dead space under the wound', 'Lining up the epidermal edges', 'Locking the previous loop', 'Folding the edges inward'],
      why: 'The far-far limb is the deep, wide bite: it splints the wound and closes the dead space. The near-near limb lines up and everts the epidermis.' },
    { topic: 'Patterns', see: 'vertical',
      q: 'Where does the near-near limb of a vertical mattress pass?',
      opts: ['2–3 mm from the edge, through the superficial dermis', '8–10 mm from the edge, deep into the subcutis', 'Parallel to the wound, along one edge', 'Around the outside of the far-far limb'],
      why: 'The near-near limb is small and shallow; its job is to bring the epidermal edges level and slightly everted. Width and depth belong to the far-far limb.' },
    { topic: 'Patterns', see: 'horizontal',
      q: 'A horizontal mattress is tied until the skin inside the loop turns pale. What is the risk?',
      opts: ['Ischaemia and necrosis of the skin inside the loop', 'The knot slips as the wound swells', 'The edges turn inward', 'The thread wicks bacteria into the wound'],
      why: 'The two limbs and the bridge between them enclose a strip of skin. Tied too tightly, they cut off its blood supply. Tie only until the edges meet.' },
    { topic: 'Patterns', see: 'cross',
      q: 'How do the two limbs of a cross mattress look on the skin?',
      opts: ['They cross over the wound in an X', 'They lie side by side, joined by a bridge, like a U', 'One far and one near, in the same line', 'They circle the wound'],
      why: 'The second limb crosses the first, making an X. That spreads tension in two directions instead of one.' },
    { topic: 'Patterns', see: 'cross',
      q: 'An oblique laceration gapes in two directions. Which pattern is designed for it?',
      opts: ['Cross mattress', 'Lembert', 'Purse-string', 'Cushing'],
      why: 'The X of a cross mattress holds tension from two angles, where a parallel mattress would pull an oblique wound out of line.' },
    { topic: 'Patterns', see: 'interlock',
      q: 'In a continuous interlock, what do you do on every bite that a simple continuous line does not?',
      opts: ['Pass the needle through the loop just made before pulling tight', 'Tie a knot', 'Take a second, shallow bite', 'Reverse the direction of the bite'],
      why: 'Passing through the loop locks each stitch, so tension cannot slide along the line. That lock is the “interlock”.' },
    { topic: 'Patterns', see: 'interlock',
      q: 'What is the main weakness of any continuous line?',
      opts: ['If the strand breaks or a knot fails, the whole line can loosen', 'It needs one knot per stitch', 'It is slower than interrupted stitches', 'It cannot be used on skin'],
      why: 'One strand carries every stitch. Interrupted stitches cost more time and more knots, but they fail one at a time.' },

    /* hollow organs and the purse-string */
    { topic: 'Hollow organs', see: 'lembert',
      q: 'Which layer of the bowel wall holds a suture?',
      opts: ['Submucosa', 'Serosa', 'Muscularis', 'Mucosa'],
      why: 'The submucosa is the collagen-rich layer with the strength to hold a stitch. A bite that stops in the muscle pulls out.' },
    { topic: 'Hollow organs', see: 'lembert',
      q: 'An inverting pattern closes a hollow organ. Which surfaces end up touching?',
      opts: ['Serosa against serosa', 'Mucosa against mucosa', 'Serosa against mucosa', 'Muscularis against muscularis'],
      why: 'Inverting the edges brings the outer serosal surfaces together, and serosa seals quickly.' },
    { topic: 'Hollow organs', see: 'cushing',
      q: 'How do Lembert and Cushing bites lie relative to the incision?',
      opts: ['Lembert bites cross it at right angles; Cushing bites run parallel to it', 'Both run parallel to it', 'Both cross it at right angles', 'Lembert bites run parallel to it; Cushing bites cross it'],
      why: 'Both are inverting and stay out of the lumen. A Lembert bite crosses the incision; a Cushing bite runs along each edge and the strand crosses over between bites.' },
    { topic: 'Hollow organs', see: 'cushing',
      q: 'How does a Cushing pattern differ from a Connell?',
      opts: ['The Cushing stays out of the lumen; the Connell passes through it', 'The Cushing is interrupted; the Connell is continuous', 'The Cushing everts; the Connell inverts', 'There is no difference'],
      why: 'Both are continuous and inverting, with bites parallel to the incision, but the Connell takes full-thickness bites into the lumen. The Cushing stays in the outer layers of the wall.' },
    { topic: 'Hollow organs', see: 'lembert',
      q: 'Why are inverting patterns used with care on the small intestine of a cat or small dog?',
      opts: ['The inverted fold narrows the lumen', 'They leak more than appositional patterns', 'They cannot be tied with absorbable suture', 'They need a cutting needle'],
      why: 'Inversion turns a cuff of wall into the lumen. In a narrow tube, that cuff can obstruct it.' },
    { topic: 'Hollow organs', see: 'purse',
      q: 'After reducing a rectal prolapse, how is the purse-string round the anus tightened?',
      opts: ['Over a finger or a syringe case, so an opening is left for defecation', 'As tight as possible, so the prolapse cannot recur', 'Until the anus is completely closed', 'Not at all: the ends are left untied'],
      why: 'Closed completely, the anus cannot pass faeces. Tightening over a finger or a syringe case leaves a controlled opening while the swelling settles.' },
    { topic: 'Hollow organs', see: 'purse',
      q: 'Why is the needle kept parallel to the surface for every purse-string bite?',
      opts: ['To keep the bites out of the structures beneath', 'To make the stitch invert', 'So the knot sits inside the ring', 'To make each bite as deep as possible'],
      why: 'The bites run round the ring at a constant shallow depth. A needle pointing down can catch bowel or vessels under the wall.' },

    /* knots */
    { topic: 'Knots', see: 'knot',
      q: 'How many wraps go into the first throw of a surgeon’s knot?',
      opts: ['Two', 'One', 'Three', 'None: it starts with a half hitch'],
      why: 'The double wrap gives the first throw enough friction to hold the edges together by itself while the next throw is made.' },
    { topic: 'Knots', see: 'knot',
      q: 'Two throws in a row are made in the same direction. What do you get?',
      opts: ['A granny knot, which slips', 'A square knot', 'A surgeon’s knot', 'A locked knot that cannot slip'],
      why: 'Each throw has to go the opposite way to the last to square the knot. The same direction twice makes a granny knot, which loosens as the wound swells.' },
    { topic: 'Knots', see: 'knot',
      q: 'How many throws does a monofilament such as nylon or polypropylene usually need?',
      opts: ['Three at least; four for very smooth material', 'One, if it is a double throw', 'Two', 'Six or more'],
      why: 'Monofilament is smooth and springy, so knots slip. Three throws is the usual minimum; polypropylene may need a fourth.' },
    { topic: 'Knots', see: 'knot',
      q: 'Where should the knot of a skin stitch sit?',
      opts: ['Beside the wound, not on the incision line', 'Directly over the incision', 'Buried under the skin', 'At one end of the wound'],
      why: 'A knot on the incision presses into the healing edge and is harder to cut out. To one side, it lies on intact skin.' },
    { topic: 'Knots', see: 'knot',
      q: 'In an instrument tie, where do you grip the short tail?',
      opts: ['By its very tip', 'Halfway along', 'Right next to the skin', 'Anywhere: it makes no difference'],
      why: 'Gripping further up crushes the part of the strand that will lie in the knot and weakens it.' },
    { topic: 'Knots', see: 'knot',
      q: 'The tails are cut flush with the knot. What can happen?',
      opts: ['The knot can work loose', 'The knot tightens and strangles the tissue', 'The thread wicks bacteria', 'Nothing: shorter is always better'],
      why: 'A knot needs a short tail to stay seated. Too long is a problem too: long tails irritate the skin and snag the next stitch.' },
    { topic: 'Knots', see: 'knot',
      q: 'A knot is tied tightly on thin cat skin. What is the risk?',
      opts: ['The thread cuts through the skin before the knot even looks tight', 'None: tighter is safer on thin skin', 'The knot cannot slip, so it is ideal', 'The skin swells less'],
      why: 'Thin feline skin gives way early. Tie until the edges meet and no further.' },

    /* needles */
    { topic: 'Needles', see: 'interrupted',
      q: 'Which needle point suits dog skin?',
      opts: ['Cutting or reverse cutting', 'Taper (round-bodied)', 'Blunt', 'Any point: skin is soft'],
      why: 'Dog and horse skin is tough. A cutting edge passes through it without bending the needle.' },
    { topic: 'Needles', see: 'lembert',
      q: 'Which needle point suits the bowel wall?',
      opts: ['Taper (round-bodied)', 'Cutting', 'Reverse cutting', 'Spatula'],
      why: 'A taper point pushes the wall aside instead of cutting it, so the needle track seals around the thread.' },
    { topic: 'Needles', see: 'purse',
      q: 'You are suturing friable tissue such as liver or kidney. Which point?',
      opts: ['Blunt', 'Cutting', 'Reverse cutting', 'Trocar'],
      why: 'A blunt point separates friable tissue instead of slicing it, and lowers the risk of a needle-stick injury.' },
    { topic: 'Needles', see: 'interrupted',
      q: 'Where is the third cutting edge of a reverse-cutting needle?',
      opts: ['On the outer, convex curve', 'On the inner, concave curve', 'There is no third edge', 'At the swage'],
      why: 'A conventional cutting needle cuts towards the wound edge on its inner curve and can tear out. The reverse-cutting needle has that edge on the outer curve, so it cuts away from the edge.' },

    /* materials */
    { topic: 'Materials', see: 'materials',
      q: 'Which absorbable monofilament keeps its strength longest and suits the linea alba?',
      opts: ['Polydioxanone (PDS)', 'Poliglecaprone 25 (Monocryl)', 'Polyglactin 910 (Vicryl)', 'Plain surgical gut'],
      why: 'PDS holds for about 4–6 weeks, long enough for the body wall to heal. Monocryl, Vicryl and gut lose their strength in days or a few weeks.' },
    { topic: 'Materials', see: 'materials',
      q: 'Polyglactin 910 (Vicryl) is…',
      opts: ['Absorbable and braided', 'Absorbable and monofilament', 'Non-absorbable and braided', 'Non-absorbable and monofilament'],
      why: 'Vicryl is a coated, braided absorbable thread with about 2–3 weeks of useful strength.' },
    { topic: 'Materials', see: 'materials',
      q: 'Why avoid silk in a contaminated wound?',
      opts: ['The braid wicks fluid and harbours bacteria', 'It is absorbed too fast', 'It cannot be knotted securely', 'It is too stiff to pass through tissue'],
      why: 'Silk handles beautifully, but it is braided and the most tissue-reactive suture, so infection tracks along it.' },
    { topic: 'Materials', see: 'materials',
      q: 'What is poliglecaprone 25 (Monocryl) best suited to?',
      opts: ['Subcuticular and intradermal closure', 'The linea alba', 'Permanent hernia repair', 'Tendon repair in a horse'],
      why: 'It is fine, smooth and low-reaction but loses strength fast, so it suits the skin layers and not tissue that heals slowly.' },
    { topic: 'Materials', see: 'materials',
      q: 'Why has surgical gut largely been replaced by synthetic sutures?',
      opts: ['Its absorption is unpredictable and it causes the most tissue reaction', 'It is non-absorbable', 'It cannot be sterilised', 'It is too strong for most tissue'],
      why: 'Gut is broken down by inflammation, so how fast it goes is unpredictable, and the tissue reaction is the strongest of any suture.' },
    { topic: 'Materials', see: 'materials',
      q: 'When are skin sutures usually removed in dogs and cats?',
      opts: ['At 10–14 days', 'At 3–5 days', 'At 28 days', 'Never: they fall out'],
      why: 'Ten to fourteen days on the body. Limbs and lines under tension may need up to 21.' },
    { topic: 'Materials', see: 'materials',
      q: 'Which is the thicker thread: 2-0 or 4-0?',
      opts: ['2-0', '4-0', 'They are the same', 'It depends on the material'],
      why: 'On this scale, more zeros mean a finer thread: 4-0 is thinner than 2-0.' },

    /* species and sizes */
    { topic: 'Species', see: 'interrupted',
      q: 'How far from the edge does a simple interrupted bite go in cat skin?',
      opts: ['2–3 mm', '5–10 mm', '10–15 mm', 'The same as on a horse’s limb'],
      why: 'Cat skin is thin. The atlas uses 3–5 mm in a dog, 2–3 mm in a cat and about 5 mm on a horse’s limb.' },
    { topic: 'Species', see: 'interrupted',
      q: 'Which suture size is typical for skin in a cat?',
      opts: ['4-0 to 5-0', '0 to 1', '2-0', '8-0'],
      why: 'Finer thread for thinner skin: 4-0 to 5-0 in cats, 3-0 to 4-0 in dogs, 2-0 to 3-0 on a horse’s limb.' },
    { topic: 'Species', see: 'interrupted',
      q: 'A large, contaminated wound on a horse’s lower limb. What often heals it best?',
      opts: ['Second-intention healing, rather than closing it', 'A purse-string', 'Closing it tightly with a continuous interlock', 'Stitches left in for at least six weeks'],
      why: 'The distal limb has little spare skin and a poor blood supply, and contaminated wounds there often break down when closed. Many heal better left open to granulate.' }
  ];

  return { MATERIALS, TECHNIQUES: T, SITES, CASES, SPECIES, QUIZ };
})();
