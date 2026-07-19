# HeyJule, demo website

Single static landing page for the HeyJule deliverable (HackNation Challenge 5,
part 03 "Application Infrastructure"). One non-scrolling page: a coral poster
with the HeyJule wordmark, a short problem and solution, and the two views,
patient and clinician, converging on a shared timeline seam, each a demo entry.

## Files
- `index.html` — the live page (self-contained: inline CSS, inline SVG,
  Tanker via Fontshare CDN, no local assets)
- `previous/` — the earlier illustration-based design, kept as a fallback
- `v0/` — the first no-scroll prototype

## Wiring up the demos
Swap the two `href="#"` on the `.half` links in `index.html` for the real
patient and clinician deployment URLs.

## Local preview
Any static server works, for example:
```
python3 -m http.server 4173
```
then open http://localhost:4173

## Live URL
Deployed via GitHub Pages from this folder, see
`.github/workflows/deploy-pages.yml` at the repo root.
Published at https://eremetech.github.io/heyjule/
