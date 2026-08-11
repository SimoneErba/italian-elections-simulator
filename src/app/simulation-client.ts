import type { ElectionInput, ElectionSimulationResult } from "../electoral-engine/domain/election";
import type { OnDataImportFiles } from "../datasets/loaders/ondata-2022-loader";
import type { SimulationWorkerRequest, SimulationWorkerResponse } from "./simulation-worker";

type SimulationBundle = {
  scenario: ElectionInput;
  result: ElectionSimulationResult;
};

type SimulationRequestPayload =
  | { kind: "scenario"; scenario: ElectionInput }
  | { kind: "ondata"; files: OnDataImportFiles };

let nextRequestId = 1;
let worker: Worker | undefined;
const pending = new Map<
  number,
  { resolve: (bundle: SimulationBundle) => void; reject: (error: Error) => void }
>();

export function simulateScenarioInWorker(scenario: ElectionInput): Promise<SimulationBundle> {
  return send({ kind: "scenario", scenario });
}

export function loadOnDataInWorker(files: OnDataImportFiles): Promise<SimulationBundle> {
  return send({ kind: "ondata", files });
}

function send(request: SimulationRequestPayload): Promise<SimulationBundle> {
  const id = nextRequestId++;
  const activeWorker = getWorker();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    activeWorker.postMessage({ ...request, id } as SimulationWorkerRequest);
  });
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./simulation-worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve({ scenario: response.scenario, result: response.result });
    else request.reject(new Error(response.error));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Simulation worker failed.");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  return worker;
}
