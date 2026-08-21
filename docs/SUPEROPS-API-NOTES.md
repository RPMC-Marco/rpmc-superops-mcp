# SuperOps API notes

Distinguish evidence. Community live findings are not RPMC tenant truth until live validation says so.

Official source reviewed for this pass: [SuperOps MSP GraphQL API](https://developer.superops.com/msp) (retrieved 2026-08-21) and SuperOps Help Center [Search, pagination, and sorting](https://support.superops.com/en/articles/6632220-search-pagination-and-sorting).

## Officially documented

- MSP US: `https://api.superops.ai/msp`
- MSP EU: `https://euapi.superops.ai/msp`
- `Authorization: Bearer <token>`
- `CustomerSubDomain` required
- 100 requests/minute
- Max 100 records/page
- `ListInfoInput`: `page`, `pageSize`, `condition`, `sort`
- Pagination fields include `page`, `pageSize`, `hasMore` (Help Center + `ListInfo` examples)
- `getTicketConversationList`, `getTicketNoteList`
- `getTechnicianList` returns `TechnicianList` with `userList` and `listInfo` (example query on the MSP API page)
- `TicketConversationType.DESCRIPTION`: “Denotes the description of the ticket since it will be created as the first message of a conversation.”
- Documented `Ticket` type has **no** `description` field and no ticket↔asset association field
- Association fields on `Ticket` and related types are documented as GraphQL `JSON` scalars (`client`, `site`, `requester`, `additionalRequester`, `followers`, `techGroup`, `technician`, `sla`, plus Alert `asset`/`policy`, etc.). Docs say nested object fields are returned as JSON (accountId/name, userId/name, …)
- Filter conditions are `{ attribute, operator, value }` with operators that depend on attribute datatype. Help Center ticket example uses `"attribute": "status", "operator": "includes", "value": ["Resolved", "Closed"]` (array). A general `is` operator is shown for other attributes (e.g. email), not as the documented ticket-status operator

## Independently live-confirmed (re-validate on RPMC)

- Nested selections on association JSON scalars can raise `SubSelectionNotAllowed` (Servosity #114). Official docs now classify those fields as `JSON`; RPMC still selects them as leaves
- Missing `CustomerSubDomain` can yield HTTP 400 empty body at ingress (Servosity #132)
- Ticket list payloads may omit ticket↔asset links (Servosity). Official `Ticket` type still has no assets field
- Technician list field name: Computask uses `userList`; Servosity aliases `technicians`. Official example uses `userList`. RPMC queries `userList`

## Community assumption / workaround

- `pageSize` 500 (Computask UI copy vs documented 100). RPMC caps at 100
- Nested `client { name }` on ticket lists (Sborgi). Do not use
- Status filter operator `is` / `in` (Computask). **Not exposed in Phase 1.** Official ticket-status example uses `includes` + array. Do not guess the RPMC-tenant operator until live validation

## RPMC live-confirmed

None yet. Fill this section during live read-only validation.
