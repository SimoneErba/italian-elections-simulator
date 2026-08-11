export type ForeignChamberId = "camera" | "senato";

export type ForeignPartitionId =
  | "EUROPA"
  | "AMERICA_MERIDIONALE"
  | "AMERICA_SETTENTRIONALE_CENTRALE"
  | "AFRICA_ASIA_OCEANIA_ANTARTIDE";

export type ForeignCandidate = {
  id?: string;
  name: string;
  preferences: number;
  list_position: number;
};

export type ForeignList = {
  id: string;
  name: string;
  votes: number;
  candidates: ForeignCandidate[];
};

export type ForeignPartition = {
  id: ForeignPartitionId;
  name: string;
  seats: number;
  resident_citizens: number;
  lists: ForeignList[];
};

export type ForeignChamber = {
  total_seats: number;
  partitions: ForeignPartition[];
};

export type ForeignElectionData = {
  election: "politiche-2022";
  date: "2022-09-25";
  chambers: Record<ForeignChamberId, ForeignChamber>;
};

export type AllocatedForeignList = ForeignList & {
  seats: number;
  integerSeats: number;
  remainder: number;
};

export type ForeignCandidateElection = {
  chamber: ForeignChamberId;
  partitionId: ForeignPartitionId;
  listId: string;
  candidate: ForeignCandidate;
  seatNumber: number;
};

export type ForeignTie = {
  stage: string;
  subjects: string[];
  affectedSeats: string[];
  legalRule: string;
};

export type ForeignPartitionSeatAllocation = {
  partitionId: ForeignPartitionId;
  resident_citizens: number;
  baseSeats: number;
  extraIntegerSeats: number;
  extraRemainder: number;
  seats: number;
};

export type ForeignListSeatAllocation = {
  quota: number;
  lists: AllocatedForeignList[];
  ties: ForeignTie[];
};

export type ForeignChamberResult = {
  chamber: ForeignChamberId;
  partitionResults: Array<{
    partitionId: ForeignPartitionId;
    seats: Record<string, number>;
    quota: number;
  }>;
  electedCandidates: ForeignCandidateElection[];
  ties: ForeignTie[];
};
