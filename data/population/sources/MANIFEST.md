# Population Source References

The bulky upstream PDF/ZIP files are not tracked in Git. Fetch them from the
URLs below when re-deriving `../electoral-2021.csv`, then verify the recorded
SHA-256 checksums.

## Legal Population

- `popolazione-legale-2021-dpr-2023-01-20.pdf`
- Source URL: `https://www.gazzettaufficiale.it/eli/gu/2023/03/03/53/so/10/sg/pdf`
- SHA-256: `7940c04ecb57809063beff639febe689c4576e695dc175f34444ae6aeea9985d`

## Census Sections

- `istat-sezioni-censimento-2021-regioni.zip`
- Source URL: `https://esploradati.istat.it/databrowser/DWL/PERMPOP/SUBCOM/Dati_regionali_2021.zip`
- SHA-256: `000a0d7b612eb3af655b0c979542b17495f38d2c8d6c48699d400e5611e22394`

Derived file:

- `../electoral-2021.csv`
- Derivation: sum `P1` by `PROCOM`/`COMUNE` across `R01`, `R03`, and `R05`-`R20`.
  `R02` Valle d'Aosta and `R04` Trentino-Alto Adige are excluded.
- Rows: 7,548 comuni
- Total population: 57,833,199
- SHA-256: `d9879bc3d8a2d11f92f1aa7bf01f590a235317c28cf46feae9d02a503c1cc5b4`

Contents:

- `R01_indicatori_2021_sezioni.xlsx`
- `R02_indicatori_2021_sezioni.xlsx`
- `R03_indicatori_2021_sezioni.xlsx`
- `R04_indicatori_2021_sezioni.xlsx`
- `R05_indicatori_2021_sezioni.xlsx`
- `R06_indicatori_2021_sezioni.xlsx`
- `R07_indicatori_2021_sezioni.xlsx`
- `R08_indicatori_2021_sezioni.xlsx`
- `R09_indicatori_2021_sezioni.xlsx`
- `R10_indicatori_2021_sezioni.xlsx`
- `R11_indicatori_2021_sezioni.xlsx`
- `R12_indicatori_2021_sezioni.xlsx`
- `R13_indicatori_2021_sezioni.xlsx`
- `R14_indicatori_2021_sezioni.xlsx`
- `R15_indicatori_2021_sezioni.xlsx`
- `R16_indicatori_2021_sezioni.xlsx`
- `R17_indicatori_2021_sezioni.xlsx`
- `R18_indicatori_2021_sezioni.xlsx`
- `R19_indicatori_2021_sezioni.xlsx`
- `R20_indicatori_2021_sezioni.xlsx`
- `TRACCIATO FILE REGIONALI.xlsx`
