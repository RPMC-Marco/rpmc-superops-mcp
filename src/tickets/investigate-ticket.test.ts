import { describe, expect, it } from "vitest";
import { SuperOpsError, SuperOpsHttpError } from "../superops/errors.js";
import type { SuperOpsClient } from "../superops/client.js";
import {
  CONVERSATION_ITEM_LIMIT,
  DISPLAY_ID_LOOKUP_PAGE_SIZE,
  investigateTicket,
} from "./investigate-ticket.js";

type QueryHandler = (query: string, variables?: Record<string, unknown>) => unknown | Promise<unknown>;

function fakeClient(handler: QueryHandler): SuperOpsClient {
  return {
    query: async (query: string, variables?: Record<string, unknown>) => handler(query, variables),
  } as SuperOpsClient;
}

function ticketList(tickets: Array<Record<string, unknown>>, extras?: Record<string, unknown>) {
  return {
    getTicketList: {
      tickets,
      listInfo: { page: 1, pageSize: DISPLAY_ID_LOOKUP_PAGE_SIZE, hasMore: false, totalCount: tickets.length },
      ...extras,
    },
  };
}

function ticketGet(ticket: Record<string, unknown>) {
  return { getTicket: ticket };
}

describe("investigateTicket", () => {
  it("resolves displayId with operator is, page 1 only, and exact local match", async () => {
    const calls: Array<{ query: string; variables?: Record<string, unknown> }> = [];
    const client = fakeClient((query, variables) => {
      calls.push({ query, variables });
      if (query.includes("getTicketList")) {
        return ticketList([
          { ticketId: "t-internal", displayId: "200826-0001", subject: "other" },
          { ticketId: "noise", displayId: "200826-0002" },
        ]);
      }
      if (query.includes("query getTicket(")) {
        return ticketGet({
          ticketId: "t-internal",
          displayId: "200826-0001",
          subject: "Disk",
          client: { accountId: "c1", name: "Acme" },
          site: { id: "s1", name: "HQ" },
        });
      }
      if (query.includes("getTicketConversationList")) {
        return {
          getTicketConversationList: [
            {
              conversationId: "d1",
              type: "DESCRIPTION",
              time: "2026-08-20T05:08:32.988",
              user: { userId: "u1", name: "Bot", email: "hide@example.com" },
              content: "<p>Low disk</p>",
            },
            {
              conversationId: "r1",
              type: "TECH_REPLY",
              time: "2026-08-20T06:00:00.000",
              user: { userId: "tech", name: "Tech", email: "tech@example.com" },
              content: "Checking",
            },
          ],
        };
      }
      if (query.includes("getTicketNoteList")) {
        return {
          getTicketNoteList: [
            {
              noteId: "n1",
              addedBy: { userId: "tech", name: "Tech", email: "tech@example.com" },
              addedOn: "2026-08-20T07:00:00.000",
              privacyType: "PRIVATE",
              content: "cleared space",
            },
          ],
        };
      }
      throw new Error(`unexpected query: ${query.slice(0, 80)}`);
    });

    const result = await investigateTicket({ ticket: "200826-0001" }, client);
    expect(result.status).toBe("complete");
    expect(result.provenance).toMatchObject({
      classifiedAs: "displayId",
      resolution: "displayId_condition_is",
      ticketId: "t-internal",
      displayId: "200826-0001",
    });
    expect((result.ticket as { site: { id: string } }).site.id).toBe("s1");
    expect((result.originalBody as { content: string; conversationId: string }).conversationId).toBe("d1");
    expect((result.originalBody as { content: string }).content).toContain("Low disk");
    expect(JSON.stringify(result.originalBody)).not.toContain("hide@example.com");
    const conversations = result.conversations as { items: Array<{ conversationId: string; type: string }> };
    expect(conversations.items.map((item) => item.conversationId)).toEqual(["r1"]);
    expect(conversations.items.some((item) => item.type === "DESCRIPTION")).toBe(false);
    expect(JSON.stringify(result.notes)).not.toContain("tech@example.com");

    const listCall = calls.find((call) => call.query.includes("getTicketList"));
    const input = (listCall?.variables as { input: Record<string, unknown> }).input;
    expect(input.page).toBe(1);
    expect(input.pageSize).toBe(DISPLAY_ID_LOOKUP_PAGE_SIZE);
    expect(input.condition).toEqual({ attribute: "displayId", operator: "is", value: "200826-0001" });
    expect(JSON.stringify(input)).not.toMatch(/createdTime/);
    expect(calls.filter((call) => call.query.includes("getTicketList"))).toHaveLength(1);
    expect(calls.some((call) => call.query.includes("getAlertList"))).toBe(false);
  });

  it("falls back once to includes when is is rejected, still requiring exact displayId", async () => {
    const operators: string[] = [];
    const client = fakeClient((query, variables) => {
      if (query.includes("getTicketList")) {
        const condition = (variables as { input: { condition: { operator: string; value: unknown } } }).input.condition;
        operators.push(condition.operator);
        if (condition.operator === "is") {
          throw new SuperOpsError("Invalid operator for attribute displayId");
        }
        expect(condition.value).toEqual(["200826-0001"]);
        return ticketList([{ ticketId: "t2", displayId: "200826-0001" }]);
      }
      if (query.includes("query getTicket(")) {
        return ticketGet({ ticketId: "t2", displayId: "200826-0001", subject: "x" });
      }
      if (query.includes("getTicketConversationList")) return { getTicketConversationList: [] };
      if (query.includes("getTicketNoteList")) return { getTicketNoteList: [] };
      throw new Error("unexpected");
    });
    const result = await investigateTicket({ ticket: "200826-0001" }, client);
    expect(operators).toEqual(["is", "includes"]);
    expect(result.status).toBe("complete");
    expect((result.provenance as { resolution: string }).resolution).toBe("displayId_condition_includes");
    expect((result.warnings as Array<{ code: string }>).some((item) => item.code === "original_body_missing")).toBe(
      true
    );
  });

  it("does not tenant-scan or use createdTime when both resolution forms fail", async () => {
    let listCalls = 0;
    const client = fakeClient((query) => {
      if (query.includes("getTicketList")) {
        listCalls += 1;
        throw new SuperOpsError("Unknown attribute displayId");
      }
      throw new Error("must not call other operations");
    });
    const result = await investigateTicket({ ticket: "200826-0001" }, client);
    expect(listCalls).toBe(2);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("resolution_unavailable");
    expect((result.provenance as { logicalOperations: string[] }).logicalOperations).toEqual([
      "getTicketList",
      "getTicketList",
    ]);
  });

  it("returns not_found only when an exact displayId lookup succeeds with zero matches", async () => {
    const client = fakeClient((query) => {
      if (query.includes("getTicketList")) return ticketList([{ ticketId: "other", displayId: "210826-0001" }]);
      throw new Error("must not get ticket");
    });
    const result = await investigateTicket({ ticket: "200826-0001" }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("not_found");
  });

  it("returns ambiguous_ticket when multiple exact displayId matches exist", async () => {
    const client = fakeClient((query) => {
      if (query.includes("getTicketList")) {
        return ticketList([
          { ticketId: "a", displayId: "200826-0001" },
          { ticketId: "b", displayId: "200826-0001" },
        ]);
      }
      throw new Error("must not get ticket");
    });
    const result = await investigateTicket({ ticket: "200826-0001" }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("ambiguous_ticket");
    expect(result.candidates).toEqual([
      { ticketId: "a", displayId: "200826-0001" },
      { ticketId: "b", displayId: "200826-0001" },
    ]);
  });

  it("treats opaque short ticketId as direct getTicket and maps get failure to lookup_failed", async () => {
    const client = fakeClient((query) => {
      if (query.includes("getTicketList")) throw new Error("must not list");
      if (query.includes("query getTicket(")) throw new SuperOpsError("backend exploded");
      throw new Error("unexpected");
    });
    const result = await investigateTicket({ ticket: "t1" }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("lookup_failed");
    expect(result.code).not.toBe("not_found");
    expect((result.provenance as { resolution: string }).resolution).toBe("ticketId_direct");
  });

  it("does not classify HTTP getTicket failure as not_found", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getTicket(")) {
        throw new SuperOpsHttpError("HTTP error: 500 Server Error", 500, "Server Error");
      }
      throw new Error("unexpected");
    });
    const result = await investigateTicket({ ticket: "opaque-id" }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("unavailable");
    expect(result.code).not.toBe("not_found");
  });

  it("selects earliest DESCRIPTION as originalBody and keeps extra DESCRIPTION in remaining items", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getTicket(")) {
        return ticketGet({ ticketId: "t1", displayId: "200826-0001" });
      }
      if (query.includes("getTicketConversationList")) {
        return {
          getTicketConversationList: [
            { conversationId: "later", type: "DESCRIPTION", time: "2026-08-20T02:00:00.000", content: "second" },
            { conversationId: "early", type: "DESCRIPTION", time: "2026-08-20T01:00:00.000", content: "first" },
            { conversationId: "reply", type: "REQ_REPLY", time: "2026-08-20T03:00:00.000", content: "thanks" },
          ],
        };
      }
      if (query.includes("getTicketNoteList")) return { getTicketNoteList: [] };
      throw new Error("unexpected");
    });
    const result = await investigateTicket({ ticket: "t1" }, client);
    expect((result.originalBody as { conversationId: string; content: string }).conversationId).toBe("early");
    expect((result.originalBody as { content: string }).content).toBe("first");
    const items = (result.conversations as { items: Array<{ conversationId: string }> }).items;
    expect(items.map((item) => item.conversationId)).toEqual(["later", "reply"]);
    expect((result.warnings as Array<{ code: string }>).some((item) => item.code === "multiple_description")).toBe(
      true
    );
  });

  it("keeps the most recent non-original conversations and presents them chronologically", async () => {
    const convos = Array.from({ length: 30 }, (_, index) => ({
      conversationId: `c${index}`,
      type: "TECH_REPLY",
      time: `2026-08-20T00:${String(index).padStart(2, "0")}:00.000Z`,
      content: `msg ${index}`,
    }));
    convos.unshift({
      conversationId: "body",
      type: "DESCRIPTION",
      time: "2026-08-19T00:00:00.000Z",
      content: "body",
    });
    const client = fakeClient((query) => {
      if (query.includes("query getTicket(")) return ticketGet({ ticketId: "t1", displayId: "200826-0001" });
      if (query.includes("getTicketConversationList")) return { getTicketConversationList: convos };
      if (query.includes("getTicketNoteList")) return { getTicketNoteList: [] };
      throw new Error("unexpected");
    });
    const result = await investigateTicket({ ticket: "t1" }, client);
    const conversations = result.conversations as {
      items: Array<{ conversationId: string }>;
      truncated: boolean;
      totalCount: number;
    };
    expect(conversations.truncated).toBe(true);
    expect(conversations.totalCount).toBe(30);
    expect(conversations.items).toHaveLength(CONVERSATION_ITEM_LIMIT);
    expect(conversations.items[0]?.conversationId).toBe("c6");
    expect(conversations.items.at(-1)?.conversationId).toBe("c29");
    expect(conversations.items.some((item) => item.conversationId === "body")).toBe(false);
  });

  it("returns partial when ticket loaded but conversations fail, without calling alerts", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getTicket(")) return ticketGet({ ticketId: "t1", displayId: "200826-0001" });
      if (query.includes("getTicketConversationList")) throw new SuperOpsError("conversations down");
      if (query.includes("getTicketNoteList")) return { getTicketNoteList: [] };
      if (query.includes("getAlertList")) throw new Error("must not list alerts");
      throw new Error("unexpected");
    });
    const result = await investigateTicket({ ticket: "t1" }, client);
    expect(result.status).toBe("partial");
    expect((result.errors as Array<{ code: string }>).some((item) => item.code === "conversations_unavailable")).toBe(
      true
    );
    expect((result.provenance as { sections: { conversations: string } }).sections.conversations).toBe("failed");
  });

  it("enriches explicit assetId, warns on client mismatch, and does not infer or scan alerts", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getTicket(")) {
        return ticketGet({ ticketId: "t1", displayId: "200826-0001", client: { accountId: "c-ticket", name: "A" } });
      }
      if (query.includes("getTicketConversationList")) return { getTicketConversationList: [] };
      if (query.includes("getTicketNoteList")) return { getTicketNoteList: [] };
      if (query.includes("query getAsset(")) {
        return {
          getAsset: { assetId: "a1", name: "PC", client: { accountId: "c-other", name: "B" } },
        };
      }
      if (query.includes("getAssetSoftwareList")) {
        return {
          getAssetSoftwareList: {
            assetSoftwares: [{ id: "s1", software: { softwareId: "x", name: "Chrome" }, version: "1" }],
            listInfo: { page: 1, pageSize: 25, hasMore: true, totalCount: 40 },
          },
        };
      }
      if (query.includes("getAssetPatchDetails")) {
        return {
          getAssetPatchDetails: {
            assetPatches: [
              { patchDetail: { title: "KB1" }, installationStatus: "Installed" },
              { patchDetail: { title: "KB2" }, installationStatus: "NewOrMissing" },
            ],
            listInfo: { page: 1, pageSize: 100, hasMore: false, totalCount: 2 },
          },
        };
      }
      if (query.includes("getAlertList")) throw new Error("must not list alerts");
      throw new Error(`unexpected ${query.slice(0, 40)}`);
    });
    const result = await investigateTicket({ ticket: "t1", assetId: "a1" }, client);
    expect(result.status).toBe("complete");
    expect((result.warnings as Array<{ code: string }>).some((item) => item.code === "asset_client_mismatch")).toBe(
      true
    );
    const asset = result.asset as {
      status: string;
      alerts: { status: string };
      software: { truncated: boolean };
      patches: { items: Array<{ installationStatus: string }> };
    };
    expect(asset.status).toBe("ok");
    expect(asset.alerts.status).toBe("unavailable");
    expect(asset.software.truncated).toBe(true);
    expect(asset.patches.items.map((item) => item.installationStatus)).toEqual(["NewOrMissing"]);
  });

  it("maps opaque asset get failure to lookup_failed, not not_found", async () => {
    const client = fakeClient((query) => {
      if (query.includes("query getTicket(")) return ticketGet({ ticketId: "t1", displayId: "200826-0001" });
      if (query.includes("getTicketConversationList")) return { getTicketConversationList: [] };
      if (query.includes("getTicketNoteList")) return { getTicketNoteList: [] };
      if (query.includes("query getAsset(")) throw new SuperOpsError("nope");
      throw new Error("unexpected");
    });
    const result = await investigateTicket({ ticket: "t1", assetId: "missing" }, client);
    expect(result.status).toBe("partial");
    expect((result.asset as { status: string }).status).toBe("lookup_failed");
    expect((result.errors as Array<{ code: string }>)[0]?.code).toBe("asset_lookup_failed");
    expect(result.code).toBeUndefined();
  });

  it("returns malformed_ticket without SuperOps calls", async () => {
    const client = fakeClient(() => {
      throw new Error("no SuperOps");
    });
    const result = await investigateTicket({ ticket: "" }, client);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("malformed_ticket");
  });
});
