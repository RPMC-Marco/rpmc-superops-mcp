# Future live-confirmation matrix

One QNAP staging pass should cover every row. Do not add public probe-only tools. After deploy, fully reconnect the Cursor MCP client.

Legend: **safe failure** is the MCP outcome when SuperOps rejects the candidate. No row may fall back to a tenant scan.

| Tool / feature | GraphQL | Attribute | Operator | Value shape | Expected | Safe failure | Fallback | PASS | Logs / provenance |
|---|---|---|---|---|---|---|---|---|---|
| investigate_ticket displayId | getTicketList | displayId | is | string `DDMMYY-NNNN` | exact ticket | n/a (already live) | includes only if `is` rejected | known ID returns complete; zero-match `not_found` | `resolution=displayId_condition_is` |
| tickets_search status | getTicketList | status | includes | string array | filtered page | `unsupported_filter` | retry without sort only | Open tickets page, no page 2 | `filterAttributes` includes `status` |
| tickets_search client | getTicketList | client.name | is | string | client tickets | `unsupported_filter` | none | known client name, exact | `filterAttributes=client.name` |
| tickets_search site | getTicketList | site.name | is | string | site tickets | `unsupported_filter` | none | known site | `filterAttributes=site.name` |
| tickets_search technician | getTicketList | technician.name | is | string | assigned tickets | `unsupported_filter` | none | known tech name | `filterAttributes=technician.name` |
| tickets_search techGroup | getTicketList | techGroup.name | is | string | group tickets | `unsupported_filter` | none | known group | `filterAttributes=techGroup.name` |
| tickets_search priority | getTicketList | priority | is | string | priority tickets | `unsupported_filter` | none | known priority | `filterAttributes=priority` |
| tickets_search created today | getTicketList | createdTime | on | `placeholder.today` | today's tickets | `unsupported_filter` | none | today's tickets only | `filterAttributes=createdTime` |
| tickets_search createdInLastDays | getTicketList | createdTime | inLast | `{unit:DAY,quantity:n}` | recent tickets | `unsupported_filter` | none | last n days | `filterAttributes=createdTime` |
| tickets_search sort | getTicketList | createdTime / updatedTime | sort DESC/ASC | SortInput | newest first when DESC | warning `sort_unconfirmed` | retry without sort | order changes vs unsorted list | `sortAttribute` or null |
| investigate_asset / assets_search hostName | getAssetList | hostName | is | string | unique asset | `unsupported_filter` or `ambiguous` | none | known hostname; duplicates fail | `resolution=hostName_condition_is` |
| assets_search name | getAssetList | name | is | string | unique or list | `unsupported_filter` / `ambiguous` | none | exact name | `filterAttributes=name` |
| assets_search serialNumber | getAssetList | serialNumber | is | string | unique asset | `unsupported_filter` | none | known serial | `filterAttributes=serialNumber` |
| assets_search status | getAssetList | status | is | `ONLINE`/`OFFLINE` | filtered | `unsupported_filter` | none | online-only page | `filterAttributes=status` |
| assets_search client/site | getAssetList | client.name / site.name | is | string | filtered | `unsupported_filter` | none | known client | `filterAttributes` |
| assets_search unmonitored | getUnMonitoredAssetList | optional same | — | ListInfoInput | unmonitored page | `unsupported_filter` | none | query name in provenance | `searchKind=getUnMonitoredAssetList` |
| assets_search sort | getAssetList | lastCommunicatedTime | DESC | SortInput | recent endpoints | `sort_unconfirmed` | retry without sort | order vs default | `sortAttribute` |
| investigate_asset alerts | getAlertsForAsset | assetId | AssetDetailsListInput | `{assetId,listInfo}` | asset alerts | section `unavailable`; overall still `complete` if summary/activity/software/patches ok | none | alerts for that asset only; unavailable does not flip partial until live-confirmed | `alertFilter.query=getAlertsForAsset tenantScan=false` |
| alerts_search assetId | getAlertsForAsset | assetId | same | same | asset alerts | `unsupported_filter` | **no** getAlertList | no getAlertList in logs | `searchKind=getAlertsForAsset` |
| alerts_search status/severity | getAlertList or listInfo.condition | status / severity | is or includes | string / array | filtered page | `unsupported_filter` | none | page 1 only | `filterAttributes` |
| alerts_search created | getAlertList | createdTime | on / inLast | placeholder or duration | recent alerts | `unsupported_filter` | none | today's or last n days | `filterAttributes=createdTime` |
| alerts sort | listInfo.sort | createdTime | DESC | SortInput | newest first | unavailable / sort retry | none | order | `sortAttribute` |
| investigate_client name | getClientList | name | is | string | unique client | `unsupported_filter` / `ambiguous` | none | exact name; duplicates or `hasMore` fail | `resolution=name_condition_is` |
| investigate_client domain | getClientList | emailDomains | includes | `[domain]` | unique client | `unsupported_filter` | none | known domain | `resolution=emailDomains_condition_includes` |
| investigate_client sites | getClientSiteList | clientId | official input | ID | that client's sites | `sites_unavailable` partial | none | sites match client | `getClientSiteList` + clientId |
| investigate_client assets/tickets | getAssetList / getTicketList | client.name | is | string from client | bounded pages, then local `client.accountId` pin | section failed → partial | none (no invented `client.accountId` filter) | page 1; foreign/missing accountId rows omitted | `filterAttributes=client.name` + `droppedForeign` |
| sites_search name | getClientSiteList | name | is | string | matching sites | `unsupported_filter` | none | exact name | `filterAttributes=name` |
| getAssetSummary | getAssetSummary | assetId | get | AssetIdentifierInput | cpu/mem/disk | `summary_unavailable` partial | none | numeric health present | `logicalOperations` contains getAssetSummary |
| getAssetActivity | getAssetActivity | assetId | list page 1 | AssetDetailsListInput | recent activity | `activity_unavailable` partial | none | bounded items, no activityData blob | `sections.activity` |

Also re-check: Cursor MCP reconnect after tool-surface change; audit `success`/`outcome` with no customer content; no write tools; `includes` displayId fallback still unused.
