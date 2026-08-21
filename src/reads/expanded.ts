import type { SuperOpsClient } from "../superops/client.js";
import * as E from "../superops/queries-expanded.js";
import { parseAssetId } from "../assets/asset-ref.js";
import { stringArg, stringList } from "../superops/conditions.js";
import { listInfoInput } from "../superops/list-search.js";
import { failureCode, upstreamFailureCategory } from "../investigate/common.js";
import { toClientSafeError } from "../privacy/errors.js";
import {
  asArray,
  asRecord,
  complete,
  DISK_LIMIT,
  failed,
  INVOICE_ITEM_LIMIT,
  listInput,
  paging,
  privacy,
  requiredId,
  runBareList,
  runGet,
  runPagedList,
  USER_LOG_LIMIT,
} from "./runtime.js";

const ORG_CATALOGS: Record<string, { query: string; operation: string; extract: (data: Record<string, unknown>) => unknown[] }> = {
  client_stage: { query: E.GET_CLIENT_STAGE_LIST, operation: "getClientStageList", extract: (data) => asArray(data.getClientStageList) },
  requester_role: { query: E.GET_REQUESTER_ROLE_LIST, operation: "getRequesterRoleList", extract: (data) => asArray(data.getRequesterRoleList) },
  technician_role: { query: E.GET_TECHNICIAN_ROLE_LIST, operation: "getTechnicianRoleList", extract: (data) => asArray(data.getTechnicianRoleList) },
  designation: { query: E.GET_DESIGNATION_LIST, operation: "getDesignationList", extract: (data) => asArray(data.getDesignationList) },
  team: { query: E.GET_TEAM_LIST, operation: "getTeamList", extract: (data) => asArray(data.getTeamList) },
  business_function: { query: E.GET_BUSINESS_FUNCTION_LIST, operation: "getBusinessFunctionList", extract: (data) => asArray(data.getBusinessFunctionList) },
  holiday: { query: E.GET_HOLIDAY_LIST, operation: "getHolidayList", extract: (data) => asArray(data.getHolidayList) },
  sla: { query: E.GET_SLA_LIST, operation: "getSLAList", extract: (data) => asArray(data.getSLAList) },
};

function fieldIdentifier(args: Record<string, unknown>): { ok: true; value: Record<string, string> } | { ok: false; message: string } {
  const moduleName = stringArg(args.module);
  const id = stringArg(args.id ?? args.fieldId);
  const columnName = stringArg(args.columnName);
  if (!moduleName) return { ok: false, message: "module is required (e.g. TICKET, COMPANY_USER)" };
  if (!id && !columnName) return { ok: false, message: "Provide id or columnName with module" };
  if (id && columnName) return { ok: false, message: "Provide only one of id or columnName" };
  const value: Record<string, string> = { module: moduleName };
  if (id) value.id = id;
  else value.columnName = columnName;
  return { ok: true, value };
}

function boundArray(items: unknown[], limit: number): { items: unknown[]; truncated: boolean } {
  return { items: items.slice(0, limit).map((item) => privacy(item)), truncated: items.length > limit };
}

export async function handleExpandedRead(
  name: string,
  args: Record<string, unknown>,
  client: SuperOpsClient
): Promise<Record<string, unknown> | null> {
  switch (name) {
    case "superops_fields_all": {
      const moduleName = stringArg(args.module);
      if (!moduleName) return failed({ code: "malformed_input", message: "module is required", query: "getAllFields" });
      return runBareList(client, E.GET_ALL_FIELDS, "getAllFields", { input: moduleName }, (data) => asArray(data.getAllFields));
    }
    case "superops_fields_get": {
      const parsed = fieldIdentifier(args);
      if (!parsed.ok) return failed({ code: "malformed_input", message: parsed.message, query: "getField" });
      return runGet(client, E.GET_FIELD, "getField", { input: parsed.value }, (data) => data.getField);
    }
    case "superops_fields_lookup": {
      const raw = Array.isArray(args.fields) ? args.fields : [];
      if (raw.length === 0 || raw.length > 20) {
        return failed({ code: "malformed_input", message: "fields must be 1-20 FieldIdentifierInput objects", query: "getFields" });
      }
      const identifiers = [];
      for (const item of raw) {
        const parsed = fieldIdentifier(asRecord(item));
        if (!parsed.ok) return failed({ code: "malformed_input", message: parsed.message, query: "getFields" });
        identifiers.push(parsed.value);
      }
      return runBareList(client, E.GET_FIELDS, "getFields", { input: identifiers }, (data) => asArray(data.getFields));
    }
    case "superops_asset_custom_fields": {
      const modules = stringList(args.modules ?? args.module);
      if (!modules.length) {
        return failed({
          code: "malformed_input",
          message: "modules is required (official getAssetCustomFields input is [String!]; live RPMC rejects an omitted input). Example: Windows, Mac.",
          query: "getAssetCustomFields",
        });
      }
      return runBareList(
        client,
        E.GET_ASSET_CUSTOM_FIELDS,
        "getAssetCustomFields",
        { input: modules },
        (data) => asArray(data.getAssetCustomFields)
      );
    }
    case "superops_assets_disks": {
      const parsed = parseAssetId(args.assetId);
      if (!parsed.ok) return failed({ code: parsed.code, message: parsed.message, query: "getAssetDiskDetails" });
      const operations = ["getAssetDiskDetails"];
      try {
        const data = asRecord(await client.query(E.GET_ASSET_DISK_DETAILS, { input: { assetId: parsed.value } }));
        const bounded = boundArray(asArray(data.getAssetDiskDetails), DISK_LIMIT);
        return complete({ ...bounded, returned: bounded.items.length, limit: DISK_LIMIT }, "getAssetDiskDetails", operations);
      } catch (error) {
        return failed({
          code: failureCode(error),
          message: toClientSafeError(error),
          query: "getAssetDiskDetails",
          logicalOperations: operations,
          upstreamFailureCategory: upstreamFailureCategory(error),
        });
      }
    }
    case "superops_assets_user_log": {
      const parsed = parseAssetId(args.assetId);
      if (!parsed.ok) return failed({ code: parsed.code, message: parsed.message, query: "getAssetUserLog" });
      const operations = ["getAssetUserLog"];
      try {
        const data = asRecord(await client.query(E.GET_ASSET_USER_LOG, { input: { assetId: parsed.value } }));
        const bounded = boundArray(asArray(data.getAssetUserLog), USER_LOG_LIMIT);
        return complete({ ...bounded, returned: bounded.items.length, limit: USER_LOG_LIMIT }, "getAssetUserLog", operations);
      } catch (error) {
        return failed({
          code: failureCode(error),
          message: toClientSafeError(error),
          query: "getAssetUserLog",
          logicalOperations: operations,
          upstreamFailureCategory: upstreamFailureCategory(error),
        });
      }
    }
    case "superops_device_categories": {
      const input: Record<string, unknown> = {};
      const modules = stringList(args.module);
      if (modules.length) input.module = modules;
      if (typeof args.custom === "boolean") input.custom = args.custom;
      const classId = stringArg(args.classId);
      if (classId) input.classId = classId;
      return runBareList(
        client,
        E.GET_DEVICE_CATEGORIES,
        "getDeviceCategories",
        { input: Object.keys(input).length ? input : null },
        (data) => asArray(data.getDeviceCategories)
      );
    }
    case "superops_client_users_get": {
      const userId = requiredId(args, "userId");
      if (!userId) return failed({ code: "malformed_input", message: "userId is required", query: "getClientUser" });
      return runGet(client, E.GET_CLIENT_USER, "getClientUser", { input: { userId } }, (data) => data.getClientUser);
    }
    case "superops_client_users_list": {
      const input = listInput(args);
      const clientId = stringArg(args.clientId ?? args.accountId);
      if (clientId) input.clientId = clientId;
      return runPagedList(client, E.GET_CLIENT_USER_LIST, "getClientUserList", input, (payload) => asArray(payload.userList), "getClientUserList");
    }
    case "superops_client_users_associations": {
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_CLIENT_USER_ASSOCIATION_LIST,
        "getClientUserAssociationList",
        listInfoInput({ page, pageSize }),
        (payload) => asArray(payload.associations),
        "getClientUserAssociationList"
      );
    }
    case "superops_org_catalog": {
      const kind = stringArg(args.kind);
      const spec = ORG_CATALOGS[kind];
      if (!spec) {
        return failed({
          code: "malformed_input",
          message: `kind must be one of: ${Object.keys(ORG_CATALOGS).join(", ")}`,
          query: "org_catalog",
        });
      }
      return runBareList(client, spec.query, spec.operation, undefined, spec.extract);
    }
    case "superops_contracts_get": {
      const contractId = requiredId(args, "contractId");
      if (!contractId) return failed({ code: "malformed_input", message: "contractId is required", query: "getClientContract" });
      return runGet(client, E.GET_CLIENT_CONTRACT, "getClientContract", { input: { contractId } }, (data) => data.getClientContract);
    }
    case "superops_contracts_list": {
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_CLIENT_CONTRACT_LIST,
        "getClientContractList",
        listInfoInput({ page, pageSize }),
        (payload) => asArray(payload.clientContracts),
        "getClientContractList"
      );
    }
    case "superops_catalog_get": {
      const itemId = requiredId(args, "itemId");
      if (!itemId) return failed({ code: "malformed_input", message: "itemId is required", query: "getServiceCatalogItem" });
      return runGet(client, E.GET_SERVICE_CATALOG_ITEM, "getServiceCatalogItem", { input: { itemId } }, (data) => data.getServiceCatalogItem);
    }
    case "superops_catalog_list": {
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_SERVICE_CATALOG_ITEM_LIST,
        "getServiceCatalogItemList",
        listInfoInput({ page, pageSize }),
        (payload) => asArray(payload.items),
        "getServiceCatalogItemList"
      );
    }
    case "superops_catalog_categories":
      return runBareList(client, E.GET_SERVICE_CATEGORY_LIST, "getServiceCategoryList", undefined, (data) => asArray(data.getServiceCategoryList));
    case "superops_services_get": {
      const itemId = requiredId(args, "itemId");
      if (!itemId) return failed({ code: "malformed_input", message: "itemId is required", query: "getServiceItem" });
      return runGet(client, E.GET_SERVICE_ITEM, "getServiceItem", { input: { itemId } }, (data) => data.getServiceItem);
    }
    case "superops_services_list": {
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_SERVICE_ITEM_LIST,
        "getServiceItemList",
        listInfoInput({ page, pageSize }),
        (payload) => asArray(payload.items),
        "getServiceItemList"
      );
    }
    case "superops_offered_items": {
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_OFFERED_ITEMS,
        "getOfferedItems",
        listInfoInput({ page, pageSize }),
        (payload) => asArray(payload.items),
        "getOfferedItems"
      );
    }
    case "superops_taxes_get": {
      const taxId = requiredId(args, "taxId");
      if (!taxId) return failed({ code: "malformed_input", message: "taxId is required", query: "getTax" });
      return runGet(client, E.GET_TAX, "getTax", { input: { taxId } }, (data) => data.getTax);
    }
    case "superops_taxes_list": {
      const { page, pageSize } = paging(args);
      return runPagedList(client, E.GET_TAX_LIST, "getTaxList", listInfoInput({ page, pageSize }), (payload) => asArray(payload.taxes), "getTaxList");
    }
    case "superops_payment_config": {
      const kind = stringArg(args.kind);
      if (kind === "method") {
        return runBareList(client, E.GET_PAYMENT_METHOD_LIST, "getPaymentMethodList", undefined, (data) => asArray(data.getPaymentMethodList));
      }
      if (kind === "term") {
        return runBareList(client, E.GET_PAYMENT_TERM_LIST, "getPaymentTermList", undefined, (data) => asArray(data.getPaymentTermList));
      }
      return failed({ code: "malformed_input", message: "kind must be method or term", query: "payment_config" });
    }
    case "superops_invoices_get": {
      const invoiceId = requiredId(args, "invoiceId");
      if (!invoiceId) return failed({ code: "malformed_input", message: "invoiceId is required", query: "getInvoice" });
      const result = await runGet(client, E.GET_INVOICE, "getInvoice", { input: { invoiceId } }, (data) => data.getInvoice);
      if (result.status !== "complete") return result;
      const item = asRecord(result.item);
      const lines = asArray(item.items);
      const bounded = boundArray(lines, INVOICE_ITEM_LIMIT);
      return {
        ...result,
        item: { ...item, items: bounded.items, itemsTruncated: bounded.truncated, itemsReturned: bounded.items.length },
      };
    }
    case "superops_invoices_list": {
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_INVOICE_LIST,
        "getInvoiceList",
        listInfoInput({ page, pageSize }),
        (payload) => asArray(payload.invoices),
        "getInvoiceList"
      );
    }
    case "superops_invoice_items": {
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_INVOICE_ITEM_LIST,
        "getInvoiceItemList",
        listInfoInput({ page, pageSize }),
        (payload) => asArray(payload.items),
        "getInvoiceItemList"
      );
    }
    case "superops_itdocs_get": {
      const itDocId = requiredId(args, "itDocId");
      if (!itDocId) return failed({ code: "malformed_input", message: "itDocId is required", query: "getItDocumentation" });
      return runGet(client, E.GET_IT_DOCUMENTATION, "getItDocumentation", { input: { itDocId } }, (data) => data.getItDocumentation);
    }
    case "superops_itdocs_list": {
      const typeId = requiredId(args, "typeId");
      if (!typeId) {
        return failed({
          code: "malformed_input",
          message: "typeId is required; list official IT documents under one category. Use superops_itdocs_categories first.",
          query: "getItDocumentationList",
        });
      }
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_IT_DOCUMENTATION_LIST,
        "getItDocumentationList",
        { typeId, listInfo: listInfoInput({ page, pageSize }) },
        (payload) => asArray(payload.documents),
        "getItDocumentationList"
      );
    }
    case "superops_itdocs_categories":
      return runBareList(client, E.GET_IT_DOCUMENTATION_CATEGORIES, "getItDocumentationCategories", undefined, (data) =>
        asArray(data.getItDocumentationCategories)
      );
    case "superops_kb_get": {
      const itemId = requiredId(args, "itemId");
      if (!itemId) return failed({ code: "malformed_input", message: "itemId is required", query: "getKbItem" });
      return runGet(client, E.GET_KB_ITEM, "getKbItem", { input: { itemId } }, (data) => data.getKbItem);
    }
    case "superops_kb_list": {
      const operations = ["getKbItems"];
      const { page, pageSize } = paging(args);
      try {
        const data = asRecord(await client.query(E.GET_KB_ITEMS, { listInfo: listInfoInput({ page, pageSize }) }));
        const payload = asRecord(data.getKbItems);
        const listInfo = asRecord(payload.listInfo);
        return complete(
          {
            items: asArray(payload.items).map((item) => privacy(item)),
            listInfo,
            truncated: listInfo.hasMore === true,
          },
          "getKbItems",
          operations
        );
      } catch (error) {
        return failed({
          code: failureCode(error),
          message: toClientSafeError(error),
          query: "getKbItems",
          logicalOperations: operations,
          upstreamFailureCategory: upstreamFailureCategory(error),
        });
      }
    }
    case "superops_scripts_list": {
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_SCRIPT_LIST,
        "getScriptList",
        listInfoInput({ page, pageSize }),
        (payload) => asArray(payload.scripts),
        "getScriptList"
      );
    }
    case "superops_scripts_by_type": {
      const type = stringArg(args.type);
      if (!type) return failed({ code: "malformed_input", message: "type is required (e.g. WINDOWS, MAC)", query: "getScriptListByType" });
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_SCRIPT_LIST_BY_TYPE,
        "getScriptListByType",
        { type, listInfo: listInfoInput({ page, pageSize }) },
        (payload) => asArray(payload.scripts),
        "getScriptListByType"
      );
    }
    case "superops_tasks_get": {
      const taskId = requiredId(args, "taskId");
      if (!taskId) return failed({ code: "malformed_input", message: "taskId is required", query: "getTask" });
      return runGet(client, E.GET_TASK, "getTask", { input: { taskId } }, (data) => data.getTask);
    }
    case "superops_tasks_list": {
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_TASK_LIST,
        "getTaskList",
        { listInfo: listInfoInput({ page, pageSize }) },
        (payload) => asArray(payload.tasks),
        "getTaskList"
      );
    }
    case "superops_work_statuses":
      return runBareList(client, E.GET_WORK_STATUS_LIST, "getWorkStatusList", undefined, (data) => asArray(data.getWorkStatusList));
    case "superops_worklogs_list": {
      const moduleName = stringArg(args.module).toUpperCase();
      if (moduleName !== "TICKET" && moduleName !== "PROJECT") {
        return failed({
          code: "malformed_input",
          message: "module is required and must be TICKET or PROJECT (official GetWorklogEntriesInput). There is no ticketId-only worklog query.",
          query: "getWorklogEntries",
        });
      }
      const { page, pageSize } = paging(args);
      return runPagedList(
        client,
        E.GET_WORKLOG_ENTRIES,
        "getWorklogEntries",
        { module: moduleName, listInfo: listInfoInput({ page, pageSize }) },
        (payload) => asArray(payload.entries),
        "getWorklogEntries"
      );
    }
    default:
      return null;
  }
}
