import { describe, expect, it } from "vitest";
import { ALL_QUERY_DOCUMENTS, GET_TECHNICIAN_LIST, GET_TICKET, GET_TICKET_LIST } from "./superops/queries.js";

const NESTED_ASSOCIATION = /\b(client|site|requester|technician|techGroup|sla|asset)\s*\{/;

describe("graphql contracts", () => {
  it("does not nest SuperOps association fields", () => {
    for (const document of ALL_QUERY_DOCUMENTS) {
      expect(document, document.slice(0, 80)).not.toMatch(NESTED_ASSOCIATION);
    }
  });

  it("uses official page pagination fields", () => {
    expect(GET_TICKET_LIST).toMatch(/\bpage\b/);
    expect(GET_TICKET_LIST).toMatch(/\bpageSize\b/);
    expect(GET_TICKET_LIST).toMatch(/\bhasMore\b/);
    expect(GET_TICKET_LIST).not.toMatch(/\bfirst\s*:/);
    expect(GET_TICKET_LIST).not.toMatch(/\bafter\s*:/);
    expect(GET_TICKET_LIST).not.toMatch(/\bendCursor\b/);
  });

  it("does not query Ticket.description", () => {
    expect(GET_TICKET).not.toMatch(/\bdescription\b/);
    expect(GET_TICKET_LIST).not.toMatch(/\bdescription\b/);
  });

  it("uses official getTechnicianList.userList", () => {
    expect(GET_TECHNICIAN_LIST).toMatch(/\buserList\b/);
  });
});
