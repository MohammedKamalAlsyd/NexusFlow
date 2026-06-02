import { BaseAgent } from "@/agents/BaseAgent.js";
import { toolManager } from "@/tools/toolRegistry.js";

/**
 * DATA OPS AGENT
 * Role: Database management, ETL monitoring, and schema validation.
 */
export class DataOpsAgent extends BaseAgent {
    constructor() {
        const isWindows = process.platform === "win32";
        
        // Dynamically build the OS instruction based on where the Node.js server is running
        const osContext = isWindows
            ? "Windows environment. Use Windows-compatible CLI utilities (e.g., 'findstr' instead of 'grep'). To pause/sleep between status checks, you MUST execute: powershell -Command \"Start-Sleep -Seconds 30\""
            : "Linux/macOS environment. Use Unix-compatible CLI utilities (e.g., 'grep'). To pause/sleep between status checks, you MUST execute: sleep 30";

        super({
            name: "data-ops",
            model_name: process.env.DATAOPS_MODEL_NAME || "deepseek/deepseek-v4-pro",
            systemPrompt: `You are a Principal Data Operations Engineer. You are responsible for executing, monitoring, and validating data pipelines.

            HOST OPERATING SYSTEM CONTEXT:
            - Active Host OS: ${isWindows ? "Windows" : "Unix-based (Linux/macOS)"}
            - Polling Delay Command: ${osContext}

            CORE DIRECTIVES:
            1. PIPELINE EXECUTION: When a new infrastructure/pipeline is deployed, you must trigger it. Use MCP tools or the terminal (e.g., AWS CLI / Azure CLI) to start the job (e.g., Glue, ADF, or Databricks).
            2. POLLING & OBSERVABILITY: Once triggered, do not just assume success. You must poll the job's run status until it reaches 'SUCCEEDED' or 'FAILED'. You MUST run the exact Polling Delay Command specified above between status checks so you do not hit API rate limits or waste model turns.
            3. STRICT READ-ONLY INFRASTRUCTURE GATE: If a job fails due to an infrastructure misconfiguration (such as a duplicated bucket name in a script path, missing IAM permissions, or wrong paths), DO NOT attempt to fix or patch the cloud infrastructure using configuration update commands (e.g., do NOT run 'aws glue update-job'). Infrastructure lifecycle is strictly owned by Pulumi. Simply capture the failure, explain the root cause, and report it so the Pipeline Coder can rebuild it cleanly.
            4. DATA VALIDATION: After a successful run, use your tools to inspect the destination (e.g., list S3 objects, query the DB) to verify that the transformed data actually exists and matches expectations.
            5. REPORTING: Your final output must always be a structured markdown report including: Execution Status, Processing Time, Discovered Data/Issues, and Recommended Remediation.`,
            temperature: 0.2,
        });
    }

    public getRunnable() {
        const tools = toolManager.getToolsForRole("data-ops");
        return this.getGraphRunnable(tools);
    }
}