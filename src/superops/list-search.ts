import type { SuperOpsClient } from "./client.js";
import { SuperOpsError } from "./errors.js";
import { failureCode, isFilterConditionRejected, upstreamFailureCategory } from "../investigate/common.js";
import { toClientSafeError } from "../privacy/errors.js";
import type { Condition } from "./conditions.js";

export interface ListQueryFailure {
  ok: false;
  code: "unsupported_filter" | "lookup_failed" | "rate_limited" | "timeout" | "unavailable";
  message: string;
  upstreamFailureCategory: string;
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
    if (error instanceof SuperOpsError && isFilterConditionRejected(error)) {
      return {
        ok: false,
        code: "unsupported_filter",
        message: "SuperOps rejected the requested filter or sort; no tenant scan was performed",
        upstreamFailureCategory: upstreamFailureCategory(error),
      };
    }
    return {
      ok: false,
      code: "lookup_failed",
      message: toClientSafeError(error),
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
