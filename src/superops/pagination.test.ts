import { describe, expect, it } from "vitest";
import { normalizeHasMore, normalizeListPagination } from "./pagination.js";

describe("pagination", () => {
  it("keeps hasMore true as true", () => {
    expect(normalizeHasMore(true)).toBe(true);
    const normalized = normalizeListPagination({
      getTicketList: {
        tickets: [{ ticketId: "1" }],
        listInfo: { page: 1, pageSize: 25, hasMore: true, totalCount: 40 },
      },
    });
    expect(normalized.getTicketList.listInfo.hasMore).toBe(true);
  });

  it("turns hasMore null into false", () => {
    expect(normalizeHasMore(null)).toBe(false);
    const normalized = normalizeListPagination({
      getClientList: {
        clients: [],
        listInfo: { page: 2, pageSize: 25, hasMore: null, totalCount: 25 },
      },
    });
    expect(normalized.getClientList.listInfo.hasMore).toBe(false);
  });

  it("turns other non-true hasMore values into false", () => {
    expect(normalizeHasMore(false)).toBe(false);
    expect(normalizeHasMore(undefined)).toBe(false);
    expect(normalizeHasMore("true")).toBe(false);
  });
});
