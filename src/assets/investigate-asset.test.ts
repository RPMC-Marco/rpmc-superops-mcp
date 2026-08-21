import { describe, expect, it } from "vitest";
import { SuperOpsError, SuperOpsHttpError } from "../superops/errors.js";
import type { SuperOpsClient } from "../superops/client.js";
import { ALERT_PAGE_SIZE, PATCH_NON_INSTALLED_LIMIT, SOFTWARE_PAGE_SIZE } from "../investigate/bounds.js";
import { investigationAuditFromResult } from "../investigate/audit.js";
import { buildToolCallAudit } from "../audit.js";
import { investigateAsset } from "./investigate-asset.js";

type QueryHandler = (query: string, variables?: Record<string, unknown>) => unknown | Promise<unknown>;

function fakeClient(handler: QueryHandler): SuperOpsClient {
  return {
    query: async (query: string, variables?: Record<string, unknown>) => {
      if (query.includes("getAssetSummary")) return { getAssetSummary: { cpu: { cpuName: "Intel" } } };
      if (query.includes("getAssetActivity")) {
        return { getAssetActivity: { activities: [], listInfo: { page: 1, pageSize: 15, hasMore: false, totalCount: 0 } } };
      }
      return handler(query, variables);
    },
  } as SuperOpsClient;
}

const ASSET_ID = "9001114136934215681";

function assetGet(overrides: Record<string, unknown> = {}) {
  return {
    getAsset: {
      assetId: ASSET_ID,
      name: "FRONT-DESK-PC",
      hostName: "DESKTOP-9J8RLGD",
      serialNumber: "15CD10509R721",
      client: { accountId: "c1", name: "Acme" },
      site: { id: "s1", name: "HQ" },
      requester: { userId: "u1", name: "Jane Doe", email: "jane@client.com" },
      platform: "Microsoft Windows 11",
      status: "ONLINE",
      lastCommunicatedTime: "2026-08-20T12:00:00.000Z",
      agentVersion: "202211151251",
      patchStatus: "Missing patches",
      publicIp: "203.0.113.10",
      ...overrides,
    },
  };
}

function emptySupport() {
  return {
    getAssetSoftwareList: {
      assetSoftwares: [],
      listInfo: { page: 1, pageSize: SOFTWARE_PAGE_SIZE, hasMore: false, totalCount: 0 },
    },
    getAssetPatchDetails: {
      assetPatches: [],
      listInfo: { page: 1, pageSize: 100, hasMore: false, totalCount: 0 },
    },
    getAlertsForAsset: {
      alerts: [],
      listInfo: { page: 1, pageSize: ALERT_PAGE_SIZE, hasMore: false, totalCount: 0 },
    },
  };
}

describe("investigateAsset", () => {
  it("loads bounded evidence for a numeric assetId without scanning getAlertList", async () => {
    const calls: Array<{ query: string; variables?: Record<string, unknown> }> = [];
    const extras = emptySupport();
    extras.getAssetSoftwareList = {
      assetSoftwares: [{ id: "s1", software: { softwareId: "x", name: "Chrome" }, version: "1" }],
      listInfo: { page: 1, pageSize: SOFTWARE_PAGE_SIZE, hasMore: false, totalCount: 1 },
    };
    extras.getAssetPatchDetails = {
      assetPatches: [
        { patchDetail: { title: "KB1" }, installationStatus: "Installed" },
        { patchDetail: { title: "KB2" }, installationStatus: "Failed" },
      ],
      listInfo: { page: 1, pageSize: 100, hasMore: false, totalCount: 2 },
    };
    extras.getAlertsForAsset = {
      alerts: [
        {
          id: "old-open",
          status: "Open",
          createdTime: "2026-08-01T00:00:00.000Z",
          message: "Disk low; contact ops@client.com",
          asset: { assetId: ASSET_ID, owner: { name: "Jane", email: "jane@client.com" } },
        },
        {
          id: "resolved",
          status: "Resolved",
          resolvedTime: "2026-08-19T00:00:00.000Z",
          createdTime: "2026-08-18T00:00:00.000Z",
          message: "CPU",
        },
        {
          id: "newer-open",
          status: "Open",
          createdTime: "2026-08-20T00:00:00.000Z",
          message: "Offline",
        },
      ],
      listInfo: { page: 1, pageSize: ALERT_PAGE_SIZE, hasMore: false, totalCount: 3 },
    };

    const client = fakeClient((query, variables) => {
      calls.push({ query, variables });
      if (query.includes("query getAsset(")) return assetGet();
      if (query.includes("getAssetSoftwareList")) return { getAssetSoftwareList: extras.getAssetSoftwareList };
      if (query.includes("getAssetPatchDetails")) return { getAssetPatchDetails: extras.getAssetPatchDetails };
      if (query.includes("getAlertsForAsset")) return { getAlertsForAsset: extras.getAlertsForAsset };
      if (query.includes("getAlertList")) throw new Error("must not tenant-scan alerts");
      throw new Error(`unexpected ${query.slice(0, 60)}`);
    });

    const result = await investigateAsset({ assetId: ASSET_ID }, client);
    expect(result.status).toBe("complete");
    const asset = result.asset as { detail: { requester: { name?: string; email?: string } } };
    expect(asset.detail.requester.name).toBe("Jane Doe");
    expect(asset.detail.requester.email).toBeUndefined();
    expect(JSON.stringify(result.asset)).not.toContain("jane@client.com");
    expect((result.patches as { items: Array<{ installationStatus: string }> }).items.map((item) => item.installationStatus)).toEqual([
      "Failed",
    ]);
    const alerts = result.alerts as { items: Array<{ id: string; message: string; asset?: { owner?: { email?: string } } }> };
    expect(alerts.items.map((item) => item.id)).toEqual(["newer-open", "old-open", "resolved"]);
    expect(alerts.items[1]?.message).toContain("ops@client.com");
    expect(alerts.items[1]?.asset?.owner?.email).toBeUndefined();

    const alertCall = calls.find((call) => call.query.includes("getAlertsForAsset"));
    const input = (alertCall?.variables as { input: Record<string, unknown> }).input;
    expect(input.assetId).toBe(ASSET_ID);
    expect(input.listInfo).toMatchObject({ page: 1, pageSize: ALERT_PAGE_SIZE });
    expect((input.listInfo as { sort: unknown }).sort).toEqual([{ attribute: "createdTime", order: "DESC" }]);
    expect(calls.some((call) => call.query.includes("getAlertList"))).toBe(false);
    expect(JSON.stringify(calls.map((call) => call.variables))).not.toMatch(/"page":\s*2/);
    expect((result.provenance as { alertFilter: { tenantScan: boolean; query: string } }).alertFilter).toMatchObject({
      query: "getAlertsForAsset",
      tenantScan: false,
    });
  });

  it("returns malformed_input for a hostname stuffed into assetId", async () => {
    const client = fakeClient(() => {
      throw new Error("no SuperOps");
    });
    const result = await investigateAsset({ assetId: "DESKTOP-9J8RLGD" }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("malformed_input");
    expect((result.provenance as { resolution: string }).resolution).toBe("unresolved");
  });

  it("returns malformed_asset for empty identifiers", async () => {
    const result = await investigateAsset({ assetId: "" }, fakeClient(() => {
      throw new Error("no SuperOps");
    }));
    expect(result.status).toBe("failed");
    expect(result.code).toBe("malformed_input");
  });

  it("maps opaque getAsset failure to lookup_failed, not not_found", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getAsset(")) throw new SuperOpsError("nope");
      throw new Error("unexpected");
    });
    const result = await investigateAsset({ assetId: ASSET_ID }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("lookup_failed");
    expect(result.code).not.toBe("not_found");
  });

  it("does not classify HTTP getAsset failure as not_found", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getAsset(")) {
        throw new SuperOpsHttpError("HTTP error: 500 Server Error", 500, "Server Error");
      }
      throw new Error("unexpected");
    });
    const result = await investigateAsset({ assetId: ASSET_ID }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("unavailable");
  });

  it("returns partial when software fails after asset detail succeeds", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getAsset(")) return assetGet();
      if (query.includes("getAssetSoftwareList")) throw new SuperOpsError("software down");
      if (query.includes("getAssetPatchDetails")) {
        return {
          getAssetPatchDetails: {
            assetPatches: [],
            listInfo: { page: 1, pageSize: 100, hasMore: false, totalCount: 0 },
          },
        };
      }
      if (query.includes("getAlertsForAsset")) {
        return { getAlertsForAsset: { alerts: [], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 0 } } };
      }
      throw new Error("unexpected");
    });
    const result = await investigateAsset({ assetId: ASSET_ID }, client);
    expect(result.status).toBe("partial");
    expect((result.errors as Array<{ code: string }>)[0]?.code).toBe("software_unavailable");
  });

  it("marks software and patch pages truncated and does not dump full inventories", async () => {
    const softwareItems = Array.from({ length: SOFTWARE_PAGE_SIZE }, (_, index) => ({ id: `s${index}` }));
    const patches = Array.from({ length: PATCH_NON_INSTALLED_LIMIT + 5 }, (_, index) => ({
      patchDetail: { title: `KB${index}` },
      installationStatus: "NewOrMissing",
    }));
    const client = fakeClient((query) => {
      if (query.includes("query getAsset(")) return assetGet();
      if (query.includes("getAssetSoftwareList")) {
        return {
          getAssetSoftwareList: {
            assetSoftwares: softwareItems,
            listInfo: { page: 1, pageSize: SOFTWARE_PAGE_SIZE, hasMore: true, totalCount: 400 },
          },
        };
      }
      if (query.includes("getAssetPatchDetails")) {
        return {
          getAssetPatchDetails: {
            assetPatches: patches,
            listInfo: { page: 1, pageSize: 100, hasMore: false, totalCount: patches.length },
          },
        };
      }
      if (query.includes("getAlertsForAsset")) {
        return { getAlertsForAsset: { alerts: [], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 0 } } };
      }
      throw new Error("unexpected");
    });
    const result = await investigateAsset({ assetId: ASSET_ID }, client);
    const software = result.software as { truncated: boolean; returned: number; totalCount: number; hasMore: boolean };
    const patchPayload = result.patches as { truncated: boolean; items: unknown[]; summary: { totalCount: number } };
    expect(software.truncated).toBe(true);
    expect(software.hasMore).toBe(true);
    expect(software.returned).toBe(SOFTWARE_PAGE_SIZE);
    expect(software.totalCount).toBe(400);
    expect(patchPayload.items).toHaveLength(PATCH_NON_INSTALLED_LIMIT);
    expect(patchPayload.truncated).toBe(true);
    expect(patchPayload.summary.totalCount).toBe(patches.length);
  });

  it("retries getAlertsForAsset without sort when createdTime sort is rejected", async () => {
    const sorts: unknown[] = [];
    const client = fakeClient((query, variables) => {
      if (query.includes("query getAsset(")) return assetGet();
      if (query.includes("getAssetSoftwareList")) return { getAssetSoftwareList: emptySupport().getAssetSoftwareList };
      if (query.includes("getAssetPatchDetails")) return { getAssetPatchDetails: emptySupport().getAssetPatchDetails };
      if (query.includes("getAlertsForAsset")) {
        const listInfo = (variables as { input: { listInfo: { sort?: unknown } } }).input.listInfo;
        sorts.push(listInfo.sort);
        if (listInfo.sort) throw new SuperOpsError("Unknown sort attribute createdTime");
        return {
          getAlertsForAsset: {
            alerts: [{ id: "a1", status: "Open", createdTime: "2026-08-20T00:00:00.000Z", message: "x" }],
            listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 1 },
          },
        };
      }
      throw new Error("unexpected");
    });
    const result = await investigateAsset({ assetId: ASSET_ID }, client);
    expect(sorts).toHaveLength(2);
    expect(sorts[0]).toEqual([{ attribute: "createdTime", order: "DESC" }]);
    expect(sorts[1]).toBeUndefined();
    expect((result.alerts as { status: string }).status).toBe("ok");
    expect((result.warnings as Array<{ code: string }>).some((item) => item.code === "alert_sort_unconfirmed")).toBe(true);
  });

  it("surfaces alerts unavailable without falling back to getAlertList", async () => {
    let alertList = 0;
    const client = fakeClient((query) => {
      if (query.includes("query getAsset(")) return assetGet();
      if (query.includes("getAssetSoftwareList")) {
        return { getAssetSoftwareList: emptySupport().getAssetSoftwareList };
      }
      if (query.includes("getAssetPatchDetails")) {
        return { getAssetPatchDetails: emptySupport().getAssetPatchDetails };
      }
      if (query.includes("getAlertsForAsset")) throw new SuperOpsError("Unknown query getAlertsForAsset");
      if (query.includes("getAlertList")) {
        alertList += 1;
        throw new Error("must not scan");
      }
      throw new Error("unexpected");
    });
    const result = await investigateAsset({ assetId: ASSET_ID }, client);
    expect(alertList).toBe(0);
    expect(result.status).toBe("complete");
    expect((result.alerts as { status: string }).status).toBe("unavailable");
    expect((result.errors as Array<{ code: string }>)[0]?.code).toBe("alerts_unavailable");
    expect((result.provenance as { sections: { alerts: string } }).sections.alerts).toBe("unavailable");
  });

  it("does not guess among human identifiers stuffed into assetId", async () => {
    const result = await investigateAsset({ assetId: "Acme Laptop" }, fakeClient(() => {
      throw new Error("no SuperOps");
    }));
    expect(result.status).toBe("failed");
    expect(result.code).toBe("malformed_input");
    expect(result.candidates).toBeUndefined();
  });

  it("resolves hostName with operator is, page 1 only, and exact local match", async () => {
    const calls: Array<{ query: string; variables?: Record<string, unknown> }> = [];
    const client = fakeClient((query, variables) => {
      calls.push({ query, variables });
      if (query.includes("getAssetList")) {
        return {
          getAssetList: {
            assets: [
              { assetId: ASSET_ID, hostName: "DESKTOP-9J8RLGD", name: "FRONT-DESK-PC" },
              { assetId: "other", hostName: "DESKTOP-OTHER", name: "Other" },
            ],
            listInfo: { page: 1, pageSize: 5, hasMore: false, totalCount: 2 },
          },
        };
      }
      if (query.includes("query getAsset(")) return assetGet();
      if (query.includes("getAssetSoftwareList")) return { getAssetSoftwareList: emptySupport().getAssetSoftwareList };
      if (query.includes("getAssetPatchDetails")) return { getAssetPatchDetails: emptySupport().getAssetPatchDetails };
      if (query.includes("getAlertsForAsset")) return { getAlertsForAsset: emptySupport().getAlertsForAsset };
      throw new Error(`unexpected ${query.slice(0, 40)}`);
    });
    const result = await investigateAsset({ hostName: "DESKTOP-9J8RLGD" }, client);
    expect(result.status).toBe("complete");
    expect((result.provenance as { resolution: string }).resolution).toBe("hostName_condition_is");
    const listInput = (calls.find((call) => call.query.includes("getAssetList"))?.variables as { input: Record<string, unknown> }).input;
    expect(listInput.page).toBe(1);
    expect(listInput.condition).toEqual({ attribute: "hostName", operator: "is", value: "DESKTOP-9J8RLGD" });
    expect(calls.filter((call) => call.query.includes("getAssetList"))).toHaveLength(1);
    expect(JSON.stringify(calls.map((call) => call.variables))).not.toMatch(/"page":\s*2/);
  });

  it("returns ambiguous when two assets share the same hostName", async () => {
    const client = fakeClient((query) => {
      if (query.includes("getAssetList")) {
        return {
          getAssetList: {
            assets: [
              { assetId: "a1", hostName: "DESKTOP-9J8RLGD" },
              { assetId: "a2", hostName: "DESKTOP-9J8RLGD" },
            ],
            listInfo: { page: 1, pageSize: 5, hasMore: false, totalCount: 2 },
          },
        };
      }
      throw new Error("must not getAsset");
    });
    const result = await investigateAsset({ hostName: "DESKTOP-9J8RLGD" }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("ambiguous");
    expect((result.candidates as unknown[]).length).toBe(2);
  });

  it("emits privacy-safe audit metadata for the complete path", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getAsset(")) return assetGet();
      if (query.includes("getAssetSoftwareList")) return { getAssetSoftwareList: emptySupport().getAssetSoftwareList };
      if (query.includes("getAssetPatchDetails")) return { getAssetPatchDetails: emptySupport().getAssetPatchDetails };
      if (query.includes("getAlertsForAsset")) return { getAlertsForAsset: emptySupport().getAlertsForAsset };
      throw new Error("unexpected");
    });
    const payload = await investigateAsset({ assetId: ASSET_ID }, client);
    const audit = investigationAuditFromResult(payload);
    const event = buildToolCallAudit({
      toolName: "investigate_asset",
      classification: "read",
      operationKind: "query",
      durationMs: 9,
      isError: false,
      argumentKeys: ["assetId"],
      investigation: audit,
    });
    const blob = JSON.stringify(event);
    expect(event.success).toBe(true);
    expect(event.outcome).toBe("complete");
    expect(blob).not.toContain("jane@client.com");
    expect(blob).not.toContain("Jane Doe");
    expect(blob).not.toContain("203.0.113.10");
    expect(blob).not.toContain("FRONT-DESK-PC");
    expect(event.metadata?.alertFilter).toMatchObject({ query: "getAlertsForAsset", tenantScan: false });
  });
});
