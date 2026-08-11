import { describe, expect, it } from "vitest";
import { aggregateVotes } from "../electoral-engine/pipeline/aggregate-votes";
import { calculateThresholds } from "../electoral-engine/pipeline/calculate-thresholds";
import { simulateElection } from "../electoral-engine/pipeline/simulate-election";
import type { ElectionInput } from "../electoral-engine/domain/election";
import { defaultForeignElection2022 } from "../lib/elections/estero";

describe("AC 2822-A legal behavior", () => {
  it("applies 10% coalition, 3% list, 20% regional and strongest-excluded-list recovery thresholds", () => {
    const input = scenario({
      lists: [
        { id: "l1", name: "L1", coalitionId: "c1" },
        { id: "l2", name: "L2", coalitionId: "c1" },
        { id: "l3", name: "L3", coalitionId: "c1" },
        { id: "single", name: "Single" }
      ],
      coalitions: [{ id: "c1", name: "Coalition", listIds: ["l1", "l2", "l3"] }],
      cameraVotes: { l1: 120_000n, l2: 25_000n, l3: 15_000n, single: 840_000n },
      senateVotes: { l1: 120_000n, l2: 25_000n, l3: 15_000n, single: 840_000n }
    });

    const votes = aggregateVotes(input);
    const thresholds = calculateThresholds("camera", input, votes.camera);

    expect(thresholds.admittedCoalitions).toEqual(["c1"]);
    expect(thresholds.admittedCoalitionLists.c1).toEqual(["l1", "l2"]);
    expect(thresholds.recoveredCoalitionLists.c1).toBe("l2");
    expect(thresholds.admittedSingleLists).toEqual(["single"]);
  });

  it("awards 70 and 35 bonus seats only when the same admitted subject reaches 42% in both chambers", () => {
    const result = simulateElection(
      scenario({
        cameraVotes: { a: 430_000n, b: 320_000n, c: 250_000n },
        senateVotes: { a: 430_000n, b: 320_000n, c: 250_000n }
      })
    );

    expect(result.bonus.awarded).toBe(true);
    expect(result.bonus.winnerId).toBe("a");
    expect(totalSeats(result.nationalResults.camera!.seats)).toBe(384);
    expect(totalSeats(result.nationalResults.senate!.seats)).toBe(189);
  });

  it("does not award the bonus when the first subject differs between Camera and Senate", () => {
    const result = simulateElection(
      scenario({
        cameraVotes: { a: 430_000n, b: 320_000n, c: 250_000n },
        senateVotes: { a: 320_000n, b: 430_000n, c: 250_000n }
      })
    );

    expect(result.bonus.awarded).toBe(false);
    expect(result.bonus.failedConditions).toContain("Il primo soggetto non coincide tra Camera e Senato.");
  });

  it("applies the 220 deputies and 113 senators maximum for a bonus winner", () => {
    const result = simulateElection(
      scenario({
        cameraVotes: { a: 800_000n, b: 120_000n, c: 80_000n },
        senateVotes: { a: 800_000n, b: 120_000n, c: 80_000n }
      })
    );

    expect(result.nationalResults.camera!.seats.a).toBe(220);
    expect(result.nationalResults.senate!.seats.a).toBe(113);
    expect(totalSeats(result.nationalResults.camera!.seats)).toBe(384);
    expect(totalSeats(result.nationalResults.senate!.seats)).toBe(189);
    expect(seatLevelTotals(result, "camera")).toEqual(result.nationalResults.camera!.seats);
    expect(seatLevelTotals(result, "senate")).toEqual(result.nationalResults.senate!.seats);
  });

  it("reports unresolved candidate assignment when bonus is awarded without bonus nomination rows", () => {
    const result = simulateElection(
      scenario({
        cameraVotes: { a: 430_000n, b: 320_000n, c: 250_000n },
        senateVotes: { a: 430_000n, b: 320_000n, c: 250_000n }
      })
    );

    expect(result.ties).toContainEqual(
      expect.objectContaining({
        stage: "proclamazione candidati premio",
        subjects: ["a"]
      })
    );
  });

  it("elects bonus candidates from the subject priority list", () => {
    const result = simulateElection({
      ...scenario({
        cameraVotes: { a: 430_000n, b: 320_000n, c: 250_000n },
        senateVotes: { a: 430_000n, b: 320_000n, c: 250_000n },
        districtSeats: undefined
      }),
      bonusCandidateLists: [
        ...Array.from({ length: 70 }, (_, index) => ({
          candidateId: `camera-bonus-${index + 1}`,
          chamber: "camera" as const,
          connectedSubjectId: "a",
          position: index + 1
        })),
        ...Array.from({ length: 35 }, (_, index) => ({
          candidateId: `senate-bonus-${index + 1}`,
          chamber: "senate" as const,
          connectedSubjectId: "a",
          position: index + 1
        }))
      ]
    });

    expect(result.electedCandidates.filter((candidate) => candidate.nominationType === "bonus-priority-list")).toHaveLength(105);
    expect(result.ties).not.toContainEqual(expect.objectContaining({ stage: "proclamazione candidati premio", subjects: ["a"] }));
    expect(result.seatTrace).toContainEqual(expect.objectContaining({ candidateId: "camera-bonus-1", allocationStage: "proclamazione candidati premio" }));
  });

  it("distributes Camera seats through constituencies and Senate seats through regions using provided official seat tables", () => {
    const result = simulateElection(
      scenario({
        cameraVotesByDistrict: {
          "camera-d1": { a: 300_000n, b: 100_000n },
          "camera-d2": { a: 100_000n, b: 500_000n }
        },
        senateVotesByDistrict: {
          "senate-d1": { a: 300_000n, b: 100_000n },
          "senate-d2": { a: 100_000n, b: 500_000n }
        },
        districtSeats: {
          "camera-d1": { withBonus: 157, withoutBonus: 192 },
          "camera-d2": { withBonus: 157, withoutBonus: 192 },
          "senate-d1": { withBonus: 77, withoutBonus: 94 },
          "senate-d2": { withBonus: 77, withoutBonus: 95 }
        }
      })
    );

    const cameraConstituencies = result.territorialResults.filter((item) => item.chamber === "camera" && item.scope === "constituency");
    const senateRegions = result.territorialResults.filter((item) => item.chamber === "senate" && item.scope === "region");
    const cameraBonus = result.territorialResults.filter((item) => item.chamber === "camera" && item.scope === "bonus-constituency");
    const senateBonus = result.territorialResults.filter((item) => item.chamber === "senate" && item.scope === "bonus-region");

    expect(totalSeats(Object.assign({}, ...cameraConstituencies.map((item) => item.seats)))).toBeGreaterThan(0);
    expect(cameraConstituencies.reduce((sum, item) => sum + totalSeats(item.seats), 0)).toBe(314);
    expect(senateRegions.reduce((sum, item) => sum + totalSeats(item.seats), 0)).toBe(154);
    expect(cameraBonus.reduce((sum, item) => sum + totalSeats(item.seats), 0)).toBe(70);
    expect(senateBonus.reduce((sum, item) => sum + totalSeats(item.seats), 0)).toBe(35);
  });

  it("uses the official with-bonus district capacities", () => {
    const result = simulateElection({
      ...scenario({
        cameraVotesByDistrict: {
          "camera-d1": { a: 215_000n, b: 160_000n, c: 125_000n },
          "camera-d2": { a: 215_000n, b: 160_000n, c: 125_000n }
        },
        senateVotesByDistrict: {
          "senate-d1": { a: 215_000n, b: 160_000n, c: 125_000n },
          "senate-d2": { a: 215_000n, b: 160_000n, c: 125_000n }
        }
      }),
      multiMemberDistricts: [
        { id: "camera-d1", chamber: "camera", constituencyId: "camera-r1", regionId: "r1", name: "Camera D1", seatsWithBonus: 157, seatsWithoutBonus: 192 },
        { id: "camera-d2", chamber: "camera", constituencyId: "camera-r2", regionId: "r2", name: "Camera D2", seatsWithBonus: 157, seatsWithoutBonus: 192 },
        { id: "senate-d1", chamber: "senate", constituencyId: "senate-r1", regionId: "r1", name: "Senate D1", seatsWithBonus: 77, seatsWithoutBonus: 94 },
        { id: "senate-d2", chamber: "senate", constituencyId: "senate-r2", regionId: "r2", name: "Senate D2", seatsWithBonus: 77, seatsWithoutBonus: 95 }
      ]
    });

    expect(result.territorialResults.filter((item) => item.chamber === "camera" && item.scope === "constituency").reduce((sum, item) => sum + totalSeats(item.seats), 0)).toBe(314);
    expect(result.territorialResults.filter((item) => item.chamber === "senate" && item.scope === "region").reduce((sum, item) => sum + totalSeats(item.seats), 0)).toBe(154);
    expect(result.bonusSeatAllocations.camera?.territories.reduce((sum, territory) => sum + territory.seats, 0)).toBe(70);
    expect(result.bonusSeatAllocations.senate?.territories.reduce((sum, territory) => sum + territory.seats, 0)).toBe(35);
  });

  it("assigns special Valle d'Aosta/Trentino uninominal seats to the highest-vote candidate and reports exact ties", () => {
    const result = simulateElection({
      ...scenario({}),
      candidates: [
        { id: "cand-a", firstName: "A", lastName: "One" },
        { id: "cand-b", firstName: "B", lastName: "Two" },
        { id: "cand-c", firstName: "C", lastName: "Three" },
        { id: "cand-d", firstName: "D", lastName: "Four" }
      ],
      singleMemberDistricts: [
        { id: "vda-u1", chamber: "camera", regionId: "vda", constituencyId: "camera-vda", name: "Valle d'Aosta", specialTerritory: "valle-aosta", seats: 1 },
        { id: "taa-u1", chamber: "senate", regionId: "taa", constituencyId: "senate-taa", name: "Trentino-Alto Adige 1", specialTerritory: "trentino-alto-adige", seats: 1 }
      ],
      regions: [
        { id: "r1", name: "R1" },
        { id: "r2", name: "R2" },
        { id: "vda", name: "Valle d'Aosta" },
        { id: "taa", name: "Trentino-Alto Adige" }
      ],
      constituencies: [
        { id: "camera-r1", chamber: "camera", regionId: "r1", name: "Camera R1" },
        { id: "camera-r2", chamber: "camera", regionId: "r2", name: "Camera R2" },
        { id: "senate-r1", chamber: "senate", regionId: "r1", name: "Senate R1" },
        { id: "senate-r2", chamber: "senate", regionId: "r2", name: "Senate R2" },
        { id: "camera-vda", chamber: "camera", regionId: "vda", name: "Camera VDA" },
        { id: "senate-taa", chamber: "senate", regionId: "taa", name: "Senate TAA" }
      ],
      nominations: [
        { candidateId: "cand-a", chamber: "camera", listId: "a", districtId: "vda-u1", position: 1, nominationType: "single-member" },
        { candidateId: "cand-b", chamber: "camera", listId: "b", districtId: "vda-u1", position: 1, nominationType: "single-member" },
        { candidateId: "cand-c", chamber: "senate", listId: "a", districtId: "taa-u1", position: 1, nominationType: "single-member" },
        { candidateId: "cand-d", chamber: "senate", listId: "b", districtId: "taa-u1", position: 1, nominationType: "single-member" }
      ],
      candidateVotes: [
        { chamber: "camera", districtId: "vda-u1", candidateId: "cand-a", votes: 10_000n },
        { chamber: "camera", districtId: "vda-u1", candidateId: "cand-b", votes: 9_000n },
        { chamber: "senate", districtId: "taa-u1", candidateId: "cand-c", votes: 8_000n },
        { chamber: "senate", districtId: "taa-u1", candidateId: "cand-d", votes: 8_000n }
      ]
    });

    expect(result.seatTrace).toContainEqual(expect.objectContaining({ seatId: "vda-u1-1", candidateId: "cand-a" }));
    expect(result.ties).toContainEqual(expect.objectContaining({ subjects: ["cand-c", "cand-d"] }));
  });

  it("uses Trentino-Alto Adige local votes only for the bonus check totals", () => {
    const base = addTrentinoAltoAdigeCameraLocalDistrict(scenario({}), {
      a: 1_000n,
      b: 2_000_000n,
      c: 1_000n
    });

    expect(aggregateVotes(base).camera.totalValidVotes).toBe(2_000_000n);
    expect(aggregateVotes(base).camera.subjectVotes.b).toBe(680_000n);
    expect(
      aggregateVotes(base, true).camera.totalValidVotes
    ).toBe(4_002_000n);
  });

  it("allocates Trentino-Alto Adige Camera residual seats with a local 20% threshold", () => {
    const result = simulateElection(
      addTrentinoAltoAdigeCameraLocalDistrict(scenario({}), {
        a: 60_000n,
        b: 30_000n,
        c: 10_000n
      })
    );

    expect(result.territorialResults).toContainEqual({
      chamber: "camera",
      scope: "special-local-proportional",
      territoryId: "taa-camera-local",
      seats: { a: 2, b: 1 }
    });
  });
});

function scenario(overrides: {
  lists?: ElectionInput["lists"];
  coalitions?: ElectionInput["coalitions"];
  cameraVotes?: Record<string, bigint>;
  senateVotes?: Record<string, bigint>;
  cameraVotesByDistrict?: Record<string, Record<string, bigint>>;
  senateVotesByDistrict?: Record<string, Record<string, bigint>>;
  districtSeats?: Record<string, { withBonus: number; withoutBonus: number }>;
}): ElectionInput {
  const lists = overrides.lists ?? [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" }
  ];
  const coalitions = overrides.coalitions ?? [];
  const cameraVotesByDistrict = overrides.cameraVotesByDistrict ?? {
    "camera-d1": overrides.cameraVotes ?? { a: 360_000n, b: 340_000n, c: 300_000n },
    "camera-d2": overrides.cameraVotes ?? { a: 360_000n, b: 340_000n, c: 300_000n }
  };
  const senateVotesByDistrict = overrides.senateVotesByDistrict ?? {
    "senate-d1": overrides.senateVotes ?? { a: 360_000n, b: 340_000n, c: 300_000n },
    "senate-d2": overrides.senateVotes ?? { a: 360_000n, b: 340_000n, c: 300_000n }
  };
  const seats = overrides.districtSeats ?? {
    "camera-d1": { withBonus: 157, withoutBonus: 192 },
    "camera-d2": { withBonus: 157, withoutBonus: 192 },
    "senate-d1": { withBonus: 77, withoutBonus: 94 },
    "senate-d2": { withBonus: 77, withoutBonus: 95 }
  };

  return {
    schemaVersion: "1.0",
    lawVersion: "ac-2822-a-2026-07-16",
    lists,
    coalitions,
    regions: [
      { id: "r1", name: "R1" },
      { id: "r2", name: "R2" }
    ],
    constituencies: [
      { id: "camera-r1", chamber: "camera", regionId: "r1", name: "Camera R1" },
      { id: "camera-r2", chamber: "camera", regionId: "r2", name: "Camera R2" },
      { id: "senate-r1", chamber: "senate", regionId: "r1", name: "Senate R1" },
      { id: "senate-r2", chamber: "senate", regionId: "r2", name: "Senate R2" }
    ],
    multiMemberDistricts: [
      { id: "camera-d1", chamber: "camera", constituencyId: "camera-r1", regionId: "r1", name: "Camera D1", seatsWithBonus: seats["camera-d1"].withBonus, seatsWithoutBonus: seats["camera-d1"].withoutBonus },
      { id: "camera-d2", chamber: "camera", constituencyId: "camera-r2", regionId: "r2", name: "Camera D2", seatsWithBonus: seats["camera-d2"].withBonus, seatsWithoutBonus: seats["camera-d2"].withoutBonus },
      { id: "senate-d1", chamber: "senate", constituencyId: "senate-r1", regionId: "r1", name: "Senate D1", seatsWithBonus: seats["senate-d1"].withBonus, seatsWithoutBonus: seats["senate-d1"].withoutBonus },
      { id: "senate-d2", chamber: "senate", constituencyId: "senate-r2", regionId: "r2", name: "Senate D2", seatsWithBonus: seats["senate-d2"].withBonus, seatsWithoutBonus: seats["senate-d2"].withoutBonus }
    ],
    listVotes: [
      ...votes("camera", cameraVotesByDistrict),
      ...votes("senate", senateVotesByDistrict)
    ],
    foreignElection: defaultForeignElection2022()
  };
}

function votes(chamber: "camera" | "senate", byDistrict: Record<string, Record<string, bigint>>) {
  return Object.entries(byDistrict).flatMap(([districtId, listVotes]) =>
    Object.entries(listVotes).map(([listId, voteCount]) => ({ chamber, districtId, listId, votes: voteCount }))
  );
}

function addTrentinoAltoAdigeCameraLocalDistrict(
  input: ElectionInput,
  localVotes: Record<string, bigint>
): ElectionInput {
  return {
    ...input,
    regions: [...input.regions, { id: "trentino-alto-adige", name: "Trentino-Alto Adige" }],
    constituencies: [
      ...input.constituencies,
      {
        id: "camera-trentino-alto-adige",
        chamber: "camera",
        regionId: "trentino-alto-adige",
        name: "Camera Trentino-Alto Adige"
      }
    ],
    multiMemberDistricts: [
      ...input.multiMemberDistricts,
      {
        id: "taa-camera-local",
        chamber: "camera",
        constituencyId: "camera-trentino-alto-adige",
        regionId: "trentino-alto-adige",
        name: "Trentino-Alto Adige proporzionale locale",
        seatsWithBonus: 3,
        seatsWithoutBonus: 3,
        specialTerritory: "trentino-alto-adige"
      }
    ],
    listVotes: [
      ...input.listVotes,
      ...Object.entries(localVotes).map(([listId, voteCount]) => ({
        chamber: "camera" as const,
        districtId: "taa-camera-local",
        listId,
        votes: voteCount
      }))
    ]
  };
}

function totalSeats(seats: Record<string, number>): number {
  return Object.values(seats).reduce((sum, value) => sum + value, 0);
}

function seatLevelTotals(
  result: ReturnType<typeof simulateElection>,
  chamber: "camera" | "senate"
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const territory of result.territorialResults.filter(
    (item) =>
      item.chamber === chamber &&
      ["district", "bonus-constituency", "bonus-region", "single-member", "special-local-proportional"].includes(item.scope)
  )) {
    for (const [subject, seats] of Object.entries(territory.seats)) totals[subject] = (totals[subject] ?? 0) + seats;
  }
  return totals;
}
