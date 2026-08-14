import { describe, expect, it } from "vitest";
import {
  aggregateCameraPopulation,
  aggregateSenatePopulation,
  allocateSeatsByPopulation,
  calculateCameraBonusSeats,
  calculateSenateBonusSeats,
  cameraGeography2021,
  electoralPopulationRegistry,
  getElectoralPopulationDatasetEffectiveOn
} from "../electoral-engine/population/bonus-seat-allocation";

const dataset2021 = electoralPopulationRegistry.find((dataset) => dataset.id === "electoral-population-2021")!;

describe("population-derived bonus seat allocation", () => {
  it("aggregates 2021 Camera population to the 28 parliamentary constituencies", () => {
    const populations = Object.fromEntries(
      aggregateCameraPopulation(dataset2021.municipalities, cameraGeography2021).map((territory) => [
        territory.territoryId,
        Number(territory.population)
      ])
    );

    expect(Object.keys(populations)).toHaveLength(28);
    expect(populations["camera-piemonte-1"]).toBe(1_881_488);
    expect(populations["camera-lombardia-4"]).toBe(1_750_600);
    expect(populations["camera-valle-d-aosta"]).toBe(123_337);
    expect(populations["camera-trentino-alto-adige"]).toBe(1_077_574);
  });

  it("aggregates 2021 Senate population by region", () => {
    const populations = Object.fromEntries(
      aggregateSenatePopulation(dataset2021.municipalities).map((territory) => [
        territory.territoryId,
        Number(territory.population)
      ])
    );

    expect(populations.piemonte).toBe(4_256_350);
    expect(populations.lombardia).toBe(9_913_122);
    expect(populations.molise).toBe(290_769);
    expect(populations["trentino-alto-adige"]).toBe(1_077_574);
  });

  it("uses natural quotient and largest remainders for the Senate Piemonte example", () => {
    const result = calculateSenateBonusSeats(dataset2021);
    const piemonte = result.territories.find((territory) => territory.territoryId === "piemonte")!;

    expect(result.quotient).toBe(1_652_377n);
    expect(piemonte.integerSeats).toBe(2);
    expect(piemonte.remainder).toBe(951_596n);
  });

  it("always sums successful allocations to the requested seat count and can assign zero seats", () => {
    const result = calculateSenateBonusSeats(dataset2021);
    const seats = Object.fromEntries(result.territories.map((territory) => [territory.territoryId, territory.seats]));

    expect(result.unresolvedTies).toEqual([]);
    expect(result.territories.reduce((sum, territory) => sum + territory.seats, 0)).toBe(35);
    expect(seats.molise).toBe(0);
    expect(seats.basilicata).toBe(0);
  });

  it("reports boundary ties without applying a made-up tiebreak", () => {
    const result = allocateSeatsByPopulation(
      [
        { territoryId: "a", population: 100n },
        { territoryId: "b", population: 100n },
        { territoryId: "c", population: 10n }
      ],
      3,
      "tie-fixture"
    );

    expect(result.unresolvedTies).toEqual([{ territoryIds: ["a", "b"], affectedSeatNumber: 1 }]);
    expect(result.territories.reduce((sum, territory) => sum + territory.seats, 0)).toBe(2);
  });

  it("reproduces the 2021 Camera 70-seat bonus table", () => {
    const seats = Object.fromEntries(calculateCameraBonusSeats(dataset2021).territories.map((territory) => [territory.territoryId, territory.seats]));

    expect(seats).toMatchObject({
      "camera-piemonte-1": 2,
      "camera-piemonte-2": 3,
      "camera-lombardia-1": 5,
      "camera-lombardia-2": 3,
      "camera-lombardia-3": 2,
      "camera-lombardia-4": 2,
      "camera-molise": 0,
      "camera-puglia": 5
    });
    expect(Object.values(seats).reduce((sum, value) => sum + value, 0)).toBe(70);
  });

  it("reproduces the 2021 Senate 35-seat bonus table and excludes VdA/TAA", () => {
    const territories = calculateSenateBonusSeats(dataset2021).territories;
    const seats = Object.fromEntries(territories.map((territory) => [territory.territoryId, territory.seats]));

    expect(seats).toMatchObject({
      piemonte: 3,
      lombardia: 6,
      veneto: 3,
      molise: 0,
      basilicata: 0
    });
    expect(seats["valle-d-aosta"]).toBeUndefined();
    expect(seats["trentino-alto-adige"]).toBeUndefined();
    expect(Object.values(seats).reduce((sum, value) => sum + value, 0)).toBe(35);
  });

  it("selects the newest effective electoral population dataset", () => {
    const futureRegistry = [
      ...electoralPopulationRegistry,
      {
        ...dataset2021,
        id: "electoral-population-2026-active",
        censusDate: "2026-12-31",
        dprDate: "2027-02-10",
        effectiveFrom: "2027-02-20"
      }
    ];

    expect(getElectoralPopulationDatasetEffectiveOn("2026-07-16").id).toBe("electoral-population-2021");
    expect(getElectoralPopulationDatasetEffectiveOn("2027-01-01").id).toBe("electoral-population-2021");
    expect(getElectoralPopulationDatasetEffectiveOn("2022-09-25").id).toBe("electoral-population-2021");
    expect(getElectoralPopulationDatasetEffectiveOn("2027-03-01", futureRegistry).id).toBe("electoral-population-2026-active");
  });
});
