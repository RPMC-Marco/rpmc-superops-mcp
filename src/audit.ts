export type ToolClassification = "read" | "write_low" | "write_visible" | "disruptive" | "destructive";
export type ToolOutcome = "complete" | "partial" | "failed";

export interface AuditEvent {
  event: "mcp.tool_call";
  timestamp: string;
  requestId?: string;
  toolName: string;
  classification: ToolClassification;
  /**
   * Whether the tool achieved its intended result.
   * Aggregators: true only when outcome is `complete`.
   * Primitive reads: true when the handler returned data (`isError` is false).
   * Do not treat this as “the MCP handler returned normally” for aggregators;
   * a failed or partial investigation is `success: false` with an explicit `outcome`.
   */
  success: boolean;
  /** complete | partial | failed — partial is only used by aggregators. */
  outcome: ToolOutcome;
  errorCode?: string;
  durationMs: number;
  errorSummary?: string;
  metadata?: Record<string, unknown>;
}

const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(access_token|refresh_token|client_secret|authorization|api[_-]?token|password|passwd|pwd)\b\s*[:=]\s*["']?[^"',\s}]+/gi,
  /\bSUPEROPS_API_TOKEN\b/gi,
  /\bMCP_AUTH_TOKEN\b/gi,
];

const DENIED_METADATA_KEYS = new Set([
  "content",
  "subject",
  "email",
  "originalbody",
  "message",
  "description",
  "publicip",
  "requester",
  "name",
  "firstname",
  "lastname",
  "hostname",
  "serialnumber",
  "body",
  "text",
  "password",
  "token",
  "ip",
  "ipaddress",
]);

const ALLOWED_METADATA_KEYS = new Set([
  "operationKind",
  "argumentKeys",
  "resolution",
  "classifiedAs",
  "identifierKind",
  "sections",
  "truncated",
  "logicalOperations",
  "upstreamFailureCategory",
  "alertFilter",
  "assetLookup",
  "candidateCount",
]);

export function sanitizeAuditText(value: string): string {
  let text = value.replace(/\r\n/g, "\n");
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }
  if (text.length > 400) {
    text = `${text.slice(0, 400)}...`;
  }
  return text;
}

function isDeniedKey(key: string): boolean {
  return DENIED_METADATA_KEYS.has(key.toLowerCase());
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (value == null) return value;
  if (typeof value === "string") return sanitizeAuditText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 40)
      .map((item) => sanitizeMetadataValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isDeniedKey(key)) continue;
      const next = sanitizeMetadataValue(child, depth + 1);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return undefined;
}

export function sanitizeAuditMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key) || isDeniedKey(key)) continue;
    const next = sanitizeMetadataValue(value);
    if (next !== undefined) out[key] = next;
  }
  return Object.keys(out).length ? out : undefined;
}

export function buildToolCallAudit(input: {
  toolName: string;
  classification: ToolClassification;
  operationKind: string;
  durationMs: number;
  isError: boolean;
  argumentKeys: string[];
  requestId?: string;
  errorSummary?: string;
  investigation?: { outcome: ToolOutcome; errorCode?: string; metadata?: Record<string, unknown> };
}): AuditEvent {
  const outcome: ToolOutcome = input.investigation?.outcome ?? (input.isError ? "failed" : "complete");
  return {
    event: "mcp.tool_call",
    timestamp: new Date().toISOString(),
    requestId: input.requestId,
    toolName: input.toolName,
    classification: input.classification,
    success: outcome === "complete",
    outcome,
    errorCode: input.investigation?.errorCode,
    durationMs: input.durationMs,
    errorSummary: input.isError
      ? input.errorSummary
        ? sanitizeAuditText(input.errorSummary)
        : undefined
      : outcome === "failed"
        ? input.investigation?.errorCode
        : undefined,
    metadata: sanitizeAuditMetadata({
      operationKind: input.operationKind,
      argumentKeys: input.argumentKeys.slice(0, 20),
      ...input.investigation?.metadata,
    }),
  };
}

export function writeAudit(event: AuditEvent): void {
  const record = {
    ...event,
    errorSummary: event.errorSummary ? sanitizeAuditText(event.errorSummary) : undefined,
    metadata: sanitizeAuditMetadata(event.metadata),
  };
  console.error(JSON.stringify(record));
}
