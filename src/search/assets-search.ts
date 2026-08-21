import type { SuperOpsClient } from "../superops/client.js";
import * as Q from "../superops/queries.js";
import {
  and,
  conditionAttributes,
  exactIs,
  hasAnyFilter,
  pageClamp,
  sortBy,
  stringArg,
} from "../superops/conditions.js";
import { listInfoInput, queryBoundedList } from "../superops/list-search.js";
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
      logicalOperations: input.logicalOperations,
      upstreamFailureCategory: input.upstreamFailureCategory ?? input.code,
    },
  };
}

export async function searchAssets(args: Record<string, unknown>, client: SuperOpsClient): Promise<Record<string, unknown>> {
  const logicalOperations: string[] = [];
  if (!hasAnyFilter(args, FILTER_KEYS)) {
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
  const unmonitored = args.unmonitored === true;
  const query = unmonitored ? Q.GET_UNMONITORED_ASSET_LIST : Q.GET_ASSET_LIST;
  const operationName = unmonitored ? "getUnMonitoredAssetList" : "getAssetList";
  const sort = [sortBy("lastCommunicatedTime", "DESC")];

  const listed = await queryBoundedList(
    client,
    query,
    listInfoInput({ page: paging.page, pageSize: paging.pageSize, condition, sort }),
    logicalOperations,
    operationName
  );

  const finish = (data: unknown, resolution: string, sortApplied: string | null, warnings: Array<{ code: string; message: string }>) => {
    const payload = asRecord(asRecord(data)[unmonitored ? "getUnMonitoredAssetList" : "getAssetList"]);
    return {
      status: "complete" as InvestigateStatus,
      items: asArray(payload.assets).map((item) => omitStructuredEmail(item)),
      listInfo: payload.listInfo,
      warnings,
      provenance: {
        query: operationName,
        tenantScan: false,
        resolution,
        filterAttributes,
        sortAttribute: sortApplied,
        logicalOperations,
        rpmcLiveConfirmed: false,
      },
    };
  };

  if (!listed.ok && listed.code === "unsupported_filter") {
    const retry = await queryBoundedList(
      client,
      query,
      listInfoInput({ page: paging.page, pageSize: paging.pageSize, condition }),
      logicalOperations,
      operationName
    );
    if (!retry.ok) {
      return searchFailed({
        code: retry.code,
        message: retry.message,
        logicalOperations,
        filterAttributes,
        query: operationName,
        upstreamFailureCategory: retry.upstreamFailureCategory,
      });
    }
    return finish(retry.data, "condition_without_sort", null, [
      { code: "sort_unconfirmed", message: "lastCommunicatedTime sort was rejected; results use SuperOps default order" },
    ]);
  }

  if (!listed.ok) {
    return searchFailed({
      code: listed.code,
      message: listed.message,
      logicalOperations,
      filterAttributes,
      query: operationName,
      upstreamFailureCategory: listed.upstreamFailureCategory,
    });
  }

  return finish(listed.data, "condition_and_sort", "lastCommunicatedTime", []);
}
