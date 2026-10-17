# DesignForge — T-Shirt Design Extractor & Remixer (MVP)

A browser-based tool for graphic designers: upload a T-shirt mockup, the app extracts the print design (background + garment removal), generates fresh copyright-safe variations, and exports print-ready PNGs at **2K / 4K / 8K**.

Runs 100% client-side — no server, no accounts, no uploads.

## Features

- **Upload** — drag & drop or browse (PNG / JPG / WEBP)
- **AI extraction** — flood-fill background removal + solid-garment removal, auto bounding-box crop, transparent PNG output
- **Palette analysis** — dominant design colors extracted for variation generation
- **New variations** — hue/saturation recoloring, flips, rotations, and procedural backgrounds (gradients, sunburst rays, dots) using the design's own palette
- **Print-ready export** — progressive high-quality upscaling to 2048 / 4096 / 8192 px PNG

## Run locally

Just open `index.html` in a browser, or serve it:

```powershell
# optional, from the repo folder
python -m http.server 8080
```

## Project structure

```
index.html      — UI (upload → pipeline → results)
css/style.css   — styling
js/extract.js   — background/garment removal, bbox, palette
js/generate.js  — variation generation + upscaling
js/app.js       — UI orchestration
```

## Roadmap (v2)

- Sublimation file splitting (front / back / collar / sleeves)
- Photoshop-ready layered PSD export
- Accounts & saved projects
- Server-side AI (StyleGAN / diffusion) for stronger remixing