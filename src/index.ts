import * as dotenv from "dotenv";
dotenv.config();

import { input } from "@inquirer/prompts";
import { HumanMessage } from "@langchain/core/messages";
import { initializeMcpServers } from "./mcp/index.js";
import { mcpManager } from "@/mcp/client.js";
import { appGraph } from "@/agent/graph.js";

/**
 * Handles graceful shutdown to ensure Docker containers and MCP processes are cleaned up.
 */
async function shutdown() {
    console.log("\n\n🛑 Shutting down Agentic Code Assistant...");
    await mcpManager.disconnectAll();
    process.exit(0);
}

// Catch Ctrl+C and exit gracefully
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
    console.log("==========================================");
    console.log("🤖 Agentic Code Assistant & Data Platform");
    console.log("==========================================\n");

    // 1. Boot up MCP Servers (Postgres, GitHub, etc.)
    await initializeMcpServers();
    console.log("\n✅ System Ready. Type 'exit' or 'quit' to close.\n");

    // Define the initial state memory (keeps track of the whole conversation)
    let conversationHistory: any[] = [];

    // 2. The Interactive Chat Loop
    while (true) {
        const userMessage = await input({ message: "You:" });

        if (userMessage.toLowerCase() === "exit" || userMessage.toLowerCase() === "quit") {
            await shutdown();
        }

        if (!userMessage.trim()) continue;

        console.log("\n⏳ Processing...\n");

        // Add user message to history
        conversationHistory.push(new HumanMessage(userMessage));
        console.log(conversationHistory)

        try {
            // 3. Stream the Graph Execution
            const stream = await appGraph.stream(
                { messages: conversationHistory },
                { streamMode: "updates" } // Stream mode gives us updates as each node finishes
            );

            for await (const chunk of stream) {
                // Look at the chunk to see which node just executed
                for (const [nodeName, nodeState] of Object.entries(chunk)) {
                    if (nodeName === "supervisor") {
                        const nextAgent = (nodeState as any).next;
                        if (nextAgent === "FINISH") {
                            console.log(`\n✅ [SUPERVISOR]: Task Complete.`);
                        } else {
                            console.log(`\n👔 [SUPERVISOR]: Routing task to ➔ [${nextAgent}]`);
                        }
                    } else {
                        // A Specialist Agent finished an execution
                        const messages = (nodeState as any).messages;
                        const lastMessage = messages[messages.length - 1];

                        // Print the agent's response
                        console.log(`\n🧑‍💻 [AGENT: ${nodeName.toUpperCase()}]:\n${lastMessage.content}`);

                        // Save their response to the ongoing history
                        conversationHistory.push(lastMessage);
                    }
                }
            }
        } catch (error: any) {
            console.error(`\n❌ Graph Execution Error: ${error.message}`);
        }

        console.log("\n--------------------------------------------------");
    }
}

// Start the application
main();