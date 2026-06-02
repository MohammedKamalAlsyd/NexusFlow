// backend/src/server.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import path from "node:path";
import { configManager } from "./config/index.js";
import { initializeMcpServers } from "./mcp/index.js";
import { appGraph } from "./graph/workflow.js";
import { HumanMessage } from "@langchain/core/messages";
import { approvalEmitter, resolvePermission } from "./safety/interactivity.js";
import fs from "node:fs/promises";

dotenv.config({ path: path.join(process.cwd(), '.env') });

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({ origin: "http://localhost:5173" })); // Assuming Vite default port
app.use(express.json());

// ==========================================
// API 1: CONFIGURATION MANAGEMENT
// ==========================================

// Get current configuration
app.get("/api/config", async (req, res) => {
    try {
        // Ensure latest config is loaded from disk
        await configManager.load();
        res.json(configManager.config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update configuration from Frontend
app.post("/api/config", async (req, res) => {
    try {
        const newSettings = req.body;

        // Merge the incoming settings with the existing config
        configManager.config = {
            ...configManager.config,
            preferences: {
                ...configManager.config.preferences,
                ...(newSettings.preferences || {})
            },
            pulumi: {
                ...configManager.config.pulumi,
                ...(newSettings.pulumi || {})
            }
        };

        // Save to .nexusflow-settings.json
        await configManager.save();
        res.json({ success: true, config: configManager.config });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


app.post("/api/approve", (req, res) => {
    const { id, decision } = req.body;
    if (!id || !decision) return res.status(400).json({ error: "Missing id or decision" });
    
    // Resolves the paused Promise in interactivity.ts
    resolvePermission(id, decision);
    res.json({ success: true });
});

// ==========================================
// API 2: AGENTIC WORKFLOW STREAMING (SSE)
// ==========================================
app.post("/api/chat", async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    // 1. Setup SSE Headers (Allows real-time streaming to the browser)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Helper to send typed events to the React frontend
    const sendEvent = (type: string, data: any) => {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const initialState = { messages: [new HumanMessage(prompt)] };

        // 2. Run the LangGraph Stream
        const stream = await appGraph.stream(initialState, {
            streamMode: "updates",
            recursionLimit: 50
        });

        // 3. Iterate through node executions
        for await (const chunk of stream) {
            const nodeNames = Object.keys(chunk);
            if (nodeNames.length === 0) continue;

            const nodeName = nodeNames[0]; // e.g., "architect", "pipeline-coder", "deployer"
            if (!nodeName) continue;
            const stateUpdate = (chunk as Record<string, any>)[nodeName];

            // Extract the latest AI Message for the chat log
            let aiMessage = "";
            if (stateUpdate.messages && stateUpdate.messages.length > 0) {
                const lastMsg = stateUpdate.messages[stateUpdate.messages.length - 1];
                aiMessage = typeof lastMsg.content === 'string' ? lastMsg.content : "Executed Task.";
            }

            // Attempt to read the python files if the coder just ran
            let generatedCode = { pulumi: "", pyspark: "" };
            if (nodeName === "pipeline-coder" && stateUpdate.workspacePath) {
                try {
                    generatedCode.pulumi = await fs.readFile(path.join(stateUpdate.workspacePath, "__main__.py"), "utf-8");

                    const files = await fs.readdir(stateUpdate.workspacePath);
                    const etlFile = files.find(f => f.endsWith(".py") && f !== "__main__.py");
                    if (etlFile) {
                        generatedCode.pyspark = await fs.readFile(path.join(stateUpdate.workspacePath, etlFile), "utf-8");
                    }
                } catch (e) {
                    /* Files might not exist yet */
                }
            }

            // Format the payload for the React Frontend
            const payload = {
                node: nodeName,
                status: stateUpdate.deploymentStatus,
                step: stateUpdate.currentStep,
                strategy: stateUpdate.executionStrategy,
                message: aiMessage,
                errors: stateUpdate.validationErrors,
                diagram: stateUpdate.diagram, // Pushed directly to React Flow
                code: generatedCode
            };

            // Send the chunk to the frontend
            sendEvent("node_update", payload);
        }

        // Send a completion event to close the connection gracefully
        sendEvent("workflow_complete", { status: "DONE" });
        res.end();

    } catch (error: any) {
        console.error("Pipeline Stream Error:", error);
        sendEvent("error", { message: error.message });
        res.end();
    }
});

// ==========================================
// INITIALIZATION & START
// ==========================================
async function startServer() {
    console.log("==========================================");
    console.log("🚀 Starting NexusFlow API Server");
    console.log("==========================================\n");

    try {
        // 1. Load system config
        await configManager.load();

        // 2. Initialize MCP Servers (AWS/Azure)
        await initializeMcpServers();

        // 3. Start Express
        app.listen(PORT, () => {
            console.log(`\n✅ Server is running on http://localhost:${PORT}`);
            console.log(`🔌 Ready to accept frontend connections.`);
        });
    } catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
}

startServer();