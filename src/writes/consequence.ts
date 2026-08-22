import type { ToolClassification } from "../audit.js";

export const CONSEQUENCE_RANK: Record<ToolClassification, number> = {
  read: 0,
  write_low: 1,
  write_visible: 2,
  disruptive: 3,
  destructive: 4,
};

export function consequenceRank(classification: ToolClassification): number {
  return CONSEQUENCE_RANK[classification];
}

export function classificationAtMost(actual: ToolClassification, ceiling: ToolClassification): boolean {
  return CONSEQUENCE_RANK[actual] <= CONSEQUENCE_RANK[ceiling];
}

export function higherClassification(left: ToolClassification, right: ToolClassification): ToolClassification {
  return CONSEQUENCE_RANK[left] >= CONSEQUENCE_RANK[right] ? left : right;
}

export function isElevatedConsequence(classification: ToolClassification): classification is "disruptive" | "destructive" {
  return classification === "disruptive" || classification === "destructive";
}
