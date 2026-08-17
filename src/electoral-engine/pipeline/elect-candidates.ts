import type { Chamber } from "../domain/chamber";
import type { CandidateNomination, ElectedCandidate, ElectionInput, TerritorialSeatResult, ThresholdResult } from "../domain/election";
import type { SeatAssignmentTrace, TieResolutionRequired } from "../domain/trace";
import { allocateByHare } from "./proportional-allocation";

export type CandidateElectionResult = {
  elected: ElectedCandidate[];
  seatTrace: SeatAssignmentTrace[];
  ties: TieResolutionRequired[];
};

export function electCandidates(
  input: ElectionInput,
  territorialResults: TerritorialSeatResult[],
  thresholds?: Record<Chamber, ThresholdResult>
): CandidateElectionResult {
  const nominations = [...(input.nominations ?? [])].sort((a, b) => a.position - b.position || a.candidateId.localeCompare(b.candidateId));
  const bonusPriorities = [...(input.bonusCandidateLists ?? [])].sort((a, b) => a.position - b.position || a.candidateId.localeCompare(b.candidateId));
  const electedByCandidate = new Map<string, ElectedCandidate>();
  const elected: ElectedCandidate[] = [];
  const seatTrace: SeatAssignmentTrace[] = [];
  const ties: TieResolutionRequired[] = [];
  const proportionalDemands: ProportionalSeatDemand[] = [];
  // AC 2822-A's territorial allocation has already fixed each coalition's
  // district capacity. Expand those coalition seats locally. The Rosatellum
  // proclamation needs its separate cross-district recovery allocation.
  const expandedDistrictSeats = input.lawVersion === "ac-2822-a-2026-07-16"
    ? expandDistrictCoalitionSeatsLocally(input, territorialResults, thresholds)
    : expandCoalitionDistrictSeats(input, territorialResults, thresholds);
  ties.push(...expandedDistrictSeats.ties);
  const orderedResults = [
    ...territorialResults.filter(isBonusResult),
    ...territorialResults.filter((result) => !isBonusResult(result))
  ];

  for (const result of orderedResults) {
    if (result.scope === "constituency" || result.scope === "region") continue;
    if (result.scope === "single-member") {
      const winner = [...(input.candidateVotes ?? [])]
        .filter((vote) => vote.chamber === result.chamber && vote.districtId === result.territoryId)
        .sort((a, b) => (a.votes === b.votes ? a.candidateId.localeCompare(b.candidateId) : a.votes > b.votes ? -1 : 1))[0];
      if (winner && !electedByCandidate.has(winner.candidateId)) {
        const record: ElectedCandidate = {
          candidateId: winner.candidateId,
          seatId: `${result.territoryId}-1`,
          electedIn: result.territoryId,
          nominationType: "single-member",
          listPosition: 1
        };
        electedByCandidate.set(winner.candidateId, record);
        elected.push(record);
      }
      continue;
    }
    if (isBonusResult(result)) {
      for (const [subjectId, seats] of Object.entries(result.seats)) {
        const eligible = bonusPriorities.filter((candidate) => candidate.chamber === result.chamber && candidate.connectedSubjectId === subjectId);
        let assigned = 0;
        for (const candidate of eligible) {
          if (assigned >= seats) break;
          if (electedByCandidate.has(candidate.candidateId)) continue;
          assigned += 1;
          const seatId = `${result.territoryId}-${subjectId}-bonus-${candidate.position}`;
          const record: ElectedCandidate = {
            candidateId: candidate.candidateId,
            seatId,
            electedIn: result.territoryId,
            nominationType: "bonus-priority-list",
            listPosition: candidate.position
          };
          electedByCandidate.set(candidate.candidateId, record);
          elected.push(record);
          seatTrace.push({
            seatId,
            chamber: result.chamber,
            partyId: subjectId,
            constituencyId: result.territoryId,
            candidateId: candidate.candidateId,
            allocationStage: "proclamazione candidati premio",
            ruleReference: "AC 2822-A articoli 18-bis, 19, 83-bis"
          });
        }
        if (assigned < seats) {
          ties.push({
            subjects: [subjectId],
            stage: "proclamazione candidati premio",
            affectedSeats: [`${result.territoryId}-${subjectId}`],
            legalRule: "AC 2822-A articoli 18-bis, 19, 83-bis; candidati premio insufficienti/subentri da risolvere"
          });
        }
      }
      continue;
    }
    const seatsByList = result.scope === "district"
      ? expandedDistrictSeats.seatsByDistrict[result.territoryId] ?? result.seats
      : expandCoalitionSeats(input, result, thresholds?.[result.chamber]).seats;
    for (const [listId, seats] of Object.entries(seatsByList)) {
      const localEligible = nominations.filter(
        (nomination) =>
          nomination.listId === listId &&
          nomination.chamber === result.chamber &&
          nomination.nominationType !== "single-member" &&
          (nomination.districtId === result.territoryId || nomination.constituencyId === result.territoryId)
      );
      for (let seatIndex = 0; seatIndex < seats; seatIndex += 1) {
        proportionalDemands.push({
          chamber: result.chamber,
          territoryId: result.territoryId,
          listId,
          seatIndex,
          nextIndex: seatIndex,
          nominations: localEligible
        });
      }
    }
  }

  // Full allocations supply threshold results and can use the statutory
  // cross-district replacement chain.  Keep the local-list behavior for
  // direct callers that do not provide allocation context.
  const proportional = assignProportionalCandidates(input, proportionalDemands, electedByCandidate, Boolean(thresholds));
  elected.push(...proportional.elected);
  seatTrace.push(...proportional.seatTrace);
  ties.push(...proportional.ties);

  return { elected, seatTrace, ties };
}

type ProportionalSeatDemand = {
  chamber: Chamber;
  territoryId: string;
  listId: string;
  seatIndex: number;
  nextIndex: number;
  nominations: CandidateNomination[];
};

type ProportionalAssignment = {
  demand: ProportionalSeatDemand;
  nomination: CandidateNomination;
  record: ElectedCandidate;
  trace: SeatAssignmentTrace;
};

function assignProportionalCandidates(
  input: ElectionInput,
  demands: ProportionalSeatDemand[],
  alreadyElected: Map<string, ElectedCandidate>,
  allowCrossDistrictRecovery: boolean
): CandidateElectionResult {
  const electedByCandidate = new Map(alreadyElected);
  const assignmentByCandidate = new Map<string, ProportionalAssignment>();
  const elected: ElectedCandidate[] = [];
  const seatTrace: SeatAssignmentTrace[] = [];
  const ties: TieResolutionRequired[] = [];
  const allDemands = [...demands];

  // A candidate can displace an earlier proclamation, which in turn needs a
  // replacement.  The full 2026 data can create a chain longer than the JS
  // call stack, so process that depth-first work with an explicit stack.
  const pendingDemands = [...demands].reverse();
  while (pendingDemands.length > 0) {
    const demand = pendingDemands.pop()!;
    let fulfilledOrDeferred = false;
    while (demand.nextIndex < demand.nominations.length) {
      const nomination = demand.nominations[demand.nextIndex];
      demand.nextIndex += 1;
      const existing = electedByCandidate.get(nomination.candidateId);
      if (!existing) {
        const assignment = createProportionalAssignment(demand, nomination);
        electedByCandidate.set(nomination.candidateId, assignment.record);
        assignmentByCandidate.set(nomination.candidateId, assignment);
        fulfilledOrDeferred = true;
        break;
      }
      const existingProportional = assignmentByCandidate.get(nomination.candidateId);
      if (!existingProportional || !newNominationPrevails(input, demand, existingProportional.demand)) {
        existing.resolvedMultipleNomination = true;
        existing.resolutionReason =
          existing.nominationType === "single-member"
            ? "pluricandidatura: prevale la proclamazione nel collegio uninominale"
            : "pluricandidatura: mantenuta la proclamazione proporzionale prevalente";
        continue;
      }
      const replacementDemand = existingProportional.demand;
      assignmentByCandidate.delete(nomination.candidateId);
      const assignment = createProportionalAssignment(demand, nomination);
      assignment.record.resolvedMultipleNomination = true;
      assignment.record.resolutionReason = "pluricandidatura: scelto il collegio con minore percentuale della lista";
      electedByCandidate.set(nomination.candidateId, assignment.record);
      assignmentByCandidate.set(nomination.candidateId, assignment);
      pendingDemands.push(replacementDemand);
      fulfilledOrDeferred = true;
      break;
    }
    if (fulfilledOrDeferred) continue;
    const replacement = allowCrossDistrictRecovery
      ? createReplacementDemand(input, demand, allDemands, electedByCandidate)
      : undefined;
    if (replacement) {
      allDemands.push(replacement);
      pendingDemands.push(replacement);
      continue;
    }
    ties.push({
      subjects: [demand.listId],
      stage: `proclamazione candidati ${demand.territoryId}`,
      affectedSeats: [`${demand.territoryId}-${demand.listId}-${demand.seatIndex + 1}`],
      legalRule: "AC 2822-A articoli 84, 85, 86; candidati insufficienti/subentri da risolvere"
    });
  }
  for (const assignment of assignmentByCandidate.values()) {
    elected.push(assignment.record);
    seatTrace.push(assignment.trace);
  }

  return { elected, seatTrace, ties };
}

function createReplacementDemand(
  input: ElectionInput,
  exhausted: ProportionalSeatDemand,
  demands: ProportionalSeatDemand[],
  electedByCandidate: Map<string, ElectedCandidate>
): ProportionalSeatDemand | undefined {
  const candidates = replacementTerritories(input, exhausted, demands, electedByCandidate);
  const destination = candidates[0];
  if (!destination) return undefined;
  const baseSeatIndex = demands.filter(
    (demand) =>
      demand.chamber === exhausted.chamber &&
      demand.listId === exhausted.listId &&
      demand.territoryId === destination.territoryId
  ).length;
  return {
    chamber: exhausted.chamber,
    territoryId: destination.territoryId,
    listId: exhausted.listId,
    seatIndex: baseSeatIndex,
    nextIndex: baseSeatIndex,
    nominations: destination.nominations
  };
}

function replacementTerritories(
  input: ElectionInput,
  exhausted: ProportionalSeatDemand,
  demands: ProportionalSeatDemand[],
  electedByCandidate: Map<string, ElectedCandidate>
): Array<{ territoryId: string; nominations: CandidateNomination[]; sameParent: boolean; remainder: bigint; votes: bigint }> {
  const districts = new Map(input.multiMemberDistricts.map((district) => [district.id, district]));
  const origin = districts.get(exhausted.territoryId);
  const listDemandCount = demands.filter(
    (demand) => demand.chamber === exhausted.chamber && demand.listId === exhausted.listId
  ).length;
  const totalVotes = input.listVotes
    .filter((vote) => vote.chamber === exhausted.chamber && vote.listId === exhausted.listId)
    .reduce((sum, vote) => sum + vote.votes, 0n);
  const quotient = listDemandCount > 0 && totalVotes > 0n ? totalVotes / BigInt(listDemandCount) : 0n;

  const byTerritory = new Map<string, CandidateNomination[]>();
  for (const nomination of input.nominations ?? []) {
    if (
      nomination.chamber !== exhausted.chamber ||
      nomination.listId !== exhausted.listId ||
      nomination.nominationType === "single-member" ||
      !nomination.districtId ||
      nomination.districtId === exhausted.territoryId
    ) {
      continue;
    }
    const district = districts.get(nomination.districtId);
    if (!district) continue;
    const current = byTerritory.get(nomination.districtId) ?? [];
    current.push(nomination);
    byTerritory.set(nomination.districtId, current);
  }

  return [...byTerritory.entries()]
    .map(([territoryId, nominations]) => {
      const sortedNominations = [...nominations].sort((a, b) => a.position - b.position || a.candidateId.localeCompare(b.candidateId));
      const votes = votesForListInDistricts(input, exhausted.chamber, exhausted.listId, [territoryId]);
      const remainder = quotient > 0n ? votes - (votes / quotient) * quotient : 0n;
      const district = districts.get(territoryId);
      return {
        territoryId,
        nominations: sortedNominations,
        sameParent: sameParentDistrict(exhausted.chamber, origin, district),
        remainder,
        votes
      };
    })
    .filter((candidate) =>
      candidate.nominations.some((nomination) => {
        const existing = electedByCandidate.get(nomination.candidateId);
        if (!existing) return true;
        const existingDemand = demands.find(
          (demand) =>
            demand.chamber === exhausted.chamber &&
            demand.listId === exhausted.listId &&
            demand.territoryId === existing.electedIn
        );
        return existingDemand ? newNominationPrevails(input, { ...exhausted, territoryId: candidate.territoryId }, existingDemand) : false;
      })
    )
    .sort((a, b) => {
      if (a.sameParent !== b.sameParent) return a.sameParent ? -1 : 1;
      if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
      if (a.votes !== b.votes) return a.votes > b.votes ? -1 : 1;
      return a.territoryId.localeCompare(b.territoryId);
    });
}

function sameParentDistrict(
  chamber: Chamber,
  a: ElectionInput["multiMemberDistricts"][number] | undefined,
  b: ElectionInput["multiMemberDistricts"][number] | undefined
): boolean {
  if (!a || !b) return false;
  return chamber === "camera" ? a.constituencyId === b.constituencyId : a.regionId === b.regionId;
}

function createProportionalAssignment(
  demand: ProportionalSeatDemand,
  nomination: CandidateNomination
): ProportionalAssignment {
  const seatId = `${demand.territoryId}-${demand.listId}-${demand.seatIndex + 1}`;
  const record: ElectedCandidate = {
    candidateId: nomination.candidateId,
    seatId,
    electedIn: demand.territoryId,
    nominationType: nomination.nominationType,
    listPosition: nomination.position,
    resolutionReason: undefined
  };
  return {
    demand,
    nomination,
    record,
    trace: {
      seatId,
      chamber: demand.chamber,
      partyId: demand.listId,
      constituencyId: nomination.constituencyId ?? demand.territoryId,
      districtId: nomination.districtId,
      candidateId: nomination.candidateId,
      allocationStage: "proclamazione candidati",
      ruleReference: "AC 2822-A articoli 84, 85, 86"
    }
  };
}

function newNominationPrevails(
  input: ElectionInput,
  candidate: ProportionalSeatDemand,
  incumbent: ProportionalSeatDemand
): boolean {
  const candidateShare = listShareInDistrict(input, candidate);
  const incumbentShare = listShareInDistrict(input, incumbent);
  if (candidateShare.numerator * incumbentShare.denominator !== incumbentShare.numerator * candidateShare.denominator) {
    return candidateShare.numerator * incumbentShare.denominator < incumbentShare.numerator * candidateShare.denominator;
  }
  return candidate.territoryId.localeCompare(incumbent.territoryId) < 0;
}

function listShareInDistrict(
  input: ElectionInput,
  demand: ProportionalSeatDemand
): { numerator: bigint; denominator: bigint } {
  const districtVotes = input.listVotes.filter((vote) => vote.chamber === demand.chamber && vote.districtId === demand.territoryId);
  const numerator = districtVotes
    .filter((vote) => vote.listId === demand.listId)
    .reduce((sum, vote) => sum + vote.votes, 0n);
  const denominator = districtVotes.reduce((sum, vote) => sum + vote.votes, 0n);
  return { numerator, denominator: denominator > 0n ? denominator : 1n };
}

function isBonusResult(result: TerritorialSeatResult): boolean {
  return result.scope === "bonus-constituency" || result.scope === "bonus-region";
}

function expandCoalitionSeats(
  input: ElectionInput,
  result: TerritorialSeatResult,
  thresholds?: ThresholdResult
): { seats: Record<string, number>; ties: TieResolutionRequired[] } {
  const output: Record<string, number> = {};
  const ties: TieResolutionRequired[] = [];
  for (const [subjectId, seats] of Object.entries(result.seats)) {
    if (seats <= 0) continue;
    const coalition = input.coalitions.find((item) => item.id === subjectId);
    if (!coalition) {
      output[subjectId] = (output[subjectId] ?? 0) + seats;
      continue;
    }
    const admittedLists = thresholds?.admittedCoalitionLists[coalition.id] ?? coalition.listIds;
    const votes = Object.fromEntries(
      admittedLists.map((listId) => [
        listId,
        input.listVotes
          .filter((vote) => vote.chamber === result.chamber && vote.listId === listId && vote.districtId === result.territoryId)
          .reduce((sum, vote) => sum + vote.votes, 0n)
      ])
    );
    const allocation = allocateByHare(votes, seats, `riparto interno coalizione ${subjectId} ${result.territoryId}`, "AC 2822-A articolo 83, lettera g)/i); articolo 17");
    ties.push(...allocation.ties);
    for (const [listId, listSeats] of Object.entries(allocation.seats)) {
      output[listId] = (output[listId] ?? 0) + listSeats;
    }
  }
  return { seats: output, ties };
}

function expandCoalitionDistrictSeats(
  input: ElectionInput,
  results: TerritorialSeatResult[],
  thresholds?: Record<Chamber, ThresholdResult>
): { seatsByDistrict: Record<string, Record<string, number>>; ties: TieResolutionRequired[] } {
  const seatsByDistrict: Record<string, Record<string, number>> = {};
  const ties: TieResolutionRequired[] = [];
  const districtResults = results.filter((result) => result.scope === "district");

  for (const result of districtResults) {
    const output = seatsByDistrict[result.territoryId] ?? {};
    for (const [subjectId, seats] of Object.entries(result.seats)) {
      if (seats <= 0 || input.coalitions.some((coalition) => coalition.id === subjectId)) continue;
      output[subjectId] = (output[subjectId] ?? 0) + seats;
    }
    seatsByDistrict[result.territoryId] = output;
  }

  // A district-only result is useful to small callers and fixtures.  There
  // is no parent allocation to expand in that form, so expand it locally.
  for (const result of districtResults) {
    if (Object.keys(seatsByDistrict[result.territoryId] ?? {}).length > 0) continue;
    const expanded = expandCoalitionSeats(input, result, thresholds?.[result.chamber]);
    seatsByDistrict[result.territoryId] = expanded.seats;
    ties.push(...expanded.ties);
  }

  for (const chamber of ["camera", "senate"] satisfies Chamber[]) {
    const parentScope = chamber === "camera" ? "constituency" : "region";
    const parentResults = results.filter((result) => result.chamber === chamber && result.scope === parentScope);
    for (const coalition of input.coalitions) {
      const admittedLists = thresholds?.[chamber].admittedCoalitionLists[coalition.id] ?? coalition.listIds;
      if (admittedLists.length === 0) continue;
      const parentListTargets = chamber === "camera"
        ? allocateCameraCoalitionListsToParents(input, chamber, coalition.id, admittedLists, parentResults, ties)
        : {};
      for (const parent of parentResults) {
        const parentSeatCount = parent.seats[coalition.id] ?? 0;
        if (parentSeatCount <= 0) continue;
        const districts = input.multiMemberDistricts.filter((district) =>
          district.chamber === chamber &&
          (chamber === "camera" ? district.constituencyId === parent.territoryId : district.regionId === parent.territoryId)
        );
        const parentDistrictSeats: Record<string, Record<string, number>> = Object.fromEntries(
          districts.map((district) => [district.id, { ...(seatsByDistrict[district.id] ?? {}) }])
        );
        const listTargets = chamber === "camera"
          ? parentListTargets[parent.territoryId] ?? {}
          : allocateSenateCoalitionListsInParent(input, chamber, coalition.id, admittedLists, parent, ties);
        for (const [listId, listSeatCount] of Object.entries(listTargets)) {
          if (listSeatCount <= 0) continue;
          const districtVotes = Object.fromEntries(
            districts.map((district) => [district.id, votesForListInDistricts(input, chamber, listId, [district.id])])
          );
          const districtAllocation = allocateByHare(
            districtVotes,
            listSeatCount,
            `attribuzione collegi ${chamber} ${parent.territoryId} ${listId}`,
            chamber === "camera" ? "Legge 165/2017 articolo 83" : "Legge 165/2017 articolo 17"
          );
          ties.push(...districtAllocation.ties);
          for (const [districtId, seats] of Object.entries(districtAllocation.seats)) {
            parentDistrictSeats[districtId] = parentDistrictSeats[districtId] ?? {};
            parentDistrictSeats[districtId][listId] = (parentDistrictSeats[districtId][listId] ?? 0) + seats;
          }
        }
        rebalanceExpandedDistrictSeats(input, chamber, coalition.id, districts.map((district) => district.id), parentDistrictSeats, results);
        for (const [districtId, seats] of Object.entries(parentDistrictSeats)) {
          seatsByDistrict[districtId] = seats;
        }
      }
    }
  }

  return { seatsByDistrict, ties };
}

function expandDistrictCoalitionSeatsLocally(
  input: ElectionInput,
  results: TerritorialSeatResult[],
  thresholds?: Record<Chamber, ThresholdResult>
): { seatsByDistrict: Record<string, Record<string, number>>; ties: TieResolutionRequired[] } {
  const seatsByDistrict: Record<string, Record<string, number>> = {};
  const ties: TieResolutionRequired[] = [];
  for (const result of results.filter((item) => item.scope === "district" || item.scope === "special-local-proportional")) {
    const expanded = expandCoalitionSeats(input, result, thresholds?.[result.chamber]);
    seatsByDistrict[result.territoryId] = expanded.seats;
    ties.push(...expanded.ties);
  }
  return { seatsByDistrict, ties };
}

function votesForListInDistricts(input: ElectionInput, chamber: Chamber, listId: string, districtIds: string[]): bigint {
  const districtSet = new Set(districtIds);
  return input.listVotes
    .filter((vote) => vote.chamber === chamber && vote.listId === listId && districtSet.has(vote.districtId))
    .reduce((sum, vote) => sum + vote.votes, 0n);
}

function allocateCameraCoalitionListsToParents(
  input: ElectionInput,
  chamber: Chamber,
  coalitionId: string,
  listIds: string[],
  parentResults: TerritorialSeatResult[],
  ties: TieResolutionRequired[]
): Record<string, Record<string, number>> {
  const coalitionSeatCount = parentResults.reduce((sum, result) => sum + (result.seats[coalitionId] ?? 0), 0);
  if (coalitionSeatCount <= 0) return {};
  const chamberListVotes = Object.fromEntries(
    listIds.map((listId) => [
      listId,
      input.listVotes
        .filter((vote) => vote.chamber === chamber && vote.listId === listId)
        .reduce((sum, vote) => sum + vote.votes, 0n)
    ])
  );
  const chamberListAllocation = allocateByHare(
    chamberListVotes,
    coalitionSeatCount,
    `riparto interno coalizione ${coalitionId} ${chamber}`,
    "Legge 165/2017; riparto dei seggi di coalizione tra liste ammesse"
  );
  ties.push(...chamberListAllocation.ties);
  const targets: Record<string, Record<string, number>> = Object.fromEntries(
    parentResults.map((parent) => [parent.territoryId, {}])
  );
  for (const [listId, seats] of Object.entries(chamberListAllocation.seats)) {
    if (seats <= 0) continue;
    const parentVotes = Object.fromEntries(
      parentResults.map((parent) => [
        parent.territoryId,
        votesForListInParent(input, chamber, listId, parent.territoryId)
      ])
    );
    const allocation = allocateByHare(
      parentVotes,
      seats,
      `attribuzione territori ${chamber} ${listId}`,
      chamber === "camera" ? "Legge 165/2017 articolo 83" : "Legge 165/2017 articolo 17"
    );
    for (const [parentId, parentSeats] of Object.entries(allocation.seats)) {
      targets[parentId] = targets[parentId] ?? {};
      targets[parentId][listId] = (targets[parentId][listId] ?? 0) + parentSeats;
    }
  }
  rebalanceParentListSeats(input, chamber, coalitionId, listIds, targets, parentResults);
  return targets;
}

function allocateSenateCoalitionListsInParent(
  input: ElectionInput,
  chamber: Chamber,
  coalitionId: string,
  listIds: string[],
  parent: TerritorialSeatResult,
  ties: TieResolutionRequired[]
): Record<string, number> {
  const seatCount = parent.seats[coalitionId] ?? 0;
  if (seatCount <= 0) return {};
  const votes = Object.fromEntries(
    listIds.map((listId) => [listId, votesForListInParent(input, chamber, listId, parent.territoryId)])
  );
  const allocation = allocateByHare(
    votes,
    seatCount,
    `riparto interno coalizione ${coalitionId} ${parent.territoryId}`,
    "Legge 165/2017; riparto regionale dei seggi di coalizione tra liste ammesse"
  );
  ties.push(...allocation.ties);
  return allocation.seats;
}

function votesForListInParent(input: ElectionInput, chamber: Chamber, listId: string, parentId: string): bigint {
  const districtIds = input.multiMemberDistricts
    .filter((district) =>
      district.chamber === chamber &&
      (chamber === "camera" ? district.constituencyId === parentId : district.regionId === parentId)
    )
    .map((district) => district.id);
  return votesForListInDistricts(input, chamber, listId, districtIds);
}

function rebalanceParentListSeats(
  input: ElectionInput,
  chamber: Chamber,
  coalitionId: string,
  listIds: string[],
  targets: Record<string, Record<string, number>>,
  parentResults: TerritorialSeatResult[]
) {
  const parentIds = parentResults.map((parent) => parent.territoryId);
  const capacities = Object.fromEntries(
    parentResults.map((parent) => [
      parent.territoryId,
      parent.seats[coalitionId] ?? 0
    ])
  );
  const total = (parentId: string) => Object.values(targets[parentId] ?? {}).reduce((sum, seats) => sum + seats, 0);

  while (true) {
    const over = parentIds.find((parentId) => total(parentId) > (capacities[parentId] ?? 0));
    const under = parentIds.find((parentId) => total(parentId) < (capacities[parentId] ?? 0));
    if (!over || !under) break;
    const listId = listIds
      .filter((id) => (targets[over]?.[id] ?? 0) > 0)
      .sort((a, b) => {
        const diff = votesForListInParent(input, chamber, b, under) - votesForListInParent(input, chamber, a, under);
        return diff === 0n ? a.localeCompare(b) : diff > 0n ? 1 : -1;
      })[0];
    if (!listId) break;
    targets[over][listId] -= 1;
    targets[under] = targets[under] ?? {};
    targets[under][listId] = (targets[under][listId] ?? 0) + 1;
  }
}

function rebalanceExpandedDistrictSeats(
  input: ElectionInput,
  chamber: Chamber,
  coalitionId: string,
  districtIds: string[],
  seatsByDistrict: Record<string, Record<string, number>>,
  originalResults: TerritorialSeatResult[]
) {
  const coalitionCapacity = Object.fromEntries(
    districtIds.map((districtId) => [
      districtId,
      originalResults.find((result) => result.chamber === chamber && result.scope === "district" && result.territoryId === districtId)?.seats[coalitionId] ?? 0
    ])
  );
  const totalCoalitionSeats = (districtId: string) =>
    Object.entries(seatsByDistrict[districtId] ?? {})
      .filter(([listId]) => input.lists.find((list) => list.id === listId)?.coalitionId === coalitionId)
      .reduce((sum, [, seats]) => sum + seats, 0);

  while (true) {
    const over = districtIds.find((districtId) => totalCoalitionSeats(districtId) > (coalitionCapacity[districtId] ?? 0));
    const under = districtIds.find((districtId) => totalCoalitionSeats(districtId) < (coalitionCapacity[districtId] ?? 0));
    if (!over || !under) break;
    const sourceSeats = seatsByDistrict[over] ?? {};
    const movableList = Object.entries(sourceSeats)
      .filter(([listId, seats]) => seats > 0 && input.lists.find((list) => list.id === listId)?.coalitionId === coalitionId)
      .sort(([a], [b]) => {
        const diff = votesForListInDistricts(input, chamber, b, [under]) - votesForListInDistricts(input, chamber, a, [under]);
        return diff === 0n ? a.localeCompare(b) : diff > 0n ? 1 : -1;
      })[0]?.[0];
    if (!movableList) break;
    sourceSeats[movableList] -= 1;
    seatsByDistrict[under] = seatsByDistrict[under] ?? {};
    seatsByDistrict[under][movableList] = (seatsByDistrict[under][movableList] ?? 0) + 1;
  }
}
