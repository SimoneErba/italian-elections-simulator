import type { Chamber } from "./chamber";
import type { Fraction } from "../arithmetic/fraction";
import type { CalculationTraceEntry, SeatAssignmentTrace, TieResolutionRequired } from "./trace";
import type { ForeignChamberId, ForeignChamberResult, ForeignElectionData } from "../../lib/elections/estero";

export type ElectoralLawVersionId = "ac-2822-a-2026-07-16" | "rosatellum-2022";

export type PoliticalList = {
  id: string;
  name: string;
  coalitionId?: string;
  isLinguisticMinority?: boolean;
  protectedRegionId?: string;
};

export type Coalition = {
  id: string;
  name: string;
  alias?: string;
  listIds: string[];
};

export type Region = {
  id: string;
  name: string;
};

export type Constituency = {
  id: string;
  chamber: Chamber;
  regionId: string;
  name: string;
};

export type MultiMemberDistrict = {
  id: string;
  chamber: Chamber;
  constituencyId: string;
  regionId: string;
  name: string;
  seatsWithBonus: number;
  seatsWithoutBonus: number;
  specialTerritory?: "trentino-alto-adige";
};

export type SingleMemberDistrict = {
  id: string;
  chamber: Chamber;
  regionId: string;
  constituencyId?: string;
  /** Plurinominal college containing this uninominal college, when known. */
  multiMemberDistrictId?: string;
  name: string;
  specialTerritory?: "valle-aosta" | "trentino-alto-adige";
  seats: 1;
};

export type Candidate = {
  id: string;
  firstName: string;
  lastName: string;
  age?: number;
  birthYear?: number;
  party?: string;
  identityConflicts?: string[];
};

export type CandidateNomination = {
  candidateId: string;
  chamber: Chamber;
  listId: string;
  connectedSubjectId?: string;
  districtId?: string;
  constituencyId?: string;
  position: number;
  nominationType: "multi-member" | "bonus-constituency-list" | "single-member" | "foreign";
};

export type BonusCandidatePriority = {
  candidateId: string;
  chamber: Chamber;
  connectedSubjectId: string;
  position: number;
};

export type ListVoteRecord = {
  chamber: Chamber;
  districtId: string;
  listId: string;
  votes: bigint;
};

export type CandidateVoteRecord = {
  chamber: Chamber;
  districtId: string;
  candidateId: string;
  votes: bigint;
};

export type ElectionInput = {
  schemaVersion: "1.0";
  lawVersion: ElectoralLawVersionId;
  electionDate?: string;
  lists: PoliticalList[];
  coalitions: Coalition[];
  regions: Region[];
  constituencies: Constituency[];
  multiMemberDistricts: MultiMemberDistrict[];
  singleMemberDistricts?: SingleMemberDistrict[];
  listVotes: ListVoteRecord[];
  candidateVotes?: CandidateVoteRecord[];
  candidates?: Candidate[];
  nominations?: CandidateNomination[];
  bonusCandidateLists?: BonusCandidatePriority[];
  foreignElection: ForeignElectionData;
  /** Non-blocking import coverage notices surfaced in the calculation trace. */
  coverageWarnings?: string[];
};

export type AllocationSubject = {
  id: string;
  kind: "list" | "coalition";
  votes: bigint;
};

export type AllocationStep = {
  chamber: Chamber;
  availableSeats: number;
  subjects: AllocationSubject[];
  quotient: Fraction;
  integerSeats: Record<string, number>;
  remainderSeats: Record<string, number>;
};

export type ThresholdResult = {
  chamber: Chamber;
  admittedCoalitions: string[];
  admittedSingleLists: string[];
  admittedCoalitionLists: Record<string, string[]>;
  recoveredCoalitionLists: Record<string, string | undefined>;
  excludedLists: string[];
};

export type BonusDecision = {
  awarded: boolean;
  winnerId?: string;
  cameraPercentage?: Fraction;
  senatePercentage?: Fraction;
  failedConditions: string[];
};

export type NationalResult = {
  chamber: Chamber;
  totalValidVotes: bigint;
  seats: Record<string, number>;
  ordinarySeats: Record<string, number>;
  votes: Record<string, bigint>;
  percentages: Record<string, Fraction>;
  allocation: AllocationStep;
};

export type TerritorialSeatResult = {
  chamber: Chamber;
  scope:
    | "constituency"
    | "region"
    | "district"
    | "single-member"
    | "foreign"
    | "bonus-constituency"
    | "bonus-region"
    | "special-local-proportional";
  territoryId: string;
  seats: Record<string, number>;
  allocationLedger?: AllocationLedger;
};

export type AllocationLedgerCell = {
  territoryId: string;
  subjectId: string;
  votes: bigint;
  quotient: bigint;
  integerSeats: number;
  remainder: bigint;
  remainderInitiallyUsed: boolean;
  /** Whether this remainder is occupied after every statutory compensation. */
  remainderUsed: boolean;
};

export type AllocationTransfer = {
  fromTerritoryId: string;
  fromSubjectId: string;
  toTerritoryId: string;
  toSubjectId: string;
  reason: string;
};

export type AllocationLedger = {
  stage: string;
  cells: AllocationLedgerCell[];
  transfers: AllocationTransfer[];
};

export type MunicipalityPopulation = {
  istatCode: string;
  municipalityName: string;
  regionId: string;
  population: bigint;
};

export type ElectoralPopulationDataset = {
  id: string;
  censusDate: string;
  dprDate: string | null;
  effectiveFrom: string | null;
  municipalities: MunicipalityPopulation[];
};

export type CameraGeographyMapping = {
  istatCode: string;
  constituencyId: string;
};

export type TerritoryPopulation = {
  territoryId: string;
  population: bigint;
};

export type SeatAllocationResult = {
  datasetId: string;
  quotient: bigint;
  territories: Array<TerritoryPopulation & { integerSeats: number; remainder: bigint; seats: number }>;
  unresolvedTies: Array<{
    territoryIds: string[];
    affectedSeatNumber: number;
  }>;
};

export type ElectedCandidate = {
  candidateId: string;
  seatId: string;
  electedIn: string;
  nominationType: CandidateNomination["nominationType"] | "bonus-priority-list";
  listPosition: number;
  resolvedMultipleNomination?: boolean;
  resolutionReason?: string;
};

export type ElectionSimulationResult = {
  lawVersion: ElectoralLawVersionId;
  bonus: BonusDecision;
  bonusSeatAllocations: Record<Chamber, SeatAllocationResult | undefined>;
  thresholds: Record<Chamber, ThresholdResult | undefined>;
  nationalResults: Record<Chamber, NationalResult | undefined>;
  foreignResults: Record<ForeignChamberId, ForeignChamberResult | undefined>;
  territorialResults: TerritorialSeatResult[];
  electedCandidates: ElectedCandidate[];
  allElectedCandidates: UnifiedElectedMember[];
  seatTrace: SeatAssignmentTrace[];
  trace: CalculationTraceEntry[];
  ties: TieResolutionRequired[];
};

export type UnifiedElectedMember = {
  chamber: Chamber;
  electionType: "single-member" | "plurinominal" | "foreign";
  territory: string;
  listId: string;
  candidateId: string;
  displayName: string;
};
