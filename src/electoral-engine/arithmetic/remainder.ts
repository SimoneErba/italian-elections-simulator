import type { Fraction } from "./fraction";
import { compareFractions } from "./fraction";
import { rankByFraction } from "./ranking";

export function assignLargestRemainders(
  remainders: Record<string, Fraction>,
  votes: Record<string, bigint>,
  seatsToAssign: number
): Record<string, number> {
  const assigned: Record<string, number> = {};
  const ranking = rankByFraction(
    Object.entries(remainders).map(([subject, value]) => ({
      subject,
      value,
      votes: votes[subject] ?? 0n
    }))
  );

  for (const item of ranking.slice(0, seatsToAssign)) {
    assigned[item.subject] = (assigned[item.subject] ?? 0) + 1;
  }

  return assigned;
}

export function findBoundaryTie(
  remainders: Record<string, Fraction>,
  votes: Record<string, bigint>,
  seatsToAssign: number
): string[] {
  if (seatsToAssign <= 0) return [];
  const ranking = rankByFraction(
    Object.entries(remainders).map(([subject, value]) => ({
      subject,
      value,
      votes: votes[subject] ?? 0n
    }))
  );
  const boundary = ranking[seatsToAssign - 1];
  const next = ranking[seatsToAssign];
  if (!boundary || !next) return [];
  if (compareFractions(boundary.value, next.value) !== 0) return [];
  if ((boundary.votes ?? 0n) !== (next.votes ?? 0n)) return [];
  return ranking
    .filter(
      (item) =>
        compareFractions(item.value, boundary.value) === 0 &&
        (item.votes ?? 0n) === (boundary.votes ?? 0n)
    )
    .map((item) => item.subject);
}
