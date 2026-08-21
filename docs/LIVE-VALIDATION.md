# Live read-only validation

Do not run this against SuperOps until RPMC provides a token out of band.
Phase 1 live tests must never mutate data.

## Procedure (operator)

1. Set `SUPEROPS_API_TOKEN`, `SUPEROPS_SUBDOMAIN`, `SUPEROPS_REGION`, and `MCP_AUTH_TOKEN` in a private env file on QNAP or a local machine. Do not commit it.
2. Start the container on loopback only.
3. Authenticate to `/mcp` and call registered read tools only.
4. Record actual response shapes in `docs/SUPEROPS-API-NOTES.md` under **RPMC live-confirmed**.
5. If a GraphQL field fails, keep the documented/community note and adjust the query. Do not treat community behaviour as permanent truth.

## Checks

- Nested vs scalar association fields
- `Ticket.description` vs conversation type `DESCRIPTION`
- Conversation and note shapes
- Technician list `userList`
- Alert list
- Asset / software / patch shapes
- Pagination `hasMore` / page size 100
- Missing `CustomerSubDomain` behaviour (expect failure; do not leave it off in production)
- Rate-limit error shape if safely reachable with read-only traffic
