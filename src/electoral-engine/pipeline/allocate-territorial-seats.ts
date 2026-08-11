import type { Chamber } from "../domain/chamber";
import type { BonusDecision, ElectionInput, NationalResult, TerritorialSeatResult } from "../domain/election";
import type { TieResolutionRequired } from "../domain/trace";
import { allocateByHare, compensateToTargets } from "./proportional-allocation";
import { specialTerritoryForMultiMemberDistrict } from "./special-territories";

export type TerritorialAllocationResult = {
  results: TerritorialSeatResult[];
  ties: TieResolutionRequired[];
  nationalSeatTargets: Record<string, number>;
};

export function allocateTerritorialSeats(
  chamber: Chamber,
  input: ElectionInput,
  national: NationalResult,
  bonus: BonusDecision,
  maximumWinnerOrdinarySeats?: number
): TerritorialAllocationResult {
  return chamber === "camera"
    ? allocateCameraConstituencies(input, national, bonus.awarded)
    : allocateSenateRegions(input, national, bonus, maximumWinnerOrdinarySeats);
}

function allocateCameraConstituencies(
  input: ElectionInput,
  national: NationalResult,
  bonusAwarded: boolean
): TerritorialAllocationResult {
  const results: TerritorialSeatResult[] = [];
  const ties: TieResolutionRequired[] = [];
  const standardDistricts = input.multiMemberDistricts.filter(
    (district) => district.chamber === "camera" && !specialTerritoryForMultiMemberDistrict(district)
  );
  const constituencyIds = input.constituencies
    .filter((item) => item.chamber === "camera")
    .filter((constituency) => standardDistricts.some((district) => district.constituencyId === constituency.id))
    .map((item) => item.id);
  const constituencyVotes = votesByTerritory("constituencyId", "camera", input, Object.keys(national.seats));
  const constituencySeats = Object.fromEntries(
    constituencyIds.map((id) => [id, seatsInConstituency("camera", input, id, bonusAwarded)])
  );
  const initial: Record<string, Record<string, number>> = {};
  const remainders: Record<string, ReturnType<typeof allocateByHare>["remainders"]> = {};

  for (const constituencyId of constituencyIds) {
    if ((constituencySeats[constituencyId] ?? 0) <= 0) continue;
    const allocation = allocateByHare(
      constituencyVotes[constituencyId] ?? {},
      constituencySeats[constituencyId] ?? 0,
      `ripartizione circoscrizionale Camera ${constituencyId}`,
      "AC 2822-A articolo 83, comma 1, lettera h)"
    );
    initial[constituencyId] = allocation.seats;
    remainders[constituencyId] = allocation.remainders;
    ties.push(...allocation.ties);
  }

  const compensated = compensateToTargets(initial, remainders, national.ordinarySeats, national.votes);
  for (const [territoryId, seats] of Object.entries(compensated)) {
    results.push({ chamber: "camera", scope: "constituency", territoryId, seats });
  }
  const districtResult = allocateDistricts("camera", input, compensated, bonusAwarded);
  results.push(...districtResult.results);
  ties.push(...districtResult.ties);
  return { results, ties, nationalSeatTargets: national.ordinarySeats };
}

function allocateSenateRegions(
  input: ElectionInput,
  national: NationalResult,
  bonus: BonusDecision,
  maximumWinnerOrdinarySeats?: number
): TerritorialAllocationResult {
  const results: TerritorialSeatResult[] = [];
  const ties: TieResolutionRequired[] = [];
  const regionVotes = votesByTerritory("regionId", "senate", input, Object.keys(national.seats));
  const allocations = new Map<string, ReturnType<typeof allocateByHare>>();

  for (const region of input.regions) {
    const hasStandardDistrict = input.multiMemberDistricts.some(
      (district) => district.chamber === "senate" && district.regionId === region.id && !specialTerritoryForMultiMemberDistrict(district)
    );
    if (!hasStandardDistrict) continue;
    const seats = seatsInRegion("senate", input, region.id, bonus.awarded);
    if (seats <= 0) continue;
    const allocation = allocateByHare(
      regionVotes[region.id] ?? {},
      seats,
      `ripartizione regionale Senato ${region.id}`,
      "AC 2822-A articolo 16-bis, comma 1, lettera f) e comma 1-bis"
    );
    results.push({ chamber: "senate", scope: "region", territoryId: region.id, seats: allocation.seats });
    allocations.set(region.id, allocation);
    ties.push(...allocation.ties);
  }

  if (bonus.awarded && bonus.winnerId && maximumWinnerOrdinarySeats !== undefined) {
    capSenateWinnerByRegion(
      results,
      allocations,
      regionVotes,
      bonus.winnerId,
      maximumWinnerOrdinarySeats,
      ties
    );
  }

  const nationalSeatTargets = sumSeatTargets(results.filter((result) => result.scope === "region"));

  const districtTargets = Object.fromEntries(
    results.filter((result) => result.scope === "region").map((result) => [result.territoryId, result.seats])
  );
  const districtResult = allocateDistricts("senate", input, districtTargets, bonus.awarded);
  results.push(...districtResult.results);
  ties.push(...districtResult.ties);
  return { results, ties, nationalSeatTargets };
}

function allocateDistricts(
  chamber: Chamber,
  input: ElectionInput,
  parentTargets: Record<string, Record<string, number>>,
  bonusAwarded: boolean
): TerritorialAllocationResult {
  const results: TerritorialSeatResult[] = [];
  const ties: TieResolutionRequired[] = [];
  for (const [parentId, targetSeats] of Object.entries(parentTargets)) {
    for (const subject of Object.keys(targetSeats)) {
      const districts = input.multiMemberDistricts.filter((district) =>
        chamber === "camera"
          ? district.chamber === chamber && district.constituencyId === parentId && !specialTerritoryForMultiMemberDistrict(district)
          : district.chamber === chamber && district.regionId === parentId && !specialTerritoryForMultiMemberDistrict(district)
      );
      const subjectLists = listIdsForSubject(input, subject);
      const votes = Object.fromEntries(
        districts.map((district) => [
          district.id,
          input.listVotes
            .filter((vote) => vote.chamber === chamber && vote.districtId === district.id && subjectLists.has(vote.listId))
            .reduce((sum, vote) => sum + vote.votes, 0n)
        ])
      );
      const seatCount = targetSeats[subject] ?? 0;
      if (seatCount <= 0) continue;
      const allocation = allocateByHare(
        votes,
        seatCount,
        `attribuzione collegi ${chamber} ${parentId} ${subject}`,
        chamber === "camera" ? "AC 2822-A articolo 83-bis" : "AC 2822-A articolo 17"
      );
      for (const [districtId, seats] of Object.entries(allocation.seats)) {
        const existing = results.find((result) => result.territoryId === districtId);
        if (existing) existing.seats[subject] = seats;
        else results.push({ chamber, scope: "district", territoryId: districtId, seats: { [subject]: seats } });
      }
      ties.push(...allocation.ties);
    }
  }
  rebalanceDistrictCapacities(chamber, input, results, bonusAwarded, ties);
  return { results, ties, nationalSeatTargets: sumSeatTargets(results) };
}

function votesByTerritory(
  key: "constituencyId" | "regionId",
  chamber: Chamber,
  input: ElectionInput,
  subjects: string[]
): Record<string, Record<string, bigint>> {
  const districts = new Map(input.multiMemberDistricts.map((district) => [district.id, district]));
  const result: Record<string, Record<string, bigint>> = {};
  for (const vote of input.listVotes) {
    if (vote.chamber !== chamber) continue;
    const district = districts.get(vote.districtId);
    if (!district || specialTerritoryForMultiMemberDistrict(district)) continue;
    const territoryId = district[key];
    if (!territoryId) continue;
    const subjectId = subjectForList(input, vote.listId, subjects);
    if (!subjectId) continue;
    result[territoryId] = result[territoryId] ?? {};
    result[territoryId][subjectId] = (result[territoryId][subjectId] ?? 0n) + vote.votes;
  }
  return result;
}

function subjectForList(input: ElectionInput, listId: string, subjects: string[]): string | undefined {
  const subjectSet = new Set(subjects);
  if (subjectSet.has(listId)) return listId;
  const list = input.lists.find((item) => item.id === listId);
  return list?.coalitionId && subjectSet.has(list.coalitionId) ? list.coalitionId : undefined;
}

function listIdsForSubject(input: ElectionInput, subjectId: string): Set<string> {
  const coalition = input.coalitions.find((item) => item.id === subjectId);
  return new Set(coalition?.listIds ?? [subjectId]);
}

function seatsInConstituency(chamber: Chamber, input: ElectionInput, constituencyId: string, bonusAwarded: boolean): number {
  return input.multiMemberDistricts
    .filter((district) => district.chamber === chamber && district.constituencyId === constituencyId && !specialTerritoryForMultiMemberDistrict(district))
    .reduce((sum, district) => sum + seatsForMode(district, bonusAwarded), 0);
}

function seatsInRegion(chamber: Chamber, input: ElectionInput, regionId: string, bonusAwarded: boolean): number {
  return input.multiMemberDistricts
    .filter((district) => district.chamber === chamber && district.regionId === regionId && !specialTerritoryForMultiMemberDistrict(district))
    .reduce((sum, district) => sum + seatsForMode(district, bonusAwarded), 0);
}

function seatsForMode(
  district: ElectionInput["multiMemberDistricts"][number],
  bonusAwarded: boolean
): number {
  return bonusAwarded ? district.seatsWithBonus : district.seatsWithoutBonus;
}

function sumSeatTargets(results: TerritorialSeatResult[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const result of results) {
    for (const [subject, seats] of Object.entries(result.seats)) {
      totals[subject] = (totals[subject] ?? 0) + seats;
    }
  }
  return totals;
}

function capSenateWinnerByRegion(
  results: TerritorialSeatResult[],
  allocations: Map<string, ReturnType<typeof allocateByHare>>,
  regionVotes: Record<string, Record<string, bigint>>,
  winnerId: string,
  maximumWinnerOrdinarySeats: number,
  ties: TieResolutionRequired[]
) {
  let excess = (sumSeatTargets(results)[winnerId] ?? 0) - maximumWinnerOrdinarySeats;
  while (excess > 0) {
    const source = results
      .filter((result) => (result.seats[winnerId] ?? 0) > 0)
      .sort((a, b) => {
        const aRemainder = allocations.get(a.territoryId)?.remainders[winnerId] ?? { numerator: 0n, denominator: 1n };
        const bRemainder = allocations.get(b.territoryId)?.remainders[winnerId] ?? { numerator: 0n, denominator: 1n };
        return compareRemainders(aRemainder, bRemainder) || a.territoryId.localeCompare(b.territoryId);
      })[0];
    if (!source) break;
    const allocation = allocations.get(source.territoryId);
    const recipient = Object.keys(regionVotes[source.territoryId] ?? {})
      .filter((subject) => subject !== winnerId)
      .sort((a, b) => {
        const aRemainder = allocation?.remainders[a] ?? { numerator: 0n, denominator: 1n };
        const bRemainder = allocation?.remainders[b] ?? { numerator: 0n, denominator: 1n };
        const remainderOrder = compareRemainders(bRemainder, aRemainder);
        if (remainderOrder !== 0) return remainderOrder;
        const voteDifference = (regionVotes[source.territoryId]?.[b] ?? 0n) - (regionVotes[source.territoryId]?.[a] ?? 0n);
        return voteDifference === 0n ? a.localeCompare(b) : voteDifference > 0n ? 1 : -1;
      })[0];
    if (!recipient) {
      ties.push({
        subjects: [winnerId],
        stage: `limite massimo premio senate ${source.territoryId}`,
        affectedSeats: [`${source.territoryId}-cap`],
        legalRule: "AC 2822-A articolo 16-bis, comma 1-ter; nessun destinatario regionale disponibile"
      });
      break;
    }
    source.seats[winnerId] -= 1;
    source.seats[recipient] = (source.seats[recipient] ?? 0) + 1;
    excess -= 1;
  }
}

function compareRemainders(
  a: { numerator: bigint; denominator: bigint },
  b: { numerator: bigint; denominator: bigint }
): number {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;
  return left === right ? 0 : left > right ? 1 : -1;
}

function rebalanceDistrictCapacities(
  chamber: Chamber,
  input: ElectionInput,
  results: TerritorialSeatResult[],
  bonusAwarded: boolean,
  ties: TieResolutionRequired[]
) {
  const resultByDistrict = new Map(results.map((result) => [result.territoryId, result]));
  const districts = input.multiMemberDistricts.filter(
    (district) => district.chamber === chamber && !specialTerritoryForMultiMemberDistrict(district)
  );
  const total = (districtId: string) => Object.values(resultByDistrict.get(districtId)?.seats ?? {}).reduce((sum, value) => sum + value, 0);

  while (true) {
    const over = districts.find((district) => total(district.id) > seatsForMode(district, bonusAwarded));
    const under = districts.find((district) => total(district.id) < seatsForMode(district, bonusAwarded));
    if (!over || !under) break;
    const source = resultByDistrict.get(over.id);
    if (!source) break;
    const subject = Object.entries(source.seats)
      .filter(([, seats]) => seats > 0)
      .sort(([a], [b]) => {
        const voteDifference = districtSubjectVotes(input, chamber, under.id, b) - districtSubjectVotes(input, chamber, under.id, a);
        return voteDifference === 0n ? a.localeCompare(b) : voteDifference > 0n ? 1 : -1;
      })[0]?.[0];
    if (!subject) break;
    let target = resultByDistrict.get(under.id);
    if (!target) {
      target = { chamber, scope: "district", territoryId: under.id, seats: {} };
      results.push(target);
      resultByDistrict.set(under.id, target);
    }
    source.seats[subject] -= 1;
    target.seats[subject] = (target.seats[subject] ?? 0) + 1;
  }

  const mismatched = districts.filter((district) => total(district.id) !== seatsForMode(district, bonusAwarded));
  if (mismatched.length > 0) {
    ties.push({
      subjects: [],
      stage: `capienza collegi ${chamber}`,
      affectedSeats: mismatched.map((district) => district.id),
      legalRule: "AC 2822-A riparto territoriale; capienza del collegio non riconciliata"
    });
  }
}

function districtSubjectVotes(input: ElectionInput, chamber: Chamber, districtId: string, subjectId: string): bigint {
  const lists = listIdsForSubject(input, subjectId);
  return input.listVotes
    .filter((vote) => vote.chamber === chamber && vote.districtId === districtId && lists.has(vote.listId))
    .reduce((sum, vote) => sum + vote.votes, 0n);
}
