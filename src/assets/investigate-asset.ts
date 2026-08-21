import type { SuperOpsClient } from "../superops/client.js";
import { SuperOpsError, SuperOpsMalformedResponseError } from "../superops/errors.js";
import * as Q from "../superops/queries.js";
import { toClientSafeError } from "../privacy/errors.js";
import { sanitizeTicketText } from "../privacy/redact.js";
import { classifyAssetRef } from "./asset-ref.js";
import {
  ALERT_ITEM_LIMIT,
  ALERT_PAGE_SIZE,
  boundPatches,
  boundSoftware,
  isUnresolvedAlert,
  PATCH_PAGE_SIZE,
  SOFTWARE_PAGE_SIZE,
} from "../investigate/bounds.js";
import {
  asArray,
  asRecord,
  failureCode,
  isFilterConditionRejected,
  noticeFromError,
  omitRequesterEmail,
  omitStructuredEmail,
  timeMs,
  upstreamFailureCategory,
  type InvestigateNotice,
  type InvestigateStatus,
} from "../investigate/common.js";

export type AssetResolutionMethod = "assetId_direct" | "unresolved";

interface SectionState {
  asset: "ok" | "failed";
  software: "ok" | "failed" | "truncated";
  patches: "ok" | "failed" | "truncated";
  alerts: "ok" | "failed" | "truncated" | "unavailable";
}

function failedResult(input: {
  suppliedAssetId: string;
  classifiedAs: string;
  code: string;
  message: string;
  resolution: AssetResolutionMethod;
  logicalOperations: string[];
  upstreamFailureCategory?: string;
}): Record<string, unknown> {
  return {
    status: "failed" as InvestigateStatus,
    code: input.code,
    message: input.message,
    warnings: [],
    errors: [{ code: input.code, message: input.message }],
    provenance: {
      supplied: { assetId: input.suppliedAssetId },
      classifiedAs: input.classifiedAs,
      resolution: input.resolution,
      assetId: null,
      sections: {
        asset: "failed",
        software: "failed",
        patches: "failed",
        alerts: "unavailable",
      },
      truncated: {},
      logicalOperations: input.logicalOperations,
      assetLookup: { method: "getAsset", documented: true },
      alertFilter: {
        query: "getAlertsForAsset",
        tenantScan: false,
        documented: true,
        rpmcLiveConfirmed: false,
      },
      upstreamFailureCategory: input.upstreamFailureCategory ?? input.code,
    },
  };
}

function sanitizeAlert(item: unknown) {
  const rec = asRecord(item);
  const message = sanitizeTicketText(rec.message);
  const description = sanitizeTicketText(rec.description);
  const asset = omitStructuredEmail(rec.asset);
  return {
    id: rec.id,
    status: rec.status,
    severity: rec.severity,
    createdTime: rec.createdTime,
    resolvedTime: rec.resolvedTime,
    occurrenceCount: rec.occurrenceCount,
    message: message.text,
    description: description.text,
    redaction: {
      truncated: message.truncated || description.truncated,
      htmlStripped: message.htmlStripped || description.htmlStripped,
      credentialsRedacted: message.credentialsRedacted || description.credentialsRedacted,
    },
    asset,
    policy: rec.policy,
  };
}

function boundAlerts(rawItems: unknown[]) {
  const sanitized = rawItems.map(sanitizeAlert).map((item) => ({
    ...item,
    _unresolved: isUnresolvedAlert(item),
    _createdMs: timeMs(item.createdTime),
  }));
  sanitized.sort((a, b) => {
    if (a._unresolved !== b._unresolved) return a._unresolved ? -1 : 1;
    return b._createdMs - a._createdMs;
  });
  const truncated = sanitized.length > ALERT_ITEM_LIMIT;
  const items = sanitized.slice(0, ALERT_ITEM_LIMIT).map(({ _unresolved, _createdMs, ...item }) => item);
  return {
    items,
    returned: items.length,
    totalCount: sanitized.length,
    truncated,
    limit: ALERT_ITEM_LIMIT,
  };
}

const CREATED_TIME_SORT = [{ attribute: "createdTime", order: "DESC" as const }];

function isSortRejected(error: unknown): boolean {
  if (!isFilterConditionRejected(error)) return false;
  const blob = error instanceof Error ? error.message.toLowerCase() : "";
  return /sort|attribute/.test(blob);
}

async function loadAssetAlerts(
  client: SuperOpsClient,
  assetId: string,
  operations: string[]
): Promise<{
  payload: Record<string, unknown>;
  sortApplied: "createdTime_desc" | "none";
}> {
  const tryQuery = async (sort: typeof CREATED_TIME_SORT | undefined) => {
    operations.push("getAlertsForAsset");
    const listInfo: Record<string, unknown> = { page: 1, pageSize: ALERT_PAGE_SIZE };
    if (sort) listInfo.sort = sort;
    return asRecord(
      await client.query(Q.GET_ALERTS_FOR_ASSET, {
        input: { assetId, listInfo },
      })
    );
  };

  try {
    return { payload: await tryQuery(CREATED_TIME_SORT), sortApplied: "createdTime_desc" };
  } catch (error) {
    if (!isSortRejected(error)) throw error;
    return { payload: await tryQuery(undefined), sortApplied: "none" };
  }
}

export async function investigateAsset(
  args: { assetId?: unknown },
  client: SuperOpsClient
): Promise<Record<string, unknown>> {
  const classified = classifyAssetRef(args.assetId);
  const logicalOperations: string[] = [];
  const warnings: InvestigateNotice[] = [];
  const errors: InvestigateNotice[] = [];
  const sections: SectionState = {
    asset: "failed",
    software: "failed",
    patches: "failed",
    alerts: "unavailable",
  };

  if (classified.kind === "malformed") {
    return failedResult({
      suppliedAssetId: classified.value,
      classifiedAs: "malformed",
      code: "malformed_asset",
      message: "assetId must be a SuperOps internal assetId (numeric ID)",
      resolution: "unresolved",
      logicalOperations,
    });
  }

  if (classified.kind === "unsupported_human") {
    return failedResult({
      suppliedAssetId: classified.value,
      classifiedAs: "unsupported_human",
      code: "human_lookup_unconfirmed",
      message:
        "Name, hostName, and serialNumber are documented Asset fields but are not documented as server-side filter attributes. investigate_asset currently requires the internal assetId. Do not tenant-scan for a human identifier.",
      resolution: "unresolved",
      logicalOperations,
    });
  }

  const assetId = classified.value;
  let detail: Record<string, unknown>;
  try {
    logicalOperations.push("getAsset");
    const data = asRecord(await client.query(Q.GET_ASSET, { input: { assetId } }));
    detail = omitRequesterEmail(asRecord(data.getAsset ?? data));
    if (typeof detail.assetId !== "string" || !detail.assetId) {
      throw new SuperOpsMalformedResponseError("getAsset returned no assetId");
    }
    sections.asset = "ok";
  } catch (error) {
    return failedResult({
      suppliedAssetId: assetId,
      classifiedAs: "assetId",
      code: failureCode(error),
      message: toClientSafeError(error),
      resolution: "assetId_direct",
      logicalOperations,
      upstreamFailureCategory: upstreamFailureCategory(error),
    });
  }

  let software: ReturnType<typeof boundSoftware> | null = null;
  try {
    logicalOperations.push("getAssetSoftwareList");
    const data = asRecord(
      await client.query(Q.GET_ASSET_SOFTWARE_LIST, {
        input: { assetId, listInfo: { page: 1, pageSize: SOFTWARE_PAGE_SIZE } },
      })
    );
    software = boundSoftware(data);
    sections.software = software.truncated ? "truncated" : "ok";
  } catch (error) {
    sections.software = "failed";
    errors.push(noticeFromError("software_unavailable", error));
  }

  let patches: ReturnType<typeof boundPatches> | null = null;
  try {
    logicalOperations.push("getAssetPatchDetails");
    const data = asRecord(
      await client.query(Q.GET_ASSET_PATCH_DETAILS, {
        input: { assetId, listInfo: { page: 1, pageSize: PATCH_PAGE_SIZE } },
      })
    );
    patches = boundPatches(data);
    sections.patches = patches.truncated ? "truncated" : "ok";
  } catch (error) {
    sections.patches = "failed";
    errors.push(noticeFromError("patches_unavailable", error));
  }

  const alertFilter: Record<string, unknown> = {
    query: "getAlertsForAsset",
    tenantScan: false,
    documented: true,
    rpmcLiveConfirmed: false,
    sortApplied: "none",
  };
  let alerts: Record<string, unknown> = {
    status: "unavailable",
    reason: "getAlertsForAsset_unconfirmed_on_rpmc",
    items: [],
    returned: 0,
    totalCount: 0,
    truncated: false,
    limit: ALERT_ITEM_LIMIT,
    filter: alertFilter,
  };

  try {
    const loaded = await loadAssetAlerts(client, assetId, logicalOperations);
    alertFilter.sortApplied = loaded.sortApplied;
    const list = asRecord(loaded.payload.getAlertsForAsset);
    const listInfo = asRecord(list.listInfo);
    const bounded = boundAlerts(asArray(list.alerts));
    const pageTruncated = listInfo.hasMore === true || bounded.truncated;
    sections.alerts = pageTruncated ? "truncated" : "ok";
    alerts = {
      status: pageTruncated ? "truncated" : "ok",
      items: bounded.items,
      returned: bounded.returned,
      totalCount: listInfo.totalCount ?? bounded.totalCount,
      hasMore: listInfo.hasMore === true,
      truncated: pageTruncated,
      limit: ALERT_ITEM_LIMIT,
      pageSize: ALERT_PAGE_SIZE,
      filter: alertFilter,
    };
    if (loaded.sortApplied === "none") {
      warnings.push({
        code: "alert_sort_unconfirmed",
        message: "createdTime DESC sort was rejected; alerts were returned in SuperOps default order and reordered locally within the bounded page",
      });
    }
  } catch (error) {
    sections.alerts = "unavailable";
    errors.push(noticeFromError("alerts_unavailable", error));
    alerts = {
      ...alerts,
      status: "unavailable",
      reason: error instanceof SuperOpsError ? "getAlertsForAsset_rejected" : "getAlertsForAsset_failed",
      filter: alertFilter,
    };
  }

  const supportingFailed = [sections.software, sections.patches].some((section) => section === "failed");
  const status: InvestigateStatus = supportingFailed ? "partial" : "complete";

  return {
    status,
    asset: {
      status: "ok",
      assetId: detail.assetId,
      name: detail.name,
      hostName: detail.hostName,
      serialNumber: detail.serialNumber,
      client: detail.client,
      site: detail.site,
      platform: detail.platform,
      platformFamily: detail.platformFamily,
      platformCategory: detail.platformCategory,
      platformVersion: detail.platformVersion,
      statusValue: detail.status,
      lastCommunicatedTime: detail.lastCommunicatedTime,
      lastReportedTime: detail.lastReportedTime,
      agentVersion: detail.agentVersion,
      patchStatus: detail.patchStatus,
      deviceCategory: detail.deviceCategory,
      manufacturer: detail.manufacturer,
      model: detail.model,
      detail,
    },
    software,
    patches,
    alerts,
    warnings,
    errors,
    provenance: {
      supplied: { assetId },
      classifiedAs: "assetId",
      resolution: "assetId_direct",
      assetId: detail.assetId,
      sections,
      truncated: {
        software: sections.software === "truncated",
        patches: sections.patches === "truncated",
        alerts: sections.alerts === "truncated",
      },
      logicalOperations,
      assetLookup: { method: "getAsset", documented: true },
      alertFilter,
    },
  };
}
