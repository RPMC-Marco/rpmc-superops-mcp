import type { ToolClassification, ToolOutcome } from "../audit.js";

export interface WriteMcpContext {
  inputResponses?: unknown;
  requestState?: string;
}

export interface WriteTarget {
  type: string;
  id: string;
  label?: string;
}

export interface PreWriteState {
  captured: boolean;
  summary: Record<string, unknown>;
}

export interface WriteVerification {
  result: ToolOutcome;
  compared: Record<string, unknown>;
  notes?: string;
}

export interface WriteSuccess {
  outcome: ToolOutcome;
  mutation: string;
  toolName: string;
  classification: ToolClassification;
  authorization: {
    required: boolean;
    result: "not_required" | "accepted" | "declined" | "missing_capability";
  };
  target: WriteTarget;
  preWrite?: Record<string, unknown>;
  result: Record<string, unknown>;
  verification: WriteVerification;
  idempotentReplay?: boolean;
  logicalOperations: string[];
}

export interface WriteFailure {
  outcome: "failed";
  code: string;
  message: string;
  toolName: string;
  classification?: ToolClassification;
  target?: WriteTarget;
  logicalOperations: string[];
  upstreamFailureCategory?: string;
}

export type WriteExecutionResult = WriteSuccess | WriteFailure;

export function isWriteFailure(value: WriteExecutionResult): value is WriteFailure {
  return value.outcome === "failed" && "code" in value && !("mutation" in value);
}
