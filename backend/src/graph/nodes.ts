import { AgentState } from "@/graph/state.js";
import { ArchitectAgent } from "@/agents/roles/ArchitectAgent.js";
import { PipelineCoderAgent } from "@/agents/roles/PipelineCoderAgent.js";
import { DataOpsAgent } from "@/agents/roles/DataOpsAgent.js";
import { PulumiService } from "@/services/PulumiService.js";
import { safetyManager } from "@/safety/safetyContext.js";
import fs from "node:fs/promises";
import path from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import z from "zod";

// Instantiate the core agents
const architect = new ArchitectAgent();
const pipelineCoder = new PipelineCoderAgent();
const dataOps = new DataOpsAgent();

/**
 * NODE 1: Architect (Exploration & Planning)
 * Uses MCP tools to explore the cloud, then outputs a structured JSON plan.
 */
export const architectNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("🧠 [ARCHITECT]: Exploring cloud environment and planning...");
    const userRequest = state.messages[state.messages.length - 1]?.content;

    // 1. Let the Architect use its tools to explore the environment first
    const runner = architect.getRunnable();
    const explorePrompt = `User Request: ${userRequest}\n\nBefore planning, use your MCP tools to discover existing infrastructure.`;
    const exploreResponse = await runner.invoke({ messages: [{ role: "user", content: explorePrompt }] }, config);

    // Extract the AI's summary of what it found
    const aiContext = exploreResponse.messages[exploreResponse.messages.length - 1]?.content || "No existing infrastructure found.";

    // 2. Define the Prompt
    const planPrompt = `User Request: ${userRequest}
            Discovered Environment: ${aiContext}

            Based on this, decide the executionStrategy. You MUST output ONLY a valid JSON object matching this exact schema:
            {
            "strategy": "GREENFIELD" | "BROWNFIELD_ETL" | "DATA_ANALYSIS",
            "plan": "Detailed Markdown plan. DO NOT use markdown code blocks inside this string!"
            }
            Do not include any extra text outside the JSON object.`;

    try {
        const response = await architect.model.invoke([
            { role: "system", content: architect.systemPrompt },
            { role: "user", content: planPrompt }
        ], config);

        let rawOutput = String(response.content).trim();

        // Remove <think> blocks if present
        rawOutput = rawOutput.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        // Remove markdown ```json ``` wrappers if the LLM hallucinates them
        rawOutput = rawOutput.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

        const result = JSON.parse(rawOutput);

        return {
            currentStep: "planning",
            executionStrategy: result.strategy,
            cloudPlan: result.plan,
            environmentContext: { discovered: aiContext }
        };
    } catch (error: any) {
        console.error("⚠️ [ARCHITECT]: Output Parsing Failed. Ensure the model returned valid JSON.", error.message);
        return {
            currentStep: "planning-failed",
            deploymentStatus: "FATAL_ERROR",
            validationErrors: "Architect failed to generate a valid structured plan."
        };
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
        const context = safetyManager.getContext();
        currentWorkspace = path.resolve(context.workspaceRoot, `nexusflow-run-${Date.now()}`);
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
 * NODE 3: Deployer (The New Validator + Executor)
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
    console.log("📊 [DATA OPS]: Running analysis queries via MCP...");

    const prompt = `Execute this analysis plan: ${state.cloudPlan} against the environment: ${JSON.stringify(state.environmentContext)}`;

    const runner = dataOps.getRunnable();
    const response = await runner.invoke({ messages: [{ role: "user", content: prompt }] }, config);

    return {
        currentStep: "data-analysis-complete",
        messages: response.messages,
        deploymentStatus: "SUCCESS" // End graph cleanly
    };
};