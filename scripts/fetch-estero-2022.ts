import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type ChamberId = "camera" | "senato";
type PartitionId =
  | "EUROPA"
  | "AMERICA_MERIDIONALE"
  | "AMERICA_SETTENTRIONALE_CENTRALE"
  | "AFRICA_ASIA_OCEANIA_ANTARTIDE";

type SourcePartition = {
  id: PartitionId;
  listsUrl: string;
  candidatesUrl: string;
};

type SourceManifest = Record<ChamberId, { partitions: SourcePartition[] }>;

type OutputCandidate = {
  name: string;
  preferences: number | null;
  list_position: number;
};

type OutputList = {
  id: string;
  name: string;
  votes: number;
  candidates: OutputCandidate[];
};

const OUTPUT_PATH = "public/data/elections/2022/estero.json";
const HEADERS = {
  Origin: "https://elezioni.interno.gov.it",
  Referer: "https://elezioni.interno.gov.it/",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
};

const partitionMetadata: Record<PartitionId, { name: string; resident_citizens: number; seats: Record<ChamberId, number> }> = {
  EUROPA: {
    name: "Europa",
    resident_citizens: 3_189_905,
    seats: { camera: 3, senato: 1 }
  },
  AMERICA_MERIDIONALE: {
    name: "America Meridionale",
    resident_citizens: 1_804_291,
    seats: { camera: 2, senato: 1 }
  },
  AMERICA_SETTENTRIONALE_CENTRALE: {
    name: "America Settentrionale e Centrale",
    resident_citizens: 505_567,
    seats: { camera: 2, senato: 1 }
  },
  AFRICA_ASIA_OCEANIA_ANTARTIDE: {
    name: "Africa, Asia, Oceania e Antartide",
    resident_citizens: 306_305,
    seats: { camera: 1, senato: 1 }
  }
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = args["manifest"];
  if (!manifestPath) {
    throw new Error(
      "Missing --manifest. Provide a JSON manifest with camera/senato partition listsUrl and candidatesUrl values."
    );
  }
  const outPath = args["out"] ?? OUTPUT_PATH;
  const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8")) as SourceManifest;
  const output = {
    election: "politiche-2022",
    date: "2022-09-25",
    chambers: {
      camera: await fetchChamber("camera", manifest.camera),
      senato: await fetchChamber("senato", manifest.senato)
    }
  };

  validateOutput(output);
  await mkdir(dirname(resolve(outPath)), { recursive: true });
  await writeFile(resolve(outPath), `${JSON.stringify(output, null, 2)}\n`);
}

async function fetchChamber(chamberId: ChamberId, source: SourceManifest[ChamberId]) {
  const partitions = [];
  for (const sourcePartition of source.partitions) {
    const [listsPayload, candidatesPayload] = await Promise.all([
      fetchJson(sourcePartition.listsUrl),
      fetchJson(sourcePartition.candidatesUrl)
    ]);
    const lists = normalizeLists(listsPayload);
    const candidates = normalizeCandidates(candidatesPayload);
    for (const list of lists) {
      list.candidates = candidates.get(list.id) ?? [];
    }
    const metadata = partitionMetadata[sourcePartition.id];
    partitions.push({
      id: sourcePartition.id,
      name: metadata.name,
      seats: metadata.seats[chamberId],
      resident_citizens: metadata.resident_citizens,
      lists
    });
  }
  return {
    total_seats: chamberId === "camera" ? 8 : 4,
    partitions
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`Eligendo request failed ${response.status} ${response.statusText}: ${url}`);
  }
  return response.json();
}

function normalizeLists(payload: unknown): OutputList[] {
  return findRows(payload)
    .filter((row) => pickString(row, ["desc_lista", "descr_lista", "lista", "name", "denominazione"]))
    .map((row) => {
      const name = pickString(row, ["desc_lista", "descr_lista", "lista", "name", "denominazione"])!;
      return {
        id: normalizeId(pickString(row, ["cod_lista", "id_lista", "codi_lista", "id"]) ?? name),
        name,
        votes: pickNumber(row, ["voti", "voti_lista", "voti_validi", "votes"]) ?? 0,
        candidates: []
      };
    });
}

function normalizeCandidates(payload: unknown): Map<string, OutputCandidate[]> {
  const byList = new Map<string, OutputCandidate[]>();
  for (const row of findRows(payload)) {
    const listKey = pickString(row, ["cod_lista", "id_lista", "codi_lista", "lista_id", "lista"]);
    const lastName = pickString(row, ["cognome", "lastName", "lastname"]);
    const firstName = pickString(row, ["nome", "firstName", "firstname"]);
    const fullName = pickString(row, ["nominativo", "candidato", "name"]) ?? [firstName, lastName].filter(Boolean).join(" ");
    if (!listKey || !fullName) continue;
    const listId = normalizeId(listKey);
    const candidates = byList.get(listId) ?? [];
    candidates.push({
      name: fullName,
      preferences: pickNumber(row, ["preferenze", "voti_pref", "voti", "preferences"]) ?? null,
      list_position: pickNumber(row, ["posizione", "num_ordine", "ordine", "list_position"]) ?? candidates.length + 1
    });
    byList.set(listId, candidates);
  }
  for (const candidates of byList.values()) {
    candidates.sort((a, b) => a.list_position - b.list_position || a.name.localeCompare(b.name));
  }
  return byList;
}

function findRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of ["liste", "lista", "candidati", "candidate", "rows", "data", "risultati"]) {
    const child = value[key];
    if (Array.isArray(child)) return child.filter(isRecord);
  }
  for (const child of Object.values(value)) {
    const rows = findRows(child);
    if (rows.length > 0) return rows;
  }
  return [];
}

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === "string") {
      const parsed = Number.parseInt(value.replaceAll(".", ""), 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function normalizeId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function validateOutput(output: {
  chambers: Record<ChamberId, { total_seats: number; partitions: Array<{ seats: number; lists: OutputList[] }> }>;
}) {
  for (const chamberId of ["camera", "senato"] as const) {
    const chamber = output.chambers[chamberId];
    const seats = chamber.partitions.reduce((sum, partition) => sum + partition.seats, 0);
    if (seats !== chamber.total_seats) {
      throw new Error(`Invalid ${chamberId} foreign seat total: expected ${chamber.total_seats}, found ${seats}.`);
    }
    for (const partition of chamber.partitions) {
      for (const list of partition.lists) {
        if (!Number.isInteger(list.votes) || list.votes < 0) {
          throw new Error(`Invalid normalized votes for ${list.id}.`);
        }
      }
    }
  }
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
