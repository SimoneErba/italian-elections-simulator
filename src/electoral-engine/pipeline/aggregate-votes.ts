import type { Chamber } from "../domain/chamber";
import type { ElectionInput } from "../domain/election";
import { chambers } from "../domain/chamber";
import { specialTerritoryForMultiMemberDistrict } from "./special-territories";
import { compareFractions, fraction, percentage } from "../arithmetic/fraction";

export type ChamberVoteTotals = {
  chamber: Chamber;
  totalValidVotes: bigint;
  listVotes: Record<string, bigint>;
  coalitionVotes: Record<string, bigint>;
  subjectVotes: Record<string, bigint>;
};

export function aggregateVotes(
  input: ElectionInput,
  includeSpecialTerritoriesForBonus = false
): Record<Chamber, ChamberVoteTotals> {
  const result = Object.fromEntries(
    chambers.map((chamber) => [
      chamber,
      {
        chamber,
        totalValidVotes: 0n,
        listVotes: {},
        coalitionVotes: {},
        subjectVotes: {}
      }
    ])
  ) as Record<Chamber, ChamberVoteTotals>;

  const listsById = new Map(input.lists.map((list) => [list.id, list]));
  const districtsById = new Map(input.multiMemberDistricts.map((district) => [district.id, district]));

  for (const vote of input.listVotes) {
    const district = districtsById.get(vote.districtId);
    const specialTerritory = district ? specialTerritoryForMultiMemberDistrict(district) : undefined;
    if (specialTerritory && !includeSpecialTerritoriesForBonus) continue;

    const chamberTotals = result[vote.chamber];
    chamberTotals.totalValidVotes += vote.votes;
    chamberTotals.listVotes[vote.listId] = (chamberTotals.listVotes[vote.listId] ?? 0n) + vote.votes;

    const list = listsById.get(vote.listId);
    if (list?.coalitionId) chamberTotals.coalitionVotes[list.coalitionId] = chamberTotals.coalitionVotes[list.coalitionId] ?? 0n;
  }

  for (const chamber of chambers) {
    const totals = result[chamber];
    const coalitionListIds = new Set(input.coalitions.flatMap((coalition) => coalition.listIds));
    for (const coalition of input.coalitions) {
      totals.coalitionVotes[coalition.id] = coalition.listIds
        .filter((listId) => listCountsForCoalition(input, listId, totals.listVotes[listId] ?? 0n, totals.totalValidVotes))
        .reduce((sum, listId) => sum + (totals.listVotes[listId] ?? 0n), 0n);
    }
    totals.subjectVotes = { ...totals.coalitionVotes };
    for (const [listId, votes] of Object.entries(totals.listVotes)) {
      if (!coalitionListIds.has(listId)) {
        totals.subjectVotes[listId] = votes;
      }
    }
  }

  return result;
}

function listCountsForCoalition(input: ElectionInput, listId: string, votes: bigint, totalValidVotes: bigint): boolean {
  const list = input.lists.find((item) => item.id === listId);
  if (list?.isLinguisticMinority) return true;
  return compareFractions(percentage(votes, totalValidVotes), fraction(1n)) >= 0;
}
