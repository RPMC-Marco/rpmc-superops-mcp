# Official SuperOps MSP read inventory

Official source: [SuperOps MSP GraphQL API](https://developer.superops.com/msp) retrieved **2026-08-21**.

This file accounts for **100% of official `get*` query operations** in that schema (76 queries). There is no “low-value deferred” bucket.

Status values:

- **IMPLEMENTED / LIVE-CONFIRMED** — MCP tool exists; RPMC tenant confirmed
- **IMPLEMENTED / NEEDS REVALIDATION** — MCP tool exists; 0.1.12 contract correction not yet live-tested
- **IMPLEMENTED / NOT TESTABLE / NO DISCOVERABLE ID** — MCP tool exists; no tenant record/ID was available
- **LIVE-CONTRACT-CONFIRMED / NO DATA** — contract accepted; tenant returned no rows
- **LIVE-UNSUPPORTED** — RPMC tenant rejects the query after the official contract was honored
- **EXCLUDED / DEPRECATED** — SuperOps replaced it with Field APIs
- **EXCLUDED / REDUNDANT** — same information already exposed
- **EXCLUDED / LIVE UNSUPPORTED** — RPMC tenant rejects the query (existing 0.1.7)
- **DEFERRED / SPECIAL-PURPOSE** — not currently usable at RPMC; not rejected forever
- **PLANNED FUTURE ADDON** — not a GraphQL `get*` (KB article body download)
- **PLANNED SECURITY CAPABILITY** — human-authorized secret disclosure; not implemented
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

0.1.11 live-confirmed ServiceItem and Task list→get, plus IT-doc UDF mapping. 0.1.12 corrects remaining OfferedItem `type` serialization and license-context Notes. Do not mark 0.1.12 corrections LIVE-CONFIRMED from unit tests or development probes.

| # | Query | MCP tool | Status after 0.1.8 live / 0.1.9 correction |
|---|---|---|---|
| 1 | getAllFields | `superops_fields_all` | LIVE-CONFIRMED |
| 2 | getField | `superops_fields_get` | LIVE-CONFIRMED |
| 3 | getFields | `superops_fields_lookup` | LIVE-CONFIRMED |
| 4 | getAssetCustomFields | `superops_asset_custom_fields` | LIVE-CONTRACT-CONFIRMED / NO DATA |
| 5 | getAssetDiskDetails | `superops_assets_disks` | LIVE-CONFIRMED |
| 6 | getAssetUserLog | `superops_assets_user_log` | LIVE-CONFIRMED |
| 7 | getDeviceCategories | `superops_device_categories` | LIVE-CONFIRMED |
| 8 | getClientStageList | `superops_org_catalog` kind=`client_stage` | LIVE-CONFIRMED |
| 9 | getClientUser | `superops_client_users_get` | LIVE-CONFIRMED |
| 10 | getClientUserList | `superops_client_users_list` | LIVE-CONFIRMED |
| 11 | getClientUserAssociationList | `superops_client_users_associations` | LIVE-CONFIRMED |
| 12 | getRequesterRoleList | `superops_org_catalog` kind=`requester_role` | LIVE-CONFIRMED |
| 13 | getTechnicianRoleList | `superops_org_catalog` kind=`technician_role` | LIVE-CONFIRMED |
| 14 | getDesignationList | `superops_org_catalog` kind=`designation` | LIVE-CONFIRMED |
| 15 | getTeamList | `superops_org_catalog` kind=`team` | LIVE-CONFIRMED |
| 16 | getBusinessFunctionList | `superops_org_catalog` kind=`business_function` | LIVE-CONFIRMED |
| 17 | getClientContract | `superops_contracts_get` | LIVE-CONFIRMED |
| 18 | getClientContractList | `superops_contracts_list` | LIVE-CONFIRMED |
| 19 | getSLAList | `superops_org_catalog` kind=`sla` | LIVE-CONFIRMED |
| 20 | getOfferedItems | `superops_offered_items` | IMPLEMENTED / NEEDS REVALIDATION (0.1.12 omits live-null `type` enum) |
| 21 | getServiceCatalogItem | `superops_catalog_get` | LIVE-CONFIRMED |
| 22 | getServiceCatalogItemList | `superops_catalog_list` | LIVE-CONFIRMED |
| 23 | getServiceCategoryList | `superops_catalog_categories` | LIVE-CONFIRMED |
| 24 | getServiceItem | `superops_services_get` | LIVE-CONFIRMED |
| 25 | getServiceItemList | `superops_services_list` | LIVE-CONFIRMED |
| 26 | getTax | `superops_taxes_get` | LIVE-CONFIRMED |
| 27 | getTaxList | `superops_taxes_list` | LIVE-CONFIRMED |
| 28 | getPaymentMethodList | `superops_payment_config` kind=`method` | LIVE-CONFIRMED |
| 29 | getPaymentTermList | `superops_payment_config` kind=`term` | LIVE-CONFIRMED |
| 30 | getInvoice | `superops_invoices_get` | LIVE-CONFIRMED |
| 31 | getInvoiceList | `superops_invoices_list` | LIVE-CONFIRMED |
| 32 | getInvoiceItemList | `superops_invoice_items` | LIVE-CONFIRMED |
| 33 | getItDocumentation | `superops_itdocs_get` | LIVE-CONFIRMED (UDF mapping); 0.1.12 Notes policy NEEDS REVALIDATION |
| 34 | getItDocumentationList | `superops_itdocs_list` | LIVE-CONFIRMED (UDF mapping); 0.1.12 Notes policy NEEDS REVALIDATION |
| 35 | getItDocumentationCategories | `superops_itdocs_categories` | LIVE-CONFIRMED |
| 36 | getKbItem | `superops_kb_get` | LIVE-CONFIRMED (article + collection) |
| 37 | getKbItems | `superops_kb_list` | LIVE-CONFIRMED |
| 38 | getScriptList | `superops_scripts_list` | LIVE-CONFIRMED |
| 39 | getScriptListByType | `superops_scripts_by_type` | LIVE-CONFIRMED |
| 40 | getTask | `superops_tasks_get` | LIVE-CONFIRMED |
| 41 | getTaskList | `superops_tasks_list` | LIVE-CONFIRMED |
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

## IT documentation secrets (0.1.12)

Default MCP reads redact PASSWORD / SECURE_TEXT and product/license/activation-key values. List and exact-get load `getItDocumentationCategories` and apply that category's custom-field definitions (`columnName` / `label` / `fieldType`) to document UDF maps such as `udf6text`. A field labeled Key/Serial, Product Key, License Key, or Activation Key is redacted even when the value is non-canonical and the GraphQL key is opaque.

In an established Product Key / software-license category, freeform Notes / Description / Paragraph / Details fields redact credential-like substrings (canonical 5×5 and hyphenated multi-group keys) and keep surrounding text when that is enough. If remaining text still looks credential-like, the whole freeform field is redacted. Ordinary notes outside that semantic context stay visible. Hardware/asset `Serial Number` and ordinary `serialNumber` stay visible unless the surrounding field/category semantics establish software-license context. Column names such as `udf6text` or `serial` are never globally redacted. Redaction metadata records presence without the secret. Secrets are not written to audit logs.

A future **human-authorized, per-field** disclosure path is a **PLANNED SECURITY CAPABILITY**. Phase 1 does not implement it and does not expose `includeSecrets` or any AI-controlled bypass.
