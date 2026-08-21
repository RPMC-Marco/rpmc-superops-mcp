import { describe, expect, it } from "vitest";
import { SuperOpsError } from "../superops/errors.js";
import type { SuperOpsClient } from "../superops/client.js";
import { and, exactIs, includesValues, onPlaceholder } from "../superops/conditions.js";
import { searchTickets } from "./tickets-search.js";
import { searchAssets } from "./assets-search.js";
import { searchAlerts } from "./alerts-search.js";
import { searchSites } from "./sites.js";

type QueryHandler = (query: string, variables?: Record<string, unknown>) => unknown | Promise<unknown>;

function fakeClient(handler: QueryHandler): SuperOpsClient {
  return { query: async (query, variables) => handler(query, variables) } as SuperOpsClient;
}

describe("condition builders", () => {
  it("wraps multiple leaves in AND and keeps a single leaf unwrapped", () => {
    expect(and([exactIs("displayId", "200826-0001")])).toEqual({
      attribute: "displayId",
      operator: "is",
      value: "200826-0001",
    });
    expect(and([exactIs("client.name", "Acme"), includesValues("status", ["Open"])])).toEqual({
      joinOperator: "AND",
      operands: [
        { attribute: "client.name", operator: "is", value: "Acme" },
        { attribute: "status", operator: "includes", value: ["Open"] },
      ],
    });
    expect(onPlaceholder("createdTime", "today")).toEqual({
      attribute: "createdTime",
      operator: "on",
      value: "placeholder.today",
    });
  });
});

describe("searchTickets", () => {
  it("requires a filter and does not walk pages", async () => {
    const result = await searchTickets({}, fakeClient(() => {
      throw new Error("no SuperOps");
    }));
    expect(result.status).toBe("failed");
    expect(result.code).toBe("malformed_input");
  });

  it("sends live-confirmed displayId is plus createdTime DESC", async () => {
    const calls: Array<{ query: string; variables?: Record<string, unknown> }> = [];
    const client = fakeClient((query, variables) => {
      calls.push({ query, variables });
      if (query.includes("getTicketList")) {
        return {
          getTicketList: {
            tickets: [{ ticketId: "t1", displayId: "200826-0001", requester: { name: "Ada", email: "ada@ex.com" } }],
            listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 1 },
          },
        };
      }
      throw new Error("unexpected");
    });
    const result = await searchTickets({ displayId: "200826-0001" }, client);
    expect(result.status).toBe("complete");
    const input = (calls[0]?.variables as { input: Record<string, unknown> }).input;
    expect(input.page).toBe(1);
    expect(input.condition).toEqual({ attribute: "displayId", operator: "is", value: "200826-0001" });
    expect(input.sort).toEqual([{ attribute: "createdTime", order: "DESC" }]);
    expect(JSON.stringify(result)).not.toContain("ada@ex.com");
    expect(calls).toHaveLength(1);
  });

  it("uses official status includes with an array and client.name is", async () => {
    let input: Record<string, unknown> = {};
    const client = fakeClient((_query, variables) => {
      input = (variables as { input: Record<string, unknown> }).input;
      return { getTicketList: { tickets: [], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 0 } } };
    });
    await searchTickets({ status: ["Open", "In Progress"], clientName: "Acme" }, client);
    expect(input.condition).toEqual({
      joinOperator: "AND",
      operands: [
        { attribute: "status", operator: "includes", value: ["Open", "In Progress"] },
        { attribute: "client.name", operator: "is", value: "Acme" },
      ],
    });
  });

  it("returns unsupported_filter without paging when SuperOps rejects the condition", async () => {
    let pages: unknown[] = [];
    const client = fakeClient((_query, variables) => {
      pages.push((variables as { input: { page?: number } }).input.page);
      throw new SuperOpsError("Unknown attribute status");
    });
    const result = await searchTickets({ status: "Open" }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("unsupported_filter");
    expect(pages).toEqual([1, 1]);
  });
});

describe("searchAssets", () => {
  it("sends hostName is, uses SuperOps default order, and does not tenant-scan", async () => {
    const calls: Array<{ query: string; variables?: Record<string, unknown> }> = [];
    const client = fakeClient((query, variables) => {
      calls.push({ query, variables });
      return {
        getAssetList: {
          assets: [{ assetId: "9001114136934215681", hostName: "DESKTOP-9J8RLGD" }],
          listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 1 },
        },
      };
    });
    const result = await searchAssets({ hostName: "DESKTOP-9J8RLGD" }, client);
    expect(result.status).toBe("complete");
    const input = (calls[0]?.variables as { input: Record<string, unknown> }).input;
    expect(input.condition).toEqual({ attribute: "hostName", operator: "is", value: "DESKTOP-9J8RLGD" });
    expect(input.page).toBe(1);
    expect(input.sort).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain("getAssetList");
    expect(calls.some((call) => call.query.includes("getAlertList"))).toBe(false);
    expect((result.provenance as { sortAttribute: null; rpmcLiveConfirmed: boolean }).sortAttribute).toBeNull();
    expect((result.provenance as { rpmcLiveConfirmed: boolean }).rpmcLiveConfirmed).toBe(true);
  });

  it("returns unsupported_filter for unmonitored without calling SuperOps", async () => {
    const client = fakeClient(() => {
      throw new Error("must not call SuperOps");
    });
    const result = await searchAssets({ unmonitored: true, clientName: "Acme" }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("unsupported_filter");
    expect((result.provenance as { query: string; tenantScan: boolean; logicalOperations: string[] }).query).toBe(
      "getUnMonitoredAssetList"
    );
    expect((result.provenance as { tenantScan: boolean }).tenantScan).toBe(false);
    expect((result.provenance as { logicalOperations: string[] }).logicalOperations).toEqual([]);
  });
});

describe("searchAlerts", () => {
  it("uses getAlertsForAsset when assetId is present and never getAlertList", async () => {
    const queries: string[] = [];
    const client = fakeClient((query, variables) => {
      queries.push(query);
      expect((variables as { input: { assetId: string } }).input.assetId).toBe("9001114136934215681");
      return { getAlertsForAsset: { alerts: [], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 0 } } };
    });
    const result = await searchAlerts({ assetId: "9001114136934215681", status: "Open" }, client);
    expect(result.status).toBe("complete");
    expect(queries.some((item) => item.includes("getAlertsForAsset"))).toBe(true);
    expect(queries.some((item) => item.includes("getAlertList"))).toBe(false);
    expect((result.provenance as { rpmcLiveConfirmed: boolean; query: string }).rpmcLiveConfirmed).toBe(true);
    expect((result.provenance as { query: string }).query).toBe("getAlertsForAsset");
  });

  it("uses bounded getAlertList with createdTime placeholder and sort, never page 2", async () => {
    const pages: unknown[] = [];
    const client = fakeClient((_query, variables) => {
      const input = (variables as { input: Record<string, unknown> }).input;
      pages.push(input.page);
      expect(input.condition).toEqual({ attribute: "createdTime", operator: "on", value: "placeholder.today" });
      expect(input.sort).toEqual([{ attribute: "createdTime", order: "DESC" }]);
      return { getAlertList: { alerts: [{ id: "1", message: "Low disk", asset: { owner: { email: "x@y.com" } } }], listInfo: { page: 1, pageSize: 25, hasMore: true, totalCount: 40 } } };
    });
    const result = await searchAlerts({ created: "today" }, client);
    expect(result.status).toBe("complete");
    expect(pages).toEqual([1]);
    expect(JSON.stringify(result)).not.toContain("x@y.com");
  });
});

describe("searchSites", () => {
  it("sends official clientId plus optional name is", async () => {
    let input: Record<string, unknown> = {};
    const client = fakeClient((_query, variables) => {
      input = (variables as { input: Record<string, unknown> }).input;
      return { getClientSiteList: { sites: [{ id: "s1", name: "HQ", client: { accountId: "c1" } }], listInfo: { page: 1, pageSize: 25, hasMore: false } } };
    });
    const result = await searchSites({ clientId: "c1", name: "HQ" }, client);
    expect(result.status).toBe("complete");
    expect(input.clientId).toBe("c1");
    expect((input.listInfo as { condition: unknown }).condition).toEqual({ attribute: "name", operator: "is", value: "HQ" });
  });
});
