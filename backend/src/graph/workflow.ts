import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "@/graph/state.js";
import {
    architectNode,
    pipelineCoderNode,
    deployerNode,
    dataOpsNode
} from "@/graph/nodes.js";
import { fileURLToPath } from "node:url";

const MAX_RETRIES = process.env.MAX_DEPLOYMENT_RETRIES ? parseInt(process.env.MAX_DEPLOYMENT_RETRIES) : 3;

// ==========================================
// CONDITIONAL ROUTING LOGIC
// ==========================================

/**
 * ROUTER 1: Reads the Architect's strategy and branches the graph.
 */
const routeAfterPlanning = (state: typeof AgentState.State) => {
    if (state.deploymentStatus === "FATAL_ERROR") return END;

    console.log(`🔀 [ROUTER]: Strategy is '${state.executionStrategy}'. Deciding next step.`);
    if (state.executionStrategy === "DATA_ANALYSIS") {
        return "data-ops";
    }

    // Both GREENFIELD and BROWNFIELD strategies require code generation.
    return "pipeline-coder";
};

/**
 * ROUTER 2: Checks if Pulumi deployed successfully or failed.
 * Acts as the self-correction loop back to the Coder.
 */
const routeAfterDeployment = (state: typeof AgentState.State) => {
    if (state.deploymentStatus === "FATAL_ERROR") return END;

    if (state.deploymentStatus === "FAILED") {
        if (state.retryCount >= MAX_RETRIES) {
            console.error(`❌ [ROUTER]: Max deployment retries (${MAX_RETRIES}) reached. Halting workflow.`);
            return END;
        }
        console.warn(`⚠️ [ROUTER]: Deployment Failed. Looping back to Coder to fix syntax/logic errors.`);
        return "pipeline-coder";
    }

    console.log(`🚀 [ROUTER]: Pipeline Successfully Deployed! Routing to DataOps to trigger the Job.`);
    return "data-ops";
};

// ==========================================
// GRAPH CONSTRUCTION
// ==========================================

const workflow = new StateGraph(AgentState)
    // Register the 3 core nodes + DataOps
    .addNode("architect", architectNode)
    .addNode("pipeline-coder", pipelineCoderNode)
    .addNode("deployer", deployerNode)
    .addNode("data-ops", dataOpsNode)

    // Flow starts at the Architect (Discovery + Planning)
    .addEdge(START, "architect")

    // Branch based on Architect's Strategy
    .addConditionalEdges(
        "architect",
        routeAfterPlanning,
        {
            "data-ops": "data-ops",
            "pipeline-coder": "pipeline-coder",
            [END]: END
        }
    )

    // The 'Data Analysis' branch terminates immediately after running queries
    .addEdge("data-ops", END)

    // Code Generation always proceeds straight to Deployment (Pulumi handles validation)
    .addEdge("pipeline-coder", "deployer")

    // Deployment self-correction loop
    .addConditionalEdges(
        "deployer",
        routeAfterDeployment,
        {
            "pipeline-coder": "pipeline-coder", // Loop back to fix code
            "data-ops": "data-ops",             // If deployment succeeds, trigger DataOps to run the job
            [END]: END                          // Success, fatal error, or halt
        }
    );

// Compile the final, runnable graph
export const appGraph = workflow.compile();

// ==========================================
// CLI EXECUTION (DRAW GRAPH)
// ==========================================
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
    console.log("==========================================");
    console.log("📊 NexusFlow Workflow Graph Initialization");
    console.log("==========================================\n");

    try {
        const mermaidString = appGraph.getGraph().drawMermaid();
        console.log("Mermaid Graph Code (Copy & Paste this into https://mermaid.live):");
        console.log("\n------------------------------------------\n");
        console.log(mermaidString);
        console.log("\n------------------------------------------\n");
    } catch (error: any) {
        console.error("⚠️ Could not generate Mermaid diagram. Error:", error.message);
    }
}