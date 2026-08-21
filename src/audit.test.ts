import { describe, expect, it } from "vitest";
import { buildToolCallAudit, sanitizeAuditMetadata } from "./audit.js";
import { investigationAuditFromResult } from "./investigate/audit.js";

describe("audit model", () => {
  it("treats aggregator complete as success and keeps outcome explicit", () => {
    const event = buildToolCallAudit({
      toolName: "investigate_ticket",
      classification: "read",
      operationKind: "query",
      durationMs: 12,
      isError: false,
      argumentKeys: ["ticket"],
      investigation: {
        outcome: "complete",
        metadata: { resolution: "displayId_condition_is", logicalOperations: ["getTicket"] },
      },
    });
    expect(event.success).toBe(true);
    expect(event.outcome).toBe("complete");
    expect(event.errorCode).toBeUndefined();
    expect(event.metadata?.resolution).toBe("displayId_condition_is");
  });

  it("marks partial investigations as unsuccessful with outcome partial", () => {
    const event = buildToolCallAudit({
      toolName: "investigate_ticket",
      classification: "read",
      operationKind: "query",
      durationMs: 20,
      isError: false,
      argumentKeys: ["ticket"],
      investigation: {
        outcome: "partial",
        errorCode: "conversations_unavailable",
        metadata: { sections: { conversations: "failed", ticket: "ok" } },
      },
    });
    expect(event.success).toBe(false);
    expect(event.outcome).toBe("partial");
    expect(event.errorCode).toBe("conversations_unavailable");
  });

  it("marks failed investigations as unsuccessful even when the handler returned JSON", () => {
    const event = buildToolCallAudit({
      toolName: "investigate_ticket",
      classification: "read",
      operationKind: "query",
      durationMs: 8,
      isError: false,
      argumentKeys: ["ticket"],
      investigation: { outcome: "failed", errorCode: "not_found" },
    });
    expect(event.success).toBe(false);
    expect(event.outcome).toBe("failed");
    expect(event.errorCode).toBe("not_found");
    expect(event.errorSummary).toBe("not_found");
  });

  it("keeps primitive handler-return success as complete when isError is false", () => {
    const event = buildToolCallAudit({
      toolName: "superops_tickets_get",
      classification: "read",
      operationKind: "query",
      durationMs: 5,
      isError: false,
      argumentKeys: ["ticketId"],
    });
    expect(event.success).toBe(true);
    expect(event.outcome).toBe("complete");
  });

  it("drops customer content keys from metadata", () => {
    const sanitized = sanitizeAuditMetadata({
      resolution: "ticketId_direct",
      subject: "Printer jam",
      content: "please email bob@client.com",
      email: "bob@client.com",
      name: "Bob",
      publicIp: "10.0.0.1",
      argumentKeys: ["ticket"],
    });
    const blob = JSON.stringify(sanitized);
    expect(blob).toContain("ticketId_direct");
    expect(blob).not.toContain("Printer jam");
    expect(blob).not.toContain("bob@client.com");
    expect(blob).not.toContain("10.0.0.1");
    expect(blob).not.toContain("Bob");
  });

  it("builds investigation audit without copying ticket bodies", () => {
    const audit = investigationAuditFromResult({
      status: "complete",
      ticket: { subject: "SECRET SUBJECT", requester: { name: "Ada", email: "ada@ex.com" } },
      originalBody: { content: "Call me at ada@ex.com about the outage" },
      provenance: {
        resolution: "displayId_condition_is",
        classifiedAs: "displayId",
        sections: { ticket: "ok", conversations: "ok", notes: "ok", asset: "not_requested" },
        truncated: { conversations: false },
        logicalOperations: ["getTicketList", "getTicket"],
      },
    });
    const blob = JSON.stringify(audit);
    expect(audit.outcome).toBe("complete");
    expect(audit.metadata.resolution).toBe("displayId_condition_is");
    expect(blob).not.toContain("SECRET SUBJECT");
    expect(blob).not.toContain("ada@ex.com");
    expect(blob).not.toContain("outage");
  });
});
