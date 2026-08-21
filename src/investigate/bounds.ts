import { asArray, asRecord } from "./common.js";

export const SOFTWARE_PAGE_SIZE = 25;
export const PATCH_PAGE_SIZE = 100;
export const PATCH_NON_INSTALLED_LIMIT = 15;
export const ALERT_PAGE_SIZE = 25;
export const ALERT_ITEM_LIMIT = 15;

export function boundSoftware(payload: Record<string, unknown>) {
  const list = asRecord(payload.getAssetSoftwareList);
  const listInfo = asRecord(list.listInfo);
  const items = asArray(list.assetSoftwares);
  const hasMore = listInfo.hasMore === true;
  return {
    items,
    returned: items.length,
    totalCount: listInfo.totalCount ?? null,
    hasMore,
    truncated: hasMore,
    limit: SOFTWARE_PAGE_SIZE,
  };
}

export function boundPatches(payload: Record<string, unknown>) {
  const details = asRecord(payload.getAssetPatchDetails);
  const patches = asArray(details.assetPatches).map(asRecord);
  const listInfo = asRecord(details.listInfo);
  const byInstallationStatus: Record<string, number> = {};
  for (const patch of patches) {
    const status = typeof patch.installationStatus === "string" ? patch.installationStatus : "unknown";
    byInstallationStatus[status] = (byInstallationStatus[status] ?? 0) + 1;
  }
  const notable = patches
    .filter((patch) => patch.installationStatus !== "Installed")
    .slice(0, PATCH_NON_INSTALLED_LIMIT);
  const hasMore = listInfo.hasMore === true;
  return {
    summary: {
      returned: patches.length,
      totalCount: listInfo.totalCount ?? null,
      hasMore,
      byInstallationStatus,
    },
    items: notable,
    truncated: hasMore || notable.length === PATCH_NON_INSTALLED_LIMIT,
  };
}

export function isUnresolvedAlert(alert: Record<string, unknown>): boolean {
  const status = String(alert.status ?? "");
  if (/resolved|closed|cleared/i.test(status)) return false;
  if (typeof alert.resolvedTime === "string" && alert.resolvedTime.trim()) return false;
  return true;
}
