import { allocateForeignListSeats } from "./allocateListSeats";
import { electForeignCandidates } from "./electCandidates";
import type { ForeignChamber, ForeignChamberId, ForeignChamberResult } from "./types";

export function calculateForeignSeats(chamberId: ForeignChamberId, chamber: ForeignChamber): ForeignChamberResult {
  const partitionResults: ForeignChamberResult["partitionResults"] = [];
  const electedCandidates: ForeignChamberResult["electedCandidates"] = [];
  const ties: ForeignChamberResult["ties"] = [];

  for (const partition of chamber.partitions) {
    const allocation = allocateForeignListSeats(partition.lists, partition.seats);
    ties.push(...allocation.ties);
    const seats: Record<string, number> = {};
    for (const list of allocation.lists) {
      if (list.seats <= 0) continue;
      seats[list.id] = list.seats;
      const elected = electForeignCandidates(list, list.seats);
      elected.forEach((candidate, index) => {
        electedCandidates.push({
          chamber: chamberId,
          partitionId: partition.id,
          listId: list.id,
          candidate,
          seatNumber: index + 1
        });
      });
      if (elected.length < list.seats) {
        ties.push({
          stage: `proclamazione candidati estero ${partition.id}`,
          subjects: [list.id],
          affectedSeats: [`${partition.id}-${list.id}`],
          legalRule: "Legge 459/2001 articolo 15; candidati insufficienti nella lista estero"
        });
      }
    }
    partitionResults.push({ partitionId: partition.id, seats, quota: allocation.quota });
  }

  return { chamber: chamberId, partitionResults, electedCandidates, ties };
}
