import type { SuperOpsClient } from "../superops/client.js";
import * as Q from "../superops/queries.js";
import * as XQ from "../superops/queries-expanded.js";
import { asArray, asRecord, boundedLookupNotUnique, scalarId } from "../investigate/common.js";
import { classifyTicketRef } from "../tickets/ticket-ref.js";
import { resolveDisplayId } from "../tickets/investigate-ticket.js";
import { resolveAsset } from "../assets/resolve-asset.js";
import { resolveClient } from "../clients/resolve-client.js";
import { WriteValidationError } from "./errors.js";
import type { WriteTarget } from "./types.js";

export async function resolveTicketTarget(
  client: SuperOpsClient,
  ticket: string,
  operations: string[]
): Promise<WriteTarget & { displayId?: string }> {
  const classified = classifyTicketRef(ticket);
  if (classified.kind === "malformed") {
    throw new WriteValidationError("malformed_input", "ticket is required");
  }
  if (classified.kind === "displayId") {
    const resolved = await resolveDisplayId(client, classified.value, operations);
    if (!resolved.ok) {
      throw new WriteValidationError(resolved.code, resolved.message);
    }
    return { type: "ticket", id: resolved.ticketId, label: resolved.displayId, displayId: resolved.displayId };
  }
  operations.push("getTicket");
  const data = asRecord(await client.query(Q.GET_TICKET, { input: { ticketId: classified.value } }));
  const detail = asRecord(data.getTicket ?? data);
  const ticketId = scalarId(detail.ticketId) ?? classified.value;
  const displayId = typeof detail.displayId === "string" ? detail.displayId : undefined;
  return { type: "ticket", id: ticketId, label: displayId, displayId };
}

export async function resolveAssetTarget(
  client: SuperOpsClient,
  identity: { key: string; value: string },
  operations: string[]
): Promise<WriteTarget> {
  const resolved = await resolveAsset(client, identity);
  operations.push(...resolved.logicalOperations);
  if (!resolved.ok) {
    throw new WriteValidationError(resolved.code, resolved.message);
  }
  return { type: "asset", id: resolved.assetId, label: identity.key === "assetId" ? undefined : identity.value };
}

export async function resolveClientTarget(
  client: SuperOpsClient,
  identity: { key: string; value: string },
  operations: string[]
): Promise<WriteTarget> {
  const resolved = await resolveClient(client, identity);
  operations.push(...resolved.logicalOperations);
  if (!resolved.ok) {
    throw new WriteValidationError(resolved.code, resolved.message);
  }
  return { type: "client", id: resolved.accountId, label: identity.key === "accountId" ? undefined : identity.value };
}

export async function loadTicket(
  client: SuperOpsClient,
  ticketId: string,
  operations: string[]
): Promise<Record<string, unknown>> {
  operations.push("getTicket");
  const data = asRecord(await client.query(Q.GET_TICKET, { input: { ticketId } }));
  return asRecord(data.getTicket ?? data);
}

export async function loadAsset(
  client: SuperOpsClient,
  assetId: string,
  operations: string[]
): Promise<Record<string, unknown>> {
  operations.push("getAsset");
  const data = asRecord(await client.query(Q.GET_ASSET, { input: { assetId } }));
  return asRecord(data.getAsset ?? data);
}

export async function loadClientUser(
  client: SuperOpsClient,
  userId: string,
  operations: string[]
): Promise<Record<string, unknown>> {
  operations.push("getClientUser");
  const data = asRecord(await client.query(XQ.GET_CLIENT_USER, { input: { userId } }));
  return asRecord(data.getClientUser ?? data);
}

export async function loadTask(
  client: SuperOpsClient,
  taskId: string,
  operations: string[]
): Promise<Record<string, unknown>> {
  operations.push("getTask");
  const data = asRecord(await client.query(XQ.GET_TASK, { input: { taskId } }));
  return asRecord(data.getTask ?? data);
}

export async function loadItDoc(
  client: SuperOpsClient,
  itDocId: string,
  operations: string[]
): Promise<Record<string, unknown>> {
  operations.push("getItDocumentation");
  const data = asRecord(await client.query(XQ.GET_IT_DOCUMENTATION, { input: { itDocId } }));
  return asRecord(data.getItDocumentation ?? data);
}

export async function loadKbItem(
  client: SuperOpsClient,
  itemId: string,
  operations: string[]
): Promise<Record<string, unknown>> {
  operations.push("getKbItem");
  const data = asRecord(await client.query(XQ.GET_KB_ITEM, { input: { itemId } }));
  return asRecord(data.getKbItem ?? data);
}

export async function loadScriptMetadata(
  client: SuperOpsClient,
  scriptId: string,
  operations: string[]
): Promise<Record<string, unknown> | undefined> {
  operations.push("getScriptList");
  try {
    const data = asRecord(
      await client.query(XQ.GET_SCRIPT_LIST, {
        input: { page: 1, pageSize: 5, condition: { attribute: "scriptId", operator: "is", value: scriptId } },
      })
    );
    const payload = asRecord(data.getScriptList);
    const scripts = asArray(payload.scripts).map(asRecord);
    const exact = scripts.filter((item) => scalarId(item.scriptId) === scriptId);
    const listInfo = asRecord(payload.listInfo);
    if (exact.length === 1 && !boundedLookupNotUnique(listInfo, exact.length)) return exact[0];
    return undefined;
  } catch {
    return undefined;
  }
}

export function ticketPreWriteSummary(ticket: Record<string, unknown>): Record<string, unknown> {
  return {
    ticketId: ticket.ticketId,
    displayId: ticket.displayId,
    status: ticket.status,
    priority: ticket.priority,
    technician: scalarId(asRecord(ticket.technician).userId),
    techGroup: scalarId(asRecord(ticket.techGroup).groupId),
    updatedTime: ticket.updatedTime,
  };
}

export function assetPreWriteSummary(asset: Record<string, unknown>): Record<string, unknown> {
  return {
    assetId: asset.assetId,
    name: asset.name,
    client: scalarId(asRecord(asset.client).accountId),
    site: scalarId(asRecord(asset.site).id),
  };
}

export function userPreWriteSummary(user: Record<string, unknown>): Record<string, unknown> {
  return {
    userId: user.userId,
    site: scalarId(asRecord(user.site).id),
    role: scalarId(asRecord(user.role).roleId),
  };
}

export function sameScalar(actual: unknown, expected: unknown): boolean {
  if (expected == null || expected === "") return true;
  return scalarId(actual) === scalarId(expected) || actual === expected;
}
