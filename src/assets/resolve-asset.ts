import type { SuperOpsClient } from "../superops/client.js";
import * as Q from "../superops/queries.js";
import { exactIs } from "../superops/conditions.js";
import { listInfoInput, queryBoundedList } from "../superops/list-search.js";
import { asArray, asRecord } from "../investigate/common.js";
import { ASSET_ID_PATTERN } from "./asset-ref.js";

export const ASSET_LOOKUP_PAGE_SIZE = 5;

export type AssetResolution =
  | { ok: true; assetId: string; method: string; logicalOperations: string[] }
  | {
      ok: false;
      code: string;
      message: string;
      method: string;
      logicalOperations: string[];
      candidates?: Array<Record<string, unknown>>;
      upstreamFailureCategory?: string;
    };

function exactFieldMatches(assets: Record<string, unknown>[], field: string, value: string) {
  return assets.filter((asset) => asset[field] === value);
}

async function resolveByList(
  client: SuperOpsClient,
  field: "hostName" | "name" | "serialNumber",
  value: string,
  operations: string[]
): Promise<AssetResolution> {
  const method = `${field}_condition_is`;
  const listed = await queryBoundedList(
    client,
    Q.GET_ASSET_LIST,
    listInfoInput({
      page: 1,
      pageSize: ASSET_LOOKUP_PAGE_SIZE,
      condition: exactIs(field, value),
    }),
    operations,
    "getAssetList"
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
  const payload = asRecord(asRecord(listed.data).getAssetList);
  const assets = asArray(payload.assets).map(asRecord);
  const exact = exactFieldMatches(assets, field, value);
  if (exact.length === 0) {
    return { ok: false, code: "not_found", message: `No asset matched ${field}`, method, logicalOperations: operations };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      code: "ambiguous",
      message: `Multiple assets matched ${field}`,
      method,
      logicalOperations: operations,
      candidates: exact.map((asset) => ({
        assetId: asset.assetId,
        name: asset.name,
        hostName: asset.hostName,
        serialNumber: asset.serialNumber,
      })),
    };
  }
  const assetId = exact[0]?.assetId;
  if (typeof assetId !== "string" || !assetId) {
    return { ok: false, code: "lookup_failed", message: "Matched asset did not include assetId", method, logicalOperations: operations };
  }
  return { ok: true, assetId, method, logicalOperations: operations };
}

export async function resolveAsset(
  client: SuperOpsClient,
  identity: { key: string; value: string }
): Promise<AssetResolution> {
  const operations: string[] = [];
  if (identity.key === "assetId") {
    if (!ASSET_ID_PATTERN.test(identity.value)) {
      return {
        ok: false,
        code: "malformed_input",
        message: "assetId must be a SuperOps internal numeric ID; use hostName, name, or serialNumber for human identifiers",
        method: "unresolved",
        logicalOperations: operations,
      };
    }
    return { ok: true, assetId: identity.value, method: "assetId_direct", logicalOperations: operations };
  }
  if (identity.key === "hostName" || identity.key === "name" || identity.key === "serialNumber") {
    return resolveByList(client, identity.key, identity.value, operations);
  }
  return {
    ok: false,
    code: "malformed_input",
    message: "Unknown asset identity field",
    method: "unresolved",
    logicalOperations: operations,
  };
}
