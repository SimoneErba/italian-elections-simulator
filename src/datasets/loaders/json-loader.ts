import type { ElectionInput } from "../../electoral-engine/domain/election";
import { electionInputSchema } from "../schemas/election-input-schema";

export function loadScenarioJson(text: string): ElectionInput {
  const parsed = JSON.parse(text);
  return electionInputSchema.parse(parsed) as ElectionInput;
}

export function stringifyScenario(input: ElectionInput): string {
  return JSON.stringify(
    input,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  );
}
