# Suture Atlas

An interactive, static website for learning eight basic suturing techniques. No build step, no server,
no accounts — just HTML, CSS and JavaScript, ready for GitHub Pages.

**What is inside**

| Page | What it does |
| --- | --- |
| `index.html` | Overview and the eight techniques. |
| `atlas.html` | The technique lab: 3D animated needle path, tissue layers, knot, step-by-step rail, indications, pros and cons, checklist, needle and material fit. |
| `match.html` | “Connect the stitch”: drag a strand from each technique to the tissue it belongs to (8 sites). |
| `test.html` | Seven wound cases. Choose the technique, then place the stitches yourself. Scored 60/40 with a final percentage and a review of every case. |
| `materials.html` | Absorbable vs non-absorbable, monofilament vs braided, the eight materials, needle types and sizes, and a material-per-technique matrix. |

## Why animations instead of video files

A filmed demonstration can only show the plane the camera was in. Here each step names the plane that
explains it — 3D, true cross-section, top view or a close-up of the knot — and the camera flies to it
while the needle keeps moving, so a student never has to imagine what is happening behind the tissue.
It also means no video files, no bandwidth, no licensing, and the whole site stays a few hundred
kilobytes of text.

## The eight techniques

1. Simple interrupted
2. Horizontal mattress
3. Cross mattress (crossed mattress)
4. Vertical mattress (Donati / Allgöwer)
5. Continuous interlock (Ford interlocking)
6. Lembert
7. Cushing
8. Purse-string

## Run it locally

Any static file server works. From this folder:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly from the filesystem also mostly works,
but a local server is cleaner (and is what GitHub Pages does).

The only external dependency is Three.js, loaded from cdnjs on `atlas.html`. Every other page works
with no network at all. If Three.js cannot load, the atlas shows a message and the written steps,
indications, pros and cons are still fully readable.

## Put it on GitHub Pages (free, stays online)

1. Create an empty repository on GitHub, for example `suture-atlas`.
2. In this folder:

   ```bash
   git init
   git add .
   git commit -m "Suture Atlas: interactive suturing techniques, matching game and case test"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/suture-atlas.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)**
   - Save.

4. After a minute the site is at `https://YOUR-USERNAME.github.io/suture-atlas/`.

All links and asset paths are relative, so it works both at a project sub-path like the URL above and
at a custom domain. To use a custom domain, add it under **Settings → Pages → Custom domain** and add a
`CNAME` file containing the domain.

> The repository must be **public** for free GitHub Pages hosting. Everything here is safe to publish:
> no keys, no patient data, no tracking.

## Editing the content

All teaching content lives in `assets/data.js`:

- `TECHNIQUES` — name, tagline, indications, pros, cons, checklist, needle, sizes, material fit,
  the needle passes (`passes`) and the narration for each step (`steps`).
- `MATERIALS` — the eight suture materials.
- `SITES` — the pairs used by the matching exercise.
- `CASES` — the vignettes, the best answer, acceptable alternatives, the stitch positions and the
  explanations used by the case test.

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
index.html          atlas.html        match.html       test.html        materials.html
assets/site.css     styles for every page
assets/data.js      all content: techniques, materials, sites, cases
assets/stitch.js    2D stitch drawings (thumbnails, game art, test overlay)
assets/engine.js    the 3D engine (Three.js r128): tissue, needle arcs, timeline, camera
assets/atlas.js     technique-lab page wiring
assets/match.js     matching exercise
assets/test.js      case test and scoring
.nojekyll           tells GitHub Pages to serve the files as they are
```

## Teaching notes and limits

- The model is stylised. Bite distances are typical textbook values shown at a readable scale on
  simplified tissue. They are a starting point for learning the pattern, not a prescription.
- Absorption times, suture sizes and removal times vary by product, tissue and patient.
- This is an educational project, not a clinical protocol, and not a substitute for supervised
  practice on models or patients.
