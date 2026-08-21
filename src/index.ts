#!/usr/bin/env node
import { createServer } from "node:http";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { clientFromConfig } from "./superops/client.js";
import { createMcpServer } from "./mcp/server.js";
import { handleMcpHttpRequest } from "./http/mcp-http.js";

function startStdio(): void {
  const config = loadConfig();
  const client = clientFromConfig(config);
  serveStdio(() => createMcpServer(config, client));
  console.error("rpmc-superops-mcp running on stdio (Phase 1 read-only)");
}

async function startHttp(): Promise<void> {
  const config = loadConfig();
  const client = clientFromConfig(config);

  const httpServer = createServer((req, res) => {
    void (async () => {
      try {
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
          await handleMcpHttpRequest(req, res, config, client);
          return;
        }

        if (!res.headersSent) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "not found", endpoints: ["/mcp", "/health"] }));
        }
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "request failed" }));
        }
      }
    })();
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
    startStdio();
  }
}

main().catch((error) => {
  console.error("Fatal startup error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
