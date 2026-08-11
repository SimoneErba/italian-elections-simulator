export function parseDelimited(text: string): Record<string, string>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = count(firstLine, ";") > count(firstLine, ",") ? ";" : ",";
  const rows = trimmed.split(/\r?\n/).map((line) => parseDelimitedLine(line, delimiter));
  const headers = rows[0]?.map((header) => header.trim()) ?? [];
  return rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? "").trim()]))
  );
}

export function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeListName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^\+\s+/, "+")
    .trim();
}

export function normalizeInteger(value: string): string {
  return value.replace(/\./g, "").replace(/\s/g, "") || "0";
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function count(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}
