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

## Electoral law: AC 2822-A

The simulator currently targets the AC 2822-A electoral-law proposal baseline
identified as `ac-2822-a-2026-07-16`. As of that baseline, the text had been
approved by the Camera on 16 July 2026 and transmitted to the Senato, so this
repository treats it as a proposal implementation rather than an in-force law.

Useful references:

- [Local implementation note](legal-spec/ac-2822-a.md)
- [Official Camera project page for A.C. 2822](https://www.camera.it/leg19/126?idDocumento=2822&leg=19)
- [Camera thematic update on the electoral law](https://temi.camera.it/leg19/provvedimenti.html)
- [Camera/Senate dossier, Volume I](https://documenti.camera.it/leg19/dossier/testi/AC0469_vol1.htm)
- [Senato bill page after transmission as A.S. 1971](https://www.senato.it/leggi-e-documenti/disegni-di-legge/scheda-ddl?did=59951)

Step by step, the implemented law works like this:

1. Validate the scenario input: chambers, coalitions, list membership,
   territories, seat tables, candidate lists, and foreign-constituency data must
   be internally consistent before any allocation is attempted.
2. Aggregate list and coalition votes separately for Camera and Senato. Domestic
   allocation excludes Estero and the separately regulated special territories;
   the bonus check uses the vote pools required by the AC 2822-A rules.
3. Apply access thresholds. The engine admits coalitions above 10 percent, lists
   above 3 percent, lists qualifying through regional or protected
   linguistic-minority rules, and the strongest otherwise excluded list inside
   each admitted coalition.
4. Check the governability bonus. The same admitted list or coalition must be
   first in both chambers and must reach at least 42 percent in both Camera and
   Senato. If any condition fails, no bonus is awarded.
5. If the bonus is awarded, assign 70 Camera bonus seats and 35 Senato bonus
   seats to the winner. The winner is capped at 220 deputies and 113 senators
   overall.
6. Allocate the ordinary domestic seats. Without the bonus, the ordinary pools
   are 384 Camera seats and 189 Senato seats; with the bonus, the proportional
   pools fall to 314 and 154 seats. The allocation uses the Hare quotient,
   integer seats, and largest remainders, reporting exact boundary ties instead
   of inventing a legal tie-breaker.
7. Distribute seats territorially. Camera seats are distributed through
   constituencies and then plurinominal districts; Senato seats are distributed
   through regions and then plurinominal districts, preserving the chamber-level
   totals.
8. Distribute bonus seats by population. Valle d'Aosta and Trentino-Alto Adige
   are excluded from the bonus pools, and the remaining bonus seats are assigned
   by natural quotient and largest remainders using the versioned electoral
   population dataset.
9. Allocate special territories when supplied. Valle d'Aosta/Vallee d'Aoste and
   Trentino-Alto Adige/Sudtirol single-member districts go to the candidate with
   the most votes; exact ties are surfaced for manual legal resolution.
10. Proclaim candidates from ordered nomination lists. Bonus-priority lists are
    used for bonus seats when present; ordinary territorial seats use the
    provided list order. Missing candidate data, multiple nominations, and
    substitute cascades are reported in the result trace when the input is not
    enough to resolve them automatically.
11. Allocate Estero separately from the domestic AC 2822-A pools, using the
    bundled foreign-constituency model and candidate-preference data.
12. Return trace output for each stage, including rule references, intermediate
    totals, awarded seats, and unresolved tie/manual-resolution cases.

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
