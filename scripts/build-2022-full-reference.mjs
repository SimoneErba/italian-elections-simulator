import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PARTIAL_PATH = resolve(ROOT, "data/reference/elected-2022.json");
const FOREIGN_PATH = resolve(ROOT, "data/input/estero.json");
const OUTPUT_PATH = resolve(ROOT, "data/reference/elected-2022-full.json");

const partial = JSON.parse(readFileSync(PARTIAL_PATH, "utf8"));
const foreignElection = JSON.parse(readFileSync(FOREIGN_PATH, "utf8"));

const supplementalDomestic = [
  {
    chamber: "camera",
    electionType: "single-member",
    constituency: "VALLE D'AOSTA",
    district: "VALLE D'AOSTA - U01 (AOSTA)",
    list: "VALLÉE D'AOSTE - AUTONOMIE PROGRÈS FÉDÉRALISME",
    candidate: "FRANCO MANES",
    candidateId: slug("camera-VALLE D'AOSTA - U01 (AOSTA)-MANES-Franco"),
    sourceCoverage: "integrated-special-territory"
  },
  {
    chamber: "camera",
    electionType: "plurinominal",
    constituency: "CALABRIA",
    district: "CALABRIA - P01",
    list: "MOVIMENTO 5 STELLE",
    candidate: "ELISA SCUTELLÀ",
    candidateId: slug("camera-CALABRIA - U03 (CATANZARO)-SCUTELLA'-ELISA"),
    sourceCoverage: "integrated-cassation-recovery"
  },
  {
    chamber: "senate",
    electionType: "single-member",
    constituency: "VALLE D'AOSTA",
    district: "VALLE D'AOSTA - U01 (AOSTA)",
    list: "LEGA - FORZA ITALIA - FRATELLI D'ITALIA",
    candidate: "NICOLETTA SPELGATTI",
    candidateId: slug("senate-VALLE D'AOSTA - U01 (AOSTA)-SPELGATTI-Nicoletta"),
    sourceCoverage: "integrated-special-territory"
  },
  ...[
    ["U01 (TRENTO)", "ALLEANZA DEMOCRATICA PER L'AUTONOMIA", "PIETRO PATTON", "PATTON", "Pietro"],
    ["U02 (ROVERETO)", "LEGA - FORZA ITALIA - FRATELLI D'ITALIA", "MICHAELA BIANCOFIORE", "BIANCOFIORE", "Michaela"],
    ["U03 (PERGINE VALSUGANA)", "LEGA - FORZA ITALIA - FRATELLI D'ITALIA", "ELENA TESTOR", "TESTOR", "Elena"],
    ["U04 (BOLZANO/BOZEN)", "DEMOCRAZIA AMBIENTE FUTURO", "LUIGI SPAGNOLLI", "SPAGNOLLI", "Luigi"],
    ["U05 (MERANO/MERAN)", "SVP-PATT", "JULIANE UNTERBERGER", "UNTERBERGER", "Juliane"],
    ["U06 (BRESSANONE/BRIXEN)", "SVP-PATT", "MEINHARD DURNWALDER", "DURNWALDER", "Meinhard"]
  ].map(([districtSuffix, list, candidate, lastName, firstName]) => {
    const district = `TRENTINO-ALTO ADIGE/SÜDTIROL - ${districtSuffix}`;
    return {
      chamber: "senate",
      electionType: "single-member",
      constituency: "TRENTINO-ALTO ADIGE/SÜDTIROL",
      district,
      list,
      candidate,
      candidateId: slug(`senate-${district}-${lastName}-${firstName}`),
      sourceCoverage: "integrated-special-territory"
    };
  })
];

const foreignElected = Object.entries(foreignElection.chambers).flatMap(([foreignChamberId, chamber]) => {
  const chamberId = foreignChamberId === "senato" ? "senate" : "camera";
  return chamber.partitions.flatMap((partition) => {
    const allocations = allocateForeignListSeats(partition.lists, partition.seats);
    return allocations.flatMap(({ list, seats }) => {
      return electForeignCandidates(list, seats).map((candidate) => ({
        chamber: chamberId,
        electionType: "foreign",
        constituency: "ESTERO",
        district: partition.name,
        list: list.name,
        candidate: normalizeForeignCandidateName(candidate.name),
        candidateId: slug(`foreign-${foreignChamberId}-${partition.id}-${list.id}-${candidate.name}`),
        sourceCoverage: "integrated-foreign-constituency"
      }));
    });
  });
});

const elected = [...partial.elected, ...supplementalDomestic, ...foreignElected].sort(compareElected);
const totals = elected.reduce((acc, item) => {
  const key = `${item.chamber}.${item.electionType}`;
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const candidateIds = new Set(elected.map((item) => item.candidateId));
if (candidateIds.size !== elected.length) {
  throw new Error(`Duplicate candidate ids in full reference: ${elected.length - candidateIds.size}`);
}
if (elected.length !== 600) {
  throw new Error(`Invalid full reference size: expected 600, found ${elected.length}`);
}

const fullReference = {
  schemaVersion: "1.0",
  election: "politiche-2022",
  source: {
    publisher: "Ministero dell'Interno - DAIT, Camera/Senato open data, and post-election public sources",
    dataset: "Elezioni Politiche 2022 - elected members full check fixture",
    license: "Mixed public-source reference; see urls",
    urls: [
      ...partial.source.urls,
      "https://tg24.sky.it/politica/2022/09/26/elezioni-2022-parlamentari-eletti-camera-senato",
      "https://tg24.sky.it/politica/2022/10/07/parlamento-seggi-camera-senato",
      "https://www.ilfattoquotidiano.it/2022/10/08/la-cassazione-ufficializza-gli-ultimi-sei-eletti-alla-camera-pulciani-fdi-todde-lovecchio-morfino-barzotti-e-scutella-m5s/6832806/",
      "https://www.senato.it/leg/19/Elettorale/R04/eletti-uninominale.htm",
      "https://www.regione.vda.it/amministrazione/Elezioni/Dati_e_risultati/elezioni/Mobile/Default_i.aspx?idele=168"
    ],
    accessedOn: "2026-08-12"
  },
  coverageNote:
    "Fixture completa da 600 parlamentari eletti 2022. Parte da elected-2022.json, che copre 579 record disponibili nei CSV Italia locali, e integra 12 Estero, 8 collegi speciali Valle d'Aosta/Trentino-Alto Adige-Suedtirol non presenti negli scrutini Italia locali, e 1 recupero Camera proporzionale M5S deciso dalla Cassazione.",
  totals,
  elected
};

writeFileSync(OUTPUT_PATH, `${JSON.stringify(fullReference, null, 2)}\n`);

function allocateForeignListSeats(lists, seats) {
  const activeLists = lists.filter((list) => list.votes > 0);
  const totalVotes = activeLists.reduce((sum, list) => sum + list.votes, 0);
  const quota = Math.floor(totalVotes / seats);
  const allocated = lists.map((list) => {
    const integerSeats = list.votes > 0 ? Math.floor(list.votes / quota) : 0;
    return {
      list,
      seats: integerSeats,
      remainder: list.votes - integerSeats * quota
    };
  });
  let remaining = seats - allocated.reduce((sum, row) => sum + row.seats, 0);
  for (const row of [...allocated].sort((a, b) => b.remainder - a.remainder || b.list.votes - a.list.votes || a.list.id.localeCompare(b.list.id))) {
    if (remaining <= 0) break;
    row.seats += 1;
    remaining -= 1;
  }
  return allocated.filter((row) => row.seats > 0);
}

function electForeignCandidates(list, seats) {
  return [...list.candidates]
    .sort((a, b) => preferenceRank(b) - preferenceRank(a) || a.list_position - b.list_position || a.name.localeCompare(b.name))
    .slice(0, seats);
}

function preferenceRank(candidate) {
  return candidate.preferences ?? -1;
}

function normalizeForeignCandidateName(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.toUpperCase())
    .join(" ");
}

function compareElected(a, b) {
  return (
    a.chamber.localeCompare(b.chamber) ||
    a.electionType.localeCompare(b.electionType) ||
    a.constituency.localeCompare(b.constituency) ||
    a.district.localeCompare(b.district) ||
    a.list.localeCompare(b.list) ||
    a.candidate.localeCompare(b.candidate)
  );
}

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
