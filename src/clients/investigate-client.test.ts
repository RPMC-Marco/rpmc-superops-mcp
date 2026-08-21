import { describe, expect, it } from "vitest";
import { SuperOpsError } from "../superops/errors.js";
import type { SuperOpsClient } from "../superops/client.js";
import { investigateClient } from "./investigate-client.js";

function fakeClient(handler: (query: string, variables?: Record<string, unknown>) => unknown): SuperOpsClient {
  return { query: async (query, variables) => handler(query, variables) } as SuperOpsClient;
}

describe("investigateClient", () => {
  it("resolves exact name, uses official clientId for sites, and pins name-matched assets/tickets to accountId", async () => {
    const calls: Array<{ query: string; variables?: Record<string, unknown> }> = [];
    const client = fakeClient((query, variables) => {
      calls.push({ query, variables });
      if (query.includes("getClientList")) {
        return {
          getClientList: {
            clients: [{ accountId: "c1", name: "Acme" }, { accountId: "c2", name: "Acme Other" }],
            listInfo: { page: 1, pageSize: 5, hasMore: false, totalCount: 2 },
          },
        };
      }
      if (query.includes("query getClient(")) {
        return {
          getClient: {
            accountId: "c1",
            name: "Acme",
            primaryContact: { userId: "u1", name: "Pat", email: "pat@acme.com" },
          },
        };
      }
      if (query.includes("getClientSiteList")) {
        expect((variables as { input: { clientId: string } }).input.clientId).toBe("c1");
        return { getClientSiteList: { sites: [{ id: "s1", name: "HQ" }], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 1 } } };
      }
      if (query.includes("getAssetList")) {
        expect((variables as { input: { condition: unknown } }).input.condition).toEqual({
          attribute: "client.name",
          operator: "is",
          value: "Acme",
        });
        return { getAssetList: { assets: [{ assetId: "9001114136934215681", name: "PC", client: { accountId: "c1", name: "Acme" } }], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 1 } } };
      }
      if (query.includes("getTicketList")) {
        expect((variables as { input: { condition: unknown; page: number } }).input.page).toBe(1);
        return { getTicketList: { tickets: [{ ticketId: "t1", displayId: "200826-0001", client: { accountId: "c1", name: "Acme" } }], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 1 } } };
      }
      if (query.includes("getAlertList")) throw new Error("must not scan alerts");
      throw new Error(`unexpected ${query.slice(0, 40)}`);
    });
    const result = await investigateClient({ name: "Acme" }, client);
    expect(result.status).toBe("complete");
    expect(JSON.stringify(result.client)).not.toContain("pat@acme.com");
    expect((result.provenance as { resolution: string }).resolution).toBe("name_condition_is");
    expect((result.assets as { items: unknown[] }).items).toHaveLength(1);
    expect((result.tickets as { items: unknown[] }).items).toHaveLength(1);
    expect(calls.filter((call) => call.query.includes("getClientList"))).toHaveLength(1);
    expect(calls.some((call) => call.query.includes("getAlertList"))).toBe(false);
  });

  it("omits name-matched assets/tickets that belong to another accountId", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getClient(")) return { getClient: { accountId: "c1", name: "Acme" } };
      if (query.includes("getClientSiteList")) {
        return { getClientSiteList: { sites: [], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 0 } } };
      }
      if (query.includes("getAssetList")) {
        return {
          getAssetList: {
            assets: [
              { assetId: "ours", client: { accountId: "c1", name: "Acme" } },
              { assetId: "theirs", client: { accountId: "c2", name: "Acme" } },
            ],
            listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 2 },
          },
        };
      }
      if (query.includes("getTicketList")) {
        return {
          getTicketList: {
            tickets: [{ ticketId: "t-other", client: { accountId: "c2", name: "Acme" } }],
            listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 1 },
          },
        };
      }
      throw new Error("unexpected");
    });
    const result = await investigateClient({ accountId: "c1" }, client);
    expect(result.status).toBe("complete");
    expect((result.assets as { items: Array<{ assetId: string }>; droppedForeign: number }).items.map((item) => item.assetId)).toEqual(["ours"]);
    expect((result.assets as { droppedForeign: number }).droppedForeign).toBe(1);
    expect((result.tickets as { items: unknown[]; droppedForeign: number }).items).toHaveLength(0);
    expect((result.tickets as { droppedForeign: number }).droppedForeign).toBe(1);
    expect((result.warnings as Array<{ code: string }>).some((item) => item.code === "client_name_not_unique")).toBe(true);
    expect((result.provenance as { sections: { assets: string; tickets: string } }).sections.assets).toBe("truncated");
    expect((result.provenance as { sections: { tickets: string } }).sections.tickets).toBe("truncated");
  });

  it("returns ambiguous when a single name match is not proven unique because more pages exist", async () => {
    const result = await investigateClient(
      { name: "Acme" },
      fakeClient((query) => {
        if (query.includes("getClientList")) {
          return {
            getClientList: {
              clients: [{ accountId: "c1", name: "Acme" }],
              listInfo: { page: 1, pageSize: 5, hasMore: true, totalCount: 6 },
            },
          };
        }
        throw new Error("must not continue");
      })
    );
    expect(result.status).toBe("failed");
    expect(result.code).toBe("ambiguous");
  });

  it("returns ambiguous without picking a client", async () => {
    const result = await investigateClient(
      { name: "Acme" },
      fakeClient((query) => {
        if (query.includes("getClientList")) {
          return {
            getClientList: {
              clients: [
                { accountId: "c1", name: "Acme" },
                { accountId: "c2", name: "Acme" },
              ],
              listInfo: { page: 1, pageSize: 5, hasMore: false, totalCount: 2 },
            },
          };
        }
        throw new Error("must not continue");
      })
    );
    expect(result.status).toBe("failed");
    expect(result.code).toBe("ambiguous");
  });

  it("is partial when ticket list filter is rejected", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getClient(")) return { getClient: { accountId: "c1", name: "Acme" } };
      if (query.includes("getClientSiteList")) {
        return { getClientSiteList: { sites: [], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 0 } } };
      }
      if (query.includes("getAssetList")) {
        return { getAssetList: { assets: [], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 0 } } };
      }
      if (query.includes("getTicketList")) throw new SuperOpsError("Unknown attribute client.name");
      throw new Error("unexpected");
    });
    const result = await investigateClient({ accountId: "c1" }, client);
    expect(result.status).toBe("partial");
    expect((result.errors as Array<{ code: string }>).some((item) => item.code === "tickets_unavailable")).toBe(true);
  });
});
