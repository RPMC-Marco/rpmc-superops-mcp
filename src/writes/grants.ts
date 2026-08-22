import { randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { ToolClassification } from "../audit.js";
import { asArray, asRecord } from "../investigate/common.js";
import type { SuperOpsClient } from "../superops/client.js";
import { AuthorizationRequiredError, WriteValidationError } from "./errors.js";
import { HMAC_PURPOSE_GRANT, mintHmacToken, verifyHmacToken } from "./hmac.js";
import {
  AUTHORIZATION_PROFILES,
  defaultGrantTtlMinutes,
  maxConsequenceForProfile,
  maxGrantTtlMinutes,
  parseElevatedProfile,
  profileAcknowledged,
  type AuthorizationProfileId,
} from "./profiles.js";
import { resolveTicketTarget } from "./resolve.js";
import { grantTerminatedByTicketStatus } from "./ticket-lifecycle.js";
import type { ActionScope, WriteMcpContext } from "./types.js";

const PROPOSAL_TTL_MS = 10 * 60 * 1000;

export const GRANT_ELICITATION_SCHEMA = {
  type: "object",
  properties: {
    confirm: { type: "boolean", title: "Confirm this scoped authorization grant" },
    typedScope: { type: "string", title: "Type a listed target identifier (ticket id, display id, or asset id)" },
    acknowledgedProfile: {
      type: "string",
      title: "Type B or C to acknowledge the profile (maintenance_window or authorized_build)",
    },
  },
  required: ["confirm", "typedScope", "acknowledgedProfile"],
} as const;

export interface GrantTarget {
  type: string;
  id: string;
  label?: string;
}

export interface GrantClaims {
  v: 1;
  kind: "authorization_grant";
  profile: Exclude<AuthorizationProfileId, "standard_technician">;
  task: string;
  ticketIds: string[];
  ticketDisplayIds: string[];
  assetIds: string[];
  clientAccountIds: string[];
  alertIds: string[];
  siteIds: string[];
  targets: GrantTarget[];
  exclusions: GrantTarget[];
  maxConsequence: Extract<ToolClassification, "disruptive" | "destructive">;
  terminateOnTicketResolved: boolean;
  issuedAt: number;
  exp: number;
  nonce: string;
}

export interface GrantProposal {
  v: 1;
  kind: "grant_proposal";
  profile: Exclude<AuthorizationProfileId, "standard_technician">;
  task: string;
  ticketIds: string[];
  ticketDisplayIds: string[];
  assetIds: string[];
  clientAccountIds: string[];
  alertIds: string[];
  siteIds: string[];
  targets: GrantTarget[];
  exclusions: GrantTarget[];
  maxConsequence: Extract<ToolClassification, "disruptive" | "destructive">;
  terminateOnTicketResolved: boolean;
  proposedExp: number;
  nonce: string;
  exp: number;
}

export interface PublicGrantClaims {
  profile: GrantClaims["profile"];
  profileCode: "B" | "C";
  rulesLabel: string;
  title: string;
  task: string;
  ticketIds: string[];
  ticketDisplayIds: string[];
  assetIds: string[];
  clientAccountIds: string[];
  alertIds: string[];
  siteIds: string[];
  targets: GrantTarget[];
  exclusions: GrantTarget[];
  maxConsequence: GrantClaims["maxConsequence"];
  terminateOnTicketResolved: boolean;
  issuedAt: number;
  exp: number;
}

export type GrantVerifyFailure =
  | "missing"
  | "invalid"
  | "expired"
  | "revoked"
  | "not_active"
  | "terminated";

export class GrantRegistry {
  private readonly issued = new Map<string, number>();
  private readonly revoked = new Set<string>();

  issue(nonce: string, exp: number): void {
    this.issued.set(nonce, exp);
    this.revoked.delete(nonce);
  }

  revoke(nonce: string): void {
    this.revoked.add(nonce);
  }

  status(nonce: string, now = Date.now()): GrantVerifyFailure | "ok" {
    if (this.revoked.has(nonce)) return "revoked";
    const exp = this.issued.get(nonce);
    if (exp == null) return "not_active";
    if (exp < now) return "expired";
    return "ok";
  }

  clear(): void {
    this.issued.clear();
    this.revoked.clear();
  }
}

export const defaultGrantRegistry = new GrantRegistry();

function idsEqual(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

function collectIds(targets: GrantTarget[], type: string): string[] {
  return [...new Set(targets.filter((item) => item.type === type).map((item) => item.id.trim()).filter(Boolean))];
}

export function publicGrantClaims(claims: GrantClaims): PublicGrantClaims {
  const meta = AUTHORIZATION_PROFILES[claims.profile];
  return {
    profile: claims.profile,
    profileCode: meta.code === "A" ? "B" : meta.code,
    rulesLabel: meta.rulesLabel,
    title: meta.title,
    task: claims.task,
    ticketIds: claims.ticketIds,
    ticketDisplayIds: claims.ticketDisplayIds,
    assetIds: claims.assetIds,
    clientAccountIds: claims.clientAccountIds,
    alertIds: claims.alertIds,
    siteIds: claims.siteIds,
    targets: claims.targets,
    exclusions: claims.exclusions,
    maxConsequence: claims.maxConsequence,
    terminateOnTicketResolved: claims.terminateOnTicketResolved,
    issuedAt: claims.issuedAt,
    exp: claims.exp,
  };
}

export function mintAuthorizationGrant(claims: GrantClaims, config: AppConfig, registry: GrantRegistry = defaultGrantRegistry): string {
  registry.issue(claims.nonce, claims.exp);
  return mintHmacToken(claims, config, HMAC_PURPOSE_GRANT);
}

export function verifyAuthorizationGrant(
  token: string | undefined,
  config: AppConfig,
  registry: GrantRegistry = defaultGrantRegistry,
  now = Date.now()
): { ok: true; claims: GrantClaims } | { ok: false; reason: GrantVerifyFailure } {
  if (!token) return { ok: false, reason: "missing" };
  const parsed = verifyHmacToken<GrantClaims>(token, config, HMAC_PURPOSE_GRANT);
  if (!parsed || parsed.v !== 1 || parsed.kind !== "authorization_grant") return { ok: false, reason: "invalid" };
  if (typeof parsed.exp !== "number" || parsed.exp < now) return { ok: false, reason: "expired" };
  const status = registry.status(parsed.nonce, now);
  if (status !== "ok") return { ok: false, reason: status };
  return { ok: true, claims: parsed };
}

function identityCandidates(scope: ActionScope): GrantTarget[] {
  const out: GrantTarget[] = [{ type: scope.target.type, id: scope.target.id, label: scope.target.label }];
  if (scope.ticketId) out.push({ type: "ticket", id: scope.ticketId, label: scope.ticketDisplayId });
  if (scope.ticketDisplayId) out.push({ type: "ticket", id: scope.ticketDisplayId });
  if (scope.assetId) out.push({ type: "asset", id: scope.assetId });
  if (scope.clientAccountId) out.push({ type: "client", id: scope.clientAccountId });
  if (scope.siteId) out.push({ type: "site", id: scope.siteId });
  for (const alertId of scope.alertIds ?? []) out.push({ type: "alert", id: alertId });
  return out;
}

function targetMatchesGrant(item: GrantTarget, grant: Pick<GrantClaims, "targets" | "ticketIds" | "ticketDisplayIds" | "assetIds" | "clientAccountIds" | "alertIds" | "siteIds">): boolean {
  if (grant.targets.some((listed) => listed.type === item.type && idsEqual(listed.id, item.id))) return true;
  if (item.label) {
    const label = item.label;
    if (grant.targets.some((listed) => listed.label && idsEqual(listed.label, label))) return true;
  }
  if (item.type === "ticket") {
    return grant.ticketIds.some((id) => idsEqual(id, item.id)) || grant.ticketDisplayIds.some((id) => idsEqual(id, item.id));
  }
  if (item.type === "asset") return grant.assetIds.some((id) => idsEqual(id, item.id));
  if (item.type === "alert") return grant.alertIds.some((id) => idsEqual(id, item.id));
  if (item.type === "client") return grant.clientAccountIds.some((id) => idsEqual(id, item.id));
  if (item.type === "site") return grant.siteIds.some((id) => idsEqual(id, item.id));
  return false;
}

export function actionExcludedByGrant(scope: ActionScope, grant: GrantClaims): boolean {
  const candidates = identityCandidates(scope);
  return grant.exclusions.some((exclusion) =>
    candidates.some(
      (item) =>
        item.type === exclusion.type &&
        (idsEqual(item.id, exclusion.id) || (item.label != null && idsEqual(item.label, exclusion.id)))
    )
  );
}

export type ScopeCheckResult = "not_applicable" | "in_scope" | "out_of_scope" | "excluded";

export function actionInGrantScope(scope: ActionScope, grant: GrantClaims): ScopeCheckResult {
  if (actionExcludedByGrant(scope, grant)) return "excluded";
  if (grant.clientAccountIds.length > 0) {
    if (!scope.clientAccountId) return "out_of_scope";
    if (!grant.clientAccountIds.some((id) => idsEqual(id, scope.clientAccountId!))) return "out_of_scope";
  }

  const target = scope.target;
  const ticketBound =
    Boolean(scope.ticketId && grant.ticketIds.some((id) => idsEqual(id, scope.ticketId!))) ||
    Boolean(scope.ticketDisplayId && grant.ticketDisplayIds.some((id) => idsEqual(id, scope.ticketDisplayId!))) ||
    (target.type === "ticket" && targetMatchesGrant(target, grant));

  if (target.type === "ticket" || target.type === "workItem" || target.type === "task") {
    if (ticketBound || targetMatchesGrant(target, grant)) return "in_scope";
    return "out_of_scope";
  }

  if (target.type === "asset" || target.type === "alert") {
    if (targetMatchesGrant(target, grant)) return "in_scope";
    if (scope.assetId && grant.assetIds.some((id) => idsEqual(id, scope.assetId!))) return "in_scope";
    if (target.type === "alert" && (scope.alertIds ?? []).some((id) => grant.alertIds.some((listed) => idsEqual(listed, id)))) {
      return "in_scope";
    }
    return "out_of_scope";
  }

  if (targetMatchesGrant(target, grant)) return "in_scope";
  return "out_of_scope";
}

function readGrantElicitation(inputResponses: unknown): {
  action?: string;
  confirm?: boolean;
  typedScope?: string;
  acknowledgedProfile?: string;
} {
  const rec = asRecord(inputResponses);
  const node = rec.confirm ?? rec.grant ?? rec.authorization ?? Object.values(rec)[0];
  const view = asRecord(node);
  const content = asRecord(view.content ?? view);
  return {
    action: typeof view.action === "string" ? view.action : undefined,
    confirm: content.confirm === true,
    typedScope: typeof content.typedScope === "string" ? content.typedScope : undefined,
    acknowledgedProfile: typeof content.acknowledgedProfile === "string" ? content.acknowledgedProfile : undefined,
  };
}

function scopeTypedMatch(typed: string, proposal: GrantProposal): boolean {
  const want = typed.trim().toLowerCase();
  if (!want) return false;
  const pool = [
    ...proposal.targets.map((item) => item.id),
    ...proposal.targets.map((item) => item.label ?? ""),
    ...proposal.ticketIds,
    ...proposal.ticketDisplayIds,
    ...proposal.assetIds,
    ...proposal.alertIds,
    ...proposal.clientAccountIds,
  ];
  return pool.some((item) => item.trim().toLowerCase() === want);
}

export function buildGrantElicitationMessage(proposal: GrantProposal): string {
  const meta = AUTHORIZATION_PROFILES[proposal.profile];
  const targets =
    proposal.targets.length > 0
      ? proposal.targets.map((item) => `${item.type}:${item.label ? `${item.label} (${item.id})` : item.id}`).join(", ")
      : "(none listed)";
  const exclusions =
    proposal.exclusions.length > 0
      ? proposal.exclusions.map((item) => `${item.type}:${item.id}`).join(", ")
      : "(none)";
  const lines = [
    `${meta.rulesLabel}: ${meta.title} authorization grant`,
    `Task: ${proposal.task}`,
    `Maximum consequence: ${proposal.maxConsequence}`,
    `Targets: ${targets}`,
    `Tickets: ${proposal.ticketDisplayIds.concat(proposal.ticketIds).join(", ") || "(none)"}`,
    `Assets: ${proposal.assetIds.join(", ") || "(none)"}`,
    `Clients: ${proposal.clientAccountIds.join(", ") || "(none)"}`,
    `Exclusions: ${exclusions}`,
    `Expires: ${new Date(proposal.proposedExp).toISOString()}`,
    `Terminates when ticket is Resolved/Closed: ${proposal.terminateOnTicketResolved ? "yes" : "no"}`,
    "This grant does not change action classification. It only pre-authorizes consequences already inside this scope.",
    "Out-of-scope actions remain unauthorized, including under Rules C.",
    "Type a listed target identifier, type B or C to acknowledge the profile, and set confirm to true.",
  ];
  if (proposal.profile === "authorized_build" && proposal.assetIds.length === 0) {
    lines.splice(
      8,
      0,
      "WARNING: no explicit asset targets. Destructive/disruptive endpoint actions will be refused until a later grant lists those assets."
    );
  }
  return lines.join("\n");
}

function asTargetList(value: unknown): GrantTarget[] {
  return asArray(value)
    .map((item) => asRecord(item))
    .filter((item) => typeof item.type === "string" && typeof item.id === "string" && item.id.trim())
    .map((item) => ({
      type: String(item.type).trim(),
      id: String(item.id).trim(),
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : undefined,
    }));
}

async function buildProposalFromArgs(
  args: Record<string, unknown>,
  client?: SuperOpsClient
): Promise<GrantProposal> {
  const profile = parseElevatedProfile(typeof args.profile === "string" ? args.profile : undefined);
  if (!profile) {
    throw new WriteValidationError(
      "malformed_input",
      "profile must be Rules B (maintenance_window) or Rules C (authorized_build). Rules A is the default and does not use a grant."
    );
  }
  const task = typeof args.task === "string" ? args.task.trim() : "";
  if (!task) throw new WriteValidationError("malformed_input", "task is required");
  const targets = asTargetList(args.targets);
  const exclusions = asTargetList(args.exclusions);
  const ticketIds: string[] = [];
  const ticketDisplayIds: string[] = [];
  const operations: string[] = [];
  if (typeof args.ticket === "string" && args.ticket.trim()) {
    if (!client) throw new WriteValidationError("malformed_input", "ticket resolution requires SuperOps connectivity");
    const resolved = await resolveTicketTarget(client, args.ticket.trim(), operations);
    ticketIds.push(resolved.id);
    if (resolved.label) ticketDisplayIds.push(resolved.label);
    if (!targets.some((item) => item.type === "ticket" && item.id === resolved.id)) {
      targets.push({ type: "ticket", id: resolved.id, label: resolved.label });
    }
  }
  for (const target of targets) {
    if (target.type === "ticket") ticketIds.push(target.id);
  }
  const clientAccountIds =
    typeof args.clientAccountId === "string" && args.clientAccountId.trim() ? [args.clientAccountId.trim()] : collectIds(targets, "client");
  const assetIds = collectIds(targets, "asset");
  const alertIds = collectIds(targets, "alert");
  const siteIds = collectIds(targets, "site");
  if (ticketIds.length === 0 && targets.length === 0) {
    throw new WriteValidationError("malformed_input", "Provide ticket and/or explicit targets for the authorization scope");
  }
  const ttlRequested = typeof args.expiresInMinutes === "number" && Number.isFinite(args.expiresInMinutes) ? args.expiresInMinutes : defaultGrantTtlMinutes(profile);
  const ttlMinutes = Math.min(Math.max(1, Math.floor(ttlRequested)), maxGrantTtlMinutes(profile));
  const terminateOnTicketResolved =
    typeof args.terminateOnTicketResolved === "boolean" ? args.terminateOnTicketResolved : ticketIds.length > 0;
  const now = Date.now();
  return {
    v: 1,
    kind: "grant_proposal",
    profile,
    task,
    ticketIds: [...new Set(ticketIds)],
    ticketDisplayIds: [...new Set(ticketDisplayIds)],
    assetIds,
    clientAccountIds: [...new Set(clientAccountIds)],
    alertIds,
    siteIds,
    targets,
    exclusions,
    maxConsequence: maxConsequenceForProfile(profile),
    terminateOnTicketResolved,
    proposedExp: now + ttlMinutes * 60_000,
    nonce: randomBytes(16).toString("hex"),
    exp: now + PROPOSAL_TTL_MS,
  };
}

export async function requestAuthorizationGrant(input: {
  args: Record<string, unknown>;
  config: AppConfig;
  ctx?: WriteMcpContext;
  client?: SuperOpsClient;
  registry?: GrantRegistry;
}): Promise<{ grantToken: string; claims: PublicGrantClaims; authorizationSource: "human_grant_elicitation" }> {
  const registry = input.registry ?? defaultGrantRegistry;
  const elicitation = readGrantElicitation(input.ctx?.inputResponses);
  if (elicitation.action === "decline" || elicitation.action === "cancel") {
    throw new WriteValidationError("authorization_declined", "Human declined the scoped authorization grant");
  }
  const existing = verifyHmacToken<GrantProposal>(input.ctx?.requestState, input.config, HMAC_PURPOSE_GRANT);
  const accepted =
    elicitation.confirm === true &&
    typeof elicitation.typedScope === "string" &&
    typeof elicitation.acknowledgedProfile === "string" &&
    existing &&
    existing.kind === "grant_proposal" &&
    existing.v === 1 &&
    typeof existing.exp === "number" &&
    existing.exp >= Date.now() &&
    profileAcknowledged(elicitation.acknowledgedProfile, existing.profile) &&
    scopeTypedMatch(elicitation.typedScope, existing);
  if (accepted && existing) {
    const grant: GrantClaims = {
      v: 1,
      kind: "authorization_grant",
      profile: existing.profile,
      task: existing.task,
      ticketIds: existing.ticketIds,
      ticketDisplayIds: existing.ticketDisplayIds,
      assetIds: existing.assetIds,
      clientAccountIds: existing.clientAccountIds,
      alertIds: existing.alertIds,
      siteIds: existing.siteIds,
      targets: existing.targets,
      exclusions: existing.exclusions,
      maxConsequence: existing.maxConsequence,
      terminateOnTicketResolved: existing.terminateOnTicketResolved,
      issuedAt: Date.now(),
      exp: existing.proposedExp,
      nonce: randomBytes(16).toString("hex"),
    };
    const grantToken = mintAuthorizationGrant(grant, input.config, registry);
    return {
      grantToken,
      claims: publicGrantClaims(grant),
      authorizationSource: "human_grant_elicitation",
    };
  }

  const proposal = await buildProposalFromArgs(input.args, input.client);
  throw new AuthorizationRequiredError(
    {
      message: buildGrantElicitationMessage(proposal),
      requestedSchema: GRANT_ELICITATION_SCHEMA,
      requestState: mintHmacToken(proposal, input.config, HMAC_PURPOSE_GRANT),
    },
    "write_low"
  );
}

export function inspectAuthorizationGrant(
  token: string | undefined,
  config: AppConfig,
  registry: GrantRegistry = defaultGrantRegistry
): PublicGrantClaims {
  const verified = verifyAuthorizationGrant(token, config, registry);
  if (!verified.ok) {
    throw new WriteValidationError(`grant_${verified.reason}`, `Authorization grant is ${verified.reason.replaceAll("_", " ")}`);
  }
  return publicGrantClaims(verified.claims);
}

export function revokeAuthorizationGrant(
  token: string | undefined,
  config: AppConfig,
  registry: GrantRegistry = defaultGrantRegistry
): { revoked: true; profile: GrantClaims["profile"] } {
  const parsed = verifyHmacToken<GrantClaims>(token, config, HMAC_PURPOSE_GRANT);
  if (!parsed || parsed.kind !== "authorization_grant") {
    throw new WriteValidationError("grant_invalid", "Authorization grant is invalid");
  }
  registry.revoke(parsed.nonce);
  return { revoked: true, profile: parsed.profile };
}

export async function grantTerminatedByTicket(
  grant: GrantClaims,
  ticketStatus?: (ticketId: string) => Promise<string | undefined>
): Promise<boolean> {
  if (!grant.terminateOnTicketResolved || grant.ticketIds.length === 0) return false;
  if (!ticketStatus) return false;
  const status = await ticketStatus(grant.ticketIds[0]);
  return grantTerminatedByTicketStatus(status);
}

export function grantFailureCode(reason: GrantVerifyFailure): string {
  return reason === "missing" ? "grant_missing" : `grant_${reason}`;
}

export function grantFailureMessage(reason: GrantVerifyFailure): string {
  switch (reason) {
    case "expired":
      return "Authorization grant has expired";
    case "revoked":
      return "Authorization grant was revoked";
    case "not_active":
      return "Authorization grant is not active in this server process (expired, revoked, or issued before restart)";
    case "terminated":
      return "Authorization grant terminated because the authorized ticket reached Resolved or Closed";
    case "missing":
      return "Authorization grant is required";
    default:
      return "Authorization grant is invalid";
  }
}
