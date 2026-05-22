import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "@/graph/state.js";
import {
    explorerNode,
    architectNode,
    pipelineCoderNode,
    validatorNode,
    deployerNode,
    dataOpsNode
} from "@/graph/nodes.js";
import { fileURLToPath } from "node:url";

const MAX_RETRIES = 3;

// ==========================================
// CONDITIONAL ROUTING LOGIC
// ==========================================

/**
 * ROUTER 1: Reads the Architect's strategy and branches the graph.
 */
const routeAfterPlanning = (state: typeof AgentState.State) => {
    console.log(`🔀 [ROUTER]: Strategy is '${state.executionStrategy}'. Deciding next step.`);
    if (state.executionStrategy === "DATA_ANALYSIS") {
        return "data-ops";
    }
    // Both GREENFIELD and BROWNFIELD strategies require code generation.
    return "pipeline-coder";
};

/**
 * ROUTER 2: Checks if pipeline code successfully parsed or if the agent aborted.
 */
const routeAfterCoding = (state: typeof AgentState.State) => {
    if (state.deploymentStatus === "FATAL_ERROR") return END;

    if (state.validationErrors) {
        console.warn(`⚠️ [ROUTER]: Coder failed to parse. Looping back to fix output formatting.`);
        return "pipeline-coder";
    }

    return "validator";
};

/**
 * ROUTER 3: Handles validation success or failure.
 */
const routeAfterValidation = (state: typeof AgentState.State) => {
    if (state.deploymentStatus === "FATAL_ERROR") return END;

    if (state.validationErrors) {
        if (state.retryCount >= MAX_RETRIES) {
            console.error(`❌ [ROUTER]: Max validation retries reached. Halting.`);
            return END;
        }
        console.warn(`⚠️ [ROUTER]: Validation Failed. Looping back to Coder.`);
        return "pipeline-coder";
    }

    console.log(`✅ [ROUTER]: Validation Passed. Proceeding to Deployment.`);
    return "deployer";
};

/**
 * ROUTER 4: Handles deployment success or failure.
 */
const routeAfterDeployment = (state: typeof AgentState.State) => {
    if (state.deploymentStatus === "FATAL_ERROR") return END;

    if (state.deploymentStatus === "FAILED") {
        if (state.retryCount >= MAX_RETRIES) {
            console.error(`❌ [ROUTER]: Max deployment retries reached. Halting.`);
            return END;
        }
        console.warn(`⚠️ [ROUTER]: Deployment Failed. Looping back to Coder.`);
        return "pipeline-coder";
    }

    console.log(`🚀 [ROUTER]: Pipeline Successfully Deployed!`);
    return END;
};

// ==========================================
// GRAPH CONSTRUCTION
// ==========================================

const workflow = new StateGraph(AgentState)
    // Register all nodes
    .addNode("explorer", explorerNode)
    .addNode("architect", architectNode)
    .addNode("pipeline-coder", pipelineCoderNode)
    .addNode("validator", validatorNode)
    .addNode("deployer", deployerNode)
    .addNode("data-ops", dataOpsNode)

    // Define edges
    .addEdge(START, "explorer")
    .addEdge("explorer", "architect")

    // Dynamic Branch based on strategy
    .addConditionalEdges(
        "architect",
        routeAfterPlanning,
        {
            "data-ops": "data-ops",
            "pipeline-coder": "pipeline-coder",
        }
    )

    // Define the 'Data Analysis' branch (terminates)
    .addEdge("data-ops", END)

    // Code Generation Branch (with self-healing loops for parsing errors)
    .addConditionalEdges("pipeline-coder", routeAfterCoding, {
        "pipeline-coder": "pipeline-coder",
        "validator": "validator",
        [END]: END
    })

    // Validation self-correction loop
    .addConditionalEdges("validator", routeAfterValidation, {
        "pipeline-coder": "pipeline-coder", // Loop back to fix code
        "deployer": "deployer",   // Proceed
        [END]: END                // Halt on max retries or fatal error
    })

    // Deployment self-correction loop
    .addConditionalEdges("deployer", routeAfterDeployment, {
        "pipeline-coder": "pipeline-coder", // Loop back to fix code
        [END]: END                // Success, fatal error, or halt
    });

// Compile the final, runnable graph
export const appGraph = workflow.compile();

// ==========================================
// CLI EXECUTION (DRAW GRAPH)
// ==========================================
// This acts like `if __name__ == "__main__":` in Python. 
// It will run only if you execute this file directly (e.g. `npx tsx src/graph/workflow.ts`)

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