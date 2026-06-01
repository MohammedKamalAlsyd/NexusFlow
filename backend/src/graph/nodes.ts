import { AgentState } from "@/graph/state.js";
import { ArchitectAgent } from "@/agents/roles/ArchitectAgent.js";
import { PipelineCoderAgent } from "@/agents/roles/PipelineCoderAgent.js";
import { DataOpsAgent } from "@/agents/roles/DataOpsAgent.js";
import { PulumiService } from "@/services/PulumiService.js";
import { configManager } from "@/config/index.js";
import fs from "node:fs/promises";
import path from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";

// Instantiate the core agents
const architect = new ArchitectAgent();
const pipelineCoder = new PipelineCoderAgent();
const dataOps = new DataOpsAgent();

/**
 * NODE 1: Architect (Exploration & Planning)
 * Uses MCP tools to explore the cloud, then outputs a structured JSON plan.
 * Implements a retry loop to self-correct JSON formatting hallucinations.
 */
export const architectNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("🧠 [ARCHITECT]: Exploring cloud environment and planning...");
    
    // Extract the user's original request
    const userRequest = state.messages[0]?.content || state.messages[state.messages.length - 1]?.content;

    const runner = architect.getRunnable();
    
    const prompt = `User Request: ${userRequest}
    
    Execute your Operating Procedure now. 
    1. Explore the environment using your tools.
    2. Output your final JSON plan.`;

    // Retrieve retry limit from environment variable (default to 3)
    const maxRetries = process.env.FORMAT_RETRY ? parseInt(process.env.FORMAT_RETRY, 10) : 3;
    let attempt = 0;
    
    // Maintain conversation history so if the JSON fails, we can append the error and ask it to fix it
    let currentMessages: any[] = [{ role: "user", content: prompt }];

    while (attempt < maxRetries) {
        attempt++;
        try {
            // Run the agent's full inner tool-execution graph
            const response = await runner.invoke({ messages: currentMessages }, config);

            // Extract the final message from the agent
            const finalMessage = response.messages[response.messages.length - 1];
            let rawOutput = String(finalMessage?.content).trim();

            // Robust JSON Parsing: Remove <think> blocks and markdown wrappers
            rawOutput = rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            rawOutput = rawOutput.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

            // Extract JSON using regex in case there is trailing conversational text
            const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error("No JSON object found in the output.");
            }

            // This is where "Bad control character" errors get thrown
            const result = JSON.parse(jsonMatch[0]);

            // ─── IF SUCCESSFUL ───────────────────────────────────────
            // Capture what tools were run to pass to the next agent (Coder) as context
            const history = response.messages || [];
            const toolMessages = history.filter((msg: any) => msg.role === "tool" || msg.name !== undefined);
            const aiContext = toolMessages.map((m: any) => `[Discovery Tool Output]: ${m.content}`).join("\n");

            return {
                currentStep: "planning",
                executionStrategy: result.strategy,
                cloudPlan: result.plan,
                environmentContext: { discovered: aiContext || "No infrastructure discovered." },
                messages: [finalMessage] // Update state with the final plan
            };

        } catch (error: any) {
            console.warn(`⚠️ [ARCHITECT]: JSON Parse Error on attempt ${attempt}/${maxRetries}. Error: ${error.message}`);
            
            if (attempt >= maxRetries) {
                return {
                    currentStep: "planning-failed",
                    deploymentStatus: "FATAL_ERROR",
                    validationErrors: `Architect failed to generate a valid structured JSON plan after ${maxRetries} attempts: ${error.message}`
                };
            }

            // ─── SELF-CORRECTION LOOP ───────────────────────────────
            // Append the error to the message history and invoke again.
            // By passing the history, the agent skips running the tools again and immediately fixes its JSON string.
            currentMessages.push({ 
                role: "user", 
                content: `Your previous output caused a JSON parsing error: "${error.message}". 
                This usually means you forgot to escape quotes or newlines (e.g., use \\n instead of actual newlines) inside your JSON string values. 
                Please fix the formatting and output ONLY the valid JSON object.` 
            });
        }
    }
};


/**
 * NODE 2: Pipeline Coder
 * Scaffolds the workspace and uses tools to write ETL/Pulumi scripts.
 */
export const pipelineCoderNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("👨‍💻 [PIPELINE CODER]: Designing environment and writing pure Python code...");

    let currentWorkspace = state.workspacePath;
    if (!currentWorkspace) {
        const workspaceRoot = configManager.config.safety.workspaceRoot;
        currentWorkspace = path.resolve(workspaceRoot, `nexusflow-run-${Date.now()}`);
        await fs.mkdir(currentWorkspace, { recursive: true });

        console.log("📦 Auto-scaffolding minimal Python Pulumi configuration...");

        // 1. Scaffold Pulumi Python settings (NO tsconfig or package.json!)
        const pulumiYaml = `name: nexusflow-deployment\nruntime:\n  name: python\n  options:\n    virtualenv: .venv\ndescription: NexusFlow Auto-Generated IaC in Python\n`;
        await fs.writeFile(path.join(currentWorkspace, "Pulumi.yaml"), pulumiYaml);
    }

    const prompt = `Workspace Path: ${currentWorkspace}
    Cloud Plan: ${state.cloudPlan}
    Strategy: '${state.executionStrategy}'
    
    ${state.validationErrors ? `
    ⚠️ PULUMI DEPLOYMENT FAILED:
    ${state.validationErrors}
    Use your tools to diagnose and patch the python files.` :
            `You are working in a new directory. 
    
    INSTRUCTIONS:
    1. Initialize the environment using 'setup_environment' with type: 'python' and packages: ['pulumi', 'pulumi-aws'].
    2. Write your Pulumi infrastructure code inside '__main__.py'.
    3. Write your PySpark ETL script (e.g., 'etl_job.py').
    4. Do not output markdown files. Execute your steps and finish.`}`;

    try {
        const runner = pipelineCoder.getRunnable();
        const response = await runner.invoke({ messages: [{ role: "user", content: prompt }] }, config);

        return {
            currentStep: "pipeline-coding",
            workspacePath: currentWorkspace,
            validationErrors: null,
            messages: response.messages
        };
    } catch (error: any) {
        return {
            currentStep: "pipeline-coding-failed",
            validationErrors: `Agent logic failed: ${error.message}`,
            workspacePath: currentWorkspace
        };
    }
};

/**
 * NODE 3: Deployer (The Validator + Executor)
 * Runs 'pulumi up'. If it fails, compiler logs act as validation errors.
 */
export const deployerNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log(`\n📦 [DEPLOYER]: Running Pulumi in ${state.workspacePath}...`);
    const deployer = new PulumiService(state.workspacePath);

    const wsPath = state.workspacePath;
    if (!wsPath || wsPath.trim() === '') {
        return {
            currentStep: "deploying-failed",
            deploymentStatus: "FAILED",
            validationErrors: "Workspace path is empty – cannot deploy.",
            workspacePath: wsPath,
        };
    }

    try {
        const result = await deployer.deploy();

        // If Pulumi catches a syntax error, missing file, or cloud rejection:
        if (!result.success) {
            console.warn("⚠️ [DEPLOYER]: Pulumi failed! Sending compiler errors back to Coder.");
            return {
                currentStep: "deploying-failed",
                deploymentStatus: "FAILED",
                validationErrors: `Pulumi Deployment Failed. Fix these errors: \n${result.logs}`,
                retryCount: 1 // State reducer will append +1
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
 * For 'DATA_ANALYSIS' strategy. Runs diagnostic queries via MCP instead of deploying code.
 */
export const dataOpsNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {

    let prompt = "";
    let currentStepName = "";

    // Determine context: Are we just analyzing data, or executing a deployed pipeline?
    if (state.executionStrategy === "DATA_ANALYSIS") {
        console.log("📊 [DATA OPS]: Running analysis queries via MCP...");
        currentStepName = "data-analysis-complete";
        prompt = `Execute this analysis plan: ${state.cloudPlan} against the environment: ${JSON.stringify(state.environmentContext)}`;
    } else {
        console.log("▶️ [DATA OPS]: Infrastructure deployed. Triggering and monitoring ETL Job...");
        currentStepName = "job-execution-complete";
        const originalRequest = state.messages[0]?.content || "Process Data";
        prompt = `The infrastructure and ETL scripts have been successfully deployed via Pulumi.
        Your task is to:
        1. Identify the newly deployed job (e.g., AWS Glue, Azure Data Factory) related to this request: "${originalRequest}".
        2. Use your MCP tools to TRIGGER / START the job execution.
        3. Poll and monitor the job status until it succeeds.
        4. Verify that the output data was written correctly to the destination (e.g., check if the parquet files exist).
        
        Report the final execution status back to the user.`;
    }

    const runner = dataOps.getRunnable();
    const response = await runner.invoke({ messages: [{ role: "user", content: prompt }] }, config);

    return {
        currentStep: currentStepName,
        messages: response.messages,
        deploymentStatus: "SUCCESS" // End graph cleanly
    };
};