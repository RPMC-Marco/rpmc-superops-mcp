import { buildCommit } from "../build-info.js";
import type { AppConfig } from "../config.js";
import type { SuperOpsClient } from "../superops/client.js";
import { clampPageSize } from "../superops/limiter.js";
import { normalizeListPagination } from "../superops/pagination.js";
import * as Q from "../superops/queries.js";
import { auditErrorSummary, toClientSafeError } from "../privacy/errors.js";
import { attachmentMetadata, sanitizeTicketText } from "../privacy/redact.js";
import { sanitizeErrorText, sanitizeOutput } from "../privacy/safe-output.js";
import { investigateTicket } from "../tickets/investigate-ticket.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  auditDetail?: string;
}

export function jsonResult(payload: unknown): ToolResult {
  const sanitized = sanitizeOutput(normalizeListPagination(payload));
  return { content: [{ type: "text", text: JSON.stringify(sanitized.payload, null, 2) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${sanitizeErrorText(message)}` }], isError: true };
}

function pageInput(args: Record<string, unknown>, defaultSize = 25) {
  const page = typeof args.page === "number" && args.page >= 1 ? Math.floor(args.page) : 1;
  return { page, pageSize: clampPageSize(typeof args.pageSize === "number" ? args.pageSize : defaultSize) };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  client: SuperOpsClient,
  config: AppConfig
): Promise<ToolResult> {
  try {
    switch (name) {
      case "rpmc_status":
        return jsonResult({
          product: "rpmc-superops-mcp",
          version: "0.1.3",
          phase: 1,
          readonly: true,
          writesRegistered: false,
          commit: buildCommit(),
          region: config.superopsRegion,
          subdomainConfigured: Boolean(config.superopsSubdomain),
          transport: config.transport,
        });
      case "superops_test_connection": {
        await client.query(Q.GET_CLIENT_LIST, { input: { page: 1, pageSize: 1 } });
        return jsonResult({ ok: true, region: config.superopsRegion });
      }
      case "superops_clients_list": {
        return jsonResult(await client.query(Q.GET_CLIENT_LIST, { input: pageInput(args) }));
      }
      case "superops_clients_get": {
        const accountId = String(args.accountId ?? "");
        if (!accountId) return errorResult("accountId is required");
        return jsonResult(await client.query(Q.GET_CLIENT, { input: { accountId } }));
      }
      case "superops_tickets_list": {
        return jsonResult(await client.query(Q.GET_TICKET_LIST, { input: pageInput(args) }));
      }
      case "superops_tickets_get": {
        const ticketId = String(args.ticketId ?? "");
        if (!ticketId) return errorResult("ticketId is required");
        const data = asRecord(await client.query(Q.GET_TICKET, { input: { ticketId } }));
        const ticket = asRecord(data.getTicket ?? data);
        return jsonResult({
          ticket,
          notes: {
            descriptionField:
              "not queried; original body is conversation type DESCRIPTION (RPMC live-confirmed)",
            assetCorrelation:
              "Ticket has no confirmed asset association; Alert.asset.assetId is the live alert-to-asset link",
          },
        });
      }
      case "superops_tickets_conversations": {
        const ticketId = String(args.ticketId ?? "");
        if (!ticketId) return errorResult("ticketId is required");
        const data = asRecord(await client.query(Q.GET_TICKET_CONVERSATION_LIST, { input: { ticketId } }));
        const items = Array.isArray(data.getTicketConversationList) ? data.getTicketConversationList : [];
        const conversations = items.map((item) => {
          const rec = asRecord(item);
          const sanitized = sanitizeTicketText(rec.content);
          return {
            conversationId: rec.conversationId,
            time: rec.time,
            user: rec.user,
            type: rec.type,
            possibleOriginalBody: String(rec.type ?? "").toUpperCase() === "DESCRIPTION",
            content: sanitized.text,
            redaction: {
              truncated: sanitized.truncated,
              htmlStripped: sanitized.htmlStripped,
              credentialsRedacted: sanitized.credentialsRedacted,
            },
            attachments: attachmentMetadata(rec.attachments),
          };
        });
        return jsonResult({ ticketId, conversations });
      }
      case "superops_tickets_notes": {
        const ticketId = String(args.ticketId ?? "");
        if (!ticketId) return errorResult("ticketId is required");
        const data = asRecord(await client.query(Q.GET_TICKET_NOTE_LIST, { input: { ticketId } }));
        const items = Array.isArray(data.getTicketNoteList) ? data.getTicketNoteList : [];
        const notes = items.map((item) => {
          const rec = asRecord(item);
          const sanitized = sanitizeTicketText(rec.content);
          return {
            noteId: rec.noteId,
            addedBy: rec.addedBy,
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
        });
        return jsonResult({ ticketId, notes });
      }
      case "superops_assets_list": {
        return jsonResult(await client.query(Q.GET_ASSET_LIST, { input: pageInput(args) }));
      }
      case "superops_assets_get": {
        const assetId = String(args.assetId ?? "");
        if (!assetId) return errorResult("assetId is required");
        return jsonResult(await client.query(Q.GET_ASSET, { input: { assetId } }));
      }
      case "superops_assets_software": {
        const assetId = String(args.assetId ?? "");
        if (!assetId) return errorResult("assetId is required");
        return jsonResult(
          await client.query(Q.GET_ASSET_SOFTWARE_LIST, {
            input: { assetId, listInfo: pageInput(args, 100) },
          })
        );
      }
      case "superops_assets_patches": {
        const assetId = String(args.assetId ?? "");
        if (!assetId) return errorResult("assetId is required");
        return jsonResult(
          await client.query(Q.GET_ASSET_PATCH_DETAILS, {
            input: { assetId, listInfo: pageInput(args, 100) },
          })
        );
      }
      case "superops_alerts_list": {
        return jsonResult(await client.query(Q.GET_ALERT_LIST, { input: pageInput(args) }));
      }
      case "superops_technicians_list": {
        return jsonResult(await client.query(Q.GET_TECHNICIAN_LIST, { input: pageInput(args) }));
      }
      case "superops_technicians_groups": {
        return jsonResult(await client.query(Q.GET_TECHNICIAN_GROUP_LIST));
      }
      case "investigate_ticket": {
        return jsonResult(await investigateTicket(args, client));
      }
      default:
        return errorResult(`Unknown or unregistered tool: ${name}`);
    }
  } catch (error) {
    const clientMessage = toClientSafeError(error);
    return {
      ...errorResult(clientMessage),
      auditDetail: auditErrorSummary(error, clientMessage),
    };
  }
}
