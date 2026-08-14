import type {
  CameraGeographyMapping,
  ElectoralPopulationDataset,
  MunicipalityPopulation,
  SeatAllocationResult,
  TerritoryPopulation
} from "../domain/election";

export const EXCLUDED_BONUS_REGION_IDS = new Set(["valle-d-aosta", "trentino-alto-adige"]);

export const electoralPopulationRegistry: ElectoralPopulationDataset[] = [
  {
    id: "electoral-population-2021",
    censusDate: "2021-12-31",
    dprDate: "2023-01-20",
    effectiveFrom: "2023-03-03",
    municipalities: [
      { istatCode: "001000", municipalityName: "Piemonte 1", regionId: "piemonte", population: 1_881_488n },
      { istatCode: "002000", municipalityName: "Piemonte 2", regionId: "piemonte", population: 2_374_862n },
      { istatCode: "003000", municipalityName: "Valle d'Aosta", regionId: "valle-d-aosta", population: 123_337n },
      { istatCode: "004000", municipalityName: "Lombardia 1", regionId: "lombardia", population: 3_911_406n },
      { istatCode: "005000", municipalityName: "Lombardia 2", regionId: "lombardia", population: 2_606_196n },
      { istatCode: "006000", municipalityName: "Lombardia 3", regionId: "lombardia", population: 1_644_920n },
      { istatCode: "007000", municipalityName: "Lombardia 4", regionId: "lombardia", population: 1_750_600n },
      { istatCode: "008000", municipalityName: "Trentino-Alto Adige", regionId: "trentino-alto-adige", population: 1_077_574n },
      { istatCode: "009000", municipalityName: "Veneto 1", regionId: "veneto", population: 2_343_022n },
      { istatCode: "010000", municipalityName: "Veneto 2", regionId: "veneto", population: 2_506_531n },
      { istatCode: "011000", municipalityName: "Friuli-Venezia Giulia", regionId: "friuli-venezia-giulia", population: 1_195_059n },
      { istatCode: "012000", municipalityName: "Liguria", regionId: "liguria", population: 1_509_805n },
      { istatCode: "013000", municipalityName: "Emilia-Romagna", regionId: "emilia-romagna", population: 4_459_477n },
      { istatCode: "014000", municipalityName: "Toscana", regionId: "toscana", population: 3_663_191n },
      { istatCode: "015000", municipalityName: "Umbria", regionId: "umbria", population: 859_572n },
      { istatCode: "016000", municipalityName: "Marche", regionId: "marche", population: 1_484_298n },
      { istatCode: "017000", municipalityName: "Lazio 1", regionId: "lazio", population: 4_222_881n },
      { istatCode: "018000", municipalityName: "Lazio 2", regionId: "lazio", population: 1_497_655n },
      { istatCode: "019000", municipalityName: "Abruzzo", regionId: "abruzzo", population: 1_275_950n },
      { istatCode: "020000", municipalityName: "Molise", regionId: "molise", population: 290_769n },
      { istatCode: "021000", municipalityName: "Campania 1", regionId: "campania", population: 2_953_643n },
      { istatCode: "022000", municipalityName: "Campania 2", regionId: "campania", population: 2_670_617n },
      { istatCode: "023000", municipalityName: "Puglia", regionId: "puglia", population: 3_922_941n },
      { istatCode: "024000", municipalityName: "Basilicata", regionId: "basilicata", population: 539_999n },
      { istatCode: "025000", municipalityName: "Calabria", regionId: "calabria", population: 1_855_454n },
      { istatCode: "026000", municipalityName: "Sicilia 1", regionId: "sicilia", population: 2_275_336n },
      { istatCode: "027000", municipalityName: "Sicilia 2", regionId: "sicilia", population: 2_558_369n },
      { istatCode: "028000", municipalityName: "Sardegna", regionId: "sardegna", population: 1_579_181n }
    ]
  },
  {
    id: "electoral-population-2026",
    censusDate: "2026-12-31",
    dprDate: null,
    effectiveFrom: null,
    municipalities: []
  }
];

export const cameraGeography2021: CameraGeographyMapping[] = [
  ["001000", "camera-piemonte-1"],
  ["002000", "camera-piemonte-2"],
  ["003000", "camera-valle-d-aosta"],
  ["004000", "camera-lombardia-1"],
  ["005000", "camera-lombardia-2"],
  ["006000", "camera-lombardia-3"],
  ["007000", "camera-lombardia-4"],
  ["008000", "camera-trentino-alto-adige"],
  ["009000", "camera-veneto-1"],
  ["010000", "camera-veneto-2"],
  ["011000", "camera-friuli-venezia-giulia"],
  ["012000", "camera-liguria"],
  ["013000", "camera-emilia-romagna"],
  ["014000", "camera-toscana"],
  ["015000", "camera-umbria"],
  ["016000", "camera-marche"],
  ["017000", "camera-lazio-1"],
  ["018000", "camera-lazio-2"],
  ["019000", "camera-abruzzo"],
  ["020000", "camera-molise"],
  ["021000", "camera-campania-1"],
  ["022000", "camera-campania-2"],
  ["023000", "camera-puglia"],
  ["024000", "camera-basilicata"],
  ["025000", "camera-calabria"],
  ["026000", "camera-sicilia-1"],
  ["027000", "camera-sicilia-2"],
  ["028000", "camera-sardegna"]
].map(([istatCode, constituencyId]) => ({ istatCode: normalizeIstatCode(istatCode), constituencyId }));

export function getElectoralPopulationDatasetEffectiveOn(
  electionDate: string,
  registry: ElectoralPopulationDataset[] = electoralPopulationRegistry
): ElectoralPopulationDataset {
  const eligible = registry
    .filter((dataset) => dataset.effectiveFrom !== null && dataset.effectiveFrom <= electionDate)
    .sort((a, b) => b.effectiveFrom!.localeCompare(a.effectiveFrom!));
  // Historical vote datasets can predate the decree publishing the current
  // official population baseline. In that case, use the earliest available
  // official dataset rather than rejecting an otherwise valid simulation.
  const dataset = eligible[0] ?? registry
    .filter((entry) => entry.effectiveFrom !== null)
    .sort((a, b) => a.effectiveFrom!.localeCompare(b.effectiveFrom!))[0];
  if (!dataset) throw new Error(`No electoral population dataset effective on ${electionDate}`);
  return dataset;
}

export function aggregateCameraPopulation(
  municipalities: MunicipalityPopulation[],
  geography: CameraGeographyMapping[]
): TerritoryPopulation[] {
  const mapping = new Map<string, string>();
  for (const row of geography) {
    const istatCode = normalizeIstatCode(row.istatCode);
    if (mapping.has(istatCode)) throw new Error(`Duplicate Camera geography mapping for ISTAT ${istatCode}`);
    mapping.set(istatCode, row.constituencyId);
  }

  const totals = new Map<string, bigint>();
  for (const municipality of municipalities) {
    const territoryId = mapping.get(normalizeIstatCode(municipality.istatCode));
    if (!territoryId) throw new Error(`Missing Camera geography mapping for ISTAT ${municipality.istatCode}`);
    totals.set(territoryId, (totals.get(territoryId) ?? 0n) + municipality.population);
  }
  return [...totals.entries()].map(([territoryId, population]) => ({ territoryId, population }));
}

export function aggregateSenatePopulation(municipalities: MunicipalityPopulation[]): TerritoryPopulation[] {
  const totals = new Map<string, bigint>();
  for (const municipality of municipalities) {
    totals.set(municipality.regionId, (totals.get(municipality.regionId) ?? 0n) + municipality.population);
  }
  return [...totals.entries()].map(([territoryId, population]) => ({ territoryId, population }));
}

export function allocateSeatsByPopulation(
  territories: TerritoryPopulation[],
  seatsToAllocate: number,
  datasetId = ""
): SeatAllocationResult {
  if (seatsToAllocate <= 0) throw new Error("seatsToAllocate must be positive");
  const active = territories.filter((territory) => territory.population > 0n);
  const totalPopulation = active.reduce((sum, territory) => sum + territory.population, 0n);
  const quotient = totalPopulation / BigInt(seatsToAllocate);
  if (quotient <= 0n) throw new Error("Population quotient must be positive");

  const initial = active.map((territory) => {
    const integerSeats = Number(territory.population / quotient);
    return {
      ...territory,
      integerSeats,
      remainder: territory.population - BigInt(integerSeats) * quotient,
      seats: integerSeats
    };
  });
  const remaining = seatsToAllocate - initial.reduce((sum, territory) => sum + territory.integerSeats, 0);
  const ranked = [...initial].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.territoryId.localeCompare(b.territoryId);
  });
  const boundaryRemainder = remaining > 0 ? ranked[remaining - 1]?.remainder : undefined;
  const nextRemainder = remaining >= 0 ? ranked[remaining]?.remainder : undefined;
  const tiedAtBoundary =
    boundaryRemainder === undefined || nextRemainder !== boundaryRemainder
      ? []
      : ranked.filter((territory) => territory.remainder === boundaryRemainder);
  const unresolvedTies =
    tiedAtBoundary.length > 1
      ? [{ territoryIds: tiedAtBoundary.map((territory) => territory.territoryId), affectedSeatNumber: remaining }]
      : [];

  const safeRemainderSeats = tiedAtBoundary.length > 1
    ? ranked.findIndex((territory) => territory.remainder === boundaryRemainder)
    : remaining;
  for (let index = 0; index < safeRemainderSeats; index += 1) ranked[index].seats += 1;

  return {
    datasetId,
    quotient,
    territories: initial.sort((a, b) => a.territoryId.localeCompare(b.territoryId)),
    unresolvedTies
  };
}

export function calculateCameraBonusSeats(dataset: ElectoralPopulationDataset): SeatAllocationResult {
  const populations = aggregateCameraPopulation(dataset.municipalities, cameraGeography2021).filter(
    (territory) =>
      territory.territoryId !== "camera-valle-d-aosta" && territory.territoryId !== "camera-trentino-alto-adige"
  );
  return allocateSeatsByPopulation(populations, 70, dataset.id);
}

export function calculateSenateBonusSeats(dataset: ElectoralPopulationDataset): SeatAllocationResult {
  const populations = aggregateSenatePopulation(dataset.municipalities).filter(
    (territory) => !EXCLUDED_BONUS_REGION_IDS.has(territory.territoryId)
  );
  return allocateSeatsByPopulation(populations, 35, dataset.id);
}

export function normalizeIstatCode(value: string): string {
  return value.replace(/\D/g, "").padStart(6, "0");
}
