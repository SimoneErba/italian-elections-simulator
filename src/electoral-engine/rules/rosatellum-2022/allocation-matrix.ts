import type { AllocationLedger } from "../../domain/election";

export type MatrixAllocation = {
  seats: Record<string, Record<string, number>>;
  ledger: AllocationLedger;
};

type Cell = AllocationLedger["cells"][number] & { remainderUsed: boolean };

export function allocateTerritorialMatrix(
  stage: string,
  capacities: Record<string, number>,
  votes: Record<string, Record<string, bigint>>,
  targets: Record<string, number>,
  tieVotes: Record<string, bigint>,
  compensationMode: "same-territory-first" | "district" = "same-territory-first",
  quotientTotals?: Record<string, bigint>
): MatrixAllocation {
  const subjects = Object.keys(targets).filter((subject) => targets[subject] > 0);
  const seats: Record<string, Record<string, number>> = {};
  const cells: Cell[] = [];

  for (const territoryId of Object.keys(capacities).sort()) {
    const capacity = capacities[territoryId] ?? 0;
    if (capacity <= 0) {
      seats[territoryId] = {};
      continue;
    }
    const territorySubjects = subjects.filter((subject) => Object.prototype.hasOwnProperty.call(votes[territoryId] ?? {}, subject));
    const territoryVotes = Object.fromEntries(territorySubjects.map((subject) => [subject, votes[territoryId]?.[subject] ?? 0n]));
    const totalVotes = quotientTotals?.[territoryId] ?? Object.values(territoryVotes).reduce((sum, value) => sum + value, 0n);
    const quotient = capacity > 0 && totalVotes > 0n ? totalVotes / BigInt(capacity) : 0n;
    const safeQuotient = quotient > 0n ? quotient : 1n;
    const territorySeats: Record<string, number> = {};
    let assigned = 0;
    for (const subjectId of territorySubjects) {
      const subjectVotes = territoryVotes[subjectId] ?? 0n;
      const integerSeats = Number(subjectVotes / safeQuotient);
      const remainder = subjectVotes - BigInt(integerSeats) * safeQuotient;
      territorySeats[subjectId] = integerSeats;
      assigned += integerSeats;
      cells.push({
        territoryId,
        subjectId,
        votes: subjectVotes,
        quotient: safeQuotient,
        integerSeats,
        remainder,
        remainderInitiallyUsed: false,
        remainderUsed: false
      });
    }
    seats[territoryId] = territorySeats;
  }

  const transfers: AllocationLedger["transfers"] = [];
  const integerTotals = totalsBySubject(seats);
  const staticallyExcluded = new Set(subjects.filter((subject) => (integerTotals[subject] ?? 0) >= targets[subject]));
  for (const territoryId of Object.keys(capacities).sort()) {
    const capacity = capacities[territoryId] ?? 0;
    let remaining = capacity - Object.values(seats[territoryId] ?? {}).reduce((sum, value) => sum + value, 0);
    const ranking = cells
      .filter((cell) => cell.territoryId === territoryId && !staticallyExcluded.has(cell.subjectId))
      .sort((a, b) => compareBigInt(b.remainder, a.remainder) || compareBigInt(b.votes, a.votes) || a.subjectId.localeCompare(b.subjectId));
    for (const cell of ranking) {
      if (remaining <= 0) break;
      seats[territoryId][cell.subjectId] = (seats[territoryId][cell.subjectId] ?? 0) + 1;
      cell.remainderInitiallyUsed = true;
      cell.remainderUsed = true;
      remaining -= 1;
    }
  }

  while (true) {
    const totals = totalsBySubject(seats);
    let surplus = subjects
      .filter((subject) => (totals[subject] ?? 0) > targets[subject])
      .sort((a, b) => ((totals[b] ?? 0) - targets[b]) - ((totals[a] ?? 0) - targets[a]) || compareBigInt(tieVotes[b] ?? 0n, tieVotes[a] ?? 0n) || a.localeCompare(b));
    let deficit = subjects
      .filter((subject) => (totals[subject] ?? 0) < targets[subject])
      .sort((a, b) => (targets[b] - (totals[b] ?? 0)) - (targets[a] - (totals[a] ?? 0)) || compareBigInt(tieVotes[b] ?? 0n, tieVotes[a] ?? 0n) || a.localeCompare(b));
    if (surplus.length === 0 || deficit.length === 0) break;

    if (compensationMode === "district") {
      surplus = surplus.sort((a, b) => {
        const excessOrder = ((totals[b] ?? 0) - targets[b]) - ((totals[a] ?? 0) - targets[a]);
        if (excessOrder) return excessOrder;
        const aCell = districtDonor(cells, seats, a);
        const bCell = districtDonor(cells, seats, b);
        return aCell && bCell ? compareCellFraction(aCell, bCell) || a.localeCompare(b) : a.localeCompare(b);
      });
      deficit = deficit.sort((a, b) => {
        const deficitOrder = (targets[b] - (totals[b] ?? 0)) - (targets[a] - (totals[a] ?? 0));
        if (deficitOrder) return deficitOrder;
        const aCell = districtRecipient(cells, a);
        const bCell = districtRecipient(cells, b);
        return aCell && bCell ? compareCellFraction(bCell, aCell) || a.localeCompare(b) : a.localeCompare(b);
      });
    }

    const sameTerritory = compensationMode === "same-territory-first"
      ? bestSameTerritoryTransfer(cells, seats, surplus, deficit, tieVotes)
      : undefined;
    const transfer = sameTerritory ?? (compensationMode === "district"
      ? bestDistrictTransfer(cells, seats, surplus, deficit)
      : bestCrossTerritoryTransfer(cells, seats, surplus, deficit, tieVotes));
    if (!transfer) break;
    seats[transfer.donor.territoryId][transfer.donor.subjectId] -= 1;
    seats[transfer.recipient.territoryId][transfer.recipient.subjectId] =
      (seats[transfer.recipient.territoryId][transfer.recipient.subjectId] ?? 0) + 1;
    transfer.donor.remainderUsed = false;
    transfer.recipient.remainderUsed = true;
    transfers.push({
      fromTerritoryId: transfer.donor.territoryId,
      fromSubjectId: transfer.donor.subjectId,
      toTerritoryId: transfer.recipient.territoryId,
      toSubjectId: transfer.recipient.subjectId,
      reason: sameTerritory ? "compensazione nello stesso territorio" : "compensazione tra territori"
    });
  }

  return {
    seats,
    ledger: {
      stage,
      cells,
      transfers
    }
  };
}

function bestDistrictTransfer(
  cells: Cell[],
  seats: Record<string, Record<string, number>>,
  surplus: string[],
  deficit: string[]
): { donor: Cell; recipient: Cell } | undefined {
  const donor = districtDonor(cells, seats, surplus[0]);
  const recipient = districtRecipient(cells, deficit[0]);
  return donor && recipient ? { donor, recipient } : undefined;
}

// Faithful to the separate-choice rule in art. 83-bis: a surplus list first
// gives up its *original* remainder seat with the smallest fraction; only if
// it has none does it give up an integer seat.  A deficit list first receives
// in its largest unused remainder, falling back to an already used remainder.
// The two colleges are intentionally independent.
function districtDonor(cells: Cell[], seats: Record<string, Record<string, number>>, subjectId: string): Cell | undefined {
  const available = cells.filter((cell) => cell.subjectId === subjectId && (seats[cell.territoryId]?.[subjectId] ?? 0) > 0);
  const remainderSeat = available.filter((cell) => cell.remainderInitiallyUsed && cell.remainderUsed);
  return [...(remainderSeat.length > 0 ? remainderSeat : available)]
    .sort((a, b) => compareCellFraction(a, b) || a.territoryId.localeCompare(b.territoryId))[0];
}

function districtRecipient(cells: Cell[], subjectId: string): Cell | undefined {
  const available = cells.filter((cell) => cell.subjectId === subjectId);
  const unused = available.filter((cell) => !cell.remainderUsed);
  return [...(unused.length > 0 ? unused : available)]
    .sort((a, b) => compareCellFraction(b, a) || a.territoryId.localeCompare(b.territoryId))[0];
}

function recipientCells(cells: Cell[], subjectId: string): Cell[] {
  return cells
    .filter((cell) => cell.subjectId === subjectId && !cell.remainderUsed)
    .sort((a, b) => compareCellFraction(b, a) || a.territoryId.localeCompare(b.territoryId));
}

function bestSameTerritoryTransfer(
  cells: Cell[],
  seats: Record<string, Record<string, number>>,
  surplus: string[],
  deficit: string[],
  tieVotes: Record<string, bigint>
): { donor: Cell; recipient: Cell } | undefined {
  for (const surplusSubject of surplus) {
    const donors = donorCells(cells, seats, surplusSubject);
    for (const donor of donors) {
      const recipient = cells
        .filter((cell) => cell.territoryId === donor.territoryId && deficit.includes(cell.subjectId) && !cell.remainderUsed)
        .sort((a, b) => compareBigInt(b.remainder, a.remainder) || compareBigInt(tieVotes[b.subjectId] ?? 0n, tieVotes[a.subjectId] ?? 0n) || a.subjectId.localeCompare(b.subjectId))[0];
      if (recipient) return { donor, recipient };
    }
  }
  return undefined;
}

function bestCrossTerritoryTransfer(
  cells: Cell[],
  seats: Record<string, Record<string, number>>,
  surplus: string[],
  deficit: string[],
  tieVotes: Record<string, bigint>
): { donor: Cell; recipient: Cell } | undefined {
  const donor = surplus.flatMap((subject) => donorCells(cells, seats, subject))[0];
  if (!donor) return undefined;
  const recipient = cells
    .filter((cell) => deficit.includes(cell.subjectId) && !cell.remainderUsed)
    .sort((a, b) => compareBigInt(b.remainder, a.remainder) || compareBigInt(tieVotes[b.subjectId] ?? 0n, tieVotes[a.subjectId] ?? 0n) || a.territoryId.localeCompare(b.territoryId))[0];
  return recipient ? { donor, recipient } : undefined;
}

function donorCells(cells: Cell[], seats: Record<string, Record<string, number>>, subjectId: string): Cell[] {
  return cells
    .filter((cell) => cell.subjectId === subjectId && (seats[cell.territoryId]?.[subjectId] ?? 0) > 0)
    .sort((a, b) => Number(b.remainderUsed) - Number(a.remainderUsed) || compareCellFraction(a, b) || a.territoryId.localeCompare(b.territoryId));
}

function totalsBySubject(seats: Record<string, Record<string, number>>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const territory of Object.values(seats)) {
    for (const [subject, value] of Object.entries(territory)) totals[subject] = (totals[subject] ?? 0) + value;
  }
  return totals;
}

function compareBigInt(a: bigint, b: bigint): number {
  return a === b ? 0 : a > b ? 1 : -1;
}

function compareCellFraction(a: Cell, b: Cell): number {
  return compareBigInt(a.remainder * b.quotient, b.remainder * a.quotient);
}
