# Live read-only validation

Phase 1 live read-only validation against the RPMC SuperOps tenant completed 2026-08-20: **PASS WITH MINOR CORRECTIONS**. Findings are recorded under **RPMC live-confirmed** in `docs/SUPEROPS-API-NOTES.md`. Pagination `hasMore: null` and `superops_tickets_get` nesting were corrected in code after that pass.

`investigate_ticket` live validation (0.1.3) completed subsequently: **LIVE-CONFIRMED** for normal read-only use. See `docs/SUPEROPS-API-NOTES.md` (`displayId` operator `is`, DESCRIPTION/`originalBody`, explicit asset enrichment). Do not change the confirmed `is` resolution path.

This document remains the procedure for a later **batched** staging re-validation. Phase 1 live tests must never mutate data. Do not commit credentials. Do not request a QNAP deploy after each small code change.

## Cursor MCP catalog

After a deployed tool-surface change (new tool, schema change), Cursor may keep a stale `tools/list` catalog. A **full MCP reconnect** refreshes it. A process restart alone may not.

## Procedure (operator)

1. Set `SUPEROPS_API_TOKEN`, `SUPEROPS_SUBDOMAIN`, `SUPEROPS_REGION` in a private env file on QNAP or a local machine. For HTTP, also set a ≥32-character `MCP_AUTH_TOKEN`. Do not commit it.
2. Optional: `MCP_ALLOWED_ORIGINS` / `MCP_ALLOWED_HOSTS` if a browser client will send an Origin header or the Host is not loopback (LAN hostname or future Cloudflare Access hostname). Non-browser MCP clients that omit Origin do not need Origins. `/mcp` always requires a valid Host.
3. Start the container bound to loopback only for the first pass (`127.0.0.1:8080`).
4. Authenticate to `/mcp` and call registered read tools only.
5. Record actual response shapes in `docs/SUPEROPS-API-NOTES.md` under **RPMC live-confirmed**.
6. If a GraphQL field fails, keep the documented/community note and adjust the query. Do not treat community behaviour as permanent truth.
7. After a tool-surface deploy, fully reconnect the Cursor MCP client before judging missing tools.

## Checks

Record pass/fail, actual field names, and a short redacted sample (no secrets, no customer PII in git).

- Clients: `superops_clients_list` / `superops_clients_get`
- Tickets list/get: `superops_tickets_list` / `superops_tickets_get`
- Scalar vs JSON association fields on tickets/clients/assets (`client`, `site`, `requester`, `technician`, `techGroup`, `sla`)
- Conversations: types present, including official `DESCRIPTION`
- Ticket body: confirm `Ticket.description` is absent/unusable; confirm DESCRIPTION conversation content
- Notes
- Technicians: `getTechnicianList.userList`
- Technician groups
- Alerts (message/description as freeform strings; confirm privacy `_privacy` marking if secrets appear)
- Assets / software / patches
- Pagination: `page`, `pageSize`, `hasMore`; page size 100
- Ticket↔asset relationship if any field appears in live payloads (not in official Ticket type)
- Status filtering/operator: **do not enable in the public schema yet**. If a one-off private probe is needed, try official `includes` + array vs community `is` against a known status, record the result, then decide
- Missing `CustomerSubDomain` behaviour (expect failure; do not leave it off in production)
- Rate-limit error shape if safely reachable with read-only traffic
- Privacy: human-entered fields should keep technical evidence; credential-like strings should be `[redacted]` with `_privacy` or per-field `redaction`. Freeform bodies are **not** general-purpose email redaction
- `investigate_ticket` (already live-confirmed): spot-check `displayId` `is`, zero-match `not_found`, stderr audit `outcome`/`success` without customer content
- `investigate_asset` (pending): internal `assetId` happy path; reject hostName/name/serial without scanning; `getAlertsForAsset` page 1 only (no `getAlertList`); software/patch bounds; `requester.email` omitted; stderr audit

## Out of scope for this live pass

- Write tools
- Arbitrary GraphQL
- Script execution
- Cloudflare Access/Tunnel cutover (config only: `MCP_ALLOWED_ORIGINS`)
- Tenant-wide alert scans
- Changing the confirmed ticket `displayId` `is` condition
