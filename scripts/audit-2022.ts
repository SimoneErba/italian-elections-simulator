import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadOnData2022Scenario } from "../src/datasets/loaders/ondata-2022-loader";
import { simulateElection } from "../src/electoral-engine/pipeline/simulate-election";
import { allocateByHare } from "../src/electoral-engine/pipeline/proportional-allocation";
import { normalizeListName, slug } from "../src/datasets/loaders/csv";

const input = loadOnData2022Scenario({
  cameraScrutiniCsv: read("data/input/Camera_Italia_LivComune.txt"),
  senateScrutiniCsv: read("data/input/Politiche2022_Scrutini_Senato_Italia.csv"),
  cameraCandidateListCsv: read("data/input/CAMERA_ITALIA_20220925_pluri.csv"),
  senateCandidateListCsv: read("data/input/SENATO_ITALIA_20220925_pluri.csv"),
  specialTerritoriesJson: read("data/input/special-territories-2022.json"),
  foreignElectionJson: read("data/input/estero.json")
});
const result = simulateElection(input);
const reference = JSON.parse(read("data/reference/elected-2022-full.json")) as {
  elected: Array<{ chamber: "camera" | "senate"; candidate: string; electionType: string }>;
};

const expected = new Map(reference.elected.map((member) => [identity(member.chamber, member.candidate), member]));
const actual = new Map(result.allElectedCandidates.map((member) => [identity(member.chamber, member.displayName), member]));
const missing = [...expected].filter(([key]) => !actual.has(key)).map(([, member]) => `${member.chamber} ${member.candidate}`);
const unexpected = [...actual].filter(([key]) => !expected.has(key)).map(([, member]) => `${member.chamber} ${member.displayName}`);

console.log(`Vote totals: Camera ${result.nationalResults.camera?.totalValidVotes ?? 0n}; Senate ${result.nationalResults.senate?.totalValidVotes ?? 0n}`);
console.log(`Camera PD/AVS votes: ${input.listVotes.filter((v) => v.chamber === "camera" && ["partito-democratico-italia-democratica-e-progressista", "alleanza-verdi-e-sinistra"].includes(v.listId)).reduce((a, v) => a + v.votes, 0n)} / ${input.listVotes.filter((v) => v.chamber === "camera" && v.listId === "alleanza-verdi-e-sinistra").reduce((a, v) => a + v.votes, 0n)}`);
console.log(`Threshold camera coalition lists: ${JSON.stringify(result.thresholds.camera?.admittedCoalitionLists)}`);
console.log(`SVP: ${JSON.stringify(input.lists.filter((l) => l.id.includes("volkspartei")))}; regions=${JSON.stringify(input.regions.filter((r) => r.id.includes("trentino")))}; wins=${JSON.stringify((input.singleMemberDistricts ?? []).filter((d) => d.regionId.includes("trentino")).map((d) => ({id:d.id,region:d.regionId})))}`);
console.log(`Camera subject seats: ${JSON.stringify(result.nationalResults.camera?.ordinarySeats)}`);
console.log(`Direct PD/AVS allocation: ${JSON.stringify(allocateByHare({ pd: 5356225n, avs: 1018909n }, 68, "audit", "audit").seats)}`);
console.log(`Territorial rows: ${result.territorialResults.length}; compensation transfers: ${result.territorialResults.reduce((sum, row) => sum + (row.allocationLedger?.transfers.length ?? 0), 0)}`);
console.log(`Members: ${result.allElectedCandidates.length}/600; ties or unresolved seats: ${result.ties.length}`);
if (result.allElectedCandidates.length === 0) console.log(`Validation trace: ${JSON.stringify(result.trace, bigintJson)}`);
const expectedCells: Record<string, number> = {};
for (const member of reference.elected.filter((m: any) => m.electionType === "plurinominal")) {
  const item = member as any;
  expectedCells[`${item.chamber}-${slug(item.district)}|${slug(normalizeListName(item.list))}`] = (expectedCells[`${item.chamber}-${slug(item.district)}|${slug(normalizeListName(item.list))}`] ?? 0) + 1;
}
const actualCells: Record<string, number> = {};
for (const row of result.territorialResults.filter((item) => item.scope === "district")) for (const [list, seats] of Object.entries(row.seats)) if (seats) actualCells[`${row.territoryId}|${list}`] = seats;
const cellDiffs = [...new Set([...Object.keys(expectedCells), ...Object.keys(actualCells)])].filter((key) => (expectedCells[key] ?? 0) !== (actualCells[key] ?? 0));
console.log(`District/list differences (${cellDiffs.length}): ${cellDiffs.slice(0, 30).map((key) => `${key} ${actualCells[key] ?? 0}/${expectedCells[key] ?? 0}`).join("; ")}`);
const districtParent = new Map(input.multiMemberDistricts.map((d) => [d.id, d.chamber === "camera" ? d.constituencyId : d.regionId]));
const expectedParents: Record<string, number> = {}, actualParents: Record<string, number> = {};
for (const [key, seats] of Object.entries(expectedCells)) { const [district, list] = key.split("|"); const parent = districtParent.get(district); if (parent) expectedParents[`${parent}|${list}`] = (expectedParents[`${parent}|${list}`] ?? 0) + seats; }
for (const [key, seats] of Object.entries(actualCells)) { const [district, list] = key.split("|"); const parent = districtParent.get(district); if (parent) actualParents[`${parent}|${list}`] = (actualParents[`${parent}|${list}`] ?? 0) + seats; }
const parentDiffs = [...new Set([...Object.keys(expectedParents), ...Object.keys(actualParents)])].filter((key) => (expectedParents[key] ?? 0) !== (actualParents[key] ?? 0));
console.log(`Parent/list differences (${parentDiffs.length}): ${parentDiffs.map((key) => `${key} ${actualParents[key] ?? 0}/${expectedParents[key] ?? 0}`).join("; ")}`);
const listCoalition = new Map(input.lists.map((l) => [l.id, l.coalitionId ?? l.id]));
const expectedSubjects: Record<string, number> = {}, actualSubjects: Record<string, number> = {};
for (const [key, seats] of Object.entries(expectedParents)) { const split=key.lastIndexOf("|"); const parent=key.slice(0,split), list=key.slice(split+1); const subject=listCoalition.get(list) ?? list; expectedSubjects[`${parent}|${subject}`]=(expectedSubjects[`${parent}|${subject}`]??0)+seats; }
for (const [key, seats] of Object.entries(actualParents)) { const split=key.lastIndexOf("|"); const parent=key.slice(0,split), list=key.slice(split+1); const subject=listCoalition.get(list) ?? list; actualSubjects[`${parent}|${subject}`]=(actualSubjects[`${parent}|${subject}`]??0)+seats; }
const subjectDiffs=[...new Set([...Object.keys(expectedSubjects),...Object.keys(actualSubjects)])].filter(k=>(expectedSubjects[k]??0)!==(actualSubjects[k]??0));
console.log(`Parent/subject differences (${subjectDiffs.length}): ${subjectDiffs.map(k=>`${k} ${actualSubjects[k]??0}/${expectedSubjects[k]??0}`).join("; ")}`);
const hLedger=result.territorialResults.find(r=>r.chamber==="camera"&&r.scope==="constituency")?.allocationLedger;
console.log(`Article h transfers: ${hLedger?.transfers.map(t=>`${t.fromTerritoryId}/${short(t.fromSubjectId)} -> ${t.toTerritoryId}/${short(t.toSubjectId)}`).join("; ")}`);
console.log(`Article h donor cells: ${hLedger?.transfers.map(t=>{const c=hLedger.cells.find(c=>c.territoryId===t.fromTerritoryId&&c.subjectId===t.fromSubjectId);return `${t.fromTerritoryId}/${short(t.fromSubjectId)} int=${c?.integerSeats} remUsed=${c?.remainderInitiallyUsed} rem=${c?.remainder}`}).join("; ")}`);
for (const chamber of ["camera", "senate"] as const) {
  const allocated: Record<string, number> = {};
  for (const row of result.territorialResults.filter((item) => item.chamber === chamber && item.scope === "district")) {
    for (const [list, seats] of Object.entries(row.seats)) allocated[list] = (allocated[list] ?? 0) + seats;
  }
  console.log(`${chamber} allocated list seats: ${JSON.stringify(allocated)}`);
}
console.log(`Missing (${missing.length}):${missing.length ? `\n${missing.join("\n")}` : " none"}`);
console.log(`Unexpected (${unexpected.length}):${unexpected.length ? `\n${unexpected.join("\n")}` : " none"}`);
for (const name of missing) {
  const [chamber, ...parts] = name.split(" ");
  const member = expected.get(identity(chamber, parts.join(" "))) as any;
  console.log(`Missing detail: ${name} @ ${member?.district ?? "?"} / ${member?.list ?? "?"}`);
}
for (const name of unexpected) {
  const [, ...parts] = name.split(" ");
  const member = result.allElectedCandidates.find((item) => identity(item.chamber, item.displayName) === identity(item.chamber, parts.join(" ")));
  const record = result.electedCandidates.find((item) => item.candidateId === member?.candidateId);
  console.log(`Unexpected detail: ${name} @ ${record?.electedIn ?? "?"} / ${member?.listId ?? "?"}: ${record?.resolutionReason ?? "direct"}`);
}

if (missing.length > 0 || unexpected.length > 0 || result.allElectedCandidates.length !== 600) process.exitCode = 1;

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function identity(chamber: string, name: string): string {
  // Official nomination files use both legal names and ballot aliases, e.g.
  // "VERSACE GIUSEPPINA DETTA GIUSY" and "GIUSEPPINA VERSACE".  The word
  // after detto/detta is an alias, not an additional identity token.
  const tokens = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\bDETT[OA]\s+[A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  return `${chamber}|${tokens.join(" ")}`;
}
function short(value:string){return value.includes("forza-italia-fratelli")?"cdx":value.includes("alleanza-verdi")?"csx":value;}
function bigintJson(_key: string, value: unknown) { return typeof value === "bigint" ? value.toString() : value; }
