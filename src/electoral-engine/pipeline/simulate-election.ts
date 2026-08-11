import { aggregateVotes } from "./aggregate-votes";
import { allocateSpecialTerritories } from "./allocate-special-territories";
import { allocateNationalSeats } from "./allocate-national-seats";
import { allocateTerritorialSeats } from "./allocate-territorial-seats";
import { applyGovernabilityBonus } from "./apply-bonus";
import { calculateThresholds } from "./calculate-thresholds";
import { electCandidates } from "./elect-candidates";
import { validateInput } from "./validate-input";
import type { Chamber } from "../domain/chamber";
import type { ElectionInput, ElectionSimulationResult } from "../domain/election";
import { calculateForeignSeats } from "../../lib/elections/estero";
import {
  calculateCameraBonusSeats,
  calculateSenateBonusSeats,
  getElectoralPopulationDatasetEffectiveOn
} from "../population/bonus-seat-allocation";
import { determineBonus } from "../rules/ac-2822-a/bonus";
import { getLawVersion } from "../rules/registry";

export function simulateElection(input: ElectionInput): ElectionSimulationResult {
  const validation = validateInput(input);
  const trace = [...validation.trace];
  if (!validation.ok) {
    return {
      lawVersion: input.lawVersion,
      bonus: { awarded: false, failedConditions: ["Validazione input non superata."] },
      thresholds: { camera: undefined, senate: undefined },
      nationalResults: { camera: undefined, senate: undefined },
      foreignResults: { camera: undefined, senato: undefined },
      bonusSeatAllocations: { camera: undefined, senate: undefined },
      territorialResults: [],
      electedCandidates: [],
      seatTrace: [],
      trace,
      ties: []
    };
  }

  const law = getLawVersion(input.lawVersion);
  const votes = aggregateVotes(input);
  const bonusVotes = aggregateVotes(input, true);
  const thresholds = {
    camera: calculateThresholds("camera", input, votes.camera),
    senate: calculateThresholds("senate", input, votes.senate)
  };
  trace.push({
    id: "aggregation-complete",
    stage: "aggregazione",
    ruleReference: "legal-spec/ac-2822-a.md#known-rules-represented",
    level: "info",
    message: "Cifre elettorali aggregate per Camera e Senato.",
    data: {
      cameraTotal: votes.camera.totalValidVotes.toString(),
      senateTotal: votes.senate.totalValidVotes.toString()
    }
  });
  trace.push({
    id: "thresholds-complete",
    stage: "soglie",
    ruleReference: "AC 2822-A articolo 83, comma 1, lettera e); articolo 16-bis, comma 1, lettera e)",
    level: "info",
    message: "Soglie di accesso applicate per coalizioni, liste singole e liste coalizzate.",
    data: thresholds
  });

  const bonus = determineBonus(bonusVotes, thresholds);
  trace.push({
    id: "bonus-decision",
    stage: "verifica premio",
    ruleReference: "legal-spec/ac-2822-a.md#premio",
    level: bonus.awarded ? "info" : "warning",
    message: bonus.awarded ? `Premio attribuito a ${bonus.winnerId}.` : "Premio non attribuito.",
    data: bonus
  });

  const nationalResults: ElectionSimulationResult["nationalResults"] = { camera: undefined, senate: undefined };
  const foreignResults: ElectionSimulationResult["foreignResults"] = { camera: undefined, senato: undefined };
  const bonusSeatAllocations: ElectionSimulationResult["bonusSeatAllocations"] = { camera: undefined, senate: undefined };
  const territorialResults: ElectionSimulationResult["territorialResults"] = [];
  const seatTrace: ElectionSimulationResult["seatTrace"] = [];
  const allTies: ElectionSimulationResult["ties"] = [];
  const special = allocateSpecialTerritories(input);
  territorialResults.push(...special.territorialResults);
  seatTrace.push(...special.seatTrace);
  allTies.push(...special.ties);

  for (const chamber of ["camera", "senate"] satisfies Chamber[]) {
    const rules = law.chamberRules[chamber];
    const nationalSeatPool = rules.ordinarySeats;
    const proportionalSeatPool = bonus.awarded
      ? nationalSeatPool - rules.bonusSeats
      : nationalSeatPool;
    const allocation = allocateNationalSeats(chamber, input, votes[chamber], thresholds[chamber], proportionalSeatPool);
    const specialSeats = seatTotalsForChamber(special.territorialResults, chamber);
    const specialWinnerSeats = bonus.winnerId ? specialSeats[bonus.winnerId] ?? 0 : 0;
    const maximumWinnerOrdinarySeats = bonus.awarded
      ? Math.max(0, rules.cappedWinnerOrdinarySeats - specialWinnerSeats)
      : undefined;
    const bonusAdjusted = applyGovernabilityBonus(chamber, allocation.result, bonus, specialWinnerSeats);
    const territorial = allocateTerritorialSeats(
      chamber,
      input,
      bonusAdjusted,
      bonus,
      maximumWinnerOrdinarySeats
    );
    const ordinarySeats = chamber === "senate" ? territorial.nationalSeatTargets : bonusAdjusted.ordinarySeats;
    const finalStandardSeats = { ...ordinarySeats };
    if (bonus.awarded && bonus.winnerId) {
      finalStandardSeats[bonus.winnerId] = (finalStandardSeats[bonus.winnerId] ?? 0) + rules.bonusSeats;
    }
    nationalResults[chamber] = {
      ...bonusAdjusted,
      ordinarySeats,
      seats: mergeSeatTotals(finalStandardSeats, specialSeats)
    };
    if (chamber === "camera") allTies.push(...allocation.ties);
    trace.push({
      id: `national-allocation-${chamber}`,
      stage: chamber === "camera" ? "ripartizione nazionale" : "riepilogo nazionale",
      ruleReference:
        chamber === "camera"
          ? "legal-spec/ac-2822-a.md#ordinary-national-allocation"
          : "AC 2822-A articolo 16-bis; articolo 17",
      level: chamber === "camera" && allocation.ties.length > 0 ? "warning" : "info",
      message:
        chamber === "camera"
          ? `Ripartiti ${nationalSeatPool} seggi camera nel ramo nazionale ordinario.`
          : `Riepilogati a livello nazionale ${nationalSeatPool} seggi senato ripartiti prima per regione.`,
      data:
        chamber === "camera"
          ? nationalResults[chamber]!.allocation
          : {
              ordinarySeats: nationalResults[chamber]!.ordinarySeats,
              seats: nationalResults[chamber]!.seats
            }
    });
    territorialResults.push(...territorial.results);
    allTies.push(...territorial.ties);
    trace.push({
      id: `territorial-allocation-${chamber}`,
      stage: chamber === "camera" ? "ripartizione circoscrizioni/collegi" : "ripartizione regioni/collegi",
      ruleReference: chamber === "camera" ? "AC 2822-A articolo 83, lettera h); articolo 83-bis" : "AC 2822-A articolo 16-bis; articolo 17",
      level: territorial.ties.length > 0 ? "warning" : "info",
      message: `Ripartizione territoriale ${chamber} completata sui territori forniti.`,
      data: territorial.results
    });
  }
  if (bonus.awarded && bonus.winnerId) {
    const dataset = getElectoralPopulationDatasetEffectiveOn(input.electionDate ?? law.sourceDate);
    bonusSeatAllocations.camera = calculateCameraBonusSeats(dataset);
    bonusSeatAllocations.senate = calculateSenateBonusSeats(dataset);
    for (const chamber of ["camera", "senate"] satisfies Chamber[]) {
      const result = bonusSeatAllocations[chamber]!;
      for (const tie of result.unresolvedTies) {
        allTies.push({
          subjects: tie.territoryIds,
          stage: `ripartizione territoriale premio ${chamber}`,
          affectedSeats: [`bonus-${chamber}-${tie.affectedSeatNumber}`],
          legalRule:
            chamber === "camera"
              ? "AC 2822-A articolo 3; ripartizione del premio tra circoscrizioni per popolazione"
              : "AC 2822-A articolo 57; ripartizione del premio tra regioni per popolazione"
        });
      }
      if (result.unresolvedTies.length === 0) {
        territorialResults.push(
          ...result.territories
            .filter((territory) => territory.seats > 0)
            .map((territory) => ({
              chamber,
              scope: chamber === "camera" ? ("bonus-constituency" as const) : ("bonus-region" as const),
              territoryId: territory.territoryId,
              seats: { [bonus.winnerId!]: territory.seats }
            }))
        );
      }
      trace.push({
        id: `bonus-territorial-allocation-${chamber}`,
        stage: `ripartizione territoriale premio ${chamber}`,
        ruleReference: "legal-spec/ac-2822-a.md#ripartizione-territoriale-del-premio",
        level: result.unresolvedTies.length > 0 ? "warning" : "info",
        message: `Ripartiti per popolazione i seggi premio ${chamber}.`,
        data: result
      });
    }
  }
  if (bonus.awarded && bonus.winnerId) {
    const hasBonusCandidates = (input.bonusCandidateLists ?? []).some(
      (candidate) => candidate.connectedSubjectId === bonus.winnerId
    );
    if (!hasBonusCandidates) {
      allTies.push({
        subjects: [bonus.winnerId],
        stage: "proclamazione candidati premio",
        affectedSeats: ["bonus-governabilita-camera", "bonus-governabilita-senato"],
        legalRule:
          "AC 2822-A articoli 18-bis, 19, 83-bis; premio attribuito ma liste prioritarie candidati premio non fornite"
      });
    }
  }
  const candidates = electCandidates(input, territorialResults, thresholds);
  seatTrace.push(...candidates.seatTrace);
  allTies.push(...candidates.ties);
  foreignResults.camera = calculateForeignSeats("camera", input.foreignElection.chambers.camera);
  foreignResults.senato = calculateForeignSeats("senato", input.foreignElection.chambers.senato);
  allTies.push(...foreignResults.camera.ties, ...foreignResults.senato.ties);
  trace.push({
    id: "foreign-allocation",
    stage: "ripartizione estero",
    ruleReference: "Legge 459/2001 articolo 15",
    level: foreignResults.camera.ties.length + foreignResults.senato.ties.length > 0 ? "warning" : "info",
    message: "Ripartizione Estero completata per Camera e Senato sulle ripartizioni fornite.",
    data: foreignResults
  });

  return {
    lawVersion: input.lawVersion,
    bonus,
    bonusSeatAllocations,
    thresholds,
    nationalResults,
    foreignResults,
    territorialResults,
    electedCandidates: candidates.elected,
    seatTrace,
    trace,
    ties: allTies
  };
}

function seatTotalsForChamber(
  results: ElectionSimulationResult["territorialResults"],
  chamber: Chamber
): Record<string, number> {
  return results
    .filter((result) => result.chamber === chamber)
    .reduce<Record<string, number>>((totals, result) => {
      for (const [subject, seats] of Object.entries(result.seats)) {
        totals[subject] = (totals[subject] ?? 0) + seats;
      }
      return totals;
    }, {});
}

function mergeSeatTotals(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const result = { ...a };
  for (const [subject, seats] of Object.entries(b)) result[subject] = (result[subject] ?? 0) + seats;
  return result;
}
