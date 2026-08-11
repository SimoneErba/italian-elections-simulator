# Italian Elections Simulator

A browser-based simulator for Italian parliamentary election scenarios. The app
loads bundled 2022 election inputs, applies the implemented electoral rules, and
shows how seat allocation changes under different vote distributions.

## Features

- Camera and Senato simulations from 2022 municipal-level vote data.
- Coalition, threshold, territorial, foreign constituency, and candidate
  allocation logic.
- AC 2822-A governability bonus calculations with traceable rule modules.
- Client-side Vite/React app that can be deployed as a static site.

## Development

Install dependencies:

```bash
npm ci
```

Run the local dev server:

```bash
npm run dev
```

Run tests:

```bash
npm test -- --run
```

Build the production site:

```bash
npm run build
```

## Data

Runtime data lives under `data/input`, `data/population`,
`data/geography`, and `public/data`. Bulky upstream source archives are not
tracked in Git; their source URLs and checksums are recorded in the adjacent
`data/**/sources/MANIFEST.md` files.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs on every push to `main`.
It installs dependencies, runs the test suite, builds with the GitHub Pages base
path, uploads `dist`, and deploys it through GitHub Pages.
