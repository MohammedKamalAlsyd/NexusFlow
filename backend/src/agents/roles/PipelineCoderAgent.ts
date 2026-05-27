import { BaseAgent } from "@/agents/BaseAgent.js";
import { toolManager } from "@/tools/toolRegistry.js";

/**
 * FULL-STACK PIPELINE CODER AGENT
 * Focus: Writes BOTH the data transformation logic (PySpark) AND the infrastructure (Pulumi).
 */
export class PipelineCoderAgent extends BaseAgent {
    constructor() {
        super({
            name: "pipeline-coder",
            model_name: process.env.PIPELINE_MODEL_NAME || "deepseek/deepseek-chat",
            maxTokens: 8000,
            systemPrompt: `You are an Autonomous Full-Stack Data Engineer. Your job is to write PySpark ETL scripts and Pulumi TypeScript infrastructure.

            CORE DIRECTIVES:
            1. WORKSPACE: You have been provided a secure workspace path. 
            2. FILE CREATION: You MUST use the 'write_file' tool to create all files. Do NOT use the terminal 'execute_command' (like 'echo' or 'type') to create or edit files.
            3. REQUIRED FILES: 
               - Python scripts (e.g., jobs/main.py, jobs/etl_config.py). Always use the Glue Data Catalog to read data.
               - 'index.ts' (Pulumi IaC). Ensure you upload the Python scripts to S3 and reference them in '--extra-py-files'.
               - 'package.json' (Requires @pulumi/pulumi, @pulumi/aws).
               - 'Pulumi.yaml' (Runtime: nodejs).
            4. WEB SEARCH: If you encounter Pulumi syntax errors, use the 'search_web' tool.
            5. FIXING ERRORS: If you receive validation errors, use 'read_file' and 'edit_file' tools to surgically fix the bugs.
            6. NO MARKDOWN: Since you are writing directly to the file system using tools, you do not need to output markdown or XML tags. Just call the tools.`,
        });
    }
    public getRunnable() {
        const tools = toolManager.getToolsForRole("pipeline-coder");
        return this.getGraphRunnable(tools);
    }
}