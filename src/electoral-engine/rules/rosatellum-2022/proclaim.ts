import type { Chamber } from "../../domain/chamber";
import type {
  CandidateNomination,
  ElectedCandidate,
  ElectionInput,
  TerritorialSeatResult
} from "../../domain/election";
import type { SeatAssignmentTrace, TieResolutionRequired } from "../../domain/trace";

export type ProclamationResult = {
  elected: ElectedCandidate[];
  seatTrace: SeatAssignmentTrace[];
  ties: TieResolutionRequired[];
};

type Demand = {
  chamber: Chamber;
  districtId: string;
  listId: string;
  seats: number;
};

type Choice = { demand: Demand; nomination: CandidateNomination; reason?: string };

/** Proclamation under articles 84 and 85 of D.P.R. 361/1957.
 *
 * The first pass is deliberately a fixed point.  Filling seats one at a time
 * makes the result depend on the order in which districts happen to occur in
 * an input file and does not implement article 85.
 */
export function proclaimRosatellum2022(
  input: ElectionInput,
  territorialResults: TerritorialSeatResult[]
): ProclamationResult {
  const ties: TieResolutionRequired[] = [];
  const elected: ElectedCandidate[] = [];
  const seatTrace: SeatAssignmentTrace[] = [];
  const nominations = [...(input.nominations ?? [])].sort(nominationOrder);
  const candidateVotes = input.candidateVotes ?? [];
  const singleWinners = new Set<string>();

  for (const result of territorialResults.filter((item) => item.scope === "single-member")) {
    const ranking = candidateVotes
      .filter((vote) => vote.chamber === result.chamber && vote.districtId === result.territoryId)
      .sort((a, b) => a.votes === b.votes ? a.candidateId.localeCompare(b.candidateId) : a.votes > b.votes ? -1 : 1);
    if (!ranking[0]) continue;
    if (ranking[1]?.votes === ranking[0].votes) {
      ties.push(unresolved([ranking[0].candidateId, ranking[1].candidateId], result.territoryId, "parita nel collegio uninominale"));
      continue;
    }
    const winner = ranking[0];
    singleWinners.add(winner.candidateId);
    const nomination = nominations.find((item) => item.chamber === result.chamber && item.candidateId === winner.candidateId && item.nominationType === "single-member");
    const record: ElectedCandidate = {
      candidateId: winner.candidateId,
      seatId: `${result.territoryId}-1`,
      electedIn: result.territoryId,
      nominationType: "single-member",
      listPosition: 1
    };
    elected.push(record);
    seatTrace.push(traceFor(record, result.chamber, nomination?.listId ?? Object.keys(result.seats)[0] ?? ""));
  }

  const demands: Demand[] = territorialResults
    .filter((result) => result.scope === "district")
    .flatMap((result) => Object.entries(result.seats)
      .filter(([, seats]) => seats > 0)
      .map(([listId, seats]) => ({ chamber: result.chamber, districtId: result.territoryId, listId, seats })))
    .sort((a, b) => a.chamber.localeCompare(b.chamber) || a.districtId.localeCompare(b.districtId) || a.listId.localeCompare(b.listId));

  const local = new Map<string, CandidateNomination[]>();
  for (const nomination of nominations) {
    if (nomination.nominationType !== "multi-member" || !nomination.districtId) continue;
    const key = demandKey(nomination.chamber, nomination.districtId, nomination.listId);
    local.set(key, [...(local.get(key) ?? []), nomination]);
  }

  // Article 85: repeatedly fix every multiple election in the district where
  // the list obtained its lowest exact vote percentage.
  const fixed = new Map<string, string>();
  let choices = new Map<string, Choice[]>();
  for (let iteration = 0; iteration < 100; iteration += 1) {
    choices = tentativeChoices(demands, local, singleWinners, fixed);
    const occurrences = new Map<string, Choice[]>();
    for (const group of choices.values()) for (const choice of group) {
      occurrences.set(choice.nomination.candidateId, [...(occurrences.get(choice.nomination.candidateId) ?? []), choice]);
    }
    const multiples = [...occurrences.entries()].filter(([, values]) => values.length > 1);
    if (multiples.length === 0) break;
    let changed = false;
    for (const [candidateId, values] of multiples) {
      const preferred = [...values].sort((a, b) => compareListShares(input, a.demand, b.demand))[0];
      const key = demandKey(preferred.demand.chamber, preferred.demand.districtId, preferred.demand.listId);
      if (fixed.get(candidateId) !== key) {
        fixed.set(candidateId, key);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const proportional: Choice[] = [...choices.values()].flat();
  // The Article 84 recovery pass uses the live remainder state produced by
  // articles 83/83-bis.  It may create a new multiple election, resolved by
  // Article 85 only after every recovery has been made.
  const recoveredIds = new Set<string>();
  const selectedColleges = collegesByCandidate(proportional);
  const districtResult = new Map(territorialResults.filter((item) => item.scope === "district").map((item) => [`${item.chamber}|${item.territoryId}`, item]));
  const parentResult = new Map(territorialResults.filter((item) => item.scope === "constituency" || item.scope === "region").map((item) => [`${item.chamber}|${item.territoryId}`, item]));

  for (const demand of demands) {
    const key = demandKey(demand.chamber, demand.districtId, demand.listId);
    let missing = demand.seats - (choices.get(key)?.length ?? 0);
    while (missing > 0) {
      const recovered = recoverCandidate(input, demand, nominations, singleWinners, recoveredIds, fixed, selectedColleges, districtResult, parentResult);
      if (!recovered) break;
      recoveredIds.add(recovered.nomination.candidateId);
      const colleges = selectedColleges.get(recovered.nomination.candidateId) ?? new Set<string>();
      colleges.add(recovered.nomination.districtId ?? demand.districtId);
      selectedColleges.set(recovered.nomination.candidateId, colleges);
      proportional.push(recovered);
      missing -= 1;
    }
    if (missing > 0) {
      for (let seat = demand.seats - missing; seat < demand.seats; seat += 1) {
        ties.push(unresolved([demand.listId], `${demand.districtId}-${demand.listId}-${seat + 1}`, "candidati esauriti dopo la catena dell'articolo 84"));
      }
    }
  }

  resolveRecoveryPluricandidacies(input, proportional, local, singleWinners, ties);

  const positionBySeat = new Map<string, number>();
  for (const choice of proportional) {
    const seatKey = demandKey(choice.demand.chamber, choice.demand.districtId, choice.demand.listId);
    const position = (positionBySeat.get(seatKey) ?? 0) + 1;
    positionBySeat.set(seatKey, position);
    const record: ElectedCandidate = {
      candidateId: choice.nomination.candidateId,
      seatId: `${choice.demand.districtId}-${choice.demand.listId}-${position}`,
      electedIn: choice.nomination.districtId ?? choice.demand.districtId,
      nominationType: choice.nomination.nominationType,
      listPosition: choice.nomination.position,
      resolvedMultipleNomination: fixed.has(choice.nomination.candidateId) || Boolean(choice.reason),
      resolutionReason: choice.reason ?? (fixed.has(choice.nomination.candidateId) ? "articolo 85: minore cifra percentuale di lista" : undefined)
    };
    elected.push(record);
    seatTrace.push(traceFor(record, choice.demand.chamber, choice.demand.listId, choice.reason));
  }
  return { elected, seatTrace, ties };
}

function tentativeChoices(
  demands: Demand[],
  local: Map<string, CandidateNomination[]>,
  singleWinners: Set<string>,
  fixed: Map<string, string>
): Map<string, Choice[]> {
  const result = new Map<string, Choice[]>();
  for (const demand of demands) {
    const key = demandKey(demand.chamber, demand.districtId, demand.listId);
    const eligible = (local.get(key) ?? []).filter((nomination) =>
      !singleWinners.has(nomination.candidateId) && (!fixed.has(nomination.candidateId) || fixed.get(nomination.candidateId) === key));
    result.set(key, eligible.slice(0, demand.seats).map((nomination) => ({ demand, nomination })));
  }
  return result;
}

function recoverCandidate(
  input: ElectionInput,
  origin: Demand,
  nominations: CandidateNomination[],
  singleWinners: Set<string>,
  recoveredIds: Set<string>,
  fixed: Map<string, string>,
  selectedColleges: Map<string, Set<string>>,
  districtResults: Map<string, TerritorialSeatResult>,
  parentResults: Map<string, TerritorialSeatResult>
): Choice | undefined {
  const originDistrict = input.multiMemberDistricts.find((item) => item.id === origin.districtId);
  if (!originDistrict) return undefined;
  const sameParent = (districtId: string) => {
    const district = input.multiMemberDistricts.find((item) => item.id === districtId);
    return Boolean(district && (origin.chamber === "camera"
      ? district.constituencyId === originDistrict.constituencyId
      : district.regionId === originDistrict.regionId));
  };
  const available = (listId: string, predicate: (nomination: CandidateNomination) => boolean) => nominations
    .filter((nomination) => nomination.chamber === origin.chamber && nomination.listId === listId && nomination.nominationType === "multi-member" && nomination.districtId && predicate(nomination) &&
      !singleWinners.has(nomination.candidateId) && !recoveredIds.has(nomination.candidateId) && !fixed.has(nomination.candidateId) &&
      !selectedColleges.get(nomination.candidateId)?.has(nomination.districtId))
    .sort((a, b) => recoveryParentOrder(input, parentResults, listId, a.districtId!, b.districtId!) || recoveryDistrictOrder(districtResults, listId, a.districtId!, b.districtId!) || nominationOrder(a, b));

  // Article 84(2): the same list in other districts of the same parent.
  let candidate: CandidateNomination | undefined = available(origin.listId, (nomination) => nomination.districtId !== origin.districtId && sameParent(nomination.districtId!))[0];
  if (candidate) return { demand: origin, nomination: candidate, reason: `articolo 84, comma 2: recupero da ${candidate.districtId}` };

  // Article 84(3): first the uninominal ranking in this exact plurinominal
  // college, then the rest of the same constituency/region.
  const unavailableSingles = new Set([...singleWinners, ...recoveredIds]);
  for (const [candidateId, colleges] of selectedColleges) if (colleges.has(origin.districtId)) unavailableSingles.add(candidateId);
  candidate = bestSingleLoser(input, origin, origin.listId, unavailableSingles, (districtId) =>
    input.singleMemberDistricts?.find((district) => district.id === districtId)?.multiMemberDistrictId === origin.districtId);
  candidate ??= bestSingleLoser(input, origin, origin.listId, unavailableSingles, (districtId) =>
    sameParentOfSingle(input, originDistrict, origin.chamber, districtId) &&
    input.singleMemberDistricts?.find((district) => district.id === districtId)?.multiMemberDistrictId !== origin.districtId);
  if (candidate) return { demand: origin, nomination: candidate, reason: "articolo 84, comma 3: graduatoria uninominale" };

  // Article 84(4): the same list in another constituency/region.
  candidate = available(origin.listId, (nomination) => !sameParent(nomination.districtId!))[0];
  if (candidate) return { demand: origin, nomination: candidate, reason: `articolo 84, comma 4: recupero da ${candidate.districtId}` };

  // Article 84(6): non-elected single-member candidates in another parent.
  candidate = bestSingleLoser(input, origin, origin.listId, new Set([...singleWinners, ...recoveredIds]), (districtId) => !sameParentOfSingle(input, originDistrict, origin.chamber, districtId));
  if (candidate) return { demand: origin, nomination: candidate, reason: "articolo 84, comma 6: graduatoria uninominale di altra circoscrizione" };

  // Paragraphs 5 and 7: repeat the chain through connected coalition lists.
  const connected = connectedLists(input, origin.listId);
  for (const listId of connected) {
    candidate = available(listId, (nomination) => sameParent(nomination.districtId!))[0];
    if (candidate) return { demand: origin, nomination: candidate, reason: `articolo 84, comma 5: lista collegata ${listId}` };
    candidate = available(listId, () => true)[0]
      ?? bestSingleLoser(input, origin, listId, new Set([...singleWinners, ...recoveredIds]), () => true);
    if (candidate) return { demand: origin, nomination: candidate, reason: `articolo 84, comma 7: lista collegata ${listId}` };
  }
  return undefined;
}

function collegesByCandidate(choices: Choice[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const choice of choices) {
    const colleges = result.get(choice.nomination.candidateId) ?? new Set<string>();
    colleges.add(choice.nomination.districtId ?? choice.demand.districtId);
    result.set(choice.nomination.candidateId, colleges);
  }
  return result;
}

function resolveRecoveryPluricandidacies(input: ElectionInput, choices: Choice[], local: Map<string, CandidateNomination[]>, singleWinners: Set<string>, ties: TieResolutionRequired[]) {
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const occurrences = new Map<string, number[]>();
    choices.forEach((choice, index) => occurrences.set(choice.nomination.candidateId, [...(occurrences.get(choice.nomination.candidateId) ?? []), index]));
    const duplicates = [...occurrences.values()].filter((indexes) => indexes.length > 1);
    if (duplicates.length === 0) return;
    let changed = false;
    for (const indexes of duplicates) {
      const kept = [...indexes].sort((a, b) => compareListShares(input, choices[a].demand, choices[b].demand))[0];
      const occupied = new Set([...singleWinners, ...choices.map((choice) => choice.nomination.candidateId)]);
      for (const index of indexes) {
        if (index === kept) continue;
        const vacancy = choices[index];
        const replacement = (local.get(demandKey(vacancy.demand.chamber, vacancy.demand.districtId, vacancy.demand.listId)) ?? []).find((nomination) => !occupied.has(nomination.candidateId));
        if (!replacement) { ties.push(unresolved([vacancy.demand.listId], vacancy.demand.districtId, "subentro locale dopo plurielezione non disponibile")); continue; }
        choices[index] = { demand: vacancy.demand, nomination: replacement, reason: `${vacancy.reason ? `${vacancy.reason}; ` : ""}articolo 85: subentro nel collegio liberato` };
        occupied.add(replacement.candidateId);
        changed = true;
      }
    }
    if (!changed) return;
  }
}

function bestSingleLoser(
  input: ElectionInput,
  origin: Demand,
  listId: string,
  occupied: Set<string>,
  districtFilter: (districtId: string) => boolean
): CandidateNomination | undefined {
  const nominations = (input.nominations ?? []).filter((nomination) =>
    nomination.chamber === origin.chamber && nomination.nominationType === "single-member" && nomination.districtId &&
    districtFilter(nomination.districtId) && !occupied.has(nomination.candidateId) && nominationSupportsList(input, nomination, listId));
  return nominations.sort((a, b) => {
    const av = input.candidateVotes?.find((vote) => vote.chamber === a.chamber && vote.districtId === a.districtId && vote.candidateId === a.candidateId)?.votes ?? 0n;
    const bv = input.candidateVotes?.find((vote) => vote.chamber === b.chamber && vote.districtId === b.districtId && vote.candidateId === b.candidateId)?.votes ?? 0n;
    const at = input.candidateVotes?.filter((vote) => vote.chamber === a.chamber && vote.districtId === a.districtId).reduce((sum, vote) => sum + vote.votes, 0n) ?? 1n;
    const bt = input.candidateVotes?.filter((vote) => vote.chamber === b.chamber && vote.districtId === b.districtId).reduce((sum, vote) => sum + vote.votes, 0n) ?? 1n;
    return compareBigInt(bv * at, av * bt) || a.candidateId.localeCompare(b.candidateId);
  })[0];
}

function nominationSupportsList(input: ElectionInput, nomination: CandidateNomination, listId: string): boolean {
  if (nomination.listId === listId) return true;
  const list = input.lists.find((item) => item.id === listId);
  return Boolean(list?.coalitionId && nomination.connectedSubjectId === list.coalitionId);
}

function connectedLists(input: ElectionInput, listId: string): string[] {
  const coalitionId = input.lists.find((list) => list.id === listId)?.coalitionId;
  return coalitionId ? input.lists.filter((list) => list.coalitionId === coalitionId && list.id !== listId).map((list) => list.id).sort() : [];
}

function recoveryDistrictOrder(results: Map<string, TerritorialSeatResult>, listId: string, a: string, b: string): number {
  const ac = findLedgerCell(results, a, listId);
  const bc = findLedgerCell(results, b, listId);
  if (!ac && !bc) return a.localeCompare(b);
  if (!ac) return 1;
  if (!bc) return -1;
  if (ac.remainderUsed !== bc.remainderUsed) return ac.remainderUsed ? 1 : -1;
  return compareBigInt(bc.remainder * ac.quotient, ac.remainder * bc.quotient) || a.localeCompare(b);
}

function recoveryParentOrder(input: ElectionInput, results: Map<string, TerritorialSeatResult>, listId: string, a: string, b: string): number {
  const getParent = (districtId: string) => {
    const district = input.multiMemberDistricts.find((item) => item.id === districtId);
    return district ? (district.chamber === "camera" ? district.constituencyId : district.regionId) : "";
  };
  const aParent = getParent(a), bParent = getParent(b);
  if (aParent === bParent) return 0;
  const chamber = input.multiMemberDistricts.find((item) => item.id === a)?.chamber;
  const cell = (parentId: string) => results.get(`${chamber}|${parentId}`)?.allocationLedger?.cells.find((item) => item.subjectId === listId);
  const ac = cell(aParent), bc = cell(bParent);
  if (!ac && !bc) return aParent.localeCompare(bParent);
  if (!ac) return 1;
  if (!bc) return -1;
  if (ac.remainderUsed !== bc.remainderUsed) return ac.remainderUsed ? 1 : -1;
  return compareBigInt(bc.remainder * ac.quotient, ac.remainder * bc.quotient) || aParent.localeCompare(bParent);
}

function findLedgerCell(results: Map<string, TerritorialSeatResult>, districtId: string, listId: string) {
  for (const result of results.values()) {
    const cell = result.allocationLedger?.cells.find((item) => item.territoryId === districtId && item.subjectId === listId);
    if (cell) return cell;
  }
  return undefined;
}

function compareListShares(input: ElectionInput, a: Demand, b: Demand): number {
  const av = listVotes(input, a.chamber, a.districtId, a.listId);
  const bv = listVotes(input, b.chamber, b.districtId, b.listId);
  const at = districtVotes(input, a.chamber, a.districtId);
  const bt = districtVotes(input, b.chamber, b.districtId);
  return compareBigInt(av * bt, bv * at) || a.districtId.localeCompare(b.districtId);
}

function listVotes(input: ElectionInput, chamber: Chamber, districtId: string, listId: string): bigint {
  return input.listVotes.filter((vote) => vote.chamber === chamber && vote.districtId === districtId && vote.listId === listId).reduce((sum, vote) => sum + vote.votes, 0n);
}

function districtVotes(input: ElectionInput, chamber: Chamber, districtId: string): bigint {
  const value = input.listVotes.filter((vote) => vote.chamber === chamber && vote.districtId === districtId).reduce((sum, vote) => sum + vote.votes, 0n);
  return value || 1n;
}

function sameParentOfSingle(
  input: ElectionInput,
  origin: ElectionInput["multiMemberDistricts"][number],
  chamber: Chamber,
  singleId: string
): boolean {
  const district = input.singleMemberDistricts?.find((item) => item.chamber === chamber && item.id === singleId);
  return Boolean(district && (chamber === "camera" ? district.constituencyId === origin.constituencyId : district.regionId === origin.regionId));
}

function demandKey(chamber: Chamber, districtId: string, listId: string): string {
  return `${chamber}|${districtId}|${listId}`;
}

function nominationOrder(a: CandidateNomination, b: CandidateNomination): number {
  return a.position - b.position || a.candidateId.localeCompare(b.candidateId);
}

function compareBigInt(a: bigint, b: bigint): number {
  return a === b ? 0 : a > b ? 1 : -1;
}

function unresolved(subjects: string[], seatId: string, reason: string): TieResolutionRequired {
  return { subjects, stage: "proclamazione Rosatellum 2022", affectedSeats: [seatId], legalRule: `D.P.R. 361/1957 articoli 84-85: ${reason}` };
}

function traceFor(record: ElectedCandidate, chamber: Chamber, listId: string, reason?: string): SeatAssignmentTrace {
  return {
    seatId: record.seatId,
    chamber,
    partyId: listId,
    constituencyId: record.electedIn,
    districtId: record.electedIn,
    candidateId: record.candidateId,
    allocationStage: record.nominationType === "single-member"
      ? "proclamazione uninominale"
      : "proclamazione candidati",
    ruleReference: reason ? reason : "D.P.R. 361/1957 articoli 84 e 85"
  };
}
