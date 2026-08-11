import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("electoral population CSV", () => {
  it("contains all included 2021 comuni and excludes VdA/TAA", () => {
    const csv = readFileSync(resolve("data/population/electoral-2021.csv"), "utf8").trim();
    const rows = csv.split("\n").slice(1).map(parseCsvRow);
    const totalPopulation = rows.reduce((sum, row) => sum + Number(row.population), 0);
    const regions = new Set(rows.map((row) => row.regionId));

    expect(rows).toHaveLength(7_548);
    expect(totalPopulation).toBe(57_833_199);
    expect(regions.has("valle-d-aosta")).toBe(false);
    expect(regions.has("trentino-alto-adige")).toBe(false);
    expect(rows.find((row) => row.istatCode === "001001")).toMatchObject({
      municipalityName: "Agliè",
      regionId: "piemonte",
      population: "2562"
    });
  });
});

function parseCsvRow(line: string): Record<string, string> {
  const headers = ["istatCode", "municipalityName", "regionId", "population"];
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
}
