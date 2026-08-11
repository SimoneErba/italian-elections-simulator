import { compareFractions, percentage } from "../arithmetic/fraction";
import type { Chamber } from "../domain/chamber";
import type { ElectionInput, ThresholdResult } from "../domain/election";
import type { ChamberVoteTotals } from "./aggregate-votes";
import { fraction } from "../arithmetic/fraction";
import { specialTerritoryForMultiMemberDistrict } from "./special-territories";

type RegionVotes = Record<string, Record<string, bigint>>;

export function calculateThresholds(
  chamber: Chamber,
  input: ElectionInput,
  totals: ChamberVoteTotals
): ThresholdResult {
  const listsByCoalition = new Map<string, string[]>();
  for (const list of input.lists) {
    if (list.coalitionId) {
      listsByCoalition.set(list.coalitionId, [...(listsByCoalition.get(list.coalitionId) ?? []), list.id]);
    }
  }

  const regionalVotes = listVotesByRegion(chamber, input);
  const admittedCoalitions: string[] = [];
  const admittedSingleLists: string[] = [];
  const admittedCoalitionLists: Record<string, string[]> = {};
  const recoveredCoalitionLists: Record<string, string | undefined> = {};
  const excludedLists = new Set<string>();

  for (const coalition of input.coalitions) {
    const coalitionVotes = totals.coalitionVotes[coalition.id] ?? 0n;
    const coalitionPercent = percentage(coalitionVotes, totals.totalValidVotes);
    const hasAdmittedList = coalition.listIds.some((listId) =>
      listPassesListThreshold(chamber, listId, input, totals, regionalVotes)
    );
    if (compareFractions(coalitionPercent, fraction(10n)) >= 0 && hasAdmittedList) {
      admittedCoalitions.push(coalition.id);
      const admittedLists = coalition.listIds.filter((listId) =>
        listPassesCoalitionInternalThreshold(chamber, listId, input, totals, regionalVotes)
      );
      const recovered = strongestExcludedList(coalition.listIds, admittedLists, totals.listVotes);
      admittedCoalitionLists[coalition.id] = recovered ? [...admittedLists, recovered] : admittedLists;
      recoveredCoalitionLists[coalition.id] = recovered;
    }
  }

  const admittedCoalitionSet = new Set(admittedCoalitions);
  for (const list of input.lists) {
    if (list.coalitionId && admittedCoalitionSet.has(list.coalitionId)) continue;
    if (listPassesListThreshold(chamber, list.id, input, totals, regionalVotes)) {
      admittedSingleLists.push(list.id);
    } else {
      excludedLists.add(list.id);
    }
  }

  for (const coalition of input.coalitions) {
    for (const listId of coalition.listIds) {
      if (!admittedCoalitionLists[coalition.id]?.includes(listId)) excludedLists.add(listId);
    }
  }

  return {
    chamber,
    admittedCoalitions,
    admittedSingleLists,
    admittedCoalitionLists,
    recoveredCoalitionLists,
    excludedLists: [...excludedLists].sort()
  };
}

function listPassesListThreshold(
  chamber: Chamber,
  listId: string,
  input: ElectionInput,
  totals: ChamberVoteTotals,
  regionalVotes: RegionVotes
): boolean {
  const nationalPercent = percentage(totals.listVotes[listId] ?? 0n, totals.totalValidVotes);
  return (
    compareFractions(nationalPercent, fraction(3n)) >= 0 ||
    passesRegional20(chamber, listId, input, regionalVotes) ||
    passesLinguisticMinority20(listId, input, regionalVotes)
  );
}

function listPassesCoalitionInternalThreshold(
  chamber: Chamber,
  listId: string,
  input: ElectionInput,
  totals: ChamberVoteTotals,
  regionalVotes: RegionVotes
): boolean {
  const nationalPercent = percentage(totals.listVotes[listId] ?? 0n, totals.totalValidVotes);
  return (
    compareFractions(nationalPercent, fraction(3n)) >= 0 ||
    (chamber === "senate" && passesRegional20(chamber, listId, input, regionalVotes)) ||
    passesLinguisticMinority20(listId, input, regionalVotes)
  );
}

function passesRegional20(_chamber: Chamber, listId: string, input: ElectionInput, regionalVotes: RegionVotes): boolean {
  for (const region of input.regions) {
    const total = Object.values(regionalVotes[region.id] ?? {}).reduce((sum, votes) => sum + votes, 0n);
    if (compareFractions(percentage(regionalVotes[region.id]?.[listId] ?? 0n, total), fraction(20n)) >= 0) {
      return true;
    }
  }
  return false;
}

function passesLinguisticMinority20(listId: string, input: ElectionInput, regionalVotes: RegionVotes): boolean {
  const list = input.lists.find((item) => item.id === listId);
  if (!list?.isLinguisticMinority || !list.protectedRegionId) return false;
  const regionVotes = regionalVotes[list.protectedRegionId] ?? {};
  const total = Object.values(regionVotes).reduce((sum, votes) => sum + votes, 0n);
  return compareFractions(percentage(regionVotes[listId] ?? 0n, total), fraction(20n)) >= 0;
}

function strongestExcludedList(
  coalitionListIds: string[],
  admittedListIds: string[],
  listVotes: Record<string, bigint>
): string | undefined {
  const admitted = new Set(admittedListIds);
  return coalitionListIds
    .filter((listId) => !admitted.has(listId))
    .sort((a, b) => {
      const voteDiff = (listVotes[b] ?? 0n) - (listVotes[a] ?? 0n);
      if (voteDiff !== 0n) return voteDiff > 0n ? 1 : -1;
      return a.localeCompare(b);
    })[0];
}

function listVotesByRegion(chamber: Chamber, input: ElectionInput): RegionVotes {
  const districts = new Map(input.multiMemberDistricts.map((district) => [district.id, district]));
  const result: RegionVotes = {};
  for (const vote of input.listVotes) {
    if (vote.chamber !== chamber) continue;
    const district = districts.get(vote.districtId);
    if (!district) continue;
    const specialTerritory = specialTerritoryForMultiMemberDistrict(district);
    if (specialTerritory) continue;
    const regionId = district.regionId;
    result[regionId] = result[regionId] ?? {};
    result[regionId][vote.listId] = (result[regionId][vote.listId] ?? 0n) + vote.votes;
  }
  return result;
}
