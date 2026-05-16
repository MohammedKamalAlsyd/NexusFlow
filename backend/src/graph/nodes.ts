import { AgentState } from "@/graph/state.js";
import { ArchitectAgent } from "@/agents/roles/ArchitectAgent.js";
import { ETLCoderAgent } from "@/agents/roles/ETLCoderAgent.js";
import { IaCCoderAgent } from "@/agents/roles/IaCCoderAgent.js";
import { ValidatorAgent } from "@/agents/roles/ValidatorAgent.js";
import { CloudExplorerAgent } from "@/agents/roles/CloudExplorerAgent.js";
import { DataOpsAgent } from "@/agents/roles/DataOpsAgent.js";
import { PulumiService } from "@/services/PulumiService.js";
import { ParserUtils } from "@/utils/parser.js";
import { AIMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import z from "zod";

// Instantiate all agents
const explorer = new CloudExplorerAgent();
const architect = new ArchitectAgent();
const etlCoder = new ETLCoderAgent();
const iacCoder = new IaCCoderAgent();
const validator = new ValidatorAgent();
const dataOps = new DataOpsAgent();


// --- Helper function to make nodes more robust ---
async function runAgentNode(agent: any, prompt: string, stepName: string, state: typeof AgentState.State, config?: RunnableConfig) {
    try {
        const response = await agent.invokeRaw(prompt, config);

        // 1. Check if the agent decided the error is an unfixable environment/system error
        if (response.content.includes("<abort>")) {
            const match = response.content.match(/<abort>([\s\S]*?)<\/abort>/);
            const reason = match ? match[1].trim() : "Agent aborted due to fatal environment error.";
            throw new Error(`AGENT_ABORT: ${reason}`);
        }

        // 2. Parse artifacts
        const artifacts = ParserUtils.extractArtifacts(response.content);
        return {
            currentStep: stepName,
            artifacts: artifacts,
            validationErrors: null
        };
    } catch (error: any) {
        const errorMessage = error.message || "An unknown error occurred.";

        // Handle Agent intentional aborts cleanly
        if (errorMessage.startsWith("AGENT_ABORT:")) {
            console.error(`\n🛑 [${stepName.toUpperCase()}]: ${errorMessage}`);
            return {
                currentStep: `${stepName}-aborted`,
                deploymentStatus: "FATAL_ERROR", // We use this to tell workflow.ts to stop completely
                validationErrors: errorMessage
            };
        }

        // Standard parsing/generation error -> trigger self-healing
        console.warn(`⚠️ [${stepName.toUpperCase()}]: Agent execution or parsing failed. Triggering self-healing.`);
        return {
            currentStep: `${stepName}-failed`,
            validationErrors: `Agent ${agent.name} failed with error: ${errorMessage}. Please fix your output.`
        };
    }
}


/**
 * NODE 1: Cloud Explorer (Reconnaissance)
 * Scans the cloud environment based on the user's request.
 */
export const explorerNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("🔍 [EXPLORER]: Scanning existing cloud environment...");
    const lastMessage = state.messages[state.messages.length - 1]?.content as string;

    const runner = explorer.getRunnable(); // Gets agent with cloud discovery tools
    const response = await runner.invoke({ messages: [{ role: "user", content: lastMessage }] }, config);
    const lastAiMessage = response.messages[response.messages.length - 1];

    // The explorer agent uses tools to populate the context
    return {
        currentStep: "reconnaissance",
        environmentContext: { discovered: lastAiMessage?.content || "No data discovered" }
    };
};

/**
 * NODE 2: Architect
 * Creates a plan based on user request AND discovered environment context.
 */
export const architectNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("🧠 [ARCHITECT]: Planning based on environment context...");
    const prompt = `User Request: ${JSON.stringify(state.messages)}
    Discovered Environment: ${JSON.stringify(state.environmentContext)}
    Based on this, decide the executionStrategy ('GREENFIELD', 'BROWNFIELD_ETL', 'DATA_ANALYSIS')
    and create a detailed 'plan'. Output a single JSON object with 'strategy' and 'plan' keys.`;

    const response = await architect.invokeRaw(prompt, config);
    const planData = ParserUtils.extractOutput(response.content, "json");

    return {
        currentStep: "planning",
        executionStrategy: planData.strategy,
        cloudPlan: planData.plan,
    };
};

/**
 * NODE 3: ETL Coder
 * Generates data transformation scripts.
 */
export const etlCoderNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("👨‍💻 [ETL CODER]: Writing data transformation logic...");
    const prompt = state.validationErrors
        ? `Fix these previous errors: ${state.validationErrors}. Remember to properly escape JSON strings!`
        : `Generate ETL scripts for this plan: ${JSON.stringify(state.cloudPlan)}. 
           Use existing resources: ${JSON.stringify(state.environmentContext)}.`;

    return await runAgentNode(etlCoder, prompt, "etl-coding", state, config);
};

/**
 * NODE 4: IaC Coder
 * Generates Pulumi infrastructure code.
 */
export const iacCoderNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("🏗️  [IaC CODER]: Generating Pulumi infrastructure code...");
    const prompt = `Generate Pulumi code for this plan: ${JSON.stringify(state.cloudPlan)}.
    Strategy: '${state.executionStrategy}'.
    Reference these artifacts: ${JSON.stringify(Object.keys(state.artifacts))}.
    
    ${state.validationErrors ? `
    ATTENTION: The previous deployment failed with these console errors:
    -----
    ${state.validationErrors}
    -----
    If this is a code syntax error or Pulumi logical error, fix the code and output the <artifact> tags. 
    If this is a SYSTEM, AUTH, or ENVIRONMENT error (e.g. missing API keys, Pulumi access tokens, missing permissions) that you CANNOT fix by changing the code, output ONLY: <abort>Explanation of the unfixable system error</abort>` : ""}`;

    return await runAgentNode(iacCoder, prompt, "iac-coding", state, config);
};

/**
 * NODE 5: Validator
 * Audits all generated artifacts.
 */
export const validatorNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("🛡️  [VALIDATOR]: Auditing generated code for security and logic...");
    // Format artifacts beautifully to save tokens and improve LLM comprehension
    let codeContext = "";
    for (const [filename, artifact] of Object.entries(state.artifacts)) {
        codeContext += `\n\n### File: ${filename}\n\`\`\`\n${artifact.body}\n\`\`\`\n`;
    }
    const prompt = `Audit these artifacts: ${codeContext}. 

    Ensure the plan (${JSON.stringify(state.cloudPlan)}) and strategy (${state.executionStrategy}) are met.
    Return a JSON object: { "isValid": boolean, "errors": string | null }`;

    const validatorSchema = z.object({
        isValid: z.boolean(),
        errors: z.string().nullable().describe("If invalid, detail the issues here. If valid, return null.")
    });
    // Bind the schema to the LLM
    const modelWithStructure = validator.model.withStructuredOutput(validatorSchema, { name: "ValidationResult" });

    const result = await modelWithStructure.invoke([
        { role: "system", content: validator.systemPrompt },
        { role: "user", content: prompt }
    ], config);

    return {
        currentStep: "validating",
        validationErrors: result.isValid ? null : result.errors,
        retryCount: result.isValid ? 0 : 1 // Add to retry count on failure
    };
};

/**
 * NODE 6: Deployer (The "Muscle")
 * Executes the validated plan using Pulumi.
 */
export const deployerNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("\n📦 [DEPLOYER]: Preparing Pulumi workspace...");
    const deployer = new PulumiService(`nexusflow-run-${Date.now()}`); // Unique workspace per run

    try {
        await deployer.prepareWorkspace(state.artifacts);
        const result = await deployer.deploy();

        if (!result.success) {
            return {
                currentStep: "deploying-failed",
                deploymentStatus: "FAILED",
                validationErrors: `Pulumi Deployment Failed. Fix these IaC/Cloud errors: \n${result.logs}`,
                retryCount: 1
            };
        }

        return {
            currentStep: "deployment-success",
            deploymentStatus: "SUCCESS",
            validationErrors: null,
            infraMetadata: { deploymentLogs: result.logs }
        };

    } catch (error: any) {
        return {
            currentStep: "deploying-failed",
            deploymentStatus: "FAILED",
            validationErrors: `System Execution Error: ${error.message}`,
            retryCount: 1
        };
    }
};

/**
 * BRANCH NODE: DataOps
 * For 'DATA_ANALYSIS' strategy. Runs queries instead of deploying.
 */
export const dataOpsNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("📊 [DATA OPS]: Running analysis queries...");
    const prompt = `Execute this analysis plan: ${JSON.stringify(state.cloudPlan)} against the environment: ${JSON.stringify(state.environmentContext)}`;
    // This agent would use MCP tools for DB queries
    const response = await dataOps.invokeRaw(prompt, config);

    return {
        currentStep: "data-analysis-complete",
        messages: state.messages.concat([new AIMessage(response.content)]),
    };
};