// backend/src/server.ts
import "dotenv/config";
import { langfuseHandler } from "./tracing/index.js";
import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import path from "node:path";
import { createServer } from "node:http";
import { Server } from "socket.io";
import fs from "node:fs/promises";
import { HumanMessage } from "@langchain/core/messages";

import { configManager } from "./config/index.js";
import { initializeMcpServers } from "./mcp/index.js";
import { appGraph } from "./graph/workflow.js";
import { executionContext } from "./safety/executionContext.js";

dotenv.config({ path: path.join(process.cwd(), '.env') });

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 4000;

// Initialize Socket.io
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

const activeStreams = new Map<string, AbortController>();

// Middleware
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// ==========================================
// API: CONFIGURATION MANAGEMENT
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
            },
            allowList: newSettings.allowList || configManager.config.allowList
        };

        // Save to .nexusflow-settings.json
        await configManager.save();
        res.json({ success: true, config: configManager.config });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// REAL-TIME AGENTIC WORKFLOW (Socket.io)
// ==========================================
io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    socket.on("start_chat", async (data) => {
        const { prompt, sessionId } = data;
        if (!prompt) return socket.emit("error", { message: "Prompt is required" });

        const controller = new AbortController();
        activeStreams.set(sessionId, controller);
        const initialState = { messages: [new HumanMessage(prompt)] };

        // Run the graph execution INSIDE the AsyncLocalStorage context
        // This guarantees that any tool called by this workflow has access to this specific socket!
        executionContext.run({ socket, sessionId }, async () => {
            try {
                const stream = await appGraph.stream(initialState, {
                    streamMode: "updates",
                    recursionLimit: 50,
                    callbacks: [langfuseHandler],
                    metadata: { langfuseSessionId: sessionId }
                });

                for await (const chunk of stream) {
                    if (controller.signal.aborted) {
                        socket.emit("system_log", { message: "🛑 Stream aborted by user." });
                        return;
                    }

                    const nodeNames = Object.keys(chunk);
                    if (nodeNames.length === 0) continue;

                    const nodeName = nodeNames[0];
                    if (!nodeName) continue;
                    const stateUpdate = (chunk as Record<string, any>)[nodeName];

                    let aiMessage = "";
                    if (stateUpdate.messages && stateUpdate.messages.length > 0) {
                        const lastMsg = stateUpdate.messages[stateUpdate.messages.length - 1];
                        aiMessage = typeof lastMsg.content === 'string' ? lastMsg.content : "Executed Task.";
                    }

                    let generatedCode = { pulumi: "", pyspark: "" };
                    if (nodeName === "pipeline-coder" && stateUpdate.workspacePath) {
                        try {
                            generatedCode.pulumi = await fs.readFile(path.join(stateUpdate.workspacePath, "__main__.py"), "utf-8");
                            const files = await fs.readdir(stateUpdate.workspacePath);
                            const etlFile = files.find(f => f.endsWith(".py") && f !== "__main__.py");
                            if (etlFile) {
                                generatedCode.pyspark = await fs.readFile(path.join(stateUpdate.workspacePath, etlFile), "utf-8");
                            }
                        } catch (e) { /* Ignore */ }
                    }

                    socket.emit("node_update", {
                        node: nodeName,
                        status: stateUpdate.deploymentStatus,
                        step: stateUpdate.currentStep,
                        strategy: stateUpdate.executionStrategy,
                        message: aiMessage,
                        errors: stateUpdate.validationErrors,
                        diagram: stateUpdate.diagram,
                        code: generatedCode
                    });
                }

                socket.emit("workflow_complete", { status: "DONE" });

            } catch (error: any) {
                console.error("Pipeline Stream Error:", error);
                socket.emit("error", { message: error.message });
            } finally {
                activeStreams.delete(sessionId);
            }
        });
    });

    socket.on("stop_generation", (data) => {
        const { sessionId } = data;
        if (activeStreams.has(sessionId)) {
            activeStreams.get(sessionId)?.abort();
            activeStreams.delete(sessionId);
        }
    });

    socket.on("disconnect", () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        // Active abort controllers will naturally hang up if the user disconnects
    });
});

// ==========================================
// INITIALIZATION & START
// ==========================================
async function startServer() {
    console.log("==========================================");
    console.log("🚀 Starting NexusFlow Socket.io API Server");
    console.log("==========================================\n");

    try {
        // 1. Load system config
        await configManager.load();

        // 2. Initialize MCP Servers (AWS/Azure)
        await initializeMcpServers();

        // 3. Listen using httpServer instead of app
        httpServer.listen(PORT, () => {
            console.log(`\n✅ Server is running on http://localhost:${PORT}`);
            console.log(`🔌 WebSockets ready to accept frontend connections.`);
        });
    } catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
}

startServer();