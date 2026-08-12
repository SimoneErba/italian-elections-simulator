import type { Fraction } from "../arithmetic/fraction";
import { compareFractions, fraction } from "../arithmetic/fraction";
import { hareQuotient, integerSeatsByQuotient, remainderByQuotient } from "../arithmetic/quotient";
import { assignLargestRemainders, findBoundaryTie } from "../arithmetic/remainder";
import { rankByFraction } from "../arithmetic/ranking";
import type { TieResolutionRequired } from "../domain/trace";

export type ProportionalAllocation = {
  seats: Record<string, number>;
  quotient: Fraction;
  integerSeats: Record<string, number>;
  remainders: Record<string, Fraction>;
  remainderSeats: Record<string, number>;
  ties: TieResolutionRequired[];
};

export function allocateByHare(
  votes: Record<string, bigint>,
  seatCount: number,
  stage: string,
  legalRule: string,
  tieVoteScope: "national" | "regional" | "local" = "national"
): ProportionalAllocation {
  const activeVotes = Object.fromEntries(Object.entries(votes).filter(([, value]) => value > 0n));
  const totalVotes = Object.values(activeVotes).reduce((sum, value) => sum + value, 0n);
  if (totalVotes === 0n) {
    return {
      seats: {},
      quotient: fraction(0n),
      integerSeats: {},
      remainders: {},
      remainderSeats: {},
      ties: [
        {
          subjects: Object.keys(votes),
          stage,
          affectedSeats: Array.from({ length: seatCount }, (_, index) => `${stage}-unallocated-${index + 1}`),
          legalRule: `${legalRule}; nessun voto positivo disponibile per il riparto`
        }
      ]
    };
  }
  const quotient = hareQuotient(totalVotes, seatCount);
  const integerSeats: Record<string, number> = {};
  const remainders: Record<string, Fraction> = {};
  for (const [subjectId, value] of Object.entries(activeVotes)) {
    integerSeats[subjectId] = integerSeatsByQuotient(value, quotient);
    remainders[subjectId] = remainderByQuotient(value, quotient, integerSeats[subjectId]);
  }
  const assignedByInteger = Object.values(integerSeats).reduce((sum, value) => sum + value, 0);
  const seatsToAssign = seatCount - assignedByInteger;
  const boundaryTie = findBoundaryTie(remainders, activeVotes, seatsToAssign);
  const ranking = rankByFraction(
    Object.entries(remainders).map(([subject, value]) => ({ subject, value, votes: activeVotes[subject] ?? 0n }))
  );
  const firstTiedIndex = boundaryTie.length > 1
    ? ranking.findIndex((item) => boundaryTie.includes(item.subject))
    : seatsToAssign;
  const safelyAssignableRemainderSeats = firstTiedIndex < 0 ? seatsToAssign : firstTiedIndex;
  const remainderSeats = assignLargestRemainders(remainders, activeVotes, safelyAssignableRemainderSeats);
  const ties =
    boundaryTie.length > 1
      ? [
          {
            subjects: boundaryTie,
            stage,
            affectedSeats: Array.from(
              { length: seatsToAssign - safelyAssignableRemainderSeats },
              (_, index) => `${stage}-remainder-boundary-${index + 1}`
            ),
            legalRule: `${legalRule}; tie vote scope: ${tieVoteScope}`
          }
        ]
      : [];
  const seats = Object.fromEntries(
    Object.keys(activeVotes).map((subjectId) => [
      subjectId,
      (integerSeats[subjectId] ?? 0) + (remainderSeats[subjectId] ?? 0)
    ])
  );
  return { seats, quotient, integerSeats, remainders, remainderSeats, ties };
}

export function compensateToTargets(
  initialSeats: Record<string, Record<string, number>>,
  remainders: Record<string, Record<string, Fraction>>,
  targetSeats: Record<string, number>,
  nationalVotes: Record<string, bigint>
): Record<string, Record<string, number>> {
  const current = structuredClone(initialSeats);
  while (true) {
    const totals = totalsBySubject(current);
    const deficitSubjects = Object.entries(targetSeats)
      .filter(([subject, seats]) => (totals[subject] ?? 0) < seats)
      .map(([subject]) => subject);
    if (deficitSubjects.length === 0) return current;
    const surplusSubjects = Object.entries(totals)
      .filter(([subject, seats]) => seats > (targetSeats[subject] ?? 0))
      .map(([subject]) => subject);
    if (surplusSubjects.length === 0) return current;

    const adjustment = deficitSubjects
      .flatMap((deficitSubject) =>
        Object.keys(current)
          .filter((territoryId) => remainders[territoryId]?.[deficitSubject])
          .map((territoryId) => ({ deficitSubject, territoryId, remainder: remainders[territoryId][deficitSubject] }))
      )
      .filter((item) =>
        surplusSubjects.some((surplusSubject) => (current[item.territoryId]?.[surplusSubject] ?? 0) > 0)
      )
      .sort(
        (a, b) =>
          compareFractions(b.remainder, a.remainder) ||
          compareVotes(b.deficitSubject, a.deficitSubject, nationalVotes) ||
          a.territoryId.localeCompare(b.territoryId)
      )[0];
    if (!adjustment) return current;

    const surplusSubject = surplusSubjects
      .filter((subject) => (current[adjustment.territoryId]?.[subject] ?? 0) > 0)
      .sort(
        (a, b) =>
          compareFractions(
            remainders[adjustment.territoryId]?.[a] ?? { numerator: 0n, denominator: 1n },
            remainders[adjustment.territoryId]?.[b] ?? { numerator: 0n, denominator: 1n }
          ) ||
          compareVotes(a, b, nationalVotes)
      )[0];
    if (!surplusSubject) return current;

    current[adjustment.territoryId][surplusSubject] -= 1;
    current[adjustment.territoryId][adjustment.deficitSubject] = (current[adjustment.territoryId][adjustment.deficitSubject] ?? 0) + 1;
  }
}

function totalsBySubject(seatsByTerritory: Record<string, Record<string, number>>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const seats of Object.values(seatsByTerritory)) {
    for (const [subject, value] of Object.entries(seats)) totals[subject] = (totals[subject] ?? 0) + value;
  }
  return totals;
}

function compareVotes(a: string, b: string, votes: Record<string, bigint>): number {
  const diff = (votes[a] ?? 0n) - (votes[b] ?? 0n);
  if (diff !== 0n) return diff > 0n ? 1 : -1;
  return b.localeCompare(a);
}
