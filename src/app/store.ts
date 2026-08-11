import { create } from "zustand";
import type { ElectionInput, ElectionSimulationResult } from "../electoral-engine/domain/election";
import type { OnDataImportFiles } from "../datasets/loaders/ondata-2022-loader";
import { loadOnDataInWorker, simulateScenarioInWorker } from "./simulation-client";
import cameraCandidateListUrl from "../../data/input/camera-2022-candidatilista.csv?url";
import cameraScrutiniUrl from "../../data/input/Politiche2022_Scrutini_Camera_Italia.csv?url";
import senateCandidateListUrl from "../../data/input/senato-2022-candlista.csv?url";
import senateScrutiniUrl from "../../data/input/Politiche2022_Scrutini_Senato_Italia.csv?url";
import bonusCandidateListsUrl from "../../data/input/bonus-candidates-2022-random.csv?url";
import foreignElectionUrl from "../../data/input/estero.json?url";

type AppState = {
  scenario?: ElectionInput;
  result?: ElectionSimulationResult;
  loadScenario: (scenario: ElectionInput) => Promise<void>;
  loadOnDataFiles: (files: OnDataImportFiles) => Promise<void>;
  loadFixture: () => Promise<void>;
};

export const useAppStore = create<AppState>((set) => ({
  loadScenario: async (scenario) => {
    const bundle = await simulateScenarioInWorker(scenario);
    set(bundle);
  },
  loadOnDataFiles: async (files) => {
    const bundle = await loadOnDataInWorker(files);
    set(bundle);
  },
  loadFixture: async () => {
    const [cameraScrutiniCsv, senateScrutiniCsv, bonusCandidateListsCsv, cameraCandidateListCsv, senateCandidateListCsv, foreignElectionJson] =
      await Promise.all([
        fetchText(cameraScrutiniUrl),
        fetchText(senateScrutiniUrl),
        fetchText(bonusCandidateListsUrl),
        fetchText(cameraCandidateListUrl),
        fetchText(senateCandidateListUrl),
        fetchText(foreignElectionUrl)
      ]);
    const bundle = await loadOnDataInWorker({
      cameraScrutiniCsv,
      senateScrutiniCsv,
      bonusCandidateListsCsv,
      cameraCandidateListCsv,
      senateCandidateListCsv,
      foreignElectionJson
    });
    set(bundle);
  }
}));

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Impossibile caricare ${url}`);
  return response.text();
}
