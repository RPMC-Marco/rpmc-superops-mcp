/**
 * IT documentation / custom-field secret policy.
 *
 * Default: redact sensitive values. Preserve ordinary technical values,
 * including hardware/asset serial numbers.
 *
 * Phase 1 has no AI-togglable bypass. A future human-authorized, per-field
 * disclosure path may be added later (PLANNED SECURITY CAPABILITY). Do not
 * add includeSecrets=true or any model-controlled override here.
 */

const SECRET_FIELD_TYPES = new Set(["PASSWORD", "SECURE_TEXT"]);
const PRODUCT_KEY = /\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}\b/i;
const LICENSE_CONTEXT = /\b(product\s*key|license(?:\s*key)?|activation(?:\s*key)?|software\s*license|serial\s*key|key\s*\/\s*serial)\b/i;
const LICENSE_KEY_LABEL = /^(key|product\s*key|license(?:\s*key)?|activation(?:\s*key)?|serial\s*key|key\s*\/\s*serial)$/i;
const HARDWARE_SERIAL_LABEL = /\b(serial\s*number|asset\s*serial|device\s*serial|hardware\s*serial|service\s*tag)\b/i;
const BARE_SERIAL_LABEL = /^serial$/i;
const GENERIC_SECRET_LABEL = /\b(password|passwd|passphrase|secret|api[_\s-]?key)\b/i;

export interface CustomFieldRedaction {
  columnName?: string;
  label?: string;
  fieldType?: string;
  valuePresent: boolean;
  redacted: true;
  reason: "secret_field_type" | "secret_field_label" | "license_key_value";
}

export interface ItDocSecretContext {
  documentName?: string;
  categoryName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isLicenseContextText(...parts: Array<string | undefined>): boolean {
  return parts.some((part) => Boolean(part && LICENSE_CONTEXT.test(part)));
}

function isHardwareSerialLabel(label: string): boolean {
  return HARDWARE_SERIAL_LABEL.test(normalizeLabel(label));
}

function isLicenseKeyLabel(label: string): boolean {
  return LICENSE_KEY_LABEL.test(normalizeLabel(label));
}

function shouldRedactByLabel(label: string | undefined, licenseContext: boolean): boolean {
  if (!label) return false;
  const text = normalizeLabel(label);
  if (GENERIC_SECRET_LABEL.test(text)) return true;
  if (isLicenseKeyLabel(text)) return true;
  if (isHardwareSerialLabel(text)) return licenseContext;
  if (BARE_SERIAL_LABEL.test(text)) return licenseContext;
  return false;
}

function valuePresent(value: unknown): boolean {
  return value != null && value !== "";
}

function scalarLooksLikeProductKey(value: unknown): boolean {
  return typeof value === "string" && PRODUCT_KEY.test(value);
}

function redactScalar(
  raw: unknown,
  meta: { columnName?: string; label?: string; fieldType?: string },
  licenseContext: boolean
): { value: unknown; notice?: CustomFieldRedaction } {
  if (!valuePresent(raw)) return { value: raw };
  const fieldType = meta.fieldType ? meta.fieldType.toUpperCase() : "";
  if (SECRET_FIELD_TYPES.has(fieldType)) {
    return {
      value: null,
      notice: { ...meta, fieldType, valuePresent: true, redacted: true, reason: "secret_field_type" },
    };
  }
  if (shouldRedactByLabel(meta.label ?? meta.columnName, licenseContext)) {
    return {
      value: null,
      notice: { ...meta, fieldType: fieldType || undefined, valuePresent: true, redacted: true, reason: "secret_field_label" },
    };
  }
  if (scalarLooksLikeProductKey(raw)) {
    return {
      value: null,
      notice: { ...meta, fieldType: fieldType || undefined, valuePresent: true, redacted: true, reason: "license_key_value" },
    };
  }
  return { value: raw };
}

function mapImpliesLicense(record: Record<string, unknown>): boolean {
  return Object.keys(record).some((key) => isLicenseKeyLabel(key) || LICENSE_CONTEXT.test(key));
}

function redactRecordMap(
  record: Record<string, unknown>,
  licenseContext: boolean
): { customFields: Record<string, unknown>; redactions: CustomFieldRedaction[] } {
  const license = licenseContext || mapImpliesLicense(record);
  const out: Record<string, unknown> = {};
  const redactions: CustomFieldRedaction[] = [];
  for (const [columnName, raw] of Object.entries(record)) {
    if (Array.isArray(raw) || isRecord(raw)) {
      const nested = redactSecretCustomFields(raw, { licenseContext: license });
      out[columnName] = nested.customFields;
      redactions.push(...nested.redactions);
      continue;
    }
    const next = redactScalar(raw, { columnName, label: columnName }, license);
    out[columnName] = next.value;
    if (next.notice) redactions.push(next.notice);
  }
  return { customFields: out, redactions };
}

function redactArrayItem(
  item: unknown,
  licenseContext: boolean
): { item: unknown; notices: CustomFieldRedaction[] } {
  if (!isRecord(item)) return { item, notices: [] };
  const fieldType = typeof item.fieldType === "string" ? item.fieldType.toUpperCase() : "";
  const label = typeof item.label === "string" ? item.label : undefined;
  const columnName =
    typeof item.columnName === "string" ? item.columnName : typeof item.name === "string" ? item.name : undefined;
  const raw = "value" in item ? item.value : "fieldValue" in item ? item.fieldValue : undefined;
  const hasValueKey = "value" in item || "fieldValue" in item;
  if (hasValueKey && !isRecord(raw) && !Array.isArray(raw)) {
    const next = redactScalar(raw, { columnName, label: label ?? columnName, fieldType }, licenseContext);
    if (!next.notice) return { item, notices: [] };
    const { value: _value, fieldValue: _fieldValue, ...rest } = item;
    return {
      item: { ...rest, value: null, redacted: true },
      notices: [next.notice],
    };
  }
  const nested = redactSecretCustomFields(item, { licenseContext });
  return { item: nested.customFields, notices: nested.redactions };
}

export function redactSecretCustomFields(
  customFields: unknown,
  context: ItDocSecretContext & { licenseContext?: boolean } = {}
): {
  customFields: unknown;
  redactions: CustomFieldRedaction[];
} {
  const licenseContext =
    Boolean(context.licenseContext) || isLicenseContextText(context.documentName, context.categoryName);
  if (Array.isArray(customFields)) {
    const redactions: CustomFieldRedaction[] = [];
    const items = customFields.map((item) => {
      const next = redactArrayItem(item, licenseContext);
      redactions.push(...next.notices);
      return next.item;
    });
    return { customFields: items, redactions };
  }
  if (!isRecord(customFields)) return { customFields, redactions: [] };
  return redactRecordMap(customFields, licenseContext);
}

export function applyItDocSecretPolicy(value: unknown, context: ItDocSecretContext = {}): unknown {
  if (Array.isArray(value)) return value.map((item) => applyItDocSecretPolicy(item, context));
  if (!isRecord(value)) return value;
  const documentName = typeof value.name === "string" ? value.name : context.documentName;
  const categoryName =
    typeof value.entityName === "string"
      ? value.entityName
      : isRecord(value.category) && typeof value.category.name === "string"
        ? value.category.name
        : context.categoryName;
  const nextContext = { documentName, categoryName };
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "customFields") {
      const redacted = redactSecretCustomFields(child, nextContext);
      out.customFields = redacted.customFields;
      if (redacted.redactions.length) out.customFieldsRedaction = redacted.redactions;
    } else {
      out[key] = applyItDocSecretPolicy(child, nextContext);
    }
  }
  return out;
}
