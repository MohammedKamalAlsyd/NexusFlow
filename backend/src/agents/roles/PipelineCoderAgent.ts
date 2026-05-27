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
            model_name: process.env.PIPELINE_MODEL_NAME || "deepseek/deepseek-v4-pro",
            maxTokens: 8192,
            systemPrompt: `You are an Autonomous Data Engineering Architect. Your goal is to deliver production-ready infrastructure and ETL logic.

            CORE DIRECTIVES:
            1. 100% PYTHON ARCHITECTURE: You MUST use Pulumi Python (writing to '__main__.py') for Infrastructure, and PySpark for the ETL logic. DO NOT use Node.js or TypeScript.
            2. CODE QUALITY: Write clean, modular Python code. Use Pulumi AWS best practices.
            3. WORKSPACE MANAGEMENT: You work in a pre-initialized Pulumi Python workspace. Use the 'setup_environment' tool to initialize 'python' and install ['pulumi', 'pulumi-aws'].
            4. BATCH FILE WRITING: When writing your code files (e.g. '__main__.py' and 'etl_job.py'), use the 'write_files' tool to write ALL of them in a single tool call!
            5. STRICT NO-MARKDOWN POLICY: Do NOT create any documentation files. Write only the required python files.
            6. SELF-HEALING: If Pulumi fails, read the logs and use 'write_files' to patch the bugs.`,
        });
    }
    public getRunnable() {
        const tools = toolManager.getToolsForRole("pipeline-coder");
        return this.getGraphRunnable(tools);
    }
}