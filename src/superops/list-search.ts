import type { SuperOpsClient } from "./client.js";
import { SuperOpsError } from "./errors.js";
import { failureCode, isFilterConditionRejected, upstreamFailureCategory } from "../investigate/common.js";
import { toClientSafeError } from "../privacy/errors.js";
import type { Condition } from "./conditions.js";
import { GET_ASSET_LIST } from "./queries.js";

export interface ListQueryFailure {
  ok: false;
  code: "unsupported_filter" | "query_failed" | "lookup_failed" | "rate_limited" | "timeout" | "unavailable";
  message: string;
  upstreamFailureCategory: string;
}

function attemptedFilterOrSort(input: Record<string, unknown>): boolean {
  if (input.condition != null) return true;
  if (Array.isArray(input.sort) && input.sort.length > 0) return true;
  const nested =
    input.listInfo && typeof input.listInfo === "object" && !Array.isArray(input.listInfo)
      ? (input.listInfo as Record<string, unknown>)
      : {};
  if (nested.condition != null) return true;
  return Array.isArray(nested.sort) && nested.sort.length > 0;
}

export async function queryBoundedList(
  client: SuperOpsClient,
  query: string,
  input: Record<string, unknown>,
  operations: string[],
  operationName: string
): Promise<{ ok: true; data: unknown } | ListQueryFailure> {
  operations.push(operationName);
  try {
    return { ok: true, data: await client.query(query, { input }) };
  } catch (error) {
    const code = failureCode(error);
    if (code === "rate_limited" || code === "timeout" || code === "unavailable") {
      return {
        ok: false,
        code,
        message: toClientSafeError(error),
        upstreamFailureCategory: upstreamFailureCategory(error),
      };
    }
    const filterOrSortAttempted = attemptedFilterOrSort(input);
    if (filterOrSortAttempted && error instanceof SuperOpsError && isFilterConditionRejected(error)) {
      return {
        ok: false,
        code: "unsupported_filter",
        message: "SuperOps rejected the requested filter or sort; no tenant scan was performed",
        upstreamFailureCategory: upstreamFailureCategory(error),
      };
    }
    return {
      ok: false,
      code: "query_failed",
      message: "SuperOps rejected the query; this was not a filter rejection",
      upstreamFailureCategory: upstreamFailureCategory(error),
    };
  }
}

export function listInfoInput(input: {
  page: number;
  pageSize: number;
  condition?: Condition;
  sort?: Array<{ attribute: string; order: "ASC" | "DESC" }>;
}): Record<string, unknown> {
  const listInfo: Record<string, unknown> = { page: input.page, pageSize: input.pageSize };
  if (input.condition) listInfo.condition = input.condition;
  if (input.sort?.length) listInfo.sort = input.sort;
  return listInfo;
}

/**
 * Shared getAssetList page. RPMC live-confirmed (0.1.6) that lastCommunicatedTime
 * DESC is rejected. Do not send that sort, and do not spend a retry round-trip on it.
 * SuperOps default order is the honest contract.
 */
export async function queryGetAssetList(
  client: SuperOpsClient,
  input: { page: number; pageSize: number; condition?: Condition },
  operations: string[]
): Promise<{ ok: true; data: unknown } | ListQueryFailure> {
  return queryBoundedList(
    client,
    GET_ASSET_LIST,
    listInfoInput({ page: input.page, pageSize: input.pageSize, condition: input.condition }),
    operations,
    "getAssetList"
  );
}
