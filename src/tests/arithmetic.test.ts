import { describe, expect, it } from "vitest";
import { compareFractions, fraction, percentage } from "../electoral-engine/arithmetic/fraction";
import { hareQuotient, integerSeatsByQuotient, remainderByQuotient } from "../electoral-engine/arithmetic/quotient";
import { allocateByHare } from "../electoral-engine/pipeline/proportional-allocation";

describe("exact arithmetic", () => {
  it("reduces and compares fractions without floating point numbers", () => {
    expect(fraction(42n, 100n)).toEqual({ numerator: 21n, denominator: 50n });
    expect(compareFractions(fraction(1n, 3n), fraction(333n, 1000n))).toBe(1);
    expect(percentage(42n, 100n)).toEqual({ numerator: 42n, denominator: 1n });
  });

  it("calculates quotient seats and remainders exactly", () => {
    const quotient = hareQuotient(1_000n, 7);
    const seats = integerSeatsByQuotient(430n, quotient);
    expect(seats).toBe(3);
    expect(remainderByQuotient(430n, quotient, seats)).toEqual({ numerator: 10n, denominator: 7n });
  });

  it("does not fabricate a winner for an exact legal tie", () => {
    const allocation = allocateByHare({ a: 50n, b: 50n }, 1, "tie", "test rule");

    expect(allocation.seats).toEqual({ a: 0, b: 0 });
    expect(allocation.ties).toEqual([
      expect.objectContaining({ subjects: ["a", "b"], affectedSeats: ["tie-remainder-boundary-1"] })
    ]);
  });

  it("uses the higher vote total when only remainders are equal", () => {
    const allocation = allocateByHare({ a: 60n, b: 35n, c: 5n }, 4, "remainder", "test rule");

    expect(allocation.seats).toEqual({ a: 3, b: 1, c: 0 });
    expect(allocation.ties).toEqual([]);
  });
});
