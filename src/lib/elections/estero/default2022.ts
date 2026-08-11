import type { ForeignElectionData, ForeignPartitionId } from "./types";

const partitionMetadata: Array<{
  id: ForeignPartitionId;
  name: string;
  resident_citizens: number;
  seats: { camera: number; senato: number };
}> = [
  {
    id: "EUROPA",
    name: "Europa",
    resident_citizens: 3_189_905,
    seats: { camera: 3, senato: 1 }
  },
  {
    id: "AMERICA_MERIDIONALE",
    name: "America Meridionale",
    resident_citizens: 1_804_291,
    seats: { camera: 2, senato: 1 }
  },
  {
    id: "AMERICA_SETTENTRIONALE_CENTRALE",
    name: "America Settentrionale e Centrale",
    resident_citizens: 505_567,
    seats: { camera: 2, senato: 1 }
  },
  {
    id: "AFRICA_ASIA_OCEANIA_ANTARTIDE",
    name: "Africa, Asia, Oceania e Antartide",
    resident_citizens: 306_305,
    seats: { camera: 1, senato: 1 }
  }
];

export function defaultForeignElection2022(): ForeignElectionData {
  return {
    election: "politiche-2022",
    date: "2022-09-25",
    chambers: {
      camera: {
        total_seats: 8,
        partitions: partitionMetadata.map((partition) => ({
          id: partition.id,
          name: partition.name,
          seats: partition.seats.camera,
          resident_citizens: partition.resident_citizens,
          lists: []
        }))
      },
      senato: {
        total_seats: 4,
        partitions: partitionMetadata.map((partition) => ({
          id: partition.id,
          name: partition.name,
          seats: partition.seats.senato,
          resident_citizens: partition.resident_citizens,
          lists: []
        }))
      }
    }
  };
}
