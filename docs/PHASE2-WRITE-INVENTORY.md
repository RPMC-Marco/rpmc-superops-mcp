# Phase 2 write inventory

Official source: [SuperOps MSP GraphQL API](https://developer.superops.com/msp) (retrieved 2026-08-22). No private UI endpoints. No live mutations were performed during Phase 2 engineering.

Every planned Phase 2 candidate is accounted for below.

Legend for **STATUS**:

- `IMPLEMENTED / READY FOR LIVE VALIDATION`
- `DEFERRED / DEPENDENCY BLOCKED`
- `UNSUPPORTED BY PUBLIC API`
- `EXCLUDED BY SAFETY POLICY`

| CAPABILITY | SUPEROPS MUTATION | MCP TOOL | CONSEQUENCE CLASS | AUTHORIZATION REQUIREMENT | PRE-WRITE CHECK | POST-WRITE VERIFICATION | ROLLBACK / CLEANUP | STATUS | NOTES |
|---|---|---|---|---|---|---|---|---|---|
| Create ticket | `createTicket` | `superops_tickets_create` | write_visible | None when technician explicitly requested | Resolve unique client; optional unique asset; refuse ambiguous names | Re-read `getTicket`; compare subject/status/client | Close/update the TEST ticket | IMPLEMENTED / READY FOR LIVE VALIDATION | `addAssets` on create is official. `alertId` → `sourceReferenceId` + `subSource=alert`. Source defaults to `INTEGRATION`. |
| Update ticket | `updateTicket` | `superops_tickets_update` | write_visible | None when technician explicitly requested | Resolve displayId/ticketId uniquely; capture status/priority/assignment | Re-read `getTicket`; compare intended fields | Set previous status/assignment | IMPLEMENTED / READY FOR LIVE VALIDATION | Technician, tech group, status, priority, closure (`status` + `resolutionCode`) supported. |
| Create ticket note | `createNote` (replaces deprecated `createTicketNote`) | `superops_tickets_add_note` | write_low PRIVATE / write_visible PUBLIC | None when explicitly requested | Ticket exists | Note id present on `getTicketNoteList` | Notes are not deleted by this MCP | IMPLEMENTED / READY FOR LIVE VALIDATION | `addedBy` omitted so API-token identity is used. |
| Create ticket conversation | `createTicketConversation` | `superops_tickets_add_conversation` | write_visible | None when explicitly requested | Ticket exists | Conversation id present on `getTicketConversationList` | Conversations are not deleted | IMPLEMENTED / READY FOR LIVE VALIDATION | `sendMail` defaults false. |
| Create ticket from alert | `createTicket` + `sourceReferenceId` | `superops_tickets_create` `alertId` | write_visible | Same as create ticket | Alert id recorded; optional asset | Same as create ticket | Close TEST ticket | IMPLEMENTED / READY FOR LIVE VALIDATION | Workflow addition from technician testing. |
| Ticket asset association on create | `createTicket.addAssets` | `superops_tickets_create` `assetId`/`hostName` | write_visible | Same as create ticket | Unique asset resolve | Ticket re-read (asset association is create-only) | Close TEST ticket | IMPLEMENTED / READY FOR LIVE VALIDATION | Official on create only. |
| Associate asset with existing ticket | none on `updateTicket` | — | — | — | — | — | — | UNSUPPORTED BY PUBLIC API | `UpdateTicketInput` has no `addAssets`. Not invented. |
| Merge / duplicate tickets | none | — | — | — | — | — | — | UNSUPPORTED BY PUBLIC API | No public merge mutation. |
| Create worklog | `createWorklogEntries` | `superops_worklogs_create` | write_low | None when explicitly requested | Ticket exists when module=TICKET | Mutation returns `itemId` | SuperOps has no delete-worklog tool here; mark TEST and leave | IMPLEMENTED / READY FOR LIVE VALIDATION | Technician field omitted (token identity). |
| Update worklog | `updateWorklogEntry` | `superops_worklogs_update` | write_low | None when explicitly requested | `itemId` required | Mutation payload field compare | Restore previous qty/notes | IMPLEMENTED / READY FOR LIVE VALIDATION | No technician impersonation. |
| Create alert | `createAlert` | `superops_alerts_create` | write_visible | None when explicitly requested | Unique asset | `getAlertsForAsset` contains new id | Resolve the TEST alert after live test | IMPLEMENTED / READY FOR LIVE VALIDATION | Implemented because external evidence needs a SuperOps alert surface. |
| Resolve alerts | `resolveAlerts` | `superops_alerts_resolve` | disruptive | MCP elicitation always | Alert ids required | Boolean true + optional asset-scoped re-read | Cannot unresolve; stop class if verification fails | IMPLEMENTED / READY FOR LIVE VALIDATION | Classified upward: hides monitoring. |
| Update client user | `updateClientUser` | `superops_client_users_update` | write_visible | None when explicitly requested | `getClientUser` | Re-read user fields | Restore previous name/site/role | IMPLEMENTED / READY FOR LIVE VALIDATION | firstName/lastName/contactNumber/siteId/roleId only. No email/login, no delete, no arbitrary JSON. |
| Update client-user association | `updateClientUserAssociations` | `superops_client_users_update_association` | write_visible | None when explicitly requested | associationId + siteId | Mutation returns new site | Restore previous siteId | IMPLEMENTED / READY FOR LIVE VALIDATION | Official mutation updates site only. |
| Update asset | `updateAsset` | `superops_assets_update` | write_visible | None when explicitly requested | Unique asset identity; capture client/site/name | Re-read `getAsset` | Restore previous fields | IMPLEMENTED / READY FOR LIVE VALIDATION | Purpose-built fields only. No customFields JSON. |
| Create task | `createTask` | `superops_tasks_create` | write_low | None when explicitly requested | Ticket required and resolved when module=TICKET | Re-read `getTask` | No public `updateTask`/`deleteTask`; leave TEST closed via ticket | IMPLEMENTED / READY FOR LIVE VALIDATION | Status from WorkStatus name. |
| Update task | none | — | — | — | — | — | — | UNSUPPORTED BY PUBLIC API | No `updateTask` / `UpdateTaskInput` in the official MSP schema. |
| Create IT documentation | `createItDocumentation` | `superops_itdocs_create` | write_low | Secret writes fail closed | Category field defs loaded | Re-read name | Leave TEST named record | IMPLEMENTED / READY FOR LIVE VALIDATION | Unknown/secret/license columns refused. |
| Update IT documentation | `updateItDocumentation` | `superops_itdocs_update` | write_low | Secret writes fail closed | Category field defs; existing doc | Re-read name | Restore previous name | IMPLEMENTED / READY FOR LIVE VALIDATION | Same secret fail-closed gate. |
| Create KB article | `createKbArticle` | `superops_kb_articles_create` | write_low (DRAFT+technicians) / write_visible (PUBLISHED or requesters) | None when explicitly requested | Parent collection id; caller supplies HTML | Re-read name/status (GraphQL has no body) | Leave TEST DRAFT article | IMPLEMENTED / READY FOR LIVE VALIDATION | Create is possible because the caller supplies content. |
| Update KB article | `updateKbArticle` | — | — | — | — | — | — | DEFERRED / DEPENDENCY BLOCKED | Safe update would need existing HTML body retrieval, which remains **PLANNED FUTURE ADDON**. A metadata-only patch could destroy unseen content. |
| Create KB collection | `createKbCollection` | `superops_kb_collections_create` | write_low | None when explicitly requested | Optional parent | Re-read name | Leave TEST collection | IMPLEMENTED / READY FOR LIVE VALIDATION | No article body. |
| Update KB collection | `updateKbCollection` | `superops_kb_collections_update` | write_low | None when explicitly requested | Collection exists | Re-read name | Restore previous name | IMPLEMENTED / READY FOR LIVE VALIDATION | Name only. |
| Run script on asset | `runScriptOnAsset` | `superops_scripts_execute` | metadata-classified; unknown → disruptive | Elicitation when disruptive/destructive | Unique asset; script metadata page-1 lookup | `actionConfigId` present | Not reversible; stop class if unexpected impact | IMPLEMENTED / READY FOR LIVE VALIDATION | Existing script IDs only. No arbitrary script text. AI cannot lower classification. `SCRIPT_CONSEQUENCE_RAISE` can only raise. |
| Contracts / catalog / taxes / invoices / field admin / hard delete / generic GraphQL | various | — | destructive / excluded | never | — | — | — | EXCLUDED BY SAFETY POLICY | Intentionally out of Phase 2. |

## Workflow additions from Phase 1 technician testing

- Ticket assignment, status, priority, and closure/resolution are on `superops_tickets_update`.
- Create ticket from alert is `superops_tickets_create.alertId`.
- Create ticket with asset is `superops_tickets_create.assetId`/`hostName`.
- Existing-ticket asset association: **unsupported** by public `updateTicket`.
- Merge/duplicate: **unsupported**.
- `createAlert` is implemented as a supported external-evidence workflow, not merely because the mutation exists.

## Common write pipeline

schema validation → target resolution (fail closed) → pre-write capture → consequence classification → human authorization when required → idempotency begin → SuperOps `mutate()` (no retry) → post-write read verification → sanitized audit.

## Privacy

Phase 1 redaction remains. IT-doc writes refuse PASSWORD / SECURE_TEXT / license-key fields. Human-authorized sensitive-value disclosure remains **PLANNED FUTURE SECURITY CAPABILITY**.
