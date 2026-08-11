import { compareFractions, type Fraction } from "./fraction";

export type RankedValue<T extends string> = {
  subject: T;
  value: Fraction;
  votes?: bigint;
};

export function rankByFraction<T extends string>(values: RankedValue<T>[]): RankedValue<T>[] {
  return [...values].sort((a, b) => {
    const byValue = compareFractions(b.value, a.value);
    if (byValue !== 0) return byValue;
    if (a.votes !== undefined && b.votes !== undefined && a.votes !== b.votes) {
      return a.votes > b.votes ? -1 : 1;
    }
    return a.subject.localeCompare(b.subject);
  });
}
