import { describe, expect, it } from "vitest";
import { classifyTicketRef } from "./ticket-ref.js";

describe("classifyTicketRef", () => {
  it("recognizes RPMC displayId DDMMYY-NNNN", () => {
    expect(classifyTicketRef("200826-0001")).toEqual({ kind: "displayId", value: "200826-0001" });
    expect(classifyTicketRef(" 130126-0001 ")).toEqual({ kind: "displayId", value: "130126-0001" });
  });

  it("treats opaque non-displayId identifiers as ticketId", () => {
    expect(classifyTicketRef("37232325670187008")).toEqual({
      kind: "ticketId",
      value: "37232325670187008",
    });
    expect(classifyTicketRef("t1")).toEqual({ kind: "ticketId", value: "t1" });
    expect(classifyTicketRef("abc-internal")).toEqual({ kind: "ticketId", value: "abc-internal" });
    expect(classifyTicketRef("12")).toEqual({ kind: "ticketId", value: "12" });
  });

  it("rejects empty values as malformed", () => {
    expect(classifyTicketRef("")).toEqual({ kind: "malformed", value: "" });
    expect(classifyTicketRef("   ")).toEqual({ kind: "malformed", value: "" });
    expect(classifyTicketRef(undefined)).toEqual({ kind: "malformed", value: "" });
  });

  it("does not treat hyphenated non-display values as displayId", () => {
    expect(classifyTicketRef("200826-01")).toEqual({ kind: "ticketId", value: "200826-01" });
    expect(classifyTicketRef("200826-00001")).toEqual({ kind: "ticketId", value: "200826-00001" });
  });
});
