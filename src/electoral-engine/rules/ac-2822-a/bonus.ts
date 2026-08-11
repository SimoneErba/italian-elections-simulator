import { compareFractions, percentage } from "../../arithmetic/fraction";
import type { BonusDecision } from "../../domain/election";
import { fraction } from "../../arithmetic/fraction";
import type { ChamberVoteTotals } from "../../pipeline/aggregate-votes";
import { getLawVersion } from "../registry";
import type { ThresholdResult } from "../../domain/election";

export function determineBonus(
  votes: { camera: ChamberVoteTotals; senate: ChamberVoteTotals },
  thresholds: { camera: ThresholdResult; senate: ThresholdResult }
): BonusDecision {
  const law = getLawVersion("ac-2822-a-2026-07-16");
  const cameraWinner = firstSubject(votes.camera.subjectVotes, thresholds.camera);
  const senateWinner = firstSubject(votes.senate.subjectVotes, thresholds.senate);
  const cameraPercentage = cameraWinner
    ? percentage(votes.camera.subjectVotes[cameraWinner], votes.camera.totalValidVotes)
    : fraction(0n);
  const senatePercentage = senateWinner
    ? percentage(votes.senate.subjectVotes[senateWinner], votes.senate.totalValidVotes)
    : fraction(0n);

  const failedConditions: string[] = [];
  if (!cameraWinner || !senateWinner) failedConditions.push("Mancano voti validi in almeno una Camera.");
  if (cameraWinner && senateWinner && cameraWinner !== senateWinner) {
    failedConditions.push("Il primo soggetto non coincide tra Camera e Senato.");
  }
  if (compareFractions(cameraPercentage, law.chamberRules.camera.minimumBonusPercentage) < 0) {
    failedConditions.push("Il primo soggetto non raggiunge il 42% alla Camera.");
  }
  if (compareFractions(senatePercentage, law.chamberRules.senate.minimumBonusPercentage) < 0) {
    failedConditions.push("Il primo soggetto non raggiunge il 42% al Senato.");
  }

  return {
    awarded: failedConditions.length === 0,
    winnerId: failedConditions.length === 0 ? cameraWinner : undefined,
    cameraPercentage,
    senatePercentage,
    failedConditions
  };
}

function firstSubject(votes: Record<string, bigint>, thresholds: ThresholdResult): string | undefined {
  const admitted = new Set([...thresholds.admittedCoalitions, ...thresholds.admittedSingleLists]);
  return Object.entries(votes).filter(([id]) => admitted.has(id)).sort((a, b) => {
    if (a[1] !== b[1]) return a[1] > b[1] ? -1 : 1;
    return a[0].localeCompare(b[0]);
  })[0]?.[0];
}
