import { fraction, type Fraction } from "../arithmetic/fraction";
import type { Chamber } from "../domain/chamber";
import type { ElectoralLawVersionId } from "../domain/election";

export type ChamberRuleSet = {
  chamber: Chamber;
  fullSeats: number;
  foreignSeats: number;
  singleMemberSeats: number;
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
  hasGovernabilityBonus: boolean;
  hasStrongestExcludedCoalitionListRecovery: boolean;
  chamberRules: Record<Chamber, ChamberRuleSet>;
};

export const lawRegistry: Record<ElectoralLawVersionId, ElectoralLawVersion> = {
  "ac-2822-a-2026-07-16": {
    id: "ac-2822-a-2026-07-16",
    name: "AC 2822-A",
    status: "proposal",
    parliamentaryStage: "Testo approvato dalla Camera il 16 luglio 2026",
    sourceDate: "2026-07-16",
    hasGovernabilityBonus: true,
    hasStrongestExcludedCoalitionListRecovery: true,
    chamberRules: {
      camera: {
        chamber: "camera",
        fullSeats: 400,
        foreignSeats: 8,
        singleMemberSeats: 0,
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
        singleMemberSeats: 0,
        specialTerritorySeats: 7,
        ordinarySeats: 189,
        bonusSeats: 35,
        maxWinnerSeatsWithBonus: 113,
        cappedWinnerOrdinarySeats: 78,
        minimumBonusPercentage: fraction(42n, 1n)
      }
    }
  },
  "rosatellum-2022": {
    id: "rosatellum-2022",
    name: "Legge 165/2017, collegi rideterminati dal d.lgs. 177/2020",
    status: "in-force",
    parliamentaryStage: "Legge vigente usata per le elezioni politiche del 25 settembre 2022",
    sourceDate: "2022-09-25",
    hasGovernabilityBonus: false,
    hasStrongestExcludedCoalitionListRecovery: false,
    chamberRules: {
      camera: {
        chamber: "camera",
        fullSeats: 400,
        foreignSeats: 8,
        singleMemberSeats: 147,
        specialTerritorySeats: 0,
        ordinarySeats: 245,
        bonusSeats: 0,
        maxWinnerSeatsWithBonus: 0,
        cappedWinnerOrdinarySeats: 0,
        minimumBonusPercentage: fraction(0n)
      },
      senate: {
        chamber: "senate",
        fullSeats: 200,
        foreignSeats: 4,
        singleMemberSeats: 74,
        specialTerritorySeats: 0,
        ordinarySeats: 122,
        bonusSeats: 0,
        maxWinnerSeatsWithBonus: 0,
        cappedWinnerOrdinarySeats: 0,
        minimumBonusPercentage: fraction(0n)
      }
    }
  }
};

export function getLawVersion(id: ElectoralLawVersionId): ElectoralLawVersion {
  return lawRegistry[id];
}
