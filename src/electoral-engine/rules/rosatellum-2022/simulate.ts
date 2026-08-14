import type { Chamber } from "../../domain/chamber";
import type {
  AllocationLedger,
  ElectionInput,
  ElectionSimulationResult,
  NationalResult,
  TerritorialSeatResult,
  ThresholdResult,
  UnifiedElectedMember
} from "../../domain/election";
import type { CalculationTraceEntry, TieResolutionRequired } from "../../domain/trace";
import { aggregateVotes, type ChamberVoteTotals } from "../../pipeline/aggregate-votes";
import { allocateSpecialTerritories } from "../../pipeline/allocate-special-territories";
import { calculateThresholds } from "../../pipeline/calculate-thresholds";
import { allocateByHare } from "../../pipeline/proportional-allocation";
import { calculateForeignSeats } from "../../../lib/elections/estero";
import { percentage } from "../../arithmetic/fraction";
import { allocateTerritorialMatrix } from "./allocation-matrix";
import { proclaimRosatellum2022 } from "./proclaim";

export function simulateRosatellum2022(input: ElectionInput): ElectionSimulationResult {
  const totals = aggregateVotes(input);
  const thresholds = {
    camera: calculateThresholds("camera", input, totals.camera),
    senate: calculateThresholds("senate", input, totals.senate)
  };
  const ties: TieResolutionRequired[] = [];
  const trace: CalculationTraceEntry[] = [];
  for (const warning of input.coverageWarnings ?? []) {
    trace.push({ id: `coverage-${trace.length + 1}`, stage: "copertura input", ruleReference: "dataset 2022", level: "warning", message: warning });
  }
  const special = allocateSpecialTerritories(input);
  ties.push(...special.ties);

  const camera = allocateCamera(input, totals.camera, thresholds.camera);
  const senate = allocateSenate(input, totals.senate, thresholds.senate);
  ties.push(...camera.ties, ...senate.ties);
  const territorialResults = [
    ...special.territorialResults,
    ...camera.results,
    ...senate.results
  ];
  const candidates = proclaimRosatellum2022(input, territorialResults);
  ties.push(...candidates.ties);

  const foreignResults = {
    camera: calculateForeignSeats("camera", input.foreignElection.chambers.camera),
    senato: calculateForeignSeats("senato", input.foreignElection.chambers.senato)
  };
  ties.push(...foreignResults.camera.ties, ...foreignResults.senato.ties);

  trace.push(
    stageTrace("rosatellum-votes", "preparazione voti", "Articolo 77", {
      camera: totals.camera.totalValidVotes.toString(),
      senate: totals.senate.totalValidVotes.toString()
    }),
    stageTrace("rosatellum-thresholds", "soglie", "Articolo 83; articolo 16-bis", thresholds),
    stageTrace("rosatellum-camera", "riparto Camera", "Articoli 83 e 83-bis", camera.results),
    stageTrace("rosatellum-senate", "riparto Senato", "Articolo 17", senate.results),
    stageTrace("rosatellum-proclamation", "proclamazione", "Articoli 84, 85 e 17-bis", {
      domestic: candidates.elected.length,
      foreign: foreignResults.camera.electedCandidates.length + foreignResults.senato.electedCandidates.length
    })
  );

  const nationalResults = {
    camera: mergeSingleMemberSeats(camera.national, special.territorialResults, "camera"),
    senate: mergeSingleMemberSeats(senate.national, special.territorialResults, "senate")
  };
  const allElectedCandidates = unifiedMembers(input, candidates.elected, foreignResults);
  return {
    lawVersion: "rosatellum-2022",
    bonus: { awarded: false, failedConditions: ["La legge elettorale non prevede un premio di governabilita."] },
    thresholds,
    nationalResults,
    foreignResults,
    bonusSeatAllocations: { camera: undefined, senate: undefined },
    territorialResults,
    electedCandidates: candidates.elected,
    allElectedCandidates,
    seatTrace: [...special.seatTrace, ...candidates.seatTrace],
    trace,
    ties
  };
}

function allocateCamera(input: ElectionInput, totals: ChamberVoteTotals, thresholds: ThresholdResult) {
  const ties: TieResolutionRequired[] = [];
  const national = nationalSubjectAllocation("camera", input, totals, thresholds, 245, ties);
  const listTargets = expandNationalCoalitions(input, totals, thresholds, national.ordinarySeats, ties);
  const constituencyIds = input.constituencies.filter((item) => item.chamber === "camera").map((item) => item.id);
  const capacities: Record<string, number> = {};
  for (const id of constituencyIds) {
    const seats = districtCapacity(input, "camera", "constituencyId", id);
    if (seats > 0) capacities[id] = seats;
  }
  const subjectVotes = votesByParent(input, "camera", "constituencyId", Object.keys(national.ordinarySeats), thresholds, true);
  const subjects = allocateTerritorialMatrix("Camera articolo 83, lettera h)", capacities, subjectVotes, national.ordinarySeats, national.votes);

  const listSeatsByParent: Record<string, Record<string, number>> = Object.fromEntries(Object.keys(capacities).map((id) => [id, {}]));
  const listLedgers: AllocationLedger[] = [];
  for (const listId of thresholds.admittedSingleLists) {
    for (const parentId of Object.keys(capacities)) {
      listSeatsByParent[parentId][listId] = subjects.seats[parentId]?.[listId] ?? 0;
    }
  }
  for (const coalition of input.coalitions.filter((item) => thresholds.admittedCoalitions.includes(item.id))) {
    const coalitionCapacities = Object.fromEntries(Object.keys(capacities).map((id) => [id, subjects.seats[id]?.[coalition.id] ?? 0]));
    const admittedLists = thresholds.admittedCoalitionLists[coalition.id] ?? [];
    const coalitionVotes = votesByParent(input, "camera", "constituencyId", admittedLists, thresholds, false);
    const targets = Object.fromEntries(admittedLists.map((id) => [id, listTargets[id] ?? 0]));
    const allocation = allocateTerritorialMatrix(
      `Camera articolo 83, lettera i) ${coalition.id}`,
      coalitionCapacities,
      coalitionVotes,
      targets,
      totals.listVotes
    );
    assertSeatTargets(allocation.seats, targets, `Camera liste ${coalition.id}`);
    listLedgers.push(allocation.ledger);
    for (const parentId of Object.keys(capacities)) Object.assign(listSeatsByParent[parentId], allocation.seats[parentId]);
  }

  const results: TerritorialSeatResult[] = Object.entries(listSeatsByParent).map(([territoryId, seats]) => ({
    chamber: "camera",
    scope: "constituency",
    territoryId,
    seats,
    allocationLedger: mergeAllocationLedgers(`Camera articolo 83, lettere h/i) ${territoryId}`, territoryId, [subjects.ledger, ...listLedgers])
  }));
  results.push(...allocateDistricts(input, "camera", "constituencyId", listSeatsByParent, totals.listVotes));
  return { results, ties, national };
}

function mergeAllocationLedgers(stage: string, territoryId: string, ledgers: AllocationLedger[]): AllocationLedger {
  return {
    stage,
    cells: ledgers.flatMap((ledger) => ledger.cells.filter((cell) => cell.territoryId === territoryId)),
    transfers: ledgers.flatMap((ledger) => ledger.transfers)
  };
}

function allocateSenate(input: ElectionInput, totals: ChamberVoteTotals, thresholds: ThresholdResult) {
  const ties: TieResolutionRequired[] = [];
  const subjects = admittedSubjects(thresholds);
  const regionIds = input.regions.map((region) => region.id);
  const regionVotes = votesByParent(input, "senate", "regionId", subjects, thresholds, true);
  const results: TerritorialSeatResult[] = [];
  const nationalSubjectSeats: Record<string, number> = {};
  const nationalListSeats: Record<string, number> = {};

  for (const regionId of regionIds) {
    const seats = districtCapacity(input, "senate", "regionId", regionId);
    if (seats <= 0) continue;
    const allocation = allocateByHare(
      regionVotes[regionId] ?? {},
      seats,
      `ripartizione regionale Senato ${regionId}`,
      "D.lgs. 533/1993 articolo 17, lettera a)",
      "regional"
    );
    ties.push(...allocation.ties);
    addSeats(nationalSubjectSeats, allocation.seats);
    const listSeats: Record<string, number> = {};
    for (const listId of thresholds.admittedSingleLists) listSeats[listId] = allocation.seats[listId] ?? 0;
    for (const coalition of input.coalitions.filter((item) => thresholds.admittedCoalitions.includes(item.id))) {
      const coalitionSeats = allocation.seats[coalition.id] ?? 0;
      if (coalitionSeats <= 0) continue;
      const admittedLists = (thresholds.admittedCoalitionLists[coalition.id] ?? []).filter((listId) => senateListQualifiesInRegion(input, totals, listId, regionId));
      const listVotes = Object.fromEntries(admittedLists.map((listId) => [listId, votesForListInParent(input, "senate", listId, "regionId", regionId)]));
      const listAllocation = allocateByHare(listVotes, coalitionSeats, `riparto liste Senato ${regionId} ${coalition.id}`, "D.lgs. 533/1993 articolo 17, lettera b)", "regional");
      ties.push(...listAllocation.ties);
      addSeats(listSeats, listAllocation.seats);
    }
    addSeats(nationalListSeats, listSeats);
    results.push({ chamber: "senate", scope: "region", territoryId: regionId, seats: listSeats });
  }

  const parentTargets = Object.fromEntries(results.map((result) => [result.territoryId, result.seats]));
  results.push(...allocateDistricts(input, "senate", "regionId", parentTargets, totals.listVotes));
  const national = nationalResultFromSeats("senate", totals, nationalSubjectSeats, 122);
  return { results, ties, national };
}

function nationalSubjectAllocation(
  chamber: Chamber,
  input: ElectionInput,
  totals: ChamberVoteTotals,
  thresholds: ThresholdResult,
  seats: number,
  ties: TieResolutionRequired[]
): NationalResult {
  const subjectIds = admittedSubjects(thresholds);
  const votes = Object.fromEntries(subjectIds.map((id) => [id, totals.subjectVotes[id] ?? 0n]));
  const allocation = allocateByHare(votes, seats, `ripartizione nazionale ${chamber}`, "D.P.R. 361/1957 articolo 83, lettera f)");
  ties.push(...allocation.ties);
  return {
    chamber,
    totalValidVotes: totals.totalValidVotes,
    seats: allocation.seats,
    ordinarySeats: allocation.seats,
    votes,
    percentages: Object.fromEntries(Object.entries(votes).map(([id, value]) => [id, percentage(value, totals.totalValidVotes)])),
    allocation: {
      chamber,
      availableSeats: seats,
      subjects: Object.entries(votes).map(([id, value]) => ({ id, kind: input.coalitions.some((coalition) => coalition.id === id) ? "coalition" : "list", votes: value })),
      quotient: allocation.quotient,
      integerSeats: allocation.integerSeats,
      remainderSeats: allocation.remainderSeats
    }
  };
}

function expandNationalCoalitions(
  input: ElectionInput,
  totals: ChamberVoteTotals,
  thresholds: ThresholdResult,
  subjectSeats: Record<string, number>,
  ties: TieResolutionRequired[]
): Record<string, number> {
  const seats: Record<string, number> = {};
  for (const listId of thresholds.admittedSingleLists) seats[listId] = subjectSeats[listId] ?? 0;
  for (const coalitionId of thresholds.admittedCoalitions) {
    const coalitionSeats = subjectSeats[coalitionId] ?? 0;
    if (coalitionSeats <= 0) continue;
    const lists = thresholds.admittedCoalitionLists[coalitionId] ?? [];
    const votes = Object.fromEntries(lists.map((id) => [id, totals.listVotes[id] ?? 0n]));
    const allocation = allocateByHare(votes, coalitionSeats, `riparto nazionale liste ${coalitionId}`, "D.P.R. 361/1957 articolo 83, lettera g)");
    ties.push(...allocation.ties);
    addSeats(seats, allocation.seats);
  }
  return seats;
}

function allocateDistricts(
  input: ElectionInput,
  chamber: Chamber,
  parentKey: "constituencyId" | "regionId",
  parentTargets: Record<string, Record<string, number>>,
  tieVotes: Record<string, bigint>
): TerritorialSeatResult[] {
  const results: TerritorialSeatResult[] = [];
  const allAdmittedLists = [...new Set(Object.values(parentTargets).flatMap((targets) => Object.keys(targets)))];
  for (const [parentId, targets] of Object.entries(parentTargets)) {
    const districts = input.multiMemberDistricts.filter((district) => district.chamber === chamber && district[parentKey] === parentId);
    if (districts.length === 0) continue;
    const capacities = Object.fromEntries(districts.map((district) => [district.id, district.seatsWithoutBonus]));
    const votes = Object.fromEntries(districts.map((district) => [district.id, Object.fromEntries(Object.keys(targets).map((listId) => [listId, votesForListInDistrict(input, chamber, listId, district.id)]))]));
    const quotientTotals = Object.fromEntries(districts.map((district) => [
      district.id,
      allAdmittedLists.reduce((sum, listId) => sum + votesForListInDistrict(input, chamber, listId, district.id), 0n)
    ]));
    const allocation = allocateTerritorialMatrix(
      chamber === "camera" ? `Camera articolo 83-bis ${parentId}` : `Senato articolo 17, lettera c) ${parentId}`,
      capacities,
      votes,
      targets,
      tieVotes,
      "district",
      quotientTotals
    );
    for (const district of districts) results.push({
      chamber,
      scope: "district",
      territoryId: district.id,
      seats: allocation.seats[district.id] ?? {},
      allocationLedger: allocation.ledger
    });
  }
  return results;
}

function admittedSubjects(thresholds: ThresholdResult): string[] {
  return [...thresholds.admittedCoalitions, ...thresholds.admittedSingleLists];
}

function votesByParent(
  input: ElectionInput,
  chamber: Chamber,
  parentKey: "constituencyId" | "regionId",
  subjectIds: string[],
  thresholds: ThresholdResult,
  coalitionSubjects: boolean
): Record<string, Record<string, bigint>> {
  const result: Record<string, Record<string, bigint>> = {};
  for (const district of input.multiMemberDistricts.filter((item) => item.chamber === chamber)) {
    const parentId = district[parentKey];
    result[parentId] = result[parentId] ?? {};
    for (const subjectId of subjectIds) result[parentId][subjectId] = result[parentId][subjectId] ?? 0n;
    for (const vote of input.listVotes.filter((item) => item.chamber === chamber && item.districtId === district.id)) {
      let subjectId = vote.listId;
      if (coalitionSubjects) {
        const list = input.lists.find((item) => item.id === vote.listId);
        if (list?.coalitionId && thresholds.admittedCoalitions.includes(list.coalitionId) && coalitionListCounts(input, chamber, vote.listId)) subjectId = list.coalitionId;
      }
      if (subjectIds.includes(subjectId)) result[parentId][subjectId] = (result[parentId][subjectId] ?? 0n) + vote.votes;
    }
  }
  return result;
}

function coalitionListCounts(input: ElectionInput, chamber: Chamber, listId: string): boolean {
  const list = input.lists.find((item) => item.id === listId);
  if (list?.isLinguisticMinority) return true;
  const listVotes = input.listVotes.filter((vote) => vote.chamber === chamber && vote.listId === listId).reduce((sum, vote) => sum + vote.votes, 0n);
  const allVotes = input.listVotes.filter((vote) => vote.chamber === chamber).reduce((sum, vote) => sum + vote.votes, 0n);
  return listVotes * 100n >= allVotes;
}

function senateListQualifiesInRegion(input: ElectionInput, totals: ChamberVoteTotals, listId: string, regionId: string): boolean {
  if ((totals.listVotes[listId] ?? 0n) * 100n >= totals.totalValidVotes * 3n) return true;
  const listVotes = votesForListInParent(input, "senate", listId, "regionId", regionId);
  const regionVotes = input.multiMemberDistricts
    .filter((district) => district.chamber === "senate" && district.regionId === regionId)
    .flatMap((district) => input.listVotes.filter((vote) => vote.chamber === "senate" && vote.districtId === district.id))
    .reduce((sum, vote) => sum + vote.votes, 0n);
  return listVotes * 100n >= regionVotes * 20n;
}

function districtCapacity(input: ElectionInput, chamber: Chamber, key: "constituencyId" | "regionId", id: string): number {
  return input.multiMemberDistricts.filter((district) => district.chamber === chamber && district[key] === id).reduce((sum, district) => sum + district.seatsWithoutBonus, 0);
}

function votesForListInParent(input: ElectionInput, chamber: Chamber, listId: string, key: "constituencyId" | "regionId", id: string): bigint {
  const districts = new Set(input.multiMemberDistricts.filter((district) => district.chamber === chamber && district[key] === id).map((district) => district.id));
  return input.listVotes.filter((vote) => vote.chamber === chamber && vote.listId === listId && districts.has(vote.districtId)).reduce((sum, vote) => sum + vote.votes, 0n);
}

function votesForListInDistrict(input: ElectionInput, chamber: Chamber, listId: string, districtId: string): bigint {
  return input.listVotes.filter((vote) => vote.chamber === chamber && vote.listId === listId && vote.districtId === districtId).reduce((sum, vote) => sum + vote.votes, 0n);
}

function addSeats(target: Record<string, number>, source: Record<string, number>) {
  for (const [id, seats] of Object.entries(source)) target[id] = (target[id] ?? 0) + seats;
}

function assertSeatTargets(matrix: Record<string, Record<string, number>>, targets: Record<string, number>, stage: string) {
  const actual: Record<string, number> = {};
  for (const seats of Object.values(matrix)) addSeats(actual, seats);
  const mismatch = Object.keys(targets).filter((id) => (actual[id] ?? 0) !== targets[id]);
  if (mismatch.length > 0) {
    throw new Error(`${stage}: obiettivi non conservati: ${mismatch.map((id) => `${id} ${actual[id] ?? 0}/${targets[id]}`).join(", ")}`);
  }
}

function nationalResultFromSeats(chamber: Chamber, totals: ChamberVoteTotals, seats: Record<string, number>, availableSeats: number): NationalResult {
  const votes = Object.fromEntries(Object.keys(seats).map((id) => [id, totals.subjectVotes[id] ?? 0n]));
  return {
    chamber,
    totalValidVotes: totals.totalValidVotes,
    seats,
    ordinarySeats: seats,
    votes,
    percentages: Object.fromEntries(Object.entries(votes).map(([id, value]) => [id, percentage(value, totals.totalValidVotes)])),
    allocation: { chamber, availableSeats, subjects: [], quotient: { numerator: 0n, denominator: 1n }, integerSeats: {}, remainderSeats: {} }
  };
}

function mergeSingleMemberSeats(national: NationalResult, territorial: TerritorialSeatResult[], chamber: Chamber): NationalResult {
  const seats = { ...national.ordinarySeats };
  for (const result of territorial.filter((item) => item.chamber === chamber && item.scope === "single-member")) addSeats(seats, result.seats);
  return { ...national, seats };
}

function unifiedMembers(
  input: ElectionInput,
  elected: ElectionSimulationResult["electedCandidates"],
  foreign: ElectionSimulationResult["foreignResults"]
): UnifiedElectedMember[] {
  const candidateById = new Map((input.candidates ?? []).map((candidate) => [candidate.id, candidate]));
  const domestic = elected.map((record): UnifiedElectedMember => {
    const candidate = candidateById.get(record.candidateId);
    const nomination = (input.nominations ?? []).find((item) => item.candidateId === record.candidateId && item.chamber === (record.seatId.startsWith("senate-") ? "senate" : "camera"));
    const chamber: Chamber = nomination?.chamber ?? (record.seatId.startsWith("senate-") ? "senate" : "camera");
    return {
      chamber,
      electionType: record.nominationType === "single-member" ? "single-member" : "plurinominal",
      territory: record.electedIn,
      listId: nomination?.listId ?? "",
      candidateId: record.candidateId,
      displayName: candidate ? `${candidate.lastName} ${candidate.firstName}` : record.candidateId
    };
  });
  const abroad: UnifiedElectedMember[] = [];
  for (const chamberId of ["camera", "senato"] as const) {
    for (const election of foreign[chamberId]?.electedCandidates ?? []) {
      abroad.push({
        chamber: chamberId === "senato" ? "senate" : "camera",
        electionType: "foreign",
        territory: election.partitionId,
        listId: election.listId,
        candidateId: election.candidate.id ?? `${chamberId}-${election.partitionId}-${election.listId}-${election.candidate.name}`,
        displayName: election.candidate.name
      });
    }
  }
  return [...domestic, ...abroad];
}

function stageTrace(id: string, stage: string, ruleReference: string, data: unknown): CalculationTraceEntry {
  return { id, stage, ruleReference, level: "info", message: `${stage} completata.`, data };
}
