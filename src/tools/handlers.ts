import { buildCommit } from "../build-info.js";
import type { AppConfig } from "../config.js";
import { PRODUCT_PHASE, PRODUCT_VERSION } from "../version.js";
import { registeredToolNames, registeredWriteNames } from "../capabilities.js";
import type { SuperOpsClient } from "../superops/client.js";
import { clampPageSize } from "../superops/limiter.js";
import { normalizeListPagination } from "../superops/pagination.js";
import * as Q from "../superops/queries.js";
import { auditErrorSummary, toClientSafeError } from "../privacy/errors.js";
import { attachmentMetadata, sanitizeTicketText } from "../privacy/redact.js";
import { sanitizeErrorText, sanitizeOutput } from "../privacy/safe-output.js";
import { investigateAsset } from "../assets/investigate-asset.js";
import { investigateClient } from "../clients/investigate-client.js";
import { investigationAuditFromResult } from "../investigate/audit.js";
import { searchAlerts } from "../search/alerts-search.js";
import { searchAssets } from "../search/assets-search.js";
import { getSite, listSites, searchSites } from "../search/sites.js";
import { searchTickets } from "../search/tickets-search.js";
import { investigateTicket } from "../tickets/investigate-ticket.js";
import { omitStructuredEmail } from "../investigate/common.js";
import { handleExpandedRead } from "../reads/expanded.js";
import type { ToolOutcome } from "../audit.js";
import { handleWriteTool } from "../writes/operations.js";
import { AuthorizationRequiredError, WriteValidationError } from "../writes/errors.js";
import type { WriteMcpContext, WriteExecutionResult } from "../writes/types.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  auditDetail?: string;
  audit?: {
    outcome: ToolOutcome;
    errorCode?: string;
    metadata?: Record<string, unknown>;
  };
}

export function jsonResult(payload: unknown, audit?: ToolResult["audit"]): ToolResult {
  const sanitized = sanitizeOutput(normalizeListPagination(payload));
  return { content: [{ type: "text", text: JSON.stringify(sanitized.payload, null, 2) }], audit };
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

function writeAuditFromResult(result: WriteExecutionResult): ToolResult["audit"] {
  if (result.outcome === "failed" && "code" in result && !("mutation" in result)) {
    return {
      outcome: "failed",
      errorCode: result.code,
      metadata: {
        logicalOperations: result.logicalOperations,
        targetType: result.target?.type,
        targetIdPresent: Boolean(result.target?.id),
        authorizationRequired: result.classification === "disruptive" || result.classification === "destructive",
        upstreamFailureCategory: result.upstreamFailureCategory,
      },
    };
  }
  const success = result as Extract<WriteExecutionResult, { mutation: string }>;
  return {
    outcome: success.outcome,
    metadata: {
      logicalOperations: success.logicalOperations,
      mutationName: success.mutation,
      targetType: success.target.type,
      targetIdPresent: Boolean(success.target.id),
      authorizationRequired: success.authorization.required,
      authorizationResult: success.authorization.result,
      verificationResult: success.verification.result,
      idempotentReplay: success.idempotentReplay === true,
      writeOutcome: success.outcome,
    },
  };
}

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  client: SuperOpsClient,
  config: AppConfig,
  ctx?: WriteMcpContext
): Promise<ToolResult> {
  try {
    switch (name) {
      case "rpmc_status": {
        const writeNames = registeredWriteNames({ writesEnabled: config.writesEnabled });
        return jsonResult({
          product: "rpmc-superops-mcp",
          version: PRODUCT_VERSION,
          phase: PRODUCT_PHASE,
          readonly: writeNames.length === 0,
          writesRegistered: writeNames.length > 0,
          writesEnabled: config.writesEnabled,
          readToolCount: registeredToolNames({ writesEnabled: false }).length,
          writeToolCount: writeNames.length,
          writeTools: writeNames,
          confirmation: {
            mechanism: "mcp_elicitation",
            requiredFor: ["disruptive", "destructive"],
            modelControlledBypass: false,
          },
          commit: buildCommit(),
          region: config.superopsRegion,
          subdomainConfigured: Boolean(config.superopsSubdomain),
          transport: config.transport,
        });
      }
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
        const data = asRecord(await client.query(Q.GET_ALERT_LIST, { input: pageInput(args) }));
        const list = asRecord(data.getAlertList);
        const alerts = Array.isArray(list.alerts) ? list.alerts.map(omitStructuredEmail) : [];
        return jsonResult({ getAlertList: { ...list, alerts } });
      }
      case "superops_technicians_list": {
        return jsonResult(await client.query(Q.GET_TECHNICIAN_LIST, { input: pageInput(args) }));
      }
      case "superops_technicians_groups": {
        return jsonResult(await client.query(Q.GET_TECHNICIAN_GROUP_LIST));
      }
      case "investigate_ticket": {
        const payload = await investigateTicket(args, client);
        return jsonResult(payload, investigationAuditFromResult(payload));
      }
      case "investigate_asset": {
        const payload = await investigateAsset(args, client);
        return jsonResult(payload, investigationAuditFromResult(payload));
      }
      case "investigate_client": {
        const payload = await investigateClient(args, client);
        return jsonResult(payload, investigationAuditFromResult(payload));
      }
      case "superops_tickets_search": {
        const payload = await searchTickets(args, client);
        return jsonResult(payload, investigationAuditFromResult(payload));
      }
      case "superops_assets_search": {
        const payload = await searchAssets(args, client);
        return jsonResult(payload, investigationAuditFromResult(payload));
      }
      case "superops_alerts_search": {
        const payload = await searchAlerts(args, client);
        return jsonResult(payload, investigationAuditFromResult(payload));
      }
      case "superops_sites_list": {
        return jsonResult(await listSites(args, client));
      }
      case "superops_sites_get": {
        const payload = await getSite(args, client);
        return jsonResult(payload, investigationAuditFromResult(payload));
      }
      case "superops_sites_search": {
        const payload = await searchSites(args, client);
        return jsonResult(payload, investigationAuditFromResult(payload));
      }
      default: {
        if (config.writesEnabled && registeredWriteNames({ writesEnabled: true }).includes(name)) {
          try {
            const written = await handleWriteTool(name, args, { client, config, ctx });
            if (written.outcome === "failed" && "code" in written && !("mutation" in written)) {
              return {
                ...errorResult(written.message),
                auditDetail: written.code,
                audit: writeAuditFromResult(written),
              };
            }
            return jsonResult(written, writeAuditFromResult(written));
          } catch (error) {
            if (error instanceof WriteValidationError) {
              return { ...errorResult(error.message), auditDetail: error.code };
            }
            throw error;
          }
        }
        const expanded = await handleExpandedRead(name, args, client);
        if (expanded) return jsonResult(expanded, investigationAuditFromResult(expanded));
        return errorResult(`Unknown or unregistered tool: ${name}`);
      }
    }
  } catch (error) {
    if (error instanceof AuthorizationRequiredError) throw error;
    const clientMessage = toClientSafeError(error);
    return {
      ...errorResult(clientMessage),
      auditDetail: auditErrorSummary(error, clientMessage),
    };
  }
}
