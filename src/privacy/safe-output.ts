import { redactSecrets, sanitizeTicketText } from "./redact.js";

export interface PrivacyNotice {
  credentialsRedacted: boolean;
  htmlStripped: boolean;
  truncated: boolean;
}

export interface SanitizedOutput {
  payload: unknown;
  privacy: PrivacyNotice;
}

const RICH_TEXT_KEYS = new Set(["content"]);
export const MAX_OUTPUT_DEPTH = 12;
const MAX_STRING = 8000;
export const DEPTH_OMITTED = "[omitted: max depth]";

function walk(
  value: unknown,
  key: string | undefined,
  depth: number,
  notice: PrivacyNotice
): unknown {
  if (depth > MAX_OUTPUT_DEPTH) {
    notice.truncated = true;
    return DEPTH_OMITTED;
  }
  if (typeof value === "string") {
    if (key && RICH_TEXT_KEYS.has(key)) {
      const rich = sanitizeTicketText(value, MAX_STRING);
      notice.credentialsRedacted ||= rich.credentialsRedacted;
      notice.htmlStripped ||= rich.htmlStripped;
      notice.truncated ||= rich.truncated;
      return rich.text;
    }
    const redacted = redactSecrets(value);
    notice.credentialsRedacted ||= redacted.credentialsRedacted;
    if (redacted.text.length > MAX_STRING) {
      notice.truncated = true;
      return `${redacted.text.slice(0, MAX_STRING - 3)}...`;
    }
    return redacted.text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, key, depth + 1, notice));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = walk(childValue, childKey, depth + 1, notice);
    }
    return out;
  }
  return value;
}

export function sanitizeOutput(value: unknown): SanitizedOutput {
  const privacy: PrivacyNotice = {
    credentialsRedacted: false,
    htmlStripped: false,
    truncated: false,
  };
  const sanitized = walk(value, undefined, 0, privacy);
  const occurred = privacy.credentialsRedacted || privacy.htmlStripped || privacy.truncated;
  if (!occurred) {
    return { payload: sanitized, privacy };
  }
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
    return {
      payload: { ...(sanitized as Record<string, unknown>), _privacy: privacy },
      privacy,
    };
  }
  return { payload: { data: sanitized, _privacy: privacy }, privacy };
}

export function sanitizeErrorText(value: string, maxChars = 400): string {
  const redacted = redactSecrets(value.replace(/\r\n/g, "\n"));
  const withoutStack = redacted.text
    .split("\n")
    .filter((line) => !/^\s*at\s+\S/.test(line))
    .join("\n")
    .trim();
  const text = withoutStack || "tool failed";
  if (text.length > maxChars) {
    return `${text.slice(0, maxChars - 3)}...`;
  }
  return text;
}
