import { describe, expect, it } from "vitest";
import {
  allocateForeignListSeats,
  allocateForeignPartitionSeats,
  calculateForeignSeats,
  electForeignCandidates,
  type ForeignChamber
} from "../lib/elections/estero";

const residentPartitions2022 = [
  { id: "EUROPA" as const, resident_citizens: 3_189_905 },
  { id: "AMERICA_MERIDIONALE" as const, resident_citizens: 1_804_291 },
  { id: "AMERICA_SETTENTRIONALE_CENTRALE" as const, resident_citizens: 505_567 },
  { id: "AFRICA_ASIA_OCEANIA_ANTARTIDE" as const, resident_citizens: 306_305 }
];

describe("foreign constituency allocation", () => {
  it("allocates the 2022 Camera foreign seats by resident citizens", () => {
    const allocation = allocateForeignPartitionSeats(residentPartitions2022, 8);

    expect(Object.fromEntries(allocation.map((partition) => [partition.partitionId, partition.seats]))).toEqual({
      EUROPA: 3,
      AMERICA_MERIDIONALE: 2,
      AMERICA_SETTENTRIONALE_CENTRALE: 2,
      AFRICA_ASIA_OCEANIA_ANTARTIDE: 1
    });
  });

  it("allocates the 2022 Senato foreign seats as one per partition", () => {
    const allocation = allocateForeignPartitionSeats(residentPartitions2022, 4);

    expect(Object.fromEntries(allocation.map((partition) => [partition.partitionId, partition.seats]))).toEqual({
      EUROPA: 1,
      AMERICA_MERIDIONALE: 1,
      AMERICA_SETTENTRIONALE_CENTRALE: 1,
      AFRICA_ASIA_OCEANIA_ANTARTIDE: 1
    });
  });

  it("allocates list seats by integer quota and largest remainders", () => {
    const allocation = allocateForeignListSeats(
      [
        { id: "A", name: "Lista A", votes: 250_000, candidates: [] },
        { id: "B", name: "Lista B", votes: 200_000, candidates: [] },
        { id: "C", name: "Lista C", votes: 150_000, candidates: [] }
      ],
      3
    );

    expect(allocation.quota).toBe(200_000);
    expect(Object.fromEntries(allocation.lists.map((list) => [list.id, list.seats]))).toEqual({
      A: 1,
      B: 1,
      C: 1
    });
    expect(allocation.ties).toEqual([]);
  });

  it("uses higher list votes to break equal remainders", () => {
    const allocation = allocateForeignListSeats(
      [
        { id: "A", name: "Lista A", votes: 250, candidates: [] },
        { id: "B", name: "Lista B", votes: 84, candidates: [] },
        { id: "C", name: "Lista C", votes: 166, candidates: [] }
      ],
      3
    );

    expect(Object.fromEntries(allocation.lists.map((list) => [list.id, list.seats]))).toEqual({
      A: 2,
      B: 0,
      C: 1
    });
  });

  it("elects foreign candidates by preferences with list order as tie-break", () => {
    const elected = electForeignCandidates(
      {
        id: "PD",
        name: "Partito Democratico",
        votes: 100_000,
        candidates: [
          { name: "Luca", preferences: 15_000, list_position: 3 },
          { name: "Anna", preferences: 21_000, list_position: 2 },
          { name: "Mario", preferences: 27_000, list_position: 1 },
          { name: "Sara", preferences: 21_000, list_position: 4 }
        ]
      },
      3
    );

    expect(elected.map((candidate) => candidate.name)).toEqual(["Mario", "Anna", "Sara"]);
  });

  it("reproduces the certified 2022 Senato foreign list totals on partition fixture data", () => {
    const senato: ForeignChamber = {
      total_seats: 4,
      partitions: [
        partition("EUROPA", 1, [
          ["PD", 305_000],
          ["CDX", 282_000],
          ["MAIE", 48_000]
        ]),
        partition("AMERICA_MERIDIONALE", 1, [
          ["MAIE", 141_000],
          ["PD", 80_000],
          ["CDX", 79_000]
        ]),
        partition("AMERICA_SETTENTRIONALE_CENTRALE", 1, [
          ["PD", 62_000],
          ["CDX", 59_000],
          ["MAIE", 28_000]
        ]),
        partition("AFRICA_ASIA_OCEANIA_ANTARTIDE", 1, [
          ["PD", 51_000],
          ["CDX", 46_000],
          ["MAIE", 22_000]
        ])
      ]
    };

    const result = calculateForeignSeats("senato", senato);
    const totals = result.partitionResults.reduce<Record<string, number>>((sum, partition) => {
      for (const [listId, seats] of Object.entries(partition.seats)) {
        sum[listId] = (sum[listId] ?? 0) + seats;
      }
      return sum;
    }, {});

    expect(totals).toEqual({ PD: 3, MAIE: 1 });
  });
});

function partition(id: ForeignChamber["partitions"][number]["id"], seats: number, votes: Array<[string, number]>) {
  return {
    id,
    name: id,
    seats,
    resident_citizens: residentPartitions2022.find((partition) => partition.id === id)?.resident_citizens ?? 0,
    lists: votes.map(([listId, listVotes]) => ({
      id: listId,
      name: listId,
      votes: listVotes,
      candidates: [{ name: `${listId} Candidate`, preferences: listVotes, list_position: 1 }]
    }))
  };
}
