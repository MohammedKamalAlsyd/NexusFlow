import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "@/graph/state.js";
import {
    explorerNode,
    architectNode,
    etlCoderNode,
    iacCoderNode,
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
    return "etl-coder";
};

/**
 * ROUTER 2: Checks if ETL Code successfully parsed or if the agent aborted.
 */
const routeAfterEtl = (state: typeof AgentState.State) => {
    if (state.deploymentStatus === "FATAL_ERROR") return END;

    if (state.validationErrors) {
        console.warn(`⚠️ [ROUTER]: ETL Coder failed to parse. Looping back to fix output formatting.`);
        return "etl-coder";
    }

    return "iac-coder";
};

/**
 * ROUTER 3: Checks if IaC Code successfully parsed or if the agent aborted.
 */
const routeAfterIac = (state: typeof AgentState.State) => {
    if (state.deploymentStatus === "FATAL_ERROR") return END;

    if (state.validationErrors) {
        console.warn(`⚠️ [ROUTER]: IaC Coder failed to parse. Looping back to fix output formatting.`);
        return "iac-coder";
    }

    return "validator";
};

/**
 * ROUTER 4: Handles validation success or failure.
 */
const routeAfterValidation = (state: typeof AgentState.State) => {
    if (state.deploymentStatus === "FATAL_ERROR") return END;

    if (state.validationErrors) {
        if (state.retryCount >= MAX_RETRIES) {
            console.error(`❌ [ROUTER]: Max validation retries reached. Halting.`);
            return END;
        }
        console.warn(`⚠️ [ROUTER]: Validation Failed. Looping back to Coders.`);
        return "etl-coder";
    }

    console.log(`✅ [ROUTER]: Validation Passed. Proceeding to Deployment.`);
    return "deployer";
};

/**
 * ROUTER 5: Handles deployment success or failure.
 */
const routeAfterDeployment = (state: typeof AgentState.State) => {
    if (state.deploymentStatus === "FATAL_ERROR") return END;

    if (state.deploymentStatus === "FAILED") {
        if (state.retryCount >= MAX_RETRIES) {
            console.error(`❌ [ROUTER]: Max deployment retries reached. Halting.`);
            return END;
        }
        console.warn(`⚠️ [ROUTER]: Deployment Failed. Looping back to IaC Coder for correction.`);
        return "iac-coder";
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
    .addNode("etl-coder", etlCoderNode)
    .addNode("iac-coder", iacCoderNode)
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
            "etl-coder": "etl-coder",
        }
    )

    // Define the 'Data Analysis' branch (terminates)
    .addEdge("data-ops", END)

    // Code Generation Branch (with self-healing loops for parsing errors)
    .addConditionalEdges("etl-coder", routeAfterEtl, {
        "etl-coder": "etl-coder",
        "iac-coder": "iac-coder",
        [END]: END
    })

    .addConditionalEdges("iac-coder", routeAfterIac, {
        "iac-coder": "iac-coder",
        "validator": "validator",
        [END]: END
    })

    // Validation self-correction loop
    .addConditionalEdges("validator", routeAfterValidation, {
        "etl-coder": "etl-coder", // Loop back to fix code
        "deployer": "deployer",   // Proceed
        [END]: END                // Halt on max retries or fatal error
    })

    // Deployment self-correction loop
    .addConditionalEdges("deployer", routeAfterDeployment, {
        "iac-coder": "iac-coder", // Loop back to fix IaC
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