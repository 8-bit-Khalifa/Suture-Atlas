# Suture Atlas

An interactive, static website for veterinary students learning to suture: ten suture patterns and
the surgical knot in 3D, a matching drill, patient cases and a multiple-choice quiz. No build step,
no accounts, no tracking — just HTML, CSS and JavaScript. Live at <https://suture-atlas.pages.dev/>.

**What is inside**

| Page | What it does |
| --- | --- |
| `index.html` | Home: every pattern on a practice pad, and the way through the site. |
| `atlas.html` | The technique lab: each pattern placed step by step in 3D, on the organ it is used on ("Organ view") or on a plain tissue block, with cross-section, top and close-up views, indications, pros and cons, checklist, needle and material fit. Dog, cat, horse, sheep and cattle presets. |
| `match.html` | Match each of the ten patterns to the wound it closes best. |
| `test.html` | Twelve patient cases (choose the pattern, then place the stitches; scored 60/40) and a multiple-choice quiz. |
| `materials.html` | Reading a suture packet: absorbable and non-absorbable threads, monofilament and braided, needles and sizes. |

## The techniques

1. Simple interrupted
2. Horizontal mattress
3. Cross mattress
4. Vertical mattress (Donati / Allgöwer)
5. Simple continuous
6. Continuous interlock (Ford interlocking)
7. Intradermal (subcuticular)
8. Lembert
9. Cushing
10. Purse-string

…and the instrument-tied surgical knot that finishes them.

## Offline and on a phone's home screen

`sw.js` (a service worker) stores every page and file on the device on the first visit, so the site
keeps working with no internet. Online, files are always fetched fresh and the stored copy updated;
the stored copy is used only when the network fails or takes more than four seconds.
`manifest.webmanifest` and the icons in `assets/` let a phone add the site to its home screen.

**When you change the list of files**, or want visitors' offline copy of every page refreshed at once,
raise `VERSION` in `sw.js` (for example `suture-atlas-v2`).

## Run it locally

Any static file server works. From this folder:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` straight from the disk also works, except for
the offline copy, which browsers only allow on `https` or `localhost`.

## Publishing

The site is plain files, so any static host works (Cloudflare Pages, GitHub Pages, Netlify). Upload
the site files only — leave out `_backup/`, `_check/`, `.claude/`, `.git/` and `.cloud-attachments/`.
All links and paths are relative, and `sw.js` copes with hosts that shorten `atlas.html` to `/atlas`.

The link previews (the title, description and image shown when a link is shared in WhatsApp and
elsewhere) use `assets/preview.jpg` and the site's address, set in each page's `og:` tags. If the
address changes, update those tags.

## Editing the content

All teaching content lives in `assets/data.js`:

- `TECHNIQUES` — name, tagline, indications, pros, cons, checklist, needle, sizes, material fit,
  the needle passes (`passes`) and the narration for each step (`steps`).
- `MATERIALS` — the suture materials.
- `SITES` — the pairs used by the matching exercise.
- `CASES` — the patients, the best answer, acceptable alternatives, the stitch positions and the
  explanations used by the case test.
- `SPECIES` — the species presets.
- `QUIZ` — the multiple-choice questions. The first option is the right one (they are shuffled on
  screen); `hint` adds a small note under a question that relies on something the site does not teach.

Which organ each technique is shown on in the Organ view is set in `BY_TECH` at the top of
`assets/context.js`.

Geometry is authored in millimetres and is deliberately legible rather than to scale:

```
a = [u, d, z]   u = distance from the wound edge along the surface
                d = depth below the surface (0 = surface, negative = above it)
                z = position along the wound
sag = how far the needle's arc dips below the straight line between its two points
```

A pass normally starts on one side and ends on the same side (`side`) or crosses the wound
(`toR` / `toL`). Splitting one pass over two teaching steps uses `f0` / `f1` (0…1 along the arc).
Camera keys used by steps: `3d`, `section`, `top`, `knot`.

## Structure

```
index.html  atlas.html  match.html  test.html  materials.html   the pages
knot.html              old address of the knot lesson; forwards to atlas.html#knot
sw.js                  the offline copy
manifest.webmanifest   name and icons for a phone's home screen
assets/site.css        styles for every page
assets/site.js         shared by every page: the bug-report link and the offline copy
assets/data.js         all content: techniques, materials, sites, cases, species, quiz
assets/stitch.js       2D stitch drawings (thumbnails, game art, test overlay)
assets/scenes.js       the wound pictures shared by the case test and the matching game
assets/three.min.js    Three.js r128, kept in the site so the 3D lab works offline
assets/engine.js       the 3D engine: tissue, needle arcs, thread, knot, timeline, camera
assets/context.js      the Organ view: each technique's organ around the tissue block
assets/atlas.js        technique-lab page wiring
assets/match.js        matching exercise
assets/test.js         case test and scoring
assets/quiz.js         multiple-choice quiz
assets/*.png, preview.jpg   app icons and the link-preview image
.nojekyll              tells GitHub Pages to serve the files as they are
```

## Teaching notes and limits

- The model is stylised. Bite distances are typical textbook values shown at a readable scale on
  simplified tissue. They are a starting point for learning the pattern, not a prescription.
- Absorption times, suture sizes and removal times vary by product, tissue and patient.
- This is an educational project, not a clinical protocol, and not a substitute for supervised
  practice on models or patients.
