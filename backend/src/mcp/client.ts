import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { toolManager } from "@/tools/toolRegistry.js";
import { askForPermission } from "@/safety/interactivity.js";

export interface McpServerConfig {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    includeTools?: string[];
}

// Define what a TextContent block looks like
interface TextContent {
    type: 'text';
    text: string;
}

export class McpClientManager {
    private clients: Map<string, Client> = new Map();

    /**
    * Connects to an external MCP server, fetches its tools, and registers them.
    * If config.includeTools is provided, only those tools are registered.
    */
    async connectToServer(config: McpServerConfig): Promise<void> {
        console.log(`\n⏳ Connecting to MCP Server: ${config.name}...`);

        const transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: { ...process.env, ...config.env } as Record<string, string>,
        });

        const client = new Client(
            { name: "agentic-code-assistant", version: "1.0.0" },
        );
        try {
            await client.connect(transport)
            this.clients.set(config.name, client);
            console.log(`✅ Connected to ${config.name}`);

            // Fetch all tools from the MCP server
            const { tools } = await client.listTools();

            if (!tools || tools.length === 0) {
                console.log(`⚠️  No tools found on server: ${config.name}`);
                return;
            }

            // Apply filtering if includeTools is specified
            let toolsToRegister = tools;
            if (config.includeTools && config.includeTools.length > 0) {
                const includeSet = new Set(config.includeTools);
                toolsToRegister = tools.filter(tool => includeSet.has(tool.name));
                const excludedCount = tools.length - toolsToRegister.length;
                console.log(
                    `🔍 Filtering tools: ${toolsToRegister.length} of ${tools.length} tools will be registered ` +
                    `(excluded ${excludedCount} not in includeTools).`
                );
                if (toolsToRegister.length === 0) {
                    console.warn(`⚠️  No tools matched the includeTools list for server: ${config.name}`);
                    return;
                }
            }

            console.log(`🔌 Registering ${toolsToRegister.length} tools from ${config.name}...`);

            // Convert and register each (filtered) tool
            for (const mcpTool of toolsToRegister) {
                const lcTool = this.createLangChainAdapter(client, mcpTool, config.name);
                toolManager.registerDynamicTool(lcTool);
            }

        } catch (error: any) {
            console.error(`❌ Failed to connect to MCP server ${config.name}:`, error.message);
        }
    }

    /**
     * Adapts an MCP Tool into a LangChain DynamicStructuredTool.
     * (unchanged)
     */
    private createLangChainAdapter(client: Client, mcpTool: any, serverName: string): DynamicStructuredTool {
        // Sanitize the server name to ensure it is valid for LangChain tool names
        const safeServerName = serverName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const namespacedToolName = `${safeServerName}_${mcpTool.name}`;

        // MCP tools define inputs via JSON Schema. We use a generic Zod schema 
        // to accept the object, and inject the JSON schema into the description so the LLM knows how to format it.
        const toolDescription = `${mcpTool.description}\n\nIMPORTANT: Your input must perfectly match this JSON Schema:\n${JSON.stringify(mcpTool.inputSchema, null, 2)}`;
        return new DynamicStructuredTool({
            name: namespacedToolName,
            description: toolDescription,
            // We accept a generic dictionary, but the LLM will follow the JSON schema in the description
            schema: z.record(z.string(), z.any()),
            func: async (input: Record<string, any>) => {

                // 1. Human-in-the-Loop Safety Check for external MCP execution
                const approved = await askForPermission(
                    "mcp",
                    "mcp",
                    namespacedToolName,
                    `Agent wants to execute external MCP Tool: [${namespacedToolName}]`
                );

                if (!approved) {
                    return "Operation cancelled by user.";
                }

                // 2. Call the external MCP tool
                try {
                    const result = await client.callTool({
                        name: mcpTool.name,
                        arguments: input,
                    });

                    // 3. Parse and return MCP content
                    if (result.isError) {
                        return `MCP Tool Error: ${JSON.stringify(result.content)}`;
                    }

                    // MCP returns an array of content blocks. We map it to a single string for the LLM.
                    if (Array.isArray(result.content)) {
                        const textBlocks = result.content.filter((c): c is TextContent =>
                            typeof c === 'object' && c !== null && 'type' in c && c.type === 'text'
                        );
                        const combinedText = textBlocks.map(b => b.text).join('\n');
                        
                        return combinedText; 
                    }

                    // Fallback for non-array content structures
                    return JSON.stringify(result.content);

                } catch (error: any) {
                    return `Execution failed: ${error.message}`;
                }
            },
        });
    }

    /**
    * Gracefully close all MCP connections
    */
    async disconnectAll() {
        for (const [name, client] of this.clients.entries()) {
            await client.close();
            console.log(`🔌 Disconnected from ${name}`);
        }
        this.clients.clear();
    }
}

// Export singleton
export const mcpManager = new McpClientManager();