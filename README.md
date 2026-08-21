# rpmc-superops-mcp

Standalone SuperOps MCP server for RPM Computers (RPMC).

This is **not** a fork of WYRE, Computask, or Servosity. Those projects are implementation donors and live-API references. See [docs/PROVENANCE.md](docs/PROVENANCE.md).

Phase 1: authenticated, read-only, Docker on QNAP (LAN). Write tools are not registered and do not appear in `tools/list`.

## Runtime

- Node.js 24
- stdio (desktop MCP clients) or Streamable HTTP (QNAP)
- SuperOps credentials only from container/process environment
- MCP callers must send `Authorization: Bearer <MCP_AUTH_TOKEN>` on HTTP

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

## Docker

```bash
docker build -t rpmc-superops-mcp:local .
docker run --rm -p 127.0.0.1:8080:8080 --env-file /secure/path/.env rpmc-superops-mcp:local
```

See `docker-compose.sample.yml`. Production compose stays on QNAP and is not committed.

## Privacy

Ticket conversations and notes are sanitized by default: HTML stripped, high-confidence secrets redacted, attachments metadata-only. Redaction is marked in the result. The LLM should diagnose; this server gathers and gates data.

## License

Apache-2.0. See LICENSE, NOTICE, and THIRD_PARTY_NOTICES.md.
