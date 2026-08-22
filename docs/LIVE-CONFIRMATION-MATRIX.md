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

## 0.1.8 live validation (completed against QNAP 0.1.8 / `41d4245`)

Accounted for all 44 new GraphQL reads. Established 0.1.7 surface passed regression. `readonly=true`, `writesRegistered=false`. No mutations. No script execution.

**LIVE-CONFIRMED (29):** getAllFields, getField, getFields, getAssetDiskDetails, getAssetUserLog, getDeviceCategories, getClientUser, getClientUserList, getClientUserAssociationList, getRequesterRoleList, getTechnicianRoleList, getDesignationList, getTeamList, getBusinessFunctionList, getHolidayList, getSLAList, getServiceCategoryList, getPaymentMethodList, getPaymentTermList, getInvoiceList, getInvoiceItemList, getItDocumentation, getItDocumentationList, getItDocumentationCategories, getKbItems, getScriptList, getScriptListByType, getWorkStatusList, getWorklogEntries.

**PARTIAL:** getAssetCustomFields — explicit Windows/Mac succeeded (empty complete); omitted input SuperOps error. 0.1.9 requires `modules`.

**LIVE-UNSUPPORTED on 0.1.8 (several were GraphQL selection / error-classification bugs, not proven-unavailable capabilities):** getClientStageList, getClientContractList, getOfferedItems, getServiceCatalogItemList, getServiceItemList, getTaxList, getTaskList.

**FAILED exact-get:** getInvoice (list `invoiceId` rejected because `taxes` was selected as a leaf), getKbItem (list `itemId` rejected because `visibility` was selected as a leaf), getServiceItem, getServiceCatalogItem (identifiers from unrelated types / list queries themselves failed).

**NOT TESTABLE / NO DATA:** getClientContract, getTax, getTask.

`unsupported_filter` was incorrectly applied to unfiltered list GraphQL failures. 0.1.9 narrows it.

## 0.1.9 targeted revalidation (do not mark LIVE-CONFIRMED from unit tests)

After QNAP 0.1.9 deploy and full MCP reconnect:

| Query | Why revalidate | Success looks like | If still rejected |
|---|---|---|---|
| getAssetCustomFields | required `modules` | Windows/Mac complete (empty OK) | `malformed_input` locally if omitted; no SuperOps call |
| getClientStageList | nest `statuses` | stage rows | then LIVE-UNSUPPORTED on RPMC tenant |
| getClientContractList | nest `contract` | page of contracts + `contractId` | LIVE-UNSUPPORTED; do not enumerate another list |
| getOfferedItems | error class + same ListInfoInput | page of items | LIVE-UNSUPPORTED |
| getServiceCatalogItemList | nest `serviceTypeItem` | page with catalog `itemId` | LIVE-UNSUPPORTED |
| getServiceItemList | same ListInfoInput; confirm selection | page with service `itemId` | LIVE-UNSUPPORTED |
| getTaxList | nest `rates` | page with `taxId` | LIVE-UNSUPPORTED |
| getTaskList | GetTaskListInput `{ listInfo }` | page with `taskId` | LIVE-UNSUPPORTED |
| getInvoice | nest `taxes`; use list `invoiceId` | invoice + bounded lines | lookup_failed, never not_found unless empty payload |
| getKbItem | nest `visibility`; use list `itemId` | article/collection metadata, no body | lookup_failed |
| getServiceCatalogItem | catalog list `itemId` only | catalog item | lookup_failed |
| getServiceItem | service list `itemId` only | service item | lookup_failed |
| getClientContract / getTax / getTask | if matching list now yields an ID | exact get | remain NOT TESTABLE if no rows |
| IT docs get/list | secret redaction | product names kept; Key/Serial values null + redaction metadata | do not log secrets |

Safe failure for unfiltered contract errors is now `query_failed`, not `unsupported_filter`. Local `unmonitored=true` remains `unsupported_filter` with zero SuperOps calls.

## 0.1.9 targeted live result (QNAP 0.1.9 / `d9df6b7`)

**LIVE-CONFIRMED:** getClientStageList; getClientContractList → getClientContract; getServiceCatalogItemList → getServiceCatalogItem; getTaxList → getTax; getInvoice (list `invoiceId`); getKbItem (article + collection).

**LIVE-CONTRACT-CONFIRMED / NO DATA:** getAssetCustomFields Windows / Mac / array. Omitted modules: local `malformed_input`.

**FAILED / query_failed:** getOfferedItems, getServiceItemList, getTaskList (object fields still selected as leaves). Official docs still label Task/OfferedItem associations as JSON; live RPMC required nested selections.

**NOT TESTABLE / NO DISCOVERABLE ID:** getServiceItem, getTask.

**IT-doc privacy:** PARTIAL. Canonical product keys redacted; one non-canonical Key/Serial map representation leaked. Hardware serials must remain visible.

## 0.1.10 targeted live result (QNAP 0.1.10 / `ba754ad`)

`readonly=true`, `writesRegistered=false`, 60 read / 0 write. CI SUCCESS. No source changes, mutations, scripts, deployment changes, or KB body access during validation.

**FAILED / query_failed:** getOfferedItems, getServiceItemList, getTaskList. Nesting OfferedItem/Task associations did **not** fix 0.1.9. Completing ServiceItem `salesTax.rates` did **not** fix the list.

**NOT TESTABLE / NO DISCOVERABLE ID:** getServiceItem, getTask. Prerequisite lists still failed; no IDs were manufactured.

**PRIVACY FAILURE:** IT-documentation. Canonical 5×5 product keys redacted; `valuePresent`/`redacted` metadata worked; product/asset names remained visible; Password-type customFields were null. One non-canonical category-defined Product Key / Key-Serial value still reached MCP output through both list and get. The runtime key was an opaque UDF (`udf6text`); the document name did not say "Product Key". The actual secret was omitted from the validation report.

**LIVE-CONFIRMED:** ordinary hardware / asset `serialNumber` remained visible.

## 0.1.11 targeted revalidation (do not mark LIVE-CONFIRMED from unit tests or development probes)

0.1.11 is undeployed. Development-time QUERY-only contract probes established the accepted selections below. Formal live classification still requires the deployed candidate.

| Query | Why revalidate | Success looks like |
|---|---|---|
| getOfferedItems | leaf JSON associations (nests are `SubSelectionNotAllowed`) | page of offered items with identity/billing/work JSON |
| getServiceItemList | keep `itemId` + category nest; `salesTax` without `totalRate` | page with canonical service `itemId` |
| getServiceItem | shared fragment omits `salesTax.totalRate`; use list `itemId` only | exact get; else remain NOT TESTABLE |
| getTaskList | `GetTaskListInput`; leaf JSON associations; omit `module` enum | page with canonical `taskId` |
| getTask | same shared fragment; use list `taskId` only | exact get; else remain NOT TESTABLE |
| IT-doc list + get privacy | category custom-field semantics applied to opaque UDF keys | non-canonical Key/Serial values absent; metadata present |
| ordinary hardware serial | must stay visible | asset `serialNumber` / hardware Serial Number preserved |
