import type { SuperOpsClient } from "../superops/client.js";
import * as Q from "../superops/queries.js";
import { sanitizeTicketText } from "../privacy/redact.js";
import {
  and,
  conditionAttributes,
  exactIs,
  hasAnyFilter,
  includesValues,
  inLastDays,
  isDatePreset,
  onPlaceholder,
  pageClamp,
  sortBy,
  stringArg,
  stringList,
} from "../superops/conditions.js";
import { listInfoInput, queryBoundedList } from "../superops/list-search.js";
import { asArray, asRecord, omitStructuredEmail, type InvestigateStatus } from "../investigate/common.js";
import { parseAssetId } from "../assets/asset-ref.js";
import { ALERT_PAGE_SIZE } from "../investigate/bounds.js";

const FILTER_KEYS = ["assetId", "status", "severity", "created", "createdInLastDays"];

function sanitizeAlert(item: unknown) {
  const rec = asRecord(item);
  const message = sanitizeTicketText(rec.message);
  const description = sanitizeTicketText(rec.description);
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
    asset: omitStructuredEmail(rec.asset),
    policy: rec.policy,
  };
}

function searchFailed(input: {
  code: string;
  message: string;
  logicalOperations: string[];
  query?: string;
  filterAttributes?: string[];
  upstreamFailureCategory?: string;
}): Record<string, unknown> {
  return {
    status: "failed" as InvestigateStatus,
    code: input.code,
    message: input.message,
    items: [],
    provenance: {
      query: input.query ?? "getAlertList",
      tenantScan: false,
      resolution: "unresolved",
      filterAttributes: input.filterAttributes ?? [],
      logicalOperations: input.logicalOperations,
      upstreamFailureCategory: input.upstreamFailureCategory ?? input.code,
    },
  };
}

export async function searchAlerts(args: Record<string, unknown>, client: SuperOpsClient): Promise<Record<string, unknown>> {
  const logicalOperations: string[] = [];
  if (!hasAnyFilter(args, FILTER_KEYS)) {
    return searchFailed({
      code: "malformed_input",
      message: "superops_alerts_search requires at least one explicit filter; use superops_alerts_list for an unfiltered page",
      logicalOperations,
    });
  }

  const operands = [];
  const statuses = stringList(args.status);
  if (statuses.length === 1) operands.push(exactIs("status", statuses[0]));
  else if (statuses.length > 1) operands.push(includesValues("status", statuses));
  const severities = stringList(args.severity);
  if (severities.length === 1) operands.push(exactIs("severity", severities[0]));
  else if (severities.length > 1) operands.push(includesValues("severity", severities));
  if (isDatePreset(args.created)) operands.push(onPlaceholder("createdTime", args.created));
  if (typeof args.createdInLastDays === "number" && args.createdInLastDays >= 1 && args.createdInLastDays <= 31) {
    operands.push(inLastDays("createdTime", Math.floor(args.createdInLastDays)));
  } else if (args.createdInLastDays != null && args.createdInLastDays !== "") {
    return searchFailed({
      code: "malformed_input",
      message: "createdInLastDays must be an integer from 1 to 31",
      logicalOperations,
    });
  }

  const condition = and(operands);
  const filterAttributes = conditionAttributes(condition);
  const paging = pageClamp(args.page, args.pageSize, 25, ALERT_PAGE_SIZE);
  const assetId = stringArg(args.assetId);
  const sort = [sortBy("createdTime", "DESC")];

  if (assetId) {
    const parsed = parseAssetId(assetId);
    if (!parsed.ok) {
      return searchFailed({
        code: parsed.code,
        message: parsed.message,
        logicalOperations,
        query: "getAlertsForAsset",
      });
    }
    const listed = await queryBoundedList(
      client,
      Q.GET_ALERTS_FOR_ASSET,
      { assetId: parsed.value, listInfo: listInfoInput({ page: paging.page, pageSize: paging.pageSize, condition, sort }) },
      logicalOperations,
      "getAlertsForAsset"
    );
    if (!listed.ok) {
      return searchFailed({
        code: listed.code,
        message: listed.message,
        logicalOperations,
        query: "getAlertsForAsset",
        filterAttributes: ["assetId", ...filterAttributes],
        upstreamFailureCategory: listed.upstreamFailureCategory,
      });
    }
    const payload = asRecord(asRecord(listed.data).getAlertsForAsset);
    return {
      status: "complete" as InvestigateStatus,
      items: asArray(payload.alerts).map(sanitizeAlert),
      listInfo: payload.listInfo,
      warnings: [],
      provenance: {
        query: "getAlertsForAsset",
        tenantScan: false,
        resolution: "asset_scoped",
        filterAttributes: ["assetId", ...filterAttributes],
        sortAttribute: "createdTime",
        logicalOperations,
        rpmcLiveConfirmed: true,
      },
    };
  }

  const listed = await queryBoundedList(
    client,
    Q.GET_ALERT_LIST,
    listInfoInput({ page: paging.page, pageSize: paging.pageSize, condition, sort }),
    logicalOperations,
    "getAlertList"
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
  const payload = asRecord(asRecord(listed.data).getAlertList);
  return {
    status: "complete" as InvestigateStatus,
    items: asArray(payload.alerts).map(sanitizeAlert),
    listInfo: payload.listInfo,
    warnings: [],
    provenance: {
      query: "getAlertList",
      tenantScan: false,
      resolution: "condition_and_sort",
      filterAttributes,
      sortAttribute: "createdTime",
      logicalOperations,
      rpmcLiveConfirmed: true,
    },
  };
}
