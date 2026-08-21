import type { AppConfig } from "../config.js";
import type { SuperOpsClient } from "../superops/client.js";
import { clampPageSize } from "../superops/limiter.js";
import * as Q from "../superops/queries.js";
import { attachmentMetadata, sanitizeTicketText } from "../privacy/redact.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function jsonResult(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
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
          version: "0.1.0",
          phase: 1,
          readonly: true,
          writesRegistered: false,
          region: config.superopsRegion,
          subdomainConfigured: Boolean(config.superopsSubdomain),
          transport: config.transport,
        });
      case "superops_test_connection": {
        await client.query(Q.GET_CLIENT_LIST, { input: { page: 1, pageSize: 1 } });
        return jsonResult({ ok: true, region: config.superopsRegion });
      }
      case "superops_clients_list": {
        const data = await client.query(Q.GET_CLIENT_LIST, { input: pageInput(args) });
        return jsonResult(data);
      }
      case "superops_clients_get": {
        const accountId = String(args.accountId ?? "");
        if (!accountId) return errorResult("accountId is required");
        const data = await client.query(Q.GET_CLIENT, { input: { accountId } });
        return jsonResult(data);
      }
      case "superops_tickets_list": {
        const input: Record<string, unknown> = pageInput(args);
        if (typeof args.status === "string" && args.status.trim()) {
          input.condition = { attribute: "status", operator: "is", value: args.status.trim() };
        }
        const data = await client.query(Q.GET_TICKET_LIST, { input });
        return jsonResult(data);
      }
      case "superops_tickets_get": {
        const ticketId = String(args.ticketId ?? "");
        if (!ticketId) return errorResult("ticketId is required");
        const data = await client.query(Q.GET_TICKET, { input: { ticketId } });
        return jsonResult({
          ticket: data,
          notes: {
            descriptionField: "not queried; use superops_tickets_conversations for DESCRIPTION items",
            assetCorrelation: "not queried in Phase 1; requires live tenant validation",
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
      default:
        return errorResult(`Unknown or unregistered tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(message);
  }
}
