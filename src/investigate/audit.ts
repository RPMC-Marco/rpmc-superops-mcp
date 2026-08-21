import type { InvestigateStatus } from "./common.js";
import { asArray, asRecord } from "./common.js";

export interface InvestigationAudit {
  outcome: InvestigateStatus;
  errorCode?: string;
  metadata: Record<string, unknown>;
}

function firstErrorCode(result: Record<string, unknown>): string | undefined {
  const errors = asArray(result.errors).map(asRecord);
  const code = errors[0]?.code;
  return typeof code === "string" && code ? code : undefined;
}

function asStringMap(value: unknown): Record<string, string> | undefined {
  const rec = asRecord(value);
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(rec)) {
    if (typeof child === "string") out[key] = child;
  }
  return Object.keys(out).length ? out : undefined;
}

function asBoolMap(value: unknown): Record<string, boolean> | undefined {
  const rec = asRecord(value);
  const out: Record<string, boolean> = {};
  for (const [key, child] of Object.entries(rec)) {
    if (typeof child === "boolean") out[key] = child;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Build privacy-safe aggregator audit metadata from a result payload.
 * Never copies ticket/asset bodies, subjects, names, or emails.
 */
export function investigationAuditFromResult(result: Record<string, unknown>): InvestigationAudit {
  const provenance = asRecord(result.provenance);
  const status = result.status;
  const outcome: InvestigateStatus =
    status === "complete" || status === "partial" || status === "failed" ? status : "failed";
  const errorCode =
    typeof result.code === "string" && result.code ? result.code : outcome === "complete" ? undefined : firstErrorCode(result);

  const logicalOperations = asArray(provenance.logicalOperations).filter((item) => typeof item === "string") as string[];
  const metadata: Record<string, unknown> = {
    resolution: typeof provenance.resolution === "string" ? provenance.resolution : undefined,
    classifiedAs: typeof provenance.classifiedAs === "string" ? provenance.classifiedAs : undefined,
    identifierKind: typeof provenance.classifiedAs === "string" ? provenance.classifiedAs : undefined,
    sections: asStringMap(provenance.sections),
    truncated: asBoolMap(provenance.truncated),
    logicalOperations,
  };

  if (typeof provenance.upstreamFailureCategory === "string") {
    metadata.upstreamFailureCategory = provenance.upstreamFailureCategory;
  } else if (outcome === "failed" && errorCode) {
    metadata.upstreamFailureCategory = errorCode;
  }

  const alertFilter = asRecord(provenance.alertFilter);
  if (Object.keys(alertFilter).length) {
    metadata.alertFilter = {
      query: typeof alertFilter.query === "string" ? alertFilter.query : undefined,
      tenantScan: alertFilter.tenantScan === true,
      documented: alertFilter.documented === true,
      rpmcLiveConfirmed: alertFilter.rpmcLiveConfirmed === true,
      sortApplied: typeof alertFilter.sortApplied === "string" ? alertFilter.sortApplied : undefined,
    };
  }

  const assetLookup = asRecord(provenance.assetLookup);
  if (Object.keys(assetLookup).length) {
    metadata.assetLookup = {
      method: typeof assetLookup.method === "string" ? assetLookup.method : undefined,
      documented: assetLookup.documented === true,
    };
  }

  const candidates = asArray(result.candidates);
  if (candidates.length) metadata.candidateCount = candidates.length;

  return { outcome, errorCode, metadata };
}
