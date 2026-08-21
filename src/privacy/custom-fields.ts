/**
 * IT documentation / custom-field secret policy.
 *
 * Preserve ordinary technical values. Never return PASSWORD / SECURE_TEXT
 * values or product/license-key material. Metadata (name, type, presence) stays.
 */

const SECRET_FIELD_TYPES = new Set(["PASSWORD", "SECURE_TEXT"]);
const SECRET_LABEL = /\b(password|passwd|secret|api[_\s-]?key|product\s*key|license\s*key|serial(?:\s*number)?|key\/serial)\b/i;
const PRODUCT_KEY = /\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}\b/i;

export interface CustomFieldRedaction {
  columnName?: string;
  label?: string;
  fieldType?: string;
  valuePresent: boolean;
  redacted: true;
  reason: "secret_field_type" | "secret_field_label" | "license_key_value";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactMappedValue(value: unknown): { value: unknown; valuePresent: boolean; hit: boolean } {
  if (value == null || value === "") return { value, valuePresent: false, hit: false };
  if (typeof value === "string" && PRODUCT_KEY.test(value)) {
    return { value: null, valuePresent: true, hit: true };
  }
  return { value, valuePresent: true, hit: false };
}

function redactArrayItem(item: unknown): { item: unknown; notice?: CustomFieldRedaction } {
  if (!isRecord(item)) return { item };
  const fieldType = typeof item.fieldType === "string" ? item.fieldType.toUpperCase() : "";
  const label = typeof item.label === "string" ? item.label : undefined;
  const columnName = typeof item.columnName === "string" ? item.columnName : typeof item.name === "string" ? item.name : undefined;
  const raw = item.value ?? item.fieldValue;
  const valuePresent = raw != null && raw !== "";
  if (SECRET_FIELD_TYPES.has(fieldType) && ("value" in item || "fieldValue" in item)) {
    const { value: _value, fieldValue: _fieldValue, ...rest } = item;
    return {
      item: { ...rest, value: null, redacted: true },
      notice: { columnName, label, fieldType, valuePresent, redacted: true, reason: "secret_field_type" },
    };
  }
  if (label && SECRET_LABEL.test(label) && valuePresent) {
    const { value: _value, fieldValue: _fieldValue, ...rest } = item;
    return {
      item: { ...rest, value: null, redacted: true },
      notice: { columnName, label, fieldType: fieldType || undefined, valuePresent: true, redacted: true, reason: "secret_field_label" },
    };
  }
  if (typeof raw === "string" && PRODUCT_KEY.test(raw)) {
    const { value: _value, fieldValue: _fieldValue, ...rest } = item;
    return {
      item: { ...rest, value: null, redacted: true },
      notice: { columnName, label, fieldType: fieldType || undefined, valuePresent: true, redacted: true, reason: "license_key_value" },
    };
  }
  return { item };
}

export function redactSecretCustomFields(customFields: unknown): {
  customFields: unknown;
  redactions: CustomFieldRedaction[];
} {
  const redactions: CustomFieldRedaction[] = [];
  if (Array.isArray(customFields)) {
    const items = customFields.map((item) => {
      const next = redactArrayItem(item);
      if (next.notice) redactions.push(next.notice);
      return next.item;
    });
    return { customFields: items, redactions };
  }
  if (!isRecord(customFields)) return { customFields, redactions };
  const out: Record<string, unknown> = {};
  for (const [columnName, raw] of Object.entries(customFields)) {
    const mapped = redactMappedValue(raw);
    if (mapped.hit) {
      out[columnName] = null;
      redactions.push({
        columnName,
        valuePresent: mapped.valuePresent,
        redacted: true,
        reason: "license_key_value",
      });
    } else {
      out[columnName] = mapped.value;
    }
  }
  return { customFields: out, redactions };
}

export function applyItDocSecretPolicy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => applyItDocSecretPolicy(item));
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "customFields") {
      const redacted = redactSecretCustomFields(child);
      out.customFields = redacted.customFields;
      if (redacted.redactions.length) out.customFieldsRedaction = redacted.redactions;
    } else {
      out[key] = applyItDocSecretPolicy(child);
    }
  }
  return out;
}
