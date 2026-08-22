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

Origin validation is implemented in RPMC wrappers around the MCP SDK v2 `validateOriginHeader` / `validateHostHeader` checks (not the deprecated transport `allowedOrigins` option). The Node package documents Host/Origin guards as external middleware for `node:http`. RPMC uses the SDK validators and keeps a consistent `{ "error": "..." }` 403 body that does not echo header values.

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

## Host policy

HTTP `/mcp` validates `Host` using the same SDK hostname check as the official Node `hostHeaderValidation` guard.

| Request | Result |
|---|---|
| Missing, empty, duplicate, or unparseable `Host` | Rejected (`403`) |
| `Host` present, `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS` unset | Allowed only for loopback (`localhost`, `127.0.0.1`, `::1`) |
| `Host` present, `MCP_ALLOWED_HOSTS` set | Hostname must match that allowlist |
| `Host` present, only `MCP_ALLOWED_ORIGINS` set | Hostname must match the Origin allowlist (shared config, no drift for a single tunnel hostname) |

`MCP_ALLOWED_HOSTS` is a comma-separated list of hostnames or URLs, for example:

```
MCP_ALLOWED_HOSTS=nas.lan,192.168.1.10,https://your-tunnel-hostname.example
```

Ports in the Host header are ignored. `/health` is not Host-validated so Docker HEALTHCHECK against `127.0.0.1` keeps working. LAN QNAP and future Cloudflare Access hostnames are env-only; nothing is hardcoded.

Do not treat Host validation as authentication.

## Human confirmation (Phase 2)

Disruptive and destructive writes return MCP `inputRequired` with an elicitation form (`confirm` + `typedTarget`). The SDK legacy shim serves pre-2026-07-28 clients via `elicitation/create`. Confirmation is **not** a tool argument. The challenge is HMAC-scoped to action, target, consequence, and parameter digest.

## Request lifecycle

Each `/mcp` request creates a server + Streamable HTTP transport, handles the request, then closes both in `finally`. If `handleRequest` throws, the client receives `{ "error": "request failed" }` without stack traces or internal messages. `/health` remains unauthenticated and secret-free.

## Future CI hardening

GitHub Actions currently use version tags (`actions/checkout@v4`, `actions/setup-node@v4`, `docker/setup-buildx-action@v3`, `docker/build-push-action@v6`). Pinning those to immutable commit SHAs is worthwhile later; it was not done in this pass to avoid a CI redesign.
