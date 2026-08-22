/**
 * IT documentation / custom-field secret policy.
 *
 * Default: redact sensitive values. Preserve ordinary technical values,
 * including hardware/asset serial numbers.
 *
 * Opaque SuperOps UDF keys (udf6text) are interpreted through IT-document
 * category custom-field definitions (columnName / label / fieldType), not by
 * column name alone.
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
const FREEFORM_LABEL = /^(notes|description|details|comments)$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HYPHENATED_KEYISH = /\b[A-Za-z0-9]{2,8}(?:-[A-Za-z0-9]{2,8}){2,}\b/g;
const DENSE_ALNUM = /[A-Za-z0-9]{16,}/;

export interface CustomFieldRedaction {
  columnName?: string;
  label?: string;
  fieldType?: string;
  valuePresent: boolean;
  redacted: true;
  reason: "secret_field_type" | "secret_field_label" | "license_key_value" | "license_freeform";
}

export interface CategoryFieldDef {
  columnName: string;
  label?: string;
  fieldType?: string;
}

export interface ItDocCategory {
  typeId?: string;
  name?: string;
  customFields?: unknown;
}

export interface ItDocSecretContext {
  documentName?: string;
  categoryName?: string;
  typeId?: string;
  categories?: ItDocCategory[];
  fieldDefs?: CategoryFieldDef[];
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

function isFreeformField(meta: { label?: string; fieldType?: string }): boolean {
  if ((meta.fieldType ?? "").toUpperCase() === "PARAGRAPH") return true;
  return FREEFORM_LABEL.test(normalizeLabel(meta.label ?? ""));
}

function redactHyphenatedKeyish(text: string): string {
  return text.replace(HYPHENATED_KEYISH, (match) => (ISO_DATE.test(match) ? match : "[redacted]"));
}

function remainingLicenseLike(text: string): boolean {
  const scratch = text.replace(/\[redacted\]/gi, " ").replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  if (DENSE_ALNUM.test(scratch)) return true;
  const leftover = scratch.match(HYPHENATED_KEYISH) ?? [];
  return leftover.some((match) => !ISO_DATE.test(match));
}

function redactLicenseFreeform(
  raw: string,
  meta: { columnName?: string; label?: string; fieldType?: string }
): { value: unknown; notice?: CustomFieldRedaction } {
  let next = raw.replace(PRODUCT_KEY, "[redacted]");
  next = redactHyphenatedKeyish(next);
  if (remainingLicenseLike(next)) {
    return {
      value: null,
      notice: { ...meta, valuePresent: true, redacted: true, reason: "license_freeform" },
    };
  }
  if (next !== raw) {
    return {
      value: next,
      notice: { ...meta, valuePresent: true, redacted: true, reason: "license_key_value" },
    };
  }
  return { value: raw };
}

function valuePresent(value: unknown): boolean {
  return value != null && value !== "";
}

function scalarLooksLikeProductKey(value: unknown): boolean {
  return typeof value === "string" && PRODUCT_KEY.test(value);
}

function scalarId(value: unknown): string {
  return value == null ? "" : String(value);
}

export function parseCategoryFieldDefs(customFields: unknown): CategoryFieldDef[] {
  if (typeof customFields === "string") {
    try {
      return parseCategoryFieldDefs(JSON.parse(customFields));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(customFields)) return [];
  const defs: CategoryFieldDef[] = [];
  for (const item of customFields) {
    if (!isRecord(item)) continue;
    const columnName =
      typeof item.columnName === "string"
        ? item.columnName
        : typeof item.name === "string"
          ? item.name
          : "";
    if (!columnName) continue;
    defs.push({
      columnName,
      label: typeof item.label === "string" ? item.label : undefined,
      fieldType: typeof item.fieldType === "string" ? item.fieldType : undefined,
    });
  }
  return defs;
}

function defsEquivalent(left: CategoryFieldDef, right: CategoryFieldDef): boolean {
  return (
    normalizeLabel(left.label ?? "") === normalizeLabel(right.label ?? "") &&
    (left.fieldType ?? "").toUpperCase() === (right.fieldType ?? "").toUpperCase()
  );
}

export function uniqueCategoryFieldDefs(categories: ItDocCategory[]): CategoryFieldDef[] {
  const byColumn = new Map<string, CategoryFieldDef[]>();
  for (const category of categories) {
    for (const def of parseCategoryFieldDefs(category.customFields)) {
      const list = byColumn.get(def.columnName) ?? [];
      list.push(def);
      byColumn.set(def.columnName, list);
    }
  }
  const unique: CategoryFieldDef[] = [];
  for (const [columnName, defs] of byColumn) {
    if (defs.every((def) => defsEquivalent(def, defs[0]))) {
      unique.push({ columnName, label: defs[0].label, fieldType: defs[0].fieldType });
    }
  }
  return unique;
}

export function resolveItDocFieldCatalog(
  customFields: unknown,
  context: ItDocSecretContext = {}
): { fieldDefs: CategoryFieldDef[]; categoryName?: string } {
  if (context.fieldDefs?.length) {
    return { fieldDefs: context.fieldDefs, categoryName: context.categoryName };
  }
  const categories = context.categories ?? [];
  if (context.typeId) {
    const match = categories.find((category) => scalarId(category.typeId) === scalarId(context.typeId));
    if (match) {
      return {
        fieldDefs: parseCategoryFieldDefs(match.customFields),
        categoryName: typeof match.name === "string" ? match.name : context.categoryName,
      };
    }
  }

  const keys = isRecord(customFields) ? Object.keys(customFields) : [];
  let best: ItDocCategory | undefined;
  let bestScore = 0;
  let ties = 0;
  for (const category of categories) {
    const defined = new Set(parseCategoryFieldDefs(category.customFields).map((def) => def.columnName));
    if (!defined.size) continue;
    const overlap = keys.filter((key) => defined.has(key)).length;
    if (overlap > bestScore) {
      best = category;
      bestScore = overlap;
      ties = 1;
    } else if (overlap === bestScore && overlap > 0) {
      ties += 1;
    }
  }
  if (best && bestScore > 0 && ties === 1) {
    return {
      fieldDefs: parseCategoryFieldDefs(best.customFields),
      categoryName: typeof best.name === "string" ? best.name : context.categoryName,
    };
  }
  return { fieldDefs: uniqueCategoryFieldDefs(categories), categoryName: context.categoryName };
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
  if (licenseContext && typeof raw === "string" && isFreeformField({ label: meta.label, fieldType })) {
    return redactLicenseFreeform(raw, { ...meta, fieldType: fieldType || undefined });
  }
  if (scalarLooksLikeProductKey(raw)) {
    return {
      value: null,
      notice: { ...meta, fieldType: fieldType || undefined, valuePresent: true, redacted: true, reason: "license_key_value" },
    };
  }
  return { value: raw };
}

function mapImpliesLicense(record: Record<string, unknown>, fieldDefs: CategoryFieldDef[]): boolean {
  if (Object.keys(record).some((key) => isLicenseKeyLabel(key) || LICENSE_CONTEXT.test(key))) return true;
  return fieldDefs.some((def) => isLicenseKeyLabel(def.label ?? "") || isLicenseContextText(def.label));
}

function defForColumn(fieldDefs: CategoryFieldDef[], columnName: string): CategoryFieldDef | undefined {
  return fieldDefs.find((def) => def.columnName === columnName);
}

function redactRecordMap(
  record: Record<string, unknown>,
  licenseContext: boolean,
  fieldDefs: CategoryFieldDef[]
): { customFields: Record<string, unknown>; redactions: CustomFieldRedaction[] } {
  const license = licenseContext || mapImpliesLicense(record, fieldDefs);
  const out: Record<string, unknown> = {};
  const redactions: CustomFieldRedaction[] = [];
  for (const [columnName, raw] of Object.entries(record)) {
    if (Array.isArray(raw) || isRecord(raw)) {
      const nested = redactSecretCustomFields(raw, { licenseContext: license, fieldDefs });
      out[columnName] = nested.customFields;
      redactions.push(...nested.redactions);
      continue;
    }
    const def = defForColumn(fieldDefs, columnName);
    const next = redactScalar(
      raw,
      { columnName, label: def?.label ?? columnName, fieldType: def?.fieldType },
      license
    );
    out[columnName] = next.value;
    if (next.notice) redactions.push(next.notice);
  }
  return { customFields: out, redactions };
}

function redactArrayItem(
  item: unknown,
  licenseContext: boolean,
  fieldDefs: CategoryFieldDef[]
): { item: unknown; notices: CustomFieldRedaction[] } {
  if (!isRecord(item)) return { item, notices: [] };
  const columnName =
    typeof item.columnName === "string" ? item.columnName : typeof item.name === "string" ? item.name : undefined;
  const def = columnName ? defForColumn(fieldDefs, columnName) : undefined;
  const fieldType = typeof item.fieldType === "string" ? item.fieldType.toUpperCase() : def?.fieldType?.toUpperCase() ?? "";
  const label = typeof item.label === "string" ? item.label : def?.label;
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
  const nested = redactSecretCustomFields(item, { licenseContext, fieldDefs });
  return { item: nested.customFields, notices: nested.redactions };
}

export function redactSecretCustomFields(
  customFields: unknown,
  context: ItDocSecretContext & { licenseContext?: boolean } = {}
): {
  customFields: unknown;
  redactions: CustomFieldRedaction[];
} {
  const resolved = resolveItDocFieldCatalog(customFields, context);
  const licenseContext =
    Boolean(context.licenseContext) ||
    isLicenseContextText(context.documentName, context.categoryName, resolved.categoryName);
  if (Array.isArray(customFields)) {
    const redactions: CustomFieldRedaction[] = [];
    const items = customFields.map((item) => {
      const next = redactArrayItem(item, licenseContext, resolved.fieldDefs);
      redactions.push(...next.notices);
      return next.item;
    });
    return { customFields: items, redactions };
  }
  if (!isRecord(customFields)) return { customFields, redactions: [] };
  return redactRecordMap(customFields, licenseContext, resolved.fieldDefs);
}

/**
 * Fail-closed write gate for IT-document custom fields.
 * Unknown columns, secret field types, license-key labels, and credential-like
 * values are refused. This is not a disclosure bypass.
 */
export function forbiddenItDocWriteReason(
  columnName: string,
  value: unknown,
  def?: CategoryFieldDef,
  categoryName?: string
): string | undefined {
  const fieldType = (def?.fieldType ?? "").toUpperCase();
  const label = def?.label ?? columnName;
  if (!def) return "Unknown IT-document field; writes require a category field definition";
  if (SECRET_FIELD_TYPES.has(fieldType)) return "PASSWORD/SECURE_TEXT fields cannot be written";
  if (shouldRedactByLabel(label, isLicenseContextText(categoryName, label))) {
    return "Secret or license-key fields cannot be written";
  }
  if (typeof value === "string" && (PRODUCT_KEY.test(value) || GENERIC_SECRET_LABEL.test(value))) {
    return "Credential-like values cannot be written to IT documentation";
  }
  return undefined;
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
  const nextContext: ItDocSecretContext = {
    ...context,
    documentName,
    categoryName,
  };
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "customFields") {
      const resolved = resolveItDocFieldCatalog(child, nextContext);
      const redacted = redactSecretCustomFields(child, { ...nextContext, ...resolved });
      out.customFields = redacted.customFields;
      if (redacted.redactions.length) out.customFieldsRedaction = redacted.redactions;
    } else if (key === "customFieldsRedaction") {
      out[key] = child;
    } else {
      out[key] = applyItDocSecretPolicy(child, nextContext);
    }
  }
  return out;
}
