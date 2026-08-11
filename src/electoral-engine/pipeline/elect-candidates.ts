import type { Chamber } from "../domain/chamber";
import type { ElectedCandidate, ElectionInput, TerritorialSeatResult, ThresholdResult } from "../domain/election";
import type { SeatAssignmentTrace, TieResolutionRequired } from "../domain/trace";
import { allocateByHare } from "./proportional-allocation";

export type CandidateElectionResult = {
  elected: ElectedCandidate[];
  seatTrace: SeatAssignmentTrace[];
  ties: TieResolutionRequired[];
};

export function electCandidates(
  input: ElectionInput,
  territorialResults: TerritorialSeatResult[],
  thresholds?: Record<Chamber, ThresholdResult>
): CandidateElectionResult {
  const nominations = [...(input.nominations ?? [])].sort((a, b) => a.position - b.position || a.candidateId.localeCompare(b.candidateId));
  const bonusPriorities = [...(input.bonusCandidateLists ?? [])].sort((a, b) => a.position - b.position || a.candidateId.localeCompare(b.candidateId));
  const electedByCandidate = new Map<string, ElectedCandidate>();
  const elected: ElectedCandidate[] = [];
  const seatTrace: SeatAssignmentTrace[] = [];
  const ties: TieResolutionRequired[] = [];
  const orderedResults = [
    ...territorialResults.filter(isBonusResult),
    ...territorialResults.filter((result) => !isBonusResult(result))
  ];

  for (const result of orderedResults) {
    if (result.scope === "constituency" || result.scope === "region") continue;
    if (result.scope === "single-member") {
      const winner = [...(input.candidateVotes ?? [])]
        .filter((vote) => vote.chamber === result.chamber && vote.districtId === result.territoryId)
        .sort((a, b) => (a.votes === b.votes ? a.candidateId.localeCompare(b.candidateId) : a.votes > b.votes ? -1 : 1))[0];
      if (winner && !electedByCandidate.has(winner.candidateId)) {
        const record: ElectedCandidate = {
          candidateId: winner.candidateId,
          seatId: `${result.territoryId}-1`,
          electedIn: result.territoryId,
          nominationType: "single-member",
          listPosition: 1
        };
        electedByCandidate.set(winner.candidateId, record);
        elected.push(record);
      }
      continue;
    }
    if (isBonusResult(result)) {
      for (const [subjectId, seats] of Object.entries(result.seats)) {
        const eligible = bonusPriorities.filter((candidate) => candidate.chamber === result.chamber && candidate.connectedSubjectId === subjectId);
        let assigned = 0;
        for (const candidate of eligible) {
          if (assigned >= seats) break;
          if (electedByCandidate.has(candidate.candidateId)) continue;
          assigned += 1;
          const seatId = `${result.territoryId}-${subjectId}-bonus-${candidate.position}`;
          const record: ElectedCandidate = {
            candidateId: candidate.candidateId,
            seatId,
            electedIn: result.territoryId,
            nominationType: "bonus-priority-list",
            listPosition: candidate.position
          };
          electedByCandidate.set(candidate.candidateId, record);
          elected.push(record);
          seatTrace.push({
            seatId,
            chamber: result.chamber,
            partyId: subjectId,
            constituencyId: result.territoryId,
            candidateId: candidate.candidateId,
            allocationStage: "proclamazione candidati premio",
            ruleReference: "AC 2822-A articoli 18-bis, 19, 83-bis"
          });
        }
        if (assigned < seats) {
          ties.push({
            subjects: [subjectId],
            stage: "proclamazione candidati premio",
            affectedSeats: [`${result.territoryId}-${subjectId}`],
            legalRule: "AC 2822-A articoli 18-bis, 19, 83-bis; candidati premio insufficienti/subentri da risolvere"
          });
        }
      }
      continue;
    }
    const expanded = expandCoalitionSeats(input, result, thresholds?.[result.chamber]);
    ties.push(...expanded.ties);
    for (const [listId, seats] of Object.entries(expanded.seats)) {
      const localEligible = nominations.filter(
        (nomination) =>
          nomination.listId === listId &&
          nomination.chamber === result.chamber &&
          nomination.nominationType !== "single-member" &&
          (nomination.districtId === result.territoryId || nomination.constituencyId === result.territoryId)
      );
      let assigned = 0;
      for (const nomination of localEligible) {
        if (assigned >= seats) break;
        const existing = electedByCandidate.get(nomination.candidateId);
        if (existing) {
          existing.resolvedMultipleNomination = true;
          existing.resolutionReason =
            existing.nominationType === "bonus-priority-list"
              ? "pluricandidatura: prevale la proclamazione nella lista circoscrizionale premio"
              : "pluricandidatura: mantenuta la prima proclamazione deterministica disponibile";
          continue;
        }
        assigned += 1;
        const seatId = `${result.territoryId}-${listId}-${nomination.position}`;
        const record: ElectedCandidate = {
          candidateId: nomination.candidateId,
          seatId,
          electedIn: result.territoryId,
          nominationType: nomination.nominationType,
          listPosition: nomination.position,
          resolutionReason: undefined
        };
        electedByCandidate.set(nomination.candidateId, record);
        elected.push(record);
        seatTrace.push({
          seatId,
          chamber: result.chamber,
          partyId: listId,
          constituencyId: nomination.constituencyId ?? result.territoryId,
          districtId: nomination.districtId,
          candidateId: nomination.candidateId,
          allocationStage: "proclamazione candidati",
          ruleReference: "AC 2822-A articoli 84, 85, 86"
        });
      }
      if (assigned < seats) {
        ties.push({
          subjects: [listId],
          stage: `proclamazione candidati ${result.territoryId}`,
          affectedSeats: [`${result.territoryId}-${listId}`],
          legalRule: "AC 2822-A articoli 84, 85, 86; candidati insufficienti/subentri da risolvere"
        });
      }
    }
  }

  return { elected, seatTrace, ties };
}

function isBonusResult(result: TerritorialSeatResult): boolean {
  return result.scope === "bonus-constituency" || result.scope === "bonus-region";
}

function expandCoalitionSeats(
  input: ElectionInput,
  result: TerritorialSeatResult,
  thresholds?: ThresholdResult
): { seats: Record<string, number>; ties: TieResolutionRequired[] } {
  const output: Record<string, number> = {};
  const ties: TieResolutionRequired[] = [];
  for (const [subjectId, seats] of Object.entries(result.seats)) {
    if (seats <= 0) continue;
    const coalition = input.coalitions.find((item) => item.id === subjectId);
    if (!coalition) {
      output[subjectId] = (output[subjectId] ?? 0) + seats;
      continue;
    }
    const admittedLists = thresholds?.admittedCoalitionLists[coalition.id] ?? coalition.listIds;
    const votes = Object.fromEntries(
      admittedLists.map((listId) => [
        listId,
        input.listVotes
          .filter((vote) => vote.chamber === result.chamber && vote.listId === listId && vote.districtId === result.territoryId)
          .reduce((sum, vote) => sum + vote.votes, 0n)
      ])
    );
    const allocation = allocateByHare(votes, seats, `riparto interno coalizione ${subjectId} ${result.territoryId}`, "AC 2822-A articolo 83, lettera g)/i); articolo 17");
    ties.push(...allocation.ties);
    for (const [listId, listSeats] of Object.entries(allocation.seats)) {
      output[listId] = (output[listId] ?? 0) + listSeats;
    }
  }
  return { seats: output, ties };
}
