/**
 * Conservative ticket-content sanitization.
 *
 * Substantially adapted from computask/superops-mcp ticket sanitization
 * (Apache-2.0, commit 85b24ee9f203637b680858cd0abdd1bf5d303f9e).
 * RPMC always reports when content was altered. Attachments stay metadata-only.
 */

export interface RedactionResult {
  text: string;
  truncated: boolean;
  htmlStripped: boolean;
  credentialsRedacted: boolean;
}

const CREDENTIAL_PATTERNS: RegExp[] = [
  /\b(password|passwd|pwd|secret|api[_-]?key|token)\b\s*[:=]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b(?:sk|rk)-[A-Za-z0-9]{16,}\b/g,
];

export function htmlToPlainText(value: string): { text: string; stripped: boolean } {
  const stripped = /<[^>]+>/.test(value);
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { text, stripped };
}

export function redactSecrets(value: string): { text: string; credentialsRedacted: boolean } {
  let text = value;
  let credentialsRedacted = false;
  for (const pattern of CREDENTIAL_PATTERNS) {
    const next = text.replace(pattern, "[redacted]");
    if (next !== text) credentialsRedacted = true;
    text = next;
  }
  return { text, credentialsRedacted };
}

export function sanitizeTicketText(value: unknown, maxChars = 4000): RedactionResult {
  const original = typeof value === "string" ? value : "";
  const html = htmlToPlainText(original);
  const redacted = redactSecrets(html.text);
  let text = redacted.text;
  const truncated = text.length > maxChars;
  if (truncated) {
    text = `${text.slice(0, maxChars - 3)}...`;
  }
  return {
    text,
    truncated,
    htmlStripped: html.stripped,
    credentialsRedacted: redacted.credentialsRedacted,
  };
}

export function attachmentMetadata(value: unknown): Array<{ fileName?: string; originalFileName?: string; fileSize?: number }> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      fileName: typeof rec.fileName === "string" ? rec.fileName : undefined,
      originalFileName: typeof rec.originalFileName === "string" ? rec.originalFileName : undefined,
      fileSize: typeof rec.fileSize === "number" ? rec.fileSize : undefined,
    };
  });
}
