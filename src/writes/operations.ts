import type { ToolClassification } from "../audit.js";
import type { SuperOpsClient } from "../superops/client.js";
import * as Q from "../superops/queries.js";
import * as XQ from "../superops/queries-expanded.js";
import * as M from "../superops/mutations.js";
import { asArray, asRecord, scalarId } from "../investigate/common.js";
import {
  forbiddenItDocWriteReason,
  parseCategoryFieldDefs,
  type CategoryFieldDef,
} from "../privacy/custom-fields.js";
import { WriteValidationError } from "./errors.js";
import { executeWrite, exactlyOne, optionalRequestId, optionalString, requireString } from "./pipeline.js";
import { CLOSED_REQUIRES_EXPLICIT_INSTRUCTION, looksLikeClosedStatus } from "./ticket-lifecycle.js";
import {
  assetPreWriteSummary,
  loadAsset,
  loadClientUser,
  loadItDoc,
  loadKbItem,
  loadScriptMetadata,
  loadTicket,
  resolveAssetTarget,
  resolveClientTarget,
  resolveTicketTarget,
  sameScalar,
  ticketPreWriteSummary,
  userPreWriteSummary,
} from "./resolve.js";
import { classifyScriptConsequence, scriptParamDigest } from "./scripts.js";
import type { WriteExecutionResult, WriteTarget, WriteVerification } from "./types.js";
import type { WriteOperationPlan, WriteRuntime } from "./pipeline.js";

function verifyFields(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  map: (actual: Record<string, unknown>, key: string) => unknown = (row, key) => row[key]
): WriteVerification {
  const compared: Record<string, unknown> = {};
  let matched = 0;
  let checked = 0;
  for (const [key, want] of Object.entries(expected)) {
    if (want == null || want === "") continue;
    checked += 1;
    const got = map(actual, key);
    const ok = sameScalar(got, want) || got === want;
    compared[key] = { expected: typeof want === "string" ? "[set]" : want, matched: ok };
    if (ok) matched += 1;
  }
  if (checked === 0) return { result: "complete", compared, notes: "mutation accepted; no field comparison required" };
  if (matched === checked) return { result: "complete", compared };
  if (matched > 0) return { result: "partial", compared, notes: "Some intended fields did not match after write" };
  return { result: "failed", compared, notes: "Post-write state did not match the intended change" };
}

function atLeastOne(args: Record<string, unknown>, keys: string[]): void {
  if (!keys.some((key) => args[key] != null && args[key] !== "")) {
    throw new WriteValidationError("malformed_input", `Provide at least one of ${keys.join(", ")}`);
  }
}

function assertClosedLifecycle(status: string | undefined, lifecycle: string | undefined): void {
  if (status && looksLikeClosedStatus(status) && lifecycle !== "close") {
    throw new WriteValidationError("close_requires_explicit_instruction", CLOSED_REQUIRES_EXPLICIT_INSTRUCTION);
  }
}

async function sanitizeItDocFields(
  client: SuperOpsClient,
  typeId: string,
  fields: Record<string, unknown> | undefined,
  operations: string[]
): Promise<Record<string, unknown> | undefined> {
  if (!fields || Object.keys(fields).length === 0) return undefined;
  operations.push("getItDocumentationCategories");
  const data = asRecord(await client.query(XQ.GET_IT_DOCUMENTATION_CATEGORIES));
  const categories = asArray(data.getItDocumentationCategories).map(asRecord);
  const category = categories.find((item) => scalarId(item.typeId) === typeId);
  if (!category) {
    throw new WriteValidationError("not_found", "IT documentation category typeId was not found");
  }
  const defs: CategoryFieldDef[] = parseCategoryFieldDefs(category.customFields);
  const out: Record<string, unknown> = {};
  const categoryName = typeof category.name === "string" ? category.name : undefined;
  for (const [columnName, value] of Object.entries(fields)) {
    const def = defs.find((item) => item.columnName === columnName);
    const reason = forbiddenItDocWriteReason(columnName, value, def, categoryName);
    if (reason) throw new WriteValidationError("secret_field_forbidden", `${columnName}: ${reason}`);
    out[columnName] = value;
  }
  return out;
}

function kbVisibility(kind: "technicians" | "requesters" | undefined): Record<string, unknown> {
  if (kind === "requesters") {
    return {
      added: [
        {
          portalType: "REQUESTER",
          clientSharedType: "AllClients",
          siteSharedType: "AllSites",
          userRoleSharedType: "AllRoles",
        },
      ],
    };
  }
  return {
    added: [{ portalType: "TECHNICIAN", userSharedType: "AllUsers" }],
  };
}

async function runPlan(plan: WriteOperationPlan, runtime: WriteRuntime): Promise<WriteExecutionResult> {
  return executeWrite(plan, runtime);
}

export async function handleWriteTool(
  name: string,
  args: Record<string, unknown>,
  runtime: WriteRuntime
): Promise<WriteExecutionResult> {
  const client = runtime.client;
  const operations: string[] = [];
  const requestId = optionalRequestId(args);
  runtime.authorizationGrant = optionalString(args, "authorizationGrant");

  switch (name) {
    case "superops_tickets_create":
      return createTicket(args, runtime, operations, requestId);
    case "superops_tickets_update":
      return updateTicket(args, runtime, operations, requestId);
    case "superops_tickets_add_note":
      return addNote(args, runtime, operations, requestId);
    case "superops_tickets_add_conversation":
      return addConversation(args, runtime, operations, requestId);
    case "superops_worklogs_create":
      return createWorklog(args, runtime, operations, requestId);
    case "superops_worklogs_update":
      return updateWorklog(args, runtime, operations, requestId);
    case "superops_alerts_create":
      return createAlert(args, runtime, operations, requestId);
    case "superops_alerts_resolve":
      return resolveAlerts(args, runtime, operations, requestId);
    case "superops_client_users_update":
      return updateClientUser(args, runtime, operations, requestId);
    case "superops_client_users_update_association":
      return updateClientUserAssociation(args, runtime, operations, requestId);
    case "superops_assets_update":
      return updateAsset(args, runtime, operations, requestId);
    case "superops_tasks_create":
      return createTask(args, runtime, operations, requestId);
    case "superops_itdocs_create":
      return createItDoc(args, runtime, operations, requestId);
    case "superops_itdocs_update":
      return updateItDoc(args, runtime, operations, requestId);
    case "superops_kb_articles_create":
      return createKbArticle(args, runtime, operations, requestId);
    case "superops_kb_collections_create":
      return createKbCollection(args, runtime, operations, requestId);
    case "superops_kb_collections_update":
      return updateKbCollection(args, runtime, operations, requestId);
    case "superops_scripts_execute":
      return runScript(args, runtime, operations, requestId);
    default:
      throw new WriteValidationError("unknown_tool", `Unknown or unregistered write tool: ${name}`);
  }

  async function createTicket(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const clientIdentity = exactlyOne(["accountId", "clientName"], input);
    const clientTarget = await resolveClientTarget(
      client,
      clientIdentity.key === "accountId" ? { key: "accountId", value: clientIdentity.value } : { key: "name", value: clientIdentity.value },
      ops
    );
    let assetTarget: WriteTarget | undefined;
    if (input.assetId || input.hostName) {
      const ident = exactlyOne(["assetId", "hostName"], input);
      assetTarget = await resolveAssetTarget(client, ident, ops);
    }
    const subject = requireString(input, "subject");
    const status = requireString(input, "status");
    assertClosedLifecycle(status, optionalString(input, "lifecycle"));
    const mutationInput: Record<string, unknown> = {
      subject,
      status,
      client: { accountId: clientTarget.id },
      source: optionalString(input, "source") ?? "INTEGRATION",
    };
    const description = optionalString(input, "description");
    if (description) mutationInput.description = description;
    const siteId = optionalString(input, "siteId");
    if (siteId) mutationInput.site = { id: siteId };
    const requesterUserId = optionalString(input, "requesterUserId");
    if (requesterUserId) mutationInput.requester = { userId: requesterUserId };
    const technicianId = optionalString(input, "technicianId");
    if (technicianId) mutationInput.technician = { userId: technicianId };
    const techGroupId = optionalString(input, "techGroupId");
    if (techGroupId) mutationInput.techGroup = { groupId: techGroupId };
    for (const key of ["priority", "impact", "urgency", "category", "requestType"] as const) {
      const value = optionalString(input, key);
      if (value) mutationInput[key] = value;
    }
    if (assetTarget) mutationInput.addAssets = [{ assetId: assetTarget.id }];
    const alertId = optionalString(input, "alertId");
    if (alertId) {
      mutationInput.sourceReferenceId = alertId;
      mutationInput.subSource = "alert";
    }
    return runPlan(
      {
        toolName: name,
        mutationName: "createTicket",
        classification: "write_visible",
        action: "createTicket",
        target: { type: "client", id: clientTarget.id, label: subject },
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: false, summary: {} },
        mutate: async () => {
          ops.push("createTicket");
          return asRecord(await rt.client.mutate(M.CREATE_TICKET, { input: mutationInput }));
        },
        verify: async (mutationResult) => {
          const created = asRecord(mutationResult.createTicket);
          const ticketId = scalarId(created.ticketId);
          if (!ticketId) return { result: "partial", compared: {}, notes: "createTicket did not return ticketId" };
          const fresh = await loadTicket(client, ticketId, ops);
          return verifyFields(fresh, { subject, status, client: clientTarget.id }, (row, key) => {
            if (key === "client") return asRecord(row.client).accountId;
            return row[key];
          });
        },
      },
      rt
    );
  }

  async function updateTicket(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    atLeastOne(input, [
      "subject",
      "status",
      "priority",
      "technicianId",
      "techGroupId",
      "impact",
      "urgency",
      "category",
      "subcategory",
      "cause",
      "resolutionCode",
      "siteId",
      "requesterUserId",
    ]);
    const target = await resolveTicketTarget(client, requireString(input, "ticket"), ops);
    const current = await loadTicket(client, target.id, ops);
    assertClosedLifecycle(optionalString(input, "status"), optionalString(input, "lifecycle"));
    const mutationInput: Record<string, unknown> = { ticketId: target.id };
    const expected: Record<string, unknown> = {};
    const subject = optionalString(input, "subject");
    if (subject) {
      mutationInput.subject = subject;
      expected.subject = subject;
    }
    for (const key of ["status", "priority", "impact", "urgency", "category", "subcategory", "cause", "resolutionCode"] as const) {
      const value = optionalString(input, key);
      if (value) {
        mutationInput[key] = value;
        expected[key] = value;
      }
    }
    const technicianId = optionalString(input, "technicianId");
    if (technicianId) {
      mutationInput.technician = { userId: technicianId };
      expected.technicianId = technicianId;
    }
    const techGroupId = optionalString(input, "techGroupId");
    if (techGroupId) {
      mutationInput.techGroup = { groupId: techGroupId };
      expected.techGroupId = techGroupId;
    }
    const siteId = optionalString(input, "siteId");
    if (siteId) {
      mutationInput.site = { id: siteId };
      expected.siteId = siteId;
    }
    const requesterUserId = optionalString(input, "requesterUserId");
    if (requesterUserId) {
      mutationInput.requester = { userId: requesterUserId };
      expected.requesterUserId = requesterUserId;
    }
    return runPlan(
      {
        toolName: name,
        mutationName: "updateTicket",
        classification: "write_visible",
        action: "updateTicket",
        target,
        scopeContext: {
          target,
          ticketId: target.id,
          ticketDisplayId: target.label,
          clientAccountId: scalarId(asRecord(current.client).accountId),
        },
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: ticketPreWriteSummary(current) },
        mutate: async () => {
          ops.push("updateTicket");
          return asRecord(await rt.client.mutate(M.UPDATE_TICKET, { input: mutationInput }));
        },
        verify: async () => {
          const fresh = await loadTicket(client, target.id, ops);
          return verifyFields(fresh, expected, (row, key) => {
            if (key === "technicianId") return asRecord(row.technician).userId;
            if (key === "techGroupId") return asRecord(row.techGroup).groupId;
            if (key === "siteId") return asRecord(row.site).id;
            if (key === "requesterUserId") return asRecord(row.requester).userId;
            return row[key];
          });
        },
      },
      rt
    );
  }

  async function addNote(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const target = await resolveTicketTarget(client, requireString(input, "ticket"), ops);
    await loadTicket(client, target.id, ops);
    const privacyType = optionalString(input, "privacyType") ?? "PRIVATE";
    const classification: ToolClassification = privacyType === "PUBLIC" ? "write_visible" : "write_low";
    const content = requireString(input, "content");
    const mutationInput = {
      ticket: { ticketId: target.id },
      content,
      privacyType,
    };
    return runPlan(
      {
        toolName: name,
        mutationName: "createTicketNote",
        classification,
        action: "createTicketNote",
        target,
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: { ticketId: target.id } },
        mutate: async () => {
          ops.push("createTicketNote");
          return asRecord(await rt.client.mutate(M.CREATE_TICKET_NOTE, { input: mutationInput }));
        },
        verify: async (mutationResult) => {
          const created = asRecord(mutationResult.createTicketNote);
          if (!scalarId(created.noteId)) {
            return { result: "partial", compared: {}, notes: "createTicketNote did not return noteId" };
          }
          ops.push("getTicketNoteList");
          const listed = asRecord(await client.query(Q.GET_TICKET_NOTE_LIST, { input: { ticketId: target.id } }));
          const notes = asArray(listed.getTicketNoteList).map(asRecord);
          const found = notes.some((item) => scalarId(item.noteId) === scalarId(created.noteId));
          return {
            result: found ? "complete" : "partial",
            compared: { noteId: { matched: found } },
            notes: found ? undefined : "Note was created but not found on the subsequent note list",
          };
        },
      },
      rt
    );
  }

  async function addConversation(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const target = await resolveTicketTarget(client, requireString(input, "ticket"), ops);
    await loadTicket(client, target.id, ops);
    const mutationInput = {
      ticket: { ticketId: target.id },
      content: requireString(input, "content"),
      sendMail: input.sendMail === true,
    };
    return runPlan(
      {
        toolName: name,
        mutationName: "createTicketConversation",
        classification: "write_visible",
        action: "createTicketConversation",
        target,
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: { ticketId: target.id } },
        mutate: async () => {
          ops.push("createTicketConversation");
          return asRecord(await rt.client.mutate(M.CREATE_TICKET_CONVERSATION, { input: mutationInput }));
        },
        verify: async (mutationResult) => {
          const created = asRecord(mutationResult.createTicketConversation);
          const conversationId = scalarId(created.conversationId);
          if (!conversationId) return { result: "partial", compared: {}, notes: "conversationId missing" };
          ops.push("getTicketConversationList");
          const listed = asRecord(await client.query(Q.GET_TICKET_CONVERSATION_LIST, { input: { ticketId: target.id } }));
          const items = asArray(listed.getTicketConversationList).map(asRecord);
          const found = items.some((item) => scalarId(item.conversationId) === conversationId);
          return { result: found ? "complete" : "partial", compared: { conversationId: { matched: found } } };
        },
      },
      rt
    );
  }

  async function createWorklog(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const module = requireString(input, "module");
    const workId = requireString(input, "workId");
    if (module === "TICKET") await loadTicket(client, workId, ops);
    const mutationInput: Record<string, unknown> = {
      qty: requireString(input, "qty"),
      billDateTime: requireString(input, "billDateTime"),
      workItem: { workId, module },
    };
    const serviceItemId = optionalString(input, "serviceItemId");
    if (serviceItemId) mutationInput.serviceItem = { itemId: serviceItemId };
    if (typeof input.billable === "boolean") mutationInput.billable = input.billable;
    if (typeof input.afterHours === "boolean") mutationInput.afterHours = input.afterHours;
    const notes = optionalString(input, "notes");
    if (notes) mutationInput.notes = notes;
    return runPlan(
      {
        toolName: name,
        mutationName: "createWorklogEntries",
        classification: "write_low",
        action: "createWorklogEntries",
        target: { type: "workItem", id: workId, label: module },
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: { workId, module } },
        mutate: async () => {
          ops.push("createWorklogEntries");
          return asRecord(await rt.client.mutate(M.CREATE_WORKLOG_ENTRIES, { input: [mutationInput] }));
        },
        verify: async (mutationResult) => {
          const entries = asArray(mutationResult.createWorklogEntries).map(asRecord);
          const itemId = scalarId(entries[0]?.itemId);
          return {
            result: itemId ? "complete" : "partial",
            compared: { itemId: { matched: Boolean(itemId) } },
          };
        },
      },
      rt
    );
  }

  async function updateWorklog(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    atLeastOne(input, ["qty", "billDateTime", "billable", "afterHours", "notes", "serviceItemId"]);
    const itemId = requireString(input, "itemId");
    const mutationInput: Record<string, unknown> = { itemId };
    const expected: Record<string, unknown> = {};
    for (const key of ["qty", "billDateTime", "notes"] as const) {
      const value = optionalString(input, key);
      if (value) {
        mutationInput[key] = value;
        expected[key] = value;
      }
    }
    if (typeof input.billable === "boolean") {
      mutationInput.billable = input.billable;
      expected.billable = input.billable;
    }
    if (typeof input.afterHours === "boolean") {
      mutationInput.afterHours = input.afterHours;
      expected.afterHours = input.afterHours;
    }
    const serviceItemId = optionalString(input, "serviceItemId");
    if (serviceItemId) mutationInput.serviceItem = { itemId: serviceItemId };
    return runPlan(
      {
        toolName: name,
        mutationName: "updateWorklogEntry",
        classification: "write_low",
        action: "updateWorklogEntry",
        target: { type: "worklog", id: itemId },
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: { itemId } },
        mutate: async () => {
          ops.push("updateWorklogEntry");
          return asRecord(await rt.client.mutate(M.UPDATE_WORKLOG_ENTRY, { input: mutationInput }));
        },
        verify: async (mutationResult) => {
          const updated = asRecord(mutationResult.updateWorklogEntry);
          return verifyFields(updated, expected);
        },
      },
      rt
    );
  }

  async function createAlert(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const ident = exactlyOne(["assetId", "hostName"], input);
    const asset = await resolveAssetTarget(client, ident, ops);
    const message = requireString(input, "message");
    const mutationInput: Record<string, unknown> = { assetId: asset.id, message };
    const description = optionalString(input, "description");
    if (description) mutationInput.description = description;
    const severity = optionalString(input, "severity");
    if (severity) mutationInput.severity = severity;
    return runPlan(
      {
        toolName: name,
        mutationName: "createAlert",
        classification: "write_visible",
        action: "createAlert",
        target: asset,
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: { assetId: asset.id } },
        mutate: async () => {
          ops.push("createAlert");
          return asRecord(await rt.client.mutate(M.CREATE_ALERT, { input: mutationInput }));
        },
        verify: async (mutationResult) => {
          const created = asRecord(mutationResult.createAlert);
          const alertId = scalarId(created.id);
          if (!alertId) return { result: "partial", compared: {}, notes: "createAlert did not return id" };
          ops.push("getAlertsForAsset");
          const listed = asRecord(
            await client.query(Q.GET_ALERTS_FOR_ASSET, {
              input: { assetId: asset.id, listInfo: { page: 1, pageSize: 25 } },
            })
          );
          const alerts = asArray(asRecord(listed.getAlertsForAsset).alerts).map(asRecord);
          const found = alerts.some((item) => scalarId(item.id) === alertId);
          return { result: found ? "complete" : "partial", compared: { alertId: { matched: found } } };
        },
      },
      rt
    );
  }

  async function resolveAlerts(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const alertIds = asArray(input.alertIds).filter((item) => typeof item === "string" && item.trim()) as string[];
    if (!alertIds.length) throw new WriteValidationError("malformed_input", "alertIds is required");
    const assetId = optionalString(input, "assetId");
    const target: WriteTarget = { type: "alert", id: alertIds[0], label: alertIds.length === 1 ? alertIds[0] : `${alertIds.length} alerts` };
    return runPlan(
      {
        toolName: name,
        mutationName: "resolveAlerts",
        classification: "write_visible",
        action: "resolveAlerts",
        target,
        scopeContext: { target, alertIds, assetId },
        canonicalPayload: { alertIds, assetId },
        requestId: reqId,
        impact: "Resolved alerts leave active monitoring. An unresolved incident can become invisible.",
        reversibility: "Not automatically reversible. A new alert would have to be created.",
        logicalOperations: ops,
        preWrite: { captured: true, summary: { alertCount: alertIds.length, assetId } },
        mutate: async () => {
          ops.push("resolveAlerts");
          return asRecord(await rt.client.mutate(M.RESOLVE_ALERTS, { input: alertIds.map((id) => ({ id })) }));
        },
        verify: async (mutationResult) => {
          if (mutationResult.resolveAlerts !== true) {
            return { result: "failed", compared: { resolveAlerts: mutationResult.resolveAlerts } };
          }
          if (!assetId) {
            return {
              result: "partial",
              compared: { resolveAlerts: true },
              notes: "SuperOps returned true; asset-scoped re-read was not possible without assetId",
            };
          }
          ops.push("getAlertsForAsset");
          const listed = asRecord(
            await client.query(Q.GET_ALERTS_FOR_ASSET, {
              input: { assetId, listInfo: { page: 1, pageSize: 25 } },
            })
          );
          const alerts = asArray(asRecord(listed.getAlertsForAsset).alerts).map(asRecord);
          const stillOpen = alerts.filter(
            (item) => alertIds.includes(scalarId(item.id) ?? "") && String(item.status ?? "").toLowerCase() !== "resolved"
          );
          return {
            result: stillOpen.length ? "partial" : "complete",
            compared: { stillOpen: stillOpen.length },
          };
        },
      },
      rt
    );
  }

  async function updateClientUser(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    atLeastOne(input, ["firstName", "lastName", "contactNumber", "siteId", "roleId"]);
    const userId = requireString(input, "userId");
    const current = await loadClientUser(client, userId, ops);
    const mutationInput: Record<string, unknown> = { userId };
    const expected: Record<string, unknown> = {};
    for (const key of ["firstName", "lastName", "contactNumber"] as const) {
      const value = optionalString(input, key);
      if (value) {
        mutationInput[key] = value;
        expected[key] = value;
      }
    }
    const siteId = optionalString(input, "siteId");
    if (siteId) {
      mutationInput.site = { id: siteId };
      expected.siteId = siteId;
    }
    const roleId = optionalString(input, "roleId");
    if (roleId) {
      mutationInput.role = { roleId };
      expected.roleId = roleId;
    }
    return runPlan(
      {
        toolName: name,
        mutationName: "updateClientUser",
        classification: "write_visible",
        action: "updateClientUser",
        target: { type: "clientUser", id: userId },
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: userPreWriteSummary(current) },
        mutate: async () => {
          ops.push("updateClientUser");
          return asRecord(await rt.client.mutate(M.UPDATE_CLIENT_USER, { input: mutationInput }));
        },
        verify: async () => {
          const fresh = await loadClientUser(client, userId, ops);
          return verifyFields(fresh, expected, (row, key) => {
            if (key === "siteId") return asRecord(row.site).id;
            if (key === "roleId") return asRecord(row.role).roleId;
            return row[key];
          });
        },
      },
      rt
    );
  }

  async function updateClientUserAssociation(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const associationId = requireString(input, "associationId");
    const siteId = requireString(input, "siteId");
    const mutationInput = { id: associationId, site: { id: siteId } };
    return runPlan(
      {
        toolName: name,
        mutationName: "updateClientUserAssociations",
        classification: "write_visible",
        action: "updateClientUserAssociations",
        target: { type: "clientUserAssociation", id: associationId },
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: { associationId } },
        mutate: async () => {
          ops.push("updateClientUserAssociations");
          return asRecord(await rt.client.mutate(M.UPDATE_CLIENT_USER_ASSOCIATIONS, { input: [mutationInput] }));
        },
        verify: async (mutationResult) => {
          const rows = asArray(mutationResult.updateClientUserAssociations).map(asRecord);
          const updated = rows[0] ?? {};
          const got = scalarId(asRecord(updated.site).id);
          return {
            result: got === siteId ? "complete" : "partial",
            compared: { siteId: { matched: got === siteId } },
          };
        },
      },
      rt
    );
  }

  async function updateAsset(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    atLeastOne(input, ["newName", "accountId", "siteId", "requesterUserId", "warrantyExpiryDate", "purchasedDate"]);
    const ident = exactlyOne(["assetId", "hostName", "name", "serialNumber"], input);
    const target = await resolveAssetTarget(client, ident, ops);
    const current = await loadAsset(client, target.id, ops);
    const mutationInput: Record<string, unknown> = { assetId: target.id };
    const expected: Record<string, unknown> = {};
    const newName = optionalString(input, "newName");
    if (newName) {
      mutationInput.name = newName;
      expected.name = newName;
    }
    const accountId = optionalString(input, "accountId");
    if (accountId) {
      mutationInput.client = { accountId };
      expected.accountId = accountId;
    }
    const siteId = optionalString(input, "siteId");
    if (siteId) {
      mutationInput.site = { id: siteId };
      expected.siteId = siteId;
    }
    const requesterUserId = optionalString(input, "requesterUserId");
    if (requesterUserId) {
      mutationInput.requester = { userId: requesterUserId };
      expected.requesterUserId = requesterUserId;
    }
    const warrantyExpiryDate = optionalString(input, "warrantyExpiryDate");
    if (warrantyExpiryDate) mutationInput.warrantyExpiryDate = warrantyExpiryDate;
    const purchasedDate = optionalString(input, "purchasedDate");
    if (purchasedDate) mutationInput.purchasedDate = purchasedDate;
    return runPlan(
      {
        toolName: name,
        mutationName: "updateAsset",
        classification: "write_visible",
        action: "updateAsset",
        target,
        scopeContext: {
          target,
          assetId: target.id,
          clientAccountId: scalarId(asRecord(current.client).accountId),
          siteId: scalarId(asRecord(current.site).id),
        },
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: assetPreWriteSummary(current) },
        mutate: async () => {
          ops.push("updateAsset");
          return asRecord(await rt.client.mutate(M.UPDATE_ASSET, { input: mutationInput }));
        },
        verify: async () => {
          const fresh = await loadAsset(client, target.id, ops);
          return verifyFields(fresh, expected, (row, key) => {
            if (key === "accountId") return asRecord(row.client).accountId;
            if (key === "siteId") return asRecord(row.site).id;
            if (key === "requesterUserId") return asRecord(row.requester).userId;
            return row[key];
          });
        },
      },
      rt
    );
  }

  async function createTask(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const module = requireString(input, "module");
    const mutationInput: Record<string, unknown> = {
      title: requireString(input, "title"),
      status: requireString(input, "status"),
      module,
    };
    const description = optionalString(input, "description");
    if (description) mutationInput.description = description;
    let ticketTarget: WriteTarget | undefined;
    if (module === "TICKET") {
      ticketTarget = await resolveTicketTarget(client, requireString(input, "ticket"), ops);
      mutationInput.ticket = { ticketId: ticketTarget.id };
    }
    const technicianId = optionalString(input, "technicianId");
    if (technicianId) mutationInput.technician = { userId: technicianId };
    const techGroupId = optionalString(input, "techGroupId");
    if (techGroupId) mutationInput.techGroup = { groupId: techGroupId };
    if (typeof input.estimatedTime === "number") mutationInput.estimatedTime = input.estimatedTime;
    const scheduledStartDate = optionalString(input, "scheduledStartDate");
    if (scheduledStartDate) mutationInput.scheduledStartDate = scheduledStartDate;
    const dueDate = optionalString(input, "dueDate");
    if (dueDate) mutationInput.dueDate = dueDate;
    const target = ticketTarget ?? { type: "task", id: "new", label: String(mutationInput.title) };
    return runPlan(
      {
        toolName: name,
        mutationName: "createTask",
        classification: "write_low",
        action: "createTask",
        target,
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: Boolean(ticketTarget), summary: ticketTarget ? { ticketId: ticketTarget.id } : {} },
        mutate: async () => {
          ops.push("createTask");
          return asRecord(await rt.client.mutate(M.CREATE_TASK, { input: mutationInput }));
        },
        verify: async (mutationResult) => {
          const created = asRecord(mutationResult.createTask);
          const taskId = scalarId(created.taskId);
          if (!taskId) return { result: "partial", compared: {}, notes: "createTask did not return taskId" };
          ops.push("getTask");
          const fresh = asRecord(asRecord(await client.query(XQ.GET_TASK, { input: { taskId } })).getTask);
          return verifyFields(fresh, { title: mutationInput.title, status: mutationInput.status });
        },
      },
      rt
    );
  }

  async function createItDoc(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const typeId = requireString(input, "typeId");
    const docName = requireString(input, "name");
    const fields = await sanitizeItDocFields(client, typeId, asRecord(input.fields), ops);
    const mutationInput: Record<string, unknown> = { typeId, name: docName };
    const accountId = optionalString(input, "accountId");
    if (accountId) mutationInput.client = { accountId };
    const siteId = optionalString(input, "siteId");
    if (siteId) mutationInput.site = { id: siteId };
    if (fields) mutationInput.customFields = fields;
    return runPlan(
      {
        toolName: name,
        mutationName: "createItDocumentation",
        classification: "write_low",
        action: "createItDocumentation",
        target: { type: "itDoc", id: typeId, label: docName },
        canonicalPayload: { ...mutationInput, customFields: fields ? Object.keys(fields) : [] },
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: false, summary: {} },
        mutate: async () => {
          ops.push("createItDocumentation");
          return asRecord(await rt.client.mutate(M.CREATE_IT_DOCUMENTATION, { input: mutationInput }));
        },
        verify: async (mutationResult) => {
          const created = asRecord(mutationResult.createItDocumentation);
          const itDocId = scalarId(created.itDocId);
          if (!itDocId) return { result: "partial", compared: {}, notes: "itDocId missing" };
          const fresh = await loadItDoc(client, itDocId, ops);
          return verifyFields(fresh, { name: docName });
        },
      },
      rt
    );
  }

  async function updateItDoc(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    atLeastOne(input, ["name", "accountId", "siteId", "fields"]);
    const itDocId = requireString(input, "itDocId");
    const typeId = requireString(input, "typeId");
    await loadItDoc(client, itDocId, ops);
    const fields = await sanitizeItDocFields(client, typeId, asRecord(input.fields), ops);
    const mutationInput: Record<string, unknown> = { itDocId, typeId };
    const expected: Record<string, unknown> = {};
    const docName = optionalString(input, "name");
    if (docName) {
      mutationInput.name = docName;
      expected.name = docName;
    }
    const accountId = optionalString(input, "accountId");
    if (accountId) mutationInput.client = { accountId };
    const siteId = optionalString(input, "siteId");
    if (siteId) mutationInput.site = { id: siteId };
    if (fields) mutationInput.customFields = fields;
    return runPlan(
      {
        toolName: name,
        mutationName: "updateItDocumentation",
        classification: "write_low",
        action: "updateItDocumentation",
        target: { type: "itDoc", id: itDocId },
        canonicalPayload: { ...mutationInput, customFields: fields ? Object.keys(fields) : [] },
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: { itDocId, typeId } },
        mutate: async () => {
          ops.push("updateItDocumentation");
          return asRecord(await rt.client.mutate(M.UPDATE_IT_DOCUMENTATION, { input: mutationInput }));
        },
        verify: async () => {
          const fresh = await loadItDoc(client, itDocId, ops);
          return verifyFields(fresh, expected);
        },
      },
      rt
    );
  }

  async function createKbArticle(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const status = optionalString(input, "status") ?? "DRAFT";
    const visibility = (optionalString(input, "visibility") as "technicians" | "requesters" | undefined) ?? "technicians";
    const classification: ToolClassification =
      status === "PUBLISHED" || visibility === "requesters" ? "write_visible" : "write_low";
    const mutationInput = {
      name: requireString(input, "name"),
      parent: { itemId: requireString(input, "parentItemId") },
      status,
      content: requireString(input, "content"),
      visibility: kbVisibility(visibility),
      loginRequired: input.loginRequired === true,
    };
    return runPlan(
      {
        toolName: name,
        mutationName: "createKbArticle",
        classification,
        action: "createKbArticle",
        target: { type: "kbArticle", id: mutationInput.parent.itemId, label: mutationInput.name },
        canonicalPayload: { ...mutationInput, content: "[omitted]" },
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: false, summary: {} },
        mutate: async () => {
          ops.push("createKbArticle");
          return asRecord(await rt.client.mutate(M.CREATE_KB_ARTICLE, { input: mutationInput }));
        },
        verify: async (mutationResult) => {
          const created = asRecord(mutationResult.createKbArticle);
          const itemId = scalarId(created.itemId);
          if (!itemId) return { result: "partial", compared: {}, notes: "itemId missing" };
          const fresh = await loadKbItem(client, itemId, ops);
          return verifyFields(fresh, { name: mutationInput.name, status });
        },
      },
      rt
    );
  }

  async function createKbCollection(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const mutationInput: Record<string, unknown> = { name: requireString(input, "name") };
    const parentItemId = optionalString(input, "parentItemId");
    if (parentItemId) mutationInput.parent = { itemId: parentItemId };
    return runPlan(
      {
        toolName: name,
        mutationName: "createKbCollection",
        classification: "write_low",
        action: "createKbCollection",
        target: { type: "kbCollection", id: parentItemId ?? "root", label: String(mutationInput.name) },
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: false, summary: {} },
        mutate: async () => {
          ops.push("createKbCollection");
          return asRecord(await rt.client.mutate(M.CREATE_KB_COLLECTION, { input: mutationInput }));
        },
        verify: async (mutationResult) => {
          const created = asRecord(mutationResult.createKbCollection);
          const itemId = scalarId(created.itemId);
          if (!itemId) return { result: "partial", compared: {}, notes: "itemId missing" };
          const fresh = await loadKbItem(client, itemId, ops);
          return verifyFields(fresh, { name: mutationInput.name });
        },
      },
      rt
    );
  }

  async function updateKbCollection(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const itemId = requireString(input, "itemId");
    await loadKbItem(client, itemId, ops);
    const collectionName = requireString(input, "name");
    const mutationInput = { itemId, name: collectionName };
    return runPlan(
      {
        toolName: name,
        mutationName: "updateKbCollection",
        classification: "write_low",
        action: "updateKbCollection",
        target: { type: "kbCollection", id: itemId },
        canonicalPayload: mutationInput,
        requestId: reqId,
        logicalOperations: ops,
        preWrite: { captured: true, summary: { itemId } },
        mutate: async () => {
          ops.push("updateKbCollection");
          return asRecord(await rt.client.mutate(M.UPDATE_KB_COLLECTION, { input: mutationInput }));
        },
        verify: async () => {
          const fresh = await loadKbItem(client, itemId, ops);
          return verifyFields(fresh, { name: collectionName });
        },
      },
      rt
    );
  }

  async function runScript(
    input: Record<string, unknown>,
    rt: WriteRuntime,
    ops: string[],
    reqId?: string
  ): Promise<WriteExecutionResult> {
    const scriptId = requireString(input, "scriptId");
    const ident = exactlyOne(["assetId", "hostName", "name", "serialNumber"], input);
    const asset = await resolveAssetTarget(client, ident, ops);
    const meta = (await loadScriptMetadata(client, scriptId, ops)) ?? { scriptId };
    const classified = classifyScriptConsequence(meta, { raiseEnv: rt.config.scriptConsequenceRaise });
    const scriptArgs = asArray(input.arguments)
      .map((item) => asRecord(item))
      .filter((item) => typeof item.name === "string")
      .map((item) => ({ name: String(item.name), value: String(item.value ?? "") }));
    const mutationInput: Record<string, unknown> = { assetId: asset.id, scriptId };
    if (scriptArgs.length) mutationInput.scriptArguments = scriptArgs;
    const assetDetail = await loadAsset(client, asset.id, ops);
    const hostName = typeof assetDetail.hostName === "string" ? assetDetail.hostName : asset.label;
    return runPlan(
      {
        toolName: name,
        mutationName: "runScriptOnAsset",
        classification: classified.classification,
        classificationSource: classified.classifiedFrom,
        action: "runScriptOnAsset",
        target: { type: "asset", id: asset.id, label: hostName ?? asset.id },
        scopeContext: {
          target: { type: "asset", id: asset.id, label: hostName ?? asset.id },
          assetId: asset.id,
          clientAccountId: scalarId(asRecord(assetDetail.client).accountId),
        },
        canonicalPayload: { scriptId, assetId: asset.id, arguments: scriptArgs, paramDigest: scriptParamDigest(scriptId, asset.id, scriptArgs) },
        requestId: reqId,
        impact:
          classified.classification === "destructive"
            ? "May delete data or make unrecoverable changes on the endpoint."
            : classified.classification === "disruptive"
              ? "May interrupt users, services, or networking on the endpoint."
              : "Non-disruptive script execution on the endpoint.",
        reversibility: "Script execution is not automatically reversible.",
        logicalOperations: ops,
        preWrite: {
          captured: true,
          summary: { assetId: asset.id, scriptId, classification: classified.classification, unknown: classified.unknown },
        },
        mutate: async () => {
          ops.push("runScriptOnAsset");
          return asRecord(await rt.client.mutate(M.RUN_SCRIPT_ON_ASSET, { input: mutationInput }));
        },
        verify: async (mutationResult) => {
          const ran = asRecord(mutationResult.runScriptOnAsset);
          const actionConfigId = scalarId(ran.actionConfigId);
          return {
            result: actionConfigId ? "complete" : "partial",
            compared: { actionConfigId: { matched: Boolean(actionConfigId) } },
            notes: classified.reason,
          };
        },
      },
      rt
    );
  }
}
