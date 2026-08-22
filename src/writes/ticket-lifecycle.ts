/**
 * RPMC ticket lifecycle authority.
 *
 * Resolved = technician believes the issue is solved; ready for management review.
 * Closed = management review is complete; support has concluded.
 *
 * The AI is an additional RPMC technician. Delegated "handle this ticket" work may
 * move a ticket to Resolved when evidence supports it. Closed requires an explicit
 * human close instruction. Closed is still write_visible — this is workflow authority,
 * not consequence reclassification.
 *
 * SuperOps status names are tenant-configurable. Only obvious Closed-class names are
 * gated; unknown custom names are not blocked.
 */

export function looksLikeClosedStatus(status: string): boolean {
  return /\bclosed\b/i.test(status.trim());
}

export function looksLikeResolvedStatus(status: string): boolean {
  const value = status.trim();
  if (looksLikeClosedStatus(value)) return false;
  return /\bresolved\b/i.test(value);
}

export function grantTerminatedByTicketStatus(status: string | undefined): boolean {
  if (!status?.trim()) return false;
  return looksLikeClosedStatus(status) || looksLikeResolvedStatus(status);
}

export const CLOSED_REQUIRES_EXPLICIT_INSTRUCTION =
  "Ticket Closed is a management/operator action. Generic ticket handling may set Resolved when the issue is solved, but must not independently move a ticket to Closed. Retry with lifecycle=close only when the human explicitly instructed to close this ticket.";
