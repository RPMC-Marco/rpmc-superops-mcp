import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { ToolClassification } from "../audit.js";
import { asRecord } from "../investigate/common.js";
import { AuthorizationRequiredError } from "./errors.js";
import type { WriteMcpContext, WriteTarget } from "./types.js";

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

function confirmationKey(config: AppConfig): Buffer {
  const material = config.mcpAuthToken || config.superopsApiToken;
  return Buffer.from(hkdfSync("sha256", material, "rpmc-superops-mcp", "write-confirmation-v1", 32));
}

function sign(payload: string, config: AppConfig): string {
  return createHmac("sha256", confirmationKey(config)).update(payload).digest("base64url");
}

export function mintChallengeToken(challenge: AuthorizationChallenge, config: AppConfig): string {
  const payload = Buffer.from(JSON.stringify(challenge), "utf8").toString("base64url");
  return `${payload}.${sign(payload, config)}`;
}

export function verifyChallengeToken(token: string | undefined, config: AppConfig): AuthorizationChallenge | undefined {
  if (!token || !token.includes(".")) return undefined;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return undefined;
  const expected = sign(payload, config);
  if (expected.length !== mac.length) return undefined;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  }
  if (mismatch !== 0) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthorizationChallenge;
    if (parsed.v !== 1 || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
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
  throw new AuthorizationRequiredError({
    message: buildConfirmationMessage({
      action: input.action,
      target: input.target,
      consequence: input.consequence,
      impact: input.impact,
      reversibility: input.reversibility,
    }),
    requestedSchema: CONFIRMATION_SCHEMA,
    requestState: mintChallengeToken(challenge, input.config),
  });
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
