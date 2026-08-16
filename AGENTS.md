# Italian Elections Simulator — agent guide

## Purpose and architecture

- This is a Vite + React + TypeScript app for simulating Italian parliamentary-seat allocations.
- UI and import workflow: `src/features/results/ResultsPage.tsx`.
- App state, built-in 2022 demo data, and the simulation worker: `src/app/store.ts`, `src/app/simulation-worker.ts`.
- Electoral engine: `src/electoral-engine/`.
  - `pipeline/simulate-election.ts` is the primary orchestration entry point.
  - `rules/registry.ts` defines the two laws and their seat pools.
  - `pipeline/aggregate-votes.ts`, `calculate-thresholds.ts`, `allocate-national-seats.ts`, and `allocate-territorial-seats.ts` implement the ordinary proportional allocation.
  - `pipeline/allocate-special-territories.ts` handles Valle d'Aosta and Trentino–Alto Adige special seats.
  - `pipeline/elect-candidates.ts` turns allocation results into elected candidates.
- 2022 source-data importer: `src/datasets/loaders/ondata-2022-loader.ts`.
- Election domain types: `src/electoral-engine/domain/election.ts`.

## Laws and data flow

- `rosatellum-2022` uses the 2022 system, including ordinary uninominal districts.
- `ac-2822-a-2026-07-16` is a proposed 2026 law. The app adapts the imported 2022 geography through `withLawSpecificDistrictSeats()`.
- The raw 2022 files still contain all Rosatellum uninominal districts. For the 2026 law, **never allocate those ordinary districts as direct seats**: only districts explicitly tagged `specialTerritory` may be processed in `allocateSpecialTerritories()`.
- `data/input/special-territories-2022.json` supplies special-district winners missing from the normal import, including Valle d'Aosta. It contains candidate vote totals, not proportional list-vote rows. Preserve that distinction when displaying or allocating votes.
- The vote table is display-oriented; the simulation’s proportional totals must remain separate from special direct-candidate tallies. `ResultsPage.tsx` adds the Valle d'Aosta direct tally only for display.

## Important files and fixtures

- Built-in 2022 data: `data/input/Politiche2022_Scrutini_Camera_Italia.csv`, `data/input/Politiche2022_Scrutini_Senato_Italia.csv`, candidate-list CSVs, `estero.json`, and `special-territories-2022.json`.
- Official/reference output: `data/reference/elected-2022*.json`.
- Legal notes: `legal-spec/ac-2822-a.md`.
- Unit tests are under `src/tests/`; start with:
  - `src/tests/ac-2822-a-law.test.ts` for 2026 legal behaviour;
  - `src/tests/ondata-2022-loader.test.ts` for CSV/import mapping;
  - `src/tests/simulate-election.test.ts` for the general pipeline;
  - `src/tests/foreign-election.test.ts` for Estero.

## Fast verification

Run these from the repository root:

```bash
# Targeted tests while changing AC 2822-A logic
npm test -- --run src/tests/ac-2822-a-law.test.ts

# Full test suite
npm test

# Typecheck and production bundle
npm run build

# Whitespace errors before handoff
git diff --check
```

When changing allocations, add a focused regression test for the exact seat source and confirm the chamber total equals the intended statutory pool plus only valid special/foreign seats.

## Working-tree hygiene

- The worktree may already contain user changes. Inspect `git status --short` and avoid reverting or reformatting unrelated edits.
- Use `apply_patch` for source edits.
