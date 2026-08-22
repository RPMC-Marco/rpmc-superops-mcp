import { describe, expect, it } from "vitest";
import { SuperOpsError } from "../superops/errors.js";
import type { SuperOpsClient } from "../superops/client.js";
import { handleExpandedRead } from "./expanded.js";
import { EXPANDED_QUERY_DOCUMENTS } from "../superops/queries-expanded.js";
import { registeredToolNames, unregisteredWriteNames } from "../capabilities.js";

function fakeClient(handler: (query: string, variables?: Record<string, unknown>) => unknown): SuperOpsClient {
  return { query: async (query, variables) => handler(query, variables) } as SuperOpsClient;
}

describe("expanded Phase 1 reads", () => {
  it("maps every new public tool to a registered read capability", () => {
    const registered = new Set(registeredToolNames());
    const names = [
      "superops_fields_all",
      "superops_fields_get",
      "superops_fields_lookup",
      "superops_asset_custom_fields",
      "superops_assets_disks",
      "superops_assets_user_log",
      "superops_device_categories",
      "superops_client_users_get",
      "superops_client_users_list",
      "superops_client_users_associations",
      "superops_org_catalog",
      "superops_contracts_get",
      "superops_contracts_list",
      "superops_catalog_get",
      "superops_catalog_list",
      "superops_catalog_categories",
      "superops_services_get",
      "superops_services_list",
      "superops_offered_items",
      "superops_taxes_get",
      "superops_taxes_list",
      "superops_payment_config",
      "superops_invoices_get",
      "superops_invoices_list",
      "superops_invoice_items",
      "superops_itdocs_get",
      "superops_itdocs_list",
      "superops_itdocs_categories",
      "superops_kb_get",
      "superops_kb_list",
      "superops_scripts_list",
      "superops_scripts_by_type",
      "superops_tasks_get",
      "superops_tasks_list",
      "superops_work_statuses",
      "superops_worklogs_list",
    ];
    for (const name of names) expect(registered.has(name), name).toBe(true);
    for (const write of unregisteredWriteNames()) expect(registered.has(write)).toBe(false);
    expect(registered.has("superops_custom_mutation")).toBe(false);
  });

  it("does not include script source or execute mutations in expansion documents", () => {
    const blob = EXPANDED_QUERY_DOCUMENTS.join("\n");
    expect(blob).not.toMatch(/\brunScriptOnAsset\b/);
    expect(blob).not.toMatch(/\bmutation\b/);
    expect(blob).not.toMatch(/\bsource\b/);
  });

  it("fetches all ticket fields for a module and omits structured email", async () => {
    const result = await handleExpandedRead(
      "superops_fields_all",
      { module: "TICKET" },
      fakeClient((query, variables) => {
        expect(query).toContain("getAllFields");
        expect(variables).toEqual({ input: "TICKET" });
        return { getAllFields: [{ id: "1", module: "TICKET", label: "Status", options: [{ id: "a", value: "New" }] }] };
      })
    );
    expect(result?.status).toBe("complete");
    expect((result?.provenance as { query: string }).query).toBe("getAllFields");
  });

  it("rejects getField without module or identifier", async () => {
    const result = await handleExpandedRead("superops_fields_get", { id: "1" }, fakeClient(() => ({})));
    expect(result?.status).toBe("failed");
    expect(result?.code).toBe("malformed_input");
  });

  it("does not label opaque field get failure as not_found", async () => {
    const result = await handleExpandedRead(
      "superops_fields_get",
      { module: "TICKET", columnName: "status" },
      fakeClient(() => {
        throw new SuperOpsError("backend exploded");
      })
    );
    expect(result?.code).toBe("lookup_failed");
    expect(result?.code).not.toBe("not_found");
  });

  it("bounds disk details and does not walk pages", async () => {
    const disks = Array.from({ length: 40 }, (_, index) => ({ drive: `D${index}` }));
    const result = await handleExpandedRead(
      "superops_assets_disks",
      { assetId: "9001114136934215681" },
      fakeClient((query) => {
        expect(query).toContain("getAssetDiskDetails");
        return { getAssetDiskDetails: disks };
      })
    );
    expect((result?.items as unknown[]).length).toBe(32);
    expect(result?.truncated).toBe(true);
  });

  it("omits client user email", async () => {
    const result = await handleExpandedRead(
      "superops_client_users_get",
      { userId: "u1" },
      fakeClient(() => ({
        getClientUser: { userId: "u1", name: "Pat", email: "pat@client.com", client: { accountId: "c1", name: "Acme" } },
      }))
    );
    expect(JSON.stringify(result)).not.toContain("pat@client.com");
    expect((result?.item as { name: string }).name).toBe("Pat");
  });

  it("scopes client user list with official clientId and one page", async () => {
    let variables: Record<string, unknown> = {};
    const result = await handleExpandedRead(
      "superops_client_users_list",
      { clientId: "c1", page: 1, pageSize: 10 },
      fakeClient((query, vars) => {
        expect(query).toContain("getClientUserList");
        variables = vars ?? {};
        return { getClientUserList: { userList: [{ userId: "u1", email: "x@y.com" }], listInfo: { page: 1, pageSize: 10, hasMore: false } } };
      })
    );
    expect((variables.input as { clientId: string }).clientId).toBe("c1");
    expect(JSON.stringify(variables)).not.toMatch(/"page":\s*2/);
    expect(JSON.stringify(result)).not.toContain("x@y.com");
  });

  it("requires worklog module and does not invent a ticketId query", async () => {
    const missing = await handleExpandedRead("superops_worklogs_list", {}, fakeClient(() => ({})));
    expect(missing?.code).toBe("malformed_input");
    let variables: Record<string, unknown> = {};
    const logged = await handleExpandedRead(
      "superops_worklogs_list",
      { module: "TICKET" },
      fakeClient((_query, vars) => {
        variables = vars ?? {};
        return { getWorklogEntries: { entries: [{ itemId: "w1", notes: "password: hunter2", technician: { name: "Ada", email: "a@b.com" } }], listInfo: { hasMore: false } } };
      })
    );
    expect((variables.input as { module: string }).module).toBe("TICKET");
    expect(JSON.stringify(variables.input)).not.toMatch(/ticketId/);
    expect(JSON.stringify(logged)).not.toContain("hunter2");
    expect(JSON.stringify(logged)).not.toContain("a@b.com");
  });

  it("lists scripts without executing and redacts readMe secrets", async () => {
    const result = await handleExpandedRead(
      "superops_scripts_list",
      { page: 1 },
      fakeClient((query) => {
        expect(query).toContain("getScriptList");
        expect(query).not.toContain("runScriptOnAsset");
        return {
          getScriptList: {
            scripts: [{ scriptId: "s1", name: "Cleanup", readMe: "token: supersecretvalue12" }],
            listInfo: { page: 1, pageSize: 25, hasMore: true },
          },
        };
      })
    );
    expect(result?.truncated).toBe(true);
    expect(JSON.stringify(result)).not.toContain("supersecretvalue12");
  });

  it("requires typeId for IT documentation list so the repository is not dumped", async () => {
    const result = await handleExpandedRead("superops_itdocs_list", { page: 1 }, fakeClient(() => ({})));
    expect(result?.code).toBe("malformed_input");
  });

  it("sends getKbItems listInfo variable, not input", async () => {
    let variables: Record<string, unknown> = {};
    await handleExpandedRead(
      "superops_kb_list",
      { page: 1, pageSize: 10 },
      fakeClient((_query, vars) => {
        variables = vars ?? {};
        return { getKbItems: { items: [{ itemId: "k1", description: "How to print" }], listInfo: { hasMore: false } } };
      })
    );
    expect(variables.listInfo).toMatchObject({ page: 1, pageSize: 10 });
    expect(variables.input).toBeUndefined();
  });

  it("selects org catalog queries by explicit kind", async () => {
    const seen: string[] = [];
    await handleExpandedRead("superops_org_catalog", { kind: "sla" }, fakeClient((query) => {
      seen.push(query);
      return { getSLAList: [{ id: "1", name: "VIP" }] };
    }));
    expect(seen[0]).toContain("getSLAList");
    const bad = await handleExpandedRead("superops_org_catalog", { kind: "arbitrary" }, fakeClient(() => ({})));
    expect(bad?.code).toBe("malformed_input");
  });

  it("returns not_found only after a successful empty get", async () => {
    const result = await handleExpandedRead(
      "superops_tasks_get",
      { taskId: "t1" },
      fakeClient(() => ({ getTask: null }))
    );
    expect(result?.code).toBe("not_found");
  });

  it("does not call SuperOps for unknown expanded tool names", async () => {
    const result = await handleExpandedRead("superops_scripts_execute", {}, fakeClient(() => {
      throw new Error("must not call");
    }));
    expect(result).toBeNull();
  });

  it("requires modules for getAssetCustomFields and does not invent a default", async () => {
    const omitted = await handleExpandedRead("superops_asset_custom_fields", {}, fakeClient(() => {
      throw new Error("must not call SuperOps");
    }));
    expect(omitted?.code).toBe("malformed_input");
    let variables: Record<string, unknown> = {};
    await handleExpandedRead(
      "superops_asset_custom_fields",
      { modules: "Windows" },
      fakeClient((_query, vars) => {
        variables = vars ?? {};
        return { getAssetCustomFields: [] };
      })
    );
    expect(variables.input).toEqual(["Windows"]);
  });

  it("does not label an unfiltered list GraphQL failure as unsupported_filter", async () => {
    const result = await handleExpandedRead(
      "superops_catalog_list",
      { page: 1 },
      fakeClient(() => {
        throw new SuperOpsError("Field 'serviceTypeItem' of type 'ServiceTypeItem' must have a sub selection");
      })
    );
    expect(result?.code).toBe("query_failed");
    expect(result?.code).not.toBe("unsupported_filter");
    expect(result?.code).not.toBe("not_found");
  });

  it("sends ListInfoInput directly for catalog/service/tax/contract/offered lists and GetTaskListInput.listInfo for tasks", async () => {
    const seen: Array<{ query: string; variables?: Record<string, unknown> }> = [];
    const client = fakeClient((query, variables) => {
      seen.push({ query, variables });
      if (query.includes("getTaskList")) {
        return { getTaskList: { tasks: [{ taskId: "t1" }], listInfo: { hasMore: false } } };
      }
      if (query.includes("getServiceCatalogItemList")) {
        return { getServiceCatalogItemList: { items: [{ itemId: "c1" }], listInfo: { hasMore: false } } };
      }
      if (query.includes("getServiceItemList")) {
        return { getServiceItemList: { items: [{ itemId: "s1" }], listInfo: { hasMore: false } } };
      }
      if (query.includes("getTaxList")) {
        return { getTaxList: { taxes: [{ taxId: "x1" }], listInfo: { hasMore: false } } };
      }
      if (query.includes("getClientContractList")) {
        return { getClientContractList: { clientContracts: [{ contractId: "k1" }], listInfo: { hasMore: false } } };
      }
      if (query.includes("getOfferedItems")) {
        return { getOfferedItems: { items: [{ itemId: "o1" }], listInfo: { hasMore: false } } };
      }
      throw new Error(query.slice(0, 80));
    });
    await handleExpandedRead("superops_catalog_list", { page: 1, pageSize: 10 }, client);
    await handleExpandedRead("superops_services_list", { page: 1, pageSize: 10 }, client);
    await handleExpandedRead("superops_taxes_list", { page: 1, pageSize: 10 }, client);
    await handleExpandedRead("superops_contracts_list", { page: 1, pageSize: 10 }, client);
    await handleExpandedRead("superops_offered_items", { page: 1, pageSize: 10 }, client);
    await handleExpandedRead("superops_tasks_list", { page: 1, pageSize: 10 }, client);
    const byName = (name: string) => seen.find((item) => item.query.includes(name))?.variables as { input: Record<string, unknown> };
    expect(byName("getServiceCatalogItemList").input).toMatchObject({ page: 1, pageSize: 10 });
    expect(byName("getServiceItemList").input).toMatchObject({ page: 1, pageSize: 10 });
    expect(byName("getTaxList").input).toMatchObject({ page: 1, pageSize: 10 });
    expect(byName("getClientContractList").input).toMatchObject({ page: 1, pageSize: 10 });
    expect(byName("getOfferedItems").input).toMatchObject({ page: 1, pageSize: 10 });
    expect(byName("getTaskList").input).toMatchObject({ listInfo: { page: 1, pageSize: 10 } });
  });

  it("chains list identifiers into the official get input fields", async () => {
    const invoice = await handleExpandedRead(
      "superops_invoices_get",
      { invoiceId: "350481346737401856" },
      fakeClient((_query, variables) => {
        expect(variables).toEqual({ input: { invoiceId: "350481346737401856" } });
        return { getInvoice: { invoiceId: "350481346737401856", displayId: "260525-0001" } };
      })
    );
    expect(invoice?.status).toBe("complete");
    const kb = await handleExpandedRead(
      "superops_kb_get",
      { itemId: "963723386435076096" },
      fakeClient((_query, variables) => {
        expect(variables).toEqual({ input: { itemId: "963723386435076096" } });
        return { getKbItem: { itemId: "963723386435076096", itemType: "KB_ARTICLE" } };
      })
    );
    expect(kb?.status).toBe("complete");
  });

  it("redacts IT documentation product keys without dropping ordinary notes", async () => {
    const result = await handleExpandedRead(
      "superops_itdocs_get",
      { itDocId: "217184133502664704" },
      fakeClient((query) => {
        if (query.includes("getItDocumentationCategories")) {
          return {
            getItDocumentationCategories: [
              {
                typeId: "1002",
                name: "Product Key",
                customFields: [
                  { columnName: "udf3text", label: "Product Name", fieldType: "TEXT" },
                  { columnName: "udf6text", label: "Key/Serial", fieldType: "TEXT" },
                ],
              },
            ],
          };
        }
        return {
          getItDocumentation: {
            itDocId: "217184133502664704",
            name: "RMS MS Office Pro Plus 2024",
            customFields: { udf3text: "Contoso Office Suite", udf6text: "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE" },
          },
        };
      })
    );
    const text = JSON.stringify(result);
    expect(text).toContain("Contoso Office Suite");
    expect(text).not.toContain("AAAAA-BBBBB-CCCCC-DDDDD-EEEEE");
    expect(text).toContain("customFieldsRedaction");
  });

  it("redacts opaque category-defined Key/Serial values on both IT-doc list and get", async () => {
    const categories = {
      getItDocumentationCategories: [
        {
          typeId: "1002",
          name: "Product Key",
          customFields: [
            { columnName: "udf3text", label: "Product Name", fieldType: "TEXT" },
            { columnName: "udf6text", label: "Key/Serial", fieldType: "TEXT" },
          ],
        },
      ],
    };
    const document = {
      itDocId: "217184133502664704",
      name: "Finance workstation license",
      customFields: { udf3text: "Contoso Office Suite", udf6text: "office-pack-temp-key-9182" },
    };
    const listed = await handleExpandedRead(
      "superops_itdocs_list",
      { typeId: "1002", page: 1, pageSize: 10 },
      fakeClient((query) => {
        if (query.includes("getItDocumentationCategories")) return categories;
        return { getItDocumentationList: { documents: [document], listInfo: { page: 1, pageSize: 10, hasMore: false } } };
      })
    );
    const got = await handleExpandedRead(
      "superops_itdocs_get",
      { itDocId: "217184133502664704" },
      fakeClient((query) => {
        if (query.includes("getItDocumentationCategories")) return categories;
        return { getItDocumentation: document };
      })
    );
    for (const result of [listed, got]) {
      const text = JSON.stringify(result);
      expect(text).toContain("Contoso Office Suite");
      expect(text).not.toContain("office-pack-temp-key-9182");
      expect(text).toContain("customFieldsRedaction");
    }
    expect((listed?.provenance as { logicalOperations: string[] }).logicalOperations).toContain("getItDocumentationCategories");
  });

  it("redacts license-context freeform Notes on both IT-doc list and get", async () => {
    const synthetic = "12345-678-9012345-67890";
    const categories = {
      getItDocumentationCategories: [
        {
          typeId: "1002",
          name: "Product Key",
          customFields: [
            { columnName: "udf3text", label: "Product Name", fieldType: "TEXT" },
            { columnName: "udf5para", label: "Notes", fieldType: "PARAGRAPH" },
            { columnName: "udf6text", label: "Key/Serial", fieldType: "TEXT" },
          ],
        },
      ],
    };
    const document = {
      itDocId: "217184133502664704",
      name: "Finance workstation license",
      customFields: {
        udf3text: "Contoso Office Suite",
        udf5para: `Installed on finance PCs. Code ${synthetic} today.`,
        udf6text: "office-pack-temp-key-9182",
      },
    };
    const listed = await handleExpandedRead(
      "superops_itdocs_list",
      { typeId: "1002", page: 1, pageSize: 10 },
      fakeClient((query) => {
        if (query.includes("getItDocumentationCategories")) return categories;
        return { getItDocumentationList: { documents: [document], listInfo: { page: 1, pageSize: 10, hasMore: false } } };
      })
    );
    const got = await handleExpandedRead(
      "superops_itdocs_get",
      { itDocId: "217184133502664704" },
      fakeClient((query) => {
        if (query.includes("getItDocumentationCategories")) return categories;
        return { getItDocumentation: document };
      })
    );
    for (const result of [listed, got]) {
      const text = JSON.stringify(result);
      expect(text).toContain("Contoso Office Suite");
      expect(text).toContain("Installed on finance PCs.");
      expect(text).not.toContain(synthetic);
      expect(text).not.toContain("office-pack-temp-key-9182");
    }
  });

  it("preserves large JSON IDs on expanded gets", async () => {
    const bigId = "9001114136934215681";
    const { SuperOpsClient } = await import("../superops/client.js");
    const { handleTool } = await import("../tools/handlers.js");
    const { loadConfig } = await import("../config.js");
    const config = loadConfig({
      MCP_TRANSPORT: "stdio",
      SUPEROPS_API_TOKEN: "so-secret",
      SUPEROPS_SUBDOMAIN: "demo",
      SUPEROPS_REGION: "us",
    });
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async () =>
          new Response(`{"data":{"getInvoice":{"invoiceId":${bigId},"displayId":"080126-0001","client":{"accountId":${bigId},"name":"Acme"}}}}`, {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      }
    );
    const result = await handleTool("superops_invoices_get", { invoiceId: bigId }, client, config);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain(bigId);
    expect(text).not.toContain("9001114136934216000");
  });
});
