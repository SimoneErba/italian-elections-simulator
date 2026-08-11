import type { Chamber } from "../../electoral-engine/domain/chamber";
import type { BonusCandidatePriority, Candidate, CandidateNomination, ElectionInput } from "../../electoral-engine/domain/election";
import { officialDistrictSeatCapacity } from "../../electoral-engine/rules/ac-2822-a/territorial-seats";
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
  CODTIPOELEZIONE: string;
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
    const specialTerritory = chamber === "camera" && regionId(constituencyName) === "trentino-alto-adige-sudtirol"
      ? "trentino-alto-adige" as const
      : undefined;
    const capacity = officialDistrictSeatCapacity(id);
    if (!capacity && !specialTerritory) {
      throw new Error(`Tabella seggi ufficiale mancante per ${id}.`);
    }
    return {
      id,
      chamber,
      constituencyId: constituencyId(chamber, constituencyName),
      regionId: regionId(constituencyName),
      name: districtName,
      seatsWithBonus: capacity?.withBonus ?? 3,
      seatsWithoutBonus: capacity?.withoutBonus ?? 3,
      specialTerritory
    };
  });

  const voteTotals = new Map<string, bigint>();
  for (const row of allRows) {
    const key = `${row.chamber}|${districtId(row.chamber, row["COLLEGIO PLURINOMINALE"])}|${listId(row.LISTA)}`;
    voteTotals.set(key, (voteTotals.get(key) ?? 0n) + BigInt(normalizeInteger(row["VOTI LISTE"])));
  }
  const listVotes = [...voteTotals.entries()].map(([key, votes]) => {
    const [chamber, rowDistrictId, rowListId] = key.split("|") as [Chamber, string, string];
    return { chamber, districtId: rowDistrictId, listId: rowListId, votes };
  });
  const nominationBundle = loadCandidateListFiles(files.cameraCandidateListCsv, files.senateCandidateListCsv);
  const bonusNominations = files.bonusNominationsCsv ? loadBonusNominationsCsv(files.bonusNominationsCsv) : [];
  const bonusCandidateBundle = files.bonusCandidateListsCsv ? loadBonusCandidateListsCsv(files.bonusCandidateListsCsv) : { candidates: [], priorities: [] };

  return {
    schemaVersion: "1.0",
    lawVersion: "ac-2822-a-2026-07-16",
    lists,
    coalitions,
    regions,
    constituencies,
    multiMemberDistricts,
    listVotes,
    candidates:
      nominationBundle.candidates.length > 0 || bonusCandidateBundle.candidates.length > 0
        ? mergeCandidates(nominationBundle.candidates, bonusCandidateBundle.candidates)
        : undefined,
    nominations:
      nominationBundle.nominations.length > 0 || bonusNominations.length > 0
        ? [...nominationBundle.nominations, ...bonusNominations]
        : undefined,
    bonusCandidateLists: bonusCandidateBundle.priorities.length > 0 ? bonusCandidateBundle.priorities : undefined,
    foreignElection: loadForeignElectionJson(files.foreignElectionJson)
  };
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
    ...(cameraCsv ? parseDelimited(cameraCsv).map((row) => ({ row: row as CandidateListRow, chamber: "camera" as const })) : []),
    ...(senateCsv ? parseDelimited(senateCsv).map((row) => ({ row: row as CandidateListRow, chamber: "senate" as const })) : [])
  ];
  const candidatesById = new Map<string, Candidate>();
  const nominations: CandidateNomination[] = [];
  const positions = new Map<string, number>();

  for (const { row, chamber } of rows) {
    const listName = normalizeListName(row.descrlista ?? "");
    const districtName = row.CollPlurinom ?? "";
    const lastName = normalizePersonPart(row.cognome ?? "");
    const firstName = normalizePersonPart(row.nome ?? "");
    const birthDate = normalizePersonPart(row.datanascita ?? "");
    if (!listName || !districtName || !lastName || !firstName) continue;

    const candidateId = candidateIdFor(chamber, listName, lastName, firstName, birthDate);
    candidatesById.set(candidateId, {
      id: candidateId,
      firstName,
      lastName,
      birthYear: parseBirthYear(birthDate),
      party: listId(listName)
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

function parseBirthYear(value: string): number | undefined {
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function mergeCandidates(...groups: Candidate[][]): Candidate[] {
  return [...new Map(groups.flat().map((candidate) => [candidate.id, candidate])).values()];
}

function normalizeScrutiniRow(row: Record<string, string>): OnDataScrutiniRow {
  return {
    "TIPO ELEZIONE": row["TIPO ELEZIONE"] ?? "",
    "COLLEGIO PLURINOMINALE": row["COLLEGIO PLURINOMINALE"] ?? "",
    "COLLEGIO UNINOMINALE": row["COLLEGIO UNINOMINALE"] ?? "",
    CIRCOSCRIZIONE: row.CIRCOSCRIZIONE ?? "",
    COGNOME: row.COGNOME ?? "",
    NOME: row.NOME ?? "",
    LISTA: normalizeListName(row.LISTA ?? ""),
    "VOTI LISTE": row["VOTI LISTE"] ?? "0"
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

function constituencyId(chamber: Chamber, name: string): string {
  return slug(`${chamber}-${name}`);
}

function regionId(name: string): string {
  return slug(name.replace(/\s+\d+$/, ""));
}

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
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

function normalizePersonPart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function minorityMetadata(name: string) {
  if (normalizeKey(name).includes("SUDTIROLER VOLKSPARTEI")) {
    return { isLinguisticMinority: true, protectedRegionId: "trentino-alto-adige" };
  }
  return {};
}
