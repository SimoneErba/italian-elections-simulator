import { loadOnData2022Scenario } from "../../datasets/loaders/ondata-2022-loader";
import type { ElectionInput } from "../../electoral-engine/domain/election";
import { defaultForeignElection2022 } from "../../lib/elections/estero/default2022";
import { buildSimplifiedScenarioFromGeography } from "./build-simplified-scenario";
import type { SimplifiedScenarioRequest } from "./types";

import cameraScrutiniCsv from "../../../data/input/Politiche2022_Scrutini_Camera_Italia.csv?raw";
import senateScrutiniCsv from "../../../data/input/Politiche2022_Scrutini_Senato_Italia.csv?raw";
import cameraCandidateListCsv from "../../../data/input/camera-2022-candidatilista.csv?raw";
import senateCandidateListCsv from "../../../data/input/senato-2022-candlista.csv?raw";
import specialTerritoriesJson from "../../../data/input/special-territories-2022.json?raw";

let defaultGeography: ElectionInput | undefined;

export function buildSimplifiedScenario(request: SimplifiedScenarioRequest): ElectionInput {
  defaultGeography ??= loadOnData2022Scenario({
    cameraScrutiniCsv,
    senateScrutiniCsv,
    cameraCandidateListCsv,
    senateCandidateListCsv,
    foreignElectionJson: JSON.stringify(defaultForeignElection2022()),
    specialTerritoriesJson
  });
  return buildSimplifiedScenarioFromGeography(request, defaultGeography);
}
