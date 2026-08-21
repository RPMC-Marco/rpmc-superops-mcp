import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../config.js";
import { writeAudit } from "../audit.js";
import { registeredCapabilities } from "../capabilities.js";
import type { SuperOpsClient } from "../superops/client.js";
import { handleTool } from "../tools/handlers.js";

export function listMcpTools() {
  return registeredCapabilities().map((capability) => ({
    name: capability.name,
    description: capability.description,
    inputSchema: capability.inputSchema,
  }));
}

export function createMcpServer(config: AppConfig, client: SuperOpsClient): Server {
  const server = new Server(
    { name: "rpmc-superops-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listMcpTools() as never,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const allowed = registeredCapabilities().find((capability) => capability.name === name);
    const started = Date.now();
    const requestId = randomUUID();

    if (!allowed) {
      writeAudit({
        event: "mcp.tool_call",
        timestamp: new Date().toISOString(),
        requestId,
        toolName: name,
        classification: "destructive",
        success: false,
        durationMs: Date.now() - started,
        errorSummary: "tool not registered",
      });
      return {
        content: [{ type: "text", text: `Error: ${name} is not registered on this read-only MCP server.` }],
        isError: true,
      } as never;
    }

    const result = await handleTool(name, args, client, config);
    writeAudit({
      event: "mcp.tool_call",
      timestamp: new Date().toISOString(),
      requestId,
      toolName: name,
      classification: allowed.classification,
      success: !result.isError,
      durationMs: Date.now() - started,
      errorSummary: result.isError ? result.content[0]?.text : undefined,
      metadata: { argumentKeys: Object.keys(args).slice(0, 20) },
    });
    return result as never;
  });

  return server;
}
