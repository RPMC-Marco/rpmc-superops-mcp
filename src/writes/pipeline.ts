import { createHash } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { ToolClassification } from "../audit.js";
import type { SuperOpsClient } from "../superops/client.js";
import { SuperOpsNetworkError, SuperOpsTimeoutError } from "../superops/errors.js";
import { asRecord, failureCode, upstreamFailureCategory } from "../investigate/common.js";
import { toClientSafeError } from "../privacy/errors.js";
import { authorizationRequired, requireHumanAuthorization } from "./authorization.js";
import { WriteValidationError } from "./errors.js";
import { defaultIdempotencyStore, type IdempotencyStore } from "./idempotency.js";
import type {
  PreWriteState,
  WriteExecutionResult,
  WriteFailure,
  WriteMcpContext,
  WriteSuccess,
  WriteTarget,
  WriteVerification,
} from "./types.js";

export interface WriteOperationPlan {
  toolName: string;
  mutationName: string;
  classification: ToolClassification;
  action: string;
  target: WriteTarget;
  canonicalPayload: Record<string, unknown>;
  requestId?: string;
  impact?: string;
  reversibility?: string;
  logicalOperations: string[];
  preWrite: PreWriteState;
  mutate: () => Promise<Record<string, unknown>>;
  verify: (mutationResult: Record<string, unknown>) => Promise<WriteVerification>;
}

export interface WriteRuntime {
  client: SuperOpsClient;
  config: AppConfig;
  ctx?: WriteMcpContext;
  store?: IdempotencyStore;
}

function paramDigest(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function fail(input: Omit<WriteFailure, "outcome">): WriteFailure {
  return { outcome: "failed", ...input };
}

export async function executeWrite(plan: WriteOperationPlan, runtime: WriteRuntime): Promise<WriteExecutionResult> {
  const store = runtime.store ?? defaultIdempotencyStore;
  const fingerprint = store.fingerprint(plan.toolName, plan.target.id, plan.canonicalPayload);

  let authorization: WriteSuccess["authorization"] = { required: false, result: "not_required" };
  if (authorizationRequired(plan.classification)) {
    const decision = requireHumanAuthorization({
      config: runtime.config,
      ctx: runtime.ctx,
      toolName: plan.toolName,
      action: plan.action,
      target: plan.target,
      consequence: plan.classification,
      paramDigest: paramDigest(plan.canonicalPayload),
      impact: plan.impact ?? "This action may interrupt users or hide monitoring state.",
      reversibility: plan.reversibility ?? "Not automatically reversible.",
    });
    if (decision.result === "declined") {
      return fail({
        code: "authorization_declined",
        message: "Human confirmation was declined or did not match this action and target",
        toolName: plan.toolName,
        classification: plan.classification,
        target: plan.target,
        logicalOperations: plan.logicalOperations,
      });
    }
    authorization = { required: true, result: decision.result };
  }

  const began = store.begin(fingerprint, plan.requestId);
  if (!began.ok) {
    if (began.reason === "duplicate" && began.cached) {
      if (began.cached.outcome !== "failed") {
        return { ...began.cached, idempotentReplay: true } as WriteSuccess;
      }
      return began.cached;
    }
    return fail({
      code: began.reason === "uncertain" ? "retry_uncertain" : "in_flight",
      message:
        began.reason === "uncertain"
          ? "A previous attempt for this write had an unknown outcome. Verify current SuperOps state before retrying."
          : "An identical write is already in progress",
      toolName: plan.toolName,
      classification: plan.classification,
      target: plan.target,
      logicalOperations: plan.logicalOperations,
    });
  }

  try {
    let mutationResult: Record<string, unknown>;
    try {
      mutationResult = asRecord(await plan.mutate());
    } catch (error) {
      if (error instanceof SuperOpsTimeoutError || error instanceof SuperOpsNetworkError) {
        store.markUncertain(fingerprint);
        return fail({
          code: "mutation_uncertain",
          message:
            "The mutation request did not complete a verified response. Do not retry until current SuperOps state is checked.",
          toolName: plan.toolName,
          classification: plan.classification,
          target: plan.target,
          logicalOperations: plan.logicalOperations,
          upstreamFailureCategory: upstreamFailureCategory(error),
        });
      }
      store.abort(fingerprint);
      return fail({
        code: failureCode(error),
        message: toClientSafeError(error),
        toolName: plan.toolName,
        classification: plan.classification,
        target: plan.target,
        logicalOperations: plan.logicalOperations,
        upstreamFailureCategory: upstreamFailureCategory(error),
      });
    }

    let verification: WriteVerification;
    try {
      verification = await plan.verify(mutationResult);
    } catch {
      verification = {
        result: "partial",
        compared: {},
        notes: "Mutation returned but post-write verification could not be completed",
      };
    }
    const result: WriteSuccess = {
      outcome: verification.result,
      mutation: plan.mutationName,
      toolName: plan.toolName,
      classification: plan.classification,
      authorization,
      target: { type: plan.target.type, id: plan.target.id },
      preWrite: plan.preWrite.captured ? plan.preWrite.summary : undefined,
      result: mutationResult,
      verification,
      logicalOperations: plan.logicalOperations,
    };
    store.complete(fingerprint, result);
    return result;
  } catch (error) {
    if (error instanceof WriteValidationError) {
      store.abort(fingerprint);
      return fail({
        code: error.code,
        message: error.message,
        toolName: plan.toolName,
        classification: plan.classification,
        target: plan.target,
        logicalOperations: plan.logicalOperations,
      });
    }
    throw error;
  }
}

export function optionalRequestId(args: Record<string, unknown>): string | undefined {
  const value = args.requestId;
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length < 8) {
    throw new WriteValidationError("malformed_input", "requestId must be a string of at least 8 characters when provided");
  }
  return value.trim();
}

export function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new WriteValidationError("malformed_input", `${key} is required`);
  }
  return value.trim();
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new WriteValidationError("malformed_input", `${key} must be a non-empty string`);
  }
  return value.trim();
}

export function exactlyOne(keys: string[], args: Record<string, unknown>): { key: string; value: string } {
  const present = keys
    .map((key) => ({ key, value: args[key] }))
    .filter((item) => item.value != null && item.value !== "");
  if (present.length !== 1) {
    throw new WriteValidationError("malformed_input", `Provide exactly one of ${keys.join(", ")}`);
  }
  const value = present[0].value;
  if (typeof value !== "string" || !value.trim()) {
    throw new WriteValidationError("malformed_input", `${present[0].key} must be a non-empty string`);
  }
  return { key: present[0].key, value: value.trim() };
}
