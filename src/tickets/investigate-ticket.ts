import type { SuperOpsClient } from "../superops/client.js";
import { SuperOpsMalformedResponseError } from "../superops/errors.js";
import * as Q from "../superops/queries.js";
import { toClientSafeError } from "../privacy/errors.js";
import { attachmentMetadata, sanitizeTicketText } from "../privacy/redact.js";
import { boundPatches, boundSoftware, PATCH_PAGE_SIZE, SOFTWARE_PAGE_SIZE } from "../investigate/bounds.js";
import {
  asArray,
  asRecord,
  accountIdFrom,
  failureCode,
  isFilterConditionRejected,
  noticeFromError,
  omitRequesterEmail,
  omitStructuredEmail,
  timeMs,
  upstreamFailureCategory,
  type InvestigateNotice,
  type InvestigateStatus,
} from "../investigate/common.js";
import { classifyTicketRef } from "./ticket-ref.js";

export const DISPLAY_ID_LOOKUP_PAGE_SIZE = 5;
export const CONVERSATION_ITEM_LIMIT = 24;
export const NOTE_ITEM_LIMIT = 25;
export { SOFTWARE_PAGE_SIZE, PATCH_PAGE_SIZE, PATCH_NON_INSTALLED_LIMIT } from "../investigate/bounds.js";

export type { InvestigateStatus };
export type ResolutionMethod =
  | "displayId_condition_is"
  | "displayId_condition_includes"
  | "ticketId_direct"
  | "unresolved";

export type { InvestigateNotice };

export interface InvestigateTicketArgs {
  ticket?: unknown;
  assetId?: unknown;
}

interface SectionState {
  ticket: "ok" | "failed";
  originalBody: "present" | "missing" | "failed";
  conversations: "ok" | "failed" | "truncated";
  notes: "ok" | "failed" | "truncated";
  asset: "not_requested" | "ok" | "failed";
  software: "not_requested" | "ok" | "failed" | "truncated";
  patches: "not_requested" | "ok" | "failed" | "truncated";
  alerts: "not_requested" | "unavailable";
}

function sanitizeConversationItem(item: unknown) {
  const rec = asRecord(item);
  const sanitized = sanitizeTicketText(rec.content);
  return {
    conversationId: rec.conversationId,
    time: rec.time,
    user: omitStructuredEmail(rec.user),
    type: rec.type,
    content: sanitized.text,
    redaction: {
      truncated: sanitized.truncated,
      htmlStripped: sanitized.htmlStripped,
      credentialsRedacted: sanitized.credentialsRedacted,
    },
    attachments: attachmentMetadata(rec.attachments),
  };
}

function sanitizeNoteItem(item: unknown) {
  const rec = asRecord(item);
  const sanitized = sanitizeTicketText(rec.content);
  return {
    noteId: rec.noteId,
    addedBy: omitStructuredEmail(rec.addedBy),
    addedOn: rec.addedOn,
    privacyType: rec.privacyType,
    content: sanitized.text,
    redaction: {
      truncated: sanitized.truncated,
      htmlStripped: sanitized.htmlStripped,
      credentialsRedacted: sanitized.credentialsRedacted,
    },
    attachments: attachmentMetadata(rec.attachments),
  };
}

function isDescription(item: { type?: unknown }): boolean {
  return String(item.type ?? "").toUpperCase() === "DESCRIPTION";
}

function failedResult(input: {
  suppliedTicket: string;
  suppliedAssetId?: string;
  classifiedAs: string;
  code: string;
  message: string;
  resolution: ResolutionMethod;
  logicalOperations: string[];
  errors?: InvestigateNotice[];
  warnings?: InvestigateNotice[];
  candidates?: Array<{ ticketId?: unknown; displayId?: unknown }>;
  upstreamFailureCategory?: string;
}): Record<string, unknown> {
  return {
    status: "failed" as InvestigateStatus,
    code: input.code,
    message: input.message,
    warnings: input.warnings ?? [],
    errors: input.errors ?? [{ code: input.code, message: input.message }],
    candidates: input.candidates,
    provenance: {
      supplied: { ticket: input.suppliedTicket, assetId: input.suppliedAssetId },
      classifiedAs: input.classifiedAs,
      resolution: input.resolution,
      ticketId: null,
      displayId: input.classifiedAs === "displayId" ? input.suppliedTicket : null,
      sections: {
        ticket: "failed",
        originalBody: "failed",
        conversations: "failed",
        notes: "failed",
        asset: input.suppliedAssetId ? "failed" : "not_requested",
        software: input.suppliedAssetId ? "failed" : "not_requested",
        patches: input.suppliedAssetId ? "failed" : "not_requested",
        alerts: input.suppliedAssetId ? "unavailable" : "not_requested",
      },
      truncated: {},
      logicalOperations: input.logicalOperations,
      upstreamFailureCategory: input.upstreamFailureCategory ?? input.code,
    },
  };
}

export async function resolveDisplayId(
  client: SuperOpsClient,
  displayId: string,
  operations: string[]
): Promise<
  | { ok: true; ticketId: string; displayId: string; method: ResolutionMethod }
  | { ok: false; code: string; message: string; method: ResolutionMethod; candidates?: Array<Record<string, unknown>>; upstreamFailureCategory?: string }
> {
  const tryList = async (operator: "is" | "includes", value: unknown) => {
    operations.push("getTicketList");
    return asRecord(
      await client.query(Q.GET_TICKET_LIST, {
        input: {
          page: 1,
          pageSize: DISPLAY_ID_LOOKUP_PAGE_SIZE,
          condition: { attribute: "displayId", operator, value },
        },
      })
    );
  };

  let listData: Record<string, unknown>;
  let method: ResolutionMethod = "displayId_condition_is";
  try {
    listData = await tryList("is", displayId);
  } catch (error) {
    if (!isFilterConditionRejected(error)) {
      return {
        ok: false,
        code: failureCode(error),
        message: toClientSafeError(error),
        method: "unresolved",
        upstreamFailureCategory: upstreamFailureCategory(error),
      };
    }
    try {
      method = "displayId_condition_includes";
      listData = await tryList("includes", [displayId]);
    } catch (fallbackError) {
      return {
        ok: false,
        code: "resolution_unavailable",
        message: toClientSafeError(fallbackError),
        method: "unresolved",
        upstreamFailureCategory: upstreamFailureCategory(fallbackError),
      };
    }
  }

  const payload = asRecord(listData.getTicketList);
  const tickets = asArray(payload.tickets).map(asRecord);
  const exact = tickets.filter((ticket) => ticket.displayId === displayId);
  if (exact.length === 0) {
    return { ok: false, code: "not_found", message: "No ticket matched the displayId", method };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      code: "ambiguous_ticket",
      message: "Multiple tickets matched the displayId",
      method,
      candidates: exact.map((ticket) => ({ ticketId: ticket.ticketId, displayId: ticket.displayId })),
    };
  }
  const ticketId = exact[0]?.ticketId;
  if (typeof ticketId !== "string" || !ticketId) {
    return { ok: false, code: "lookup_failed", message: "Matched ticket did not include ticketId", method };
  }
  return { ok: true, ticketId, displayId, method };
}

async function loadTicket(client: SuperOpsClient, ticketId: string, operations: string[]) {
  operations.push("getTicket");
  const data = asRecord(await client.query(Q.GET_TICKET, { input: { ticketId } }));
  const ticket = asRecord(data.getTicket ?? data);
  if (typeof ticket.ticketId !== "string" || !ticket.ticketId) {
    throw new SuperOpsMalformedResponseError("getTicket returned no ticketId");
  }
  return ticket;
}

function boundConversations(rawItems: unknown[]): {
  originalBody: ReturnType<typeof sanitizeConversationItem> | null;
  items: ReturnType<typeof sanitizeConversationItem>[];
  truncated: boolean;
  totalCount: number;
  warnings: InvestigateNotice[];
} {
  const sanitized = rawItems.map(sanitizeConversationItem);
  const descriptions = sanitized
    .filter((item) => isDescription(item))
    .slice()
    .sort((a, b) => timeMs(a.time) - timeMs(b.time));
  const warnings: InvestigateNotice[] = [];
  const originalBody = descriptions[0] ?? null;
  if (descriptions.length === 0) {
    warnings.push({ code: "original_body_missing", message: "No DESCRIPTION conversation was returned" });
  } else if (descriptions.length > 1) {
    warnings.push({
      code: "multiple_description",
      message: "Multiple DESCRIPTION conversations were present; the earliest by time was selected as originalBody",
    });
  }

  const rest = sanitized.filter((item) => {
    if (!originalBody) return true;
    if (originalBody.conversationId != null && item.conversationId != null) {
      return item.conversationId !== originalBody.conversationId;
    }
    return item !== originalBody;
  });
  const newestFirst = rest.slice().sort((a, b) => timeMs(b.time) - timeMs(a.time));
  const truncated = newestFirst.length > CONVERSATION_ITEM_LIMIT;
  const kept = newestFirst.slice(0, CONVERSATION_ITEM_LIMIT).sort((a, b) => timeMs(a.time) - timeMs(b.time));
  return {
    originalBody,
    items: kept,
    truncated,
    totalCount: rest.length,
    warnings,
  };
}

function boundNotes(rawItems: unknown[]): {
  items: ReturnType<typeof sanitizeNoteItem>[];
  truncated: boolean;
  totalCount: number;
} {
  const sanitized = rawItems.map(sanitizeNoteItem);
  const newestFirst = sanitized.slice().sort((a, b) => timeMs(b.addedOn) - timeMs(a.addedOn));
  const truncated = newestFirst.length > NOTE_ITEM_LIMIT;
  return { items: newestFirst.slice(0, NOTE_ITEM_LIMIT), truncated, totalCount: sanitized.length };
}

export async function investigateTicket(
  args: InvestigateTicketArgs,
  client: SuperOpsClient
): Promise<Record<string, unknown>> {
  const classified = classifyTicketRef(args.ticket);
  const suppliedAssetId = typeof args.assetId === "string" ? args.assetId.trim() : "";
  const assetRequested = Boolean(suppliedAssetId);
  const logicalOperations: string[] = [];
  const warnings: InvestigateNotice[] = [];
  const errors: InvestigateNotice[] = [];
  const sections: SectionState = {
    ticket: "failed",
    originalBody: "failed",
    conversations: "failed",
    notes: "failed",
    asset: assetRequested ? "failed" : "not_requested",
    software: assetRequested ? "failed" : "not_requested",
    patches: assetRequested ? "failed" : "not_requested",
    alerts: assetRequested ? "unavailable" : "not_requested",
  };

  if (classified.kind === "malformed") {
    return failedResult({
      suppliedTicket: typeof args.ticket === "string" ? args.ticket : "",
      suppliedAssetId: assetRequested ? suppliedAssetId : undefined,
      classifiedAs: "malformed",
      code: "malformed_ticket",
      message: "ticket must be an RPMC displayId (DDMMYY-NNNN) or a SuperOps ticketId",
      resolution: "unresolved",
      logicalOperations,
    });
  }

  let ticketId = classified.value;
  let displayId: string | null = classified.kind === "displayId" ? classified.value : null;
  let resolution: ResolutionMethod = classified.kind === "ticketId" ? "ticketId_direct" : "unresolved";

  if (classified.kind === "displayId") {
    const resolved = await resolveDisplayId(client, classified.value, logicalOperations);
    if (!resolved.ok) {
      return failedResult({
        suppliedTicket: classified.value,
        suppliedAssetId: assetRequested ? suppliedAssetId : undefined,
        classifiedAs: "displayId",
        code: resolved.code,
        message: resolved.message,
        resolution: resolved.method,
        logicalOperations,
        candidates: resolved.candidates,
        upstreamFailureCategory: resolved.upstreamFailureCategory ?? resolved.code,
      });
    }
    ticketId = resolved.ticketId;
    displayId = resolved.displayId;
    resolution = resolved.method;
  }

  let ticket: Record<string, unknown>;
  try {
    ticket = await loadTicket(client, ticketId, logicalOperations);
  } catch (error) {
    return failedResult({
      suppliedTicket: classified.value,
      suppliedAssetId: assetRequested ? suppliedAssetId : undefined,
      classifiedAs: classified.kind,
      code: failureCode(error),
      message: toClientSafeError(error),
      resolution,
      logicalOperations,
      upstreamFailureCategory: upstreamFailureCategory(error),
    });
  }
  sections.ticket = "ok";
  if (typeof ticket.displayId === "string") displayId = ticket.displayId;
  if (typeof ticket.ticketId === "string") ticketId = ticket.ticketId;

  let originalBody: ReturnType<typeof sanitizeConversationItem> | null = null;
  let conversations: {
    items: ReturnType<typeof sanitizeConversationItem>[];
    returned: number;
    totalCount: number;
    truncated: boolean;
    limit: number;
  } = { items: [], returned: 0, totalCount: 0, truncated: false, limit: CONVERSATION_ITEM_LIMIT };

  try {
    logicalOperations.push("getTicketConversationList");
    const data = asRecord(await client.query(Q.GET_TICKET_CONVERSATION_LIST, { input: { ticketId } }));
    const bounded = boundConversations(asArray(data.getTicketConversationList));
    originalBody = bounded.originalBody;
    conversations = {
      items: bounded.items,
      returned: bounded.items.length,
      totalCount: bounded.totalCount,
      truncated: bounded.truncated,
      limit: CONVERSATION_ITEM_LIMIT,
    };
    sections.conversations = bounded.truncated ? "truncated" : "ok";
    sections.originalBody = originalBody ? "present" : "missing";
    warnings.push(...bounded.warnings);
  } catch (error) {
    sections.conversations = "failed";
    sections.originalBody = "failed";
    errors.push(noticeFromError("conversations_unavailable", error));
  }

  let notes: {
    items: ReturnType<typeof sanitizeNoteItem>[];
    returned: number;
    totalCount: number;
    truncated: boolean;
    limit: number;
  } = { items: [], returned: 0, totalCount: 0, truncated: false, limit: NOTE_ITEM_LIMIT };

  try {
    logicalOperations.push("getTicketNoteList");
    const data = asRecord(await client.query(Q.GET_TICKET_NOTE_LIST, { input: { ticketId } }));
    const bounded = boundNotes(asArray(data.getTicketNoteList));
    notes = {
      items: bounded.items,
      returned: bounded.items.length,
      totalCount: bounded.totalCount,
      truncated: bounded.truncated,
      limit: NOTE_ITEM_LIMIT,
    };
    sections.notes = bounded.truncated ? "truncated" : "ok";
  } catch (error) {
    sections.notes = "failed";
    errors.push(noticeFromError("notes_unavailable", error));
  }

  let asset: Record<string, unknown> = {
    status: assetRequested ? "unavailable" : "not_requested",
    assetId: assetRequested ? suppliedAssetId : null,
    detail: null,
    software: null,
    patches: null,
    alerts: assetRequested
      ? { status: "unavailable", reason: "asset_alert_filter_not_used_from_investigate_ticket" }
      : { status: "not_requested" },
  };

  if (assetRequested) {
    try {
      logicalOperations.push("getAsset");
      const data = asRecord(await client.query(Q.GET_ASSET, { input: { assetId: suppliedAssetId } }));
      const detail = omitRequesterEmail(asRecord(data.getAsset ?? data));
      if (typeof detail.assetId !== "string" || !detail.assetId) {
        throw new SuperOpsMalformedResponseError("getAsset returned no assetId");
      }
      sections.asset = "ok";
      const ticketClient = accountIdFrom(ticket.client);
      const assetClient = accountIdFrom(detail.client);
      if (ticketClient && assetClient && ticketClient !== assetClient) {
        warnings.push({
          code: "asset_client_mismatch",
          message: "Ticket client and asset client accountId values differ",
        });
      }
      asset = {
        ...asset,
        status: "ok",
        assetId: detail.assetId,
        detail,
      };
    } catch (error) {
      sections.asset = "failed";
      errors.push(noticeFromError("asset_lookup_failed", error));
      asset = {
        ...asset,
        status: "lookup_failed",
      };
    }

    if (sections.asset === "ok") {
      try {
        logicalOperations.push("getAssetSoftwareList");
        const data = asRecord(
          await client.query(Q.GET_ASSET_SOFTWARE_LIST, {
            input: { assetId: suppliedAssetId, listInfo: { page: 1, pageSize: SOFTWARE_PAGE_SIZE } },
          })
        );
        const software = boundSoftware(data);
        sections.software = software.truncated ? "truncated" : "ok";
        asset = { ...asset, software };
      } catch (error) {
        sections.software = "failed";
        errors.push(noticeFromError("software_unavailable", error));
      }

      try {
        logicalOperations.push("getAssetPatchDetails");
        const data = asRecord(
          await client.query(Q.GET_ASSET_PATCH_DETAILS, {
            input: { assetId: suppliedAssetId, listInfo: { page: 1, pageSize: PATCH_PAGE_SIZE } },
          })
        );
        const patches = boundPatches(data);
        sections.patches = patches.truncated ? "truncated" : "ok";
        asset = { ...asset, patches };
      } catch (error) {
        sections.patches = "failed";
        errors.push(noticeFromError("patches_unavailable", error));
      }
    }
  }

  const supportingFailed = [sections.conversations, sections.notes, sections.asset, sections.software, sections.patches].some(
    (section) => section === "failed"
  );
  const status: InvestigateStatus = supportingFailed ? "partial" : "complete";

  return {
    status,
    ticket,
    originalBody,
    conversations,
    notes,
    asset,
    warnings,
    errors,
    provenance: {
      supplied: { ticket: classified.value, assetId: assetRequested ? suppliedAssetId : undefined },
      classifiedAs: classified.kind,
      resolution,
      ticketId,
      displayId,
      sections,
      truncated: {
        conversations: conversations.truncated,
        notes: notes.truncated,
        software: sections.software === "truncated",
        patches: sections.patches === "truncated",
      },
      logicalOperations,
    },
  };
}
