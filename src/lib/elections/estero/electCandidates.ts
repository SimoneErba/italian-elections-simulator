import type { ForeignCandidate, ForeignList } from "./types";

function preferenceRank(candidate: ForeignCandidate): number {
  return candidate.preferences ?? -1;
}

export function electForeignCandidates(list: ForeignList, seats: number): ForeignCandidate[] {
  if (!Number.isInteger(seats) || seats < 0) {
    throw new Error("Foreign candidate election requires a non-negative integer seat count.");
  }
  return [...list.candidates]
    .sort(
      (a, b) =>
        preferenceRank(b) - preferenceRank(a) ||
        a.list_position - b.list_position ||
        a.name.localeCompare(b.name)
    )
    .slice(0, seats);
}
