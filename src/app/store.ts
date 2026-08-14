import { create } from "zustand";
import type { ElectoralLawVersionId, ElectionInput, ElectionSimulationResult } from "../electoral-engine/domain/election";
import type { OnDataImportFiles } from "../datasets/loaders/ondata-2022-loader";
import { loadOnDataInWorker, simulateScenarioInWorker } from "./simulation-client";
import cameraCandidateListUrl from "../../data/input/camera-2022-candidatilista.csv?url";
import cameraScrutiniUrl from "../../data/input/Politiche2022_Scrutini_Camera_Italia.csv?url";
import senateCandidateListUrl from "../../data/input/senato-2022-candlista.csv?url";
import senateScrutiniUrl from "../../data/input/Politiche2022_Scrutini_Senato_Italia.csv?url";
import bonusCandidateListsUrl from "../../data/input/bonus-candidates-2022-random.csv?url";
import foreignElectionUrl from "../../data/input/estero.json?url";
import specialTerritoriesUrl from "../../data/input/special-territories-2022.json?url";

type AppState = {
  scenario?: ElectionInput;
  results?: Partial<Record<ElectoralLawVersionId, ElectionSimulationResult>>;
  loadScenario: (scenario: ElectionInput, lawVersions: ElectoralLawVersionId[]) => Promise<void>;
  loadOnDataFiles: (files: OnDataImportFiles, lawVersions: ElectoralLawVersionId[]) => Promise<void>;
  loadFixture: (lawVersions: ElectoralLawVersionId[]) => Promise<void>;
};

export const useAppStore = create<AppState>((set) => ({
  loadScenario: async (scenario, lawVersions) => {
    const bundle = await simulateScenarioInWorker(scenario, lawVersions);
    set(bundle);
  },
  loadOnDataFiles: async (files, lawVersions) => {
    const bundle = await loadOnDataInWorker(files, lawVersions);
    set(bundle);
  },
  loadFixture: async (lawVersions) => {
    const [cameraScrutiniCsv, senateScrutiniCsv, bonusCandidateListsCsv, cameraCandidateListCsv, senateCandidateListCsv, foreignElectionJson, specialTerritoriesJson] =
      await Promise.all([
        fetchText(cameraScrutiniUrl),
        fetchText(senateScrutiniUrl),
        lawVersions.includes("ac-2822-a-2026-07-16") ? fetchText(bonusCandidateListsUrl) : Promise.resolve(undefined),
        fetchText(cameraCandidateListUrl),
        fetchText(senateCandidateListUrl),
        fetchText(foreignElectionUrl),
        fetchText(specialTerritoriesUrl)
      ]);
    const bundle = await loadOnDataInWorker({
      cameraScrutiniCsv,
      senateScrutiniCsv,
      bonusCandidateListsCsv,
      cameraCandidateListCsv,
      senateCandidateListCsv,
      foreignElectionJson,
      specialTerritoriesJson
    }, lawVersions);
    set(bundle);
  }
}));

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Impossibile caricare ${url}`);
  return response.text();
}
