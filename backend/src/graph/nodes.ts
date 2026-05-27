import { AgentState } from "@/graph/state.js";
import { ArchitectAgent } from "@/agents/roles/ArchitectAgent.js";
import { PipelineCoderAgent } from "@/agents/roles/PipelineCoderAgent.js";
import { ValidatorAgent } from "@/agents/roles/ValidatorAgent.js";
import { CloudExplorerAgent } from "@/agents/roles/CloudExplorerAgent.js";
import { DataOpsAgent } from "@/agents/roles/DataOpsAgent.js";
import { PulumiService } from "@/services/PulumiService.js";
import { AIMessage } from "@langchain/core/messages";
import { safetyManager } from "@/safety/safetyContext.js";
import fs from "node:fs/promises";
import path from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import z from "zod";

// Instantiate all agents
const explorer = new CloudExplorerAgent();
const architect = new ArchitectAgent();
const pipelineCoder = new PipelineCoderAgent();
const validator = new ValidatorAgent();
const dataOps = new DataOpsAgent();


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
    
    Based on this, decide the executionStrategy and create a detailed Markdown plan.`;

    // 1. Define the exact shape we want using Zod
    const architectSchema = z.object({
        strategy: z.enum(["GREENFIELD", "BROWNFIELD_ETL", "DATA_ANALYSIS"]).describe("The execution path to take."),
        plan: z.string().describe("A detailed step-by-step architectural plan written in Markdown. Do NOT include actual code.")
    });

    // 2. Bind the schema directly to the LLM via Native API Tool Calling
    const structuredLlm = architect.model.withStructuredOutput(architectSchema, { name: "ArchitectPlan" });

    try {
        // 3. Invoke. LangChain handles all the JSON escaping behind the scenes!
        const result = await structuredLlm.invoke([
            { role: "system", content: architect.systemPrompt },
            { role: "user", content: prompt }
        ], config);

        return {
            currentStep: "planning",
            executionStrategy: result.strategy,
            cloudPlan: result.plan, // This is now a clean Markdown string!
        };
    } catch (error: any) {
        console.error("⚠️ [ARCHITECT]: Structured Output Failed.", error.message);
        // Fallback to end the graph cleanly if the API completely fails
        return {
            currentStep: "planning-failed",
            deploymentStatus: "FATAL_ERROR",
            validationErrors: "Architect failed to generate a valid plan."
        };
    }
};

/**
 * NODE 3: Pipeline Coder
 * Generates BOTH data transformation scripts AND Pulumi infrastructure code.
 */
export const pipelineCoderNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("👨‍💻 [PIPELINE CODER]: Using tools to write ETL & IaC code...");

    // 1. Establish Secure Workspace Path if it doesn't exist
    let currentWorkspace = state.workspacePath;
    if (!currentWorkspace) {
        const context = safetyManager.getContext();
        currentWorkspace = path.resolve(context.workspaceRoot, `nexusflow-run-${Date.now()}`);
        await fs.mkdir(currentWorkspace, { recursive: true });
    }

    const prompt = `Workspace Path: ${currentWorkspace}
    Cloud Plan: ${state.cloudPlan}
    Strategy: '${state.executionStrategy}'
    Existing Resources: ${JSON.stringify(state.environmentContext)}
    
    ${state.validationErrors ? `
    ATTENTION: The previous deployment OR validation failed with these errors:
    -----
    ${state.validationErrors}
    -----
    Use your file system tools to read the affected files and edit them to fix the errors. You can use 'search_web' if you need to look up documentation.` : "Use your tools to create all necessary files for this pipeline."}`;

    try {
        const runner = pipelineCoder.getRunnable();
        const response = await runner.invoke({ messages: [{ role: "user", content: prompt }] }, config);

        // Save the AI's tool execution messages to memory so it remembers what it did
        return {
            currentStep: "pipeline-coding",
            workspacePath: currentWorkspace,
            validationErrors: null,
            messages: response.messages // Appends tool calls and results to LangGraph memory
        };
    } catch (error: any) {
        console.warn(`⚠️ [PIPELINE-CODER]: Agent execution failed. Triggering self-healing.`);
        return {
            currentStep: "pipeline-coding-failed",
            validationErrors: `Agent failed with error: ${error.message}`
        };
    }
};

/**
 * NODE 4: Validator
 * Audits all generated artifacts.
 */
export const validatorNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("🛡️  [VALIDATOR]: Auditing generated code for security and logic...");

    // Read all files from the workspace directory
    let codeContext = "";
    try {
        // Simple recursive read for the validator
        async function readDir(dir: string, prefix = "") {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relPath = path.join(prefix, entry.name);
                if (entry.isDirectory()) {
                    await readDir(fullPath, relPath);
                } else if (entry.isFile() && !relPath.includes("node_modules")) {
                    const content = await fs.readFile(fullPath, "utf-8");
                    codeContext += `\n\n### File: ${relPath}\n\`\`\`\n${content}\n\`\`\`\n`;
                }
            }
        }
        await readDir(state.workspacePath);
    } catch (error) {
        return { currentStep: "validating", validationErrors: "Validator failed to read workspace files.", retryCount: 1 };
    }

    const prompt = `Audit these files deployed in the workspace: ${codeContext}. 
    Ensure the plan (${JSON.stringify(state.cloudPlan)}) and strategy (${state.executionStrategy}) are met.`;

    const validatorSchema = z.object({
        isValid: z.boolean(),
        errors: z.string().nullable().describe("If invalid, detail the issues and which file needs editing.")
    });

    const modelWithStructure = validator.model.withStructuredOutput(validatorSchema, { name: "ValidationResult" });
    const result = await modelWithStructure.invoke([
        { role: "system", content: validator.systemPrompt },
        { role: "user", content: prompt }
    ], config);

    return {
        currentStep: "validating",
        validationErrors: result.isValid ? null : result.errors,
        retryCount: result.isValid ? 0 : 1
    };
};

/**
 * NODE 5: Deployer (The "Muscle")
 * Executes the validated plan using Pulumi.
 */
export const deployerNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log(`\n📦 [DEPLOYER]: Running Pulumi in ${state.workspacePath}...`);
    const deployer = new PulumiService(state.workspacePath);

    try {
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