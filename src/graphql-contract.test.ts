import { describe, expect, it } from "vitest";
import { ALL_QUERY_DOCUMENTS, GET_ALERTS_FOR_ASSET, GET_TECHNICIAN_LIST, GET_TICKET, GET_TICKET_LIST, GET_UNMONITORED_ASSET_LIST } from "./superops/queries.js";
import { EXPANDED_QUERY_DOCUMENTS, GET_OFFERED_ITEMS, GET_SERVICE_ITEM_LIST, GET_TASK_LIST, OBJECT_TYPED_QUERY_DOCUMENTS } from "./superops/queries-expanded.js";
import { ALL_MUTATION_DOCUMENTS } from "./superops/mutations.js";

const NESTED_ASSOCIATION = /\b(client|site|requester|technician|techGroup|sla|asset)\s*\{/;

describe("graphql contracts", () => {
  it("does not nest SuperOps JSON association fields on the original 0.1.7 documents", () => {
    for (const document of ALL_QUERY_DOCUMENTS) {
      expect(document, document.slice(0, 80)).not.toMatch(NESTED_ASSOCIATION);
    }
  });

  it("uses official page pagination fields", () => {
    expect(GET_TICKET_LIST).toMatch(/\bpage\b/);
    expect(GET_TICKET_LIST).toMatch(/\bpageSize\b/);
    expect(GET_TICKET_LIST).toMatch(/\bhasMore\b/);
    expect(GET_TICKET_LIST).not.toMatch(/\bfirst\s*:/);
    expect(GET_TICKET_LIST).not.toMatch(/\bafter\s*:/);
    expect(GET_TICKET_LIST).not.toMatch(/\bendCursor\b/);
  });

  it("does not query Ticket.description", () => {
    expect(GET_TICKET).not.toMatch(/\bdescription\b/);
    expect(GET_TICKET_LIST).not.toMatch(/\bdescription\b/);
  });

  it("uses official getTechnicianList.userList", () => {
    expect(GET_TECHNICIAN_LIST).toMatch(/\buserList\b/);
  });

  it("scopes asset alerts through official getAlertsForAsset, not a tenant-wide list", () => {
    expect(GET_ALERTS_FOR_ASSET).toMatch(/getAlertsForAsset/);
    expect(GET_ALERTS_FOR_ASSET).toMatch(/AssetDetailsListInput/);
    expect(GET_ALERTS_FOR_ASSET).not.toMatch(/getAlertList/);
  });

  it("does not expose getAssetInfoByTPEndpointIds or deprecated field-list replacements", () => {
    const blob = EXPANDED_QUERY_DOCUMENTS.join("\n");
    expect(blob).not.toMatch(/getAssetInfoByTPEndpointIds/);
    expect(blob).not.toMatch(/getStatusList/);
    expect(blob).not.toMatch(/getPriorityList/);
    expect(blob).not.toMatch(/getCategoryList/);
    expect(blob).not.toMatch(/getAssetPatchStatus/);
    expect(blob).not.toMatch(/getTicketCustomField/);
    expect(blob).not.toMatch(/getClientCustomField/);
  });

  it("keeps getUnMonitoredAssetList as an unused document, not an expanded tool query", () => {
    expect(GET_UNMONITORED_ASSET_LIST).toMatch(/getUnMonitoredAssetList/);
    expect(EXPANDED_QUERY_DOCUMENTS.join("\n")).not.toMatch(/getUnMonitoredAssetList/);
  });

  it("nests only official object-typed fields on the expansion documents that require it", () => {
    const jsonLeafDocs = EXPANDED_QUERY_DOCUMENTS.filter((document) => !OBJECT_TYPED_QUERY_DOCUMENTS.includes(document));
    for (const document of jsonLeafDocs) {
      expect(document, document.slice(0, 80)).not.toMatch(NESTED_ASSOCIATION);
    }
    expect(OBJECT_TYPED_QUERY_DOCUMENTS.join("\n")).toMatch(/client \{ accountId name \}/);
  });

  it("nests official object-typed fields that live 0.1.8 selected as illegal leaves", () => {
    const blob = EXPANDED_QUERY_DOCUMENTS.join("\n");
    expect(blob).toMatch(/serviceTypeItem \{ itemId offeringType \}/);
    expect(blob).toMatch(/statuses \{\s*statusId/);
    expect(blob).toMatch(/rates \{ rateId name rateValue \}/);
    expect(blob).toMatch(/visibility \{\s*mappingId/);
    expect(blob).toMatch(/taxes \{\s*id/);
    expect(blob).toMatch(/contract \{\s*contractId/);
    expect(blob).toMatch(/salesTax \{ taxId name totalRate \}/);
    expect(blob).not.toMatch(/KB_ARTICLE_CONTENT/);
  });

  it("uses the live-accepted OfferedItem, ServiceItem, and Task selections", () => {
    expect(GET_OFFERED_ITEMS).toMatch(/^\s+serviceItem\s*$/m);
    expect(GET_OFFERED_ITEMS).toMatch(/^\s+client\s*$/m);
    expect(GET_OFFERED_ITEMS).toMatch(/^\s+technician\s*$/m);
    expect(GET_OFFERED_ITEMS).toContain("itemId");
    expect(GET_OFFERED_ITEMS).not.toMatch(/^\s+type\s*$/m);
    expect(GET_OFFERED_ITEMS).not.toMatch(/serviceItem \{/);
    expect(GET_SERVICE_ITEM_LIST).toContain("itemId");
    expect(GET_SERVICE_ITEM_LIST).toContain("category { categoryId name }");
    expect(GET_SERVICE_ITEM_LIST).toMatch(/salesTax \{ taxId name rates \{ rateId name rateValue \} \}/);
    expect(GET_SERVICE_ITEM_LIST).not.toMatch(/salesTax \{[^}]*totalRate/);
    expect(GET_SERVICE_ITEM_LIST).not.toMatch(/^\s+(category|salesTax|blockItemAdjustedItems)\s*$/m);
    expect(GET_TASK_LIST).toContain("taskId");
    expect(GET_TASK_LIST).toMatch(/^\s+technician\s*$/m);
    expect(GET_TASK_LIST).toMatch(/^\s+techGroup\s*$/m);
    expect(GET_TASK_LIST).toMatch(/^\s+ticket\s*$/m);
    expect(GET_TASK_LIST).toMatch(/^\s+workItem\s*$/m);
    expect(GET_TASK_LIST).not.toMatch(/\bmodule\b/);
    expect(GET_TASK_LIST).toContain("GetTaskListInput");
  });

  it("covers all 44 approved expansion queries", () => {
    const blob = EXPANDED_QUERY_DOCUMENTS.join("\n");
    const required = [
      "getAllFields",
      "getField(",
      "getFields(",
      "getAssetCustomFields",
      "getAssetDiskDetails",
      "getAssetUserLog",
      "getDeviceCategories",
      "getClientStageList",
      "getClientUser(",
      "getClientUserList",
      "getClientUserAssociationList",
      "getRequesterRoleList",
      "getTechnicianRoleList",
      "getDesignationList",
      "getTeamList",
      "getBusinessFunctionList",
      "getClientContract(",
      "getClientContractList",
      "getSLAList",
      "getOfferedItems",
      "getServiceCatalogItem(",
      "getServiceCatalogItemList",
      "getServiceCategoryList",
      "getServiceItem(",
      "getServiceItemList",
      "getTax(",
      "getTaxList",
      "getPaymentMethodList",
      "getPaymentTermList",
      "getInvoice(",
      "getInvoiceList",
      "getInvoiceItemList",
      "getItDocumentation(",
      "getItDocumentationList",
      "getItDocumentationCategories",
      "getKbItem(",
      "getKbItems(",
      "getScriptList(",
      "getScriptListByType",
      "getTask(",
      "getTaskList",
      "getWorkStatusList",
      "getWorklogEntries",
      "getHolidayList",
    ];
    for (const name of required) {
      expect(blob, name).toContain(name);
    }
    expect(required).toHaveLength(44);
  });

  it("keeps official mutation documents leaf-selected and excludes hard deletes", () => {
    const blob = ALL_MUTATION_DOCUMENTS.join("\n");
    expect(ALL_MUTATION_DOCUMENTS.length).toBe(18);
    for (const document of ALL_MUTATION_DOCUMENTS) {
      expect(document, document.slice(0, 80)).toMatch(/\bmutation\b/);
    }
    expect(blob).not.toMatch(/hardDelete|softDelete|restoreClients|restoreTickets/);
    expect(blob).not.toMatch(/updateKbArticle/);
    expect(blob).toContain("createNote");
    expect(blob).toContain("createTicket");
    expect(blob).toContain("runScriptOnAsset");
    expect(blob).toContain("createAlert");
  });
});
