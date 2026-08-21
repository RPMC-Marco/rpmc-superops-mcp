import type { ToolClassification } from "./audit.js";

export interface Capability {
  name: string;
  description: string;
  classification: ToolClassification;
  phase1Registered: boolean;
  inputSchema: Record<string, unknown>;
}

const PAGE = {
  page: { type: "number", description: "1-based page (default 1)" },
  pageSize: { type: "number", description: "Page size (default 25, max 100)" },
};

export const CAPABILITIES: Capability[] = [
  {
    name: "rpmc_status",
    description: "Show RPMC MCP status: read-only mode, region, and whether SuperOps env credentials are configured. Does not return secrets.",
    classification: "read",
    phase1Registered: true,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "superops_test_connection",
    description: "Read-only SuperOps connectivity check (fetches one client page).",
    classification: "read",
    phase1Registered: true,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "superops_clients_list",
    description: "List SuperOps clients (accounts). Association fields are returned as SuperOps JSON scalars.",
    classification: "read",
    phase1Registered: true,
    inputSchema: { type: "object", properties: { ...PAGE } },
  },
  {
    name: "superops_clients_get",
    description: "Get one SuperOps client by accountId.",
    classification: "read",
    phase1Registered: true,
    inputSchema: {
      type: "object",
      properties: { accountId: { type: "string" } },
      required: ["accountId"],
    },
  },
  {
    name: "superops_tickets_list",
    description: "List SuperOps tickets. Does not include ticket body, notes, or conversations.",
    classification: "read",
    phase1Registered: true,
    inputSchema: {
      type: "object",
      properties: {
        ...PAGE,
        status: { type: "string", description: "Optional status filter using SuperOps condition operator is (live-unconfirmed on RPMC tenant)." },
      },
    },
  },
  {
    name: "superops_tickets_get",
    description: "Get ticket metadata by ticketId. Does not query Ticket.description. Use conversations/notes tools for body evidence.",
    classification: "read",
    phase1Registered: true,
    inputSchema: {
      type: "object",
      properties: { ticketId: { type: "string" } },
      required: ["ticketId"],
    },
  },
  {
    name: "superops_tickets_conversations",
    description: "List sanitized ticket conversations, including DESCRIPTION items when SuperOps returns them. Attachments are metadata-only.",
    classification: "read",
    phase1Registered: true,
    inputSchema: {
      type: "object",
      properties: { ticketId: { type: "string" } },
      required: ["ticketId"],
    },
  },
  {
    name: "superops_tickets_notes",
    description: "List sanitized ticket notes. Attachments are metadata-only. Redaction is marked when applied.",
    classification: "read",
    phase1Registered: true,
    inputSchema: {
      type: "object",
      properties: { ticketId: { type: "string" } },
      required: ["ticketId"],
    },
  },
  {
    name: "superops_assets_list",
    description: "List SuperOps assets/endpoints.",
    classification: "read",
    phase1Registered: true,
    inputSchema: { type: "object", properties: { ...PAGE } },
  },
  {
    name: "superops_assets_get",
    description: "Get one SuperOps asset by assetId.",
    classification: "read",
    phase1Registered: true,
    inputSchema: {
      type: "object",
      properties: { assetId: { type: "string" } },
      required: ["assetId"],
    },
  },
  {
    name: "superops_assets_software",
    description: "List software inventory for an asset.",
    classification: "read",
    phase1Registered: true,
    inputSchema: {
      type: "object",
      properties: { assetId: { type: "string" }, ...PAGE },
      required: ["assetId"],
    },
  },
  {
    name: "superops_assets_patches",
    description: "List patch details for an asset.",
    classification: "read",
    phase1Registered: true,
    inputSchema: {
      type: "object",
      properties: { assetId: { type: "string" }, ...PAGE },
      required: ["assetId"],
    },
  },
  {
    name: "superops_alerts_list",
    description: "List SuperOps alerts.",
    classification: "read",
    phase1Registered: true,
    inputSchema: { type: "object", properties: { ...PAGE } },
  },
  {
    name: "superops_technicians_list",
    description: "List SuperOps technicians (queries userList; live field name to be confirmed on RPMC tenant).",
    classification: "read",
    phase1Registered: true,
    inputSchema: { type: "object", properties: { ...PAGE } },
  },
  {
    name: "superops_technicians_groups",
    description: "List SuperOps technician groups.",
    classification: "read",
    phase1Registered: true,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "superops_tickets_create",
    description: "Create a ticket. Not registered in Phase 1.",
    classification: "write_visible",
    phase1Registered: false,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "superops_tickets_update",
    description: "Update a ticket. Not registered in Phase 1.",
    classification: "write_visible",
    phase1Registered: false,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "superops_tickets_add_note",
    description: "Create a ticket note. Not registered in Phase 1.",
    classification: "write_low",
    phase1Registered: false,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "superops_tickets_add_conversation",
    description: "Create a ticket conversation / public reply. Not registered in Phase 1.",
    classification: "write_visible",
    phase1Registered: false,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "superops_alerts_resolve",
    description: "Resolve alerts. Not registered in Phase 1.",
    classification: "disruptive",
    phase1Registered: false,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "superops_scripts_execute",
    description: "Run an RMM script on an asset. Not registered in Phase 1.",
    classification: "disruptive",
    phase1Registered: false,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "superops_custom_mutation",
    description: "Arbitrary GraphQL mutation. Never registered.",
    classification: "destructive",
    phase1Registered: false,
    inputSchema: { type: "object", properties: {} },
  },
];

export function registeredCapabilities(): Capability[] {
  return CAPABILITIES.filter((capability) => capability.phase1Registered && capability.classification === "read");
}

export function registeredToolNames(): string[] {
  return registeredCapabilities().map((capability) => capability.name);
}

export function unregisteredWriteNames(): string[] {
  return CAPABILITIES.filter((capability) => capability.classification !== "read").map(
    (capability) => capability.name
  );
}
