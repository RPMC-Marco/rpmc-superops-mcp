/** RPMC human ticket numbers: DDMMYY-NNNN */
export const DISPLAY_ID_PATTERN = /^\d{6}-\d{4}$/;

export type TicketRefKind = "displayId" | "ticketId";

export type TicketRef =
  | { kind: TicketRefKind; value: string }
  | { kind: "malformed"; value: string };

export function classifyTicketRef(raw: unknown): TicketRef {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return { kind: "malformed", value: "" };
  }
  if (DISPLAY_ID_PATTERN.test(value)) {
    return { kind: "displayId", value };
  }
  return { kind: "ticketId", value };
}
