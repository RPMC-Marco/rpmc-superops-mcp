# Third-party notices

This file identifies third-party source used in rpmc-superops-mcp.
It is not legal advice.

## Apache License 2.0

### computask/superops-mcp

- License: Apache-2.0
- Repository: https://github.com/computask/superops-mcp
- Reference commit: 85b24ee9f203637b680858cd0abdd1bf5d303f9e
- Computask retains WYRE-derived lineage/metadata (Computask's package.json / LICENSE still identify the WYRE lineage)

Adapted into RPMC (see docs/PROVENANCE.md):

- SuperOps HTTP client timeout, AbortController, read-retry, Retry-After parsing, GraphQL error classes
- GraphQL operation documents for tickets, conversations, notes, clients, assets, alerts, technicians
- Ticket text sanitization / credential-redaction concepts
- JSON audit record shape (metadata only)
- MCP server factory and Streamable HTTP per-request server pattern (via the WYRE lineage)

RPMC does not include Cloudflare Workers, Durable Objects, OAuth, continuation/operation-ledger, or Computask tenant enums.

### wyre-technology/superops-mcp

- License: Apache-2.0
- Repository: https://github.com/wyre-technology/superops-mcp
- Reference commit: d3f900ca81506b1d62a027d2b0222be05d240415

Adapted into RPMC:

- stdio + Node Streamable HTTP entrypoint shape
- `createMcpServer` side-effect-free factory idea
- `cleanCredential` placeholder stripping
- non-root Docker image shape (RPMC uses Node 24 and does not use GitHub Packages)

## MIT

### CLI Printing Press (Servosity NOTICE)

Servosity's SuperOps CLI is Apache-2.0 and attributes generated code to CLI Printing Press (MIT).
RPMC did not copy generated Go source. Servosity was used as live-API intelligence and query-shape reference only.

## Independently implemented

RPMC-authored code implements the public SuperOps MSP GraphQL API and the Model Context Protocol using the official MCP TypeScript SDK v2. Similarity to other SuperOps clients that call the same public operations is expected.
