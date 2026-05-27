import * as dotenv from "dotenv";
import path from "node:path";
import { HumanMessage } from "@langchain/core/messages";
import { appGraph } from "@/graph/workflow.js";
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { langfuseHandler, otelSDK } from "@/tracing/index.js";

async function main() {
    console.log("==========================================");
    console.log("🚀 Starting NexusFlow Engine Test (with Tracing)");
    console.log("==========================================\n");

    const userPrompt = `I need an AWS Glue job to extract data from my existing 'sales-data-lake-2024' S3 bucket, clean the 'customer_email' column, and save it back to S3 in Parquet format.`;

    // Generate a unique session ID
    const sessionId = `test-run-${Date.now()}`;

    const initialState = {
        messages: [new HumanMessage(userPrompt)],
    };

    try {
        // INJECT THE LANGFUSE CALLBACK HANDLER & SESSION METADATA HERE
        const stream = await appGraph.stream(initialState, {
            streamMode: "updates",
            callbacks: [langfuseHandler],
            metadata: {
                langfuseSessionId: sessionId
            },
            recursionLimit: 50
        });

        for await (const chunk of stream) {
            const nodeNames = Object.keys(chunk);
            if (nodeNames.length === 0) continue;

            const nodeName = nodeNames[0] as keyof typeof chunk;
            const stateUpdate = chunk[nodeName] as any;

            console.log(`\n--------------------------------------------------`);
            console.log(`✅ Finished Node: [${String(nodeName).toUpperCase()}]`);

            if (stateUpdate?.currentStep) console.log(`📍 UI Highlight Step: ${stateUpdate.currentStep}`);
            if (stateUpdate?.executionStrategy) console.log(`🎯 Strategy Selected: ${stateUpdate.executionStrategy}`);
            if (stateUpdate?.validationErrors) console.log(`⚠️ Errors Found: ${stateUpdate.validationErrors}`);
        }

    } catch (error: any) {
        console.error(`\n❌ FATAL ENGINE ERROR:`, error);
    } finally {
        console.log("\n⏳ Uploading traces to Langfuse...");

        try {
            // Bypass the missing TypeScript definition with 'as any'
            const handler = langfuseHandler as any;

            if (typeof handler.flushAsync === "function") {
                await handler.flushAsync();
            } else if (typeof handler.shutdownAsync === "function") {
                await handler.shutdownAsync();
            }

            // Shut down OpenTelemetry cleanly
            await otelSDK.shutdown();
        } catch (e) {
            console.warn("Minor issue flushing traces, but execution completed.");
        }

        console.log("✅ Traces uploaded. Check your Langfuse Dashboard.");
    }
}

main();