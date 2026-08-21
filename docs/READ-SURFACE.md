# Read-only capability inventory

Official source: [SuperOps MSP GraphQL API](https://developer.superops.com/msp) and Help Center [Search, pagination, and sorting](https://support.superops.com/en/articles/6632220-search-pagination-and-sorting) (retrieved 2026-08-21). Community code is reference only.

## A. Implemented and RPMC live-confirmed

- Transport/auth, pagination `hasMore` null→false, JSON association leaf selection
- Primitive reads: clients list/get, tickets list/get/conversations/notes, assets list/get/software/patches, alerts list, technicians list/groups, `superops_test_connection`, `rpmc_status`
- `investigate_ticket` including `displayId` + operator `is` + `DDMMYY-NNNN`, DESCRIPTION/`originalBody`, explicit `assetId` enrichment, no ticket→asset inference
- Ticket display number convention; `createdTime` wins if date encoding disagrees

## B. Implemented, awaiting RPMC live confirmation

See `docs/LIVE-CONFIRMATION-MATRIX.md`. Highlights:

- `getAlertsForAsset` (investigate_asset / alerts_search by assetId)
- Asset `hostName` / `name` / `serialNumber` operator `is`
- Ticket `status` `includes` + array; `client.name` / `site.name` / `technician.name` / `techGroup.name` `is`; `createdTime`/`updatedTime` `on` placeholders and `inLast`
- Ticket/asset/alert server-side `sort`
- Client `name` `is`, `emailDomains` `includes`
- `getClientSiteList.clientId`, site `name` `is`
- `getAssetSummary`, `getAssetActivity`, `getUnMonitoredAssetList`
- Asset `client.name` / `site.name` / `status` `is`

## C. Useful read capability implemented in this batch (was missing)

- `investigate_asset` human identity + summary/activity
- `investigate_client`
- `superops_tickets_search`, `superops_assets_search`, `superops_alerts_search`
- `superops_sites_list` / `get` / `search`

## D. Technically available, low-value for RPMC troubleshooting (deferred)

- Invoices, taxes, payment methods/terms, contracts, offered/service catalog items, KB, IT documentation
- Holiday/business-hour nested site details, designations, teams, technician roles, requester roles
- Ticket/asset/client custom-field schema dumps (`getAllFields` / `getFields` / `getAssetCustomFields`) — `getStatusList` is deprecated in favor of `getFields`
- Script list (adjacent to execute; no write surface)
- Tasks/projects, worklog entries (worklog input is module-scoped, not a documented ticketId get)
- Device category catalog, unmonitored as a separate public tool (folded into `superops_assets_search.unmonitored`)

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
| Writes, scripts, resolve-alert | Phase 1 read-only |
