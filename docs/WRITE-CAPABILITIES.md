# Write capabilities

Phase 2 registers purpose-built SuperOps write tools. `tools/list` is generated from `src/capabilities.ts`.
Each capability has `operationKind` (`query` / `mutation` / `local`) in addition to risk `classification`.
`superops_custom_mutation` and hard-delete/admin mutations are never registered.

Emergency disable for writes: set `MCP_DISABLE_WRITES=true` (or `ENABLE_WRITE_TOOLS=false`) and restart. That omits write tools from the registry; Phase 1 reads remain. Emergency disable for the whole MCP HTTP listener: stop the container, or unset `MCP_AUTH_TOKEN` (process refuses to start in HTTP mode). SuperOps token remaining in the container env cannot be used by MCP callers.

Human confirmation for **disruptive** and **destructive** actions uses MCP elicitation (`inputRequired` / `elicitation/create`). It is **not** a tool argument such as `confirmed=true`. The operator must accept a scoped form that names the exact action and type the target identifier. The challenge is HMAC-signed from existing process credentials (no new long-lived secret). A model cannot downgrade consequence classification.

The full inventory is in [PHASE2-WRITE-INVENTORY.md](PHASE2-WRITE-INVENTORY.md). Live mutation validation has not been performed; see [PHASE2-LIVE-VALIDATION.md](PHASE2-LIVE-VALIDATION.md).

| Operation | SuperOps | Class | Authorization | Phase 2 registered |
|---|---|---|---|---|
| create ticket | `createTicket` | write_visible | none when explicitly requested | yes |
| update ticket | `updateTicket` | write_visible | none when explicitly requested | yes |
| create note | `createNote` | write_low PRIVATE / write_visible PUBLIC | none when explicitly requested | yes |
| create conversation | `createTicketConversation` | write_visible | none when explicitly requested | yes |
| create worklog | `createWorklogEntries` | write_low | none when explicitly requested | yes |
| update worklog | `updateWorklogEntry` | write_low | none when explicitly requested | yes |
| create alert | `createAlert` | write_visible | none when explicitly requested | yes |
| resolve alerts | `resolveAlerts` | disruptive | MCP elicitation always | yes |
| update client user | `updateClientUser` | write_visible | none when explicitly requested | yes |
| update user association | `updateClientUserAssociations` | write_visible | none when explicitly requested | yes |
| update asset | `updateAsset` | write_visible | none when explicitly requested | yes |
| create task | `createTask` | write_low | none when explicitly requested | yes |
| create/update IT doc | `createItDocumentation` / `updateItDocumentation` | write_low | secret fields fail closed | yes |
| create KB article | `createKbArticle` | write_low or write_visible | none when explicitly requested | yes |
| create/update KB collection | `createKbCollection` / `updateKbCollection` | write_low | none when explicitly requested | yes |
| run script | `runScriptOnAsset` | classified from metadata; unknown → disruptive | elicitation when disruptive/destructive | yes |
| update KB article body | `updateKbArticle` | — | — | **DEFERRED / DEPENDENCY BLOCKED** |
| merge tickets | none public | — | — | **UNSUPPORTED BY PUBLIC API** |
| associate asset on existing ticket | not on `updateTicket` | — | — | **UNSUPPORTED BY PUBLIC API** |
| update task | none public | — | — | **UNSUPPORTED BY PUBLIC API** |
| custom mutation | arbitrary GraphQL | destructive | never | **never** |
| hard delete / admin | `softDelete*` / billing / catalog admin | destructive | never | **EXCLUDED BY SAFETY POLICY** |
