import type { AllocatedForeignList, ForeignList, ForeignListSeatAllocation, ForeignTie } from "./types";

export function allocateForeignListSeats(lists: ForeignList[], seats: number): ForeignListSeatAllocation {
  if (!Number.isInteger(seats) || seats <= 0) {
    throw new Error("Foreign list allocation requires a positive integer seat count.");
  }
  for (const list of lists) {
    if (!Number.isInteger(list.votes) || list.votes < 0) {
      throw new Error(`Invalid vote count for foreign list ${list.id}.`);
    }
  }

  const activeLists = lists.filter((list) => list.votes > 0);
  const totalVotes = activeLists.reduce((sum, list) => sum + list.votes, 0);
  if (totalVotes <= 0) {
    return {
      quota: 0,
      lists: lists.map((list) => ({ ...list, seats: 0, integerSeats: 0, remainder: 0 })),
      ties: [
        {
          stage: "riparto estero liste",
          subjects: lists.map((list) => list.id),
          affectedSeats: Array.from({ length: seats }, (_, index) => `foreign-list-unallocated-${index + 1}`),
          legalRule: "Legge 459/2001 articolo 15; nessun voto positivo disponibile per il riparto"
        }
      ]
    };
  }

  const quota = Math.floor(totalVotes / seats);
  if (quota <= 0) {
    throw new Error("Foreign list quota must be positive.");
  }

  const allocatedById = new Map<string, AllocatedForeignList>();
  for (const list of lists) {
    const integerSeats = list.votes > 0 ? Math.floor(list.votes / quota) : 0;
    allocatedById.set(list.id, {
      ...list,
      seats: integerSeats,
      integerSeats,
      remainder: list.votes - integerSeats * quota
    });
  }

  const assignedByInteger = [...allocatedById.values()].reduce((sum, list) => sum + list.seats, 0);
  let remaining = seats - assignedByInteger;
  if (remaining < 0) {
    throw new Error("Foreign list integer quota over-allocated seats.");
  }

  const ranking = [...allocatedById.values()].sort(compareForeignRemainderRank);
  const ties = findRemainderBoundaryTie(ranking, remaining);
  let assignableRemainderSeats = remaining;
  if (ties.length > 1) {
    const firstTieIndex = ranking.findIndex((list) => ties.includes(list.id));
    assignableRemainderSeats = Math.max(0, firstTieIndex);
  }

  for (const list of ranking.slice(0, assignableRemainderSeats)) {
    list.seats += 1;
    remaining -= 1;
  }

  const unresolvedTies: ForeignTie[] =
    ties.length > 1
      ? [
          {
            stage: "riparto estero liste",
            subjects: ties,
            affectedSeats: Array.from(
              { length: remaining },
              (_, index) => `foreign-list-remainder-boundary-${index + 1}`
            ),
            legalRule:
              "Legge 459/2001 articolo 15; parita' di resto e cifra elettorale tra liste nella ripartizione"
          }
        ]
      : [];

  return { quota, lists: lists.map((list) => allocatedById.get(list.id)!), ties: unresolvedTies };
}

function compareForeignRemainderRank(a: AllocatedForeignList, b: AllocatedForeignList): number {
  return b.remainder - a.remainder || b.votes - a.votes || a.id.localeCompare(b.id);
}

function findRemainderBoundaryTie(ranking: AllocatedForeignList[], seatsToAssign: number): string[] {
  if (seatsToAssign <= 0) return [];
  const boundary = ranking[seatsToAssign - 1];
  const next = ranking[seatsToAssign];
  if (!boundary || !next) return [];
  if (boundary.remainder !== next.remainder || boundary.votes !== next.votes) return [];
  return ranking
    .filter((list) => list.remainder === boundary.remainder && list.votes === boundary.votes)
    .map((list) => list.id);
}
