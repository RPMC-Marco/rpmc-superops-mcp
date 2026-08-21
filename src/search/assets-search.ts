import type { SuperOpsClient } from "../superops/client.js";
import {
  and,
  conditionAttributes,
  exactIs,
  hasAnyFilter,
  pageClamp,
  stringArg,
} from "../superops/conditions.js";
import { queryGetAssetList } from "../superops/list-search.js";
import { asArray, asRecord, omitStructuredEmail, type InvestigateStatus } from "../investigate/common.js";
import { parseAssetId } from "../assets/asset-ref.js";

const FILTER_KEYS = ["assetId", "hostName", "name", "serialNumber", "status", "clientName", "siteName", "unmonitored"];

function searchFailed(input: {
  code: string;
  message: string;
  logicalOperations: string[];
  filterAttributes?: string[];
  query?: string;
  upstreamFailureCategory?: string;
}): Record<string, unknown> {
  return {
    status: "failed" as InvestigateStatus,
    code: input.code,
    message: input.message,
    items: [],
    provenance: {
      query: input.query ?? "getAssetList",
      tenantScan: false,
      resolution: "unresolved",
      filterAttributes: input.filterAttributes ?? [],
      sortAttribute: null,
      logicalOperations: input.logicalOperations,
      upstreamFailureCategory: input.upstreamFailureCategory ?? input.code,
    },
  };
}

export async function searchAssets(args: Record<string, unknown>, client: SuperOpsClient): Promise<Record<string, unknown>> {
  const logicalOperations: string[] = [];
  if (args.unmonitored === true) {
    return searchFailed({
      code: "unsupported_filter",
      message:
        "getUnMonitoredAssetList is not supported on the RPMC SuperOps tenant; unmonitored is not inferred by scanning getAssetList",
      logicalOperations,
      query: "getUnMonitoredAssetList",
      upstreamFailureCategory: "unsupported_on_rpmc",
    });
  }

  if (!hasAnyFilter(args, FILTER_KEYS.filter((key) => key !== "unmonitored"))) {
    return searchFailed({
      code: "malformed_input",
      message: "superops_assets_search requires at least one explicit filter; use superops_assets_list for an unfiltered page",
      logicalOperations,
    });
  }

  const identityKeys = ["assetId", "hostName", "name", "serialNumber"].filter((key) => stringArg(args[key]));
  if (identityKeys.length > 1) {
    return searchFailed({
      code: "malformed_input",
      message: "Provide at most one of assetId, hostName, name, serialNumber",
      logicalOperations,
    });
  }

  const operands = [];
  const assetId = stringArg(args.assetId);
  if (assetId) {
    const parsed = parseAssetId(assetId);
    if (!parsed.ok) {
      return searchFailed({
        code: parsed.code,
        message: parsed.message,
        logicalOperations,
      });
    }
    operands.push(exactIs("assetId", parsed.value));
  }
  const hostName = stringArg(args.hostName);
  if (hostName) operands.push(exactIs("hostName", hostName));
  const name = stringArg(args.name);
  if (name) operands.push(exactIs("name", name));
  const serialNumber = stringArg(args.serialNumber);
  if (serialNumber) operands.push(exactIs("serialNumber", serialNumber));
  const status = stringArg(args.status);
  if (status) operands.push(exactIs("status", status));
  const clientName = stringArg(args.clientName);
  if (clientName) operands.push(exactIs("client.name", clientName));
  const siteName = stringArg(args.siteName);
  if (siteName) operands.push(exactIs("site.name", siteName));

  const condition = and(operands);
  const filterAttributes = conditionAttributes(condition);
  const paging = pageClamp(args.page, args.pageSize);

  const listed = await queryGetAssetList(
    client,
    { page: paging.page, pageSize: paging.pageSize, condition },
    logicalOperations
  );

  if (!listed.ok) {
    return searchFailed({
      code: listed.code,
      message: listed.message,
      logicalOperations,
      filterAttributes,
      upstreamFailureCategory: listed.upstreamFailureCategory,
    });
  }

  const payload = asRecord(asRecord(listed.data).getAssetList);
  return {
    status: "complete" as InvestigateStatus,
    items: asArray(payload.assets).map((item) => omitStructuredEmail(item)),
    listInfo: payload.listInfo,
    warnings: [],
    provenance: {
      query: "getAssetList",
      tenantScan: false,
      resolution: "condition_default_order",
      filterAttributes,
      sortAttribute: null,
      logicalOperations,
      rpmcLiveConfirmed: true,
    },
  };
}
