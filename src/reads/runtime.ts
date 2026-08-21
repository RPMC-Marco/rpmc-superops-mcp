import { asArray, asRecord, failureCode, omitStructuredEmail, type InvestigateStatus, upstreamFailureCategory } from "../investigate/common.js";
import { applyItDocSecretPolicy } from "../privacy/custom-fields.js";
import { toClientSafeError } from "../privacy/errors.js";
import { sanitizeTicketText } from "../privacy/redact.js";
import { pageClamp, stringArg } from "../superops/conditions.js";
import type { SuperOpsClient } from "../superops/client.js";
import { listInfoInput, queryBoundedList } from "../superops/list-search.js";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50;
export const DISK_LIMIT = 32;
export const USER_LOG_LIMIT = 25;
export const INVOICE_ITEM_LIMIT = 40;
export const TEXT_LIMIT = 4000;
export const README_LIMIT = 2000;

export function requiredId(args: Record<string, unknown>, key: string): string {
  return stringArg(args[key]);
}

export function failed(input: {
  code: string;
  message: string;
  query: string;
  logicalOperations?: string[];
  upstreamFailureCategory?: string;
}): Record<string, unknown> {
  return {
    status: "failed" as InvestigateStatus,
    code: input.code,
    message: input.message,
    items: [],
    provenance: {
      query: input.query,
      tenantScan: false,
      logicalOperations: input.logicalOperations ?? [],
      upstreamFailureCategory: input.upstreamFailureCategory ?? input.code,
      rpmcLiveConfirmed: false,
    },
  };
}

export function complete(payload: Record<string, unknown>, query: string, operations: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "complete" as InvestigateStatus,
    ...payload,
    provenance: {
      query,
      tenantScan: false,
      logicalOperations: operations,
      rpmcLiveConfirmed: false,
      ...extra,
    },
  };
}

export function sanitizeTextFields(value: unknown, keys = ["description", "notes", "readMe", "details", "content"]): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeTextFields(item, keys));
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(rec)) {
    if (keys.includes(key) && typeof child === "string") {
      const sanitized = sanitizeTicketText(child, key === "readMe" ? README_LIMIT : TEXT_LIMIT);
      out[key] = sanitized.text;
      if (sanitized.truncated || sanitized.credentialsRedacted || sanitized.htmlStripped) {
        out[`${key}Redaction`] = {
          truncated: sanitized.truncated,
          htmlStripped: sanitized.htmlStripped,
          credentialsRedacted: sanitized.credentialsRedacted,
        };
      }
    } else {
      out[key] = sanitizeTextFields(child, keys);
    }
  }
  return out;
}

export function privacy(value: unknown): unknown {
  return applyItDocSecretPolicy(sanitizeTextFields(omitStructuredEmail(value)));
}

export async function runGet(
  client: SuperOpsClient,
  query: string,
  operation: string,
  variables: Record<string, unknown>,
  extract: (data: Record<string, unknown>) => unknown
): Promise<Record<string, unknown>> {
  const operations = [operation];
  try {
    const data = asRecord(await client.query(query, variables));
    const item = extract(data);
    if (item == null || (typeof item === "object" && !Array.isArray(item) && Object.keys(asRecord(item)).length === 0)) {
      return failed({ code: "not_found", message: `${operation} returned no record`, query: operation, logicalOperations: operations });
    }
    return complete({ item: privacy(item) }, operation, operations, { resolution: "id_direct" });
  } catch (error) {
    return failed({
      code: failureCode(error),
      message: toClientSafeError(error),
      query: operation,
      logicalOperations: operations,
      upstreamFailureCategory: upstreamFailureCategory(error),
    });
  }
}

export async function runBareList(
  client: SuperOpsClient,
  query: string,
  operation: string,
  variables: Record<string, unknown> | undefined,
  extract: (data: Record<string, unknown>) => unknown[]
): Promise<Record<string, unknown>> {
  const operations = [operation];
  try {
    const data = asRecord(await client.query(query, variables));
    const items = extract(data).map((item) => privacy(item));
    return complete({ items, returned: items.length }, operation, operations);
  } catch (error) {
    return failed({
      code: failureCode(error),
      message: toClientSafeError(error),
      query: operation,
      logicalOperations: operations,
      upstreamFailureCategory: upstreamFailureCategory(error),
    });
  }
}

export async function runPagedList(
  client: SuperOpsClient,
  query: string,
  operation: string,
  input: Record<string, unknown>,
  extract: (payload: Record<string, unknown>) => unknown[],
  listKey?: string,
  variableName: "input" | "listInfo" = "input"
): Promise<Record<string, unknown>> {
  const operations: string[] = [];
  const listed = await queryBoundedList(
    client,
    query,
    variableName === "listInfo" ? (input.listInfo as Record<string, unknown>) ?? input : input,
    operations,
    operation
  );
  if (!listed.ok) {
    return failed({
      code: listed.code,
      message: listed.message,
      query: operation,
      logicalOperations: operations,
      upstreamFailureCategory: listed.upstreamFailureCategory,
    });
  }
  const root = asRecord(listed.data);
  const payload = listKey ? asRecord(root[listKey]) : root;
  const listInfo = asRecord(payload.listInfo);
  const items = extract(payload).map((item) => privacy(item));
  return complete(
    {
      items,
      listInfo,
      returned: items.length,
      truncated: listInfo.hasMore === true,
    },
    operation,
    operations
  );
}

export function paging(args: Record<string, unknown>) {
  return pageClamp(args.page, args.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

export function listInput(args: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { page, pageSize } = paging(args);
  return { ...extra, listInfo: listInfoInput({ page, pageSize }) };
}

export { asArray, asRecord };
