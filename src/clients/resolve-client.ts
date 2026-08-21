import type { SuperOpsClient } from "../superops/client.js";
import * as Q from "../superops/queries.js";
import { exactIs, includesValues } from "../superops/conditions.js";
import { listInfoInput, queryBoundedList } from "../superops/list-search.js";
import { asArray, asRecord, failureCode, upstreamFailureCategory } from "../investigate/common.js";
import { toClientSafeError } from "../privacy/errors.js";
import { SuperOpsMalformedResponseError } from "../superops/errors.js";

export const CLIENT_LOOKUP_PAGE_SIZE = 5;

export type ClientResolution =
  | { ok: true; accountId: string; method: string; logicalOperations: string[]; detail: Record<string, unknown> }
  | {
      ok: false;
      code: string;
      message: string;
      method: string;
      logicalOperations: string[];
      candidates?: Array<Record<string, unknown>>;
      upstreamFailureCategory?: string;
    };

async function loadClient(client: SuperOpsClient, accountId: string, operations: string[]) {
  operations.push("getClient");
  const data = asRecord(await client.query(Q.GET_CLIENT, { input: { accountId } }));
  const detail = asRecord(data.getClient ?? data);
  if (typeof detail.accountId !== "string" || !detail.accountId) {
    throw new SuperOpsMalformedResponseError("getClient returned no accountId");
  }
  return detail;
}

export async function resolveClient(
  api: SuperOpsClient,
  identity: { key: string; value: string }
): Promise<ClientResolution> {
  const operations: string[] = [];
  if (identity.key === "accountId") {
    try {
      const detail = await loadClient(api, identity.value, operations);
      return { ok: true, accountId: detail.accountId as string, method: "accountId_direct", logicalOperations: operations, detail };
    } catch (error) {
      return {
        ok: false,
        code: failureCode(error),
        message: toClientSafeError(error),
        method: "accountId_direct",
        logicalOperations: operations,
        upstreamFailureCategory: upstreamFailureCategory(error),
      };
    }
  }

  const field = identity.key === "emailDomain" ? "emailDomains" : "name";
  const condition = identity.key === "emailDomain" ? includesValues("emailDomains", [identity.value]) : exactIs("name", identity.value);
  const method = identity.key === "emailDomain" ? "emailDomains_condition_includes" : "name_condition_is";
  const listed = await queryBoundedList(
    api,
    Q.GET_CLIENT_LIST,
    listInfoInput({ page: 1, pageSize: CLIENT_LOOKUP_PAGE_SIZE, condition }),
    operations,
    "getClientList"
  );
  if (!listed.ok) {
    return {
      ok: false,
      code: listed.code,
      message: listed.message,
      method: "unresolved",
      logicalOperations: operations,
      upstreamFailureCategory: listed.upstreamFailureCategory,
    };
  }
  const payload = asRecord(asRecord(listed.data).getClientList);
  const clients = asArray(payload.clients).map(asRecord);
  const exact =
    field === "name"
      ? clients.filter((item) => item.name === identity.value)
      : clients.filter((item) => asArray(item.emailDomains).includes(identity.value));
  if (exact.length === 0) {
    return { ok: false, code: "not_found", message: "No client matched the identifier", method, logicalOperations: operations };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      code: "ambiguous",
      message: "Multiple clients matched the identifier",
      method,
      logicalOperations: operations,
      candidates: exact.map((item) => ({ accountId: item.accountId, name: item.name })),
    };
  }
  const accountId = exact[0]?.accountId;
  if (typeof accountId !== "string" || !accountId) {
    return { ok: false, code: "lookup_failed", message: "Matched client did not include accountId", method, logicalOperations: operations };
  }
  try {
    const detail = await loadClient(api, accountId, operations);
    return { ok: true, accountId, method, logicalOperations: operations, detail };
  } catch (error) {
    return {
      ok: false,
      code: failureCode(error),
      message: toClientSafeError(error),
      method,
      logicalOperations: operations,
      upstreamFailureCategory: upstreamFailureCategory(error),
    };
  }
}
