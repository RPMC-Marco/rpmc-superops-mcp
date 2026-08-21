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

### `investigate_ticket` (RPMC LIVE-CONFIRMED, 2026-08-20 / 0.1.3)

Treat as suitable for normal read-only use. Do not change the confirmed `displayId` `is` path.

- Ticket lookup by human display number uses `getTicketList` page 1 only:
  - `condition.attribute = displayId`
  - `condition.operator = is`
  - `condition.value = DDMMYY-NNNN` (string, not array)
- Tested successfully across multiple real RPMC displayIds
- Successful zero-match correctly maps to `ticket_not_found` / aggregator `code: not_found`
- Direct internal `ticketId` works
- DESCRIPTION / `originalBody` behavior works
- Optional explicit `assetId` enrichment works
- Ticket-to-asset must **never** be inferred
- `investigate_ticket` does **not** scan alerts and does not call `getAlertsForAsset`
- `includes` remains an **unconfirmed fallback** (not exercised live). Keep it only if `is` is rejected by SuperOps. Do not change the confirmed `is` path
- After a deployed tool-surface change, Cursor may retain a stale `tools/list` catalog. A **full MCP reconnect** refreshes it
- Freeform ticket bodies (DESCRIPTION / conversations / notes) are sanitized for HTML and credential-like patterns. They are **not** general-purpose email redaction. Emails inside ticket evidence may be technically relevant and are left in place
- Aggregator asset enrichment omits structured `asset.detail.requester.email` while keeping requester id/name. That is not a global email strip

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

### Asset identifiers

Official `getAsset` requires `AssetIdentifierInput.assetId`, typed as GraphQL `ID!`. The schema does **not** say IDs are numeric or have a minimum length. Official examples are often long digit strings (`"9001114136934215681"`); `ClientIdentifierInput` even examples `"4"`. Those are examples, not validation rules.

Public `assetId` is therefore an opaque non-empty ID (whitespace rejected). Human identifiers are separate fields (`hostName`, `name`, `serialNumber`) and are not inferred from `assetId` format. A hostname passed as `assetId` is sent to `getAsset`; opaque failures stay `lookup_failed` / `unavailable`, never `not_found`.

Help Center documents string operator `is` for ListInfoInput attribute paths. Asset `name`, `hostName`, and `serialNumber` exact `is` lookups are **documented candidates** (page 1, size 5, local exact match, `ambiguous` if duplicates or `hasMore`). They are **not** RPMC live-confirmed yet. `contains` / fuzzy matching is not used.

### Client identifiers and `investigate_client` scoping

`Client.name` is an official String field. SuperOps does **not** document that client names are unique. `emailDomains` is `[String]`; Help Center `includes` takes an array for multi-valued attributes. `getClient` remains the accountId path. Exact name / domain resolution is implemented, not live-confirmed. A single match on page 1 with `hasMore: true` is `ambiguous` (uniqueness was not proven).

Official Ticket `client` JSON: “Returns accountId and name fields as JSON. **The name field can be used in the filter condition.**” That is an allowlist of the nested `name` field, not `accountId`. This MCP does **not** invent a `client.accountId` list filter.

`investigate_client` therefore:

- Scopes sites with official `GetClientSiteListInput.clientId`
- Retrieves a bounded asset/ticket page with documented `client.name` `is` using the resolved client's name
- Locally keeps only rows whose `client.accountId` equals the resolved accountId

That preserves the invariant that client X's investigation never silently presents another client's records as X. Local pinning of one page cannot invent later-page rows for X; leftover `hasMore` or dropped foreign rows are marked truncated. `superops_tickets_search` / `superops_assets_search` `clientName` remains an honest name search (the caller asked for a name, not an accountId).

### Sites

Official `getClientSite` / `getClientSiteList`. `GetClientSiteListInput.clientId` is documented for client-scoped sites (used by `investigate_client` and optional `superops_sites_list`). Site `name` `is` is a Help Center string-operator candidate.

### Alerts for one asset

Official MSP docs include `getAlertsForAsset(input: AssetDetailsListInput!)` — “Fetches the list of alerts of an asset.” That is the documented asset-scoped query (same input type as software/patches: `assetId` + `listInfo`). RPMC live-confirmed that `Alert.asset.assetId` exists on alert payloads; **`getAlertsForAsset` itself is not yet RPMC live-confirmed**.

`investigate_asset` uses a single page of `getAlertsForAsset` (page 1, pageSize 25). `superops_alerts_search` with `assetId` uses the same query. Tenant-wide `getAlertList` is used only when searching alerts **without** an assetId, still one page, with explicit filters. Optional `createdTime DESC` sort is documented `SortInput` generally; whether a given list accepts that attribute is unconfirmed and is retried without sort if rejected.

**`investigate_asset` complete vs partial:** `failed` means the asset was not loaded. `partial` means a confirmed-class enrichment query failed (`summary`, `activity`, `software`, `patches`). Truncation of those sections does not by itself make the result partial. `getAlertsForAsset` is documented but not RPMC live-confirmed; an unavailable alerts section does **not** by itself make the investigation partial, and audit `success` still follows `outcome === complete`. Lack of live confirmation does not redefine `complete` on each call. After `getAlertsForAsset` is live-confirmed, treat an alert-query failure like software/patches (`failed` → overall `partial`). Until then, keep alerts optional/isolated.

Constrained ticket/asset/alert search tools never walk additional pages. Rejected filters return `unsupported_filter`.

See `docs/READ-SURFACE.md` and `docs/LIVE-CONFIRMATION-MATRIX.md`.

### Audit logs

MCP stderr audit lines are JSON `mcp.tool_call` records.

- `success` = the tool achieved its intended result (`outcome === complete`)
- `outcome` = `complete` | `partial` | `failed`
- Aggregator failed/partial investigations are `success: false` even when the MCP handler returns structured JSON (`isError` is false)
- Primitive reads without an investigation payload: `success` follows `!isError`, `outcome` is `complete` or `failed`

Audit metadata is a whitelist (resolution method, section state, truncation, logical operations, safe upstream category). It must not include ticket/alert bodies, subjects, requester/customer names, emails, IP addresses, tokens, or raw SuperOps bodies.
