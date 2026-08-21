import { z } from "zod";
import type { Capability } from "./capabilities.js";

const pageInput = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(50).optional(),
});

function readTool(
  name: string,
  description: string,
  inputSchema: z.ZodObject<z.ZodRawShape>
): Capability {
  return {
    name,
    description,
    classification: "read",
    operationKind: "query",
    phase1Registered: true,
    inputSchema,
  };
}

export const EXPANDED_CAPABILITIES: Capability[] = [
  readTool(
    "superops_fields_all",
    "Fetch all SuperOps Field definitions for one module via official getAllFields (e.g. TICKET, COMPANY_USER). Replaces deprecated status/category/custom-field list APIs. One module per call. Does not write.",
    z.object({ module: z.string() })
  ),
  readTool(
    "superops_fields_get",
    "Fetch one Field via official getField. module is required; provide exactly one of id or columnName.",
    z.object({ module: z.string(), id: z.string().optional(), columnName: z.string().optional() })
  ),
  readTool(
    "superops_fields_lookup",
    "Fetch specific Fields via official getFields. Pass 1-20 identifiers, each with module plus id or columnName.",
    z.object({
      fields: z.array(z.object({ module: z.string(), id: z.string().optional(), columnName: z.string().optional() })),
    })
  ),
  readTool(
    "superops_asset_custom_fields",
    "Fetch asset custom-field definitions via official getAssetCustomFields. Optional modules such as Windows or Mac.",
    z.object({ modules: z.union([z.string(), z.array(z.string())]).optional() })
  ),
  readTool(
    "superops_assets_disks",
    "Fetch bounded disk/storage details for one asset via official getAssetDiskDetails.",
    z.object({ assetId: z.string() })
  ),
  readTool(
    "superops_assets_user_log",
    "Fetch a bounded local page of asset user-login records via official getAssetUserLog.",
    z.object({ assetId: z.string() })
  ),
  readTool(
    "superops_device_categories",
    "List device categories via official getDeviceCategories. Optional module (ENDPOINT/NM_ASSET), custom, classId.",
    z.object({
      module: z.union([z.string(), z.array(z.string())]).optional(),
      custom: z.boolean().optional(),
      classId: z.string().optional(),
    })
  ),
  readTool(
    "superops_client_users_get",
    "Get one client user/requester by official userId. Structured email is omitted.",
    z.object({ userId: z.string() })
  ),
  readTool(
    "superops_client_users_list",
    "List a bounded page of client users via official getClientUserList. Optional clientId scopes to one client. Structured email is omitted.",
    pageInput.extend({ clientId: z.string().optional() })
  ),
  readTool(
    "superops_client_users_associations",
    "List a bounded page of client-user/site associations via official getClientUserAssociationList. Does not walk every page.",
    pageInput
  ),
  readTool(
    "superops_org_catalog",
    "List one organizational catalog. kind selects exactly one official query: client_stage, requester_role, technician_role, designation, team, business_function, holiday, sla. Not an arbitrary GraphQL escape hatch.",
    z.object({
      kind: z.enum([
        "client_stage",
        "requester_role",
        "technician_role",
        "designation",
        "team",
        "business_function",
        "holiday",
        "sla",
      ]),
    })
  ),
  readTool("superops_contracts_get", "Get one client contract by official contractId. Read-only.", z.object({ contractId: z.string() })),
  readTool("superops_contracts_list", "List a bounded page of client contracts via official getClientContractList.", pageInput),
  readTool("superops_catalog_get", "Get one service catalog item (product/service) by official itemId.", z.object({ itemId: z.string() })),
  readTool("superops_catalog_list", "List a bounded page of service catalog items via official getServiceCatalogItemList.", pageInput),
  readTool("superops_catalog_categories", "List service catalog categories via official getServiceCategoryList.", z.object({})),
  readTool("superops_services_get", "Get one service item by official itemId.", z.object({ itemId: z.string() })),
  readTool("superops_services_list", "List a bounded page of service items via official getServiceItemList.", pageInput),
  readTool("superops_offered_items", "List a bounded page of offered contract/work items via official getOfferedItems.", pageInput),
  readTool("superops_taxes_get", "Get one tax rate by official taxId.", z.object({ taxId: z.string() })),
  readTool("superops_taxes_list", "List a bounded page of taxes via official getTaxList.", pageInput),
  readTool(
    "superops_payment_config",
    "List payment methods or terms. kind=method uses getPaymentMethodList; kind=term uses getPaymentTermList.",
    z.object({ kind: z.enum(["method", "term"]) })
  ),
  readTool("superops_invoices_get", "Get one invoice by official invoiceId. Line items are bounded. Structured email is omitted.", z.object({ invoiceId: z.string() })),
  readTool("superops_invoices_list", "List a bounded page of invoices via official getInvoiceList. Does not return full line items.", pageInput),
  readTool("superops_invoice_items", "List a bounded page of invoice line items via official getInvoiceItemList.", pageInput),
  readTool(
    "superops_itdocs_get",
    "Get one IT documentation record by official itDocId. Official GraphQL ItDocumentation has no article body field; customFields are sanitized.",
    z.object({ itDocId: z.string() })
  ),
  readTool(
    "superops_itdocs_list",
    "List a bounded page of IT documents under one official category typeId (ItDocumentationListInput). Use superops_itdocs_categories first. Does not dump the whole repository.",
    pageInput.extend({ typeId: z.string() })
  ),
  readTool("superops_itdocs_categories", "List IT documentation categories via official getItDocumentationCategories.", z.object({})),
  readTool(
    "superops_kb_get",
    "Get one KB item (article or collection) by official itemId. GraphQL returns description/summary only; article body is a separate SuperOps download API and is not fetched here.",
    z.object({ itemId: z.string() })
  ),
  readTool("superops_kb_list", "List a bounded page of KB items via official getKbItems(listInfo). Does not dump all KB content.", pageInput),
  readTool(
    "superops_scripts_list",
    "List a bounded page of SuperOps scripts via official getScriptList. Metadata only. Does not execute scripts.",
    pageInput
  ),
  readTool(
    "superops_scripts_by_type",
    "List a bounded page of scripts for one OS type via official getScriptListByType (e.g. WINDOWS, MAC). Does not execute scripts.",
    pageInput.extend({ type: z.string() })
  ),
  readTool("superops_tasks_get", "Get one task by official taskId (GetTaskInput). Ticket linkage is returned as SuperOps JSON when present; not inferred.", z.object({ taskId: z.string() })),
  readTool("superops_tasks_list", "List a bounded page of tasks via official getTaskList. Does not walk every page.", pageInput),
  readTool("superops_work_statuses", "List task/project work statuses via official getWorkStatusList.", z.object({})),
  readTool(
    "superops_worklogs_list",
    "List a bounded page of worklog entries via official GetWorklogEntriesInput. module is required (TICKET or PROJECT). There is no ticketId-only worklog query.",
    pageInput.extend({ module: z.enum(["TICKET", "PROJECT"]) })
  ),
];
