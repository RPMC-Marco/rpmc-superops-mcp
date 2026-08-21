# SuperOps API notes

Distinguish evidence. Community live findings are not RPMC tenant truth until live validation says so.

Official source reviewed: [SuperOps MSP GraphQL API](https://developer.superops.com/msp) (retrieved 2026-08-21) and SuperOps Help Center [Search, pagination, and sorting](https://support.superops.com/en/articles/6632220-search-pagination-and-sorting).

RPMC live read-only validation completed 2026-08-20 against the real RPMC SuperOps tenant: **PASS WITH MINOR CORRECTIONS**. Corrections (pagination boolean, flattened `superops_tickets_get`) are in this repository.

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

## Independently live-confirmed (other tenants; still true as background)

- Nested selections on association JSON scalars can raise `SubSelectionNotAllowed` (Servosity #114). Official docs classify those fields as `JSON`; RPMC selects them as leaves
- Missing `CustomerSubDomain` can yield HTTP 400 empty body at ingress (Servosity #132)
- Ticket list payloads may omit ticket↔asset links (Servosity). Official `Ticket` type has no assets field

## Community assumption / workaround

- `pageSize` 500 (Computask UI copy vs documented 100). RPMC caps at 100
- Nested `client { name }` on ticket lists (Sborgi). Do not use
- Status filter operator `is` / `in` (Computask). **Not exposed in Phase 1.** Official ticket-status example uses `includes` + array. **RPMC tenant status filtering remains unvalidated.**

## RPMC live-confirmed

Independent live read-only validation against the RPMC SuperOps tenant (2026-08-20). No writes. No status-filter probe.

- All currently registered GraphQL read tools executed successfully: clients list/get, tickets list/get, conversations, notes, assets list/get/software/patches, alerts list, technicians list, technician groups, plus `superops_test_connection`
- JSON association fields (`client`, `site`, `requester`, `technician`, `techGroup`, and similar), when leaf-selected, return object/scalar-like JSON structures (not nested GraphQL selections)
- `getTechnicianList.userList` is the correct technician list field
- Original ticket body is returned as a conversation with `type: DESCRIPTION`. `Ticket.description` is not used and is not queried
- `Ticket` has **no confirmed asset association** on this tenant. Do not guess ticket↔asset from ticket fields
- `Alert.asset` does expose `assetId` (alert-to-asset link)
- Intermediate list pages can return `hasMore: true`. **Final pages returned `hasMore: null`**. The MCP normalizes `null` to `false` so callers always see a boolean; `true` is left as `true`
- Ticket list order must **not** be assumed newest-first
- `superops_technicians_groups` / `getTechnicianGroupList` returns a **bare array**
- Requester/user object shapes can differ by endpoint; do not assume one user shape everywhere
- Asset software list items: `software` is an **object** containing `softwareId`, `name`, `manufacturer` (not a bare string)
- Credential redaction was **not naturally exercised** during live validation (no credential-like strings in sampled human fields). Unit tests still cover redaction. Do not treat live silence as proof that production data is free of secrets
- Status filtering remains **unvalidated** and is not exposed on the public MCP schema

### Ticket display number (`displayId`)

RPMC SuperOps ticket display numbers use:

```
DDMMYY-NNNN
```

The four-digit sequence resets daily.

Examples:

- `200826-0001` = first ticket created 20 August 2026
- `200826-0002` = second ticket that day
- `210826-0001` = first ticket 21 August 2026

If the encoded date and SuperOps `createdTime` ever disagree, treat **`createdTime` as authoritative**.
