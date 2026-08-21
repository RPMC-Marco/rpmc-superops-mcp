# Official SuperOps MSP read inventory

Official source: [SuperOps MSP GraphQL API](https://developer.superops.com/msp) retrieved **2026-08-21**.

This file accounts for **100% of official `get*` query operations** in that schema (76 queries). There is no “low-value deferred” bucket.

Status values:

- **IMPLEMENTED / LIVE-CONFIRMED** — MCP tool exists; RPMC tenant confirmed
- **IMPLEMENTED / NEEDS LIVE CONFIRMATION** — MCP tool exists; not yet live-confirmed on RPMC
- **EXCLUDED / DEPRECATED** — SuperOps replaced it with Field APIs
- **EXCLUDED / REDUNDANT** — same information already exposed
- **EXCLUDED / LIVE UNSUPPORTED** — RPMC tenant rejects the query
- **DEFERRED / SPECIAL-PURPOSE** — not currently usable at RPMC; not rejected forever
- **PHASE 2 PARKED** — mutation; not a read

Official KB article *body* is a separate SuperOps download API (`module=KB_ARTICLE_CONTENT`), not a GraphQL query. It is **not** in the 76 `get*` operations. GraphQL `getKbItem`/`getKbItems` return description/summary only. That download API is **NEEDS TABLETOP DECISION** if RPMC later wants full article HTML.

## Existing 18 reads (preserved)

| Query | Status | MCP reachability |
|---|---|---|
| getAlertList | IMPLEMENTED / LIVE-CONFIRMED | `superops_alerts_list`, `superops_alerts_search` (no assetId) |
| getAlertsForAsset | IMPLEMENTED / LIVE-CONFIRMED | `investigate_asset`, `superops_alerts_search` (assetId) |
| getAsset | IMPLEMENTED / LIVE-CONFIRMED | `superops_assets_get`, aggregators |
| getAssetActivity | IMPLEMENTED / LIVE-CONFIRMED | `investigate_asset` |
| getAssetList | IMPLEMENTED / LIVE-CONFIRMED | `superops_assets_list`, `superops_assets_search`, identity resolve |
| getAssetPatchDetails | IMPLEMENTED / LIVE-CONFIRMED | `superops_assets_patches`, `investigate_asset` |
| getAssetSoftwareList | IMPLEMENTED / LIVE-CONFIRMED | `superops_assets_software`, `investigate_asset` |
| getAssetSummary | IMPLEMENTED / LIVE-CONFIRMED | `investigate_asset` |
| getClient | IMPLEMENTED / LIVE-CONFIRMED | `superops_clients_get`, `investigate_client` |
| getClientList | IMPLEMENTED / LIVE-CONFIRMED | `superops_clients_list`, `investigate_client` |
| getClientSite | IMPLEMENTED / LIVE-CONFIRMED | `superops_sites_get` |
| getClientSiteList | IMPLEMENTED / LIVE-CONFIRMED | `superops_sites_list` / `search`, `investigate_client` |
| getTechnicianGroupList | IMPLEMENTED / LIVE-CONFIRMED | `superops_technicians_groups` |
| getTechnicianList | IMPLEMENTED / LIVE-CONFIRMED | `superops_technicians_list` |
| getTicket | IMPLEMENTED / LIVE-CONFIRMED | `superops_tickets_get`, `investigate_ticket` |
| getTicketConversationList | IMPLEMENTED / LIVE-CONFIRMED | `superops_tickets_conversations`, `investigate_ticket` |
| getTicketList | IMPLEMENTED / LIVE-CONFIRMED | `superops_tickets_list` / `search`, `investigate_ticket` / `investigate_client` |
| getTicketNoteList | IMPLEMENTED / LIVE-CONFIRMED | `superops_tickets_notes`, `investigate_ticket` |

`getUnMonitoredAssetList` remains in the GraphQL document set for the unused-query contract test only. **It is never invoked.**

## Newly implemented (44)

All of these are **IMPLEMENTED / NEEDS LIVE CONFIRMATION**.

| # | Query | MCP tool |
|---|---|---|
| 1 | getAllFields | `superops_fields_all` |
| 2 | getField | `superops_fields_get` |
| 3 | getFields | `superops_fields_lookup` |
| 4 | getAssetCustomFields | `superops_asset_custom_fields` |
| 5 | getAssetDiskDetails | `superops_assets_disks` |
| 6 | getAssetUserLog | `superops_assets_user_log` |
| 7 | getDeviceCategories | `superops_device_categories` |
| 8 | getClientStageList | `superops_org_catalog` kind=`client_stage` |
| 9 | getClientUser | `superops_client_users_get` |
| 10 | getClientUserList | `superops_client_users_list` |
| 11 | getClientUserAssociationList | `superops_client_users_associations` |
| 12 | getRequesterRoleList | `superops_org_catalog` kind=`requester_role` |
| 13 | getTechnicianRoleList | `superops_org_catalog` kind=`technician_role` |
| 14 | getDesignationList | `superops_org_catalog` kind=`designation` |
| 15 | getTeamList | `superops_org_catalog` kind=`team` |
| 16 | getBusinessFunctionList | `superops_org_catalog` kind=`business_function` |
| 17 | getClientContract | `superops_contracts_get` |
| 18 | getClientContractList | `superops_contracts_list` |
| 19 | getSLAList | `superops_org_catalog` kind=`sla` |
| 20 | getOfferedItems | `superops_offered_items` |
| 21 | getServiceCatalogItem | `superops_catalog_get` |
| 22 | getServiceCatalogItemList | `superops_catalog_list` |
| 23 | getServiceCategoryList | `superops_catalog_categories` |
| 24 | getServiceItem | `superops_services_get` |
| 25 | getServiceItemList | `superops_services_list` |
| 26 | getTax | `superops_taxes_get` |
| 27 | getTaxList | `superops_taxes_list` |
| 28 | getPaymentMethodList | `superops_payment_config` kind=`method` |
| 29 | getPaymentTermList | `superops_payment_config` kind=`term` |
| 30 | getInvoice | `superops_invoices_get` |
| 31 | getInvoiceList | `superops_invoices_list` |
| 32 | getInvoiceItemList | `superops_invoice_items` |
| 33 | getItDocumentation | `superops_itdocs_get` |
| 34 | getItDocumentationList | `superops_itdocs_list` |
| 35 | getItDocumentationCategories | `superops_itdocs_categories` |
| 36 | getKbItem | `superops_kb_get` |
| 37 | getKbItems | `superops_kb_list` |
| 38 | getScriptList | `superops_scripts_list` |
| 39 | getScriptListByType | `superops_scripts_by_type` |
| 40 | getTask | `superops_tasks_get` |
| 41 | getTaskList | `superops_tasks_list` |
| 42 | getWorkStatusList | `superops_work_statuses` |
| 43 | getWorklogEntries | `superops_worklogs_list` |
| 44 | getHolidayList | `superops_org_catalog` kind=`holiday` |

## Exclusions

| Query | Status | Reason |
|---|---|---|
| getCategoryList | EXCLUDED / DEPRECATED | SuperOps: use `getFields` |
| getCauseList | EXCLUDED / DEPRECATED | SuperOps: use `getFields` |
| getClientCustomField | EXCLUDED / DEPRECATED | SuperOps: use `getField` |
| getClientCustomFieldList | EXCLUDED / DEPRECATED | SuperOps: use `getFields` |
| getImpactList | EXCLUDED / DEPRECATED | SuperOps: use `getFields` |
| getPriorityList | EXCLUDED / DEPRECATED | SuperOps: use `getFields` |
| getResolutionCodeList | EXCLUDED / DEPRECATED | SuperOps: use `getFields` |
| getStatusList | EXCLUDED / DEPRECATED | SuperOps: use `getFields` |
| getTicketCustomField | EXCLUDED / DEPRECATED | SuperOps: use `getField` |
| getTicketCustomFieldList | EXCLUDED / DEPRECATED | SuperOps: use `getFields` |
| getUrgencyList | EXCLUDED / DEPRECATED | SuperOps: use `getFields` |
| getAssetPatchStatus | EXCLUDED / REDUNDANT | Official text: “use Patch status in getAsset API”. Already exposed via `getAsset.patchStatus` and `getAssetPatchDetails` |
| getUnMonitoredAssetList | EXCLUDED / LIVE UNSUPPORTED | RPMC 0.1.6 rejected with and without sort. `superops_assets_search.unmonitored` returns `unsupported_filter` locally. Not emulated via `getAssetList` |
| getAssetInfoByTPEndpointIds | DEFERRED / SPECIAL-PURPOSE | RPMC has no third-party/network-monitoring endpoint integration providing TP endpoint IDs. No practical live test path today |

## Official mutations (not reads)

All `create*` / `update*` / `delete*` / `resolveAlerts` / `runScriptOnAsset` / restore / soft-delete operations are **PHASE 2 PARKED**. They are not registered. The SuperOps client still blocks mutations.

## Coverage arithmetic

- Official `get*` queries reviewed: **76**
- Implemented (existing live + new): **18 + 44 = 62**
- Excluded deprecated: **11**
- Excluded redundant: **1**
- Excluded live-unsupported: **1**
- Deferred special-purpose: **1**
- **76 = 62 + 11 + 1 + 1 + 1**
