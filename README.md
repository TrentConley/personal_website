# Trent Conley — Personal Site

A single-screen personal site built with React and Vite. Projects, writing, and contact details live inside an interactive orbital field.

The field models Io, Europa, and Ganymede from [JPL mean orbital elements](https://ssd.jpl.nasa.gov/sats/elem/). Their timing and eccentric motion are preserved while orbital radii are logarithmically compressed to fit the interface.

The Milky Way is rendered in code in the camera orientation implied by the Jovian Laplace plane. Bright-star positions, magnitudes, and color indices come from the [ESA Hipparcos catalogue](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/I/239?format=html&tex=true); the unresolved stellar glow and dust lanes use a deterministic galactic-coordinate density model.

## Stack

- React 18 + TypeScript
- Vite build tooling
- Canvas orbital animation
- Custom CSS

## Getting Started

```bash
npm install
npm run dev
```

The development server runs at [http://localhost:5173](http://localhost:5173).

### Production Build

```bash
npm run build
npm run preview
```

`npm run build` produces the optimised bundle in `dist/`, and `npm run preview` serves it locally to verify the production output.

The featured essay is available directly at `/blog/parallel-betting`.

## Project Structure

```
src/
  App.tsx              // Lightweight path routing
  main.tsx             // React entry point
  style.css            // Global site styling
  components/          // Pages, orbital canvas, and shared navigation
  data/profile.ts      // Selected project metadata
public/                // Static assets (images, article PDF, favicon)
```

## Deployment

This project is framework-agnostic; you can deploy the generated `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages, etc.).
