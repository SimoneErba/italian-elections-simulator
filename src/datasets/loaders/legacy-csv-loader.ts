import type { Chamber } from "../../electoral-engine/domain/chamber";
import type { ElectionInput } from "../../electoral-engine/domain/election";
import { defaultForeignElection2022 } from "../../lib/elections/estero";
import { normalizeInteger, parseDelimited, slug, unique } from "./csv";

type LegacyRow = {
  CIRCOSCRIZIONE: string;
  COLLEGIOPLURINOMINALE: string;
  COLLEGIOUNINOMINALE?: string;
  ELETTORI?: string;
  VOTANTI?: string;
  SCHEDE_BIANCHE?: string;
  COGNOME?: string;
  NOME?: string;
  VOTI_CANDIDATO?: string;
  LISTA: string;
  VOTI_LISTA: string;
};

export function loadLegacyCameraCsv(text: string, chamber: Chamber = "camera"): ElectionInput {
  const rows = parseDelimited(text) as LegacyRow[];
  const normalizedRows = rows.filter((row) => row.CIRCOSCRIZIONE && row.COLLEGIOPLURINOMINALE && row.LISTA);
  const regions = [{ id: "italia", name: "Italia" }];
  const constituencies = unique(normalizedRows.map((row) => row.CIRCOSCRIZIONE)).map((name) => ({
    id: slug(`${chamber}-${name}`),
    chamber,
    regionId: "italia",
    name
  }));
  const constituencyByName = new Map(constituencies.map((item) => [item.name, item.id]));
  const multiMemberDistricts = unique(normalizedRows.map((row) => `${row.CIRCOSCRIZIONE}|${row.COLLEGIOPLURINOMINALE}`)).map(
    (key) => {
      const [constituencyName, districtName] = key.split("|");
      return {
        id: slug(`${chamber}-${districtName}`),
        chamber,
        constituencyId: constituencyByName.get(constituencyName)!,
        regionId: "italia",
        name: districtName,
        seatsWithBonus: 0,
        seatsWithoutBonus: 0
      };
    }
  );
  const districtByName = new Map(multiMemberDistricts.map((item) => [item.name, item.id]));
  const lists = unique(normalizedRows.map((row) => row.LISTA)).map((name) => ({ id: slug(name), name }));

  const voteTotals = new Map<string, bigint>();
  for (const row of normalizedRows) {
    const key = `${districtByName.get(row.COLLEGIOPLURINOMINALE)}|${slug(row.LISTA)}`;
    voteTotals.set(key, (voteTotals.get(key) ?? 0n) + BigInt(normalizeInteger(row.VOTI_LISTA)));
  }

  const listVotes = [...voteTotals.entries()].map(([key, votes]) => {
    const [districtId, listId] = key.split("|");
    return { chamber, districtId, listId, votes };
  });

  return {
    schemaVersion: "1.0",
    lawVersion: "ac-2822-a-2026-07-16",
    lists,
    coalitions: [],
    regions,
    constituencies,
    multiMemberDistricts,
    listVotes,
    foreignElection: defaultForeignElection2022()
  };
}
