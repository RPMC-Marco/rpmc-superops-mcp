# Official SuperOps MSP read inventory

Official source: [SuperOps MSP GraphQL API](https://developer.superops.com/msp) retrieved **2026-08-21**.

This file accounts for **100% of official `get*` query operations** in that schema (76 queries). There is no “low-value deferred” bucket.

Status values:

- **IMPLEMENTED / LIVE-CONFIRMED** — MCP tool exists; RPMC tenant confirmed
- **IMPLEMENTED / NEEDS REVALIDATION** — MCP tool exists; 0.1.9 contract correction not yet live-tested
- **IMPLEMENTED / NOT TESTABLE / NO DATA** — MCP tool exists; no tenant record/ID was available
- **LIVE-UNSUPPORTED** — RPMC tenant rejects the query after the official contract was honored
- **EXCLUDED / DEPRECATED** — SuperOps replaced it with Field APIs
- **EXCLUDED / REDUNDANT** — same information already exposed
- **EXCLUDED / LIVE UNSUPPORTED** — RPMC tenant rejects the query (existing 0.1.7)
- **DEFERRED / SPECIAL-PURPOSE** — not currently usable at RPMC; not rejected forever
- **PLANNED FUTURE ADDON** — not a GraphQL `get*` (KB article body download)
- **PHASE 2 PARKED** — mutation; not a read

Official KB article *body* is a separate SuperOps download API (`module=KB_ARTICLE_CONTENT`), not a GraphQL query. It is **PLANNED FUTURE ADDON**. GraphQL `getKbItem`/`getKbItems` return description/summary only. 0.1.9 does **not** implement the download API.

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

0.1.8 live pass accounted for all 44. 0.1.9 corrects selection/input contracts that caused several of those failures. Do not mark 0.1.9 corrections LIVE-CONFIRMED from unit tests.

| # | Query | MCP tool | Status after 0.1.8 live / 0.1.9 correction |
|---|---|---|---|
| 1 | getAllFields | `superops_fields_all` | LIVE-CONFIRMED |
| 2 | getField | `superops_fields_get` | LIVE-CONFIRMED |
| 3 | getFields | `superops_fields_lookup` | LIVE-CONFIRMED |
| 4 | getAssetCustomFields | `superops_asset_custom_fields` | IMPLEMENTED / NEEDS REVALIDATION (modules now required) |
| 5 | getAssetDiskDetails | `superops_assets_disks` | LIVE-CONFIRMED |
| 6 | getAssetUserLog | `superops_assets_user_log` | LIVE-CONFIRMED |
| 7 | getDeviceCategories | `superops_device_categories` | LIVE-CONFIRMED |
| 8 | getClientStageList | `superops_org_catalog` kind=`client_stage` | IMPLEMENTED / NEEDS REVALIDATION (`statuses` now nested) |
| 9 | getClientUser | `superops_client_users_get` | LIVE-CONFIRMED |
| 10 | getClientUserList | `superops_client_users_list` | LIVE-CONFIRMED |
| 11 | getClientUserAssociationList | `superops_client_users_associations` | LIVE-CONFIRMED |
| 12 | getRequesterRoleList | `superops_org_catalog` kind=`requester_role` | LIVE-CONFIRMED |
| 13 | getTechnicianRoleList | `superops_org_catalog` kind=`technician_role` | LIVE-CONFIRMED |
| 14 | getDesignationList | `superops_org_catalog` kind=`designation` | LIVE-CONFIRMED |
| 15 | getTeamList | `superops_org_catalog` kind=`team` | LIVE-CONFIRMED |
| 16 | getBusinessFunctionList | `superops_org_catalog` kind=`business_function` | LIVE-CONFIRMED |
| 17 | getClientContract | `superops_contracts_get` | NOT TESTABLE / NO DATA (blocked by list failure) |
| 18 | getClientContractList | `superops_contracts_list` | IMPLEMENTED / NEEDS REVALIDATION (`contract` now nested) |
| 19 | getSLAList | `superops_org_catalog` kind=`sla` | LIVE-CONFIRMED |
| 20 | getOfferedItems | `superops_offered_items` | IMPLEMENTED / NEEDS REVALIDATION (wrapper already ListInfoInput; 0.1.8 error was misclassified) |
| 21 | getServiceCatalogItem | `superops_catalog_get` | IMPLEMENTED / NEEDS REVALIDATION (`serviceTypeItem` nested; use catalog list `itemId`) |
| 22 | getServiceCatalogItemList | `superops_catalog_list` | IMPLEMENTED / NEEDS REVALIDATION (`serviceTypeItem` nested) |
| 23 | getServiceCategoryList | `superops_catalog_categories` | LIVE-CONFIRMED |
| 24 | getServiceItem | `superops_services_get` | IMPLEMENTED / NEEDS REVALIDATION (use service list `itemId`, not catalog/worklog IDs) |
| 25 | getServiceItemList | `superops_services_list` | IMPLEMENTED / NEEDS REVALIDATION |
| 26 | getTax | `superops_taxes_get` | NOT TESTABLE / NO DATA |
| 27 | getTaxList | `superops_taxes_list` | IMPLEMENTED / NEEDS REVALIDATION (`rates` now nested) |
| 28 | getPaymentMethodList | `superops_payment_config` kind=`method` | LIVE-CONFIRMED |
| 29 | getPaymentTermList | `superops_payment_config` kind=`term` | LIVE-CONFIRMED |
| 30 | getInvoice | `superops_invoices_get` | IMPLEMENTED / NEEDS REVALIDATION (`taxes` now nested; identifier is list `invoiceId`) |
| 31 | getInvoiceList | `superops_invoices_list` | LIVE-CONFIRMED |
| 32 | getInvoiceItemList | `superops_invoice_items` | LIVE-CONFIRMED |
| 33 | getItDocumentation | `superops_itdocs_get` | LIVE-CONFIRMED (0.1.9 adds secret-field redaction; re-check privacy) |
| 34 | getItDocumentationList | `superops_itdocs_list` | LIVE-CONFIRMED (0.1.9 adds secret-field redaction; re-check privacy) |
| 35 | getItDocumentationCategories | `superops_itdocs_categories` | LIVE-CONFIRMED |
| 36 | getKbItem | `superops_kb_get` | IMPLEMENTED / NEEDS REVALIDATION (`visibility` now nested; use list `itemId`) |
| 37 | getKbItems | `superops_kb_list` | LIVE-CONFIRMED |
| 38 | getScriptList | `superops_scripts_list` | LIVE-CONFIRMED |
| 39 | getScriptListByType | `superops_scripts_by_type` | LIVE-CONFIRMED |
| 40 | getTask | `superops_tasks_get` | NOT TESTABLE / NO DATA |
| 41 | getTaskList | `superops_tasks_list` | IMPLEMENTED / NEEDS REVALIDATION (GetTaskListInput.listInfo wrapper already official) |
| 42 | getWorkStatusList | `superops_work_statuses` | LIVE-CONFIRMED |
| 43 | getWorklogEntries | `superops_worklogs_list` | LIVE-CONFIRMED |
| 44 | getHolidayList | `superops_org_catalog` kind=`holiday` | LIVE-CONFIRMED |

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

## Error codes (0.1.9)

- `unsupported_filter` — a filter or sort was actually sent and SuperOps rejected that filter/sort, **or** the local `unmonitored=true` policy (no SuperOps call). Not a generic GraphQL-error bucket.
- `query_failed` — unfiltered list/query SuperOps GraphQL rejection (schema/input/contract). Not `not_found`.
- `lookup_failed` — opaque get/query failure. Never rewritten to `not_found`.
- `not_found` — only after a successful query that returns no record.

## IT documentation secrets (0.1.9)

`ItDocumentation.customFields` can hold UI data including license keys. PASSWORD/SECURE_TEXT values and product-key-shaped / Key-Serial labeled values are redacted. Ordinary notes, product names, URLs, and server names are preserved. Redaction metadata records presence without the secret. Secrets are not written to audit logs.
