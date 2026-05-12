import { initializeMcpServers } from "./index.js";
import { toolManager } from "../tools/toolRegistry.js";
import { mcpManager } from "./client.js";

import * as dotenv from "dotenv";
dotenv.config(); // Load .env file for the $GITHUB_TOKEN injection

async function runTest() {
    console.log("=== Testing MCP Configuration & Loading ===");

    // 1. Boot the servers from the config file
    await initializeMcpServers();

    // 2. Print the tools that were dynamically added
    const allTools = toolManager.getAllTools();
    console.log(`\n✅ Successfully loaded ${allTools.length} total tools.`);

    console.log("\n🛠️ Tool Manifest:");
    allTools.forEach(t => console.log(` - ${t.name}`));

    // 3. Cleanup
    await mcpManager.disconnectAll();
    process.exit(0);
}

runTest();