import type { ElectionInput, TerritorialSeatResult } from "../domain/election";
import type { SeatAssignmentTrace, TieResolutionRequired } from "../domain/trace";
import { compareFractions, fraction, percentage } from "../arithmetic/fraction";
import { allocateByHare } from "./proportional-allocation";
import { specialTerritoryForMultiMemberDistrict } from "./special-territories";

export type SpecialTerritoryResult = {
  territorialResults: TerritorialSeatResult[];
  seatTrace: SeatAssignmentTrace[];
  ties: TieResolutionRequired[];
};

export function allocateSpecialTerritories(input: ElectionInput): SpecialTerritoryResult {
  const territorialResults: TerritorialSeatResult[] = [];
  const seatTrace: SeatAssignmentTrace[] = [];
  const ties: TieResolutionRequired[] = [];

  for (const district of input.singleMemberDistricts ?? []) {
    const votes = (input.candidateVotes ?? []).filter((vote) => vote.chamber === district.chamber && vote.districtId === district.id);
    if (votes.length === 0) continue;
    const sorted = [...votes].sort((a, b) => {
      if (a.votes !== b.votes) return a.votes > b.votes ? -1 : 1;
      return a.candidateId.localeCompare(b.candidateId);
    });
    if (sorted[0] && sorted[1] && sorted[0].votes === sorted[1].votes) {
      ties.push({
        subjects: sorted.filter((vote) => vote.votes === sorted[0].votes).map((vote) => vote.candidateId),
        stage: `collegio uninominale speciale ${district.id}`,
        affectedSeats: [`${district.id}-single-member`],
        legalRule: "AC 2822-A articolo 2; titolo VI; sorteggio/parità da risolvere"
      });
      continue;
    }
    const winner = sorted[0];
    const nomination = (input.nominations ?? []).find(
      (item) =>
        item.candidateId === winner.candidateId &&
        item.chamber === district.chamber &&
        item.districtId === district.id &&
        item.nominationType === "single-member"
    );
    const partyId = nomination?.connectedSubjectId ?? nomination?.listId ?? winner.candidateId;
    territorialResults.push({
      chamber: district.chamber,
      scope: "single-member",
      territoryId: district.id,
      seats: { [partyId]: 1 }
    });
    seatTrace.push({
      seatId: `${district.id}-1`,
      chamber: district.chamber,
      partyId,
      constituencyId: district.constituencyId ?? district.regionId,
      districtId: district.id,
      candidateId: winner.candidateId,
      allocationStage: "collegio uninominale speciale",
      ruleReference: "AC 2822-A articolo 2; titolo VI"
    });
  }

  const localProportional = allocateTrentinoAltoAdigeCameraProportional(input);
  territorialResults.push(...localProportional.territorialResults);
  ties.push(...localProportional.ties);

  return { territorialResults, seatTrace, ties };
}

function allocateTrentinoAltoAdigeCameraProportional(input: ElectionInput): Omit<SpecialTerritoryResult, "seatTrace"> {
  const territorialResults: TerritorialSeatResult[] = [];
  const ties: TieResolutionRequired[] = [];
  const districts = input.multiMemberDistricts.filter(
    (district) =>
      district.chamber === "camera" &&
      specialTerritoryForMultiMemberDistrict(district) === "trentino-alto-adige" &&
      district.seatsWithoutBonus > 0
  );
  if (districts.length === 0) return { territorialResults, ties };

  const districtIds = new Set(districts.map((district) => district.id));
  const subjectVotes: Record<string, bigint> = {};
  for (const vote of input.listVotes) {
    if (vote.chamber !== "camera" || !districtIds.has(vote.districtId)) continue;
    const subject = subjectForList(input, vote.listId);
    subjectVotes[subject] = (subjectVotes[subject] ?? 0n) + vote.votes;
  }

  const totalVotes = Object.values(subjectVotes).reduce((sum, votes) => sum + votes, 0n);
  const admittedVotes = Object.fromEntries(
    Object.entries(subjectVotes).filter(([, votes]) => compareFractions(percentage(votes, totalVotes), fraction(20n)) >= 0)
  );
  const seatCount = districts.reduce((sum, district) => sum + district.seatsWithoutBonus, 0);
  if (seatCount <= 0 || Object.keys(admittedVotes).length === 0) return { territorialResults, ties };

  const allocation = allocateByHare(
    admittedVotes,
    seatCount,
    "ripartizione proporzionale locale Camera Trentino-Alto Adige",
    "AC 2822-A titolo VI; soglia circoscrizionale 20% Trentino-Alto Adige",
    "local"
  );
  ties.push(...allocation.ties);

  if (districts.length === 1) {
    territorialResults.push({
      chamber: "camera",
      scope: "special-local-proportional",
      territoryId: districts[0].id,
      seats: allocation.seats
    });
    return { territorialResults, ties };
  }

  for (const district of districts) {
    const districtVotes = Object.fromEntries(
      Object.keys(allocation.seats).map((subject) => [
        subject,
        input.listVotes
          .filter((vote) => vote.chamber === "camera" && vote.districtId === district.id && listBelongsToSubject(input, vote.listId, subject))
          .reduce((sum, vote) => sum + vote.votes, 0n)
      ])
    );
    const districtAllocation = allocateByHare(
      districtVotes,
      district.seatsWithoutBonus,
      `attribuzione proporzionale locale Camera Trentino-Alto Adige ${district.id}`,
      "AC 2822-A titolo VI; riparto locale Trentino-Alto Adige",
      "local"
    );
    territorialResults.push({
      chamber: "camera",
      scope: "special-local-proportional",
      territoryId: district.id,
      seats: districtAllocation.seats
    });
    ties.push(...districtAllocation.ties);
  }

  return { territorialResults, ties };
}

function subjectForList(input: ElectionInput, listId: string): string {
  const list = input.lists.find((item) => item.id === listId);
  return list?.coalitionId ?? listId;
}

function listBelongsToSubject(input: ElectionInput, listId: string, subjectId: string): boolean {
  if (listId === subjectId) return true;
  return input.lists.find((list) => list.id === listId)?.coalitionId === subjectId;
}
