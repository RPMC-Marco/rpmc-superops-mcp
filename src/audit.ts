export type ToolClassification = "read" | "write_low" | "write_visible" | "disruptive" | "destructive";

export interface AuditEvent {
  event: "mcp.tool_call";
  timestamp: string;
  requestId?: string;
  toolName: string;
  classification: ToolClassification;
  success: boolean;
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

export function writeAudit(event: AuditEvent): void {
  const record = {
    ...event,
    errorSummary: event.errorSummary ? sanitizeAuditText(event.errorSummary) : undefined,
  };
  console.error(JSON.stringify(record));
}
