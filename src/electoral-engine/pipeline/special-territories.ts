import type { ElectionInput, MultiMemberDistrict } from "../domain/election";

export type SpecialTerritoryId = "valle-aosta" | "trentino-alto-adige";

const VALLE_D_AOSTA_IDS = new Set(["valle-aosta", "valle-d-aosta", "vda", "camera-valle-d-aosta"]);
const TRENTINO_ALTO_ADIGE_IDS = new Set(["trentino-alto-adige", "taa", "camera-trentino-alto-adige"]);

export function specialTerritoryForMultiMemberDistrict(
  district: MultiMemberDistrict
): SpecialTerritoryId | undefined {
  if (district.specialTerritory) return district.specialTerritory;
  if (VALLE_D_AOSTA_IDS.has(district.regionId) || VALLE_D_AOSTA_IDS.has(district.constituencyId)) return "valle-aosta";
  if (TRENTINO_ALTO_ADIGE_IDS.has(district.regionId) || TRENTINO_ALTO_ADIGE_IDS.has(district.constituencyId)) {
    return "trentino-alto-adige";
  }
  return undefined;
}
