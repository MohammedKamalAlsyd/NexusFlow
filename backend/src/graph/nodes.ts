import { AgentState } from "@/graph/state.js";
import { ArchitectAgent } from "@/agents/roles/ArchitectAgent.js";
import { PipelineCoderAgent } from "@/agents/roles/PipelineCoderAgent.js";
import { DataOpsAgent } from "@/agents/roles/DataOpsAgent.js";
import { DiagramGeneratorAgent } from "@/agents/roles/DiagramGeneratorAgent.js";
import { PulumiService } from "@/services/PulumiService.js";
import { configManager } from "@/config/index.js";
import fs from "node:fs/promises";
import path from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage } from "@langchain/core/messages";
import { systemLog } from "@/safety/interactivity.js";

// Instantiate the core agents
const architect = new ArchitectAgent();
const pipelineCoder = new PipelineCoderAgent();
const dataOps = new DataOpsAgent();
const diagramGenerator = new DiagramGeneratorAgent();

/**
 * NODE 1: Architect (Exploration & Planning)
 * Uses MCP tools to explore the cloud, then outputs a structured JSON plan.
 * Implements a retry loop to self-correct JSON formatting hallucinations.
 */
export const architectNode = async (state: typeof AgentState.State, config?: RunnableConfig) => {
    console.log("🧠 [ARCHITECT]: Exploring cloud environment and planning...");
    systemLog("🧠 [ARCHITECT]: Exploring active cloud directories and evaluating current state...");

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

            // =========================================================================
            // Clean up the JSON bloat so the UI looks pretty
            // =========================================================================
            // Extract any conversational text the LLM said *before* it dumped the JSON
            let cleanConversationalText = rawOutput.replace(jsonMatch[0], "").trim();
            if (!cleanConversationalText) {
                cleanConversationalText = "I have successfully analyzed your request and formulated a cloud architecture plan.";
            }

            // Replace the ugly raw JSON payload with a clean Markdown summary for the UI
            const formattedUIOutput = `${cleanConversationalText}\n\n✅ **Strategy Selected:** \`${result.strategy}\`\n⚙️ **Status:** Architecture map generated successfully. Proceeding to next phase...`;

            const cleanFinalMessage = new AIMessage({
                content: formattedUIOutput
            });

            const history = response.messages || [];
            const toolMessages = history.filter((msg: any) => msg.role === "tool" || msg.name !== undefined);
            const aiContext = toolMessages.map((m: any) => `[Discovery Tool Output]: ${m.content}`).join("\n");

            systemLog("✅ Cloud Discovery Complete. Generating UI Architecture Diagram...");

            console.log("🎨 [ARCHITECT]: Drafting UI Architecture Diagram...");
            const uiDiagram = await diagramGenerator.generateReactFlowJSON(result.plan);

            return {
                currentStep: "planning",
                executionStrategy: result.strategy,
                cloudPlan: result.plan,
                environmentContext: { discovered: aiContext || "No infrastructure discovered." },
                diagram: uiDiagram,
                messages: [cleanFinalMessage]
            };
        } catch (error: any) {
            console.warn(`⚠️ [ARCHITECT]: JSON Parse Error on attempt ${attempt}/${maxRetries}. Error: ${error.message}`);
            systemLog(`⚠️ [ARCHITECT]: JSON parsing error on attempt ${attempt}/${maxRetries}. Retrying self-correction...`);

            if (attempt >= maxRetries) {
                systemLog("❌ [ARCHITECT]: Failed to generate a valid architecture format after maximum retries.");
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
                content: `Your previous output caused a JSON parsing error: "${error.message}". Please fix the formatting and output ONLY the valid JSON object.`
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

    if (state.validationErrors) {
        systemLog("👨‍💻 [PIPELINE CODER]: Deployment failure detected. Running diagnosis and template patching...");
    } else {
        systemLog(`👨‍💻 [PIPELINE CODER]: Initiating code generation for execution strategy: ${state.executionStrategy}...`);
    }

    let currentWorkspace = state.workspacePath;
    if (!currentWorkspace) {
        const workspaceRoot = configManager.config.safety.workspaceRoot;
        currentWorkspace = path.resolve(workspaceRoot, `nexusflow-run-${Date.now()}`);
        await fs.mkdir(currentWorkspace, { recursive: true });

        console.log("📦 Auto-scaffolding minimal Python Pulumi configuration...");
        systemLog(`📦 Scaffolded new deployment workspace: ${path.basename(currentWorkspace)}`);

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

        systemLog("✅ [PIPELINE CODER]: Python Pulumi configurations and PySpark templates generated successfully.");
        return {
            currentStep: "pipeline-coding",
            workspacePath: currentWorkspace,
            validationErrors: null,
            messages: response.messages
        };
    } catch (error: any) {
        systemLog(`❌ [PIPELINE CODER]: Code execution logic failed: ${error.message}`);
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
    systemLog("📦 [DEPLOYER]: Running native Pulumi compilation and execution...");

    const wsPath = state.workspacePath;
    if (!wsPath || wsPath.trim() === '') {
        systemLog("❌ [DEPLOYER]: Execution aborted. Target workspace path is empty.");
        return {
            currentStep: "deploying-failed",
            deploymentStatus: "FAILED",
            validationErrors: "Workspace path is empty – cannot deploy.",
            workspacePath: wsPath,
        };
    }

    const deployer = new PulumiService(wsPath);

    try {
        const result = await deployer.deploy();

        // If Pulumi catches a syntax error, missing file, or cloud rejection:
        if (!result.success) {
            console.warn("⚠️ [DEPLOYER]: Pulumi failed! Sending compiler errors back to Coder.");
            systemLog("⚠️ [DEPLOYER]: Pulumi execution failed. Extracting stderr log stack and routing back to Coder Node...");
            return {
                currentStep: "deploying-failed",
                deploymentStatus: "FAILED",
                validationErrors: `Pulumi Deployment Failed. Fix these errors: \n${result.logs}`,
                retryCount: 1
            };
        }

        systemLog("✅ [DEPLOYER]: Pulumi stack deployed successfully. Active resources are live.");
        return {
            currentStep: "deployment-success",
            deploymentStatus: "SUCCESS",
            validationErrors: null,
            infraMetadata: { deploymentLogs: result.logs }
        };

    } catch (error: any) {
        console.error("❌ [DEPLOYER]: Fatal engine execution error:", error.message);
        systemLog(`❌ [DEPLOYER]: System execution exception encountered: ${error.message}`);
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
        systemLog("📊 [DATA OPS]: Direct data analysis strategy selected. Invoking query engines via MCP...");
        currentStepName = "data-analysis-complete";
        prompt = `Execute this analysis plan: ${state.cloudPlan} against the environment: ${JSON.stringify(state.environmentContext)}`;
    } else {
        console.log("▶️ [DATA OPS]: Infrastructure deployed. Triggering and monitoring ETL Job...");
        systemLog("▶️ [DATA OPS]: Infrastructure deployed. Locating target cloud task and starting execution...");
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

    try {
        const runner = dataOps.getRunnable();
        const response = await runner.invoke({ messages: [{ role: "user", content: prompt }] }, config);

        systemLog("✅ [DATA OPS]: Query executions completed. Constructing final summary and closing session...");
        return {
            currentStep: currentStepName,
            messages: response.messages,
            deploymentStatus: "SUCCESS" // End graph cleanly
        };
    } catch (error: any) {
        systemLog(`❌ [DATA OPS]: Operational execution task failed: ${error.message}`);
        return {
            currentStep: "dataops-failed",
            validationErrors: `DataOps agent execution failed: ${error.message}`,
            deploymentStatus: "FAILED"
        };
    }
};