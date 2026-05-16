import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { CallbackHandler } from "@langfuse/langchain";
import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// 1. Initialize OpenTelemetry SDK to capture deep system traces
export const otelSDK = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
});

// Start the SDK globally
otelSDK.start();

// 2. Initialize the Langfuse CallbackHandler for LangChain/LangGraph
export const langfuseHandler = new CallbackHandler({
    tags: ["nexusflow-engine"], // Easily filter runs in the Langfuse UI
});