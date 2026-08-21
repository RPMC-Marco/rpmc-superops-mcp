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
const MAX_DEPTH = 12;
const MAX_STRING = 8000;

function walk(
  value: unknown,
  key: string | undefined,
  depth: number,
  notice: PrivacyNotice
): unknown {
  if (depth > MAX_DEPTH) return value;
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
