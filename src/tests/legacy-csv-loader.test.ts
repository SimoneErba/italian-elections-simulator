import { describe, expect, it } from "vitest";
import { loadLegacyCameraCsv } from "../datasets/loaders/legacy-csv-loader";

describe("legacy csv loader", () => {
  it("maps old ExcelInput headers to the new scenario model", () => {
    const scenario = loadLegacyCameraCsv(`CIRCOSCRIZIONE,COLLEGIOPLURINOMINALE,COLLEGIOUNINOMINALE,ELETTORI,VOTANTI,SCHEDE_BIANCHE,COGNOME,NOME,VOTI_CANDIDATO,LISTA,VOTI_LISTA
Lombardia 1,P01,U01,100,80,1,Rossi,Mario,40,Lista A,1000
Lombardia 1,P01,U01,100,80,1,Bianchi,Luisa,30,Lista B,700
Lombardia 1,P02,U02,100,80,1,Rossi,Mario,50,Lista A,500`);

    expect(scenario.lists.map((list) => list.name)).toEqual(["Lista A", "Lista B"]);
    expect(scenario.multiMemberDistricts).toHaveLength(2);
    expect(scenario.listVotes).toContainEqual({
      chamber: "camera",
      districtId: "camera-p01",
      listId: "lista-a",
      votes: 1000n
    });
  });
});
