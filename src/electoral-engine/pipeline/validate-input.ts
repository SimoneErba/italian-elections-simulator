import type { ElectionInput } from "../domain/election";
import type { CalculationTraceEntry } from "../domain/trace";
import type { ForeignPartitionId } from "../../lib/elections/estero";
import { getLawVersion } from "../rules/registry";
import { specialTerritoryForMultiMemberDistrict } from "./special-territories";

export type ValidationResult = {
  ok: boolean;
  trace: CalculationTraceEntry[];
};

export function validateInput(input: ElectionInput): ValidationResult {
  const trace: CalculationTraceEntry[] = [];
  const law = getLawVersion(input.lawVersion);
  if (!law) {
    trace.push(blocking("law-version", `Versione legge non supportata: ${input.lawVersion}`));
  }

  const listIds = new Set(input.lists.map((list) => list.id));
  const coalitionIds = new Set(input.coalitions.map((coalition) => coalition.id));
  const districtIds = new Set(input.multiMemberDistricts.map((district) => district.id));
  const singleDistrictIds = new Set((input.singleMemberDistricts ?? []).map((district) => district.id));
  const allDistrictIds = new Set([...districtIds, ...singleDistrictIds]);
  const constituencyIds = new Set(input.constituencies.map((constituency) => constituency.id));
  const regionIds = new Set(input.regions.map((region) => region.id));
  const candidateIds = new Set((input.candidates ?? []).map((candidate) => candidate.id));

  checkDuplicateIds(input.lists, "lista", trace);
  checkDuplicateIds(input.coalitions, "coalizione", trace);
  checkDuplicateIds(input.regions, "regione", trace);
  checkDuplicateIds(input.constituencies, "circoscrizione", trace);
  checkDuplicateIds(input.multiMemberDistricts, "collegio plurinominale", trace);
  checkDuplicateIds(input.singleMemberDistricts ?? [], "collegio uninominale", trace);
  checkDuplicateIds(input.candidates ?? [], "candidato", trace);

  if (input.electionDate && !isValidIsoDate(input.electionDate)) {
    trace.push(blocking("election-date", `Data elezione non valida: ${input.electionDate}.`));
  }

  validateForeignElection(input, trace);

  for (const list of input.lists) {
    if (list.coalitionId && !coalitionIds.has(list.coalitionId)) {
      trace.push(blocking("coalitions", `La lista ${list.id} rimanda a una coalizione inesistente.`));
    }
    if (list.coalitionId && !input.coalitions.find((coalition) => coalition.id === list.coalitionId)?.listIds.includes(list.id)) {
      trace.push(blocking("coalitions", `La lista ${list.id} indica ${list.coalitionId}, ma non compare tra le liste della coalizione.`));
    }
  }

  for (const coalition of input.coalitions) {
    for (const listId of coalition.listIds) {
      if (!listIds.has(listId)) {
        trace.push(blocking("coalitions", `La coalizione ${coalition.id} contiene la lista inesistente ${listId}.`));
      }
      const list = input.lists.find((item) => item.id === listId);
      if (list && list.coalitionId !== coalition.id) {
        trace.push(blocking("coalitions", `La coalizione ${coalition.id} contiene ${listId}, ma la lista non indica la stessa coalizione.`));
      }
    }
  }

  for (const constituency of input.constituencies) {
    if (!regionIds.has(constituency.regionId)) {
      trace.push(blocking("territory", `La circoscrizione ${constituency.id} rimanda a una regione inesistente.`));
    }
  }

  for (const district of input.multiMemberDistricts) {
    const constituency = input.constituencies.find((item) => item.id === district.constituencyId);
    if (!constituencyIds.has(district.constituencyId)) {
      trace.push(blocking("territory", `Il collegio ${district.id} rimanda a una circoscrizione inesistente.`));
    }
    if (!regionIds.has(district.regionId)) {
      trace.push(blocking("territory", `Il collegio ${district.id} rimanda a una regione inesistente.`));
    }
    if (district.seatsWithBonus < 0 || district.seatsWithoutBonus < 0) {
      trace.push(blocking("territory", `Il collegio ${district.id} contiene seggi negativi.`));
    }
    if (constituency && constituency.chamber !== district.chamber) {
      trace.push(blocking("territory", `Il collegio ${district.id} non appartiene alla stessa Camera della circoscrizione.`));
    }
    if (constituency && constituency.regionId !== district.regionId) {
      trace.push(blocking("territory", `Il collegio ${district.id} e la circoscrizione indicano regioni diverse.`));
    }
  }

  for (const vote of input.listVotes) {
    const district = input.multiMemberDistricts.find((item) => item.id === vote.districtId);
    if (!listIds.has(vote.listId)) {
      trace.push(blocking("votes", `Voto per lista inesistente: ${vote.listId}.`));
    }
    if (!districtIds.has(vote.districtId)) {
      trace.push(blocking("votes", `Voto nel collegio inesistente: ${vote.districtId}.`));
    }
    if (vote.votes < 0n) {
      trace.push(blocking("votes", `Voto negativo per ${vote.listId} in ${vote.districtId}.`));
    }
    if (district && district.chamber !== vote.chamber) {
      trace.push(blocking("votes", `Il voto in ${vote.districtId} indica una Camera diversa dal collegio.`));
    }
  }

  for (const district of input.singleMemberDistricts ?? []) {
    const constituency = district.constituencyId
      ? input.constituencies.find((item) => item.id === district.constituencyId)
      : undefined;
    if (!regionIds.has(district.regionId)) {
      trace.push(blocking("territory", `Il collegio uninominale ${district.id} rimanda a una regione inesistente.`));
    }
    if (district.constituencyId && !constituencyIds.has(district.constituencyId)) {
      trace.push(blocking("territory", `Il collegio uninominale ${district.id} rimanda a una circoscrizione inesistente.`));
    }
    if (constituency && (constituency.chamber !== district.chamber || constituency.regionId !== district.regionId)) {
      trace.push(blocking("territory", `Il collegio uninominale ${district.id} non e coerente con la circoscrizione.`));
    }
  }

  for (const vote of input.candidateVotes ?? []) {
    const district = (input.singleMemberDistricts ?? []).find((item) => item.id === vote.districtId);
    if (!singleDistrictIds.has(vote.districtId)) {
      trace.push(blocking("candidate-votes", `Voto candidato nel collegio uninominale inesistente: ${vote.districtId}.`));
    }
    if (candidateIds.size > 0 && !candidateIds.has(vote.candidateId)) {
      trace.push(blocking("candidate-votes", `Voto per candidato inesistente: ${vote.candidateId}.`));
    }
    if (vote.votes < 0n) {
      trace.push(blocking("candidate-votes", `Voto candidato negativo per ${vote.candidateId} in ${vote.districtId}.`));
    }
    if (district && district.chamber !== vote.chamber) {
      trace.push(blocking("candidate-votes", `Il voto candidato in ${vote.districtId} indica una Camera diversa dal collegio.`));
    }
  }

  for (const nomination of input.nominations ?? []) {
    const district = nomination.districtId
      ? input.multiMemberDistricts.find((item) => item.id === nomination.districtId) ??
        (input.singleMemberDistricts ?? []).find((item) => item.id === nomination.districtId)
      : undefined;
    if (candidateIds.size > 0 && !candidateIds.has(nomination.candidateId)) {
      trace.push(blocking("nominations", `Candidatura per candidato inesistente: ${nomination.candidateId}.`));
    }
    if (!listIds.has(nomination.listId)) {
      trace.push(blocking("nominations", `Candidatura per lista inesistente: ${nomination.listId}.`));
    }
    if (
      nomination.connectedSubjectId &&
      !listIds.has(nomination.connectedSubjectId) &&
      !coalitionIds.has(nomination.connectedSubjectId)
    ) {
      trace.push(blocking("nominations", `Candidatura collegata a lista/coalizione inesistente: ${nomination.connectedSubjectId}.`));
    }
    if (nomination.districtId && !allDistrictIds.has(nomination.districtId)) {
      trace.push(blocking("nominations", `Candidatura nel collegio inesistente: ${nomination.districtId}.`));
    }
    if (nomination.constituencyId && !constituencyIds.has(nomination.constituencyId)) {
      trace.push(blocking("nominations", `Candidatura nella circoscrizione inesistente: ${nomination.constituencyId}.`));
    }
    if (district && district.chamber !== nomination.chamber) {
      trace.push(blocking("nominations", `La candidatura ${nomination.candidateId} indica una Camera diversa dal collegio.`));
    }
  }

  for (const chamber of ["camera", "senate"] as const) {
    const standardDistricts = input.multiMemberDistricts.filter(
      (district) => district.chamber === chamber && !specialTerritoryForMultiMemberDistrict(district)
    );
    if (law && standardDistricts.length > 0) {
      const withBonus = standardDistricts.reduce((sum, district) => sum + district.seatsWithBonus, 0);
      const withoutBonus = standardDistricts.reduce((sum, district) => sum + district.seatsWithoutBonus, 0);
      const expectedWithBonus = law.chamberRules[chamber].ordinarySeats - law.chamberRules[chamber].bonusSeats;
      const expectedWithoutBonus = law.chamberRules[chamber].ordinarySeats;
      if (law.hasGovernabilityBonus && (withBonus !== expectedWithBonus || withoutBonus !== expectedWithoutBonus)) {
        trace.push(
          blocking(
            "seat-table",
            `Tabella seggi ${chamber} non coerente: premio ${withBonus}/${expectedWithBonus}, senza premio ${withoutBonus}/${expectedWithoutBonus}.`
          )
        );
      }
      if (!law.hasGovernabilityBonus && withoutBonus !== expectedWithoutBonus) {
        trace.push(
          blocking(
            "seat-table",
            `Tabella seggi ${chamber} non coerente: proporzionale ${withoutBonus}/${expectedWithoutBonus}.`
          )
        );
      }
    }
    if (law && law.chamberRules[chamber].singleMemberSeats > 0) {
      const singleSeats = (input.singleMemberDistricts ?? [])
        .filter((district) => district.chamber === chamber)
        .reduce((sum, district) => sum + district.seats, 0);
      if (singleSeats > law.chamberRules[chamber].singleMemberSeats) {
        trace.push(
          blocking(
            "seat-table",
            `Tabella collegi uninominali ${chamber} non coerente: ${singleSeats}/${law.chamberRules[chamber].singleMemberSeats}.`
          )
        );
      }
    }
    const chamberVotes = input.listVotes
      .filter((vote) => vote.chamber === chamber)
      .reduce((sum, vote) => sum + vote.votes, 0n);
    if (chamberVotes <= 0n) trace.push(blocking("votes", `Nessun voto positivo disponibile per ${chamber}.`));
  }

  const chambers = new Set(input.multiMemberDistricts.map((district) => district.chamber));
  if (!chambers.has("camera")) trace.push(blocking("chambers", "Dati Camera mancanti."));
  if (!chambers.has("senate")) trace.push(blocking("chambers", "Dati Senato mancanti."));

  if (trace.length === 0) {
    trace.push({
      id: "validation-ok",
      stage: "validazione",
      ruleReference: "legal-spec/ac-2822-a.md#input-validation",
      level: "info",
      message: "Validazione superata."
    });
  }

  return { ok: trace.every((entry) => entry.level !== "blocking"), trace };
}

function blocking(stage: string, message: string): CalculationTraceEntry {
  return {
    id: `validation-${stage}-${message}`,
    stage: "validazione",
    ruleReference: "legal-spec/ac-2822-a.md#input-validation",
    level: "blocking",
    message
  };
}

function checkDuplicateIds(
  values: Array<{ id: string }>,
  label: string,
  trace: CalculationTraceEntry[]
) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) trace.push(blocking("duplicate-ids", `ID duplicato per ${label}: ${value.id}.`));
    seen.add(value.id);
  }
}

function validateForeignElection(input: ElectionInput, trace: CalculationTraceEntry[]) {
  if (!input.foreignElection) {
    trace.push(blocking("foreign-election", "Dati Estero mancanti: la legislazione completa richiede la circoscrizione Estero."));
    return;
  }
  const expectedPartitionIds: ForeignPartitionId[] = [
    "EUROPA",
    "AMERICA_MERIDIONALE",
    "AMERICA_SETTENTRIONALE_CENTRALE",
    "AFRICA_ASIA_OCEANIA_ANTARTIDE"
  ];
  const expectedSeats = { camera: 8, senato: 4 };
  for (const chamberId of ["camera", "senato"] as const) {
    const chamber = input.foreignElection.chambers[chamberId];
    if (!chamber) {
      trace.push(blocking("foreign-election", `Dati Estero mancanti per ${chamberId}.`));
      continue;
    }
    if (chamber.total_seats !== expectedSeats[chamberId]) {
      trace.push(blocking("foreign-election", `Totale seggi Estero ${chamberId} non coerente: ${chamber.total_seats}/${expectedSeats[chamberId]}.`));
    }
    const partitionIds = new Set(chamber.partitions.map((partition) => partition.id));
    for (const partitionId of expectedPartitionIds) {
      if (!partitionIds.has(partitionId)) {
        trace.push(blocking("foreign-election", `Ripartizione Estero mancante per ${chamberId}: ${partitionId}.`));
      }
    }
    const partitionSeats = chamber.partitions.reduce((sum, partition) => sum + partition.seats, 0);
    if (partitionSeats !== chamber.total_seats) {
      trace.push(blocking("foreign-election", `Somma seggi ripartizioni Estero ${chamberId} non coerente: ${partitionSeats}/${chamber.total_seats}.`));
    }
  }
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
