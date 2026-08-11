import type { Chamber } from "../domain/chamber";
import type { BonusDecision, NationalResult } from "../domain/election";
import { getLawVersion } from "../rules/registry";
import { allocateByHare } from "./proportional-allocation";

export function applyGovernabilityBonus(
  chamber: Chamber,
  result: NationalResult,
  bonus: BonusDecision,
  specialWinnerSeats = 0
): NationalResult {
  if (!bonus.awarded || !bonus.winnerId) return { ...result, ordinarySeats: result.seats };
  const rules = getLawVersion("ac-2822-a-2026-07-16").chamberRules[chamber];
  const winnerOrdinary = result.seats[bonus.winnerId] ?? 0;
  const maximumWinnerOrdinarySeats = Math.max(
    0,
    rules.maxWinnerSeatsWithBonus - rules.bonusSeats - specialWinnerSeats
  );
  const ordinarySeats = { ...result.seats };

  if (winnerOrdinary > maximumWinnerOrdinarySeats) {
    ordinarySeats[bonus.winnerId] = maximumWinnerOrdinarySeats;
    const minoritySeats = result.allocation.availableSeats - maximumWinnerOrdinarySeats;
    const minorityVotes = Object.fromEntries(Object.entries(result.votes).filter(([subject]) => subject !== bonus.winnerId));
    const minorityAllocation = allocateByHare(
      minorityVotes,
      minoritySeats,
      `limite massimo premio ${chamber}`,
      chamber === "camera" ? "AC 2822-A articolo 83, comma 1-ter" : "AC 2822-A articolo 16-bis, comma 1-ter"
    );
    for (const [subject, value] of Object.entries(minorityAllocation.seats)) ordinarySeats[subject] = value;
  }

  const seats = { ...ordinarySeats };
  seats[bonus.winnerId] = (seats[bonus.winnerId] ?? 0) + rules.bonusSeats;

  return {
    ...result,
    seats,
    ordinarySeats
  };
}
