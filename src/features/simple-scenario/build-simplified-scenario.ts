import type { Chamber } from "../../electoral-engine/domain/chamber";
import type { Candidate, CandidateNomination, ElectionInput, ListVoteRecord } from "../../electoral-engine/domain/election";
import type { ForeignElectionData } from "../../lib/elections/estero";
import { defaultForeignElection2022 } from "../../lib/elections/estero/default2022";
import type { SimplifiedScenarioRequest } from "./types";

const HUNDREDTHS = 10_000;

/**
 * Converts percentage input into a complete, anonymous election input.  The
 * 2022 geography and each district's historic valid-vote volume are retained;
 * only political data are generated here.
 */
export function buildSimplifiedScenarioFromGeography(request: SimplifiedScenarioRequest, geography: ElectionInput): ElectionInput {
  validateRequest(request);
  const coalitionByList = new Map(request.coalitions.flatMap((coalition) => coalition.listIds.map((listId) => [listId, coalition.id])));
  const lists = request.lists.map((list) => ({ id: list.id, name: list.name, coalitionId: coalitionByList.get(list.id) }));
  const coalitions = request.coalitions.map((coalition) => ({ ...coalition, listIds: [...coalition.listIds] }));
  const listVotes = projectVotes(geography, request);
  const technical = buildTechnicalCandidates(geography, lists, coalitions, listVotes);

  return {
    schemaVersion: "1.0",
    lawVersion: "rosatellum-2022",
    electionDate: "2026-08-18",
    lists,
    coalitions,
    regions: geography.regions,
    constituencies: geography.constituencies,
    multiMemberDistricts: geography.multiMemberDistricts,
    singleMemberDistricts: geography.singleMemberDistricts,
    listVotes,
    candidateVotes: technical.candidateVotes,
    candidates: technical.candidates,
    nominations: technical.nominations,
    bonusCandidateLists: technical.bonusCandidateLists,
    foreignElection: buildForeignElection(request),
    coverageWarnings: ["Scenario a percentuali: distribuzione territoriale tecnica basata sui volumi di voto validi del 2022."]
  };
}

function validateRequest(request: SimplifiedScenarioRequest) {
  const total = request.lists.reduce((sum, list) => sum + list.percentage, 0);
  if (total !== HUNDREDTHS) throw new Error("Le percentuali devono sommare esattamente 100,00%.");
  if (!request.lists.length || request.lists.some((list) => !list.id || !list.name.trim() || !Number.isInteger(list.percentage) || list.percentage < 0)) {
    throw new Error("Liste o percentuali non valide.");
  }
  const listIds = new Set(request.lists.map((list) => list.id));
  if (listIds.size !== request.lists.length) throw new Error("Ogni lista deve avere un identificativo distinto.");
  const assigned = new Set<string>();
  for (const coalition of request.coalitions) {
    if (!coalition.id || !coalition.name.trim()) throw new Error("Coalizione non valida.");
    for (const listId of coalition.listIds) {
      if (!listIds.has(listId) || assigned.has(listId)) throw new Error("Ogni lista può appartenere a una sola coalizione.");
      assigned.add(listId);
    }
  }
}

function projectVotes(geography: ElectionInput, request: SimplifiedScenarioRequest): ListVoteRecord[] {
  const historicalTotals = new Map<string, bigint>();
  for (const vote of geography.listVotes) {
    const key = `${vote.chamber}|${vote.districtId}`;
    historicalTotals.set(key, (historicalTotals.get(key) ?? 0n) + vote.votes);
  }
  const records: ListVoteRecord[] = [];
  for (const district of geography.multiMemberDistricts) {
    const total = historicalTotals.get(`${district.chamber}|${district.id}`) ?? 0n;
    const allocated = allocatePercentageVotes(total, request.lists);
    for (const list of request.lists) records.push({ chamber: district.chamber, districtId: district.id, listId: list.id, votes: allocated.get(list.id) ?? 0n });
  }
  return records;
}

/** Largest remainders ensure that every historical district total is conserved exactly. */
function allocatePercentageVotes(total: bigint, lists: SimplifiedScenarioRequest["lists"]): Map<string, bigint> {
  const allocations = lists.map((list) => {
    const numerator = total * BigInt(list.percentage);
    return { id: list.id, votes: numerator / BigInt(HUNDREDTHS), remainder: numerator % BigInt(HUNDREDTHS) };
  });
  let remaining = total - allocations.reduce((sum, item) => sum + item.votes, 0n);
  for (const entry of [...allocations].sort((a, b) => b.remainder === a.remainder ? a.id.localeCompare(b.id) : b.remainder > a.remainder ? 1 : -1)) {
    if (remaining <= 0n) break;
    entry.votes += 1n;
    remaining -= 1n;
  }
  return new Map(allocations.map((entry) => [entry.id, entry.votes]));
}

function buildTechnicalCandidates(
  geography: ElectionInput,
  lists: ElectionInput["lists"],
  coalitions: ElectionInput["coalitions"],
  votes: ListVoteRecord[]
) {
  const candidates: Candidate[] = [];
  const nominations: CandidateNomination[] = [];
  const candidateVotes: NonNullable<ElectionInput["candidateVotes"]> = [];
  const bonusCandidateLists: NonNullable<ElectionInput["bonusCandidateLists"]> = [];
  const votesByDistrict = new Map(votes.map((vote) => [`${vote.chamber}|${vote.districtId}|${vote.listId}`, vote.votes]));

  for (const district of geography.multiMemberDistricts) {
    // Enough for every 2022 district after the law-specific capacity map,
    // without ever reusing a historic name or candidate-order file.
    const count = Math.max(15, district.seatsWithoutBonus + 2);
    for (const list of lists) for (let position = 1; position <= count; position += 1) {
      const id = `technical-mm-${district.id}-${list.id}-${position}`;
      candidates.push(technicalCandidate(id));
      nominations.push({ candidateId: id, chamber: district.chamber, listId: list.id, districtId: district.id, constituencyId: district.constituencyId, position, nominationType: "multi-member" });
    }
  }

  const subjectLists = new Map<string, string[]>();
  for (const list of lists) {
    const subject = list.coalitionId ?? list.id;
    subjectLists.set(subject, [...(subjectLists.get(subject) ?? []), list.id]);
  }
  for (const district of geography.singleMemberDistricts ?? []) {
    for (const [subjectId, memberLists] of subjectLists) {
      const id = `technical-sm-${district.id}-${subjectId}`;
      candidates.push(technicalCandidate(id));
      nominations.push({ candidateId: id, chamber: district.chamber, listId: memberLists[0], connectedSubjectId: subjectId, districtId: district.id, constituencyId: district.constituencyId, position: 1, nominationType: "single-member" });
      const voteTotal = district.multiMemberDistrictId
        ? memberLists.reduce((sum, listId) => sum + (votesByDistrict.get(`${district.chamber}|${district.multiMemberDistrictId}|${listId}`) ?? 0n), 0n)
        : memberLists.reduce((sum, listId) => sum + votes.filter((vote) => vote.chamber === district.chamber && vote.listId === listId).reduce((inner, vote) => inner + vote.votes, 0n), 0n);
      candidateVotes.push({ chamber: district.chamber, districtId: district.id, candidateId: id, votes: voteTotal });
    }
  }

  const bonusSubjects = [...new Set([...coalitions.map((coalition) => coalition.id), ...lists.filter((list) => !list.coalitionId).map((list) => list.id)])];
  for (const chamber of ["camera", "senate"] satisfies Chamber[]) {
    const amount = chamber === "camera" ? 70 : 35;
    for (const subjectId of bonusSubjects) for (let position = 1; position <= amount; position += 1) {
      const id = `technical-bonus-${chamber}-${subjectId}-${position}`;
      candidates.push(technicalCandidate(id));
      bonusCandidateLists.push({ candidateId: id, chamber, connectedSubjectId: subjectId, position });
    }
  }
  return { candidates, nominations, candidateVotes, bonusCandidateLists };
}

function technicalCandidate(id: string): Candidate {
  return { id, firstName: "Candidato", lastName: "tecnico" };
}

function buildForeignElection(request: SimplifiedScenarioRequest): ForeignElectionData {
  const template = defaultForeignElection2022();
  return {
    ...template,
    chambers: {
      camera: buildForeignChamber(template.chambers.camera, request),
      senato: buildForeignChamber(template.chambers.senato, request)
    }
  };
}

function buildForeignChamber(chamber: ForeignElectionData["chambers"]["camera"], request: SimplifiedScenarioRequest) {
  return {
    ...chamber,
    partitions: chamber.partitions.map((partition) => ({
      ...partition,
      lists: request.lists.map((list) => ({
        id: list.id,
        name: list.name,
        votes: Math.round((partition.resident_citizens * list.percentage) / HUNDREDTHS),
        candidates: Array.from({ length: Math.max(2, partition.seats + 1) }, (_, index) => ({ id: `technical-foreign-${partition.id}-${list.id}-${index + 1}`, name: "Candidato tecnico", preferences: index + 1, list_position: index + 1 }))
      }))
    }))
  };
}
