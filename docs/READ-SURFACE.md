# Read-only capability inventory

Official source: [SuperOps MSP GraphQL API](https://developer.superops.com/msp) and Help Center [Search, pagination, and sorting](https://support.superops.com/en/articles/6632220-search-pagination-and-sorting) (retrieved 2026-08-21). Community code is reference only.

Live tenant evidence: **0.1.6** / **0.1.7** QNAP baseline, then **0.1.8** live expansion pass. Undeployed contract corrections: **0.1.9**. See `docs/LIVE-CONFIRMATION-MATRIX.md` and `docs/OFFICIAL-READ-INVENTORY.md`.

## A. Implemented and RPMC live-confirmed

- Transport/auth, pagination `hasMore` null→false, JSON association leaf selection
- Primitive reads: clients list/get, tickets list/get/conversations/notes, assets list/get/software/patches, alerts list, technicians list/groups, `superops_test_connection`, `rpmc_status`
- `investigate_ticket` including `displayId` + operator `is` + `DDMMYY-NNNN`, DESCRIPTION/`originalBody`, explicit `assetId` enrichment, no ticket→asset inference
- Ticket display number convention; `createdTime` wins if date encoding disagrees
- Ticket filters: `status` `includes` + array; `client.name` / `site.name` / `technician.name` / `techGroup.name` / `priority` `is`; `createdTime`/`updatedTime` `on`/`inLast`
- Ticket sort: `createdTime DESC` and `updatedTime DESC` change order
- Asset filters: `hostName` / `name` / `serialNumber` / `assetId` / `status` / `client.name` / `site.name` `is`
- `getAlertsForAsset` (investigate_asset / alerts_search by assetId), including `createdTime DESC`, `listInfo.hasMore`/`totalCount`, asset-scoped only. No `getAlertList` fallback
- Alert list filters without assetId: status / severity / `createdTime`, plus `createdTime DESC`
- Client resolution: `accountId`, `name` `is`, `emailDomains` `includes`
- Sites: `getClientSiteList.clientId`, `getClientSite`, name `is`
- `getAssetSummary`, `getAssetActivity`
- Identity lookups: page 1 only. Search: one requested page. No tenant scans

## B. Implemented, still unconfirmed or live-unsupported

- Ticket `displayId` `includes` fallback (keep only if `is` is rejected)
- Natural duplicate hostName / client-name uniqueness (`ambiguous` is implemented, not naturally seen live)
- Live container stderr audit inspection (code is allowlisted)
- **Unsupported on this tenant:** `getAssetList` `lastCommunicatedTime` sort — not sent (SuperOps default order)
- **Unsupported on this tenant:** `getUnMonitoredAssetList` — `unmonitored` returns `unsupported_filter` without calling SuperOps and without enumerating assets

## C. Aggregator status semantics (0.1.7)

- `investigate_asset` `complete` requires asset plus summary, activity, software, patches, **and** `getAlertsForAsset`. Truncation of those sections does not by itself make the result partial. A failed `getAlertsForAsset` query **does** (`partial`)
- `investigate_client` sites via official `clientId`; assets/tickets via documented `client.name` then local `accountId` pin. Asset list uses default SuperOps order (no `lastCommunicatedTime` sort)
- Opaque `assetId` (GraphQL `ID`, not a numeric-length rule). Opaque get failure is never `not_found`
- Constrained search: `superops_tickets_search`, `superops_assets_search`, `superops_alerts_search`
- `superops_sites_list` / `get` / `search`

## D. Complete official read accounting

See `docs/OFFICIAL-READ-INVENTORY.md`. Every official SuperOps `get*` query is IMPLEMENTED, EXCLUDED (with reason), or DEFERRED / SPECIAL-PURPOSE. There is no silent low-value bucket.

The 44 newly approved reads were live-accounted in 0.1.8. 0.1.9 corrects GraphQL object-field selections, requires getAssetCustomFields modules, redacts IT-doc secret custom fields, and stops labeling unfiltered GraphQL failures as `unsupported_filter`. KB article body download remains a planned future addon. Deprecated Field replacements are not used. `getUnMonitoredAssetList` is never invoked.

## E. Unsuitable / intentionally not implemented

| Item | Reason |
|---|---|
| Arbitrary GraphQL / raw `RuleConditionInput` | Non-deterministic, easy to over-fetch |
| Ticket `contains` / `startsWith` identity | Not exact; ambiguity |
| Tenant-wide alert/ticket/asset walks | Rate limit + privacy |
| `investigate_alert` | No extra evidence beyond search + investigate_asset |
| Ticket→asset inference | Live-confirmed absent |
| Client-scoped alerts via `asset.client.name` | Alert type has no documented client filter |
| Nested association GraphQL selections | `SubSelectionNotAllowed` / official JSON scalars |
| `Ticket.description` | Not on official Ticket type |
| Writes, scripts, resolve-alert | Phase 1 read-only; script *list* tools do not execute |
| Inferring unmonitored assets from `getAssetList` | Would be a tenant scan; official query is live-unsupported |
| Deprecated Field replacements (`getStatusList`, `getPriorityList`, …) | SuperOps: use current Field APIs |
| `getAssetPatchStatus` | Redundant with `getAsset.patchStatus` |
| `getAssetInfoByTPEndpointIds` | Deferred special-purpose; no RPMC TP endpoint IDs |

## Privacy (structured email)

Aggregators and constrained search omit structured `email` keys (requester/owner/user objects). Primitive `superops_alerts_list` does the same for `asset.owner.email`. Primitive `superops_technicians_list` still returns structured technician email (existing 0.1.7 behavior). Freeform ticket/alert `message`, `description`, conversations, and notes are **not** general-purpose email redaction; emails inside those fields can be diagnostically relevant.

IT documentation `customFields`: PASSWORD / SECURE_TEXT values and product/license-key-shaped values are redacted (`redacted=true`, presence preserved). Ordinary product names, notes, URLs, and server names are kept. Generic secret sanitizer remains defense in depth.

## Cursor MCP catalog

The server `tools/list` surface is static for a process lifetime and already advertises `listChanged`. After a QNAP image with a new tool set, a **full Cursor MCP reconnect** is required. `mcp_auth` and idle-resume do not refresh a stale Cursor session catalog. This is operational, not a missing `notifications/tools/list_changed` on a running process.
