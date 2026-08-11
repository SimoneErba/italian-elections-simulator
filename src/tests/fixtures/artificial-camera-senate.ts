import type { ElectionInput } from "../../electoral-engine/domain/election";
import { defaultForeignElection2022 } from "../../lib/elections/estero";

export const artificialCameraSenateScenario: ElectionInput = {
  schemaVersion: "1.0",
  lawVersion: "ac-2822-a-2026-07-16",
  lists: [
    { id: "lista-a", name: "Lista A" },
    { id: "lista-b", name: "Lista B" },
    { id: "lista-c", name: "Lista C" },
    { id: "lista-d", name: "Lista D" }
  ],
  coalitions: [],
  regions: [{ id: "r1", name: "Regione 1" }],
  constituencies: [
    { id: "camera-c1", chamber: "camera", regionId: "r1", name: "Camera C1" },
    { id: "senate-c1", chamber: "senate", regionId: "r1", name: "Senato C1" }
  ],
  multiMemberDistricts: [
    { id: "camera-p1", chamber: "camera", constituencyId: "camera-c1", regionId: "r1", name: "Camera P1", seatsWithBonus: 157, seatsWithoutBonus: 192 },
    { id: "camera-p2", chamber: "camera", constituencyId: "camera-c1", regionId: "r1", name: "Camera P2", seatsWithBonus: 157, seatsWithoutBonus: 192 },
    { id: "senate-p1", chamber: "senate", constituencyId: "senate-c1", regionId: "r1", name: "Senato P1", seatsWithBonus: 77, seatsWithoutBonus: 94 },
    { id: "senate-p2", chamber: "senate", constituencyId: "senate-c1", regionId: "r1", name: "Senato P2", seatsWithBonus: 77, seatsWithoutBonus: 95 }
  ],
  listVotes: [
    { chamber: "camera", districtId: "camera-p1", listId: "lista-a", votes: 360_000n },
    { chamber: "camera", districtId: "camera-p1", listId: "lista-b", votes: 290_000n },
    { chamber: "camera", districtId: "camera-p1", listId: "lista-c", votes: 210_000n },
    { chamber: "camera", districtId: "camera-p1", listId: "lista-d", votes: 140_000n },
    { chamber: "camera", districtId: "camera-p2", listId: "lista-a", votes: 355_000n },
    { chamber: "camera", districtId: "camera-p2", listId: "lista-b", votes: 295_000n },
    { chamber: "camera", districtId: "camera-p2", listId: "lista-c", votes: 210_000n },
    { chamber: "camera", districtId: "camera-p2", listId: "lista-d", votes: 140_000n },
    { chamber: "senate", districtId: "senate-p1", listId: "lista-a", votes: 180_000n },
    { chamber: "senate", districtId: "senate-p1", listId: "lista-b", votes: 150_000n },
    { chamber: "senate", districtId: "senate-p1", listId: "lista-c", votes: 100_000n },
    { chamber: "senate", districtId: "senate-p1", listId: "lista-d", votes: 70_000n },
    { chamber: "senate", districtId: "senate-p2", listId: "lista-a", votes: 175_000n },
    { chamber: "senate", districtId: "senate-p2", listId: "lista-b", votes: 150_000n },
    { chamber: "senate", districtId: "senate-p2", listId: "lista-c", votes: 105_000n },
    { chamber: "senate", districtId: "senate-p2", listId: "lista-d", votes: 70_000n }
  ],
  foreignElection: defaultForeignElection2022()
};
