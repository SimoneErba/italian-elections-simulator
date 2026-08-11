import { describe, expect, it } from "vitest";
import type { ElectionInput } from "../electoral-engine/domain/election";
import { electCandidates } from "../electoral-engine/pipeline/elect-candidates";
import { simulateElection } from "../electoral-engine/pipeline/simulate-election";
import { artificialCameraSenateScenario } from "./fixtures/artificial-camera-senate";

describe("simulateElection", () => {
  it("runs the first national vertical slice", () => {
    const result = simulateElection(artificialCameraSenateScenario);

    expect(result.trace.some((entry) => entry.id === "validation-ok")).toBe(true);
    expect(result.bonus.awarded).toBe(false);
    expect(result.bonus.failedConditions).toContain("Il primo soggetto non raggiunge il 42% alla Camera.");
    expect(result.nationalResults.camera?.seats).toEqual({
      "lista-a": 137,
      "lista-b": 112,
      "lista-c": 81,
      "lista-d": 54
    });
    expect(result.nationalResults.senate?.seats).toEqual({
      "lista-a": 67,
      "lista-b": 57,
      "lista-c": 39,
      "lista-d": 26
    });
  });

  it("blocks incomplete inputs before allocation", () => {
    const result = simulateElection({
      ...artificialCameraSenateScenario,
      listVotes: [{ chamber: "camera", districtId: "missing", listId: "lista-a", votes: 10n }]
    });

    expect(result.nationalResults.camera).toBeUndefined();
    expect(result.trace.some((entry) => entry.level === "blocking")).toBe(true);
  });

  it("blocks scenarios without the foreign constituency", () => {
    const result = simulateElection({
      ...artificialCameraSenateScenario,
      foreignElection: undefined
    } as unknown as ElectionInput);

    expect(result.nationalResults.camera).toBeUndefined();
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        level: "blocking",
        message: expect.stringContaining("Dati Estero mancanti")
      })
    );
  });

  it("blocks inconsistent coalition membership and chamber references", () => {
    const result = simulateElection({
      ...artificialCameraSenateScenario,
      lists: artificialCameraSenateScenario.lists.map((list) =>
        list.id === "lista-a" ? { ...list, coalitionId: "coalition-a" } : list
      ),
      coalitions: [{ id: "coalition-a", name: "Coalition A", listIds: [] }],
      listVotes: artificialCameraSenateScenario.listVotes.map((vote, index) =>
        index === 0 ? { ...vote, chamber: "senate" as const } : vote
      )
    });

    expect(result.nationalResults.camera).toBeUndefined();
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "blocking", message: expect.stringContaining("non compare") }),
        expect.objectContaining({ level: "blocking", message: expect.stringContaining("Camera diversa") })
      ])
    );
  });

  it("prioritizes bonus election and moves duplicated proportional nominations to the next candidate", () => {
    const result = electCandidates(
      {
        ...artificialCameraSenateScenario,
        nominations: [
          {
            candidateId: "candidate-shared",
            chamber: "camera",
            listId: "lista-a",
            districtId: "camera-p1",
            position: 1,
            nominationType: "multi-member"
          },
          {
            candidateId: "candidate-next",
            chamber: "camera",
            listId: "lista-a",
            districtId: "camera-p1",
            position: 2,
            nominationType: "multi-member"
          }
        ],
        bonusCandidateLists: [
          {
            candidateId: "candidate-shared",
            chamber: "camera",
            connectedSubjectId: "lista-a",
            position: 1
          }
        ]
      },
      [
        { chamber: "camera", scope: "district", territoryId: "camera-p1", seats: { "lista-a": 1 } },
        { chamber: "camera", scope: "bonus-constituency", territoryId: "camera-r1", seats: { "lista-a": 1 } }
      ]
    );

    expect(result.elected.map((candidate) => candidate.candidateId)).toEqual(["candidate-shared", "candidate-next"]);
    expect(result.elected[0]).toEqual(expect.objectContaining({ candidateId: "candidate-shared", nominationType: "bonus-priority-list" }));
    expect(result.elected[1]).toEqual(expect.objectContaining({ candidateId: "candidate-next", nominationType: "multi-member" }));
    expect(result.elected[0].resolvedMultipleNomination).toBe(true);
    expect(result.ties).toEqual([]);
  });

  it("does not elect an excluded coalition member list", () => {
    const result = electCandidates(
      {
        ...artificialCameraSenateScenario,
        lists: [
          { id: "eligible", name: "Eligible", coalitionId: "coalition" },
          { id: "excluded", name: "Excluded", coalitionId: "coalition" }
        ],
        coalitions: [{ id: "coalition", name: "Coalition", listIds: ["eligible", "excluded"] }],
        listVotes: [
          { chamber: "camera", districtId: "camera-p1", listId: "eligible", votes: 1n },
          { chamber: "camera", districtId: "camera-p1", listId: "excluded", votes: 99n }
        ],
        nominations: [
          { candidateId: "eligible-1", chamber: "camera", listId: "eligible", districtId: "camera-p1", position: 1, nominationType: "multi-member" },
          { candidateId: "excluded-1", chamber: "camera", listId: "excluded", districtId: "camera-p1", position: 1, nominationType: "multi-member" }
        ]
      },
      [{ chamber: "camera", scope: "district", territoryId: "camera-p1", seats: { coalition: 1 } }],
      {
        camera: {
          chamber: "camera",
          admittedCoalitions: ["coalition"],
          admittedSingleLists: [],
          admittedCoalitionLists: { coalition: ["eligible"] },
          recoveredCoalitionLists: {},
          excludedLists: ["excluded"]
        },
        senate: {
          chamber: "senate",
          admittedCoalitions: [],
          admittedSingleLists: [],
          admittedCoalitionLists: {},
          recoveredCoalitionLists: {},
          excludedLists: []
        }
      }
    );

    expect(result.elected.map((candidate) => candidate.candidateId)).toEqual(["eligible-1"]);
  });

  it("leaves a seat unresolved when the local candidate list is exhausted", () => {
    const result = electCandidates(
      {
        ...artificialCameraSenateScenario,
        nominations: [
          { candidateId: "elsewhere", chamber: "camera", listId: "lista-a", districtId: "camera-p1", position: 1, nominationType: "multi-member" }
        ]
      },
      [{ chamber: "camera", scope: "district", territoryId: "camera-p2", seats: { "lista-a": 1 } }]
    );

    expect(result.elected).toEqual([]);
    expect(result.ties).toEqual([expect.objectContaining({ subjects: ["lista-a"] })]);
  });
});
