import { fraction, type Fraction } from "./fraction";

export function hareQuotient(totalVotes: bigint, seats: number): Fraction {
  if (seats <= 0) throw new Error("Seat count must be positive");
  return fraction(totalVotes, BigInt(seats));
}

export function integerSeatsByQuotient(votes: bigint, quotient: Fraction): number {
  if (quotient.numerator === 0n) return 0;
  return Number((votes * quotient.denominator) / quotient.numerator);
}

export function remainderByQuotient(votes: bigint, quotient: Fraction, integerSeats: number): Fraction {
  return fraction(votes * quotient.denominator - BigInt(integerSeats) * quotient.numerator, quotient.denominator);
}
