# MCP SDK and HTTP notes

## SDK decision (v2)

RPMC migrated from `@modelcontextprotocol/sdk` v1 (`^1.12.0`) to the stable TypeScript SDK v2 line:

- `@modelcontextprotocol/server@2.0.0`
- `@modelcontextprotocol/node@2.0.0`

v2 is the current stable release line (MCP spec 2026-07-28). v1 continues to receive fixes for a limited window. This project is new and small, so staying on v1 would mean a second migration later with no benefit.

Kept:

- Streamable HTTP, stateless (`sessionIdGenerator: undefined`)
- stdio via `serveStdio`
- Node 24 (v2 requires Node 20+)
- No OAuth / Express / Workers adapters

Origin validation is implemented in RPMC code (not the deprecated transport `allowedOrigins` option). The Node package documents Host/Origin guards as external middleware for `node:http`.

## HTTP auth

HTTP `/mcp` requires `Authorization: Bearer <token>` with exactly one space and a single token. Duplicate `Authorization` headers are rejected. `MCP_AUTH_TOKEN` must be at least 32 characters. stdio does not use Bearer auth and does not require `MCP_AUTH_TOKEN`.

This application auth is independent of a future Cloudflare Access/Tunnel layer.

## Origin policy

MCP Streamable HTTP requires Origin checks when a browser sends `Origin` (DNS-rebinding mitigation).

| Request | Result |
|---|---|
| No `Origin` header | Allowed (normal non-browser MCP clients) |
| `Origin` present, `MCP_ALLOWED_ORIGINS` unset | Allowed only for loopback hostnames (`localhost`, `127.0.0.1`, `::1`) |
| `Origin` present, `MCP_ALLOWED_ORIGINS` set | Hostname must match the allowlist |
| `Origin: null`, multiple Origin headers, or unparseable | Rejected (`403`) |

`MCP_ALLOWED_ORIGINS` is a comma-separated list of origins or hostnames, for example:

```
MCP_ALLOWED_ORIGINS=https://mcp.example.tld,192.168.1.10
```

Do not treat Origin validation as authentication. Invalid origins are rejected before a per-request MCP server is created.

No RPMC public hostname is hardcoded.

## Request lifecycle

Each `/mcp` request creates a server + Streamable HTTP transport, handles the request, then closes both in `finally`. If `handleRequest` throws, the client receives `{ "error": "request failed" }` without stack traces or internal messages. `/health` remains unauthenticated and secret-free.
