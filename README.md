# rpmc-superops-mcp

Standalone SuperOps MCP server for RPM Computers (RPMC).

This is **not** a fork of WYRE, Computask, or Servosity. Those projects are implementation donors and live-API references. See [docs/PROVENANCE.md](docs/PROVENANCE.md).

Phase 1: authenticated, read-only, Docker on QNAP (LAN). The core official read surface is live-confirmed through 0.1.12. Write tools are not registered and do not appear in `tools/list`. Constrained search and investigation tools are documented in [docs/READ-SURFACE.md](docs/READ-SURFACE.md). Complete official `get*` accounting is in [docs/OFFICIAL-READ-INVENTORY.md](docs/OFFICIAL-READ-INVENTORY.md). Live tenant evidence is in [docs/LIVE-CONFIRMATION-MATRIX.md](docs/LIVE-CONFIRMATION-MATRIX.md). After a QNAP image with a new tool surface, fully reconnect the Cursor MCP client.

## Runtime

- Node.js 24
- MCP TypeScript SDK v2 (`@modelcontextprotocol/server` + `@modelcontextprotocol/node`)
- stdio (desktop MCP clients) or Streamable HTTP (QNAP)
- SuperOps credentials only from container/process environment
- HTTP MCP callers must send `Authorization: Bearer <MCP_AUTH_TOKEN>` (`MCP_AUTH_TOKEN` ≥ 32 characters)
- stdio does not require `MCP_AUTH_TOKEN`
- `rpmc_status` reports `commit` from image env `RPM_BUILD_COMMIT` (Docker build-arg `GIT_COMMIT`; local/dev fallback `unknown`). No Git at runtime.

See [docs/MCP-SDK.md](docs/MCP-SDK.md) for Host/Origin policy and the v2 decision.

## Quick start (development)

```bash
cp .env.example .env
npm install
npm test
npm run build
```

HTTP:

```bash
MCP_TRANSPORT=http MCP_AUTH_TOKEN=... SUPEROPS_API_TOKEN=... SUPEROPS_SUBDOMAIN=... SUPEROPS_REGION=us npm start
```

Callers:

```
POST /mcp
Authorization: Bearer <MCP_AUTH_TOKEN>
Accept: application/json, text/event-stream
```

HTTP is stateless (fresh MCP server per request) so it works behind a future Cloudflare Access/Tunnel hop without sticky sessions. `/health` is unauthenticated for Docker HEALTHCHECK and does not expose tokens or ticket content.

If a browser client will send `Origin`, set `MCP_ALLOWED_ORIGINS`. For LAN QNAP or a future tunnel hostname, set `MCP_ALLOWED_HOSTS` (or set Origins and let Host reuse that list). Non-browser clients that omit `Origin` continue to work; a present `Host` is always required on `/mcp`.

## Docker

```bash
docker build -t rpmc-superops-mcp:local .
docker run --rm -p 127.0.0.1:8080:8080 --env-file /secure/path/.env rpmc-superops-mcp:local
```

See `docker-compose.sample.yml`. Production compose stays on QNAP and is not committed.

CI builds the image on every push (no registry publish). Local/QNAP image smoke-test is still required on a machine with Docker.

## Privacy

Tool JSON payloads run through a conservative safe-output pass: high-confidence secrets in freeform strings are replaced with `[redacted]` and marked via `_privacy` when anything changed. Conversation/note `content` is also HTML-stripped. Attachments stay metadata-only. Useful technical evidence is kept. This is not DLP.

Freeform ticket/alert bodies are **not** general-purpose email redaction. Emails in DESCRIPTION/conversation/note/alert text may be technically relevant and are left in place. Aggregators omit structured `requester.email` (and similar structured `email` keys on user objects) while keeping id/name.

Stderr audit logs (`mcp.tool_call`) record tool name, `success`, `outcome` (`complete` | `partial` | `failed`), section state, resolution method, truncation, duration, and safe upstream failure category. They must not contain ticket bodies, subjects, names, emails, IPs, tokens, or raw SuperOps responses. A failed or partial investigation is `success: false` with an explicit `outcome`, even when the tool returns structured JSON.

## License

Apache-2.0. See LICENSE, NOTICE, and THIRD_PARTY_NOTICES.md.
