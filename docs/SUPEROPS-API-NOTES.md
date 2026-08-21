# SuperOps API notes

Distinguish evidence. Community live findings are not RPMC tenant truth until Phase 1c says so.

## Officially documented

- MSP US: `https://api.superops.ai/msp`
- MSP EU: `https://euapi.superops.ai/msp`
- `Authorization: Bearer <token>`
- `CustomerSubDomain` required
- 100 requests/minute
- Max 100 records/page
- `ListInfoInput`: `page`, `pageSize`, `condition`, `sort`
- `getTicketConversationList`, `getTicketNoteList`
- Documented `Ticket` type has no `description` field and no assets field

## Independently live-confirmed (re-validate on RPMC)

- Association fields (`client`, `site`, `requester`, `technician`, `techGroup`, `sla`, `asset`) behave as JSON/String scalars; nested selections can raise `SubSelectionNotAllowed` (Servosity #114).
- Missing `CustomerSubDomain` can yield HTTP 400 empty body at ingress (Servosity #132).
- Ticket body is not a reliable `Ticket.description`; original body may appear as conversation `type=DESCRIPTION` (Computask).
- Ticket list payloads may omit ticket↔asset links (Servosity).
- Technician list field name: Computask uses `userList`; Servosity aliases `technicians`. RPMC queries `userList` first.

## Community assumption / workaround

- `pageSize` 500 (Computask UI copy vs documented 100). RPMC caps at 100.
- Nested `client { name }` on ticket lists (Sborgi). Do not use.
- Status filter operator `is` / `in` (Computask). Used only as an optional condition; failures are surfaced.

## RPMC live-confirmed

None yet. Fill this section during live read-only validation.
