import { describe, expect, it } from "vitest";
import { artificialCameraSenateScenario } from "./fixtures/artificial-camera-senate";
import { buildSimplifiedScenarioFromGeography } from "../features/simple-scenario/build-simplified-scenario";
import { defaultSimplifiedPercentages } from "../features/simple-scenario/catalog";

const request = {
  lists: [
    { id: "alpha", name: "Alpha", percentage: 5_200 },
    { id: "beta", name: "Beta", percentage: 3_000 },
    { id: "gamma", name: "Gamma", percentage: 1_800 }
  ],
  coalitions: [{ id: "coalition-alpha-beta", name: "Alpha e Beta", listIds: ["alpha", "beta"] }]
};

describe("simplified percentage scenario", () => {
  it("starts at exactly 100.00%", () => {
    expect(Object.values(defaultSimplifiedPercentages).reduce((sum, percentage) => sum + percentage, 0)).toBe(10_000);
  });

  it("preserves every historic multi-member district total with largest remainders", () => {
    const input = buildSimplifiedScenarioFromGeography(request, artificialCameraSenateScenario);
    for (const district of input.multiMemberDistricts) {
      const votes = input.listVotes.filter((vote) => vote.chamber === district.chamber && vote.districtId === district.id);
      expect(votes).toHaveLength(request.lists.length);
      expect(votes.reduce((sum, vote) => sum + vote.votes, 0n)).toBeGreaterThan(0n);
    }
    expect(input.candidates?.every((candidate) => candidate.firstName === "Candidato" && candidate.lastName === "tecnico")).toBe(true);
    expect(input.lists.find((list) => list.id === "alpha")?.coalitionId).toBe("coalition-alpha-beta");
  });

  it("creates technical foreign lists without reusing historic candidates", () => {
    const input = buildSimplifiedScenarioFromGeography(request, artificialCameraSenateScenario);
    const foreignLists = input.foreignElection.chambers.camera.partitions.flatMap((partition) => partition.lists);
    expect(foreignLists).toHaveLength(12);
    expect(foreignLists.every((list) => list.candidates.every((candidate) => candidate.name === "Candidato tecnico"))).toBe(true);
    expect(input.bonusCandidateLists).toHaveLength(210);
  });

  it("does not invent foreign votes for a list at zero percent", () => {
    const input = buildSimplifiedScenarioFromGeography({
      ...request,
      lists: [
        { id: "alpha", name: "Alpha", percentage: 7_000 },
        { id: "beta", name: "Beta", percentage: 3_000 },
        { id: "gamma", name: "Gamma", percentage: 0 }
      ]
    }, artificialCameraSenateScenario);
    expect(input.foreignElection.chambers.camera.partitions.flatMap((partition) => partition.lists).filter((list) => list.id === "gamma").every((list) => list.votes === 0)).toBe(true);
  });
});
