# HeyJule — demo website

Static, single-page deliverable for the HeyJule project (HackNation Challenge 5,
part 03 "Application Infrastructure"). One non-scrolling page: problem → solution,
an animated patient → HeyJule → clinician illustration, and two "Start demo"
entry points that link to the patient and clinician deployments.

## Files
- `index.html` — the page
- `style.css` — all styling (desktop-locked, no-scroll; scrolls only on very small screens)
- `assets/img/product-illustration.svg` — the animated hero illustration
- `assets/videos/` — reserved for later
- `v0/` — earlier fallback version

## Wiring up the demos
Swap the two `href="#"` on the `.start-btn` links in `index.html` for the real
patient / clinician deployment URLs.

## Local preview
Any static server works, e.g.:
```
python3 -m http.server 4173
```
then open http://localhost:4173

## Live URL
Deployed via GitHub Pages from this folder — see `.github/workflows/deploy-pages.yml`
at the repo root. Published at https://eremetech.github.io/heyjule/
