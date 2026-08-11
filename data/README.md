# Data Import

This project documents one CSV import format: the same five-file format bundled
in the 2022 demo data.

Import these files together:

- `input/Politiche2022_Scrutini_Camera_Italia.csv`
- `input/Politiche2022_Scrutini_Senato_Italia.csv`
- `input/camera-2022-candidatilista.csv`
- `input/senato-2022-candlista.csv`
- `input/bonus-candidates-2022-random.csv`
- `input/estero.json`

The vote files are required for national seat allocation. `estero.json` is
required to include the foreign constituency in a full simulation. The
candidate-list and bonus candidate files are required to attach allocated seats
to proclaimed names.

## Vote Files

`Politiche2022_Scrutini_Camera_Italia.csv` and
`Politiche2022_Scrutini_Senato_Italia.csv` are comma-separated files with one
row per municipality, list, and single-member candidate.

Important columns:

- `TIPO ELEZIONE`: chamber label, for example `Camera Italia` or
  `Senato Italia`.
- `COLLEGIO PLURINOMINALE`: plurinominal district used for proportional seat
  allocation.
- `COLLEGIO UNINOMINALE`: single-member district. Lists that support the same
  candidate in the same district are connected into a coalition.
- `CIRCOSCRIZIONE`: Camera constituency or Senate region.
- `COGNOME`, `NOME`: single-member candidate name, used with
  `COLLEGIO UNINOMINALE` to infer coalitions.
- `LISTA`: list name.
- `VOTI LISTE`: valid votes for the list.

The importer also normalizes list labels such as `+ EUROPA` and `+EUROPA`.
One-list components stay as uncoalitioned lists.

District seat capacities do not depend on these vote totals. The importer uses
the versioned AC 2822-A tables cached in `legal-sources`: 314/384 ordinary
Camera seats and 154/189 ordinary Senate seats, depending on whether the
governability bonus is awarded.

## Candidate-List Files

`camera-2022-candidatilista.csv` and `senato-2022-candlista.csv` are
semicolon-separated files with ordered candidates by list and plurinominal
district.

Important columns:

- `CODTIPOELEZIONE`: chamber code, `C` for Camera or `S` for Senato.
- `Circoscrizione`: Camera constituency. Present in the Camera file.
- `Regione`: Senate region. Present in the Senate file.
- `CollPlurinom`: plurinominal district that links the candidate to allocated
  seats.
- `descrlista`: list name, matched to `LISTA` from the vote files after
  normalization.
- `cognome`, `nome`: candidate display name.
- `datanascita`: candidate birth date, used to derive age when possible.
- `luogonascita`, `sesso`: candidate details kept in the candidate registry.
- `CODTIPOELETTO`: source elected-status marker from the original dataset.

## Bonus Candidate File

`bonus-candidates-2022-random.csv` is a comma-separated priority list for the
governability bonus. It contains synthetic names for the demo dataset.

Important columns:

- `chamber`: `camera` or `senate`.
- `connectedSubjectId`: id of the coalition or single list that can win the
  bonus.
- `candidateId`: unique candidate id.
- `position`: priority order inside that chamber and connected subject.
- `lastName`, `firstName`: display name for the candidate.

The demo file provides 70 Camera rows and 35 Senato rows for each coalition
inferred from the bundled 2022 vote files.

## Foreign Constituency File

`estero.json` contains the 2022 foreign constituency data shape used by the
client-side simulator:

- `chambers.camera` and `chambers.senato`: separate foreign chamber inputs.
- `partitions`: the four foreign partitions, each with official 2022 seat
  counts, resident citizen totals, list votes, and candidate preferences.
- `lists[].candidates[]`: candidates are ordered by `preferences`, with
  `list_position` as the deterministic tie-break.

The bundled file currently includes the official 2022 partition seat counts and
resident citizen totals. Running `scripts/fetch-estero-2022.ts` with an Eligendo
endpoint manifest can populate list votes and preferences.

## Population and Census Geography Sources

The repo keeps the normalized inputs used by tests and local runs, but does not
track the bulky upstream ZIP/PDF source files. Source URLs and checksums are
recorded in each `sources/MANIFEST.md` so the originals can be fetched again
when re-deriving data:

- `population/sources/popolazione-legale-2021-dpr-2023-01-20.pdf`: Gazzetta
  Ufficiale DPR 20 January 2023 legal population publication, not tracked.
- `population/sources/istat-sezioni-censimento-2021-regioni.zip`: ISTAT 2021
  census-section data by region, not tracked.
- `geography/sources/istat-sezioni-aree-subcomunali-2021-comuni-metropolitani.zip`:
  ISTAT 2021 census-section and submunicipal-area data for metropolitan
  capitals, not tracked.

`population/electoral-2021.csv` is the normalized municipality-level population
input derived from `istat-sezioni-censimento-2021-regioni.zip` by summing `P1`
by `PROCOM`/`COMUNE`. It intentionally excludes Valle d'Aosta and
Trentino-Alto Adige for the AC 2822-A bonus pool. The file has 7,548 comuni and
total population 57,833,199; adding the excluded regional workbooks
(`R02` = 123,360 and `R04` = 1,073,574) reconciles to the 2021 national legal
population of 59,030,133.

`geography/camera-constituencies.csv` is the normalized Camera constituency
mapping used by the current simulator fixtures.
