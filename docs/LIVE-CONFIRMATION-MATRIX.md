# Live-confirmation matrix

Validation against the RPMC SuperOps tenant. Do not add public probe-only tools. After a tool-surface deploy, **fully reconnect** the Cursor MCP client (`mcp_auth` and idle-resume do not recache `tools/list`).

This file records **actual 0.1.6 live results** and the **0.1.7 code corrections** that followed. It does not rewrite earlier confirmation (0.1.3 `investigate_ticket` `displayId` `is` remains in force).

Legend: **safe failure** is the MCP outcome when SuperOps rejects the candidate. No row may fall back to a tenant scan. **No `getAlertList` fallback** from asset-scoped alerts.

## LIVE-CONFIRMED (0.1.6 tenant evidence)

| Tool / feature | GraphQL | Attribute | Operator | Result |
|---|---|---|---|---|
| investigate_ticket displayId | getTicketList | displayId | `is` | exact ticket; zero-match `not_found`. `includes` fallback unused |
| tickets_search status | getTicketList | status | `includes` + array | Closed 559 / New 11. Tenant does not use `Open` |
| tickets_search client | getTicketList | client.name | `is` | filtered |
| tickets_search site | getTicketList | site.name | `is` | filtered |
| tickets_search technician | getTicketList | technician.name | `is` | filtered |
| tickets_search techGroup | getTicketList | techGroup.name | `is` | filtered |
| tickets_search priority | getTicketList | priority | `is` | filtered |
| tickets_search created | getTicketList | createdTime | `on` / `inLast` | filtered |
| tickets_search updated | getTicketList | updatedTime | `on` | filtered |
| tickets_search sort | getTicketList | createdTime / updatedTime | DESC | **order actually changes** |
| assets_search / resolve identity | getAssetList | hostName / name / serialNumber / assetId / status | `is` | exact. name ≠ hostName independently |
| assets_search client/site | getAssetList | client.name / site.name | `is` | filtered |
| investigate_asset / alerts_search assetId | getAlertsForAsset | assetId + listInfo | — | accepted, asset-scoped, `createdTime DESC` accepted, `hasMore`/`totalCount` present, alerts belong to the requested asset. **No getAlertList** |
| alerts_search without assetId | getAlertList | status / severity / createdTime | is / includes / on | filtered; `createdTime DESC` accepted |
| investigate_client name | getClientList | name | `is` | unique client |
| investigate_client domain | getClientList | emailDomains | `includes` | unique client |
| investigate_client sites | getClientSiteList | clientId | official input | that client's sites |
| sites get / search | getClientSite / getClientSiteList | name | `is` | works |
| getAssetSummary | getAssetSummary | assetId | get | cpu/mem/disk present |
| getAssetActivity | getAssetActivity | assetId | list page 1 | bounded items |
| Identity lookups | list page 1 only | — | — | no tenant scans |
| Opaque getAsset | getAsset | assetId | get | hostname-as-assetId stays `lookup_failed`, never `not_found` |

## FAILED / UNSUPPORTED (0.1.6 tenant evidence)

| Feature | Evidence | MCP contract after 0.1.7 |
|---|---|---|
| getAssetList `lastCommunicatedTime` DESC | Rejected consistently. `assets_search` used to retry without sort; `investigate_client` did not, so a valid `client.name` asset page became `partial` | **Do not send** that sort. Shared `queryGetAssetList` uses SuperOps default order. Retry-without-sort is not kept for a live-confirmed-unsupported sort |
| getUnMonitoredAssetList | Rejected with **and** without sort | Public `unmonitored` argument remains, but returns `unsupported_filter` **without** calling SuperOps. Not faked by enumerating `getAssetList` |

## STILL UNCONFIRMED

| Item | Note |
|---|---|
| displayId `includes` fallback | Keep only if operator `is` is rejected. Do not change the confirmed `is` path |
| Natural duplicate hostName / client-name uniqueness | `ambiguous` on page-1 `hasMore` or multiple exact matches is implemented; not naturally exercised live |
| Live QNAP stderr audit privacy | Audit **code** allowlists metadata (`outcome`/`success`, no customer content). Live container stderr was not independently inspected in 0.1.6 |

## 0.1.7 code corrections (need targeted QNAP revalidation)

These preserve the 0.1.6 invariants above; they change MCP behavior where 0.1.6 evidence showed a defect.

- `investigate_client` assets no longer send `lastCommunicatedTime` sort
- `superops_assets_search` no longer sends or retries that sort
- `getAlertsForAsset` is confirmed-class: query **failure** → `investigate_asset` **partial**; truncation remains **complete**; `alertFilter.rpmcLiveConfirmed=true`
- JSON-scalar IDs above `Number.MAX_SAFE_INTEGER` are quoted at the HTTP parse boundary (post-`JSON.parse` `String()` cannot recover rounded digits)
- Primitive `superops_alerts_list` omits structured `asset.owner.email` (same policy as aggregators). Freeform `message`/`description` are not general-purpose email redaction
- Cursor tool catalog: server `tools/list` was already correct (24 tools). Full Cursor MCP reconnect remains required after deploy

Also re-check after deploy: no write tools; no page 2; no `getAlertList` when `assetId` is set; `rpmc_status` version/commit; identity lookups stay page 1.

## 0.1.8 new reads (NEEDS LIVE CONFIRMATION)

Do not mark these live-confirmed from unit tests. After the next QNAP deploy, fully reconnect MCP and exercise one representative call per tool. Safe failure is `unsupported_filter` / `lookup_failed` / `unavailable`. Never fall back to a tenant scan. Never call `getUnMonitoredAssetList`.

| MCP tool | GraphQL | Input to confirm | Expected | Safe failure |
|---|---|---|---|---|
| superops_fields_all | getAllFields | module=`TICKET` | Field definitions, options | lookup_failed |
| superops_fields_get | getField | module+id or columnName | one Field | lookup_failed, not not_found unless empty payload |
| superops_fields_lookup | getFields | 1-N identifiers | matching Fields | lookup_failed |
| superops_asset_custom_fields | getAssetCustomFields | optional modules | CustomField list | lookup_failed |
| superops_assets_disks | getAssetDiskDetails | live assetId | bounded disks | lookup_failed |
| superops_assets_user_log | getAssetUserLog | live assetId | bounded user logs | lookup_failed |
| superops_device_categories | getDeviceCategories | optional ENDPOINT | categories | lookup_failed |
| superops_client_users_get | getClientUser | userId | user without structured email | lookup_failed |
| superops_client_users_list | getClientUserList | optional clientId, page 1 | one page | unsupported_filter / lookup_failed |
| superops_client_users_associations | getClientUserAssociationList | page 1 | one page of associations | lookup_failed |
| superops_org_catalog | 8 bare lists | each kind | catalog rows | lookup_failed |
| superops_contracts_get/list | getClientContract(List) | contractId / page 1 | contract metadata | lookup_failed |
| superops_catalog_* / superops_services_* / superops_offered_items | catalog/service/offered queries | id or page 1 | prices usable, no writes | lookup_failed |
| superops_taxes_* / superops_payment_config | tax/payment queries | id / kind / page 1 | config lists | lookup_failed |
| superops_invoices_* | invoice queries | invoiceId / page 1 | totals + bounded lines; no email | lookup_failed |
| superops_itdocs_* | IT doc queries | itDocId / typeId+page / categories | metadata, no body field on type | lookup_failed |
| superops_kb_* | getKbItem / getKbItems | itemId / listInfo page 1 | description only, not download API | lookup_failed |
| superops_scripts_* | getScriptList / ByType | page 1 / type=WINDOWS | metadata, no execute | lookup_failed |
| superops_tasks_* / superops_work_statuses | getTask(List) / getWorkStatusList | taskId / page 1 | task JSON ticket leaf | lookup_failed |
| superops_worklogs_list | getWorklogEntries | module=TICKET page 1 | bounded entries; no ticketId-only query | lookup_failed |

