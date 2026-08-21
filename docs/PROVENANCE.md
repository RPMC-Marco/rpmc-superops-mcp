# Provenance

Classification used in this repository:

1. **Copied/derived** — source text brought in with only mechanical changes.
2. **Substantially adapted** — donor algorithms/structure kept, rewritten to fit RPMC.
3. **Design inspiration** — ideas only; RPMC wrote the code.
4. **Independently implemented** — written against public SuperOps / MCP specs.

| RPMC path | Source | Class | Notes |
|---|---|---|---|
| `src/superops/client.ts` | Computask `src/client.ts` @ 85b24ee | Substantially adapted | Removed Cloudflare execution-budget coupling. Added official 100 req/min limiter. Kept timeout, read retry, Retry-After parsing, error classes. |
| `src/superops/errors.ts` | Computask `src/client.ts` @ 85b24ee | Substantially adapted | Same error types; no Worker budget fields. |
| `src/superops/queries.ts` | Computask domain GraphQL documents @ 85b24ee; Servosity `queries.go` @ ce3f138 as live-schema check | Substantially adapted | Scalar association fields; official `page`/`pageSize`; no `Ticket.description`. |
| `src/privacy/redact.ts` | Computask ticket sanitization @ 85b24ee | Substantially adapted | Smaller, conservative redaction; always marks when content was altered. |
| `src/audit.ts` | Computask `src/audit.ts` @ 85b24ee | Design inspiration + new | Metadata-only JSON stdout; no ChatGPT/triage fields. |
| `src/mcp/server.ts`, `src/index.ts` | WYRE `src/mcp-server.ts` / `src/index.ts` @ d3f900c | Design inspiration + new | Factory + per-request HTTP server. Required Bearer MCP auth. No SuperOps tokens from client headers. |
| `src/config.ts` `cleanCredential` | WYRE `src/client.ts` @ d3f900c | Substantially adapted | Placeholder stripping. |
| Docker | WYRE/Computask Dockerfiles | Design inspiration | Node 24, no GitHub Packages, non-root. |
| Capability registry, caller auth, write omission | RPMC | Independently implemented | Phase 1 does not register write tools. |

Servosity/msp-skills was **not** copied. It informed live-API notes in `docs/SUPEROPS-API-NOTES.md`.
