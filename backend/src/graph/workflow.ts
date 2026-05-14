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
 * ROUTER 2: Handles validation success or failure.
 */
const routeAfterValidation = (state: typeof AgentState.State) => {
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
 * ROUTER 3: Handles deployment success or failure.
 */
const routeAfterDeployment = (state: typeof AgentState.State) => {
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

    // Define the 'Code Generation' branch
    .addEdge("etl-coder", "iac-coder")
    .addEdge("iac-coder", "validator")

    // Validation self-correction loop
    .addConditionalEdges("validator", routeAfterValidation, {
        "etl-coder": "etl-coder", // Loop back to fix code
        "deployer": "deployer",   // Proceed
        [END]: END                // Halt on max retries
    })

    // Deployment self-correction loop
    .addConditionalEdges("deployer", routeAfterDeployment, {
        "iac-coder": "iac-coder", // Loop back to fix IaC
        [END]: END                // Success or halt
    });

// Compile the final, runnable graph
export const appGraph = workflow.compile();