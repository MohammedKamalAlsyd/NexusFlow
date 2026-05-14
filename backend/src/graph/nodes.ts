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

// Instantiate all agents
const explorer = new CloudExplorerAgent();
const architect = new ArchitectAgent();
const etlCoder = new ETLCoderAgent();
const iacCoder = new IaCCoderAgent();
const validator = new ValidatorAgent();
const dataOps = new DataOpsAgent();

/**
 * NODE 1: Cloud Explorer (Reconnaissance)
 * Scans the cloud environment based on the user's request.
 */
export const explorerNode = async (state: typeof AgentState.State) => {
    console.log("🔍 [EXPLORER]: Scanning existing cloud environment...");
    const lastMessage = state.messages[state.messages.length - 1]?.content as string;

    const runner = explorer.getRunnable(); // Gets agent with cloud discovery tools
    const response = await runner.invoke({ messages: [{ role: "user", content: lastMessage }] });
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
export const architectNode = async (state: typeof AgentState.State) => {
    console.log("🧠 [ARCHITECT]: Planning based on environment context...");
    const prompt = `User Request: ${JSON.stringify(state.messages)}
    Discovered Environment: ${JSON.stringify(state.environmentContext)}
    Based on this, decide the executionStrategy ('GREENFIELD', 'BROWNFIELD_ETL', 'DATA_ANALYSIS')
    and create a detailed 'plan'. Output a single JSON object with 'strategy' and 'plan' keys.`;

    const response = await architect.invokeRaw(prompt);
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
export const etlCoderNode = async (state: typeof AgentState.State) => {
    console.log("👨‍💻 [ETL CODER]: Writing data transformation logic...");
    const context = state.validationErrors
        ? `Fix these previous errors: ${state.validationErrors}. Remember to properly escape JSON strings!`
        : `Generate ETL scripts for this plan: ${JSON.stringify(state.cloudPlan)}. 
           Use existing resources: ${JSON.stringify(state.environmentContext)}.`;

    const response = await etlCoder.invokeRaw(context);

    try {
        const artifacts = ParserUtils.extractOutput(response.content, "json");
        return {
            currentStep: "etl-coding",
            artifacts: artifacts
        };
    } catch (error: any) {
        console.warn(`⚠️ [ETL CODER]: JSON Formatting failed. Sending to self-healing loop.`);
        return {
            currentStep: "etl-coding",
            // We inject the parse error so the agent knows exactly what it did wrong on the next loop
            validationErrors: `JSON Parsing Failed: ${error.message}. You MUST properly escape all double quotes (\") and newlines (\\n) inside your code strings.`
        };
    }
};

/**
 * NODE 4: IaC Coder
 * Generates Pulumi infrastructure code.
 */
export const iacCoderNode = async (state: typeof AgentState.State) => {
    console.log("🏗️  [IaC CODER]: Generating Pulumi infrastructure code...");
    const prompt = `Generate Pulumi code for this plan: ${JSON.stringify(state.cloudPlan)}.
    Strategy: '${state.executionStrategy}'.
    Reference these artifacts: ${JSON.stringify(Object.keys(state.artifacts))}.
    ${state.validationErrors ? `Correct these issues: ${state.validationErrors}` : ""}`;

    const response = await iacCoder.invokeRaw(prompt);

    try {
        const iacArtifacts = ParserUtils.extractOutput(response.content, "json");
        return {
            currentStep: "iac-coding",
            artifacts: iacArtifacts // Merges with ETL artifacts via reducer
        };
    } catch (error: any) {
        console.warn(`⚠️ [IaC CODER]: JSON Formatting failed. Sending to self-healing loop.`);
        return {
            currentStep: "iac-coding",
            validationErrors: `JSON Parsing Failed: ${error.message}. Ensure your Pulumi Python script is properly escaped inside the JSON string.`
        };
    }
};

/**
 * NODE 5: Validator
 * Audits all generated artifacts.
 */
export const validatorNode = async (state: typeof AgentState.State) => {
    console.log("🛡️  [VALIDATOR]: Auditing generated code for security and logic...");
    const prompt = `Audit these artifacts: ${JSON.stringify(state.artifacts)}. 
    Ensure the plan (${JSON.stringify(state.cloudPlan)}) and strategy (${state.executionStrategy}) are met.
    Return a JSON object: { "isValid": boolean, "errors": string | null }`;

    const response = await validator.invokeRaw(prompt);
    const result = ParserUtils.extractOutput(response.content, "json");

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
export const deployerNode = async (state: typeof AgentState.State) => {
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
export const dataOpsNode = async (state: typeof AgentState.State) => {
    console.log("📊 [DATA OPS]: Running analysis queries...");
    const prompt = `Execute this analysis plan: ${JSON.stringify(state.cloudPlan)} against the environment: ${JSON.stringify(state.environmentContext)}`;
    // This agent would use MCP tools for DB queries
    const response = await dataOps.invokeRaw(prompt);

    return {
        currentStep: "data-analysis-complete",
        messages: state.messages.concat([new AIMessage(response.content)]),
    };
};