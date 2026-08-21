# Write capabilities

Phase 1 does **not** register write tools. `tools/list` is generated from `src/capabilities.ts`.
If a row here says `registered: no` and the code still exposes it, that is a bug.

Emergency disable for the whole MCP HTTP listener: stop the container, or unset `MCP_AUTH_TOKEN` (process refuses to start in HTTP mode). SuperOps token remaining in the container env cannot be used by MCP callers.

| Operation | SuperOps | Class | Risk | Blast radius | Reversible | Approval | Phase 1 registered | Enable later | Emergency disable |
|---|---|---|---|---|---|---|---|---|---|
| create ticket | `createTicket` | write_visible | medium | new ticket | close/update | preview/confirm | no | `ENABLE_WRITE_TOOLS` + allowlist | omit from registry |
| update ticket | `updateTicket` | write_visible | medium | one ticket | sometimes | preview/confirm | no | allowlist | omit from registry |
| create note | `createTicketNote` | write_low (PRIVATE) / write_visible (PUBLIC) | medium | one ticket | no | preview/confirm | no | allowlist | omit from registry |
| create conversation | `createTicketConversation` | write_visible | high if `sendMail=true` | customer-visible | no | informed approval | no | allowlist | omit from registry |
| create worklog | `createWorklogEntries` | write_low | low-medium | time records | delete if API allows | preview/confirm | no | allowlist | omit from registry |
| resolve alerts | `resolveAlerts` | disruptive | high | monitoring visibility | no | informed approval | no | allowlist | omit from registry |
| run script | `runScriptOnAsset` | disruptive | high | endpoint | no | informed approval + script allowlist | no | never generic execute | omit from registry |
| soft delete ticket/asset/client | `softDelete*` | destructive | critical | records | SuperOps recycle? unknown | never auto | no | default never | omit from registry |
| custom mutation | arbitrary GraphQL | destructive | critical | tenant | no | never | no | never in production | omit from registry |
| custom query | arbitrary GraphQL | read (over-broad) | high | tenant data | n/a | n/a | no | not Phase 1 | omit from registry |

Production enablement (future): change registry flags in config, restart, confirm `tools/list`, run live **write** tests only after RPMC approval. Rollback: revert flags and restart.

Fill test procedures when a write is actually implemented.
