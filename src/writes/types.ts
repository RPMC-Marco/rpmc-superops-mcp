import type { ToolClassification, ToolOutcome } from "../audit.js";
import type { AuthorizationProfileId } from "./profiles.js";

export interface WriteMcpContext {
  inputResponses?: unknown;
  requestState?: string;
}

export interface WriteTarget {
  type: string;
  id: string;
  label?: string;
}

export interface ActionScope {
  target: WriteTarget;
  ticketId?: string;
  ticketDisplayId?: string;
  assetId?: string;
  clientAccountId?: string;
  alertIds?: string[];
  siteId?: string;
}

export type AuthorizationResult =
  | "not_required"
  | "accepted"
  | "declined"
  | "missing_capability"
  | "preauthorized_by_scoped_grant"
  | "scope_violation"
  | "grant_invalid"
  | "grant_expired"
  | "grant_revoked"
  | "grant_terminated"
  | "grant_not_active";

export type AuthorizationSource = "rules_a_default" | "scoped_grant" | "per_action_elicitation";
export type ScopeCheckResult = "not_applicable" | "in_scope" | "out_of_scope" | "excluded";

export interface AuthorizationRecord {
  required: boolean;
  result: AuthorizationResult;
  profile: AuthorizationProfileId;
  source: AuthorizationSource;
  grantPresent: boolean;
  scopeCheck: ScopeCheckResult;
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
  registeredClassification: ToolClassification;
  authorization: AuthorizationRecord;
  target: WriteTarget;
  preWrite?: Record<string, unknown>;
  result: Record<string, unknown>;
  verification: WriteVerification;
  idempotentReplay?: boolean;
  logicalOperations: string[];
  classificationSource?: string;
}

export interface WriteFailure {
  outcome: "failed";
  code: string;
  message: string;
  toolName: string;
  classification?: ToolClassification;
  registeredClassification?: ToolClassification;
  authorization?: AuthorizationRecord;
  target?: WriteTarget;
  logicalOperations: string[];
  upstreamFailureCategory?: string;
}

export type WriteExecutionResult = WriteSuccess | WriteFailure;

export function isWriteFailure(value: WriteExecutionResult): value is WriteFailure {
  return value.outcome === "failed" && "code" in value && !("mutation" in value);
}

export function defaultActionScope(target: WriteTarget): ActionScope {
  return {
    target,
    ticketId: target.type === "ticket" ? target.id : undefined,
    ticketDisplayId: target.type === "ticket" ? target.label : undefined,
    assetId: target.type === "asset" ? target.id : undefined,
    clientAccountId: target.type === "client" ? target.id : undefined,
    alertIds: target.type === "alert" ? [target.id] : undefined,
  };
}
