# Live read-only validation

Do not run this against SuperOps until RPMC provides a token out of band.
Phase 1 live tests must never mutate data. Do not commit credentials.

This is the next major step after the foundation correction pass. Aggregators (`investigate_ticket`, `investigate_asset`) stay unimplemented until this validation is done.

## Procedure (operator)

1. Set `SUPEROPS_API_TOKEN`, `SUPEROPS_SUBDOMAIN`, `SUPEROPS_REGION` in a private env file on QNAP or a local machine. For HTTP, also set a ≥32-character `MCP_AUTH_TOKEN`. Do not commit it.
2. Optional: `MCP_ALLOWED_ORIGINS` if a browser client will send an Origin header (LAN hostname or future Cloudflare Access hostname). Non-browser MCP clients that omit Origin do not need this.
3. Start the container bound to loopback only for the first pass (`127.0.0.1:8080`).
4. Authenticate to `/mcp` and call registered read tools only.
5. Record actual response shapes in `docs/SUPEROPS-API-NOTES.md` under **RPMC live-confirmed**.
6. If a GraphQL field fails, keep the documented/community note and adjust the query. Do not treat community behaviour as permanent truth.

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
- Privacy: human-entered fields should keep technical evidence; credential-like strings should be `[redacted]` with `_privacy` or per-field `redaction`

## Out of scope for this live pass

- Write tools
- Arbitrary GraphQL
- Script execution
- `investigate_ticket` / `investigate_asset`
- Cloudflare Access/Tunnel cutover (config only: `MCP_ALLOWED_ORIGINS`)
