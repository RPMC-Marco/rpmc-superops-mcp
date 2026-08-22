import { randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { ToolClassification } from "../audit.js";
import { asRecord } from "../investigate/common.js";
import { classificationAtMost, isElevatedConsequence } from "./consequence.js";
import { AuthorizationRequiredError } from "./errors.js";
import {
  actionInGrantScope,
  defaultGrantRegistry,
  grantFailureCode,
  grantFailureMessage,
  grantTerminatedByTicket,
  verifyAuthorizationGrant,
  type GrantRegistry,
} from "./grants.js";
import { HMAC_PURPOSE_CONFIRMATION, mintHmacToken, verifyHmacToken } from "./hmac.js";
import { autonomousCeiling } from "./profiles.js";
import type {
  ActionScope,
  AuthorizationRecord,
  WriteMcpContext,
  WriteTarget,
} from "./types.js";

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export const CONFIRMATION_SCHEMA = {
  type: "object",
  properties: {
    confirm: { type: "boolean", title: "Confirm this exact action" },
    typedTarget: { type: "string", title: "Type the exact target identifier to confirm" },
  },
  required: ["confirm", "typedTarget"],
} as const;

export interface AuthorizationChallenge {
  v: 1;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  consequence: ToolClassification;
  paramDigest: string;
  exp: number;
  nonce: string;
}

export interface AuthorizationDecision {
  required: boolean;
  result: "not_required" | "accepted" | "declined" | "missing_capability";
}

export function mintChallengeToken(challenge: AuthorizationChallenge, config: AppConfig): string {
  return mintHmacToken(challenge, config, HMAC_PURPOSE_CONFIRMATION);
}

export function verifyChallengeToken(token: string | undefined, config: AppConfig): AuthorizationChallenge | undefined {
  const parsed = verifyHmacToken<AuthorizationChallenge>(token, config, HMAC_PURPOSE_CONFIRMATION);
  if (!parsed || parsed.v !== 1 || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return undefined;
  if (typeof parsed.action !== "string" || typeof parsed.targetId !== "string") return undefined;
  return parsed;
}

function normalizeTarget(value: string): string {
  return value.trim().toLowerCase();
}

function targetMatches(typed: string, target: WriteTarget): boolean {
  const want = normalizeTarget(typed);
  if (!want) return false;
  if (normalizeTarget(target.id) === want) return true;
  if (target.label && normalizeTarget(target.label) === want) return true;
  return false;
}

function readElicitation(inputResponses: unknown): {
  action?: string;
  confirm?: boolean;
  typedTarget?: string;
} {
  const rec = asRecord(inputResponses);
  const node = rec.confirm ?? rec.authorization ?? Object.values(rec)[0];
  const view = asRecord(node);
  const content = asRecord(view.content ?? view);
  return {
    action: typeof view.action === "string" ? view.action : undefined,
    confirm: content.confirm === true,
    typedTarget: typeof content.typedTarget === "string" ? content.typedTarget : undefined,
  };
}

export function buildConfirmationMessage(input: {
  action: string;
  target: WriteTarget;
  consequence: ToolClassification;
  impact: string;
  reversibility: string;
}): string {
  const target = input.target.label ? `${input.target.label} (${input.target.id})` : input.target.id;
  const header = input.consequence === "destructive" ? "DESTRUCTIVE ACTION" : "DISRUPTIVE ACTION";
  return [
    `${header}: ${input.action}`,
    `Target: ${target}`,
    `Expected impact: ${input.impact}`,
    `Reversibility: ${input.reversibility}`,
    "This confirmation is scoped to this action, target, and parameters only.",
    "Classification is unchanged by any authorization profile.",
    "Type the exact target identifier and set confirm to true.",
  ].join("\n");
}

export function requireHumanAuthorization(input: {
  config: AppConfig;
  ctx?: WriteMcpContext;
  toolName: string;
  action: string;
  target: WriteTarget;
  consequence: Extract<ToolClassification, "disruptive" | "destructive">;
  paramDigest: string;
  impact: string;
  reversibility: string;
}): AuthorizationDecision {
  const existing = verifyChallengeToken(input.ctx?.requestState, input.config);
  const elicitation = readElicitation(input.ctx?.inputResponses);
  if (elicitation.action === "decline" || elicitation.action === "cancel") {
    return { required: true, result: "declined" };
  }
  const accepted =
    elicitation.confirm === true &&
    typeof elicitation.typedTarget === "string" &&
    targetMatches(elicitation.typedTarget, input.target);
  if (accepted && existing) {
    if (
      existing.action === input.action &&
      existing.targetId === input.target.id &&
      existing.targetType === input.target.type &&
      existing.consequence === input.consequence &&
      existing.paramDigest === input.paramDigest
    ) {
      return { required: true, result: "accepted" };
    }
  }
  if (accepted && !existing) {
    return { required: true, result: "declined" };
  }

  const challenge: AuthorizationChallenge = {
    v: 1,
    action: input.action,
    targetType: input.target.type,
    targetId: input.target.id,
    targetLabel: input.target.label,
    consequence: input.consequence,
    paramDigest: input.paramDigest,
    exp: Date.now() + CONFIRMATION_TTL_MS,
    nonce: randomBytes(16).toString("hex"),
  };
  throw new AuthorizationRequiredError(
    {
      message: buildConfirmationMessage({
        action: input.action,
        target: input.target,
        consequence: input.consequence,
        impact: input.impact,
        reversibility: input.reversibility,
      }),
      requestedSchema: CONFIRMATION_SCHEMA,
      requestState: mintChallengeToken(challenge, input.config),
    },
    input.consequence
  );
}

export function mcpContextFrom(ctx: unknown): WriteMcpContext | undefined {
  if (!ctx || typeof ctx !== "object") return undefined;
  const rec = asRecord(ctx);
  const mcpReq = asRecord(rec.mcpReq ?? rec);
  let requestState: string | undefined;
  const rs = mcpReq.requestState;
  if (typeof rs === "function") {
    try {
      const value = rs.call(mcpReq);
      requestState = typeof value === "string" ? value : undefined;
    } catch {
      requestState = undefined;
    }
  } else if (typeof rs === "string") {
    requestState = rs;
  }
  return {
    inputResponses: mcpReq.inputResponses,
    requestState,
  };
}

export function authorizationRequired(classification: ToolClassification): classification is "disruptive" | "destructive" {
  return classification === "disruptive" || classification === "destructive";
}

function rulesARecord(result: AuthorizationRecord["result"], required: boolean): AuthorizationRecord {
  return {
    required,
    result,
    profile: "standard_technician",
    source: result === "accepted" || result === "declined" ? "per_action_elicitation" : "rules_a_default",
    grantPresent: false,
    scopeCheck: "not_applicable",
  };
}

export async function resolveWriteAuthorization(input: {
  config: AppConfig;
  ctx?: WriteMcpContext;
  grantToken?: string;
  registry?: GrantRegistry;
  classification: ToolClassification;
  action: string;
  toolName: string;
  target: WriteTarget;
  scope: ActionScope;
  paramDigest: string;
  impact: string;
  reversibility: string;
  ticketStatus?: (ticketId: string) => Promise<string | undefined>;
}): Promise<{ ok: true; record: AuthorizationRecord } | { ok: false; record: AuthorizationRecord; code: string; message: string }> {
  const registry = input.registry ?? defaultGrantRegistry;

  if (input.grantToken) {
    const verified = verifyAuthorizationGrant(input.grantToken, input.config, registry);
    if (!verified.ok) {
      const record: AuthorizationRecord = {
        required: true,
        result:
          verified.reason === "expired"
            ? "grant_expired"
            : verified.reason === "revoked"
              ? "grant_revoked"
              : verified.reason === "not_active"
                ? "grant_not_active"
                : "grant_invalid",
        profile: "standard_technician",
        source: "scoped_grant",
        grantPresent: true,
        scopeCheck: "not_applicable",
      };
      return { ok: false, record, code: grantFailureCode(verified.reason), message: grantFailureMessage(verified.reason) };
    }

    if (await grantTerminatedByTicket(verified.claims, input.ticketStatus)) {
      const record: AuthorizationRecord = {
        required: true,
        result: "grant_terminated",
        profile: verified.claims.profile,
        source: "scoped_grant",
        grantPresent: true,
        scopeCheck: "not_applicable",
      };
      return {
        ok: false,
        record,
        code: "grant_terminated",
        message: grantFailureMessage("terminated"),
      };
    }

    const scopeCheck = actionInGrantScope(input.scope, verified.claims);
    if (scopeCheck !== "in_scope") {
      if (isElevatedConsequence(input.classification)) {
        const record: AuthorizationRecord = {
          required: true,
          result: "scope_violation",
          profile: verified.claims.profile,
          source: "scoped_grant",
          grantPresent: true,
          scopeCheck,
        };
        return {
          ok: false,
          record,
          code: "scope_violation",
          message:
            scopeCheck === "excluded"
              ? "This action is excluded from the authorization grant"
              : "This action is outside the human-authorized grant scope",
        };
      }
      return {
        ok: true,
        record: {
          required: false,
          result: "not_required",
          profile: "standard_technician",
          source: "rules_a_default",
          grantPresent: true,
          scopeCheck,
        },
      };
    }

    const ceiling = autonomousCeiling(verified.claims.profile);
    if (classificationAtMost(input.classification, ceiling)) {
      return {
        ok: true,
        record: {
          required: false,
          result: "preauthorized_by_scoped_grant",
          profile: verified.claims.profile,
          source: "scoped_grant",
          grantPresent: true,
          scopeCheck,
        },
      };
    }

    if (!isElevatedConsequence(input.classification)) {
      return {
        ok: true,
        record: {
          required: false,
          result: "not_required",
          profile: verified.claims.profile,
          source: "scoped_grant",
          grantPresent: true,
          scopeCheck,
        },
      };
    }

    const decision = requireHumanAuthorization({
      config: input.config,
      ctx: input.ctx,
      toolName: input.toolName,
      action: input.action,
      target: input.target,
      consequence: input.classification,
      paramDigest: input.paramDigest,
      impact: input.impact,
      reversibility: input.reversibility,
    });
    if (decision.result === "declined") {
      return {
        ok: false,
        record: {
          required: true,
          result: "declined",
          profile: verified.claims.profile,
          source: "per_action_elicitation",
          grantPresent: true,
          scopeCheck,
        },
        code: "authorization_declined",
        message: "Human confirmation was declined or did not match this action and target",
      };
    }
    return {
      ok: true,
      record: {
        required: true,
        result: "accepted",
        profile: verified.claims.profile,
        source: "per_action_elicitation",
        grantPresent: true,
        scopeCheck,
      },
    };
  }

  if (!isElevatedConsequence(input.classification)) {
    return { ok: true, record: rulesARecord("not_required", false) };
  }

  const decision = requireHumanAuthorization({
    config: input.config,
    ctx: input.ctx,
    toolName: input.toolName,
    action: input.action,
    target: input.target,
    consequence: input.classification,
    paramDigest: input.paramDigest,
    impact: input.impact,
    reversibility: input.reversibility,
  });
  if (decision.result === "declined") {
    return {
      ok: false,
      record: rulesARecord("declined", true),
      code: "authorization_declined",
      message: "Human confirmation was declined or did not match this action and target",
    };
  }
  return { ok: true, record: rulesARecord("accepted", true) };
}
