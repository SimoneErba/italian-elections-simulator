import type { ForeignPartitionId, ForeignPartitionSeatAllocation } from "./types";

export type ForeignResidentPartition = {
  id: ForeignPartitionId;
  resident_citizens: number;
};

export function allocateForeignPartitionSeats(
  partitions: ForeignResidentPartition[],
  totalSeats: number
): ForeignPartitionSeatAllocation[] {
  if (!Number.isInteger(totalSeats) || totalSeats <= 0) {
    throw new Error("Foreign partition seats must be a positive integer.");
  }
  if (partitions.length === 0) {
    throw new Error("At least one foreign partition is required.");
  }
  if (totalSeats < partitions.length) {
    throw new Error("Foreign partition allocation requires at least one seat per partition.");
  }
  for (const partition of partitions) {
    if (!Number.isInteger(partition.resident_citizens) || partition.resident_citizens < 0) {
      throw new Error(`Invalid resident citizen count for ${partition.id}.`);
    }
  }

  const remainingSeats = totalSeats - partitions.length;
  const initial = partitions.map((partition) => ({
    partitionId: partition.id,
    resident_citizens: partition.resident_citizens,
    baseSeats: 1,
    extraIntegerSeats: 0,
    extraRemainder: 0,
    seats: 1
  }));

  if (remainingSeats === 0) return initial;

  const totalResidents = partitions.reduce((sum, partition) => sum + partition.resident_citizens, 0);
  if (totalResidents <= 0) {
    throw new Error("Foreign partition allocation requires positive resident citizen totals.");
  }
  const quota = Math.floor(totalResidents / remainingSeats);
  if (quota <= 0) {
    throw new Error("Foreign partition resident quota must be positive.");
  }

  let assignedExtras = 0;
  for (const result of initial) {
    result.extraIntegerSeats = Math.floor(result.resident_citizens / quota);
    result.extraRemainder = result.resident_citizens - result.extraIntegerSeats * quota;
    result.seats += result.extraIntegerSeats;
    assignedExtras += result.extraIntegerSeats;
  }

  let extrasToAssign = remainingSeats - assignedExtras;
  if (extrasToAssign < 0) {
    throw new Error("Foreign partition integer quota over-allocated seats.");
  }

  const byRemainder = [...initial].sort(
    (a, b) =>
      b.extraRemainder - a.extraRemainder ||
      b.resident_citizens - a.resident_citizens ||
      a.partitionId.localeCompare(b.partitionId)
  );
  for (const result of byRemainder) {
    if (extrasToAssign <= 0) break;
    result.seats += 1;
    extrasToAssign -= 1;
  }

  return initial;
}
