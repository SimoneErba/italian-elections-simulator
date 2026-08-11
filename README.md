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

### Preparing input data

The simulator expects the normalized demo inputs to be present before running
tests or building the app. Prepare them with this layout:

```text
data/input/Politiche2022_Scrutini_Camera_Italia.csv
data/input/Politiche2022_Scrutini_Senato_Italia.csv
data/input/camera-2022-candidatilista.csv
data/input/senato-2022-candlista.csv
data/input/bonus-candidates-2022-random.csv
data/input/estero.json
data/population/electoral-2021.csv
data/geography/camera-constituencies.csv
public/data/elections/2022/estero.json
```

Use comma-separated vote files for Camera and Senato with municipality,
district, list, coalition-candidate, and `VOTI LISTE` columns. Use
semicolon-separated candidate-list files with ordered candidates by chamber,
list, and plurinominal district. The bonus candidate CSV provides the ordered
candidate pool used when the governability bonus is awarded. `estero.json`
contains the foreign constituency partitions, list votes, and candidate
preferences used by the client.

Keep bulky upstream archives outside Git and record their source URL and
checksum in the relevant `data/**/sources/MANIFEST.md`. See
`data/README.md` for the full column-level import contract and source notes.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs on every push to `main`.
It installs dependencies, runs the test suite, builds with the GitHub Pages base
path, uploads `dist`, and deploys it through GitHub Pages.
