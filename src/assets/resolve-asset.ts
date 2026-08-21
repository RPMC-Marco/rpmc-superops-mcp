import type { SuperOpsClient } from "../superops/client.js";
import { exactIs } from "../superops/conditions.js";
import { queryGetAssetList } from "../superops/list-search.js";
import { asArray, asRecord, boundedLookupNotUnique } from "../investigate/common.js";
import { parseAssetId } from "./asset-ref.js";

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
  const listed = await queryGetAssetList(
    client,
    {
      page: 1,
      pageSize: ASSET_LOOKUP_PAGE_SIZE,
      condition: exactIs(field, value),
    },
    operations
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
  const listInfo = asRecord(payload.listInfo);
  const assets = asArray(payload.assets).map(asRecord);
  const exact = exactFieldMatches(assets, field, value);
  if (exact.length === 0) {
    return { ok: false, code: "not_found", message: `No asset matched ${field}`, method, logicalOperations: operations };
  }
  if (boundedLookupNotUnique(listInfo, exact.length)) {
    return {
      ok: false,
      code: "ambiguous",
      message:
        exact.length > 1
          ? `Multiple assets matched ${field}`
          : `Asset ${field} match was not proven unique because more pages exist`,
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
    const parsed = parseAssetId(identity.value);
    if (!parsed.ok) {
      return {
        ok: false,
        code: parsed.code,
        message: parsed.message,
        method: "unresolved",
        logicalOperations: operations,
      };
    }
    return { ok: true, assetId: parsed.value, method: "assetId_direct", logicalOperations: operations };
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
