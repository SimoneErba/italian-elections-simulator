import type { Chamber } from "../../electoral-engine/domain/chamber";
import type { BonusCandidatePriority, Candidate, CandidateNomination, ElectionInput } from "../../electoral-engine/domain/election";
import type { ForeignElectionData } from "../../lib/elections/estero";
import { foreignElectionDataSchema } from "../schemas/election-input-schema";
import { normalizeInteger, normalizeListName, parseDelimited, slug, unique } from "./csv";

type OnDataScrutiniRow = {
  "TIPO ELEZIONE": string;
  "COLLEGIO PLURINOMINALE": string;
  "COLLEGIO UNINOMINALE": string;
  CIRCOSCRIZIONE: string;
  COGNOME: string;
  NOME: string;
  LISTA: string;
  cod?: string;
  "VOTI CANDIDATO"?: string;
  "VOTI SOLO CANDIDATO"?: string;
  "VOTI LISTE": string;
};

type BonusNominationRow = {
  chamber: string;
  constituencyId: string;
  connectedSubjectId?: string;
  listId: string;
  candidateId: string;
  position: string;
  nominationType?: string;
};

type BonusCandidatePriorityRow = {
  chamber?: string;
  connectedSubjectId?: string;
  coalitionId?: string;
  subjectId?: string;
  listId?: string;
  partyId?: string;
  party?: string;
  candidateId: string;
  position: string;
  firstName?: string;
  lastName?: string;
  nome?: string;
  cognome?: string;
};

type CandidateListRow = {
  CODTIPOELEZIONE?: string;
  Circoscrizione?: string;
  Regione?: string;
  CollPlurinom: string;
  descrlista: string;
  cognome: string;
  nome: string;
  datanascita: string;
  luogonascita: string;
  sesso: string;
  CODTIPOELETTO?: string;
};

export type OnDataImportFiles = {
  cameraScrutiniCsv: string;
  senateScrutiniCsv: string;
  bonusNominationsCsv?: string;
  bonusCandidateListsCsv?: string;
  cameraCandidateListCsv?: string;
  senateCandidateListCsv?: string;
  foreignElectionJson: string;
  specialTerritoriesJson?: string;
};

export function loadOnData2022Scenario(files: OnDataImportFiles): ElectionInput {
  const cameraRows = parseDelimited(files.cameraScrutiniCsv).map(normalizeScrutiniRow).filter(isUsableRow);
  const senateRows = parseDelimited(files.senateScrutiniCsv).map(normalizeScrutiniRow).filter(isUsableRow);
  const allRows = [
    ...cameraRows.map((row) => ({ ...row, chamber: "camera" as const })),
    ...senateRows.map((row) => ({ ...row, chamber: "senate" as const }))
  ];
  const coalitions = inferCoalitions(allRows);
  const coalitionByListId = new Map(coalitions.flatMap((coalition) => coalition.listIds.map((listId) => [listId, coalition.id])));
  const listNames = unique(allRows.map((row) => normalizeListName(row.LISTA))).sort((a, b) => a.localeCompare(b));
  const lists = listNames.map((name) => {
    const id = listId(name);
    return {
      id,
      name,
      coalitionId: coalitionByListId.get(id),
      ...minorityMetadata(name)
    };
  });

  const regions = unique(allRows.map((row) => regionId(row.CIRCOSCRIZIONE))).map((id) => ({
    id,
    name: allRows.find((row) => regionId(row.CIRCOSCRIZIONE) === id)?.CIRCOSCRIZIONE ?? id
  }));
  const constituencies = unique(allRows.map((row) => `${row.chamber}|${row.CIRCOSCRIZIONE}`)).map((key) => {
    const [chamber, name] = key.split("|") as [Chamber, string];
    return {
      id: constituencyId(chamber, name),
      chamber,
      regionId: regionId(name),
      name
    };
  });
  const multiMemberDistricts = unique(
    allRows.map((row) => `${row.chamber}|${row.CIRCOSCRIZIONE}|${row["COLLEGIO PLURINOMINALE"]}`)
  ).map((key) => {
    const [chamber, constituencyName, districtName] = key.split("|") as [Chamber, string, string];
    const id = districtId(chamber, districtName);
    const capacity = rosatellum2022DistrictSeatCapacity(id);
    if (!capacity) {
      throw new Error(`Tabella seggi ufficiale mancante per ${id}.`);
    }
    return {
      id,
      chamber,
      constituencyId: constituencyId(chamber, constituencyName),
      regionId: regionId(constituencyName),
      name: districtName,
      seatsWithBonus: capacity.withBonus,
      seatsWithoutBonus: capacity.withoutBonus
    };
  });

  const normalizedListRows = addSoloCandidateVotesProQuota(allRows);
  const voteTotals = new Map<string, bigint>();
  for (const row of normalizedListRows) {
    const key = `${row.chamber}|${districtId(row.chamber, row["COLLEGIO PLURINOMINALE"])}|${listId(row.LISTA)}`;
    voteTotals.set(key, (voteTotals.get(key) ?? 0n) + row.votes);
  }
  const listVotes = [...voteTotals.entries()].map(([key, votes]) => {
    const [chamber, rowDistrictId, rowListId] = key.split("|") as [Chamber, string, string];
    return { chamber, districtId: rowDistrictId, listId: rowListId, votes };
  });
  const singleMemberBundle = loadSingleMemberDistricts(allRows, coalitionByListId);
  const nominationBundle = loadCandidateListFiles(files.cameraCandidateListCsv, files.senateCandidateListCsv);
  const bonusNominations = files.bonusNominationsCsv ? loadBonusNominationsCsv(files.bonusNominationsCsv) : [];
  const bonusCandidateBundle = files.bonusCandidateListsCsv ? loadBonusCandidateListsCsv(files.bonusCandidateListsCsv) : { candidates: [], priorities: [] };
  const identityBundle = reconcileCandidateIdentities(
    mergeCandidates(nominationBundle.candidates, bonusCandidateBundle.candidates, singleMemberBundle.candidates),
    [...nominationBundle.nominations, ...bonusNominations, ...singleMemberBundle.nominations],
    lists
  );

  const specialTerritories = files.specialTerritoriesJson ? loadSpecialTerritoriesJson(files.specialTerritoriesJson) : undefined;
  const special = specialTerritories ? buildSpecialTerritoryBundle(specialTerritories, lists) : undefined;
  return {
    schemaVersion: "1.0",
    lawVersion: "rosatellum-2022",
    electionDate: "2022-09-25",
    lists: special ? mergePoliticalLists(lists, special.lists) : lists,
    coalitions,
    regions: special ? uniqueById([...regions, ...special.regions]) : regions,
    constituencies: special ? uniqueById([...constituencies, ...special.constituencies]) : constituencies,
    multiMemberDistricts,
    singleMemberDistricts: special ? [...singleMemberBundle.districts, ...special.districts] : singleMemberBundle.districts,
    listVotes,
    candidateVotes: special ? [...singleMemberBundle.candidateVotes, ...special.candidateVotes] : singleMemberBundle.candidateVotes,
    candidates: identityBundle.candidates.length > 0 ? [...identityBundle.candidates, ...(special?.candidates ?? [])] : special?.candidates,
    nominations: identityBundle.nominations.length > 0 ? [...identityBundle.nominations, ...(special?.nominations ?? [])] : special?.nominations,
    bonusCandidateLists: bonusCandidateBundle.priorities.length > 0 ? bonusCandidateBundle.priorities : undefined,
    foreignElection: loadForeignElectionJson(files.foreignElectionJson),
    coverageWarnings: special ? undefined : ["Copertura territoriale incompleta: manca il file speciale 2022 per Valle d'Aosta e Senato Trentino-Alto Adige/Südtirol."]
  };
}

type SpecialTerritoryFixture = { districts: Array<{ chamber: Chamber; region: string; district: string; winner: { firstName: string; lastName: string; votes: string; listName: string } }> };

function loadSpecialTerritoriesJson(text: string): SpecialTerritoryFixture {
  return JSON.parse(text) as SpecialTerritoryFixture;
}

function buildSpecialTerritoryBundle(fixture: SpecialTerritoryFixture, currentLists: ElectionInput["lists"]) {
  const lists: ElectionInput["lists"] = [];
  const regions: ElectionInput["regions"] = [];
  const constituencies: ElectionInput["constituencies"] = [];
  const districts: NonNullable<ElectionInput["singleMemberDistricts"]> = [];
  const candidates: Candidate[] = [];
  const nominations: CandidateNomination[] = [];
  const candidateVotes: NonNullable<ElectionInput["candidateVotes"]> = [];
  for (const item of fixture.districts) {
    const region = regionId(item.region);
    const constituency = constituencyId(item.chamber, item.region);
    const district = singleMemberDistrictId(item.chamber, item.district);
    const list = listId(item.winner.listName);
    if (!currentLists.some((entry) => entry.id === list) && !lists.some((entry) => entry.id === list)) lists.push({ id: list, name: item.winner.listName, ...minorityMetadata(item.winner.listName) });
    regions.push({ id: region, name: item.region });
    constituencies.push({ id: constituency, chamber: item.chamber, regionId: region, name: item.region });
    districts.push({ id: district, chamber: item.chamber, regionId: region, constituencyId: constituency, name: item.district, specialTerritory: region.includes("valle-d-aosta") ? "valle-aosta" : "trentino-alto-adige", seats: 1 });
    const candidateId = singleMemberCandidateId(item.chamber, item.district, item.winner.lastName, item.winner.firstName);
    candidates.push({ id: candidateId, firstName: item.winner.firstName, lastName: item.winner.lastName, party: list });
    nominations.push({ candidateId, chamber: item.chamber, listId: list, connectedSubjectId: list, districtId: district, constituencyId: constituency, position: 1, nominationType: "single-member" });
    candidateVotes.push({ chamber: item.chamber, districtId: district, candidateId, votes: BigInt(item.winner.votes) });
  }
  return { lists, regions, constituencies, districts, candidates, nominations, candidateVotes };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function mergePoliticalLists(base: ElectionInput["lists"], additions: ElectionInput["lists"]): ElectionInput["lists"] {
  return uniqueById([...base, ...additions]);
}

function addSoloCandidateVotesProQuota(rows: Array<OnDataScrutiniRow & { chamber: Chamber }>): Array<OnDataScrutiniRow & { chamber: Chamber; votes: bigint }> {
  const grouped = new Map<string, Array<OnDataScrutiniRow & { chamber: Chamber }>>();
  for (const row of rows) {
    const key = [
      row.chamber,
      row.cod ?? "",
      row["COLLEGIO UNINOMINALE"],
      normalizeKey(row.COGNOME),
      normalizeKey(row.NOME)
    ].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const output: Array<OnDataScrutiniRow & { chamber: Chamber; votes: bigint }> = [];
  for (const group of grouped.values()) {
    const baseVotes = group.map((row) => BigInt(normalizeInteger(row["VOTI LISTE"])));
    const explicitSolo = group[0]["VOTI SOLO CANDIDATO"];
    const candidateVotes = BigInt(normalizeInteger(group[0]["VOTI CANDIDATO"] ?? "0"));
    const listedVotes = baseVotes.reduce((sum, value) => sum + value, 0n);
    const soloVotes = explicitSolo === undefined || explicitSolo === ""
      ? (candidateVotes > listedVotes ? candidateVotes - listedVotes : 0n)
      : BigInt(normalizeInteger(explicitSolo));
    const additions = allocateProRata(baseVotes, soloVotes);
    group.forEach((row, index) => output.push({ ...row, votes: baseVotes[index] + additions[index] }));
  }
  return output;
}

export function allocateProRata(weights: bigint[], seats: bigint): bigint[] {
  const result = weights.map(() => 0n);
  if (seats <= 0n || weights.length === 0) return result;
  const total = weights.reduce((sum, value) => sum + value, 0n);
  if (total <= 0n) {
    result[0] = seats;
    return result;
  }
  let assigned = 0n;
  const remainders = weights.map((weight, index) => {
    const product = weight * seats;
    const integer = product / total;
    result[index] = integer;
    assigned += integer;
    return { index, remainder: product % total, weight };
  });
  let remaining = seats - assigned;
  for (const item of remainders.sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    if (a.weight !== b.weight) return a.weight > b.weight ? -1 : 1;
    return a.index - b.index;
  })) {
    if (remaining <= 0n) break;
    result[item.index] += 1n;
    remaining -= 1n;
  }
  return result;
}

function loadSingleMemberDistricts(
  rows: Array<OnDataScrutiniRow & { chamber: Chamber }>,
  coalitionByListId: Map<string, string>
): Pick<ElectionInput, "singleMemberDistricts" | "candidateVotes" | "candidates" | "nominations"> & {
  districts: NonNullable<ElectionInput["singleMemberDistricts"]>;
  candidateVotes: NonNullable<ElectionInput["candidateVotes"]>;
  candidates: NonNullable<ElectionInput["candidates"]>;
  nominations: NonNullable<ElectionInput["nominations"]>;
} {
  const byDistrict = new Map<string, Array<OnDataScrutiniRow & { chamber: Chamber }>>();
  for (const row of rows) {
    const key = `${row.chamber}|${row.CIRCOSCRIZIONE}|${row["COLLEGIO UNINOMINALE"]}`;
    byDistrict.set(key, [...(byDistrict.get(key) ?? []), row]);
  }

  const districts: NonNullable<ElectionInput["singleMemberDistricts"]> = [];
  const candidates: NonNullable<ElectionInput["candidates"]> = [];
  const nominations: NonNullable<ElectionInput["nominations"]> = [];
  const candidateVotes: NonNullable<ElectionInput["candidateVotes"]> = [];

  for (const [key, districtRows] of byDistrict.entries()) {
    const [chamber, constituencyName, districtName] = key.split("|") as [Chamber, string, string];
    const rowDistrictId = singleMemberDistrictId(chamber, districtName);
    districts.push({
      id: rowDistrictId,
      chamber,
      regionId: regionId(constituencyName),
      constituencyId: constituencyId(chamber, constituencyName),
      multiMemberDistrictId: districtId(chamber, districtRows[0]["COLLEGIO PLURINOMINALE"]),
      name: districtName,
      specialTerritory: specialTerritoryFromName(constituencyName),
      seats: 1
    });

    const byCandidate = new Map<string, Array<OnDataScrutiniRow & { chamber: Chamber }>>();
    for (const row of districtRows) {
      const candidateKey = `${normalizeKey(row.COGNOME)}|${normalizeKey(row.NOME)}`;
      byCandidate.set(candidateKey, [...(byCandidate.get(candidateKey) ?? []), row]);
    }
    for (const candidateRows of byCandidate.values()) {
      const sample = candidateRows[0];
      const candidateId = singleMemberCandidateId(chamber, districtName, sample.COGNOME, sample.NOME);
      const firstListId = listId(sample.LISTA);
      const connectedSubjectId = coalitionByListId.get(firstListId) ?? firstListId;
      candidates.push({ id: candidateId, firstName: normalizePersonPart(sample.NOME), lastName: normalizePersonPart(sample.COGNOME), party: firstListId });
      nominations.push({
        candidateId,
        chamber,
        listId: firstListId,
        connectedSubjectId,
        districtId: rowDistrictId,
        constituencyId: constituencyId(chamber, constituencyName),
        position: 1,
        nominationType: "single-member"
      });
      const votesByMunicipality = new Map<string, bigint>();
      for (const row of candidateRows) {
        const municipality = row.cod ?? `${row.COGNOME}|${row.NOME}`;
        votesByMunicipality.set(municipality, BigInt(normalizeInteger(row["VOTI CANDIDATO"] ?? "0")));
      }
      candidateVotes.push({
        chamber,
        districtId: rowDistrictId,
        candidateId,
        votes: [...votesByMunicipality.values()].reduce((sum, votes) => sum + votes, 0n)
      });
    }
  }
  return { singleMemberDistricts: districts, districts, candidateVotes, candidates, nominations };
}

export function loadForeignElectionJson(text: string): ForeignElectionData {
  return foreignElectionDataSchema.parse(JSON.parse(text)) as ForeignElectionData;
}

export function inferCoalitions(rows: Array<OnDataScrutiniRow & { chamber: Chamber }>) {
  const listIds = new Set(rows.map((row) => listId(row.LISTA)));
  const parent = new Map([...listIds].map((id) => [id, id]));
  const find = (id: string): string => {
    const value = parent.get(id);
    if (!value || value === id) return id;
    const root = find(value);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  const byCandidate = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = [
      row.chamber,
      normalizeKey(row["COLLEGIO UNINOMINALE"]),
      normalizeKey(row.COGNOME),
      normalizeKey(row.NOME)
    ].join("|");
    if (!byCandidate.has(key)) byCandidate.set(key, new Set());
    byCandidate.get(key)!.add(listId(row.LISTA));
  }
  for (const group of byCandidate.values()) {
    const ids = [...group];
    if (ids.length <= 1) continue;
    for (let index = 1; index < ids.length; index += 1) union(ids[0], ids[index]);
  }

  const components = new Map<string, string[]>();
  for (const id of listIds) {
    const root = find(id);
    components.set(root, [...(components.get(root) ?? []), id]);
  }

  return [...components.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ids.sort())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((ids) => ({
      id: `coalition-${slug(ids.join("-"))}`,
      name: `Coalizione ${ids.map(titleFromListId).join(" / ")}`,
      alias: coalitionAlias(ids),
      listIds: ids
    }));
}

export function loadBonusNominationsCsv(text: string): CandidateNomination[] {
  return parseDelimited(text).map((row) => {
    const record = row as BonusNominationRow;
    return {
      candidateId: record.candidateId,
      chamber: parseChamber(record.chamber),
      listId: record.listId,
      constituencyId: record.constituencyId,
      connectedSubjectId: record.connectedSubjectId || undefined,
      position: Number(record.position),
      nominationType: "bonus-constituency-list"
    };
  });
}

export function loadBonusCandidateListsCsv(text: string): {
  candidates: Candidate[];
  priorities: BonusCandidatePriority[];
} {
  const candidatesById = new Map<string, Candidate>();
  const priorities: BonusCandidatePriority[] = [];
  for (const row of parseDelimited(text)) {
    const record = row as BonusCandidatePriorityRow;
    const candidateId = record.candidateId;
    const chamber = parseChamber(record.chamber ?? "");
    const connectedSubjectId = record.connectedSubjectId || record.coalitionId || record.subjectId || "";
    const party = listId(record.listId || record.partyId || record.party || "");
    const firstName = normalizePersonPart(record.firstName ?? record.nome ?? "");
    const lastName = normalizePersonPart(record.lastName ?? record.cognome ?? "");
    if (firstName || lastName) {
      candidatesById.set(candidateId, { id: candidateId, firstName, lastName, party: party || undefined });
    }
    priorities.push({
      candidateId,
      chamber,
      connectedSubjectId,
      position: Number(record.position)
    });
  }
  return { candidates: [...candidatesById.values()], priorities };
}

export function loadCandidateListFiles(cameraCsv?: string, senateCsv?: string): {
  candidates: Candidate[];
  nominations: CandidateNomination[];
} {
  const rows = [
    ...(cameraCsv ? parseDelimited(cameraCsv).map((row) => ({ row: normalizeCandidateListRow(row), chamber: "camera" as const })) : []),
    ...(senateCsv ? parseDelimited(senateCsv).map((row) => ({ row: normalizeCandidateListRow(row), chamber: "senate" as const })) : [])
  ];
  const candidatesById = new Map<string, Candidate>();
  const nominations: CandidateNomination[] = [];
  const positions = new Map<string, number>();

  const canonicalBirthDates = new Map<string, string>();
  const birthDateCounts = new Map<string, Map<string, number>>();
  for (const { row, chamber } of rows) {
    const identityKey = proportionalIdentityKey(chamber, row);
    const birthDate = normalizePersonPart(row.datanascita ?? "");
    if (!identityKey || !birthDate) continue;
    const counts = birthDateCounts.get(identityKey) ?? new Map<string, number>();
    counts.set(birthDate, (counts.get(birthDate) ?? 0) + 1);
    birthDateCounts.set(identityKey, counts);
  }
  for (const [identityKey, counts] of birthDateCounts) {
    canonicalBirthDates.set(identityKey, [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  }

  for (const { row, chamber } of rows) {
    const listName = normalizeListName(row.descrlista ?? "");
    const districtName = row.CollPlurinom ?? "";
    const lastName = normalizePersonPart(row.cognome ?? "");
    const firstName = normalizePersonPart(row.nome ?? "");
    const identityKey = proportionalIdentityKey(chamber, row);
    const birthDate = canonicalBirthDates.get(identityKey) ?? normalizePersonPart(row.datanascita ?? "");
    if (!listName || !districtName || !lastName || !firstName) continue;

    const candidateId = candidateIdFor(chamber, listName, lastName, firstName, birthDate);
    const conflicts = [...(birthDateCounts.get(identityKey)?.keys() ?? [])].filter((value) => value !== birthDate);
    candidatesById.set(candidateId, {
      id: candidateId,
      firstName,
      lastName,
      birthYear: parseBirthYear(birthDate),
      party: listId(listName),
      identityConflicts: conflicts.length > 0 ? conflicts.map((value) => `datanascita:${value}`) : undefined
    });
    const rowDistrictId = districtId(chamber, districtName);
    const key = `${chamber}|${rowDistrictId}|${listId(listName)}`;
    const position = (positions.get(key) ?? 0) + 1;
    positions.set(key, position);
    nominations.push({
      candidateId,
      chamber,
      listId: listId(listName),
      districtId: rowDistrictId,
      constituencyId: row.Circoscrizione ? constituencyId(chamber, row.Circoscrizione) : row.Regione ? constituencyId(chamber, row.Regione) : undefined,
      position,
      nominationType: "multi-member"
    });
  }

  return { candidates: [...candidatesById.values()], nominations };
}

function proportionalIdentityKey(chamber: Chamber, row: CandidateListRow): string {
  const listName = normalizeListName(row.descrlista ?? "");
  const lastName = normalizePersonPart(row.cognome ?? "");
  const firstName = normalizePersonPart(row.nome ?? "");
  if (!listName || !lastName || !firstName) return "";
  return [chamber, listId(listName), normalizeKey(lastName), normalizeKey(firstName), normalizeKey(row.luogonascita ?? ""), normalizeKey(row.sesso ?? "")].join("|");
}

function parseBirthYear(value: string): number | undefined {
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function mergeCandidates(...groups: Candidate[][]): Candidate[] {
  return [...new Map(groups.flat().map((candidate) => [candidate.id, candidate])).values()];
}

function reconcileCandidateIdentities(
  candidates: Candidate[],
  nominations: CandidateNomination[],
  lists: ElectionInput["lists"]
): { candidates: Candidate[]; nominations: CandidateNomination[] } {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const listById = new Map(lists.map((list) => [list.id, list]));
  const proportionalByIdentity = new Map<string, Set<string>>();
  for (const nomination of nominations) {
    if (nomination.nominationType !== "multi-member") continue;
    const candidate = candidatesById.get(nomination.candidateId);
    if (!candidate) continue;
    const key = `${nomination.chamber}|${personNameKey(candidate)}`;
    const ids = proportionalByIdentity.get(key) ?? new Set<string>();
    ids.add(candidate.id);
    proportionalByIdentity.set(key, ids);
  }

  const replacement = new Map<string, string>();
  for (const single of nominations.filter((nomination) => nomination.nominationType === "single-member")) {
    const candidate = candidatesById.get(single.candidateId);
    if (!candidate) continue;
    const key = `${single.chamber}|${personNameKey(candidate)}`;
    const compatible = [...(proportionalByIdentity.get(key) ?? [])].filter((candidateId) =>
      nominations.some((nomination) => {
        if (nomination.candidateId !== candidateId || nomination.nominationType !== "multi-member") return false;
        const proportionalList = listById.get(nomination.listId);
        return nomination.listId === single.listId ||
          Boolean(single.connectedSubjectId && proportionalList?.coalitionId === single.connectedSubjectId);
      })
    );
    if (compatible.length !== 1) continue;
    replacement.set(compatible[0], single.candidateId);
    const proportional = candidatesById.get(compatible[0]);
    if (proportional) {
      candidatesById.set(single.candidateId, {
        ...candidate,
        birthYear: proportional.birthYear,
        identityConflicts: proportional.identityConflicts,
        party: proportional.party ?? candidate.party
      });
    }
  }

  const reconciledNominations = nominations.map((nomination) => ({
    ...nomination,
    candidateId: replacement.get(nomination.candidateId) ?? nomination.candidateId
  }));
  return {
    candidates: [...candidatesById.values()].filter((candidate) => !replacement.has(candidate.id)),
    nominations: reconciledNominations
  };
}

function normalizeCandidateListRow(row: Record<string, string>): CandidateListRow {
  const fullName = normalizePersonPart(row.CANDIDATO ?? "");
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    CODTIPOELEZIONE: row.CODTIPOELEZIONE,
    Circoscrizione: normalizeCandidateGeography(row.Circoscrizione ?? row.CIRCOSCRIZIONE),
    Regione: normalizeCandidateGeography(row.Regione ?? row.REGIONE),
    CollPlurinom: normalizeCandidateGeography(row.CollPlurinom ?? row.COLLEGIO_PLURINOMINALE ?? "") ?? "",
    descrlista: normalizeCandidateGeography(row.descrlista ?? row.DESCR_LISTA) ?? "",
    nome: row.nome ?? (parts.shift() ?? ""),
    cognome: row.cognome ?? parts.join(" "),
    datanascita: row.datanascita ?? row.DATA_NASCITA ?? "",
    luogonascita: row.luogonascita ?? row.LUOGO_NASCITA ?? "",
    sesso: row.sesso ?? "",
    CODTIPOELETTO: row.CODTIPOELETTO
  };
}

function normalizeCandidateGeography(value: string | undefined): string | undefined {
  return value?.replace(/S.DTIROL/gi, "SUDTIROL");
}

function personNameKey(candidate: Candidate): string {
  return [candidate.firstName, candidate.lastName]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\bDETT[OA]\s+[A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .sort()
    .join(" ");
}

function normalizeScrutiniRow(row: Record<string, string>): OnDataScrutiniRow {
  return {
    cod: row.cod ?? row.COMUNE ?? "",
    "TIPO ELEZIONE": row["TIPO ELEZIONE"] ?? row.CODTIPOELEZIONE ?? "",
    "COLLEGIO PLURINOMINALE": row["COLLEGIO PLURINOMINALE"] ?? row.COLLPLURI ?? "",
    "COLLEGIO UNINOMINALE": row["COLLEGIO UNINOMINALE"] ?? row.COLLUNINOM ?? "",
    CIRCOSCRIZIONE: row.CIRCOSCRIZIONE ?? row["CIRC-REG"] ?? "",
    COGNOME: row.COGNOME ?? "",
    NOME: row.NOME ?? "",
    LISTA: normalizeListName(row.LISTA ?? row.DESCRLISTA ?? ""),
    "VOTI CANDIDATO": row["VOTI CANDIDATO"] ?? row.VOTICANDIDATO ?? "0",
    "VOTI SOLO CANDIDATO": row["VOTI SOLO CANDIDATO"],
    "VOTI LISTE": row["VOTI LISTE"] ?? row.VOTILISTA ?? "0"
  };
}

function isUsableRow(row: OnDataScrutiniRow): boolean {
  return Boolean(row.CIRCOSCRIZIONE && row["COLLEGIO PLURINOMINALE"] && row["COLLEGIO UNINOMINALE"] && row.LISTA);
}

function parseChamber(value: string): Chamber {
  const normalized = value.toLowerCase();
  if (normalized === "camera" || normalized === "c") return "camera";
  if (normalized === "senate" || normalized === "senato" || normalized === "s") return "senate";
  throw new Error(`Camera non riconosciuta per candidatura premio: ${value}`);
}

function listId(name: string): string {
  return slug(normalizeListName(name));
}

function districtId(chamber: Chamber, name: string): string {
  return slug(`${chamber}-${name}`);
}

function singleMemberDistrictId(chamber: Chamber, name: string): string {
  return slug(`${chamber}-${name}`);
}

function constituencyId(chamber: Chamber, name: string): string {
  return slug(`${chamber}-${name}`);
}

function regionId(name: string): string {
  return slug(name.replace(/\s+\d+$/, ""));
}

function normalizeKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function titleFromListId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function coalitionAlias(listIds: string[]): string | undefined {
  const ids = new Set(listIds);
  if (
    ids.has("fratelli-d-italia-con-giorgia-meloni") &&
    ids.has("forza-italia") &&
    ids.has("lega-per-salvini-premier")
  ) {
    return "Centrodestra";
  }
  if (
    ids.has("partito-democratico-italia-democratica-e-progressista") &&
    (ids.has("europa") || ids.has("alleanza-verdi-e-sinistra"))
  ) {
    return "Centrosinistra";
  }
  return undefined;
}

function candidateIdFor(chamber: Chamber, listName: string, lastName: string, firstName: string, birthDate: string): string {
  return slug(`${chamber}-${listName}-${lastName}-${firstName}-${birthDate}`);
}

function singleMemberCandidateId(chamber: Chamber, districtName: string, lastName: string, firstName: string): string {
  return slug(`${chamber}-${districtName}-${lastName}-${firstName}`);
}

function normalizePersonPart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function minorityMetadata(name: string) {
  if (normalizeKey(name).includes("SUDTIROLER VOLKSPARTEI")) {
    return { isLinguisticMinority: true, protectedRegionId: "trentino-alto-adige-sudtirol" };
  }
  return {};
}

function specialTerritoryFromName(name: string): "valle-aosta" | "trentino-alto-adige" | undefined {
  const id = regionId(name);
  if (id.includes("valle-d-aosta")) return "valle-aosta";
  if (id.includes("trentino-alto-adige")) return "trentino-alto-adige";
  return undefined;
}

export function rosatellum2022DistrictSeatCapacity(districtId: string): { withBonus: number; withoutBonus: number } | undefined {
  const seats = rosatellum2022DistrictSeats[districtId];
  return seats === undefined ? undefined : { withBonus: seats, withoutBonus: seats };
}

const rosatellum2022DistrictSeats: Record<string, number> = {
  "camera-abruzzo-p01": 6,
  "camera-basilicata-p01": 3,
  "camera-calabria-p01": 8,
  "camera-campania-1-p01": 6,
  "camera-campania-1-p02": 7,
  "camera-campania-2-p01": 5,
  "camera-campania-2-p02": 6,
  "camera-emilia-romagna-p01": 5,
  "camera-emilia-romagna-p02": 7,
  "camera-emilia-romagna-p03": 6,
  "camera-friuli-venezia-giulia-p01": 5,
  "camera-lazio-1-p01": 5,
  "camera-lazio-1-p02": 5,
  "camera-lazio-1-p03": 5,
  "camera-lazio-2-p01": 3,
  "camera-lazio-2-p02": 4,
  "camera-liguria-p01": 6,
  "camera-lombardia-1-p01": 8,
  "camera-lombardia-1-p02": 8,
  "camera-lombardia-2-p01": 4,
  "camera-lombardia-2-p02": 5,
  "camera-lombardia-3-p01": 4,
  "camera-lombardia-3-p02": 5,
  "camera-lombardia-4-p01": 7,
  "camera-marche-p01": 6,
  "camera-molise-p01": 1,
  "camera-piemonte-1-p01": 5,
  "camera-piemonte-1-p02": 5,
  "camera-piemonte-2-p01": 4,
  "camera-piemonte-2-p02": 5,
  "camera-puglia-p01": 4,
  "camera-puglia-p02": 4,
  "camera-puglia-p03": 4,
  "camera-puglia-p04": 5,
  "camera-sardegna-p01": 7,
  "camera-sicilia-1-p01": 5,
  "camera-sicilia-1-p02": 4,
  "camera-sicilia-2-p01": 3,
  "camera-sicilia-2-p02": 4,
  "camera-sicilia-2-p03": 4,
  "camera-toscana-p01": 5,
  "camera-toscana-p02": 5,
  "camera-toscana-p03": 5,
  "camera-trentino-alto-adige-sudtirol-p01": 3,
  "camera-umbria-p01": 4,
  "camera-veneto-1-p01": 8,
  "camera-veneto-2-p01": 4,
  "camera-veneto-2-p02": 5,
  "camera-veneto-2-p03": 3,
  "senate-abruzzo-p01": 3,
  "senate-basilicata-p01": 2,
  "senate-calabria-p01": 4,
  "senate-campania-p01": 6,
  "senate-campania-p02": 5,
  "senate-emilia-romagna-p01": 4,
  "senate-emilia-romagna-p02": 5,
  "senate-friuli-venezia-giulia-p01": 3,
  "senate-lazio-p01": 6,
  "senate-lazio-p02": 6,
  "senate-liguria-p01": 3,
  "senate-lombardia-p01": 6,
  "senate-lombardia-p02": 8,
  "senate-lombardia-p03": 6,
  "senate-marche-p01": 3,
  "senate-molise-p01": 1,
  "senate-piemonte-p01": 4,
  "senate-piemonte-p02": 5,
  "senate-puglia-p01": 8,
  "senate-sardegna-p01": 3,
  "senate-sicilia-p01": 5,
  "senate-sicilia-p02": 5,
  "senate-toscana-p01": 8,
  "senate-umbria-p01": 2,
  "senate-veneto-p01": 5,
  "senate-veneto-p02": 6
};
