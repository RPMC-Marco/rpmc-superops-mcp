/**
 * SuperOps listInfo.hasMore is a boolean on intermediate pages and null on the
 * final page in the RPMC tenant (live-confirmed). Callers get a normal boolean.
 */
export function normalizeHasMore(value: unknown): boolean {
  return value === true;
}

export function normalizeListPagination<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(walk);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "listInfo" && child && typeof child === "object" && !Array.isArray(child)) {
      const listInfo = { ...(child as Record<string, unknown>) };
      if ("hasMore" in listInfo) {
        listInfo.hasMore = normalizeHasMore(listInfo.hasMore);
      }
      out[key] = listInfo;
      continue;
    }
    out[key] = walk(child);
  }
  return out;
}
