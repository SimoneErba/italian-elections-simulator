import type { ElectoralLawVersionId, ElectionInput, ElectionSimulationResult } from "../electoral-engine/domain/election";
import { simulateElection } from "../electoral-engine/pipeline/simulate-election";
import type { OnDataImportFiles } from "../datasets/loaders/ondata-2022-loader";
import { loadOnData2022Scenario, withLawSpecificDistrictSeats } from "../datasets/loaders/ondata-2022-loader";

export type SimulationWorkerRequest =
  | { id: number; kind: "scenario"; scenario: ElectionInput; lawVersions: ElectoralLawVersionId[] }
  | { id: number; kind: "ondata"; files: OnDataImportFiles; lawVersions: ElectoralLawVersionId[] };

export type SimulationWorkerResponse =
  | { id: number; ok: true; scenario: ElectionInput; results: Partial<Record<ElectoralLawVersionId, ElectionSimulationResult>> }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const request = event.data;
  try {
    const scenario = request.kind === "scenario" ? request.scenario : loadOnData2022Scenario(request.files);
    const results = Object.fromEntries(request.lawVersions.map((lawVersion) => [
      lawVersion,
      simulateElection(withLawSpecificDistrictSeats(scenario, lawVersion))
    ])) as Partial<Record<ElectoralLawVersionId, ElectionSimulationResult>>;
    const response: SimulationWorkerResponse = {
      id: request.id,
      ok: true,
      scenario,
      results
    };
    self.postMessage(response);
  } catch (exception) {
    const response: SimulationWorkerResponse = {
      id: request.id,
      ok: false,
      error: exception instanceof Error ? exception.message : "Simulation failed."
    };
    self.postMessage(response);
  }
};

export {};
