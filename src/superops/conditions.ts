export type LeafCondition = {
  attribute: string;
  operator: string;
  value: unknown;
};

export type GroupCondition = {
  joinOperator: "AND" | "OR";
  operands: Condition[];
};

export type Condition = LeafCondition | GroupCondition;

export type DatePreset = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month";

const DATE_PLACEHOLDERS: Record<DatePreset, string> = {
  today: "placeholder.today",
  yesterday: "placeholder.yesterday",
  this_week: "placeholder.this.week",
  last_week: "placeholder.last.week",
  this_month: "placeholder.this.month",
  last_month: "placeholder.last.month",
};

export function isDatePreset(value: unknown): value is DatePreset {
  return typeof value === "string" && value in DATE_PLACEHOLDERS;
}

export function leaf(attribute: string, operator: string, value: unknown): LeafCondition {
  return { attribute, operator, value };
}

export function and(operands: Condition[]): Condition | undefined {
  const compact = operands.filter(Boolean);
  if (compact.length === 0) return undefined;
  if (compact.length === 1) return compact[0];
  return { joinOperator: "AND", operands: compact };
}

export function exactIs(attribute: string, value: string): LeafCondition {
  return leaf(attribute, "is", value);
}

export function includesValues(attribute: string, values: string[]): LeafCondition {
  return leaf(attribute, "includes", values);
}

export function onPlaceholder(attribute: string, preset: DatePreset): LeafCondition {
  return leaf(attribute, "on", DATE_PLACEHOLDERS[preset]);
}

export function inLastDays(attribute: string, days: number): LeafCondition {
  return leaf(attribute, "inLast", { unit: "DAY", quantity: days });
}

export function sortBy(attribute: string, order: "ASC" | "DESC" = "DESC"): { attribute: string; order: "ASC" | "DESC" } {
  return { attribute, order };
}

export function conditionAttributes(condition: Condition | undefined): string[] {
  if (!condition) return [];
  if ("attribute" in condition) return [condition.attribute];
  return condition.operands.flatMap(conditionAttributes);
}

export function pageClamp(page: unknown, pageSize: unknown, defaultSize = 25, maxSize = 50): { page: number; pageSize: number } {
  const resolvedPage = typeof page === "number" && page >= 1 ? Math.floor(page) : 1;
  const raw = typeof pageSize === "number" && pageSize >= 1 ? Math.floor(pageSize) : defaultSize;
  return { page: resolvedPage, pageSize: Math.min(Math.max(raw, 1), maxSize) };
}

export function stringArg(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function stringList(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  }
  return [];
}

export type IdentityPick =
  | { ok: true; key: string; value: string }
  | { ok: false; code: "malformed_input"; message: string };

export function exclusiveStringIdentity(args: Record<string, unknown>, keys: string[]): IdentityPick {
  const present = keys
    .map((key) => ({ key, value: stringArg(args[key]) }))
    .filter((item) => item.value);
  if (present.length === 0) {
    return { ok: false, code: "malformed_input", message: `Provide exactly one of: ${keys.join(", ")}` };
  }
  if (present.length > 1) {
    return { ok: false, code: "malformed_input", message: `Provide exactly one of: ${keys.join(", ")}; do not combine identity fields` };
  }
  return { ok: true, key: present[0].key, value: present[0].value };
}

export function hasAnyFilter(args: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = args[key];
    if (typeof value === "boolean") return true;
    if (typeof value === "number" && Number.isFinite(value)) return true;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return false;
  });
}
