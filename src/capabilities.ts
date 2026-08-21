import { z } from "zod";
import type { ToolClassification } from "./audit.js";

export type OperationKind = "query" | "mutation" | "local";

const emptyInput = z.object({});
const pageInput = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

export interface Capability {
  name: string;
  description: string;
  classification: ToolClassification;
  operationKind: OperationKind;
  phase1Registered: boolean;
  inputSchema: z.ZodObject<z.ZodRawShape>;
}

export const CAPABILITIES: Capability[] = [
  {
    name: "rpmc_status",
    description:
      "Show RPMC MCP status: read-only mode, region, build commit if injected, and whether SuperOps env credentials are configured. Does not return secrets.",
    classification: "read",
    operationKind: "local",
    phase1Registered: true,
    inputSchema: emptyInput,
  },
  {
    name: "superops_test_connection",
    description: "Read-only SuperOps connectivity check (fetches one client page).",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: emptyInput,
  },
  {
    name: "superops_clients_list",
    description: "List SuperOps clients (accounts). Association fields are returned as SuperOps JSON scalars.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: pageInput,
  },
  {
    name: "superops_clients_get",
    description: "Get one SuperOps client by accountId.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({ accountId: z.string() }),
  },
  {
    name: "superops_tickets_list",
    description:
      "List SuperOps tickets. Does not include ticket body, notes, or conversations. Status filtering is omitted until RPMC live validation confirms the operator.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: pageInput,
  },
  {
    name: "superops_tickets_get",
    description:
      "Get ticket metadata by ticketId. Does not query Ticket.description. Use conversations/notes tools for body evidence.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({ ticketId: z.string() }),
  },
  {
    name: "superops_tickets_conversations",
    description:
      "List sanitized ticket conversations, including DESCRIPTION items when SuperOps returns them. Attachments are metadata-only.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({ ticketId: z.string() }),
  },
  {
    name: "superops_tickets_notes",
    description: "List sanitized ticket notes. Attachments are metadata-only. Redaction is marked when applied.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({ ticketId: z.string() }),
  },
  {
    name: "investigate_ticket",
    description:
      "Gather a bounded, sanitized read-only evidence package for one ticket. Accepts an RPMC displayId (DDMMYY-NNNN) or a SuperOps ticketId. Optional explicit assetId only; ticket-to-asset linkage is never inferred. Does not diagnose.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({
      ticket: z.string(),
      assetId: z.string().optional(),
    }),
  },
  {
    name: "investigate_asset",
    description:
      "Gather a bounded, sanitized read-only evidence package for one endpoint. Identify with exactly one of assetId (opaque GraphQL ID), hostName, name, or serialNumber. Complete requires the asset plus summary, activity, software, and patches. Asset-scoped alerts are attempted via unconfirmed getAlertsForAsset and do not by themselves make the result partial. Does not diagnose. Does not write.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({
      assetId: z.string().optional(),
      hostName: z.string().optional(),
      name: z.string().optional(),
      serialNumber: z.string().optional(),
    }),
  },
  {
    name: "investigate_client",
    description:
      "Gather bounded read-only context for one client: metadata, sites (official clientId), and a page of assets/tickets. Identify with exactly one of accountId, exact name, or emailDomain. Assets/tickets use the documented client.name filter, then keep only rows whose client.accountId matches the resolved client. Does not scan the tenant. Does not diagnose.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({
      accountId: z.string().optional(),
      name: z.string().optional(),
      emailDomain: z.string().optional(),
    }),
  },
  {
    name: "superops_tickets_search",
    description:
      "Constrained ticket search. Requires at least one filter. displayId uses live-confirmed operator is. Other filters (status includes, client.name, site.name, technician.name, techGroup.name, priority, createdTime/updatedTime presets) are official Help Center candidates pending RPMC live confirmation. Server-side sort, no tenant walk. Does not return ticket bodies.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({
      displayId: z.string().optional(),
      status: z.union([z.string(), z.array(z.string())]).optional(),
      clientName: z.string().optional(),
      siteName: z.string().optional(),
      technicianName: z.string().optional(),
      techGroupName: z.string().optional(),
      priority: z.string().optional(),
      created: z.enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month"]).optional(),
      updated: z.enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month"]).optional(),
      createdInLastDays: z.number().int().min(1).max(31).optional(),
      sortBy: z.enum(["createdTime", "updatedTime"]).optional(),
      sortOrder: z.enum(["ASC", "DESC"]).optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(50).optional(),
    }),
  },
  {
    name: "superops_assets_search",
    description:
      "Constrained asset search. Requires at least one filter. Exact hostName/name/serialNumber/status/client.name/site.name candidates use operator is. Optional unmonitored uses official getUnMonitoredAssetList. No tenant walk. No fuzzy match.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({
      assetId: z.string().optional(),
      hostName: z.string().optional(),
      name: z.string().optional(),
      serialNumber: z.string().optional(),
      status: z.string().optional(),
      clientName: z.string().optional(),
      siteName: z.string().optional(),
      unmonitored: z.boolean().optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(50).optional(),
    }),
  },
  {
    name: "superops_alerts_search",
    description:
      "Constrained alert search. Requires at least one filter. assetId uses official getAlertsForAsset (no tenant scan). Other filters (status, severity, createdTime) are Help Center candidates on getAlertList, bounded to one page.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({
      assetId: z.string().optional(),
      status: z.union([z.string(), z.array(z.string())]).optional(),
      severity: z.union([z.string(), z.array(z.string())]).optional(),
      created: z.enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month"]).optional(),
      createdInLastDays: z.number().int().min(1).max(31).optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(25).optional(),
    }),
  },
  {
    name: "superops_sites_list",
    description: "List client sites. Optional clientId uses official GetClientSiteListInput.clientId.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({
      clientId: z.string().optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
    }),
  },
  {
    name: "superops_sites_get",
    description: "Get one client site by siteId.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({ siteId: z.string() }),
  },
  {
    name: "superops_sites_search",
    description:
      "Constrained site search by exact name and/or clientId. clientId is official GetClientSiteListInput. Name is uses Help Center string operator is. No tenant walk.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({
      name: z.string().optional(),
      clientId: z.string().optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(50).optional(),
    }),
  },
  {
    name: "superops_assets_list",
    description: "List SuperOps assets/endpoints.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: pageInput,
  },
  {
    name: "superops_assets_get",
    description: "Get one SuperOps asset by assetId.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({ assetId: z.string() }),
  },
  {
    name: "superops_assets_software",
    description: "List software inventory for an asset.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({
      assetId: z.string(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
    }),
  },
  {
    name: "superops_assets_patches",
    description: "List patch details for an asset.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: z.object({
      assetId: z.string(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
    }),
  },
  {
    name: "superops_alerts_list",
    description: "List SuperOps alerts.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: pageInput,
  },
  {
    name: "superops_technicians_list",
    description: "List SuperOps technicians via official getTechnicianList.userList.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: pageInput,
  },
  {
    name: "superops_technicians_groups",
    description: "List SuperOps technician groups.",
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema: emptyInput,
  },
  {
    name: "superops_tickets_create",
    description: "Create a ticket. Not registered in Phase 1.",
    classification: "write_visible",
    operationKind: "mutation",
    phase1Registered: false,
    inputSchema: emptyInput,
  },
  {
    name: "superops_tickets_update",
    description: "Update a ticket. Not registered in Phase 1.",
    classification: "write_visible",
    operationKind: "mutation",
    phase1Registered: false,
    inputSchema: emptyInput,
  },
  {
    name: "superops_tickets_add_note",
    description: "Create a ticket note. Not registered in Phase 1.",
    classification: "write_low",
    operationKind: "mutation",
    phase1Registered: false,
    inputSchema: emptyInput,
  },
  {
    name: "superops_tickets_add_conversation",
    description: "Create a ticket conversation / public reply. Not registered in Phase 1.",
    classification: "write_visible",
    operationKind: "mutation",
    phase1Registered: false,
    inputSchema: emptyInput,
  },
  {
    name: "superops_alerts_resolve",
    description: "Resolve alerts. Not registered in Phase 1.",
    classification: "disruptive",
    operationKind: "mutation",
    phase1Registered: false,
    inputSchema: emptyInput,
  },
  {
    name: "superops_scripts_execute",
    description: "Run an RMM script on an asset. Not registered in Phase 1.",
    classification: "disruptive",
    operationKind: "mutation",
    phase1Registered: false,
    inputSchema: emptyInput,
  },
  {
    name: "superops_custom_mutation",
    description: "Arbitrary GraphQL mutation. Never registered.",
    classification: "destructive",
    operationKind: "mutation",
    phase1Registered: false,
    inputSchema: emptyInput,
  },
];

export function registeredCapabilities(): Capability[] {
  return CAPABILITIES.filter(
    (capability) =>
      capability.phase1Registered &&
      capability.classification === "read" &&
      capability.operationKind !== "mutation"
  );
}

export function registeredToolNames(): string[] {
  return registeredCapabilities().map((capability) => capability.name);
}

export function unregisteredWriteNames(): string[] {
  return CAPABILITIES.filter(
    (capability) => capability.classification !== "read" || capability.operationKind === "mutation"
  ).map((capability) => capability.name);
}
