import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Chamber } from "../electoral-engine/domain/chamber";
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
  it("keeps a complete 600-member elected reference for the 2022 Parliament", () => {
    const reference = readFullReference();

    expect(reference.elected).toHaveLength(600);
    expect(reference.totals).toEqual({
      "camera.foreign": 8,
      "camera.plurinominal": 245,
      "camera.single-member": 147,
      "senate.foreign": 4,
      "senate.plurinominal": 122,
      "senate.single-member": 74
    });
    expect(new Set(reference.elected.map((candidate) => candidate.candidateId)).size).toBe(600);
    expect(reference.elected.filter((candidate) => candidate.sourceCoverage === "integrated-foreign-constituency")).toHaveLength(12);
    expect(reference.elected.filter((candidate) => candidate.sourceCoverage === "integrated-special-territory")).toHaveLength(8);
    expect(reference.elected.filter((candidate) => candidate.sourceCoverage === "integrated-cassation-recovery")).toHaveLength(1);
  });

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
      votes: 31n
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

    expect(scenario.nominations).toContainEqual(
      {
        candidateId: "candidate-1",
        chamber: "camera",
        listId: "fratelli-d-italia-con-giorgia-meloni",
        constituencyId: "camera-abruzzo",
        connectedSubjectId: "coalition-forza-italia-fratelli-d-italia-con-giorgia-meloni-lega-per-salvini-premier",
        position: 1,
        nominationType: "bonus-constituency-list"
      }
    );
    expect(scenario.nominations).toContainEqual(
      expect.objectContaining({
        chamber: "camera",
        candidateId: "camera-abruzzo-u01-chieti-bagnai-alberto",
        districtId: "camera-abruzzo-u01-chieti",
        position: 1,
        nominationType: "single-member"
      })
    );
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

    expect(
      scenario.nominations?.filter(
        (nomination) => nomination.listId === "movimento-5-stelle" && nomination.nominationType === "multi-member"
      )
    ).toHaveLength(2);
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
    ).toBe(6);
    expect(
      scenario.multiMemberDistricts
        .filter((district) => district.chamber === "senate")
        .reduce((sum, district) => sum + district.seatsWithoutBonus, 0)
    ).toBe(3);
  });

  it("simulates the bundled OnData folder import with the Rosatellum 2022 engine", () => {
    const scenario = loadOnData2022Scenario({
      cameraScrutiniCsv: readFixture("Politiche2022_Scrutini_Camera_Italia.csv"),
      senateScrutiniCsv: readFixture("Politiche2022_Scrutini_Senato_Italia.csv"),
      bonusCandidateListsCsv: readFixture("bonus-candidates-2022-random.csv"),
      cameraCandidateListCsv: readFixture("camera-2022-candidatilista.csv"),
      senateCandidateListCsv: readFixture("senato-2022-candlista.csv"),
      foreignElectionJson: readFixture("estero.json")
    });

    const result = simulateElection(scenario);

    expect(scenario.lawVersion).toBe("rosatellum-2022");
    expect(result.nationalResults.camera).toBeDefined();
    expect(result.nationalResults.senate).toBeDefined();
    expect(result.bonus.awarded).toBe(false);
    expect(result.bonus.failedConditions).toContain("La legge elettorale non prevede un premio di governabilita.");
    expect(result.trace.some((entry) => entry.level === "blocking")).toBe(false);
    expect(result.foreignResults.camera?.partitionResults).toHaveLength(4);
    expect(result.foreignResults.senato?.partitionResults).toHaveLength(4);
    expect(result.nationalResults.senate?.seats).toMatchObject({
      "coalition-forza-italia-fratelli-d-italia-con-giorgia-meloni-lega-per-salvini-premier-noi-moderati-lupi-toti-brugnaro-udc": 112,
      "coalition-alleanza-verdi-e-sinistra-europa-impegno-civico-luigi-di-maio-centro-democratico-partito-democratico-italia-democratica-e-progressista": 39,
      "movimento-5-stelle": 28,
      "azione-italia-viva-calenda": 9,
      "sud-chiama-nord": 1
    });
    expect(proportionalListSeats(result.seatTrace)).toMatchObject({
      camera: {
        "partito-democratico-italia-democratica-e-progressista": 57,
        "forza-italia": 22,
        "fratelli-d-italia-con-giorgia-meloni": 69,
        "alleanza-verdi-e-sinistra": 11,
        "lega-per-salvini-premier": 23
      },
      senate: {
        "partito-democratico-italia-democratica-e-progressista": 31,
        "fratelli-d-italia-con-giorgia-meloni": 34,
        "forza-italia": 9,
        "lega-per-salvini-premier": 13,
        "alleanza-verdi-e-sinistra": 3
      }
    });
    // The reference fixture records candidates marked elected by the source CSVs.
    // This simulator instead proclaims candidates from its calculated territorial
    // allocations, so the two lists are not an identity assertion. Keep this as
    // a regression check for a complete, non-duplicated domestic proclamation.
    expect(result.electedCandidates).toHaveLength(579);
    const electedIds = result.electedCandidates.map((candidate) => candidate.candidateId);
    expect(new Set(electedIds).size).toBe(electedIds.length);
    for (const candidateId of electedIds) {
      expect(scenario.nominations?.some((nomination) => nomination.candidateId === candidateId)).toBe(true);
    }
  });
});

function readFixture(name: string): string {
  return readFileSync(resolve("data/input", name), "utf8");
}

function readFullReference(): {
  totals: Record<`${Chamber}.${string}`, number>;
  elected: Array<{ candidateId: string; sourceCoverage?: string }>;
} {
  return JSON.parse(readFileSync(resolve("data/reference/elected-2022-full.json"), "utf8"));
}

function proportionalListSeats(seatTrace: Array<{ allocationStage: string; chamber: Chamber; partyId: string }>): Record<string, Record<string, number>> {
  const totals: Record<string, Record<string, number>> = {};
  for (const trace of seatTrace) {
    if (trace.allocationStage !== "proclamazione candidati") continue;
    totals[trace.chamber] = totals[trace.chamber] ?? {};
    totals[trace.chamber][trace.partyId] = (totals[trace.chamber][trace.partyId] ?? 0) + 1;
  }
  return totals;
}
