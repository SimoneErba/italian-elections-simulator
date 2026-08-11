import type { Chamber } from "./chamber";
import type { Fraction } from "../arithmetic/fraction";

export type TraceLevel = "info" | "warning" | "blocking";

export type CalculationTraceEntry = {
  id: string;
  stage: string;
  ruleReference: string;
  level: TraceLevel;
  message: string;
  data?: unknown;
};

export type SeatAssignmentTrace = {
  seatId: string;
  chamber: Chamber;
  partyId: string;
  coalitionId?: string;
  constituencyId: string;
  districtId?: string;
  candidateId?: string;
  allocationStage: string;
  ruleReference: string;
  quotient?: Fraction;
  remainder?: Fraction;
};

export type TieResolutionRequired = {
  subjects: string[];
  stage: string;
  affectedSeats: string[];
  legalRule: string;
};
