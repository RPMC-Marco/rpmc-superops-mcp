import { z } from "zod";
import type { Capability } from "./capabilities.js";

const requestId = z.string().min(8).optional();
const id = z.string().min(1);
const authorizationGrant = z.string().min(1).optional();
const lifecycle = z.enum(["resolve", "close"]).optional();

function writeTool(
  name: string,
  description: string,
  classification: Capability["classification"],
  inputSchema: z.ZodObject<z.ZodRawShape>
): Capability {
  return {
    name,
    description,
    classification,
    operationKind: "mutation",
    phase1Registered: false,
    phase2Registered: true,
    inputSchema: inputSchema.extend({ authorizationGrant }),
  };
}

export const WRITE_CAPABILITIES: Capability[] = [
  writeTool(
    "superops_tickets_create",
    "Create a SuperOps ticket. Identify the client with exactly one of accountId or clientName (exact unique match). Optional assetId/hostName associates the asset at create time via official addAssets. Optional alertId sets sourceReferenceId. Uses API token technician identity. Customer-visible. Does not merge tickets. Status Closed requires lifecycle=close and an explicit human close instruction; generic ticket handling may use Resolved. Live RPMC rejects technician assignment at create (dependent_validation_failed); assign technician via superops_tickets_update after create.",
    "write_visible",
    z.object({
      subject: z.string().min(1),
      status: z.string().min(1),
      description: z.string().optional(),
      accountId: z.string().optional(),
      clientName: z.string().optional(),
      siteId: z.string().optional(),
      requesterUserId: z.string().optional(),
      technicianId: z.string().optional(),
      techGroupId: z.string().optional(),
      priority: z.string().optional(),
      impact: z.string().optional(),
      urgency: z.string().optional(),
      category: z.string().optional(),
      requestType: z.string().optional(),
      source: z.enum(["INTEGRATION", "FORM", "PHONE", "AI"]).optional(),
      assetId: z.string().optional(),
      hostName: z.string().optional(),
      alertId: z.string().optional(),
      lifecycle,
      requestId,
    })
  ),
  writeTool(
    "superops_tickets_update",
    "Update an existing ticket identified by displayId (DDMMYY-NNNN) or ticketId. Purpose-built fields only: subject, status, priority, technician/group assignment, impact, urgency, category, cause, resolutionCode, site, requester. Ambiguous displayIds fail closed. Does not associate assets (unsupported on updateTicket). Does not merge tickets. RPMC lifecycle: Resolved means the technician believes the issue is solved (authorized during delegated ticket handling). Closed means management review is complete and must not be set from generic 'handle this ticket' work. Closed is write_visible, not disruptive. Set lifecycle=close only when the human explicitly instructed to close the ticket.",
    "write_visible",
    z.object({
      ticket: z.string().min(1),
      subject: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      technicianId: z.string().optional(),
      techGroupId: z.string().optional(),
      impact: z.string().optional(),
      urgency: z.string().optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      cause: z.string().optional(),
      resolutionCode: z.string().optional(),
      siteId: z.string().optional(),
      requesterUserId: z.string().optional(),
      lifecycle,
      requestId,
    })
  ),
  writeTool(
    "superops_tickets_add_note",
    "Add a ticket note via official createTicketNote (live RPMC still uses this deprecated mutation; createNote is not present on the tenant). privacyType PRIVATE is an internal technician note; PUBLIC is requester-visible. Technician identity is the API token. Does not impersonate another technician.",
    "write_low",
    z.object({
      ticket: z.string().min(1),
      content: z.string().min(1),
      privacyType: z.enum(["PRIVATE", "PUBLIC"]).optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_tickets_add_conversation",
    "Add a customer-visible ticket conversation via official createTicketConversation. sendMail defaults to false; set true to email recipients. Technician identity is the API token.",
    "write_visible",
    z.object({
      ticket: z.string().min(1),
      content: z.string().min(1),
      sendMail: z.boolean().optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_worklogs_create",
    "Create one worklog entry via official createWorklogEntries. module is TICKET or PROJECT. workId is the ticketId when module is TICKET. Technician identity is the API token and is not impersonated.",
    "write_low",
    z.object({
      module: z.enum(["TICKET", "PROJECT"]),
      workId: z.string().min(1),
      qty: z.string().min(1),
      billDateTime: z.string().min(1),
      serviceItemId: z.string().optional(),
      billable: z.boolean().optional(),
      afterHours: z.boolean().optional(),
      notes: z.string().optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_worklogs_update",
    "Update one worklog entry via official updateWorklogEntry. Purpose-built fields only. Does not change technician identity.",
    "write_low",
    z.object({
      itemId: id,
      qty: z.string().optional(),
      billDateTime: z.string().optional(),
      billable: z.boolean().optional(),
      afterHours: z.boolean().optional(),
      notes: z.string().optional(),
      serviceItemId: z.string().optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_alerts_create",
    "Create a SuperOps alert on one asset via official createAlert. Identify the asset with exactly one of assetId or hostName. Use when external technician/integration evidence should surface as a SuperOps alert.",
    "write_visible",
    z.object({
      assetId: z.string().optional(),
      hostName: z.string().optional(),
      message: z.string().min(1),
      description: z.string().optional(),
      severity: z.string().optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_alerts_resolve",
    "Resolve one or more SuperOps alerts via official resolveAlerts. write_visible: changes monitoring/workflow state and does not interrupt the endpoint or service. Does not require disruptive confirmation. Optional assetId is used only for post-write verification.",
    "write_visible",
    z.object({
      alertIds: z.array(z.string().min(1)).min(1).max(20),
      assetId: z.string().optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_client_users_update",
    "Update a client user/requester via official updateClientUser. Purpose-built fields only: firstName, lastName, contactNumber, siteId, roleId. Does not change login email, delete users, or accept arbitrary JSON.",
    "write_visible",
    z.object({
      userId: id,
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      contactNumber: z.string().optional(),
      siteId: z.string().optional(),
      roleId: z.string().optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_client_users_update_association",
    "Update one client-user/site association via official updateClientUserAssociations. Provide associationId and the replacement siteId. Does not delete users.",
    "write_visible",
    z.object({
      associationId: id,
      siteId: id,
      requestId,
    })
  ),
  writeTool(
    "superops_assets_update",
    "Update one asset via official updateAsset. Identify with exactly one of assetId, hostName, name, or serialNumber. Purpose-built fields: name, accountId, siteId, requesterUserId, warrantyExpiryDate, purchasedDate. No arbitrary customFields JSON.",
    "write_visible",
    z.object({
      assetId: z.string().optional(),
      hostName: z.string().optional(),
      name: z.string().optional(),
      serialNumber: z.string().optional(),
      newName: z.string().optional(),
      accountId: z.string().optional(),
      siteId: z.string().optional(),
      requesterUserId: z.string().optional(),
      warrantyExpiryDate: z.string().optional(),
      purchasedDate: z.string().optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_tasks_create",
    "Create a task via official createTask. module is TICKET or PROJECT. ticket is required when module is TICKET. status must be a WorkStatus name. Technician identity is optional assignment, not impersonation of the API token.",
    "write_low",
    z.object({
      title: z.string().min(1),
      status: z.string().min(1),
      module: z.enum(["TICKET", "PROJECT"]),
      ticket: z.string().optional(),
      description: z.string().optional(),
      technicianId: z.string().optional(),
      techGroupId: z.string().optional(),
      estimatedTime: z.number().int().positive().optional(),
      scheduledStartDate: z.string().optional(),
      dueDate: z.string().optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_itdocs_create",
    "Create an IT documentation record via official createItDocumentation. typeId is the category. fields are purpose-built custom-field values keyed by columnName. PASSWORD/SECURE_TEXT/license-key fields are refused. Unknown columns fail closed.",
    "write_low",
    z.object({
      typeId: id,
      name: z.string().min(1),
      accountId: z.string().optional(),
      siteId: z.string().optional(),
      fields: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number(), z.boolean()])).optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_itdocs_update",
    "Update an IT documentation record via official updateItDocumentation. Non-secret fields only. PASSWORD/SECURE_TEXT/license-key writes are refused. Unknown columns fail closed.",
    "write_low",
    z.object({
      itDocId: id,
      typeId: id,
      name: z.string().optional(),
      accountId: z.string().optional(),
      siteId: z.string().optional(),
      fields: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number(), z.boolean()])).optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_kb_articles_create",
    "Create a KB article via official createKbArticle. Caller supplies HTML content (this is not article-body retrieval). Default status DRAFT, loginRequired=true, and technician-only visibility (AllUsers+AllGroups). Fragment HTML is wrapped in an html/body document because the RPMC tenant ISE's on loginRequired=false fragment HTML. Requester visibility or PUBLISHED is customer-visible. Article body update/retrieval remains a planned future addon.",
    "write_low",
    z.object({
      name: z.string().min(1),
      parentItemId: id,
      content: z.string().min(1),
      status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
      visibility: z.enum(["technicians", "requesters"]).optional(),
      loginRequired: z.boolean().optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_kb_collections_create",
    "Create a KB collection via official createKbCollection. Optional parentItemId nests it under an existing collection.",
    "write_low",
    z.object({
      name: z.string().min(1),
      parentItemId: z.string().optional(),
      requestId,
    })
  ),
  writeTool(
    "superops_kb_collections_update",
    "Rename a KB collection via official updateKbCollection. Does not modify article bodies.",
    "write_low",
    z.object({
      itemId: id,
      name: z.string().min(1),
      requestId,
    })
  ),
  writeTool(
    "superops_scripts_execute",
    "Run an existing SuperOps script on one asset via official runScriptOnAsset. Requires scriptId plus exactly one asset identity. Does not accept arbitrary script text. Consequence is classified from intended effect and target in script metadata, not from verbs such as delete/remove/clear. Unknown scripts classify upward to disruptive. The caller cannot lower classification. Optional authorizationGrant is an opaque human-created Rules B/C grant; it authorizes in-scope consequences and never rewrites classification.",
    "disruptive",
    z.object({
      scriptId: id,
      assetId: z.string().optional(),
      hostName: z.string().optional(),
      name: z.string().optional(),
      serialNumber: z.string().optional(),
      arguments: z.array(z.object({ name: z.string().min(1), value: z.string() })).optional(),
      requestId,
    })
  ),
];

export const NEVER_REGISTERED_WRITE_NAMES = ["superops_custom_mutation"] as const;
