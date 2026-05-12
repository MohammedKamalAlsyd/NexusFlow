import fs from "node:fs/promises";
import path from "node:path";
import { mcpManager, type McpServerConfig } from "@/mcp/client.js";

/**
 * Reads the MCP configuration file and securely injects environment variables.
 */
async function loadMcpConfig(): Promise<Record<string, any>> {
    const configPath = path.resolve(process.cwd(), "src", "config", "mcp-config.json");

    try {
        const rawData = await fs.readFile(configPath, "utf-8");
        return JSON.parse(rawData);
    } catch (err: any) {
        if (err.code === "ENOENT") {
            console.warn("⚠️  No mcp-config.json found in config folder. Skipping MCP initialization.");
            return { mcpServers: {} };
        }
        throw new Error(`Failed to parse mcp-config.json: ${err.message}`);
    }
}

/**
 * Replaces string values starting with '$' with their process.env equivalents.
 */
function resolveEnvironmentVariables(envObj: Record<string, string> = {}): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const [key, value] of Object.entries(envObj)) {
        if (value.startsWith("$")) {
            // Get the name without the '$'
            const envVarName = value.slice(1);
            const actualValue = process.env[envVarName];

            if (!actualValue) {
                console.warn(`⚠️  Environment variable ${envVarName} is referenced in config but not set in .env`);
            }

            resolved[key] = actualValue || "";
        } else {
            resolved[key] = value;
        }
    }
    return resolved;
}

/**
 * Bootstraps all MCP connections defined in mcp-config.json.
 */
export async function initializeMcpServers() {
    console.log("🚀 Bootstrapping Configured MCP Servers...");

    const config = await loadMcpConfig();
    const servers = config.mcpServers || {};

    for (const [serverName, serverDetails] of Object.entries(servers)) {
        const details = serverDetails as any;

        const mcpConfig: McpServerConfig = {
            name: serverName,
            command: details.command,
            args: details.args || [],
            env: resolveEnvironmentVariables(details.env),
        };

        await mcpManager.connectToServer(mcpConfig);
    }
}