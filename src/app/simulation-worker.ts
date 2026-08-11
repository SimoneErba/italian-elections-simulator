import type { ElectionInput } from "../electoral-engine/domain/election";
import { simulateElection } from "../electoral-engine/pipeline/simulate-election";
import type { OnDataImportFiles } from "../datasets/loaders/ondata-2022-loader";
import { loadOnData2022Scenario } from "../datasets/loaders/ondata-2022-loader";

export type SimulationWorkerRequest =
  | { id: number; kind: "scenario"; scenario: ElectionInput }
  | { id: number; kind: "ondata"; files: OnDataImportFiles };

export type SimulationWorkerResponse =
  | { id: number; ok: true; scenario: ElectionInput; result: ReturnType<typeof simulateElection> }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const request = event.data;
  try {
    const scenario = request.kind === "scenario" ? request.scenario : loadOnData2022Scenario(request.files);
    const response: SimulationWorkerResponse = {
      id: request.id,
      ok: true,
      scenario,
      result: simulateElection(scenario)
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
