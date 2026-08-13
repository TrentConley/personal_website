# Trent Conley — Personal Site

A single-screen personal site built with React and Vite. Projects, writing, and contact details live inside an interactive orbital field.

The field models Io, Europa, and Ganymede from [JPL mean orbital elements](https://ssd.jpl.nasa.gov/sats/elem/). Their timing and eccentric motion are preserved while orbital radii are logarithmically compressed to fit the interface.

The Milky Way is rendered in code in the camera orientation implied by the Jovian Laplace plane. Its measured structure comes from a 6000 × 3000 derivative of the [Gaia EDR3 all-sky brightness map](https://www.esa.int/ESA_Multimedia/Images/2020/12/The_colour_of_the_sky_from_Gaia_s_Early_Data_Release_32), which combines observations of more than 1.8 billion stars. Point stars use the [ESA Hipparcos catalogue](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/I/239?format=html&tex=true) through magnitude 6.5 and Gaia DR3 sources from magnitude 6.5 to 8.5; mobile restricts the overlay to magnitude 5 and brighter so individual stars remain legible.

Gaia sky data: ESA/Gaia/DPAC, acknowledgement A. Moitinho, licensed under CC BY-SA 3.0 IGO. Hipparcos catalogue: ESA 1997 via CDS/VizieR.

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

The adaptive vocabulary tutor is available at `/projects/vocabulary`. It stores a learner's words and review history locally in the browser. Add `OPENAI_API_KEY` to the Vercel project's environment variables to enable semantic grading and generated examples; `OPENAI_VOCAB_MODEL` can optionally override the default model. Without a key, definitions and conservative local checks remain available.

Fallback lexical definitions are provided by the [Datamuse API](https://www.datamuse.com/api/) and its Wiktionary/WordNet-derived metadata.

## Project Structure

```
src/
  App.tsx              // Lightweight path routing
  main.tsx             // React entry point
  style.css            // Global site styling
  components/          // Pages, orbital canvas, and shared navigation
  data/profile.ts      // Selected project metadata
public/                // Static assets (images, article PDF, favicon)
api/                   // Vercel serverless tutor endpoint
```

## Deployment

This project is framework-agnostic; you can deploy the generated `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages, etc.).
