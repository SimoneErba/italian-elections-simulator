import { percentage } from "../arithmetic/fraction";
import { hareQuotient, integerSeatsByQuotient, remainderByQuotient } from "../arithmetic/quotient";
import { assignLargestRemainders, findBoundaryTie } from "../arithmetic/remainder";
import type { Chamber } from "../domain/chamber";
import type { AllocationSubject, AllocationStep, ElectionInput, NationalResult, ThresholdResult } from "../domain/election";
import type { TieResolutionRequired } from "../domain/trace";
import type { ChamberVoteTotals } from "./aggregate-votes";
import { allocateByHare } from "./proportional-allocation";

export type NationalAllocationResult = {
  result: NationalResult;
  ties: TieResolutionRequired[];
};

export function allocateNationalSeats(
  chamber: Chamber,
  input: ElectionInput,
  totals: ChamberVoteTotals,
  thresholds: ThresholdResult,
  seats: number
): NationalAllocationResult {
  const coalitionIds = new Set(input.coalitions.map((coalition) => coalition.id));
  const admittedSubjectIds = [...thresholds.admittedCoalitions, ...thresholds.admittedSingleLists];
  const subjectVotes = Object.fromEntries(admittedSubjectIds.map((id) => [id, totals.subjectVotes[id] ?? 0n]));
  const allocationResult = allocateByHare(
    subjectVotes,
    seats,
    `ripartizione nazionale ${chamber}`,
    "AC 2822-A articolo 83, comma 1, lettera f); articolo 16-bis, comma 1, lettera f)"
  );
  const subjects: AllocationSubject[] = Object.entries(subjectVotes)
    .filter(([, votes]) => votes > 0n)
    .map(([id, votes]) => ({
      id,
      kind: coalitionIds.has(id) ? "coalition" : "list",
      votes
    }));

  const percentages = Object.fromEntries(
    Object.entries(subjectVotes).map(([subject, votes]) => [subject, percentage(votes, totals.totalValidVotes)])
  );
  const allocation: AllocationStep = {
    chamber,
    availableSeats: seats,
    subjects,
    quotient: allocationResult.quotient,
    integerSeats: allocationResult.integerSeats,
    remainderSeats: allocationResult.remainderSeats
  };

  return {
    result: {
      chamber,
      totalValidVotes: totals.totalValidVotes,
      seats: allocationResult.seats,
      ordinarySeats: allocationResult.seats,
      votes: subjectVotes,
      percentages,
      allocation
    },
    ties: allocationResult.ties
  };
}
