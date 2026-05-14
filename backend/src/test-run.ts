import * as dotenv from "dotenv";
import path from "node:path";

// Load environment variables (AWS credentials, OpenRouter keys, etc.)
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { HumanMessage } from "@langchain/core/messages";
import { appGraph } from "@/graph/workflow.js";

async function main() {
    console.log("==========================================");
    console.log("🚀 Starting NexusFlow Engine Test");
    console.log("==========================================\n");

    // The simulated user request (Brownfield test)
    const userPrompt = `I need an AWS Glue job to extract data from my existing 'sales-data-lake-2024' S3 bucket, clean the 'customer_email' column, and load it into my 'analytics-db' RDS Postgres instance.`;

    console.log(`👤 USER REQUEST: "${userPrompt}"\n`);

    // Initialize the starting state memory
    const initialState = {
        messages: [new HumanMessage(userPrompt)],
    };

    try {
        // Stream the Graph Execution
        const stream = await appGraph.stream(initialState, { streamMode: "updates" });

        for await (const chunk of stream) {
            // 1. Get the list of node names in this chunk
            const nodeNames = Object.keys(chunk);

            // 2. Safety check: ensure the chunk actually has data
            if (nodeNames.length === 0) continue;

            // 3. Take the first node name and tell TS it's definitely a key of the chunk
            const nodeName = nodeNames[0] as keyof typeof chunk;
            const stateUpdate = chunk[nodeName] as any;

            // 4. Double check nodeName exists before using string methods
            if (!nodeName) continue;

            console.log(`\n--------------------------------------------------`);
            console.log(`✅ Finished Node: [${String(nodeName).toUpperCase()}]`);

            // Log UI Highlight
            if (stateUpdate?.currentStep) {
                console.log(`📍 UI Highlight Step: ${stateUpdate.currentStep}`);
            }

            // Print out what the agent actually generated/decided
            if (stateUpdate?.environmentContext) {
                console.log(`🔍 Discovered Context:`, stateUpdate.environmentContext);
            }
            if (stateUpdate?.executionStrategy) {
                console.log(`🎯 Strategy Selected: ${stateUpdate.executionStrategy}`);
            }
            if (stateUpdate?.artifacts && Object.keys(stateUpdate.artifacts).length > 0) {
                console.log(`💾 Artifacts Generated: ${Object.keys(stateUpdate.artifacts).join(", ")}`);
            }
            if (stateUpdate?.validationErrors) {
                console.log(`⚠️ Errors Found: ${stateUpdate.validationErrors}`);
            }
            if (stateUpdate?.deploymentStatus) {
                console.log(`🚀 Deployment Status: ${stateUpdate.deploymentStatus}`);
            }
        }

        console.log("\n==========================================");
        console.log("🏁 PIPELINE EXECUTION COMPLETE");
        console.log("==========================================");

    } catch (error: any) {
        console.error(`\n❌ FATAL ENGINE ERROR:`, error);
    }
}

// Run it
main();