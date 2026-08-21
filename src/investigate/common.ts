import { toClientSafeError } from "../privacy/errors.js";
import {
  SuperOpsError,
  SuperOpsHttpError,
  SuperOpsMalformedResponseError,
  SuperOpsRateLimitError,
  SuperOpsTimeoutError,
} from "../superops/errors.js";

export type InvestigateStatus = "complete" | "partial" | "failed";

export interface InvestigateNotice {
  code: string;
  message: string;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function timeMs(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function accountIdFrom(value: unknown): string | undefined {
  const rec = asRecord(value);
  return typeof rec.accountId === "string" && rec.accountId ? rec.accountId : undefined;
}

/**
 * Page-1 identity lookups cannot prove uniqueness when SuperOps reports more pages.
 * Later pages are not fetched.
 */
export function boundedLookupNotUnique(listInfo: Record<string, unknown>, exactMatchCount: number): boolean {
  if (exactMatchCount !== 1) return exactMatchCount > 1;
  return listInfo.hasMore === true;
}

/**
 * Keep only items whose nested client.accountId matches the resolved client.
 * Rows with a missing or different accountId are dropped so a name-filtered page
 * cannot silently attribute another client's records.
 */
export function pinItemsToAccountId(items: unknown[], accountId: string): { kept: unknown[]; dropped: number } {
  const kept: unknown[] = [];
  let dropped = 0;
  for (const item of items) {
    if (accountIdFrom(asRecord(item).client) === accountId) kept.push(item);
    else dropped += 1;
  }
  return { kept, dropped };
}

/** Strip structured `email` keys only. Does not rewrite freeform text fields. */
export function omitStructuredEmail(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(omitStructuredEmail);
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(rec)) {
    if (key === "email") continue;
    out[key] = omitStructuredEmail(child);
  }
  return out;
}

/** Asset/ticket aggregator: drop requester.email, keep userId/name and other identifiers. */
export function omitRequesterEmail(detail: Record<string, unknown>): Record<string, unknown> {
  if (!("requester" in detail)) return detail;
  const requester = detail.requester;
  if (!requester || typeof requester !== "object" || Array.isArray(requester)) {
    return detail;
  }
  const rec = requester as Record<string, unknown>;
  const { email: _email, ...rest } = rec;
  return { ...detail, requester: omitStructuredEmail(rest) };
}

export function isFilterConditionRejected(error: unknown): boolean {
  if (!(error instanceof SuperOpsError)) return false;
  const blob = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (/\brate[-\s]?limit|too many requests|throttl/.test(blob)) return false;
  return true;
}

export function failureCode(error: unknown): string {
  if (error instanceof SuperOpsRateLimitError) return "rate_limited";
  if (error instanceof SuperOpsTimeoutError) return "timeout";
  if (error instanceof SuperOpsHttpError) return "unavailable";
  if (error instanceof SuperOpsMalformedResponseError) return "unavailable";
  return "lookup_failed";
}

export function upstreamFailureCategory(error: unknown): string {
  if (error instanceof SuperOpsRateLimitError) return "rate_limited";
  if (error instanceof SuperOpsTimeoutError) return "timeout";
  if (error instanceof SuperOpsHttpError) return "http";
  if (error instanceof SuperOpsMalformedResponseError) return "malformed_response";
  if (error instanceof SuperOpsError) return "superops_error";
  return "unknown";
}

export function noticeFromError(code: string, error: unknown): InvestigateNotice {
  return { code, message: toClientSafeError(error) };
}
