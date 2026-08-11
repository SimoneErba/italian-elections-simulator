import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadBonusCandidateListsCsv, loadOnData2022Scenario as loadOnData2022ScenarioRaw, type OnDataImportFiles } from "../datasets/loaders/ondata-2022-loader";
import { simulateElection } from "../electoral-engine/pipeline/simulate-election";
import { defaultForeignElection2022 } from "../lib/elections/estero";

const cameraCsv = `cod,COMUNE,TIPO ELEZIONE,DATA ELEZIONE,COLLEGIO PLURINOMINALE,COLLEGIO UNINOMINALE,CIRCOSCRIZIONE,NAZIONE,PROVINCIA,COGNOME,NOME,ALTRO NOME,LISTA,VOTANTI TOTALI,ELETTORI TOTALI,VOTI CANDIDATO,VOTI SOLO CANDIDATO,VOTI LISTE,SCHEDE BIANCHE,SCHEDE CONTESTATE,SCHEDE NULLE,CODICE ISTAT
130230010,ALTINO,Camera Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (CHIETI),ABRUZZO,ITALIA,CHIETI,BAGNAI,ALBERTO,,FRATELLI D'ITALIA CON GIORGIA MELONI,1350,2288,614,22,307,28,0,43,069001
130230010,ALTINO,Camera Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (CHIETI),ABRUZZO,ITALIA,CHIETI,BAGNAI,ALBERTO,,FORZA ITALIA,1350,2288,614,22,150,28,0,43,069001
130230010,ALTINO,Camera Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (CHIETI),ABRUZZO,ITALIA,CHIETI,BAGNAI,ALBERTO,,LEGA PER SALVINI PREMIER,1350,2288,614,22,131,28,0,43,069001
130230010,ALTINO,Camera Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (CHIETI),ABRUZZO,ITALIA,CHIETI,MERLINO,ELISABETTA,,PARTITO DEMOCRATICO - ITALIA DEMOCRATICA E PROGRESSISTA,1350,2288,237,6,182,28,0,43,069001
130230010,ALTINO,Camera Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (CHIETI),ABRUZZO,ITALIA,CHIETI,MERLINO,ELISABETTA,,+EUROPA,1350,2288,237,6,30,28,0,43,069001
130230010,ALTINO,Camera Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (CHIETI),ABRUZZO,ITALIA,CHIETI,GRIPPA,CARMELA,,MOVIMENTO 5 STELLE,1350,2288,268,118,150,28,0,43,069001`;

const senateCsv = `cod,COMUNE,TIPO ELEZIONE,DATA ELEZIONE,COLLEGIO PLURINOMINALE,COLLEGIO UNINOMINALE,CIRCOSCRIZIONE,NAZIONE,PROVINCIA,COGNOME,NOME,ALTRO NOME,LISTA,VOTANTI TOTALI,ELETTORI TOTALI,VOTI CANDIDATO,VOTI SOLO CANDIDATO,VOTI LISTE,SCHEDE BIANCHE,SCHEDE CONTESTATE,SCHEDE NULLE,CODICE ISTAT
130230010,ALTINO,Senato Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (PESCARA),ABRUZZO,ITALIA,CHIETI,LIRIS,GUIDO,,FRATELLI D'ITALIA CON GIORGIA MELONI,1350,2288,608,22,297,27,0,39,069001
130230010,ALTINO,Senato Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (PESCARA),ABRUZZO,ITALIA,CHIETI,LIRIS,GUIDO,,FORZA ITALIA,1350,2288,608,22,160,27,0,39,069001
130230010,ALTINO,Senato Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (PESCARA),ABRUZZO,ITALIA,CHIETI,LIRIS,GUIDO,,LEGA PER SALVINI PREMIER,1350,2288,608,22,125,27,0,39,069001
130230010,ALTINO,Senato Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (PESCARA),ABRUZZO,ITALIA,CHIETI,CARUGNO,MASSIMO,,PARTITO DEMOCRATICO - ITALIA DEMOCRATICA E PROGRESSISTA,1350,2288,228,2,173,27,0,39,069001
130230010,ALTINO,Senato Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (PESCARA),ABRUZZO,ITALIA,CHIETI,CARUGNO,MASSIMO,,+ EUROPA,1350,2288,228,2,30,27,0,39,069001
130230010,ALTINO,Senato Italia,25/09/2022,ABRUZZO - P01,ABRUZZO - U01 (PESCARA),ABRUZZO,ITALIA,CHIETI,MALANDRA,ISIDORO,,MOVIMENTO 5 STELLE,1350,2288,276,123,153,27,0,39,069001`;

const foreignElectionJson = JSON.stringify(defaultForeignElection2022());

function loadOnData2022Scenario(files: Omit<OnDataImportFiles, "foreignElectionJson"> & { foreignElectionJson?: string }) {
  return loadOnData2022ScenarioRaw({
    ...files,
    foreignElectionJson: files.foreignElectionJson ?? foreignElectionJson
  });
}

describe("OnData 2022 loader", () => {
  it("infers coalitions from lists supporting the same uninominal candidate", () => {
    const scenario = loadOnData2022Scenario({ cameraScrutiniCsv: cameraCsv, senateScrutiniCsv: senateCsv });

    const coalitionGroups = scenario.coalitions.map((coalition) => coalition.listIds).sort((a, b) => b.length - a.length);
    expect(coalitionGroups).toContainEqual([
      "forza-italia",
      "fratelli-d-italia-con-giorgia-meloni",
      "lega-per-salvini-premier"
    ]);
    expect(coalitionGroups).toContainEqual([
      "europa",
      "partito-democratico-italia-democratica-e-progressista"
    ]);
    expect(scenario.coalitions.find((coalition) => coalition.listIds.includes("fratelli-d-italia-con-giorgia-meloni"))?.alias).toBe("Centrodestra");
    expect(scenario.coalitions.find((coalition) => coalition.listIds.includes("partito-democratico-italia-democratica-e-progressista"))?.alias).toBe("Centrosinistra");
    expect(scenario.lists.find((list) => list.id === "movimento-5-stelle")?.coalitionId).toBeUndefined();
  });

  it("normalizes equivalent list labels and aggregates Camera/Senate votes", () => {
    const scenario = loadOnData2022Scenario({ cameraScrutiniCsv: cameraCsv, senateScrutiniCsv: senateCsv });

    expect(scenario.lists.filter((list) => list.id === "europa")).toHaveLength(1);
    expect(scenario.listVotes).toContainEqual({
      chamber: "camera",
      districtId: "camera-abruzzo-p01",
      listId: "europa",
      votes: 30n
    });
    expect(scenario.listVotes).toContainEqual({
      chamber: "senate",
      districtId: "senate-abruzzo-p01",
      listId: "europa",
      votes: 30n
    });
  });

  it("imports explicit bonus constituency nomination rows", () => {
    const scenario = loadOnData2022Scenario({
      cameraScrutiniCsv: cameraCsv,
      senateScrutiniCsv: senateCsv,
      bonusNominationsCsv: `chamber,constituencyId,connectedSubjectId,listId,candidateId,position,nominationType
camera,camera-abruzzo,coalition-forza-italia-fratelli-d-italia-con-giorgia-meloni-lega-per-salvini-premier,fratelli-d-italia-con-giorgia-meloni,candidate-1,1,bonus-constituency-list`
    });

    expect(scenario.nominations).toEqual([
      {
        candidateId: "candidate-1",
        chamber: "camera",
        listId: "fratelli-d-italia-con-giorgia-meloni",
        constituencyId: "camera-abruzzo",
        connectedSubjectId: "coalition-forza-italia-fratelli-d-italia-con-giorgia-meloni-lega-per-salvini-premier",
        position: 1,
        nominationType: "bonus-constituency-list"
      }
    ]);
  });

  it("imports bonus candidate priority rows by winning subject", () => {
    const scenario = loadOnData2022Scenario({
      cameraScrutiniCsv: cameraCsv,
      senateScrutiniCsv: senateCsv,
      bonusCandidateListsCsv: `chamber,connectedSubjectId,candidateId,position,lastName,firstName
camera,coalition-forza-italia-fratelli-d-italia-con-giorgia-meloni-lega-per-salvini-premier,bonus-candidate-1,1,Rossi,Maria
senate,coalition-forza-italia-fratelli-d-italia-con-giorgia-meloni-lega-per-salvini-premier,bonus-candidate-2,1,Bianchi,Luca`
    });

    expect(scenario.bonusCandidateLists).toEqual([
      {
        candidateId: "bonus-candidate-1",
        chamber: "camera",
        connectedSubjectId: "coalition-forza-italia-fratelli-d-italia-con-giorgia-meloni-lega-per-salvini-premier",
        position: 1
      },
      {
        candidateId: "bonus-candidate-2",
        chamber: "senate",
        connectedSubjectId: "coalition-forza-italia-fratelli-d-italia-con-giorgia-meloni-lega-per-salvini-premier",
        position: 1
      }
    ]);
    expect(scenario.candidates).toContainEqual({ id: "bonus-candidate-1", firstName: "Maria", lastName: "Rossi" });
  });

  it("keeps repeated bonus candidate names when rows have distinct ids", () => {
    const bundle = loadBonusCandidateListsCsv(`chamber,connectedSubjectId,candidateId,position,lastName,firstName
camera,coalition-a,candidate-a-1,1,Bianchi,Anna
camera,coalition-a,candidate-a-2,2,Bianchi,Anna
camera,coalition-a,candidate-b,3,Rossi,Maria`);

    expect(bundle.priorities).toEqual([
      { chamber: "camera", connectedSubjectId: "coalition-a", candidateId: "candidate-a-1", position: 1 },
      { chamber: "camera", connectedSubjectId: "coalition-a", candidateId: "candidate-a-2", position: 2 },
      { chamber: "camera", connectedSubjectId: "coalition-a", candidateId: "candidate-b", position: 3 }
    ]);
    expect(bundle.candidates).toEqual([
      { id: "candidate-a-1", firstName: "Anna", lastName: "Bianchi" },
      { id: "candidate-a-2", firstName: "Anna", lastName: "Bianchi" },
      { id: "candidate-b", firstName: "Maria", lastName: "Rossi" }
    ]);
  });

  it("imports ordered plurinominal candidate list rows", () => {
    const scenario = loadOnData2022Scenario({
      cameraScrutiniCsv: cameraCsv,
      senateScrutiniCsv: senateCsv,
      cameraCandidateListCsv: `"DATAELEZIONE";"CODTIPOELEZIONE";"Circoscrizione";"CollPlurinom";"descrlista";"cognome";"nome";"datanascita";"luogonascita";"sesso";"CODTIPOELETTO"
25/9/2022 00:00:00;"C";"ABRUZZO";"ABRUZZO - P01";"MOVIMENTO 5 STELLE";"CONTE";"GIUSEPPE";8/8/1964 00:00:00;"VOLTURARA APPULA (FG)";"M";"N"
25/9/2022 00:00:00;"C";"ABRUZZO";"ABRUZZO - P01";"MOVIMENTO 5 STELLE";"ROSSI";"MARIA";1/1/1980 00:00:00;"CHIETI";"F";"N"`
    });

    expect(scenario.candidates).toHaveLength(2);
    expect(scenario.nominations).toContainEqual(
      expect.objectContaining({
        chamber: "camera",
        listId: "movimento-5-stelle",
        districtId: "camera-abruzzo-p01",
        constituencyId: "camera-abruzzo",
        position: 1,
        nominationType: "multi-member"
      })
    );
    expect(scenario.nominations).toContainEqual(expect.objectContaining({ position: 2 }));
  });

  it("loads fixed official seat counts for imported plurinominal districts", () => {
    const scenario = loadOnData2022Scenario({ cameraScrutiniCsv: cameraCsv, senateScrutiniCsv: senateCsv });

    expect(
      scenario.multiMemberDistricts
        .filter((district) => district.chamber === "camera")
        .reduce((sum, district) => sum + district.seatsWithoutBonus, 0)
    ).toBe(8);
    expect(
      scenario.multiMemberDistricts
        .filter((district) => district.chamber === "senate")
        .reduce((sum, district) => sum + district.seatsWithoutBonus, 0)
    ).toBe(4);
  });

  it("simulates the bundled OnData folder import without zero-seat allocation errors", () => {
    const scenario = loadOnData2022Scenario({
      cameraScrutiniCsv: readFixture("Politiche2022_Scrutini_Camera_Italia.csv"),
      senateScrutiniCsv: readFixture("Politiche2022_Scrutini_Senato_Italia.csv"),
      bonusCandidateListsCsv: readFixture("bonus-candidates-2022-random.csv"),
      cameraCandidateListCsv: readFixture("camera-2022-candidatilista.csv"),
      senateCandidateListCsv: readFixture("senato-2022-candlista.csv"),
      foreignElectionJson: readFixture("estero.json")
    });

    const result = simulateElection(scenario);

    expect(result.nationalResults.camera).toBeDefined();
    expect(result.nationalResults.senate).toBeDefined();
    expect(result.trace.some((entry) => entry.level === "blocking")).toBe(false);
    expect(result.foreignResults.camera?.partitionResults).toHaveLength(4);
    expect(result.foreignResults.senato?.partitionResults).toHaveLength(4);
    expect(result.electedCandidates).toHaveLength(572);
    expect(result.ties.filter((tie) => tie.stage.includes("proclamazione candidati"))).toHaveLength(4);
  });
});

function readFixture(name: string): string {
  return readFileSync(resolve("data/input", name), "utf8");
}
