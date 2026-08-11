import { fraction, type Fraction } from "../arithmetic/fraction";
import type { Chamber } from "../domain/chamber";
import type { ElectoralLawVersionId } from "../domain/election";

export type ChamberRuleSet = {
  chamber: Chamber;
  fullSeats: number;
  foreignSeats: number;
  specialTerritorySeats: number;
  ordinarySeats: number;
  bonusSeats: number;
  maxWinnerSeatsWithBonus: number;
  cappedWinnerOrdinarySeats: number;
  minimumBonusPercentage: Fraction;
};

export type ElectoralLawVersion = {
  id: ElectoralLawVersionId;
  name: string;
  status: "proposal" | "approved" | "in-force";
  parliamentaryStage: string;
  sourceDate: string;
  chamberRules: Record<Chamber, ChamberRuleSet>;
};

export const lawRegistry: Record<ElectoralLawVersionId, ElectoralLawVersion> = {
  "ac-2822-a-2026-07-16": {
    id: "ac-2822-a-2026-07-16",
    name: "AC 2822-A",
    status: "proposal",
    parliamentaryStage: "Testo approvato dalla Camera il 16 luglio 2026",
    sourceDate: "2026-07-16",
    chamberRules: {
      camera: {
        chamber: "camera",
        fullSeats: 400,
        foreignSeats: 8,
        specialTerritorySeats: 8,
        ordinarySeats: 384,
        bonusSeats: 70,
        maxWinnerSeatsWithBonus: 220,
        cappedWinnerOrdinarySeats: 150,
        minimumBonusPercentage: fraction(42n, 1n)
      },
      senate: {
        chamber: "senate",
        fullSeats: 200,
        foreignSeats: 4,
        specialTerritorySeats: 7,
        ordinarySeats: 189,
        bonusSeats: 35,
        maxWinnerSeatsWithBonus: 113,
        cappedWinnerOrdinarySeats: 78,
        minimumBonusPercentage: fraction(42n, 1n)
      }
    }
  }
};

export function getLawVersion(id: ElectoralLawVersionId): ElectoralLawVersion {
  return lawRegistry[id];
}
