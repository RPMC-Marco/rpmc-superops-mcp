#!/usr/bin/env node
import { createServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { authorizeMcpRequest } from "./auth.js";
import { clientFromConfig } from "./superops/client.js";
import { createMcpServer } from "./mcp/server.js";

async function startStdio(): Promise<void> {
  const config = loadConfig();
  const client = clientFromConfig(config);
  const server = createMcpServer(config, client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("rpmc-superops-mcp running on stdio (Phase 1 read-only)");
}

async function startHttp(): Promise<void> {
  const config = loadConfig();
  const client = clientFromConfig(config);

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          product: "rpmc-superops-mcp",
          readonly: true,
          auth: "required",
        })
      );
      return;
    }

    if (url.pathname === "/mcp") {
      if (!authorizeMcpRequest(req.headers, config.mcpAuthToken)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      const server = createMcpServer(config, client);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
      await server.close();
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found", endpoints: ["/mcp", "/health"] }));
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(config.httpPort, config.httpHost, () => {
      console.error(`rpmc-superops-mcp listening on http://${config.httpHost}:${config.httpPort}/mcp`);
      resolve();
    });
  });

  const shutdown = () => {
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.transport === "http") {
    await startHttp();
  } else {
    await startStdio();
  }
}

main().catch((error) => {
  console.error("Fatal startup error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
