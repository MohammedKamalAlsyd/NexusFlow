import { AgentState } from "@/graph/state.js";
import { ArchitectAgent } from "@/agents/roles/ArchitectAgent.js";
import { ETLCoderAgent } from "@/agents/roles/ETLCoderAgent.js";
import { IaCCoderAgent } from "@/agents/roles/IaCCoderAgent.js";
import { ValidatorAgent } from "@/agents/roles/ValidatorAgent.js";
import { ParserUtils } from "@/utils/parser.js";

// Instantiate the agents
const architect = new ArchitectAgent();
const etlCoder = new ETLCoderAgent();
const iacCoder = new IaCCoderAgent();
const validator = new ValidatorAgent();

/**
 * NODE: Architect
 * Parses the prompt and creates the high-level plan.
 */
export const architectNode = async (state: typeof AgentState.State) => {
    // Safely get the last message
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
        throw new Error("No user message found in state.");
    }

    const response = await architect.invokeRaw(lastMessage.content as string);
    const plan = ParserUtils.extractOutput(response.content, "json");

    return {
        cloudPlan: plan,
        // Fallback to the parsed plan's context or keep the state's current context
        currentCloudContext: plan?.context || state.currentCloudContext
    };
};

/**
 * NODE: ETL Coder
 * Generates specific script files based on the cloudPlan.
 */
export const etlCoderNode = async (state: typeof AgentState.State) => {
    const context = state.validationErrors
        ? `Fix these previous errors: ${state.validationErrors}. Current Plan: ${JSON.stringify(state.cloudPlan)}`
        : `Generate ETL code for: ${JSON.stringify(state.cloudPlan)}`;

    const response = await etlCoder.invokeRaw(context);
    const artifacts = ParserUtils.extractOutput(response.content, "json");

    return { artifacts: artifacts };
};

/**
 * NODE: IaC Coder
 * Generates Pulumi code that must be compatible with the existing artifacts.
 */
export const iacCoderNode = async (state: typeof AgentState.State) => {
    const prompt = `Generate Pulumi infrastructure code for: ${JSON.stringify(state.cloudPlan)}. 
    Ensure resources match the ETL scripts defined in these artifacts: ${JSON.stringify(Object.keys(state.artifacts))}.
    ${state.validationErrors ? `Correct these issues: ${state.validationErrors}` : ""}`;

    const response = await iacCoder.invokeRaw(prompt);
    const iacArtifacts = ParserUtils.extractOutput(response.content, "json");

    return { artifacts: iacArtifacts }; // Merges with existing via State Reducer
};

/**
 * NODE: Validator
 * Audits the artifacts for security, syntax, and logic.
 */
export const validatorNode = async (state: typeof AgentState.State) => {
    const prompt = `Audit the following generated artifacts for infrastructure validity and security: 
    ${JSON.stringify(state.artifacts)}. 
    Return a JSON object: { "isValid": boolean, "errors": string | null }`;

    const response = await validator.invokeRaw(prompt);
    const result = ParserUtils.extractOutput(response.content, "json");

    return {
        validationErrors: result.isValid ? null : result.errors
    };
};

/**
 * NODE: Deployer
 * (Placeholder for Now)
 */
export const deployerNode = async (state: typeof AgentState.State) => {
    // This node would use the execute_command tool or a custom Pulumi Tool
    console.log("🚀 Executing deployment...");

    // In a real scenario, catch errors here and return to validationErrors
    return { deploymentStatus: "SUCCESS" };
};