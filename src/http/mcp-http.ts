import type { IncomingMessage, ServerResponse } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { authorizeMcpRequest } from "../auth.js";
import type { AppConfig } from "../config.js";
import { createMcpServer } from "../mcp/server.js";
import type { SuperOpsClient } from "../superops/client.js";
import { closeQuietly, safeHttpErrorMessage } from "./lifecycle.js";
import { evaluateHost, evaluateOrigin } from "./origin.js";

export interface Closable {
  close(): Promise<void>;
}

export interface ClosableTransport extends Closable {
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

export interface ConnectableServer extends Closable {
  connect(transport: ClosableTransport): Promise<void>;
}

export interface McpHttpFactories {
  createServer?: (config: AppConfig, client: SuperOpsClient) => ConnectableServer;
  createTransport?: () => ClosableTransport;
}

function json(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function handleMcpHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: AppConfig,
  client: SuperOpsClient,
  factories: McpHttpFactories = {}
): Promise<void> {
  if (!authorizeMcpRequest(req.headers, config.mcpAuthToken)) {
    json(res, 401, { error: "unauthorized" });
    return;
  }

  const host = evaluateHost(req.headers.host, config.allowedHostHostnames);
  if (!host.allowed) {
    json(res, 403, { error: "host not allowed" });
    return;
  }

  const origin = evaluateOrigin(req.headers.origin, config.allowedOriginHostnames);
  if (!origin.allowed) {
    json(res, 403, { error: "origin not allowed" });
    return;
  }

  const server = (factories.createServer ?? createMcpServer)(config, client);
  const transport =
    factories.createTransport?.() ??
    new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

  try {
    await server.connect(transport as never);
    await transport.handleRequest(req, res);
  } catch {
    json(res, 400, { error: safeHttpErrorMessage() });
  } finally {
    await closeQuietly(transport);
    await closeQuietly(server);
  }
}
