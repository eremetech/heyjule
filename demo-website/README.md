# HeyJule, demo website

Single static landing page for the HeyJule deliverable (HackNation Challenge 5,
part 03 "Application Infrastructure"). A full-viewport coral poster hero — the
HeyJule wordmark, a short problem and solution, and the two views, patient and
clinician, converging on a shared timeline seam — followed by scrollable
chapters that walk through the product: the patient side, the encrypted
doctor-only export, the clinician report, and the architecture, each
illustrated with looping product-motion clips rendered from
`../video/launch-broll`.

## Files
- `index.html` — the live page (inline CSS/SVG/JS, Tanker via Fontshare CDN)
- `assets/video/` — mp4 clips copied from `../video/launch-broll/out`
  (re-copy after re-rendering to update the site)
- `assets/stills/` — 960px JPEG posters derived from
  `../video/launch-broll/stills`
- `previous/` — the earlier illustration-based design, kept as a fallback
- `v0/` — the first no-scroll prototype

Videos load lazily (`preload="none"` + posters) and play only while in view;
with `prefers-reduced-motion` they get controls instead of autoplay.

## Wiring up the demos
Swap the `href="#"` on the two hero `.half` links and the two closing
`.cta-card` links in `index.html` for the real patient and clinician
deployment URLs.

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
