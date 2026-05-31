import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
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
 * Verifies if a Docker image is present locally, and pulls it if it is missing
 * to prevent the MCP client connection from timing out.
 */
function ensureDockerImageLocal(mcpConfig: McpServerConfig): void {
    if (mcpConfig.command !== "docker") return;

    const args = mcpConfig.args;
    if (!args || args.length === 0) return;

    // The last argument in a "docker run" command is the image name
    const imageName = args[args.length - 1];
    if (!imageName || imageName.startsWith("-")) return;

    try {
        // Returns the image ID if it exists, or empty string if it doesn't
        const imageExists = execSync(`docker images -q "${imageName}"`, { encoding: "utf-8" }).trim();

        if (!imageExists) {
            console.log(`\n📦 [DOCKER PRE-FLIGHT]: Image '${imageName}' is not cached locally.`);
            console.log(`⏳ Pre-pulling image to prevent MCP connection timeouts...`);
            
            // Standard inherit option pipes the docker pull progress bar straight to your console
            execSync(`docker pull "${imageName}"`, { stdio: "inherit" });
            
            console.log(`✅ Image '${imageName}' successfully cached.\n`);
        }
    } catch (err: any) {
        console.warn(`⚠️  Could not verify or pull Docker image '${imageName}': ${err.message}`);
    }
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
            includeTools: details.includeTools || []
        };

        // Run the local check and pull first
        ensureDockerImageLocal(mcpConfig);

        // Attempt the client connection
        await mcpManager.connectToServer(mcpConfig);
    }
}